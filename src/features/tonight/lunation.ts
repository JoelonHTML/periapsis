// Moon phases, eclipses (Meeus, Astronomical Algorithms ch. 49 and ch. 54, the F-argument method), equinoxes/solstices (ch. 27).
import { DAY_MS, jdUT, msOfJde, sunApparentJDE, jdeOf } from './sky.ts'

const DEG = Math.PI / 180
const sin = (d: number) => Math.sin(d * DEG)
const cos = (d: number) => Math.cos(d * DEG)

export type PhaseKind = 'new' | 'first' | 'full' | 'last'
export interface PhaseEvent { kind: PhaseKind; ms: number; k: number }
const PHASE_KINDS: PhaseKind[] = ['new', 'first', 'full', 'last']

/** Fundamental arguments shared by ch. 49 and ch. 54 (k counts lunations since 2000-01-06; +0.25/0.5/0.75 for the other phases). */
function args(k: number) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T
  return {
    T,
    jde0: 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4,
    E: 1 - 0.002516 * T - 0.0000074 * T2,
    M: 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3,
    Mp: 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4,
    F: 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4,
    Om: 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3,
  }
}

/** Julian Ephemeris Day of a phase (k = integer for new moon, +0.25 first quarter, +0.5 full, +0.75 last quarter). */
export function phaseJDE(k: number): number {
  const { T, jde0, E, M, Mp, F, Om } = args(k)
  const T2 = T * T
  const frac = Math.round((k - Math.floor(k)) * 4) % 4
  let c = 0
  if (frac === 0) {
    c = -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M)
      + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp)
  } else if (frac === 2) {
    c = -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M)
      + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp)
  } else {
    c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp) + 0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M)
      + 0.00204 * E * E * sin(2 * M) - 0.0018 * sin(Mp - 2 * F) - 0.0007 * sin(Mp + 2 * F) - 0.0004 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M)
      + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F) - 0.00028 * E * E * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(Om)
      - 0.00005 * sin(Mp - M - 2 * F) + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F) + 0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(3 * M) + 0.00002 * sin(2 * Mp - 2 * F) + 0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M)
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F)
    c += frac === 1 ? W : -W
  }
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165], [251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056], [34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
  ]
  for (const [a, w] of A) c += w * sin(a)
  return jde0 + c
}

/** All quarter phases whose instant (UT) lies in [startMs, endMs]. */
export function phasesBetween(startMs: number, endMs: number): PhaseEvent[] {
  let k = Math.floor((jdUT(startMs) - 2451550.09766) / 29.530588861) - 1
  const out: PhaseEvent[] = []
  for (let q = k * 4; ; q++) {
    const kk = q / 4
    const ms = msOfJde(phaseJDE(kk))
    if (ms > endMs) break
    if (ms >= startMs) out.push({ kind: PHASE_KINDS[((q % 4) + 4) % 4], ms, k: kk })
  }
  return out
}
export function nextPhase(kind: PhaseKind, fromMs: number): number {
  const want = PHASE_KINDS.indexOf(kind)
  return phasesBetween(fromMs, fromMs + 40 * DAY_MS).find((p) => p.kind === PHASE_KINDS[want])!.ms
}

// ---------- Eclipses (ch. 54) ----------
export type SolarKind = 'total' | 'annular' | 'hybrid' | 'partial'
export type LunarKind = 'total' | 'partial' | 'penumbral'
export interface Eclipse {
  type: 'solar' | 'lunar'
  kind: SolarKind | LunarKind
  /** instant of greatest eclipse (UT, ms) */
  ms: number
  gamma: number
  /** solar: magnitude of a partial eclipse (undefined for central ones); lunar: umbral magnitude (<=0 for penumbral) */
  mag: number | undefined
  /** lunar only: penumbral magnitude and the half-durations (minutes) of the penumbral / partial / total phases */
  penMag?: number
  halfPen?: number
  halfPartial?: number
  halfTotal?: number
}

