// Extra solar-system objects (dwarf planets, asteroids, comets, centaur, Kuiper belt) on Keplerian orbits.
// Sources: orbital size/shape/orientation (a, e, i, Ω, ω) are JPL Small-Body Database osculating elements, J2000-era
// (rounded to the precision below — good for drawing, not for ephemerides). Mean anomaly is anchored to
//   peri  : a known perihelion date (Halley 1986-02-09, 67P 2021-11-02, Hale–Bopp 1997-04-01, Chiron 1996-02-14,
//           Eris ~1699, Haumea ~1850 (aphelion ~1992), Makemake ~1850, Sedna ~2076, Pluto 1989-09-05),
//   align : a known Earth encounter/opposition (Vesta opposition 2018-06-19, Eros 2012-01-31, Apophis 2029-04-13,
//           Bennu 2060-09-25): M is fitted so the object lies in the heliocentric direction of Earth on that date,
//   m0    : an indicative value (Pallas, Hygiea) — correct orbit, approximate position.
// Propagation: M = M0 + n·(t − tAnchor), n = √(μ☉/a³), Kepler equation via astro.keplerE (stable up to e ≈ 0.995).
import { AU, BODIES, DEG, MU_SUN, bodyState, elementsToState, perifocalBasis, toJ2000, type Vec } from './astro.ts'

export type ExtraKind = 'dwarf' | 'asteroid' | 'comet' | 'centaur'
export interface ExtraDef {
  id: string; name: string; kind: ExtraKind
  a: number; e: number; i: number; O: number; w: number // AU, –, deg, deg, deg
  R: number // km
  color: string
  notable: boolean // labelled at the default camera
  anchor: { peri: string } | { align: string } | { m0: number }
}

export const EXTRA: ExtraDef[] = [
  { id: 'eris', name: 'Eris', kind: 'dwarf', a: 67.67, e: 0.4415, i: 44.04, O: 35.95, w: 151.64, R: 1163, color: '#e5e7eb', notable: true, anchor: { peri: '1699-03-01' } },
  { id: 'haumea', name: 'Haumea', kind: 'dwarf', a: 43.12, e: 0.1949, i: 28.21, O: 122.17, w: 239.0, R: 816, color: '#cbd5e1', notable: true, anchor: { peri: '1850-06-01' } },
  { id: 'makemake', name: 'Makemake', kind: 'dwarf', a: 45.51, e: 0.1604, i: 28.99, O: 79.27, w: 297.2, R: 715, color: '#d6a77a', notable: true, anchor: { peri: '1850-01-01' } },
  { id: 'sedna', name: 'Sedna', kind: 'dwarf', a: 506, e: 0.8496, i: 11.93, O: 144.5, w: 311.3, R: 500, color: '#dc6b5a', notable: true, anchor: { peri: '2076-07-01' } },
  { id: 'vesta', name: 'Vesta', kind: 'asteroid', a: 2.3615, e: 0.0889, i: 7.14, O: 103.81, w: 150.73, R: 262.7, color: '#b8b0a4', notable: false, anchor: { align: '2018-06-19' } },
  { id: 'pallas', name: 'Pallas', kind: 'asteroid', a: 2.7724, e: 0.2299, i: 34.93, O: 173.0, w: 310.4, R: 256, color: '#a3aab5', notable: false, anchor: { m0: 120 } },
  { id: 'hygiea', name: 'Hygiea', kind: 'asteroid', a: 3.1415, e: 0.1146, i: 3.83, O: 283.2, w: 312.3, R: 215, color: '#9a8f86', notable: false, anchor: { m0: 200 } },
  { id: 'eros', name: 'Eros', kind: 'asteroid', a: 1.458, e: 0.2227, i: 10.829, O: 304.3, w: 178.9, R: 8.4, color: '#d0a070', notable: false, anchor: { align: '2012-01-31' } },
  { id: 'apophis', name: 'Apophis', kind: 'asteroid', a: 0.9223, e: 0.1914, i: 3.341, O: 203.9, w: 126.4, R: 0.17, color: '#f87171', notable: false, anchor: { align: '2029-04-13' } },
  { id: 'bennu', name: 'Bennu', kind: 'asteroid', a: 1.1264, e: 0.2037, i: 6.035, O: 2.06, w: 66.22, R: 0.245, color: '#94a3b8', notable: false, anchor: { align: '2060-09-25' } },
  { id: 'halley', name: 'Halley', kind: 'comet', a: 17.834, e: 0.96714, i: 162.26, O: 58.42, w: 111.33, R: 5.5, color: '#7dd3fc', notable: true, anchor: { peri: '1986-02-09' } },
  { id: '67p', name: '67P/Tsjoerjoemov–Gerasimenko', kind: 'comet', a: 3.457, e: 0.6405, i: 7.04, O: 50.14, w: 12.78, R: 2.0, color: '#7dd3fc', notable: false, anchor: { peri: '2021-11-02' } },
  { id: 'halebopp', name: 'Hale–Bopp', kind: 'comet', a: 181.0, e: 0.99495, i: 89.4, O: 282.5, w: 130.6, R: 30, color: '#7dd3fc', notable: true, anchor: { peri: '1997-04-01' } },
  { id: 'chiron', name: 'Chiron', kind: 'centaur', a: 13.71, e: 0.3787, i: 6.93, O: 209.2, w: 339.5, R: 110, color: '#c4b5fd', notable: true, anchor: { peri: '1996-02-14' } },
  // Pluto is a planet in astro.BODIES; this entry is only the fallback if that is ever removed.
  { id: 'pluto', name: 'Pluto', kind: 'dwarf', a: 39.48, e: 0.2488, i: 17.16, O: 110.3, w: 113.8, R: 1188.3, color: '#c9b79c', notable: true, anchor: { peri: '1989-09-05' } },
].filter((d) => d.id !== 'pluto' || !('pluto' in BODIES)) as ExtraDef[]

