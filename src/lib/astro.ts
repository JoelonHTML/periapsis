// Astrodynamics core. Units: km, s, km/s, rad (unless named *Deg).
export type Vec = [number, number, number]

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const norm = (a: Vec) => Math.hypot(a[0], a[1], a[2])
export const unit = (a: Vec): Vec => mul(a, 1 / (norm(a) || 1))
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export const DEG = Math.PI / 180
export const AU = 149597870.7
export const DAY = 86400
export const YEAR = 365.25 * DAY
export const G0 = 9.80665e-3 // km/s²
export const MU_SUN = 1.32712440018e11
export const R_SUN = 695700
export const MU_EARTH = 398600.4418
export const RE = 6378.137
export const J2 = 1.08262668e-3
export const OMEGA_EARTH = 7.2921159e-5
export const MU_MOON = 4902.800066
export const R_MOON = 1737.4
export const OBLIQUITY = 23.439281 * DEG
export const J2000_MS = Date.UTC(2000, 0, 1, 12)

export const toJ2000 = (ms: number) => (ms - J2000_MS) / 1000
export const toMs = (t: number) => J2000_MS + t * 1000
export const fmtDate = (t: number) => new Date(toMs(t)).toISOString().slice(0, 10)
export const fmtDateTime = (t: number) => new Date(toMs(t)).toISOString().slice(0, 16).replace('T', ' ')
export function fmtDuration(s: number) {
  const d = Math.abs(s) / DAY
  if (d >= 365.25) return `${Math.floor(d / 365.25)} j ${Math.round(d % 365.25)} d`
  if (d >= 1) return `${d.toFixed(1)} d`
  return `${(Math.abs(s) / 3600).toFixed(1)} u`
}

// ---------- Bodies: JPL approximate Keplerian elements (Standish, J2000 ecliptic, 1800–2050) ----------
// el = [a AU, e, i deg, L deg, ϖ deg, Ω deg], rate = same per Julian century.
export type BodyId = 'mercury' | 'venus' | 'earth' | 'mars' | 'ceres' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'
export interface Body {
  id: BodyId
  name: string
  mu: number
  radius: number
  color: string
  safe: number // minimum flyby radius / body radius
  el: number[]
  rate: number[]
}

