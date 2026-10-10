// NOAA SWPC space weather parsers + the aurora lookup. Schemas are written from NOAA's documented JSON products (see notes per parser).
import { isObj, numOf, strOf, parseUtc, tableRows } from './util.ts'

// --- Kp: products/noaa-planetary-k-index-forecast.json = [["time_tag","kp","observed","noaa_scale"], ["2026-10-03 00:00:00","2.33","observed",null], ...]
export interface KpRow { t: number; kp: number; kind: 'observed' | 'estimated' | 'predicted' }
export function parseKpForecast(body: unknown): KpRow[] {
  const rows: KpRow[] = []
  for (const r of tableRows(body)) {
    const t = parseUtc(r.time_tag), kp = numOf(r.kp ?? r.kp_index)
    if (t === null || kp === null || kp < 0 || kp > 9) continue
    const k = strOf(r.observed).toLowerCase()
    rows.push({ t, kp, kind: k === 'observed' ? 'observed' : k === 'estimated' ? 'estimated' : 'predicted' })
  }
  if (rows.length === 0) throw new Error('no Kp rows')
  return rows.sort((a, b) => a.t - b.t)
}
/** The latest non-predicted value that has started by `now`, or null. */
export function currentKp(rows: KpRow[], now: number): KpRow | null {
  let best: KpRow | null = null
  for (const r of rows) if (r.kind !== 'predicted' && r.t <= now && (!best || r.t > best.t)) best = r
  return best
}
/** Max Kp per local calendar day for slots from now on (a slot lasts 3 h). */
export function dailyMaxKp(rows: KpRow[], now: number, days = 3): { day: number; max: number }[] {
  const byDay = new Map<number, number>()
  for (const r of rows) {
    if (r.t + 3 * 3600_000 <= now) continue
    const d = new Date(r.t); d.setHours(0, 0, 0, 0)
    byDay.set(d.getTime(), Math.max(byDay.get(d.getTime()) ?? 0, r.kp))
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).slice(0, days).map(([day, max]) => ({ day, max }))
}
/** NOAA G-scale: Kp 5 = G1 … Kp 9 = G5; below 5 = 0. */
export const gScale = (kp: number) => (kp >= 5 ? Math.min(5, Math.floor(kp) - 4) : 0)

// --- OVATION: json/ovation_aurora_latest.json = {"Observation Time","Forecast Time","Data Format":"[Longitude, Latitude, Aurora]","coordinates":[[lon 0..359, lat -90..90, prob %], ...]}
/** Compact grid kept in the cache: only cells with probability >= 1 %, as a flat [lon, lat, p, lon, lat, p, ...]. */
export interface Ovation { forecast: number | null; cells: number[] }
export function parseOvation(body: unknown): Ovation {
  const list = isObj(body) ? body.coordinates : body
  if (!Array.isArray(list) || list.length === 0) throw new Error('no coordinates')
  // Column order comes from the file's own "Data Format" ("[Longitude, Latitude, Aurora]"); a lat column with values beyond 90 means it is swapped.
  const fmt = isObj(body) ? strOf(body['Data Format']).toLowerCase() : ''
  let iLat = fmt && fmt.indexOf('lat') < fmt.indexOf('lon') ? 0 : 1, iLon = 1 - iLat
  if (list.some((c) => Array.isArray(c) && Math.abs(numOf(c[iLat]) ?? 0) > 90)) [iLat, iLon] = [iLon, iLat]
  const cells: number[] = []
  let seen = 0
  for (const c of list) {
    if (!Array.isArray(c) || c.length < 3) continue
    const lon = numOf(c[iLon]), lat = numOf(c[iLat]), p = numOf(c[2])
    if (lon === null || lat === null || p === null || Math.abs(lat) > 90) continue
    seen++
    if (p >= 1) cells.push(Math.round(lon), Math.round(lat), Math.round(p))
  }
  if (seen === 0) throw new Error('no valid cells')
  const ft = isObj(body) ? parseUtc(body['Forecast Time']) : null
  return { forecast: ft, cells }
}
const wrapLon = (lon: number) => ((Math.round(lon) % 360) + 360) % 360
/** Probability (%) of the grid cell nearest to the place (1° grid; missing cells are < 1 %, so 0). */
export function auroraAt(o: Ovation, lat: number, lon: number): number {
  const la = Math.max(-90, Math.min(90, Math.round(lat))), lo = wrapLon(lon)
  for (let i = 0; i + 2 < o.cells.length; i += 3) if (o.cells[i] === lo && o.cells[i + 1] === la) return o.cells[i + 2]
  return 0
}
/** How far toward the equator the oval reaches (cells >= minP) around the observer's longitude (+-3°), in the observer's hemisphere. null = none.
 *  Starts at the strongest cell (the heart of the oval) and walks equatorward while the band is continuous (gaps up to 2°), so stray
 *  low-latitude cells can't drag the edge to the equator; nothing equatorward of 20° counts (aurora never gets that low). */
