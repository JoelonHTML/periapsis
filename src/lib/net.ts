// One way for features to read public web APIs: native HTTP on Android (no CORS problems), fetch in a browser, a localStorage cache
// so screens work offline and we never hammer free services (most allow only a few requests per hour per device).
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { desktop } from './desktop.ts'

export interface Fetched<T> {
  data: T | null; fetchedAt: number | null; fromCache: boolean; error: 'offline' | 'http' | 'parse' | null
  /** Technical reason for `error` ("HTTP 429", "net::ERR_NAME_NOT_RESOLVED", what the server sent instead of JSON …), for the diagnostics line in the UI. */
  detail?: string
}
interface Entry { t: number; v: unknown }
const PREFIX = 'periapsis.net.'
const lastTry = new Map<string, number>() // per cache key + url, this session (so a fallback URL isn't throttled by its primary)

function read(key: string): Entry | null {
  try { const e = JSON.parse(globalThis.localStorage?.getItem(PREFIX + key) ?? 'null'); return e && typeof e.t === 'number' ? e : null } catch { return null }
}
function write(key: string, v: unknown, now: number) {
  try { globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify({ t: now, v })) } catch { /* quota: keep working without cache */ }
}

async function raw(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const d = desktop()
  if (d) { // Windows app: the main process fetches (no CORS rules there)
    const r = await d.fetch(url, headers)
    if (r.status === 0) throw new Error(r.error || 'offline')
    let body: unknown = r.body
    try { body = JSON.parse(r.body) } catch { /* not JSON */ }
    return { status: r.status, body }
  }
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
  const fromCache = (error: Fetched<T>['error'], detail?: string): Fetched<T> => ({ data: (cached?.v as T) ?? null, fetchedAt: cached?.t ?? null, fromCache: true, error, detail })
  if (cached && !opts.force && now - cached.t < opts.maxAgeMs) return fromCache(null)
  const tk = key + ' ' + url, tried = lastTry.get(tk)
  if (tried !== undefined && now - tried < (opts.minRetryMs ?? 10 * 60_000) && cached) return fromCache(null)
  lastTry.set(tk, now)
  let res: { status: number; body: unknown }
  try { res = await raw(url, opts.headers ?? { Accept: 'application/json' }) } catch (e) { return fromCache('offline', String((e as Error)?.message ?? e).slice(0, 160)) }
  if (res.status < 200 || res.status >= 300) return fromCache('http', `HTTP ${res.status}${snippet(res.body) ? ' · ' + snippet(res.body) : ''}`)
  let v: T
  try { v = opts.parse(res.body) } catch (e) { return fromCache('parse', `${String((e as Error)?.message ?? e).slice(0, 80)} · ${snippet(res.body)}`) }
  write(key, v, now)
  return { data: v, fetchedAt: now, fromCache: false, error: null }
}

/** getCached over a list of mirrors: the first URL is the primary, the rest are tried in order when it fails for any reason (an unreachable
 *  host looks like 'offline' too, so it is no reason to skip them). All share one cache key. If every one fails, the primary's diagnostics stay. */
export async function getCachedChain<T>(key: string, urls: string[], opts: Parameters<typeof getCached<T>>[2]): Promise<Fetched<T>> {
  let r = await getCached(key, urls[0], opts)
  for (const u of urls.slice(1)) { if (!r.error) break; const a = await getCached(key, u, opts); if (!a.error) r = a }
  return r
}

/** First characters of whatever the server sent, flattened, for the diagnostics line. */
function snippet(body: unknown): string {
  const s = typeof body === 'string' ? body : (() => { try { return JSON.stringify(body) } catch { return '' } })()
  return (s ?? '').replace(/\s+/g, ' ').slice(0, 90)
}

/** For tests: forget the in-memory retry timestamps. */
export function _resetNet() { lastTry.clear() }