export const BODIES: Record<BodyId, Body> = {
  mercury: { id: 'mercury', name: 'Mercurius', mu: 22031.8, radius: 2439.7, color: '#a8a29e', safe: 1.05,
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  venus: { id: 'venus', name: 'Venus', mu: 324858.6, radius: 6051.8, color: '#e7c98f', safe: 1.05,
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  earth: { id: 'earth', name: 'Aarde', mu: MU_EARTH, radius: 6378.137, color: '#3b82f6', safe: 1.05,
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0] },
  mars: { id: 'mars', name: 'Mars', mu: 42828.4, radius: 3389.5, color: '#dc6b3f', safe: 1.06,
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  // Ceres: approximate osculating elements (mean longitude fitted to the 2023-03-21 opposition).
  ceres: { id: 'ceres', name: 'Ceres', mu: 62.6, radius: 469.7, color: '#c7c2b8', safe: 1.2,
    el: [2.767, 0.0789, 10.59, 160.15, 153.55, 80.25],
    rate: [0, 0, 0, 7821.5, 0, 0] },
  jupiter: { id: 'jupiter', name: 'Jupiter', mu: 126686531.9, radius: 69911, color: '#d9b38c', safe: 1.2,
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  saturn: { id: 'saturn', name: 'Saturnus', mu: 37931206.2, radius: 58232, color: '#e8d3a0', safe: 2.4,
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  uranus: { id: 'uranus', name: 'Uranus', mu: 5793951.3, radius: 25362, color: '#9ee7e7', safe: 1.1,
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  neptune: { id: 'neptune', name: 'Neptunus', mu: 6835099.5, radius: 24622, color: '#5b7cf0', safe: 1.05,
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
  // Pluto: Standish's table 2a (valid 1800-2050), heliocentric (not barycentric) — fine for a ~39.5 AU target.
  pluto: { id: 'pluto', name: 'Pluto', mu: 869.6, radius: 1188.3, color: '#c9b79c', safe: 1.05,
    el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [0.00051797, 0.00001663, 0.00004818, 145.20780515, -0.04062942, -0.01183482] },
}
export const BODY_IDS = Object.keys(BODIES) as BodyId[]

// ---------- Kepler ----------
export function keplerE(M: number, e: number) {
  M = M % (2 * Math.PI)
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

export function perifocalBasis(i: number, O: number, w: number) {
  const cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), si = Math.sin(i)
  const P: Vec = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si]
  const Q: Vec = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si]
  const W: Vec = [sO * si, -cO * si, ci]
  return { P, Q, W }
}

export function elementsToState(a: number, e: number, i: number, O: number, w: number, M: number, mu: number) {
  const E = keplerE(M, e)
  const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - e * e)
  const Edot = Math.sqrt(mu / (a * a * a)) / (1 - e * cE)
  const { P, Q } = perifocalBasis(i, O, w)
  const x = a * (cE - e), y = a * b * sE
  const vx = -a * sE * Edot, vy = a * b * cE * Edot
  return { r: add(mul(P, x), mul(Q, y)), v: add(mul(P, vx), mul(Q, vy)) }
}

export function bodyElements(id: BodyId, t: number) {
  const b = BODIES[id]
  const T = t / (36525 * DAY)
  const [a, e, I, L, wbar, O] = b.el.map((x, k) => x + b.rate[k] * T)
  return { a: a * AU, e, i: I * DEG, O: O * DEG, w: (wbar - O) * DEG, M: (L - wbar) * DEG }
}

export function bodyState(id: BodyId, t: number) {
  const k = bodyElements(id, t)
  return elementsToState(k.a, k.e, k.i, k.O, k.w, k.M, MU_SUN)
}

export function ellipsePoints(a: number, e: number, i: number, O: number, w: number, n = 256): Vec[] {
  const { P, Q } = perifocalBasis(i, O, w)
  const b = a * Math.sqrt(1 - e * e)
  const pts: Vec[] = []
  for (let k = 0; k <= n; k++) {
    const E = (2 * Math.PI * k) / n
    pts.push(add(mul(P, a * (Math.cos(E) - e)), mul(Q, b * Math.sin(E))))
  }
  return pts
}

export const visViva = (mu: number, r: number, a: number) => Math.sqrt(mu * (2 / r - 1 / a))

export function hohmann(r1: number, r2: number, mu: number) {
  const a = (r1 + r2) / 2
  const dv1 = Math.abs(visViva(mu, r1, a) - Math.sqrt(mu / r1))
  const dv2 = Math.abs(Math.sqrt(mu / r2) - visViva(mu, r2, a))
  return { a, dv1, dv2, tof: Math.PI * Math.sqrt(a ** 3 / mu) }
}

// ---------- Universal variables: Stumpff, Lambert (Curtis alg. 5.2, safeguarded Newton), propagation ----------
function stumpC(z: number) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z
  return 0.5 - z / 24
}
function stumpS(z: number) {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s) }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s) }
  return 1 / 6 - z / 120
}

