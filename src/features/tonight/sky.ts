// Observer-centred sky: Sun, Moon and planets (alt/az, rise/set, twilight, magnitude). Pure TypeScript, no DOM, runs fully offline.
//
// Accuracy (see the notes in the UI as well):
//  - Sun: Meeus ch. 25 low-accuracy series (~0.01 deg, rise/set within ~1 min).
//  - Moon: Meeus ch. 47, the ~50 largest terms of ELP-2000/82 (~0.01 deg, rise/set within ~1-2 min).
//  - Planets: JPL/Standish Keplerian elements already used by the rest of the app (arc-minutes, rise/set within a few minutes),
//    with light-time, precession to the date, no nutation / stellar aberration.
//  - Magnitudes: Mallama & Hilton (2018) phase-angle laws, simplified (no Uranus/Neptune sub-latitude terms, no Saturn ring-shadow terms).
import { AU, DEG, bodyState, ecl2eq, mul, norm, sub, dot, type Vec } from '../../lib/astro.ts'

export interface Site { lat: number; lon: number; altM: number }
export const DAY_MS = 86400000
const mod = (x: number, m: number) => ((x % m) + m) % m
const sin = (deg: number) => Math.sin(deg * DEG)
const cos = (deg: number) => Math.cos(deg * DEG)

// ---------- Time ----------
export const jdUT = (ms: number) => ms / DAY_MS + 2440587.5
/** ΔT = TT - UT in seconds (Espenak & Meeus polynomial for 2005-2050, clamped; ~69 s in 2026). */
export function deltaT(ms: number) {
  const y = 1970 + ms / (365.2425 * DAY_MS)
  const t = Math.min(60, Math.max(5, y - 2000))
  return 62.92 + 0.32217 * t + 0.005589 * t * t
}
export const jdeOf = (ms: number) => jdUT(ms) + deltaT(ms) / 86400
/** Inverse of jdeOf (TT Julian day -> UT milliseconds). */
export const msOfJde = (jde: number) => {
  let ms = (jde - 2440587.5) * DAY_MS
  ms -= deltaT(ms) * 1000
  return ms
}
const centuries = (jde: number) => (jde - 2451545) / 36525

// ---------- Sun ----------
export function sunApparentJDE(jde: number) {
  const T = centuries(jde)
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M)
  const nu = M + C
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cos(nu))
  const om = 125.04 - 1934.136 * T
  return { lon: mod(L0 + C - 0.00569 - 0.00478 * sin(om), 360), R, omega: om }
}
/** True obliquity of the ecliptic (deg) incl. the main nutation term. */
export const obliquityDeg = (jde: number) => {
  const T = centuries(jde)
  return 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T + 0.00256 * cos(125.04 - 1934.136 * T)
}
function eclToEq(lon: number, lat: number, dist: number, eps: number): Vec {
  const x = dist * cos(lat) * cos(lon), y = dist * cos(lat) * sin(lon), z = dist * sin(lat)
  return [x, y * cos(eps) - z * sin(eps), y * sin(eps) + z * cos(eps)]
}
/** Equatorial -> ecliptic of the date. */
export function eqToEcl(v: Vec, eps: number): { lon: number; lat: number } {
  const y = v[1] * cos(eps) + v[2] * sin(eps), z = -v[1] * sin(eps) + v[2] * cos(eps)
  return { lon: mod(Math.atan2(y, v[0]) / DEG, 360), lat: Math.atan2(z, Math.hypot(v[0], y)) / DEG }
}
/** Geocentric Sun, equatorial of date, AU. */
export const sunVecJDE = (jde: number): Vec => { const s = sunApparentJDE(jde); return eclToEq(s.lon, 0, s.R, obliquityDeg(jde)) }

