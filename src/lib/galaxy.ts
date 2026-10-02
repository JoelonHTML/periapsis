// Interstellar physics + nearby-star catalogue for the "Melkweg" view. Pure functions, units: ly, years, km/s, SI for the thruster.
//
// Frame ("galactic Cartesian", Sun at the origin): x → Galactic centre (l=0°, b=0°), y → l=90° (direction of Galactic rotation
// at the Sun), z → North Galactic Pole. Right-handed. Scene.tsx/three.js uses (x, z, −y) of this frame, 1 scene unit = 10 ly.

export const C_KMS = 299792.458
export const YEAR_S = 365.25 * 86400 // Julian year
export const LY_KM = C_KMS * YEAR_S // 9.4607304725808e12 km
export const LY_M = LY_KM * 1000
export const G0_MS2 = 9.80665
/** 1 g in ly/yr² (c = 1 ly/yr in these units) */
export const G_LY_YR2 = (G0_MS2 * YEAR_S * YEAR_S) / LY_M
export const SUN_GC_LY = 26000
export const GAL_RADIUS_LY = 50000
export const AGE_GALAXY_YR = 13.6e9
const DEG = Math.PI / 180

export type V3 = [number, number, number]

// ------------------------------------------------------------------ coordinates
export const galToXyz = (lDeg: number, bDeg: number, d: number): V3 => {
  const l = lDeg * DEG, b = bDeg * DEG
  return [d * Math.cos(b) * Math.cos(l), d * Math.cos(b) * Math.sin(l), d * Math.sin(b)]
}
export const xyzToGal = (p: V3) => {
  const d = Math.hypot(p[0], p[1], p[2])
  return { d, l: ((Math.atan2(p[1], p[0]) / DEG) % 360 + 360) % 360, b: d ? Math.asin(p[2] / d) / DEG : 0 }
}

// ------------------------------------------------------------------ relativity helpers
export const kmsToBeta = (v: number) => v / C_KMS
export const betaToKms = (b: number) => b * C_KMS
export const gamma = (beta: number) => (beta < 1 ? 1 / Math.sqrt(1 - beta * beta) : Infinity)
export const kmsToLyPerYr = (v: number) => (v * YEAR_S) / LY_KM

// ------------------------------------------------------------------ ion thruster (Tsiolkovsky + constant thrust)
export interface IonInput { thrustN: number; isp: number; powerW: number; propKg: number; dryKg: number }
export function ionBurn(p: IonInput) {
  const ve = p.isp * G0_MS2 // m/s
  const mdot = p.thrustN / ve // kg/s
  const m0 = p.dryKg + p.propKg, mf = p.dryKg
  const dv = ve * Math.log(m0 / mf) // m/s
  const tBurn = p.propKg / mdot // s
  // s(t) = ve [ t + (m/ṁ) ln(m/m0) ] with m = m0 − ṁt, evaluated at burnout
  const sBurn = ve * (tBurn + (mf / mdot) * Math.log(mf / m0)) // m
  const aStart = p.thrustN / m0, aEnd = p.thrustN / mf // m/s²
  const eta = p.powerW > 0 ? (p.thrustN * ve) / (2 * p.powerW) : NaN
  return { ve, mdot, m0, mf, dv, tBurn, sBurn, aStart, aEnd, eta, massRatio: m0 / mf }
}

// ------------------------------------------------------------------ constant acceleration, flip-and-burn
/** d in ly, a in g. Accelerate to the midpoint, flip, decelerate. Returns years. */
export function accelFlip(dLy: number, aG: number) {
  const a = aG * G_LY_YR2 // ly/yr², c = 1
  const gPeak = 1 + (a * dLy) / 2 // γ at the midpoint
  const theta = Math.acosh(gPeak)
  return { a, gammaPeak: gPeak, betaPeak: Math.tanh(theta), tau: (2 / a) * theta, t: (2 / a) * Math.sinh(theta) }
}

// ------------------------------------------------------------------ flight profile: position s (ly) → clocks and speed
export interface Moment { t: number; tau: number | null; beta: number } // years, years (null if undefined), v/c
export type Profile = (s: number) => Moment

export type Model = 'ideal' | 'ion' | 'accel'
export interface PlanInput { d: number; model: Model; vKms: number; ion: IonInput; aG: number }
export interface Plan {
  d: number; model: Model
  beta: number // cruise speed (ideal), final speed after the burn (ion), peak speed (accel)
  tEarthYr: number; tauYr: number | null; ftl: boolean
  profile: Profile
  ion?: ReturnType<typeof ionBurn> & { sBurnLy: number; tBurnYr: number }
  accel?: ReturnType<typeof accelFlip>
}