/** Single-revolution prograde Lambert solution, or null if it does not converge. */
export function lambert(r1: Vec, r2: Vec, tof: number, mu: number): { v1: Vec; v2: Vec } | null {
  const R1 = norm(r1), R2 = norm(r2)
  const cosd = clamp(dot(r1, r2) / (R1 * R2), -1, 1)
  let dnu = Math.acos(cosd)
  if (cross(r1, r2)[2] < 0) dnu = 2 * Math.PI - dnu
  const A = Math.sin(dnu) * Math.sqrt((R1 * R2) / (1 - cosd))
  if (!isFinite(A) || Math.abs(A) < 1e-9) return null
  const sqmu = Math.sqrt(mu)
  const yOf = (z: number) => R1 + R2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z))
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI, z = 0
  for (let it = 0; it < 100; it++) {
    const C = stumpC(z), S = stumpS(z), y = yOf(z)
    if (y <= 0) { lo = z; z = (lo + hi) / 2; continue }
    const t = (Math.pow(y / C, 1.5) * S + A * Math.sqrt(y)) / sqmu
    if (Math.abs(t - tof) < 1e-10 * tof) break
    if (t < tof) lo = z; else hi = z
    const dF = Math.abs(z) > 1e-6
      ? Math.pow(y / C, 1.5) * ((1 / (2 * z)) * (C - (1.5 * S) / C) + (0.75 * S * S) / C) +
        (A / 8) * ((3 * S * Math.sqrt(y)) / C + A * Math.sqrt(C / y))
      : (Math.SQRT2 / 40) * Math.pow(y, 1.5) + (A / 8) * (Math.sqrt(y) + A * Math.sqrt(1 / (2 * y)))
    let zn = z - ((t - tof) * sqmu) / dF
    if (!(zn > lo && zn < hi)) zn = (lo + hi) / 2
    if (Math.abs(zn - z) < 1e-12) break
    z = zn
  }
  const y = yOf(z)
  if (!(y > 0)) return null
  const f = 1 - y / R1, g = A * Math.sqrt(y / mu), gdot = 1 - y / R2
  const v1 = mul(sub(r2, mul(r1, f)), 1 / g)
  const v2 = mul(sub(mul(r2, gdot), r1), 1 / g)
  if (!isFinite(v1[0]) || !isFinite(v2[0])) return null
  return { v1, v2 }
}

/** Two-body propagation with the universal anomaly (Curtis alg. 3.3/3.4). */
export function propagate(r0: Vec, v0: Vec, dt: number, mu: number) {
  const R0 = norm(r0), vr0 = dot(r0, v0) / R0, sqmu = Math.sqrt(mu)
  const alpha = 2 / R0 - dot(v0, v0) / mu
  let chi = sqmu * Math.abs(alpha) * dt
  for (let k = 0; k < 60; k++) {
    const z = alpha * chi * chi, C = stumpC(z), S = stumpS(z)
    const F = ((R0 * vr0) / sqmu) * chi * chi * C + (1 - alpha * R0) * chi ** 3 * S + R0 * chi - sqmu * dt
    const dF = ((R0 * vr0) / sqmu) * chi * (1 - z * S) + (1 - alpha * R0) * chi * chi * C + R0
    const d = F / dF
    chi -= d
    if (Math.abs(d) < 1e-9 * Math.max(1, Math.abs(chi))) break
  }
  const z = alpha * chi * chi, C = stumpC(z), S = stumpS(z)
  const f = 1 - (chi * chi * C) / R0, g = dt - (chi ** 3 * S) / sqmu
  const r = add(mul(r0, f), mul(v0, g)), R = norm(r)
  const fdot = (sqmu / (R * R0)) * (z * chi * S - chi), gdot = 1 - (chi * chi * C) / R
  return { r, v: add(mul(r0, fdot), mul(v0, gdot)) }
}

// ---------- Patched conics ----------
/** Δv from a circular parking orbit of radius r to a hyperbola with excess speed vinf. */
export const departDv = (vinf: number, r: number, mu = MU_EARTH) => Math.sqrt(vinf * vinf + (2 * mu) / r) - Math.sqrt(mu / r)
/** Capture Δv at periapsis rp into an orbit of eccentricity e (0 = circular). */
export const captureDv = (vinf: number, rp: number, mu: number, e: number) =>
  Math.sqrt(vinf * vinf + (2 * mu) / rp) - Math.sqrt((mu * (1 + e)) / rp)

