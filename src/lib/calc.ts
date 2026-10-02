// Pure engineering formulas for the "Rekenen" tab. Units: km, s, km/s, rad unless the name says otherwise.
import { AU, BODIES, DEG, MU_EARTH, MU_MOON, MU_SUN, RE, R_MOON, R_SUN, visViva, type BodyId } from './astro.ts'

export const TAU = 2 * Math.PI
export const G0_MS = 9.80665 // m/s², standard gravity
export const C_KMS = 299792.458
export const MU0 = 4e-7 * Math.PI // T·m/A
export const SIGMA = 5.670374419e-8 // W/m²/K⁴
export const L_SUN = 3.828e26 // W (IAU 2015 nominal)
export const B0_EARTH = 3.12e-5 // T, mean equatorial surface field
export const M_EARTH = 7.94e22 // A·m², dipole moment
export const POLE_LAT = 80.65 // IGRF-13 (2020) dipole axis, geographic °N
export const POLE_LON = -72.68 // °E

// ---------- Central bodies (index = select value) ----------
export interface Central { id: string; name: string; mu: number; radius: number }
const fromBody = (id: BodyId, name?: string, radius?: number): Central => ({ id, name: name ?? BODIES[id].name, mu: BODIES[id].mu, radius: radius ?? BODIES[id].radius })
export const CENTRALS: Central[] = [
  { id: 'sun', name: 'Zon', mu: MU_SUN, radius: R_SUN },
  fromBody('mercury'), fromBody('venus'),
  { id: 'earth', name: 'Aarde', mu: MU_EARTH, radius: RE }, // equatorial radius, as in the rest of the app
  { id: 'moon', name: 'Maan', mu: MU_MOON, radius: R_MOON },
  fromBody('mars'), fromBody('ceres'), fromBody('jupiter'), fromBody('saturn'), fromBody('uranus'), fromBody('neptune'),
]
/** Planets orbiting the Sun (semi-major axis in km). */
export const PLANETS = (Object.keys(BODIES) as BodyId[]).map((id) => ({ id, name: BODIES[id].name, mu: BODIES[id].mu, radius: BODIES[id].radius, a: BODIES[id].el[0] * AU }))

/** First non-positive entry as a Dutch message, or null. */
export function needPositive(...pairs: [string, number][]): string | null {
  for (const [name, x] of pairs) if (!(x > 0) || !Number.isFinite(x)) return `${name} moet groter dan 0 zijn.`
  return null
}

// ---------- Basic orbit ----------
export const vCirc = (mu: number, r: number) => Math.sqrt(mu / r)
export const vEsc = (mu: number, r: number) => Math.sqrt((2 * mu) / r)
export const orbitPeriod = (mu: number, a: number) => TAU * Math.sqrt(a ** 3 / mu)
export const semiMajorFromPeriod = (mu: number, T: number) => Math.cbrt((mu * T * T) / (4 * Math.PI * Math.PI))

export function ellipseFromRadii(mu: number, rp: number, ra: number) {
  const a = (rp + ra) / 2
  return { a, e: (ra - rp) / (ra + rp), T: orbitPeriod(mu, a), vp: visViva(mu, rp, a), va: visViva(mu, ra, a), energy: -mu / (2 * a) }
}

// ---------- Transfers ----------
export function hohmannFull(mu: number, r1: number, r2: number) {
  const a = (r1 + r2) / 2
  const vc1 = vCirc(mu, r1), vc2 = vCirc(mu, r2)
  const vt1 = visViva(mu, r1, a), vt2 = visViva(mu, r2, a)
  const T1 = orbitPeriod(mu, r1), T2 = orbitPeriod(mu, r2)
  const tof = Math.PI * Math.sqrt(a ** 3 / mu)
  const phase = ((180 - (360 * tof) / T2 + 180) % 360 + 360) % 360 - 180 // target ahead of departure body (°), wrapped to (−180, 180]
  return {
    a, vc1, vc2, vt1, vt2, vinf1: vt1 - vc1, vinf2: vc2 - vt2, dv1: Math.abs(vt1 - vc1), dv2: Math.abs(vc2 - vt2),
    dv: Math.abs(vt1 - vc1) + Math.abs(vc2 - vt2), tof, T1, T2, synodic: synodicPeriod(T1, T2), phase,
  }
}
export const synodicPeriod = (T1: number, T2: number) => (T1 === T2 ? Infinity : Math.abs(1 / (1 / T1 - 1 / T2)))

export function biElliptic(mu: number, r1: number, r2: number, rb: number) {
  const a1 = (r1 + rb) / 2, a2 = (rb + r2) / 2
  const dv1 = Math.abs(visViva(mu, r1, a1) - vCirc(mu, r1))
  const dv2 = Math.abs(visViva(mu, rb, a2) - visViva(mu, rb, a1))
  const dv3 = Math.abs(vCirc(mu, r2) - visViva(mu, r2, a2))
  return { dv1, dv2, dv3, dv: dv1 + dv2 + dv3, tof: Math.PI * (Math.sqrt(a1 ** 3 / mu) + Math.sqrt(a2 ** 3 / mu)) }
}

export const planeChange = (v: number, dInc: number) => 2 * v * Math.sin(dInc / 2)
/** Combined burn that changes speed v1 → v2 and the plane by dInc at the same time. */
export const combinedChange = (v1: number, v2: number, dInc: number) => Math.sqrt(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(dInc))
/** Edelbaum low-thrust spiral between circular orbits, with optional inclination change. */
export const edelbaum = (v1: number, v2: number, dInc: number) => Math.sqrt(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos((Math.PI / 2) * dInc))