export function computePlan(inp: PlanInput): Plan {
  const d = Math.max(inp.d, 1e-9)
  if (inp.model === 'accel') {
    const r = accelFlip(d, inp.aG), a = r.a
    const half = d / 2
    const part = (x: number) => { const th = Math.acosh(1 + a * x); return { t: Math.sinh(th) / a, tau: th / a, beta: Math.tanh(th) } }
    const profile: Profile = (s) => {
      s = Math.min(Math.max(s, 0), d)
      if (s <= half) return part(s)
      const m = part(d - s)
      return { t: r.t - m.t, tau: r.tau - m.tau, beta: m.beta }
    }
    return { d, model: 'accel', beta: r.betaPeak, tEarthYr: r.t, tauYr: r.tau, ftl: false, profile, accel: r }
  }
  if (inp.model === 'ion') {
    const b = ionBurn(inp.ion)
    const betaF = Math.max(kmsToBeta(b.dv / 1000), 1e-12)
    const sBurnLy = b.sBurn / LY_M, tBurnYr = b.tBurn / YEAR_S
    const g = gamma(betaF)
    // During the burn the acceleration is treated as constant (it grows ≈ m0/mf over the burn; irrelevant at ly scale).
    const profile: Profile = (s) => {
      s = Math.min(Math.max(s, 0), d)
      if (s < sBurnLy) { const x = Math.sqrt(s / sBurnLy); return { t: tBurnYr * x, tau: tBurnYr * x, beta: betaF * x } }
      const c = (s - sBurnLy) / betaF
      return { t: tBurnYr + c, tau: tBurnYr + c / g, beta: betaF }
    }
    const end = profile(d)
    return { d, model: 'ion', beta: betaF, tEarthYr: end.t, tauYr: end.tau, ftl: false, profile, ion: { ...b, sBurnLy, tBurnYr } }
  }
  const beta = Math.max(kmsToBeta(inp.vKms), 1e-12)
  const ftl = beta >= 1
  const profile: Profile = (s) => {
    s = Math.min(Math.max(s, 0), d)
    const t = s / beta
    return { t, tau: ftl ? null : t / gamma(beta), beta }
  }
  return { d, model: 'ideal', beta, tEarthYr: d / beta, tauYr: ftl ? null : d / beta / gamma(beta), ftl, profile }
}

// ------------------------------------------------------------------ Dutch formatting
const NNBSP = ' '
/** Dutch number: decimal comma, thin-space thousands. */
export function nl(x: number, maxFrac = 2): string {
  if (!Number.isFinite(x)) return '—'
  const s = x.toLocaleString('nl-NL', { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 })
  return s.replace(/\./g, NNBSP)
}
/** Number with a given count of significant digits (no exponent for sane magnitudes). */
export function nlSig(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const mag = Math.floor(Math.log10(Math.abs(x)))
  return nl(x, Math.max(0, sig - 1 - mag))
}
/** Short time string; `alt` gives a friendlier unit for long times. */
export function fmtYears(yr: number): { main: string; alt: string } {
  const s = yr * YEAR_S
  if (!Number.isFinite(yr)) return { main: '—', alt: '' }
  if (s < 60) return { main: `${nlSig(s, 3)} s`, alt: '' }
  if (s < 3600) return { main: `${nlSig(s / 60, 3)} min`, alt: '' }
  if (s < 86400) return { main: `${nlSig(s / 3600, 3)} uur`, alt: '' }
  if (yr < 1) return { main: `${nlSig(s / 86400, 3)} dagen`, alt: '' }
  if (yr < 100) return { main: `${nlSig(yr, 3)} jaar`, alt: '' }
  if (yr < 1000) return { main: `${nlSig(yr, 3)} jaar`, alt: `≈ ${nlSig(yr / 100, 2)} eeuwen` }
  if (yr < 1e6) return { main: `${nlSig(yr, 3)} jaar`, alt: `≈ ${nlSig(yr / 1000, 3)} millennia` }
  if (yr < 1e9) return { main: `${nlSig(yr / 1e6, 3)} miljoen jaar`, alt: '' }
  return { main: `${nlSig(yr / 1e9, 3)} miljard jaar`, alt: '' }
}
export const fmtYearsText = (yr: number) => { const r = fmtYears(yr); return r.alt ? `${r.main} (${r.alt})` : r.main }
export const fmtLy = (d: number) => `${nlSig(d, d < 100 ? 3 : 4)} ly`
export const fmtKms = (v: number) => (v >= 1e4 ? nl(Math.round(v)) : nlSig(v, 4)) + ' km/s'