/** Powered-flyby Δv. Free turn up to what the planet can bend at periapsis rpMin; any speed change (v∞ in ≠ v∞ out) or turn beyond
 *  that is paid by ONE burn at periapsis, at the highest periapsis that still gives the required total turn, so the Oberth effect is
 *  included (departDv/captureDv do the same). If even rpMin cannot bend enough, the remainder is a burn at infinity (PyKEP fb_vel,
 *  an upper bound). */
export function flybyDv(vIn: Vec, vOut: Vec, mu: number, rpMin: number) {
  const a2 = dot(vIn, vIn), b2 = dot(vOut, vOut), vi = Math.sqrt(a2), vo = Math.sqrt(b2)
  const turn = Math.acos(clamp(dot(vIn, vOut) / (vi * vo), -1, 1))
  const half = (v: number, rp: number) => Math.asin(1 / (1 + (rp * v * v) / mu)) // asymptote half-turn of one hyperbola branch
  const total = (rp: number) => half(vi, rp) + half(vo, rp)
  const turnMax = total(rpMin)
  const excess = turn - turnMax
  let dv: number
  if (excess <= 0) {
    // largest periapsis radius that still turns by `turn` (total() falls as rp grows)
    let lo = rpMin, hi = rpMin * 1e4
    if (total(hi) >= turn) lo = hi
    else for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (total(m) >= turn) lo = m; else hi = m }
    const vp = (v: number) => Math.sqrt(v * v + (2 * mu) / lo)
    dv = Math.abs(vp(vo) - vp(vi))
  } else {
    dv = Math.sqrt(b2 + a2 - 2 * vi * vo * Math.cos(excess))
  }
  return { dv, turn, turnMax }
}

/** Planet-centred hyperbola used to draw a flyby (units km, seconds from periapsis). */
export function flybyGeometry(vIn: Vec, vOut: Vec, mu: number, rpMin: number) {
  const vinf = (norm(vIn) + norm(vOut)) / 2
  const turn = Math.acos(clamp(dot(unit(vIn), unit(vOut)), -1, 1))
  const turnMax = 2 * Math.asin(1 / (1 + (rpMin * vinf * vinf) / mu))
  const used = Math.max(1e-4, Math.min(turn, turnMax))
  const rp = Math.max(rpMin, (mu / (vinf * vinf)) * (1 / Math.sin(used / 2) - 1))
  const a = mu / (vinf * vinf), e = 1 + rp / a
  let p = sub(unit(vIn), unit(vOut))
  if (norm(p) < 1e-6) p = unit(cross(vIn, [0, 0, 1]))
  const pHat = unit(p), qHat = unit(add(unit(vIn), unit(vOut)))
  const n = Math.sqrt(mu / a ** 3)
  const at = (tRel: number): Vec => {
    const M = n * tRel
    let F = Math.asinh(M / e)
    for (let k = 0; k < 50; k++) {
      const d = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1)
      F -= d
      if (Math.abs(d) < 1e-12) break
    }
    const r = a * (e * Math.cosh(F) - 1)
    const nu = 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(F / 2))
    return add(mul(pHat, r * Math.cos(nu)), mul(qHat, r * Math.sin(nu)))
  }
  const timeAt = (r: number) => {
    const F = Math.acosh(Math.max(1, (r / a + 1) / e))
    return (e * Math.sinh(F) - F) / n
  }
  return { vinf, turn, turnMax, rp, a, e, pHat, qHat, at, timeAt, vp: Math.sqrt(vinf * vinf + (2 * mu) / rp) }
}