// ---------- Moon (Meeus ch. 47, truncated) ----------
// D, M, M', F, Σl [1e-6 deg], Σr [1e-3 km] (rows without a trusted Σr coefficient carry 0: a <0.3 % effect on the distance).
const LR: number[][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056], [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 0], [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, 0], [2, 0, 1, -2, -1773, 0], [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, 0], [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 0], [2, 1, 1, 0, -810, 0], [4, -1, -2, 0, 759, 0],
  [0, 2, -1, 0, -713, 0], [2, 2, -1, 0, -700, 0], [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, 0],
  [0, 0, 4, 0, 537, 0], [4, -1, 0, 0, 520, 0], [1, 0, -2, 0, -487, 0],
]
// D, M, M', F, Σb [1e-6 deg]
const B: number[][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
]

/** Geocentric ecliptic position of the Moon of date (apparent longitude incl. nutation); r in km. */
export function moonEclJDE(jde: number) {
  const T = centuries(jde), T2 = T * T
  const Lp = mod(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + (T2 * T) / 538841, 360)
  const D = mod(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + (T2 * T) / 545868, 360)
  const M = mod(357.5291092 + 35999.0502909 * T - 0.0001536 * T2, 360)
  const Mp = mod(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + (T2 * T) / 69699, 360)
  const F = mod(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - (T2 * T) / 3526000, 360)
  const E = 1 - 0.002516 * T - 0.0000074 * T2
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T
  let sl = 0, sr = 0, sb = 0
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = d * D + m * M + mp * Mp + f * F
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1
    sl += l * e * sin(arg)
    sr += r * e * cos(arg)
  }
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1
    sb += b * e * sin(d * D + m * M + mp * Mp + f * F)
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2)
  sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp)
  const nut = -0.004777 * sin(125.04 - 1934.136 * T)
  return { lon: mod(Lp + sl / 1e6 + nut, 360), lat: sb / 1e6, r: 385000.56 + sr / 1000 }
}
/** Geocentric Moon, equatorial of date, km. */
export const moonVecJDE = (jde: number): Vec => { const m = moonEclJDE(jde); return eclToEq(m.lon, m.lat, m.r, obliquityDeg(jde)) }

// ---------- Planets ----------
export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'
export const PLANETS: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']
const C_KM_S = 299792.458

/** IAU 1976 precession of an equatorial J2000 vector to the mean equator and equinox of date (T in Julian centuries). */
export function precess(v: Vec, T: number): Vec {
  const as = DEG / 3600
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th)
  return [
    (cz * ct * cZ - sz * sZ) * v[0] + (-sz * ct * cZ - cz * sZ) * v[1] + -st * cZ * v[2],
    (cz * ct * sZ + sz * cZ) * v[0] + (-sz * ct * sZ + cz * cZ) * v[1] + -st * sZ * v[2],
    cz * st * v[0] - sz * st * v[1] + ct * v[2],
  ]
}

export interface PlanetPos {
  /** geocentric, equatorial of date, AU */ vec: Vec
  /** geocentric, equatorial J2000, AU */ vecJ: Vec
  /** heliocentric distance AU */ r: number
  /** geocentric distance AU */ d: number
  /** Sun-Earth distance AU */ R: number
}
export function planetPos(id: PlanetId, ms: number): PlanetPos {
  const jde = jdeOf(ms)
  const tt = (jde - 2451545) * 86400
  const earth = bodyState('earth', tt).r
  let g = sub(bodyState(id, tt).r, earth)
  const p = bodyState(id, tt - norm(g) / C_KM_S).r // light-time
  g = sub(p, earth)
  const eq = ecl2eq(g)
  return { vec: mul(precess(eq, centuries(jde)), 1 / AU), vecJ: mul(eq, 1 / AU), r: norm(p) / AU, d: norm(g) / AU, R: norm(earth) / AU }
}
/** Phase angle Sun-planet-Earth (deg). */
export const phaseAngle = (p: PlanetPos) => Math.acos(Math.max(-1, Math.min(1, (p.r * p.r + p.d * p.d - p.R * p.R) / (2 * p.r * p.d)))) / DEG
export const illumination = (p: PlanetPos) => (1 + cos(phaseAngle(p))) / 2

