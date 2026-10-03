// Numerical orbit propagator for Earth orbits (Cowell's method): the full acceleration is integrated directly in the
// Earth-centred equatorial frame (z = rotation axis; the equator/equinox of the app's ephemeris, treated as inertial).
//
// Integrator: Dormand–Prince 5(4) (DOPRI5) with adaptive step, per-component error control, steps clipped to the sampling grid.
// Forces (each switchable):
//   central   point-mass gravity  -mu r / r^3
//   j2,j3,j4  zonal harmonics, gradient of U_n = -mu J_n Re^n P_n(sin(lat)) / r^(n+1)  (EGM96/EGM2008 values, see below)
//   drag      -1/2 rho B |v_rel| v_rel with B = Cd A / m and v_rel = v - omega_earth x r (atmosphere co-rotates with the Earth);
//             rho from atmo.ts (Vallado table scaled with F10.7: documented approximation)
//   srp       cannonball: a = P Cr (A/m) (AU/d)^2 * (r - r_sun)/|r - r_sun|, cylindrical Earth shadow (umbra only)
//   sun/moon  third-body: mu_3 [ (r3 - r)/|r3 - r|^3 - r3/|r3|^3 ], positions from astro.ts (low-precision ephemerides)
// Not modelled: tides, Earth albedo, relativity, geomagnetic activity, attitude-dependent area, Moon/Sun shadows other than Earth's umbra.
import {
  AU, DAY, DEG, J2, MU_EARTH, MU_MOON, MU_SUN, OMEGA_EARTH, RE, elementsToState, moonGeo, sunGeo, type Vec,
} from '../../lib/astro.ts'
import { densityF107 } from './atmo.ts'

/** Zonal harmonics (EGM96, un-normalised). J2 is the value already used by the app (astro.ts). */
export const J3 = -2.5327e-6
export const J4 = -1.6196e-6
export const FLATTENING = 1 / 298.257223563
/** Solar radiation pressure at 1 AU: solar constant 1361 W/m² / c. */
export const P_SRP = 1361 / 299792458 // N/m²

export interface Forces { central: boolean; j2: boolean; j3: boolean; j4: boolean; drag: boolean; srp: boolean; sun: boolean; moon: boolean }
export const ALL_FORCES: Forces = { central: true, j2: true, j3: true, j4: true, drag: true, srp: true, sun: true, moon: true }
export const NO_FORCES: Forces = { central: true, j2: false, j3: false, j4: false, drag: false, srp: false, sun: false, moon: false }
export interface CraftParams { cd: number; area: number; mass: number; cr: number; f107: number } // area m², mass kg

// ---------- Sun / Moon positions, cached on a 10-min grid with linear interpolation ----------
const GRID = 600
const sunCache = new Map<number, Vec>(), moonCache = new Map<number, Vec>()
function interp(cache: Map<number, Vec>, fn: (t: number) => Vec, t: number): Vec {
  const k = Math.floor(t / GRID), w = t / GRID - k
  let a = cache.get(k), b = cache.get(k + 1)
  if (!a) { a = fn(k * GRID); cache.set(k, a) }
  if (!b) { b = fn((k + 1) * GRID); cache.set(k + 1, b) }
  if (cache.size > 20000) cache.clear()
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]
}
export const sunAt = (t: number) => interp(sunCache, sunGeo, t)
export const moonAt = (t: number) => interp(moonCache, moonGeo, t)

// ---------- accelerations (km/s²) ----------
const LEG: [(s: number) => number, (s: number) => number][] = [
  [(s) => (3 * s * s - 1) / 2, (s) => 3 * s], // n = 2
  [(s) => (5 * s ** 3 - 3 * s) / 2, (s) => (15 * s * s - 3) / 2], // n = 3
  [(s) => (35 * s ** 4 - 30 * s * s + 3) / 8, (s) => (140 * s ** 3 - 60 * s) / 8], // n = 4
]
/** Acceleration of the zonal term J_n: gradient of U_n(r, s = z/r). */
function zonal(n: 2 | 3 | 4, Jn: number, x: number, y: number, z: number, out: number[]) {
  const r2 = x * x + y * y + z * z, r = Math.sqrt(r2), s = z / r
  const [P, dP] = LEG[n - 2]
  const k = MU_EARTH * Jn * RE ** n
  const Ur = ((n + 1) * k * P(s)) / r ** (n + 2)
  const Us = (-k * dP(s)) / r ** (n + 1)
  const c = Ur / r - (Us * z) / (r2 * r) // radial part + (ds/dx = -z x / r^3)
  out[0] += c * x
  out[1] += c * y
  out[2] += c * z + Us / r // ds/dz = 1/r - z²/r³; the -z²/r³ part is already inside c*z
}
/** Geodetic-ish altitude (km) above the Earth ellipsoid (spherical latitude, first order in flattening). */
export function altitudeOf(x: number, y: number, z: number) {
  const r = Math.sqrt(x * x + y * y + z * z), s = z / r
  return r - RE * (1 - FLATTENING * s * s)
}