export function ovalEdge(o: Ovation, lat: number, lon: number, minP = 10): { lat: number; kmFromObserver: number } | null {
  const north = lat >= 0, lo = wrapLon(lon), best = new Map<number, number>() // |lat| -> max probability
  for (let i = 0; i + 2 < o.cells.length; i += 3) {
    const dl = Math.min((o.cells[i] - lo + 360) % 360, (lo - o.cells[i] + 360) % 360)
    const la = north ? o.cells[i + 1] : -o.cells[i + 1], p = o.cells[i + 2] // "poleward = larger" in either hemisphere
    if (dl <= 3 && p >= minP && la >= 20) best.set(la, Math.max(p, best.get(la) ?? 0))
  }
  if (!best.size) return null
  let edge = [...best].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] // strongest; ties: the more equatorward
  for (;;) { const next = [1, 2].map((d) => edge - d).find((l) => best.has(l)); if (next === undefined) break; edge = next }
  const e = north ? edge : -edge
  return { lat: e, kmFromObserver: Math.round(Math.abs(e - lat) * 111.2) }
}

// --- Solar wind: products/solar-wind/plasma-1-day.json = [["time_tag","density","speed","temperature"], ["2026-10-02 12:00:00.000","4.1","410.2","90000"], ...]
export interface Plasma { t: number; speed: number | null; density: number | null }
export function parsePlasma(body: unknown): Plasma {
  // products/solar-wind (oldest first) or json/rtsw/rtsw_wind_1m.json ({time_tag, active, proton_speed, proton_density, ...}, newest first):
  // take the newest valid row by time, preferring the spacecraft marked active.
  let best: Plasma | null = null, bestActive = false
  for (const r of tableRows(body)) {
    const speed = numOf(r.speed ?? r.proton_speed), density = numOf(r.density ?? r.proton_density), t = parseUtc(r.time_tag), act = r.active !== false
    if (t === null || speed === null) continue
    if (!best || (act && !bestActive) || (act === bestActive && t > best.t)) { best = { t, speed, density }; bestActive = act }
  }
  if (!best) throw new Error('no plasma data')
  return best
}
// products/solar-wind/mag-1-day.json = [["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"], ...]
export interface Mag { t: number; bz: number; bt: number | null }
export function parseMag(body: unknown): Mag {
  // products/solar-wind/mag-1-day.json or json/rtsw/rtsw_mag_1m.json ({time_tag, active, bt, bz_gsm, ...}): newest valid row, active first
  let best: Mag | null = null, bestActive = false
  for (const r of tableRows(body)) {
    const bz = numOf(r.bz_gsm ?? r.bz), bt = numOf(r.bt), t = parseUtc(r.time_tag), act = r.active !== false
    if (t === null || bz === null) continue
    if (!best || (act && !bestActive) || (act === bestActive && t > best.t)) { best = { t, bz, bt }; bestActive = act }
  }
  if (!best) throw new Error('no mag data')
  return best
}

// --- X-ray flares: json/goes/primary/xray-flares-latest.json = [{"time_tag","begin_time","begin_class","max_time","max_class":"C1.2","max_xrlong","end_time","end_class",...}]
export interface Flare { cls: string; maxT: number | null }
export function parseFlare(body: unknown): Flare | null {
  if (!Array.isArray(body)) throw new Error('not an array')
  let best: Flare | null = null
  for (const r of body) {
    if (!isObj(r)) continue
    const cls = strOf(r.max_class ?? r.current_class), maxT = parseUtc(r.max_time ?? r.time_tag)
    if (!/^[ABCMX]\d+(\.\d+)?$/i.test(cls)) continue
    if (!best || (maxT ?? 0) > (best.maxT ?? 0)) best = { cls: cls.toUpperCase(), maxT }
  }
  return best // an empty list is valid: no flare recorded
}