// Saturn's north pole (J2000): RA 40.589 deg, Dec 83.537 deg.
const SAT_POLE: Vec = [cos(83.537) * cos(40.589), cos(83.537) * sin(40.589), sin(83.537)]

/** Apparent visual magnitude: Mallama & Hilton (2018) laws, simplified (see header). */
export function planetMag(id: PlanetId, p: PlanetPos): number {
  const i = phaseAngle(p)
  const d5 = 5 * Math.log10(p.r * p.d)
  switch (id) {
    case 'mercury':
      return -0.613 + d5 + 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
    case 'venus':
      return i <= 163.7
        ? -4.384 - 1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4 + d5
        : 236.05828 - 2.81914 * i + 8.39034e-3 * i ** 2 + d5 // thin crescent beyond 163.7 deg (never observable anyway)
    case 'mars':
      return i <= 50 ? -1.601 + d5 + 0.02267 * i - 0.0001302 * i ** 2 : -0.367 + d5 - 0.02573 * i + 0.0003445 * i ** 2
    case 'jupiter':
      return -9.395 + d5 - 3.7e-4 * i + 6.16e-4 * i ** 2
    case 'saturn': {
      const g = mul(p.vecJ, 1 / (norm(p.vecJ) || 1))
      const sinB = Math.abs(dot(g, SAT_POLE)) // sub-Earth saturnicentric latitude
      return -8.914 + d5 - 1.825 * sinB + 0.026 * i - 0.378 * sinB * Math.exp(-2.25 * i)
    }
    case 'uranus':
      return -7.11 + d5 + 6.587e-3 * i + 1.045e-4 * i ** 2
    case 'neptune':
      return -6.89 + d5
  }
}

// ---------- Geometry: alt/az ----------
export type SkyBody = 'sun' | 'moon' | PlanetId
/** Geocentric vector of a body, equatorial of date, km. */
export function bodyVecKm(id: SkyBody, ms: number): Vec {
  if (id === 'sun') return mul(sunVecJDE(jdeOf(ms)), AU)
  if (id === 'moon') return moonVecJDE(jdeOf(ms))
  return mul(planetPos(id, ms).vec, AU)
}
export const lstDeg = (ms: number, lonDeg: number) => {
  const d = jdUT(ms) - 2451545, T = d / 36525
  return mod(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T + lonDeg, 360)
}
export function observerVec(site: Site, lst: number): Vec {
  const phi = site.lat * DEG
  const u = Math.atan(0.99664719 * Math.tan(phi)), h = site.altM / 6378140
  const rs = 0.99664719 * Math.sin(u) + h * Math.sin(phi), rc = Math.cos(u) + h * Math.cos(phi)
  return [6378.14 * rc * Math.cos(lst * DEG), 6378.14 * rc * Math.sin(lst * DEG), 6378.14 * rs]
}
/** Topocentric geometric altitude and azimuth (azimuth from north through east), degrees. */
export function altAzOf(vecKm: Vec, ms: number, site: Site) {
  const lst = lstDeg(ms, site.lon) * DEG, phi = site.lat * DEG
  const v = sub(vecKm, observerVec(site, lstDeg(ms, site.lon)))
  const up: Vec = [Math.cos(phi) * Math.cos(lst), Math.cos(phi) * Math.sin(lst), Math.sin(phi)]
  const east: Vec = [-Math.sin(lst), Math.cos(lst), 0]
  const north: Vec = [-Math.sin(phi) * Math.cos(lst), -Math.sin(phi) * Math.sin(lst), Math.cos(phi)]
  return { alt: Math.asin(Math.max(-1, Math.min(1, dot(v, up) / norm(v)))) / DEG, az: mod(Math.atan2(dot(v, east), dot(v, north)) / DEG, 360) }
}
export const bodyAltAz = (id: SkyBody, ms: number, site: Site) => altAzOf(bodyVecKm(id, ms), ms, site)

/** Angle between two equatorial vectors (deg). */
export const separation = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b))))) / DEG