/** Total acceleration at epoch-time t (s since J2000) for state (x..z, vx..vz). Adds into `out` (zeroed first). */
export function accel(t: number, y: ArrayLike<number>, F: Forces, p: CraftParams, out: number[]) {
  const x = y[0], yy = y[1], z = y[2]
  out[0] = out[1] = out[2] = 0
  const r2 = x * x + yy * yy + z * z, r = Math.sqrt(r2)
  if (F.central) { const k = -MU_EARTH / (r2 * r); out[0] = k * x; out[1] = k * yy; out[2] = k * z }
  if (F.j2) zonal(2, J2, x, yy, z, out)
  if (F.j3) zonal(3, J3, x, yy, z, out)
  if (F.j4) zonal(4, J4, x, yy, z, out)
  if (F.drag) {
    const vx = y[3] + OMEGA_EARTH * yy, vy = y[4] - OMEGA_EARTH * x, vz = y[5] // v - omega x r
    const vr = Math.sqrt(vx * vx + vy * vy + vz * vz)
    const rho = densityF107(altitudeOf(x, yy, z), p.f107) // kg/m³
    const k = -0.5 * rho * ((p.cd * p.area) / p.mass) * vr * 1000 // (m²/kg · kg/m³ · km/s) → km/s² : v² in m²/s² = 1e6 v²; /1000 for km
    out[0] += k * vx; out[1] += k * vy; out[2] += k * vz
  }
  if (F.srp) {
    const rs = sunAt(t), dx = x - rs[0], dy = yy - rs[1], dz = z - rs[2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), rsn = Math.hypot(rs[0], rs[1], rs[2])
    const along = (x * rs[0] + yy * rs[1] + z * rs[2]) / rsn // component of r towards the Sun
    const perp2 = r2 - along * along
    const inShadow = along < 0 && perp2 < RE * RE
    if (!inShadow) {
      const k = ((P_SRP * p.cr * p.area) / p.mass / 1000) * (AU / d) ** 2 / d // N/m² · m²/kg = m/s² → km/s²
      out[0] += k * dx; out[1] += k * dy; out[2] += k * dz
    }
  }
  if (F.sun) third(MU_SUN, sunAt(t), x, yy, z, out)
  if (F.moon) third(MU_MOON, moonAt(t), x, yy, z, out)
}
function third(mu: number, b: Vec, x: number, y: number, z: number, out: number[]) {
  const dx = b[0] - x, dy = b[1] - y, dz = b[2] - z
  const d3 = Math.hypot(dx, dy, dz) ** 3, b3 = Math.hypot(b[0], b[1], b[2]) ** 3
  out[0] += mu * (dx / d3 - b[0] / b3); out[1] += mu * (dy / d3 - b[1] / b3); out[2] += mu * (dz / d3 - b[2] / b3)
}

// ---------- osculating elements ----------
export interface Elements { a: number; e: number; i: number; O: number; rp: number; ra: number; energy: number }
export function elementsOf(y: ArrayLike<number>): Elements {
  const [x, yy, z, vx, vy, vz] = [y[0], y[1], y[2], y[3], y[4], y[5]]
  const r = Math.sqrt(x * x + yy * yy + z * z), v2 = vx * vx + vy * vy + vz * vz
  const hx = yy * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - yy * vx, h = Math.hypot(hx, hy, hz)
  const energy = v2 / 2 - MU_EARTH / r, a = -MU_EARTH / (2 * energy)
  const rv = x * vx + yy * vy + z * vz
  const ex = ((v2 - MU_EARTH / r) * x - rv * vx) / MU_EARTH, ey = ((v2 - MU_EARTH / r) * yy - rv * vy) / MU_EARTH, ez = ((v2 - MU_EARTH / r) * z - rv * vz) / MU_EARTH
  const e = Math.hypot(ex, ey, ez)
  return { a, e, i: Math.acos(Math.max(-1, Math.min(1, hz / h))), O: Math.atan2(hx, -hy), rp: a * (1 - e), ra: a * (1 + e), energy }
}

