// Downloads and caches tiles: at most `concurrency` requests in flight, nearest-first queue, LRU cache that spares what is on screen,
// failure cool-down and fail-over to the next source when one never answers (offline, blocked, wrong URL). Failures are silent.
// Generic over the texture type so it is testable without a GPU.
import { Lru, tileKey, type TileId, type TileSource } from './tiles.ts'

type Pending = { state: 'loading' | 'failed'; retryAt: number }
export type StoreOpts = { max: number; concurrency?: number; now?: () => number; retryMs?: number }

export class TileStore<T> {
  private ready: Lru<T>
  private pending = new Map<string, Pending>()
  private queue: { id: TileId; k: string }[] = []
  private inflight = 0
  private stat: { ok: number; fails: number }[]
  private keep: ReadonlySet<string> = new Set()
  private sources: TileSource[]
  private load: (url: string) => Promise<T>
  private concurrency: number
  private now: () => number
  private retryMs: number
  /** Bumped whenever a tile became ready or was evicted, so the caller knows to rebuild what it draws. */
  version = 0

  constructor(sources: TileSource[], load: (url: string) => Promise<T>, dispose: (v: T) => void, o: StoreOpts) {
    this.sources = sources; this.load = load
    this.concurrency = o.concurrency ?? 6; this.now = o.now ?? Date.now; this.retryMs = o.retryMs ?? 20000
    this.stat = sources.map(() => ({ ok: 0, fails: 0 }))
    this.ready = new Lru<T>(o.max, (_, v) => { dispose(v); this.version++ })
  }

  private activeIdx() { return this.stat.findIndex((s) => !(s.ok === 0 && s.fails >= 5)) } // dead = 5 errors in a row, never a success
  /** The first source that has not proven dead (null: offline / all blocked). */
  get active(): TileSource | null { const i = this.activeIdx(); return i < 0 ? null : this.sources[i] }
  get(z: number, x: number, y: number): T | undefined { return this.ready.peek(tileKey(z, x, y)) }
  get size() { return this.ready.size }

  /** The caller's wanted tiles (most important first) and the keys that must stay cached; starts downloads as slots free up. */
  request(wanted: TileId[], keep: ReadonlySet<string>) {
    this.keep = keep
    this.queue = []
    const src = this.active
    if (!src) return
    const t = this.now()
    for (const id of wanted) {
      if (id.z > src.maxZ) continue
      const k = tileKey(id.z, id.x, id.y)
      if (this.ready.has(k)) { this.ready.get(k); continue }
      const p = this.pending.get(k)
      if (p && (p.state === 'loading' || p.retryAt > t)) continue
      this.queue.push({ id, k })
    }
    this.pump()
    this.ready.trim(keep)
  }

  private pump() {
    const idx = this.activeIdx()
    if (idx < 0) return
    while (this.inflight < this.concurrency && this.queue.length) {
      const { id, k } = this.queue.shift()!
      const e: Pending = { state: 'loading', retryAt: 0 }
      this.pending.set(k, e)
      this.inflight++
      this.load(this.sources[idx].url(id.z, id.x, id.y)).then(
        (v) => {
          this.inflight--
          this.pending.delete(k)
          this.stat[idx].ok++; this.stat[idx].fails = 0
          this.ready.set(k, v); this.version++
          this.ready.trim(this.keep)
          this.pump()
        },
        () => {
          this.inflight--
          this.stat[idx].fails++
          e.state = 'failed'; e.retryAt = this.now() + this.retryMs
          if (this.activeIdx() !== idx) for (const [kk, p] of this.pending) if (p.state === 'failed') this.pending.delete(kk) // new source: retry at once
          this.pump()
        },
      )
    }
  }

  clear() { this.ready.clear(); this.pending.clear(); this.queue = [] }
}
