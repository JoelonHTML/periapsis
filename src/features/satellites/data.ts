// CelesTrak GP data: fetch (CapacitorHttp on Android, fetch in a browser), per-group localStorage cache, no polling.
// CelesTrak asks clients not to download more than needed: data is refreshed at most when older than 12 h, only when the user
// opens a group (never on a timer), and a failed attempt is not retried for 2 h unless the user explicitly presses refresh (min. 10 min apart).
import { parseGpJson, type SatRecord } from './tle.ts'

export const GROUPS = ['stations', 'visual', 'gps-ops', 'weather', 'starlink'] as const
export type GroupId = (typeof GROUPS)[number] | 'custom'
export const MAX_AGE_MS = 12 * 3600e3
const FAIL_BACKOFF_MS = 2 * 3600e3, MANUAL_MIN_MS = 10 * 60e3
/** Starlink is ~8 000 objects; we keep only the first 400 (alphabetical) so the cache fits in localStorage. */
export const GROUP_LIMIT: Partial<Record<GroupId, number>> = { starlink: 400 }

export interface GroupData { fetchedAt: number; sats: SatRecord[] }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const ck = (g: string) => `periapsis.sat.gp.${g}.v1`
const tk = (g: string) => `periapsis.sat.try.${g}.v1`

export const cacheStale = (fetchedAt: number, now: number) => now - fetchedAt > MAX_AGE_MS

export function readCache(st: KV, g: string): GroupData | null {
  try {
    const d = JSON.parse(st.getItem(ck(g)) ?? 'null')
    if (d && Number.isFinite(d.fetchedAt) && Array.isArray(d.sats)) return d as GroupData
  } catch { /* ignore */ }
  return null
}
export function writeCache(st: KV, g: string, d: GroupData) {
  try { st.setItem(ck(g), JSON.stringify(d)) } catch { /* quota: keep working without cache */ }
}

export const groupUrl = (g: string) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(g)}&FORMAT=json`

async function fetchJson(url: string): Promise<unknown> {
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' }, responseType: 'json', connectTimeout: 20000, readTimeout: 60000 })
    if (r.status !== 200) throw new Error(`http-${r.status}`)
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data
  }
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`http-${r.status}`)
  return r.json()
}

export type LoadStatus = 'fresh' | 'cached' | 'stale-offline' | 'error' | 'throttled'
export interface LoadResult { data: GroupData | null; status: LoadStatus }

/** Cache first; downloads only when there is no cache / it is older than 12 h (or `force`), and the device is online. */
export async function loadGroup(g: GroupId, opts: { force?: boolean } = {}, st: KV = localStorage, now = Date.now()): Promise<LoadResult> {
  const cached = readCache(st, g)
  if (g === 'custom') return { data: cached, status: 'cached' }
  const needs = !cached || cacheStale(cached.fetchedAt, now) || !!opts.force
  if (!needs) return { data: cached, status: 'cached' }
  const lastTry = Number(st.getItem(tk(g)) ?? 0)
  const wait = opts.force ? MANUAL_MIN_MS : FAIL_BACKOFF_MS
  if (now - lastTry < wait) return { data: cached, status: cached ? 'throttled' : 'error' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { data: cached, status: cached ? 'stale-offline' : 'error' }
  try { st.setItem(tk(g), String(now)) } catch { /* ignore */ }
  try {
    let sats = parseGpJson(await fetchJson(groupUrl(g)))
    const lim = GROUP_LIMIT[g]
    if (lim) sats = sats.slice(0, lim)
    if (!sats.length) throw new Error('empty')
    const data = { fetchedAt: now, sats }
    writeCache(st, g, data)
    return { data, status: 'fresh' }
  } catch {
    return { data: cached, status: cached ? 'stale-offline' : 'error' }
  }
}
