// One way for features to read public web APIs: native HTTP on Android (no CORS problems), fetch in a browser, a localStorage cache
// so screens work offline and we never hammer free services (most allow only a few requests per hour per device).
import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface Fetched<T> { data: T | null; fetchedAt: number | null; fromCache: boolean; error: 'offline' | 'http' | 'parse' | null }
interface Entry { t: number; v: unknown }
const PREFIX = 'periapsis.net.'
const lastTry = new Map<string, number>() // per cache key, this session

function read(key: string): Entry | null {
  try { const e = JSON.parse(globalThis.localStorage?.getItem(PREFIX + key) ?? 'null'); return e && typeof e.t === 'number' ? e : null } catch { return null }
}
function write(key: string, v: unknown, now: number) {
  try { globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify({ t: now, v })) } catch { /* quota: keep working without cache */ }
}

async function raw(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, headers, responseType: 'json' })
    return { status: r.status, body: r.data }
  }
  const r = await fetch(url, { headers })
  const text = await r.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* not JSON: caller's parse decides */ }
  return { status: r.status, body }
}

/** GET a JSON API with caching.
 *  maxAgeMs: serve the cache without a request while younger than this. minRetryMs: after a failed request, wait this long before trying again.
 *  parse: validate/shape the body (throw on unexpected data) — the result is what gets cached. force: ignore maxAge (still obeys minRetryMs). */
export async function getCached<T>(key: string, url: string, opts: { maxAgeMs: number; minRetryMs?: number; parse: (body: unknown) => T; headers?: Record<string, string>; force?: boolean; now?: number }): Promise<Fetched<T>> {
  const now = opts.now ?? Date.now()
  const cached = read(key)
  const fromCache = (error: Fetched<T>['error']): Fetched<T> => ({ data: (cached?.v as T) ?? null, fetchedAt: cached?.t ?? null, fromCache: true, error })
  if (cached && !opts.force && now - cached.t < opts.maxAgeMs) return fromCache(null)
  const tried = lastTry.get(key)
  if (tried !== undefined && now - tried < (opts.minRetryMs ?? 10 * 60_000) && cached) return fromCache(null)
  lastTry.set(key, now)
  let res: { status: number; body: unknown }
  try { res = await raw(url, opts.headers ?? { Accept: 'application/json' }) } catch { return fromCache('offline') }
  if (res.status < 200 || res.status >= 300) return fromCache('http')
  let v: T
  try { v = opts.parse(res.body) } catch { return fromCache('parse') }
  write(key, v, now)
  return { data: v, fetchedAt: now, fromCache: false, error: null }
}

/** For tests: forget the in-memory retry timestamps. */
export function _resetNet() { lastTry.clear() }