export interface ExtraElements { a: number; e: number; i: number; O: number; w: number; n: number; M0: number; tAnchor: number }

/** M (rad) such that the object lies in the heliocentric direction of Earth at tAlign. */
function alignM(a: number, e: number, i: number, O: number, w: number, tAlign: number) {
  const eu = bodyState('earth', tAlign).r
  const un = (v: Vec) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
  const ue = un(eu)
  let best = 0, bestD = -2
  for (let k = 0; k < 3600; k++) {
    const M = (k / 3600) * 2 * Math.PI
    const u = un(elementsToState(a, e, i, O, w, M, MU_SUN).r)
    const d = u[0] * ue[0] + u[1] * ue[1] + u[2] * ue[2]
    if (d > bestD) { bestD = d; best = M }
  }
  return best
}

const cache = new Map<string, ExtraElements>()
export function extraElements(d: ExtraDef): ExtraElements {
  const hit = cache.get(d.id)
  if (hit) return hit
  const a = d.a * AU, i = d.i * DEG, O = d.O * DEG, w = d.w * DEG, n = Math.sqrt(MU_SUN / (a * a * a))
  let M0 = 0, tAnchor = 0
  if ('peri' in d.anchor) { tAnchor = toJ2000(Date.parse(d.anchor.peri)); M0 = 0 }
  else if ('align' in d.anchor) { tAnchor = toJ2000(Date.parse(d.anchor.align)); M0 = alignM(a, d.e, i, O, w, tAnchor) }
  else M0 = d.anchor.m0 * DEG
  const el = { a, e: d.e, i, O, w, n, M0, tAnchor }
  cache.set(d.id, el)
  return el
}
/** Heliocentric ecliptic J2000 state (km, km/s) at t. */
export function extraState(d: ExtraDef, t: number) {
  const el = extraElements(d)
  return elementsToState(el.a, el.e, el.i, el.O, el.w, el.M0 + el.n * (t - el.tAnchor), MU_SUN)
}
export const extraPeriod = (d: ExtraDef) => (2 * Math.PI) / extraElements(d).n

/** Orbit polyline (km), sampled uniformly in true anomaly so near-parabolic comets keep a smooth perihelion. */
export function extraOrbit(d: ExtraDef, n = 480): Vec[] {
  const el = extraElements(d), { P, Q } = perifocalBasis(el.i, el.O, el.w)
  const p = el.a * (1 - el.e * el.e)
  const lim = Math.PI * 0.9995
  return Array.from({ length: n + 1 }, (_, k) => {
    const nu = -lim + (2 * lim * k) / n, r = p / (1 + el.e * Math.cos(nu))
    return [P[0] * r * Math.cos(nu) + Q[0] * r * Math.sin(nu), P[1] * r * Math.cos(nu) + Q[1] * r * Math.sin(nu), P[2] * r * Math.cos(nu) + Q[2] * r * Math.sin(nu)] as Vec
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Kuiper belt: cold classical + hot classical + 3:2 (plutino) and 2:1 resonant clumps + a few scattered-disc objects.
// Row: [a AU, e, i rad, Ω rad, ω rad, M0 rad at J2000]. (Resonant libration angles are not modelled: clumps are in a, not in phase.)
// ---------------------------------------------------------------------------------------------------------------------
export function kuiperRows(count = 2000, seed = 20240611): number[][] {
  let s = seed >>> 0
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const tau = 2 * Math.PI
  const rows: number[][] = []
  for (let k = 0; k < count; k++) {
    const u = rnd()
    let a: number, e: number, i: number
    if (u < 0.5) { a = 42 + rnd() * 5.5; e = rnd() * 0.1; i = Math.abs(gauss()) * 2.5 } // cold classical
    else if (u < 0.65) { a = 38 + rnd() * 10; e = rnd() * 0.2; i = Math.abs(gauss()) * 12 } // hot classical
    else if (u < 0.83) { a = 39.4 + gauss() * 0.25; e = 0.1 + rnd() * 0.2; i = Math.abs(gauss()) * 9 } // plutinos 3:2
    else if (u < 0.91) { a = 47.8 + gauss() * 0.3; e = 0.1 + rnd() * 0.2; i = Math.abs(gauss()) * 8 } // twotinos 2:1
    else { a = 50 + rnd() * rnd() * 90; const q = 34 + rnd() * 6; e = Math.min(0.9, 1 - q / a); i = Math.abs(gauss()) * 14 } // scattered
    rows.push([a, e, i * DEG, rnd() * tau, rnd() * tau, rnd() * tau])
  }
  return rows
}