// ---------- DOPRI5 ----------
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
const A = [
  [], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
]
const B5 = A[6] // 5th-order weights (FSAL)
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40] // B5 - B4

export interface SimOpts { span: number; sampleDt: number; rtol: number; hMax: number; decayAlt: number }
export interface Sample { t: number; rp: number; ra: number; inc: number; raan: number; a: number; e: number }
export interface Sim {
  t0: number; t: number; y: Float64Array; h: number; F: Forces; p: CraftParams; o: SimOpts
  samples: Sample[]; decayT: number | null; done: boolean; steps: number
  // internals
  k: Float64Array[]; tmp: Float64Array; acc: number[]; nextB: number
  oPrev: number; oUnw: number
  binW: number; binRp: number; binRa: number; binInc: number; binO: number; binA: number; binE: number
  prevEl: { rp: number; ra: number; inc: number; O: number; a: number; e: number }
}

export function defaultOpts(spanDays: number, orbitPeriod: number): SimOpts {
  return { span: spanDays * DAY, sampleDt: Math.min((spanDays * DAY) / 4, Math.max((spanDays * DAY) / 240, 2 * orbitPeriod)), rtol: 1e-9, hMax: Math.min(600, orbitPeriod / 8), decayAlt: 100 }
}

export function createSim(t0: number, r: Vec, v: Vec, F: Forces, p: CraftParams, o: SimOpts): Sim {
  const y = Float64Array.from([...r, ...v])
  const el = elementsOf(y)
  const sim: Sim = {
    t0, t: t0, y, h: Math.min(o.hMax, 10), F, p, o, samples: [], decayT: null, done: false, steps: 0,
    k: Array.from({ length: 7 }, () => new Float64Array(6)), tmp: new Float64Array(6), acc: [0, 0, 0], nextB: t0 + o.sampleDt,
    oPrev: el.O, oUnw: el.O,
    binW: 0, binRp: 0, binRa: 0, binInc: 0, binO: 0, binA: 0, binE: 0,
    prevEl: { rp: el.rp, ra: el.ra, inc: el.i, O: el.O, a: el.a, e: el.e },
  }
  if (altitudeOf(y[0], y[1], y[2]) < o.decayAlt) { sim.decayT = t0; sim.done = true }
  else sim.k[0] = deriv(sim, t0, y, sim.k[0])
  return sim
}
export function createSimFromElements(t0: number, a: number, e: number, i: number, O: number, w: number, M: number, F: Forces, p: CraftParams, o: SimOpts) {
  const s = elementsToState(a, e, i, O, w, M, MU_EARTH)
  return createSim(t0, s.r, s.v, F, p, o)
}

function deriv(sim: Sim, t: number, y: Float64Array, out: Float64Array) {
  accel(t, y, sim.F, sim.p, sim.acc)
  out[0] = y[3]; out[1] = y[4]; out[2] = y[5]; out[3] = sim.acc[0]; out[4] = sim.acc[1]; out[5] = sim.acc[2]
  return out
}

function accumulate(sim: Sim, y: Float64Array, dt: number) {
  const el = elementsOf(y)
  // unwrap the node
  let d = el.O - sim.oPrev
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI))
  sim.oUnw += d; sim.oPrev = el.O
  const w = dt, P = sim.prevEl
  // trapezoid in time between the previous and the new osculating values
  sim.binW += w
  sim.binRp += (w * (P.rp + el.rp)) / 2; sim.binRa += (w * (P.ra + el.ra)) / 2; sim.binInc += (w * (P.inc + el.i)) / 2
  sim.binA += (w * (P.a + el.a)) / 2; sim.binE += (w * (P.e + el.e)) / 2
  sim.binO += (w * (sim.prevEl.O + sim.oUnw)) / 2
  sim.prevEl = { rp: el.rp, ra: el.ra, inc: el.i, O: sim.oUnw, a: el.a, e: el.e }
}
/** Close the current averaging bin. A final bin shorter than half a sample interval is dropped (a partial-orbit average is biased by
 *  the short-period terms) unless `force` (re-entry: we want the curve to reach the end). */
