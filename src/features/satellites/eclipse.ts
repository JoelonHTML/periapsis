// Beta angle and eclipse (Earth shadow) for a planned orbit. Cylindrical shadow model: the umbra is a cylinder of radius R_E
// along the anti-Sun axis (no penumbra, no atmosphere refraction); good to a few seconds on LEO eclipse durations.
// The orbit orientation follows the app's plan (RAAN and argument of perigee drift with the J2 secular rates).
import { DAY, MU_EARTH, RE, dot, keplerE, norm, perifocalBasis, sunGeo, type Vec } from '../../lib/astro.ts'

export interface PlanOrbit {
  a: number; e: number; iT: number; O0: number; w0: number; t0: number
  rates: { dO: number; dw: number }
}

/** Orbit orientation (perifocal basis) at time t (s since J2000). */
const basisAt = (p: PlanOrbit, t: number) => perifocalBasis(p.iT, p.O0 + p.rates.dO * (t - p.t0), p.w0 + p.rates.dw * (t - p.t0))
const sunUnit = (t: number): Vec => { const s = sunGeo(t), n = norm(s); return [s[0] / n, s[1] / n, s[2] / n] }

/** Beta angle (rad): angle between the Sun direction and the orbit plane, positive toward the orbit normal. */
export function betaAngle(p: PlanOrbit, t: number): number {
  return Math.asin(Math.max(-1, Math.min(1, dot(basisAt(p, t).W, sunUnit(t)))))
}

/** True when a point is inside the cylindrical shadow. */
export function inShadow(r: Vec, s: Vec): boolean {
  const along = dot(r, s)
  if (along >= 0) return false
  return Math.hypot(r[0] - along * s[0], r[1] - along * s[1], r[2] - along * s[2]) < RE
}

/** Eclipse during one orbit at time t: fraction of the period in shadow and the longest single eclipse (s). */
export function eclipseAt(p: PlanOrbit, t: number, samples = 360) {
  const { P, Q } = basisAt(p, t), s = sunUnit(t), b = Math.sqrt(1 - p.e * p.e)
  const period = 2 * Math.PI * Math.sqrt(p.a ** 3 / MU_EARTH)
  const shadowAt = (M: number) => {
    const E = keplerE(M, p.e), x = p.a * (Math.cos(E) - p.e), y = p.a * b * Math.sin(E)
    return inShadow([P[0] * x + Q[0] * y, P[1] * x + Q[1] * y, P[2] * x + Q[2] * y], s)
  }
  const edge = (m0: number, m1: number) => { // bisection of the shadow boundary in mean anomaly
    const s0 = shadowAt(m0)
    for (let i = 0; i < 30; i++) { const m = (m0 + m1) / 2; if (shadowAt(m) === s0) m0 = m; else m1 = m }
    return (m0 + m1) / 2
  }
  const TWO_PI = 2 * Math.PI
  const state0 = shadowAt(0)
  const trans: { m: number; into: boolean }[] = []
  let state = state0
  for (let k = 1; k <= samples; k++) {
    const m0 = ((k - 1) / samples) * TWO_PI, m1 = (k / samples) * TWO_PI, sn = shadowAt(k === samples ? 0 : m1)
    if (sn !== state) { trans.push({ m: edge(m0, m1), into: sn }); state = sn }
  }
  const arcs: [number, number][] = [] // [enter, exit] in mean anomaly; the last may wrap past 2π
  if (!trans.length) { if (state0) arcs.push([0, TWO_PI]) }
  else trans.forEach((tr, i) => { if (tr.into) { const nx = trans[(i + 1) % trans.length]; arcs.push([tr.m, nx.m + (i + 1 >= trans.length ? TWO_PI : 0)]) } })
  const fracM = arcs.reduce((a, [x, y]) => a + (y - x), 0) / TWO_PI
  // time in shadow of an arc (Kepler's equation: dt = ΔM / n, exact in mean anomaly)
  const maxDur = arcs.reduce((a, [x, y]) => Math.max(a, ((y - x) / TWO_PI) * period), 0)
  return { fraction: Math.min(1, fracM), maxDur, period }
}

/** Beta, eclipse fraction and longest eclipse for `days` daily samples starting at t0. */
export function yearSeries(p: PlanOrbit, tStart: number, days = 366) {
  const beta: number[] = [], frac: number[] = [], dur: number[] = []
  for (let d = 0; d < days; d++) {
    const t = tStart + d * DAY
    beta.push(betaAngle(p, t))
    const ec = eclipseAt(p, t, 180)
    frac.push(ec.fraction); dur.push(ec.maxDur)
  }
  return { beta, frac, dur }
}
