// JPL Small-Body Database API (sbdb.api) — parsing and orbital maths for comets and asteroids.
// The response schema (object{}, orbit{epoch, elements:[{name,value,units,...}]}, phys_par:[{name,value,units}]) is written from the
// documented API and has NOT been verified against a live response from this sandbox. All numbers may arrive as strings.
// Elements are heliocentric ecliptic J2000 (a in au, angles in degrees, tp/epoch as Julian date TDB, per in days).
import { AU, DEG, MU_SUN, ellipsePoints, elementsToState, type Vec } from '../../lib/astro.ts'

export const sbdbUrl = (sstr: string) => `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(sstr)}&phys-par=true`

export interface Small {
  name: string; kind: string; cls: string
  epochJd: number | null
  a: number; e: number; i: number; om: number; w: number // au, –, deg
  tp: number // JD of perihelion passage
  per: number // days
  q: number; ad: number // au
  diameter: number | null; albedo: number | null; H: number | null; rotPer: number | null // km, –, mag, h
}

const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === '') return null
  const v = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(v) ? v : null
}

/** Turn the `elements` array (name/value pairs) — or a plain object — into a name → number map. */
export function elementMap(els: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (Array.isArray(els)) {
    for (const el of els) {
      if (!el || typeof el !== 'object') continue
      const { name, value } = el as { name?: unknown; value?: unknown }
      const v = num(value)
      if (typeof name === 'string' && v !== null) out[name] = v
    }
  } else if (els && typeof els === 'object') {
    for (const [k, val] of Object.entries(els)) { const v = num(val); if (v !== null) out[k] = v }
  }
  return out
}

/** Orbital period in days from the semi-major axis in au (two-body, Sun only). */
export const periodFromA = (aAu: number) => (2 * Math.PI * Math.sqrt((aAu * AU) ** 3 / MU_SUN)) / 86400

/** Parse one sbdb.api response. Throws for ambiguous (list) responses, errors and open (e ≥ 1) orbits. */
export function parseSbdb(body: unknown): Small {
  const b = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') throw new Error('SBDB: not an object')
  const obj = (b.object ?? null) as Record<string, unknown> | null
  const orbit = (b.orbit ?? null) as Record<string, unknown> | null
  if (!obj || !orbit) throw new Error('SBDB: no object/orbit (ambiguous or unknown designation)')
  const el = elementMap(orbit.elements)
  const epochJd = num(orbit.epoch)
  const { e, i, om, w } = el
  let { a } = el
  if (e === undefined || i === undefined || om === undefined || w === undefined) throw new Error('SBDB: missing elements')
  if (a === undefined && el.q !== undefined && e < 1) a = el.q / (1 - e)
  if (a === undefined || !(a > 0) || !(e >= 0 && e < 1)) throw new Error('SBDB: not a closed orbit')
  const per = el.per ?? (el.n ? 360 / el.n : periodFromA(a))
  let tp = el.tp
  if (tp === undefined && el.ma !== undefined && epochJd !== null) tp = epochJd - (el.ma / 360) * per
  if (tp === undefined) throw new Error('SBDB: no perihelion time')
  const phys: Record<string, number> = {}
  if (Array.isArray(b.phys_par)) {
    for (const p of b.phys_par) {
      const { name, value } = (p ?? {}) as { name?: unknown; value?: unknown }
      const v = num(value)
      if (typeof name === 'string' && v !== null) phys[name] = v
    }
  }
  const oc = (obj.orbit_class ?? {}) as Record<string, unknown>
  const name = String(obj.fullname ?? obj.shortname ?? obj.des ?? '').replace(/\s+/g, ' ').trim()
  return {
    name, kind: String(obj.kind ?? ''), cls: String(oc.name ?? oc.code ?? ''), epochJd,
    a, e, i, om, w, tp, per, q: el.q ?? a * (1 - e), ad: el.ad ?? a * (1 + e),
    diameter: phys.diameter ?? null, albedo: phys.albedo ?? null, H: phys.H ?? null, rotPer: phys.rot_per ?? null,
  }
}

export const isComet = (s: Pick<Small, 'kind'>) => s.kind.startsWith('c')

export const jdOfT = (t: number) => 2451545 + t / 86400 // t = seconds since J2000, as the app clock
export const msOfJd = (jd: number) => (jd - 2440587.5) * 86400000

/** Heliocentric ecliptic J2000 state (km, km/s) at app time t (s since J2000). Mean motion from the SBDB period. */
export function smallState(s: Small, t: number) {
  const M = (2 * Math.PI * (jdOfT(t) - s.tp)) / s.per
  return elementsToState(s.a * AU, s.e, s.i * DEG, s.om * DEG, s.w * DEG, M, MU_SUN)
}

/** Closed ellipse in km (heliocentric ecliptic). Spaced evenly in eccentric anomaly. */
export const smallOrbit = (s: Small, n = 360): Vec[] => ellipsePoints(s.a * AU, s.e, s.i * DEG, s.om * DEG, s.w * DEG, n)

/** First perihelion at or after `jd`, as Julian date (assumes a constant period). */
export function nextPerihelionJd(s: Pick<Small, 'tp' | 'per'>, jd: number) {
  return s.tp + Math.ceil((jd - s.tp) / s.per) * s.per
}

// The curated list. 1 Ceres is left out on purpose: the app already draws it. `sstr` is what we pass to the API.
export interface Listed { id: string; sstr: string; label: string; comet: boolean; color: string }
export const SMALL_LIST: Listed[] = [
  { id: '1P', sstr: '1P', label: '1P/Halley', comet: true, color: '#7dd3fc' },
  { id: '2P', sstr: '2P', label: '2P/Encke', comet: true, color: '#67e8f9' },
  { id: '67P', sstr: '67P', label: '67P/Churyumov–Gerasimenko', comet: true, color: '#a5f3fc' },
  { id: '46P', sstr: '46P', label: '46P/Wirtanen', comet: true, color: '#5eead4' },
  { id: '12P', sstr: '12P', label: '12P/Pons–Brooks', comet: true, color: '#93c5fd' },
  { id: '13P', sstr: '13P', label: '13P/Olbers', comet: true, color: '#c4b5fd' },
  { id: '109P', sstr: '109P', label: '109P/Swift–Tuttle', comet: true, color: '#d8b4fe' },
  { id: '4', sstr: '4', label: '4 Vesta', comet: false, color: '#fcd34d' },
  { id: '2', sstr: '2', label: '2 Pallas', comet: false, color: '#fdba74' },
  { id: '10', sstr: '10', label: '10 Hygiea', comet: false, color: '#fda4af' },
  { id: '16', sstr: '16', label: '16 Psyche', comet: false, color: '#f0abfc' },
  { id: '433', sstr: '433', label: '433 Eros', comet: false, color: '#bef264' },
  { id: '101955', sstr: '101955', label: '101955 Bennu', comet: false, color: '#86efac' },
  { id: '162173', sstr: '162173', label: '162173 Ryugu', comet: false, color: '#6ee7b7' },
  { id: '99942', sstr: '99942', label: '99942 Apophis', comet: false, color: '#fb923c' },
  { id: '25143', sstr: '25143', label: '25143 Itokawa', comet: false, color: '#fde68a' },
  { id: '3200', sstr: '3200', label: '3200 Phaethon', comet: false, color: '#f87171' },
]
