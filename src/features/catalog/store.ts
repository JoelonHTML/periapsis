// Shared state of the catalogue tab (panel and 3D layer): exoplanet table, small-body elements, which bodies are drawn.
// Every request goes through getCached; small bodies are fetched one at a time with a pause, only when the user asks.
import { getCached, type Fetched } from '@/lib/net'
import { createStore } from '@/lib/mini-store'
import { EXO_URL, parseTap, type Exo } from './exo.ts'
import { SMALL_LIST, parseSbdb, sbdbUrl, type Small } from './sbdb.ts'

const DAY_MS = 86400_000
export const EXO_KEY = 'cat.exo.v1'
export const smallKey = (id: string) => `cat.sbdb.${id}.v1`

export type LoadState = 'idle' | 'loading' | 'ok' | 'error'
export interface SmallEntry { state: LoadState; data: Small | null; fetchedAt: number | null; error: Fetched<Small>['error']; fromCache: boolean }
const EMPTY: SmallEntry = { state: 'idle', data: null, fetchedAt: null, error: null, fromCache: false }

export const cat = createStore({
  exo: null as Exo[] | null,
  exoState: 'idle' as LoadState,
  exoError: null as Fetched<Exo[]>['error'],
  exoAt: null as number | null,
  /** true when the table could not be written to localStorage (too big): it then lives in memory for this session only. */
  exoMemoryOnly: false,
  small: {} as Record<string, SmallEntry>,
  shown: [] as string[],
})
export const smallEntry = (s: { small: Record<string, SmallEntry> }, id: string) => s.small[id] ?? EMPTY

export async function loadExo(force = false) {
  if (cat.get().exoState === 'loading') return
  cat.set({ exoState: 'loading' })
  const r = await getCached<Exo[]>(EXO_KEY, EXO_URL, { maxAgeMs: 7 * DAY_MS, minRetryMs: 5 * 60_000, parse: parseTap, force })
  let stored = false
  try { stored = globalThis.localStorage?.getItem('periapsis.net.' + EXO_KEY) != null } catch { /* ignore */ }
  cat.set({
    exo: r.data ?? cat.get().exo, exoState: r.data ? 'ok' : 'error', exoError: r.error, exoAt: r.fetchedAt,
    exoMemoryOnly: !!r.data && !stored,
  })
}

// ---- small bodies: one queue, 600 ms between network requests ----
const queue: string[] = []
let running = false
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pump() {
  if (running) return
  running = true
  while (queue.length) {
    const id = queue.shift()!
    const item = SMALL_LIST.find((x) => x.id === id)
    if (!item) continue
    const r = await getCached<Small>(smallKey(id), sbdbUrl(item.sstr), { maxAgeMs: 30 * DAY_MS, minRetryMs: 2 * 60_000, parse: parseSbdb })
    cat.set((s) => ({ small: { ...s.small, [id]: { state: r.data ? 'ok' : 'error', data: r.data, fetchedAt: r.fetchedAt, error: r.error, fromCache: r.fromCache } } }))
    if (!r.fromCache) await sleep(600)
  }
  running = false
}

/** Request one object (no-op when already loaded or queued). Retry after an error is allowed. */
export function loadSmall(id: string) {
  const e = smallEntry(cat.get(), id)
  if (e.state === 'ok' || e.state === 'loading') return
  cat.set((s) => ({ small: { ...s.small, [id]: { ...e, state: 'loading' } } }))
  queue.push(id)
  void pump()
}

export function toggleShown(id: string) {
  const on = cat.get().shown.includes(id)
  cat.set((s) => ({ shown: on ? s.shown.filter((x) => x !== id) : [...s.shown, id] }))
  if (!on) loadSmall(id)
}