/** Ordering-of-magnitude context for a duration. */
export function timeContext(yr: number): string {
  if (!(yr > 0)) return ''
  if (yr < 1) return 'korter dan een jaar'
  if (yr < 150) return `ca. ${nlSig(yr / 80, 2)} × een mensenleven (80 jaar)`
  if (yr < 1e4) return `ca. ${nlSig(yr / 5000, 2)} × de geschreven geschiedenis (ca. 5 000 jaar)`
  if (yr < 1e6) return `ca. ${nlSig(yr / 3e5, 2)} × de leeftijd van Homo sapiens (ca. 300 000 jaar)`
  if (yr < 1e9) return `ca. ${nlSig(yr / 66e6, 2)} × de tijd sinds de dinosauriërs uitstierven (66 miljoen jaar)`
  return `ca. ${nlSig((yr / AGE_GALAXY_YR) * 100, 2)} % van de leeftijd van de Melkweg (13,6 miljard jaar)`
}

// ------------------------------------------------------------------ catalogue
export interface Body {
  id: string; name: string
  l: number; b: number // galactic longitude / latitude, degrees (J2000 → IAU 1958 galactic)
  d: number // distance from the Sun, ly (ca.)
  tint: string; note: string
  kind: 'star' | 'object' | 'galaxy' | 'rim'
}
// (l, b) were computed from J2000 RA/Dec (SIMBAD) with the IAU galactic pole (α=192.85948°, δ=27.12825°, l_NCP=122.93192°)
// and rounded to 0.01°; distances are rounded Gaia/Hipparcos values ("ca.").
export const BODIES: Body[] = [
  { id: 'proxima', name: 'Proxima Centauri', l: 313.94, b: -1.93, d: 4.246, tint: '#ff9d7a', note: 'Dichtstbijzijnde ster; rode dwerg met een planeet in de bewoonbare zone.', kind: 'star' },
  { id: 'alphacen', name: 'Alfa Centauri A/B', l: 315.73, b: -0.68, d: 4.37, tint: '#ffe9b8', note: 'Dubbelster van zonachtige sterren.', kind: 'star' },
  { id: 'barnard', name: 'Ster van Barnard', l: 31.0, b: 14.06, d: 5.96, tint: '#ff9d7a', note: 'Rode dwerg met de grootste eigenbeweging.', kind: 'star' },
  { id: 'wolf359', name: 'Wolf 359', l: 244.06, b: 56.12, d: 7.86, tint: '#ff8f70', note: 'Zwakke rode dwerg in Leo.', kind: 'star' },
  { id: 'sirius', name: 'Sirius', l: 227.23, b: -8.9, d: 8.6, tint: '#cfe0ff', note: 'Helderste ster aan de nachtelijke hemel.', kind: 'star' },
  { id: 'luyten', name: 'Luyten 726-8', l: 175.47, b: -75.7, d: 8.73, tint: '#ff9d7a', note: 'Dubbele rode dwerg (UV Ceti / BL Ceti).', kind: 'star' },
  { id: 'ross154', name: 'Ross 154', l: 11.31, b: -10.28, d: 9.69, tint: '#ff9d7a', note: 'Rode dwerg in Boogschutter.', kind: 'star' },
  { id: 'epseri', name: 'Epsilon Eridani', l: 195.83, b: -48.05, d: 10.5, tint: '#ffd9a0', note: 'Jonge oranje ster met stofschijf.', kind: 'star' },
  { id: 'procyon', name: 'Procyon', l: 213.71, b: 13.02, d: 11.4, tint: '#fff4dc', note: 'Helderste ster van de Kleine Hond.', kind: 'star' },
  { id: 'cyg61', name: '61 Cygni', l: 82.32, b: -5.82, d: 11.4, tint: '#ffc78a', note: 'Eerste ster waarvan de afstand werd gemeten (Bessel, 1838).', kind: 'star' },
  { id: 'tauceti', name: 'Tau Ceti', l: 173.11, b: -73.43, d: 11.9, tint: '#ffeec2', note: 'Zonachtige ster met meerdere kandidaat-planeten.', kind: 'star' },
  { id: 'altair', name: 'Altair', l: 47.74, b: -8.91, d: 16.7, tint: '#e4ecff', note: 'Snel roterende witte ster in de Arend.', kind: 'star' },
  { id: 'vega', name: 'Vega', l: 67.45, b: 19.24, d: 25, tint: '#cfe0ff', note: 'Helderste ster van de Lier.', kind: 'star' },
  { id: 'fomalhaut', name: 'Fomalhaut', l: 20.5, b: -64.92, d: 25.1, tint: '#e4ecff', note: 'Witte ster met een stofring.', kind: 'star' },
  { id: 'pollux', name: 'Pollux', l: 192.22, b: 23.41, d: 33.8, tint: '#ffcf94', note: 'Oranje reus met een exoplaneet.', kind: 'star' },
  { id: 'arcturus', name: 'Arcturus', l: 15.06, b: 69.1, d: 36.7, tint: '#ffb87a', note: 'Oranje reus, helderste ster van het noordelijk halfrond.', kind: 'star' },
  { id: 'trappist1', name: 'TRAPPIST-1', l: 69.73, b: -56.64, d: 40.7, tint: '#ff8f70', note: 'Ultrakoele dwerg met zeven aardachtige planeten.', kind: 'star' },
  { id: 'capella', name: 'Capella', l: 162.59, b: 4.57, d: 42.9, tint: '#fff0c8', note: 'Systeem van gele reuzen in Voerman.', kind: 'star' },
  { id: 'aldebaran', name: 'Aldebaran', l: 180.96, b: -20.25, d: 65, tint: '#ffb27a', note: 'Oranje reus, het oog van de Stier.', kind: 'star' },
  { id: 'regulus', name: 'Regulus', l: 226.43, b: 48.94, d: 79, tint: '#cfe0ff', note: 'Blauwwitte ster, hart van de Leeuw.', kind: 'star' },
  { id: 'polaris', name: 'Polaris', l: 123.28, b: 26.46, d: 430, tint: '#fff4dc', note: 'Poolster; veranderlijke gele superreus.', kind: 'star' },
  { id: 'betelgeuse', name: 'Betelgeuze', l: 199.79, b: -8.95, d: 550, tint: '#ff8a5c', note: 'Rode superreus in Orion; afstand ca. 550–700 ly.', kind: 'star' },
  { id: 'rigel', name: 'Rigel', l: 209.23, b: -25.25, d: 860, tint: '#bcd2ff', note: 'Blauwe superreus in Orion.', kind: 'star' },
  { id: 'kepler452', name: 'Kepler-452', l: 77.86, b: 9.99, d: 1800, tint: '#ffeec2', note: 'Zonachtige ster met de aardachtige planeet Kepler-452b.', kind: 'star' },
  { id: 'deneb', name: 'Deneb', l: 84.28, b: 2.0, d: 2600, tint: '#e4ecff', note: 'Witte superreus in de Zwaan; ca. 2 600 ly.', kind: 'star' },
  { id: 'cygx1', name: 'Cygnus X-1', l: 71.34, b: 3.06, d: 7200, tint: '#9fd0ff', note: 'Stellair zwart gat met een blauwe superreus als begeleider.', kind: 'object' },
  { id: 'etacar', name: 'Eta Carinae', l: 287.6, b: -0.63, d: 7500, tint: '#ffc9a0', note: 'Extreem zware ster in de Kielnevel.', kind: 'object' },
  { id: 'sgra', name: 'Sgr A* (centrum Melkweg)', l: 359.94, b: -0.05, d: 26000, tint: '#ffd27a', note: 'Superzwaar zwart gat van ca. 4 miljoen zonsmassa\'s.', kind: 'object' },
  // Far rim: the point on the line Sun → Galactic centre, one disc radius (50 000 ly) beyond the centre.
  { id: 'rim', name: 'Overkant van de Melkweg', l: 0, b: 0, d: SUN_GC_LY + GAL_RADIUS_LY, tint: '#9fc4ff', note: 'Rechtdoor door het centrum tot de andere rand van de schijf: 26 000 + 50 000 ly.', kind: 'rim' },
  { id: 'lmc', name: 'Grote Magellaanse Wolk', l: 280.46, b: -32.89, d: 160000, tint: '#bcd2ff', note: 'Satellietstelsel van de Melkweg (ca. 160 000 ly).', kind: 'galaxy' },
  { id: 'smc', name: 'Kleine Magellaanse Wolk', l: 302.8, b: -44.29, d: 200000, tint: '#bcd2ff', note: 'Satellietstelsel van de Melkweg (ca. 200 000 ly).', kind: 'galaxy' },
  { id: 'm31', name: 'Andromedanevel (M31)', l: 121.17, b: -21.58, d: 2540000, tint: '#ffe0b0', note: 'Naaste grote spiraalstelsel, ca. 2,54 miljoen ly.', kind: 'galaxy' },
]
export const bodyById = (id: string) => BODIES.find((b) => b.id === id)

export const CUSTOM_ID = 'custom'
