// Course-notation formulas (EPFL "Space Mission Design and Operations": special orbits, rendezvous, interplanetary, aerobraking/slingshot).
// Pure functions, km / s / km/s / rad unless the name says otherwise.
import { DEG, J2, MU_EARTH, RE } from './astro.ts'
import { TAU, orbitPeriod, semiMajorFromPeriod, vCirc } from './calc.ts'

/** Sidereal day (s): Earth's rotation period w.r.t. the stars, 23 h 56 min 4.09 s. */
export const SIDEREAL_DAY = 86164.0905
/** Tropical year (d): the Sun-synchronous nodal rate is 360° / 365.2422 d = 0.98565 °/d. */
export const TROPICAL_YEAR_D = 365.2422

// ---------- 3.3.1 Geosynchronous / geostationary ----------
/** Radius of a circular orbit with period T (default: sidereal day → geostationary radius 42 164 km). */
export const geoRadius = (mu = MU_EARTH, T = SIDEREAL_DAY) => semiMajorFromPeriod(mu, T)
/** Full angle under which the body (radius R) is seen from radius r: 2·asin(R/r) — 17.4° from GEO. */
export const viewAngle = (R: number, r: number) => 2 * Math.asin(R / r)
/** Highest latitude from which a satellite straight above the equator is above the horizon: acos(R/r) — 81.3° for GEO. */
export const maxViewLatitude = (R: number, r: number) => Math.acos(R / r)
/** Insertion into GEO at the GTO apogee, for a GTO inclined by Δi to the equator. Separate: circularise, then plane change; combined: one burn. */
export function geoInsertion(mu: number, rPerigee: number, rGeo: number, dInc: number) {
  const a = (rPerigee + rGeo) / 2
  const vApo = Math.sqrt(mu * (2 / rGeo - 1 / a)), vC = vCirc(mu, rGeo)
  const circ = vC - vApo // Δv₂ in the course
  const plane = 2 * vApo * Math.sin(dInc / 2) // Δv₃ in the course (plane change at the slow apogee speed)
  const combined = Math.sqrt(vApo * vApo + vC * vC - 2 * vApo * vC * Math.cos(dInc))
  return { vApo, vC, circ, plane, separate: circ + plane, combined }
}

// ---------- 3.3.2 Nodal regression, Sun-synchronous orbits ----------
/** J2 node drift dΩ/dt (rad/s) = −(3/2)·J2·(R/p)²·n·cos i, p = a(1−e²). Negative for i < 90° (the node regresses westward). */
export function nodalRate(mu: number, R: number, j2: number, a: number, e: number, i: number) {
  const n = Math.sqrt(mu / a ** 3), p = a * (1 - e * e)
  return -1.5 * n * j2 * (R / p) ** 2 * Math.cos(i)
}
/** Same in °/day for the Earth. The course writes it as −2.06474·10¹⁴ · cos i / (a^3.5 (1−e²)²), a in km. */
export const nodalRateEarthDeg = (a: number, e: number, i: number) => nodalRate(MU_EARTH, RE, J2, a, e, i) * 86400 / DEG
export const nodalRateCourseDeg = (a: number, e: number, i: number) => (-2.06474e14 * Math.cos(i)) / (a ** 3.5 * (1 - e * e) ** 2)
/** Required Sun-synchronous node rate (rad/s): +360° per tropical year = +0.9856 °/day (eastward). */
export const SSO_RATE = TAU / (TROPICAL_YEAR_D * 86400)
/** Inclination (rad) that makes the node follow the Sun; NaN when the orbit is too high (|cos i| > 1). */
export function ssoInclination(mu: number, R: number, j2: number, a: number, e: number) {
  const k = nodalRate(mu, R, j2, a, e, 0) // = −(3/2) n J2 (R/p)² (value at i = 0)
  const c = SSO_RATE / k // cos i = SSO_RATE / k: negative, so i > 90° (retrograde)
  return Math.abs(c) <= 1 ? Math.acos(c) : NaN
}
/** Highest circular SSO radius for which the formula still has a solution (cos i = −1 → i = 180°). */
export const ssoMaxRadius = (mu: number, R: number, j2: number) => ((1.5 * j2 * R * R * Math.sqrt(mu)) / SSO_RATE) ** (2 / 7)