// ---------- Lagrange points (circular restricted three-body problem) ----------
function newton(f: (x: number) => number, df: (x: number) => number, x: number) {
  for (let k = 0; k < 60; k++) {
    const d = f(x) / df(x)
    x -= d
    if (Math.abs(d) < 1e-15) break
  }
  return x
}
/** γ1, γ2: distance of L1/L2 from the smaller body; γ3: distance of L3 from the larger body (units of D). */
export function collinearGammas(m: number) {
  const g0 = Math.cbrt(m / 3)
  const g1 = newton(
    (g) => g ** 5 - (3 - m) * g ** 4 + (3 - 2 * m) * g ** 3 - m * g * g + 2 * m * g - m,
    (g) => 5 * g ** 4 - 4 * (3 - m) * g ** 3 + 3 * (3 - 2 * m) * g * g - 2 * m * g + 2 * m, g0)
  const g2 = newton(
    (g) => g ** 5 + (3 - m) * g ** 4 + (3 - 2 * m) * g ** 3 - m * g * g - 2 * m * g - m,
    (g) => 5 * g ** 4 + 4 * (3 - m) * g ** 3 + 3 * (3 - 2 * m) * g * g - 2 * m * g - 2 * m, g0)
  const g3 = newton(
    (g) => g ** 5 + (2 + m) * g ** 4 + (1 + 2 * m) * g ** 3 - (1 - m) * g * g - 2 * (1 - m) * g - (1 - m),
    (g) => 5 * g ** 4 + 4 * (2 + m) * g ** 3 + 3 * (1 + 2 * m) * g * g - 2 * (1 - m) * g - 2 * (1 - m), 1 - (7 * m) / 12)
  return { g1, g2, g3 }
}
/** L1..L5 relative to the larger body, given the smaller body's relative position & velocity. */
export function lagrangePoints(r: Vec, v: Vec, massRatio: number): Vec[] {
  const D = norm(r), u = unit(r), t = unit(cross(cross(r, v), r))
  const { g1, g2, g3 } = collinearGammas(massRatio)
  const s60 = Math.sqrt(3) / 2
  return [
    mul(u, D * (1 - g1)),
    mul(u, D * (1 + g2)),
    mul(u, -D * g3),
    add(mul(u, D / 2), mul(t, D * s60)),
    add(mul(u, D / 2), mul(t, -D * s60)),
  ]
}
export const MASS_RATIO_EM = MU_MOON / (MU_EARTH + MU_MOON)
export const MASS_RATIO_SE = (MU_EARTH + MU_MOON) / (MU_SUN + MU_EARTH + MU_MOON)

// ---------- Moon (Meeus low-precision series, one term per series, no evection/variation: up to ~1–2°) & frames ----------
export function moonGeoEcliptic(t: number): Vec {
  const d = t / DAY
  const L = (218.316 + 13.176396 * d) * DEG
  const M = (134.963 + 13.064993 * d) * DEG
  const F = (93.272 + 13.22935 * d) * DEG
  const lam = L + 6.289 * DEG * Math.sin(M)
  const beta = 5.128 * DEG * Math.sin(F)
  const r = 385001 - 20905 * Math.cos(M)
  return [r * Math.cos(beta) * Math.cos(lam), r * Math.cos(beta) * Math.sin(lam), r * Math.sin(beta)]
}
export const ecl2eq = (v: Vec): Vec => {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}
export const moonGeo = (t: number) => ecl2eq(moonGeoEcliptic(t))
export const moonGeoVel = (t: number) => mul(sub(moonGeo(t + 60), moonGeo(t - 60)), 1 / 120)
export const sunGeo = (t: number) => ecl2eq(mul(bodyState('earth', t).r, -1))
/** Greenwich mean sidereal time (rad). */
export const gmst = (t: number) => ((280.46061837 + 360.98564736629 * (t / DAY)) % 360) * DEG