function flush(sim: Sim, tEnd: number, force = false) {
  const w = sim.binW
  if (w <= 0) return
  if (!force && w < 0.5 * sim.o.sampleDt) { sim.binW = sim.binRp = sim.binRa = sim.binInc = sim.binO = sim.binA = sim.binE = 0; return }
  sim.samples.push({
    t: tEnd - w / 2 - sim.t0, rp: sim.binRp / w - RE, ra: sim.binRa / w - RE, inc: (sim.binInc / w) / DEG, raan: (sim.binO / w) / DEG,
    a: sim.binA / w, e: sim.binE / w,
  })
  sim.binW = sim.binRp = sim.binRa = sim.binInc = sim.binO = sim.binA = sim.binE = 0
}

/** Advance the simulation by at most `budgetMs` of wall time (so a UI can stay responsive). */
export function advance(sim: Sim, budgetMs: number) {
  const tStop = sim.t0 + sim.o.span, start = Date.now()
  const { k, tmp } = sim, y = sim.y
  const ynew = new Float64Array(6)
  let iter = 0
  while (!sim.done) {
    if ((++iter & 63) === 0 && Date.now() - start > budgetMs) return
    const tLimit = Math.min(tStop, sim.nextB)
    let h = Math.min(sim.h, sim.o.hMax, tLimit - sim.t)
    const clipped = h < sim.h && h < sim.o.hMax
    // stages 2..7
    for (let s = 1; s < 7; s++) {
      for (let j = 0; j < 6; j++) { let sum = 0; for (let m = 0; m < s; m++) sum += A[s][m] * k[m][j]; tmp[j] = y[j] + h * sum }
      deriv(sim, sim.t + C[s] * h, tmp, k[s])
    }
    // stage 7 was evaluated at the 5th-order solution (FSAL: A[6] == B5)
    for (let j = 0; j < 6; j++) { let sum = 0; for (let m = 0; m < 7; m++) sum += B5[m] ? B5[m] * k[m][j] : 0; ynew[j] = y[j] + h * sum }
    // error estimate
    let err = 0
    for (let j = 0; j < 6; j++) {
      let sum = 0; for (let m = 0; m < 7; m++) sum += E[m] * k[m][j]
      const sc = sim.o.rtol * Math.max(Math.abs(y[j]), Math.abs(ynew[j]), j < 3 ? 1 : 1e-3)
      err = Math.max(err, Math.abs(h * sum) / sc)
    }
    if (!Number.isFinite(err)) { sim.done = true; sim.decayT = sim.t - sim.t0; return }
    if (err <= 1 || h < 1e-6) {
      const altOld = altitudeOf(y[0], y[1], y[2]), altNew = altitudeOf(ynew[0], ynew[1], ynew[2])
      const tOld = sim.t
      sim.t += h; sim.steps++
      for (let j = 0; j < 6; j++) y[j] = ynew[j]
      // FSAL: stage 7 derivative is the next step's first stage
      const k0 = k[0]; k[0] = k[6]; k[6] = k0
      accumulate(sim, y, h)
      if (altNew < sim.o.decayAlt) {
        const f = altOld === altNew ? 1 : (altOld - sim.o.decayAlt) / (altOld - altNew)
        sim.decayT = tOld + h * Math.max(0, Math.min(1, f)) - sim.t0
        flush(sim, sim.t, true); sim.done = true; return
      }
      if (sim.t >= sim.nextB - 1e-6) { flush(sim, sim.t); sim.nextB += sim.o.sampleDt }
      if (sim.t >= tStop - 1e-6) { flush(sim, sim.t); sim.done = true; return }
    }
    const fac = Math.min(5, Math.max(0.2, 0.9 * err ** -0.2))
    if (err > 1 || !clipped) sim.h = h * fac
  }
}

/** Run to completion (tests, small cases). */
export function simulate(sim: Sim) { while (!sim.done) advance(sim, 1e9); return sim }

/** Linear-regression slope (per second) of a series (t in s, y in whatever unit). */
export function slope(ts: number[], ys: number[]) {
  const n = ts.length
  if (n < 2) return 0
  const mt = ts.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (ys[i] - my); den += (ts[i] - mt) ** 2 }
  return den > 0 ? num / den : 0
}