/** Eclipse at lunation k (integer = new moon -> solar; +0.5 = full moon -> lunar), or null. */
export function eclipseAt(k: number): Eclipse | null {
  const a = args(k)
  const { T, E, M, Mp, Om } = a
  const solar = Math.abs(k - Math.round(k)) < 0.01
  if (Math.abs(sin(a.F)) > 0.36) return null
  const F1 = a.F - 0.02665 * sin(Om)
  const A1 = 299.77 + 0.107408 * k - 0.009173 * T * T
  const jde = a.jde0
    - 0.4075 * sin(Mp) + 0.1721 * E * sin(M) + 0.0161 * sin(2 * Mp) - 0.0097 * sin(2 * F1) + 0.0073 * E * sin(Mp - M) - 0.005 * E * sin(Mp + M)
    - 0.0023 * sin(Mp - 2 * F1) + 0.0021 * E * sin(2 * M) + 0.0012 * sin(Mp + 2 * F1) + 0.0006 * E * sin(2 * Mp + M) - 0.0004 * sin(3 * Mp)
    - 0.0003 * E * sin(M + 2 * F1) + 0.0003 * sin(A1) - 0.0002 * E * sin(M - 2 * F1) - 0.0002 * E * sin(2 * Mp - M) - 0.0002 * sin(Om)
  const P = 0.207 * E * sin(M) + 0.0024 * E * sin(2 * M) - 0.0392 * sin(Mp) + 0.0116 * sin(2 * Mp) - 0.0073 * E * sin(Mp + M) + 0.0067 * E * sin(Mp - M) + 0.0118 * sin(2 * F1)
  const Q = 5.2207 - 0.0048 * E * cos(M) + 0.002 * E * cos(2 * M) - 0.3299 * cos(Mp) - 0.006 * E * cos(Mp + M) + 0.0041 * E * cos(Mp - M)
  const W = Math.abs(cos(F1))
  const gamma = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * W)
  const g = Math.abs(gamma)
  const u = 0.0059 + 0.0046 * E * cos(M) - 0.0182 * cos(Mp) + 0.0004 * cos(2 * Mp) - 0.0005 * cos(M + Mp)
  const ms = msOfJde(jde)
  if (solar) {
    if (g > 1.5433 + u) return null
    if (g < 0.9972) {
      const kind: SolarKind = u < 0 ? 'total' : u > 0.0047 ? 'annular' : u < 0.00464 * Math.sqrt(1 - g * g) ? 'hybrid' : 'annular'
      return { type: 'solar', kind, ms, gamma, mag: undefined }
    }
    return { type: 'solar', kind: 'partial', ms, gamma, mag: (1.5433 + u - g) / (0.5461 + 2 * u) }
  }
  const pen = (1.5573 + u - g) / 0.545
  if (pen <= 0) return null
  const umb = (1.0128 - u - g) / 0.545
  const n = 0.5458 + 0.04 * cos(Mp)
  const half = (r: number) => (r * r > gamma * gamma ? (60 / n) * Math.sqrt(r * r - gamma * gamma) : 0)
  const kind: LunarKind = umb >= 1 ? 'total' : umb > 0 ? 'partial' : 'penumbral'
  return { type: 'lunar', kind, ms, gamma, mag: umb, penMag: pen, halfPen: half(1.5573 + u), halfPartial: half(1.0128 - u), halfTotal: half(0.4678 - u) }
}

export function eclipsesBetween(startMs: number, endMs: number): Eclipse[] {
  const k0 = Math.floor((jdUT(startMs) - 2451550.09766) / 29.530588861) - 1
  const out: Eclipse[] = []
  for (let q = k0 * 2; ; q++) {
    const k = q / 2
    if (msOfJde(2451550.09766 + 29.530588861 * k) > endMs + 3 * DAY_MS) break
    const e = eclipseAt(k)
    if (e && e.ms >= startMs && e.ms <= endMs) out.push(e)
  }
  return out
}

// ---------- Equinoxes and solstices (ch. 27) ----------
export type SeasonKind = 'marEq' | 'junSol' | 'sepEq' | 'decSol'
export interface SeasonEvent { kind: SeasonKind; ms: number }
const SEASON_TERMS: number[][] = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
  [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
  [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
]
export function seasonJDE(year: number, kind: SeasonKind): number {
  const Y = (year - 2000) / 1000
  const jde0 =
    kind === 'marEq' ? 2451623.80984 + 365242.37404 * Y + 0.05169 * Y ** 2 - 0.00411 * Y ** 3 - 0.00057 * Y ** 4
    : kind === 'junSol' ? 2451716.56767 + 365241.62603 * Y + 0.00325 * Y ** 2 + 0.00888 * Y ** 3 - 0.0003 * Y ** 4
    : kind === 'sepEq' ? 2451810.21715 + 365242.01767 * Y - 0.11575 * Y ** 2 + 0.00337 * Y ** 3 + 0.00078 * Y ** 4
    : 2451900.05952 + 365242.74049 * Y - 0.06223 * Y ** 2 - 0.00823 * Y ** 3 + 0.00032 * Y ** 4
  const T = (jde0 - 2451545) / 36525
  const W = 35999.373 * T - 2.47
  const dl = 1 + 0.0334 * cos(W) + 0.0007 * cos(2 * W)
  let S = 0
  for (const [A, B, C] of SEASON_TERMS) S += A * cos(B + C * T)
  return jde0 + (0.00001 * S) / dl
}
export function seasonsBetween(startMs: number, endMs: number): SeasonEvent[] {
  const y0 = new Date(startMs).getUTCFullYear(), y1 = new Date(endMs).getUTCFullYear()
  const out: SeasonEvent[] = []
  for (let y = y0; y <= y1; y++)
    for (const kind of ['marEq', 'junSol', 'sepEq', 'decSol'] as SeasonKind[]) {
      const ms = msOfJde(seasonJDE(y, kind))
      if (ms >= startMs && ms <= endMs) out.push({ kind, ms })
    }
  return out.sort((a, b) => a.ms - b.ms)
}

// ---------- Solar longitude (for meteor shower peaks, defined by λ☉ J2000) ----------
/** Apparent solar longitude referred to the J2000 equinox (deg), the convention of the IMO calendar. */
export function solarLongitudeJ2000(ms: number): number {
  const jde = jdeOf(ms)
  const T = (jde - 2451545) / 36525
  return (((sunApparentJDE(jde).lon - 1.396971 * T - 0.000308 * T * T) % 360) + 360) % 360
}
/** The instant in `year` at which the Sun reaches the given J2000 longitude. */
export function timeOfSolarLongitude(year: number, lonJ2000: number): number {
  let ms = Date.UTC(year, 0, 1) + ((((lonJ2000 - 280) % 360) + 360) % 360) / 0.9856 * DAY_MS
  for (let i = 0; i < 6; i++) {
    const d = ((((lonJ2000 - solarLongitudeJ2000(ms)) % 360) + 540) % 360) - 180
    ms += (d / 0.9856) * DAY_MS
  }
  return ms
}