// ---------- Spheres of influence ----------
export const soiRadius = (a: number, m: number, M: number) => a * (m / M) ** 0.4
export const hillRadius = (a: number, m: number, M: number, e = 0) => a * (1 - e) * (m / (3 * M)) ** (1 / 3)

// ---------- Hyperbolic excess / flyby ----------
export const hypEcc = (rp: number, vinf: number, mu: number) => 1 + (rp * vinf * vinf) / mu
export function vinfFromDv(dv: number, r: number, mu: number) {
  const v = Math.sqrt(mu / r) + dv
  return Math.sqrt(v * v - (2 * mu) / r) // NaN when below escape
}
export function flyby(vinf: number, rp: number, mu: number) {
  const e = hypEcc(rp, vinf, mu)
  const delta = 2 * Math.asin(1 / e)
  return { e, delta, dvEq: 2 * vinf * Math.sin(delta / 2), vp: Math.sqrt(vinf * vinf + (2 * mu) / rp), thetaInf: Math.acos(-1 / e) }
}

// ---------- Rocket equation ----------
export type RocketUnknown = 'dv' | 'isp' | 'm0' | 'mf'
/** dv in m/s, isp in s, masses in kg. Solve for the unknown from the other three. */
export function rocketSolve(want: RocketUnknown, p: { dv: number; isp: number; m0: number; mf: number }) {
  let { dv, isp, m0, mf } = p
  const ve = () => isp * G0_MS
  if (want === 'dv') dv = ve() * Math.log(m0 / mf)
  else if (want === 'isp') isp = dv / (G0_MS * Math.log(m0 / mf))
  else if (want === 'm0') m0 = mf * Math.exp(dv / ve())
  else mf = m0 * Math.exp(-dv / ve())
  return { dv, isp, m0, mf, mp: m0 - mf, ratio: m0 / mf, fraction: (m0 - mf) / m0, ve: isp * G0_MS }
}
export function burnSequence(m0: number, isp: number, dvs: number[]) {
  const ve = isp * G0_MS
  let m = m0
  const steps = dvs.map((dv) => { const mAfter = m * Math.exp(-dv / ve); const s = { dv, before: m, after: mAfter, prop: m - mAfter }; m = mAfter; return s })
  return { steps, final: m, prop: m0 - m, dv: dvs.reduce((a, b) => a + b, 0) }
}

// ---------- Slew ----------
export const inertia = {
  cylinder: (m: number, r: number, h: number) => (m * (3 * r * r + h * h)) / 12, // solid, about a transverse axis through the centre
  box: (m: number, a: number, b: number) => (m * (a * a + b * b)) / 12, // axis parallel to the third edge
  sphere: (m: number, r: number) => 0.4 * m * r * r,
}
export function slew(p: { theta: number; F: number; n: number; d: number; I: number; wMax?: number; isp?: number }) {
  const tau = p.n * p.F * p.d
  const alpha = tau / p.I
  const wPeakFree = Math.sqrt(p.theta * alpha)
  const limited = !!p.wMax && p.wMax > 0 && wPeakFree > p.wMax
  const w = limited ? p.wMax! : wPeakFree
  const t = limited ? p.theta / w + w / alpha : 2 * Math.sqrt(p.theta / alpha)
  const tBurn = 2 * w / alpha // accelerate + decelerate
  const prop = p.isp && p.isp > 0 ? (p.n * p.F * tBurn) / (p.isp * G0_MS) : NaN
  return { tau, alpha, t, tFree: 2 * Math.sqrt(p.theta / alpha), w, limited, tBurn, tCoast: t - tBurn, prop }
}

// ---------- Earth dipole ----------
export const dipoleB0FromMoment = (M: number, R_km: number) => (MU0 * M) / (4 * Math.PI * (R_km * 1000) ** 3)
export function dipoleField(r_km: number, latDeg: number, B0: number, R_km: number) {
  const k = B0 * (R_km / r_km) ** 3
  const s = Math.sin(latDeg * DEG), c = Math.cos(latDeg * DEG)
  return { k, Br: -2 * k * s, Bl: k * c, B: k * Math.sqrt(1 + 3 * s * s), L: r_km / (R_km * c * c) }
}
/** Geomagnetic (dipole) latitude in ° from geographic latitude/longitude in °. */
export function magneticLatitude(latDeg: number, lonDeg: number, poleLat = POLE_LAT, poleLon = POLE_LON) {
  const s = Math.sin(latDeg * DEG) * Math.sin(poleLat * DEG) + Math.cos(latDeg * DEG) * Math.cos(poleLat * DEG) * Math.cos((lonDeg - poleLon) * DEG)
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG
}

// ---------- Ballistic coefficient / drag ----------
export const ballistic = (m: number, cd: number, A: number) => m / (cd * A)
export const dragDecel = (rho: number, v_ms: number, bc: number) => (0.5 * rho * v_ms * v_ms) / bc

// ---------- Light / solar ----------
export const lightTime = (km: number) => km / C_KMS
export const solarFlux = (rAU: number) => L_SUN / (4 * Math.PI * (rAU * AU * 1000) ** 2)
/** Equilibrium temperature (K): absorbed S·α·Aabs = emitted ε·σ·Arad·T⁴, areaRatio = Aabs/Arad. */
export const equilibriumTemp = (S: number, alpha: number, eps: number, areaRatio: number) => ((S * alpha * areaRatio) / (eps * SIGMA)) ** 0.25