// ---------- Moon phase ----------
export interface MoonPhaseInfo { elong: number; illum: number; idx: number; waxing: boolean; distKm: number }
/** idx: 0 new, 1 waxing crescent, 2 first quarter, 3 waxing gibbous, 4 full, 5 waning gibbous, 6 last quarter, 7 waning crescent. */
export function moonPhaseAt(ms: number): MoonPhaseInfo {
  const jde = jdeOf(ms)
  const m = moonEclJDE(jde), s = sunApparentJDE(jde)
  const elong = mod(m.lon - s.lon, 360)
  const psi = Math.acos(cos(m.lat) * cos(elong)) // geocentric elongation
  const R = s.R * AU
  const i = Math.atan2(R * Math.sin(psi), m.r - R * Math.cos(psi))
  return { elong, illum: (1 + Math.cos(i)) / 2, idx: Math.floor(mod(elong + 22.5, 360) / 45), waxing: elong < 180, distKm: m.r }
}

// ---------- Rise / set search ----------
export interface Crossing { ms: number; up: boolean }
/** Level crossings of `fn` sampled at `vals` (t0 + i*step); each is refined by bisection on `fn`. */
function crossings(vals: number[], t0: number, step: number, level: number, fn: (ms: number) => number): Crossing[] {
  const out: Crossing[] = []
  for (let i = 0; i + 1 < vals.length; i++) {
    const a = vals[i] - level, b = vals[i + 1] - level
    if ((a < 0) === (b < 0) || a === b) continue
    let lo = t0 + i * step, hi = lo + step
    const upward = b > a
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2
      if ((fn(mid) - level < 0) === (a < 0)) lo = mid; else hi = mid
    }
    out.push({ ms: Math.round((lo + hi) / 2), up: upward })
  }
  return out
}

/** Mean solar noon at the observer's longitude on the given civil date (the start of "that night"). */
export const solarNoon = (y: number, m: number, d: number, lonDeg: number) => Date.UTC(y, m - 1, d, 12) - (lonDeg / 15) * 3600e3

// ---------- Tonight ----------
export type AidKind = 'eye' | 'binoculars' | 'telescope'
export type WhyNot = 'below' | 'twilight' | 'low'
export interface PlanetTonight {
  id: PlanetId
  visible: boolean
  why?: WhyNot
  best?: { ms: number; alt: number; az: number }
  rise: number | null
  set: number | null
  mag: number
  /** angular distance from the Sun (deg) and whether the planet stands east of it (evening sky) */
  elong: number
  east: boolean
  /** illuminated fraction 0..1 */
  illum: number
  distAU: number
  aid: AidKind
}
export interface NightInfo {
  start: number
  end: number
  sunset: number | null
  sunrise: number | null
  civil: [number | null, number | null]
  nautical: [number | null, number | null]
  astro: [number | null, number | null]
  moonrise: number | null
  moonset: number | null
  mid: number
  moon: MoonPhaseInfo
  planets: PlanetTonight[]
}

const STEP = 5 * 60000
const SUN_H0 = -0.833
const PLANET_H0 = -0.5667
/** Dark enough to spot a planet: Sun below this altitude (faint planets need a darker sky). */
const DARK_BRIGHT = -6
const DARK_FAINT = -12
const MIN_ALT = 5

export function aidFor(id: PlanetId, mag: number): AidKind {
  if (id === 'neptune') return 'telescope'
  if (id === 'uranus') return 'binoculars'
  return mag <= 5.5 ? 'eye' : mag <= 9 ? 'binoculars' : 'telescope'
}