// ---------- Atmosphere (Vallado exponential model, table 8-4) & drag ----------
const ATM: [number, number, number][] = [
  [0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382],
  [60, 3.206e-4, 7.714], [70, 8.77e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877],
  [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.07e-9, 22.523],
  [180, 5.464e-10, 29.74], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628],
  [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822],
  [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667], [800, 1.17e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268],
]
/** Density in kg/m³ at altitude h (km). */
export function density(h: number) {
  let row = ATM[0]
  for (const r of ATM) if (h >= r[0]) row = r
  return row[1] * Math.exp(-(h - row[0]) / row[2])
}
/** Orbit lifetime (s) of a circular orbit decaying to 100 km; B = Cd·A/m in m²/kg. Infinity if > 10 000 yr. */
export function decayLifetime(h0: number, B: number) {
  const muSI = MU_EARTH * 1e9
  let h = h0, t = 0
  while (h > 100) {
    const dh = Math.max(0.2, h * 0.002)
    const rate = density(h) * B * Math.sqrt(muSI * (RE + h) * 1000) // m/s
    t += (dh * 1000) / rate
    if (t > 1e4 * YEAR) return Infinity
    h -= dh
  }
  return t
}
/** Δv per year (m/s) to cancel drag on a circular orbit at h (km). */
export function dragMakeupPerYear(h: number, B: number) {
  const v = Math.sqrt(MU_EARTH / (RE + h)) * 1000
  return 0.5 * density(h) * B * v * v * YEAR
}

// ---------- J2 secular rates ----------
export function j2Rates(a: number, e: number, i: number) {
  const n = Math.sqrt(MU_EARTH / a ** 3), p = a * (1 - e * e)
  const k = 1.5 * n * J2 * (RE / p) ** 2
  const ssoRate = (2 * Math.PI) / (365.2422 * DAY)
  const cosSso = -ssoRate / k
  return {
    dO: -k * Math.cos(i),
    dw: (k / 2) * (5 * Math.cos(i) ** 2 - 1),
    ssoInc: Math.abs(cosSso) <= 1 ? Math.acos(cosSso) : NaN,
  }
}

// ---------- Rocket equation ----------
export const dvBudget = (dry: number, prop: number, isp: number) => isp * G0 * Math.log((dry + prop) / dry)
export const propellantFor = (m0: number, dv: number, isp: number) => m0 * (1 - Math.exp(-dv / (isp * G0)))

// ---------- Launch & Earth-orbit planning ----------
export interface Site { name: string; lat: number; lon: number }
export const SITES: Site[] = [
  { name: 'Kennedy Space Center (VS)', lat: 28.573, lon: -80.649 },
  { name: 'Vandenberg SFB (VS)', lat: 34.742, lon: -120.572 },
  { name: 'Starbase, Boca Chica (VS)', lat: 25.997, lon: -97.155 },
  { name: 'Kourou (Frans-Guyana)', lat: 5.236, lon: -52.775 },
  { name: 'Baikonoer (Kazachstan)', lat: 45.965, lon: 63.305 },
  { name: 'Plesetsk (Rusland)', lat: 62.925, lon: 40.577 },
  { name: 'Wenchang (China)', lat: 19.614, lon: 110.951 },
  { name: 'Sriharikota (India)', lat: 13.72, lon: 80.23 },
  { name: 'Tanegashima (Japan)', lat: 30.4, lon: 130.97 },
  { name: 'Mahia (Nieuw-Zeeland)', lat: -39.262, lon: 177.865 },
  { name: 'Andøya (Noorwegen)', lat: 69.294, lon: 16.021 },
]
/** Gravity + drag + steering losses during ascent — empirical, typically 1.5–2.0 km/s. */
export const ASCENT_LOSSES = 1.8

export interface OrbitTarget { rpAlt: number; raAlt: number; incDeg: number; parkAlt: number; wDeg: number | null }
export interface Burn { name: string; dv: number }

