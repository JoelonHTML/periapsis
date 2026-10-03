// NASA Exoplanet Archive (TAP, table pscomppars) — pure parsing, filtering and travel-time maths.
// The JSON schema (a list of objects keyed by lower-case column name, numbers or null) is written from the documented TAP
// behaviour and has NOT been verified against a live response from this sandbox. Parsing is defensive.

export const EXO_COLUMNS = ['pl_name', 'hostname', 'sy_dist', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'pl_orbsmax', 'pl_eqt', 'pl_insol', 'disc_year', 'discoverymethod', 'st_teff', 'ra', 'dec'] as const
export const EXO_URL = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+${EXO_COLUMNS.join(',')}+from+pscomppars&format=json`

export interface Exo {
  name: string; host: string
  distPc: number | null; radius: number | null; mass: number | null // radius, mass in Earth units
  periodD: number | null; smaAu: number | null; eqT: number | null; insol: number | null // insolation in Earth units
  year: number | null; method: string; teff: number | null; ra: number | null; dec: number | null
}

const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === '') return null
  const v = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(v) ? v : null
}
/** Round to 5 significant digits so the cached JSON stays small. */
const r5 = (v: number | null) => (v === null || v === 0 ? v : Number(v.toPrecision(5)))
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

/** Parse the TAP JSON body (string or already parsed). Rows without a name are dropped; throws when nothing usable is found. */
export function parseTap(body: unknown): Exo[] {
  const rows = typeof body === 'string' ? JSON.parse(body) : body
  if (!Array.isArray(rows)) throw new Error('TAP: not a list')
  const out: Exo[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const name = str(o.pl_name)
    if (!name) continue
    out.push({
      name, host: str(o.hostname),
      distPc: r5(num(o.sy_dist)), radius: r5(num(o.pl_rade)), mass: r5(num(o.pl_bmasse)),
      periodD: r5(num(o.pl_orbper)), smaAu: r5(num(o.pl_orbsmax)), eqT: r5(num(o.pl_eqt)), insol: r5(num(o.pl_insol)),
      year: num(o.disc_year), method: str(o.discoverymethod) || '—', teff: r5(num(o.st_teff)), ra: r5(num(o.ra)), dec: r5(num(o.dec)),
    })
  }
  if (!out.length) throw new Error('TAP: no rows')
  return out
}

export const PC_LY = 3.261563777
export const LY_KM = 9.4607304725808e12
export const C_KMS = 299792.458
export const VOYAGER_KMS = 17

// "Possibly habitable zone" criterion used by the app (transparent and simple): the planet receives 0.35–1.75 × Earth's stellar
// flux (roughly the conservative-to-optimistic habitable-zone bounds for Sun-like stars) AND is smaller than 1.8 R⊕
// (above ~1.6–1.8 R⊕ most planets are gas-rich mini-Neptunes).
export const HZ = { insolMin: 0.35, insolMax: 1.75, radiusMax: 1.8 }
export const inHabitableZone = (p: Pick<Exo, 'insol' | 'radius'>) =>
  p.insol !== null && p.radius !== null && p.insol >= HZ.insolMin && p.insol <= HZ.insolMax && p.radius < HZ.radiusMax

export type SortKey = 'name' | 'dist' | 'radius' | 'year' | 'period'
export interface Filters { q: string; method: string; maxLy: number | null; hz: boolean }
export const NO_FILTERS: Filters = { q: '', method: '', maxLy: null, hz: false }

export const distLy = (p: Pick<Exo, 'distPc'>) => (p.distPc === null ? null : p.distPc * PC_LY)

export function filterExo(all: Exo[], f: Filters): Exo[] {
  const q = f.q.trim().toLowerCase()
  return all.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.host.toLowerCase().includes(q)) return false
    if (f.method && p.method !== f.method) return false
    if (f.maxLy !== null) { const d = distLy(p); if (d === null || d > f.maxLy) return false }
    if (f.hz && !inHabitableZone(p)) return false
    return true
  })
}

/** Sort; planets with a missing value go last. Year sorts newest first, the rest ascending. */
export function sortExo(list: Exo[], key: SortKey): Exo[] {
  const val = (p: Exo): number | string | null => key === 'name' ? p.name : key === 'dist' ? p.distPc : key === 'radius' ? p.radius : key === 'year' ? p.year : p.periodD
  const asc = key !== 'year'
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    const c = typeof x === 'string' ? x.localeCompare(y as string, 'en', { numeric: true }) : x - (y as number)
    return asc ? c : -c
  })
}

export function methodCounts(all: Exo[]): [string, number][] {
  const m = new Map<string, number>()
  for (const p of all) m.set(p.method, (m.get(p.method) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/** Travel time in years over a distance in light years at a speed in km/s. Non-relativistic. */
export const travelYears = (ly: number, speedKms: number) => (ly * LY_KM) / speedKms / (365.25 * 86400)
/** At a fraction of c (coordinate time; gamma at 0.1 c is 1.005, so ship time differs by only 0.5 %). */
export const travelYearsFracC = (ly: number, fracC: number) => ly / fracC

/** log-log scatter mapping: value → 0..1 within [lo, hi]. */
export const logFrac = (v: number, lo: number, hi: number) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))