/** Everything for one night: [startMs, endMs] is normally solar noon -> next solar noon. */
export function skyNight(site: Site, startMs: number, endMs: number): NightInfo {
  const n = Math.floor((endMs - startMs) / STEP) + 1
  const times = Array.from({ length: n }, (_, i) => startMs + i * STEP)
  const sunAlt = times.map((t) => bodyAltAz('sun', t, site).alt)
  const sunFn = (t: number) => bodyAltAz('sun', t, site).alt
  const downThenUp = (level: number): [number | null, number | null] => {
    const cs = crossings(sunAlt, startMs, STEP, level, sunFn)
    const down = cs.find((c) => !c.up) ?? null
    const up = cs.find((c) => c.up && (!down || c.ms > down.ms)) ?? null
    return [down?.ms ?? null, up?.ms ?? null]
  }
  const [sunset, sunrise] = downThenUp(SUN_H0)
  const mid = sunset != null && sunrise != null ? Math.round((sunset + sunrise) / 2) : Math.round((startMs + endMs) / 2)

  const moonFn = (t: number) => bodyAltAz('moon', t, site).alt
  const moonAlt = times.map(moonFn)
  const mcs = crossings(moonAlt, startMs, STEP, -0.833, moonFn)
  const moonrise = mcs.find((c) => c.up)?.ms ?? null
  const moonset = mcs.find((c) => !c.up)?.ms ?? null

  const planets = PLANETS.map((id): PlanetTonight => {
    const fn = (t: number) => bodyAltAz(id, t, site)
    const pts = times.map(fn)
    const alts = pts.map((p) => p.alt)
    const cs = crossings(alts, startMs, STEP, PLANET_H0, (t) => fn(t).alt)
    const faint = id === 'uranus' || id === 'neptune'
    // Best moment = highest point in the darkest sky that still allows seeing it (faint planets need a darker sky).
    const levels = faint ? [DARK_FAINT - 6, DARK_FAINT] : [DARK_BRIGHT - 6, DARK_BRIGHT]
    const dark = levels[1]
    let bi = -1, anyUp = false
    for (let i = 0; i < n; i++) {
      if (alts[i] <= 0) continue
      const night = sunset != null && sunrise != null ? times[i] >= sunset && times[i] <= sunrise : sunAlt[i] < 0
      if (night) anyUp = true
    }
    for (const lv of levels) {
      for (let i = 0; i < n; i++) if (sunAlt[i] < lv && alts[i] >= MIN_ALT && (bi < 0 || alts[i] > alts[bi])) bi = i
      if (bi >= 0) break
    }
    const visible = bi >= 0
    const tRef = visible ? times[bi] : mid
    const pos = planetPos(id, tRef), sun = sunVecJDE(jdeOf(tRef))
    const mag = planetMag(id, pos)
    const eps = obliquityDeg(jdeOf(tRef))
    const dl = mod(eqToEcl(pos.vec, eps).lon - eqToEcl(sun, eps).lon + 180, 360) - 180
    let why: WhyNot | undefined
    if (!visible) {
      const upInDark = times.some((_, i) => sunAlt[i] < dark && alts[i] > 0)
      why = upInDark ? 'low' : anyUp || alts.some((a, i) => a > 0 && sunAlt[i] < 0) ? 'twilight' : 'below'
    }
    return {
      id, visible, why,
      best: visible ? { ms: times[bi], alt: pts[bi].alt, az: pts[bi].az } : undefined,
      rise: cs.find((c) => c.up)?.ms ?? null,
      set: cs.find((c) => !c.up)?.ms ?? null,
      mag, elong: separation(pos.vec, sun), east: dl > 0, illum: illumination(pos), distAU: pos.d,
      aid: aidFor(id, mag),
    }
  })

  return {
    start: startMs, end: endMs, sunset, sunrise,
    civil: downThenUp(-6), nautical: downThenUp(-12), astro: downThenUp(-18),
    moonrise, moonset, mid, moon: moonPhaseAt(mid), planets,
  }
}

/** Positions for the sky dome at one instant. */
export function skyAt(site: Site, ms: number) {
  const ids: SkyBody[] = ['sun', 'moon', ...PLANETS]
  return ids.map((id) => ({ id, ...bodyAltAz(id, ms, site) }))
}

/** Compass index 0..15 (0 = N, 4 = E, 8 = S, 12 = W). */
export const compassIdx = (az: number) => Math.floor(mod(az + 11.25, 360) / 22.5)