export function earthPlan(target: OrbitTarget, lat: number, lon: number, t0: number, m0: number, isp: number, cd: number, area: number) {
  const phi = Math.abs(lat) * DEG
  const iT = target.incDeg * DEG
  let iL = iT
  if (Math.cos(iT) > Math.cos(phi)) iL = phi
  else if (Math.cos(iT) < -Math.cos(phi)) iL = Math.PI - phi
  const sinAz = clamp(Math.cos(iL) / Math.cos(phi), -1, 1)
  const azimuth = Math.asin(sinAz)
  const vRot = OMEGA_EARTH * RE * Math.cos(phi)
  const rotGain = vRot * sinAz
  const rp = RE + Math.min(target.rpAlt, target.raAlt), ra = RE + Math.max(target.rpAlt, target.raAlt)
  const rPark = RE + Math.min(target.parkAlt, target.rpAlt)
  const vPark = Math.sqrt(MU_EARTH / rPark)
  const ascent = vPark + ASCENT_LOSSES - rotGain
  const dI = Math.abs(iT - iL)
  const burns: Burn[] = []
  let transferTime = 0
  const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp)
  if (Math.abs(ra - rPark) < 1 && Math.abs(rp - rPark) < 1) {
    if (dI > 1e-6) burns.push({ name: 'Vlakverandering', dv: 2 * vPark * Math.sin(dI / 2) })
  } else {
    const aT = (rPark + ra) / 2
    const vT1 = visViva(MU_EARTH, rPark, aT), vT2 = visViva(MU_EARTH, ra, aT), vTa = visViva(MU_EARTH, ra, a)
    burns.push({ name: 'Burn 1 — perigeum: apogeum verhogen', dv: vT1 - vPark })
    const dv2 = Math.sqrt(vT2 * vT2 + vTa * vTa - 2 * vT2 * vTa * Math.cos(dI))
    if (dv2 > 1e-6) burns.push({ name: `Burn 2 — apogeum: perigeum verhogen${dI > 1e-6 ? ' + vlakverandering' : ''}`, dv: dv2 })
    transferTime = Math.PI * Math.sqrt(aT ** 3 / MU_EARTH)
  }
  const inSpace = burns.reduce((s, b) => s + b.dv, 0)
  const prop = propellantFor(m0, inSpace, isp)
  const mFinal = m0 - prop
  const B = (cd * area) / mFinal
  const rates = j2Rates(a, e, iT)
  // Orbit orientation at t0: the launch plane passes over the site at t0.
  const siteRA = gmst(t0) + lon * DEG
  const u0 = Math.abs(Math.sin(iL)) < 1e-9 ? 0 : Math.asin(clamp(Math.sin(lat * DEG) / Math.sin(iL), -1, 1))
  const O0 = Math.abs(Math.sin(iL)) < 1e-9 ? 0 : siteRA - Math.atan2(Math.cos(iL) * Math.sin(u0), Math.cos(u0))
  const uSite = Math.abs(Math.sin(iL)) < 1e-9 ? siteRA : u0
  return {
    iL, iT, dI, azimuth, vRot, rotGain, rPark, vPark, ascent, burns, inSpace, total: ascent + inSpace,
    prop, mFinal, B, rp, ra, a, e, period: 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH),
    vPer: visViva(MU_EARTH, rp, a), vApo: visViva(MU_EARTH, ra, a), transferTime, rates,
    lifetime: decayLifetime(target.rpAlt, B), makeup: dragMakeupPerYear(target.rpAlt, B),
    O0, w0: target.wDeg === null ? uSite : target.wDeg * DEG, uPark: uSite, t0,
  }
}
export type EarthPlan = ReturnType<typeof earthPlan>

// ---------- Earth → Moon (patched conic Hohmann: TLI + LOI) ----------
export function moonPlan(tDep: number, parkAlt: number, loiAlt: number) {
  const rPark = RE + parkAlt
  const tArrGuess = tDep + 5 * DAY
  const rMoon = norm(moonGeo(tArrGuess))
  const h = hohmann(rPark, rMoon, MU_EARTH)
  const tArr = tDep + h.tof
  const vApo = visViva(MU_EARTH, rMoon, h.a)
  const vMoon = norm(moonGeoVel(tArr))
  const vinf = Math.abs(vMoon - vApo)
  const loi = captureDv(vinf, R_MOON + loiAlt, MU_MOON, 0)
  return { tDep, tArr, rPark, rMoon, a: h.a, tli: h.dv1, vApo, vMoon, vinf, loi, total: h.dv1 + loi }
}
export type MoonPlan = ReturnType<typeof moonPlan>