// ---------- 3.4 Rendezvous: catch-up rate and phasing ----------
/** Course approximation: a chaser Δr lower than the target gains (moves forward) Δx = 3π·Δr (km) per orbit, Δr ≪ r. */
export const catchUpPerOrbit = (dr: number) => 3 * Math.PI * dr
/** Same for a chaser in an ellipse of semi-major axis a in a target circle r: Δx = 3π (r − a) (+ = chaser gains). */
export const catchUpEllipse = (r: number, a: number) => 3 * Math.PI * (r - a)
/** Exact gain (rad of phase angle) per orbit of the chaser (semi-major axis a1) on a target on circle r2: 2π(1 − T1/T2). */
export const catchUpExact = (mu: number, a1: number, r2: number) => TAU * (1 - orbitPeriod(mu, a1) / orbitPeriod(mu, r2))
/** Phasing orbit: the target is `phase` rad ahead (negative = behind) on circle r; catch up in n revolutions of the phasing orbit.
 *  360·n = phase + 360·n·Tp/T  →  Tp = T(1 − phase/(2πn)). Burn at the touching point; the same Δv (opposite sign) closes the orbit. */
export function phasing(mu: number, r: number, phase: number, n: number) {
  const T = orbitPeriod(mu, r), Tp = T * (1 - phase / (TAU * n))
  const a = semiMajorFromPeriod(mu, Tp), rOther = 2 * a - r
  const dv = Math.abs(Math.sqrt(mu * (2 / r - 1 / a)) - vCirc(mu, r))
  return { T, Tp, a, rOther, dv, total: 2 * dv, time: n * Tp, shorter: Tp < T }
}

// ---------- 4.2 Interplanetary: hyperbolas (departure / arrival), course notation ----------
/** Planet-centred hyperbola from v∞ and periapsis radius r_p: a = μ/v∞², e = (a+r_p)/a, θ∞ = arccos(−1/e), cos β = a/c = 1/e, d∞ = b. */
export function hyperbola(mu: number, vinf: number, rp: number) {
  const a = mu / (vinf * vinf), e = (a + rp) / a, c = a * e, b = a * Math.sqrt(e * e - 1)
  const beta = Math.acos(1 / e)
  return { a, e, c, b, dInf: b, thetaInf: Math.acos(-1 / e), beta, deltaHalf: Math.PI / 2 - beta, delta: Math.PI - 2 * beta, vp: Math.sqrt(vinf * vinf + (2 * mu) / rp) }
}
/** Periapsis radius for a given impact parameter d∞ (B-plane): r_p = −μ/v∞² + √(μ²/v∞⁴ + d∞²). */
export const periapsisFromImpact = (mu: number, vinf: number, d: number) => -mu / vinf ** 2 + Math.sqrt(mu ** 2 / vinf ** 4 + d * d)
/** Energy relation at the parking orbit: v_d² = (v∞)² + v_esc(r_d)². */
export const departureSpeed = (mu: number, vinf: number, rd: number) => Math.sqrt(vinf * vinf + (2 * mu) / rd)
/** Insertion into an ellipse of semi-major axis a_i at the hyperbola periapsis: Δv = √(v∞² + 2μ/r_p) − √(2μ/r_p − μ/a_i). */
export const insertionDv = (mu: number, vinf: number, rp: number, ai: number) => Math.sqrt(vinf * vinf + (2 * mu) / rp) - Math.sqrt((2 * mu) / rp - mu / ai)

// ---------- 4.3 Slingshot (2-D vectors, course symbols) ----------
/** A planar gravity assist. V_P = planet's heliocentric speed, V₂ = spacecraft's heliocentric speed on entering the SOI, γ = angle between
 *  the two velocity vectors, δ = turn of the planetocentric velocity (|v₃| = |v₄|). `side` +1 rotates counter-clockwise, −1 clockwise;
 *  the sign that passes "behind" the planet speeds the craft up. Returns V₅ and its speed. */
export function slingshot(VP: number, V2: number, gamma: number, delta: number, side: 1 | -1) {
  const P: [number, number] = [VP, 0], S: [number, number] = [V2 * Math.cos(gamma), V2 * Math.sin(gamma)]
  const v3: [number, number] = [S[0] - P[0], S[1] - P[1]]
  const c = Math.cos(side * delta), s = Math.sin(side * delta)
  const v4: [number, number] = [c * v3[0] - s * v3[1], s * v3[0] + c * v3[1]]
  const V5: [number, number] = [P[0] + v4[0], P[1] + v4[1]]
  const v5 = Math.hypot(V5[0], V5[1])
  return { v3: Math.hypot(v3[0], v3[1]), V5: v5, gain: v5 - V2, headingChange: Math.atan2(V5[1], V5[0]) - Math.atan2(S[1], S[0]) }
}
