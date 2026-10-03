// Multi-revolution Lambert solver (promoted from features/missions; used by recon.ts and the MGA optimiser).
// Lambert solver with N full revolutions (universal variables, Curtis ch. 5 extended to z > 4π²).
// The app's own `lambert` is single-revolution only; resonant legs (Earth–Earth in 2 years, Mercury–Mercury, ...) need N >= 1.
import { add, cross, dot, lambert, mul, norm, propagate, sub, type Vec } from './astro.ts'

const stumpC = (z: number) => (z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24)
const stumpS = (z: number) => {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s) }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s) }
  return 1 / 6 - z / 120
}

/** Zero-revolution arc by bisection on the universal variable (t(z) is monotonic): robust for the near-degenerate
 *  Earth–Earth style legs (r2 ≈ r1) where the app's Newton solver can stall. */
function lambert0(r1: Vec, r2: Vec, tof: number, mu: number): { v1: Vec; v2: Vec } | null {
  const R1 = norm(r1), R2 = norm(r2)
  const cosd = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)))
  let dnu = Math.acos(cosd)
  if (cross(r1, r2)[2] < 0) dnu = 2 * Math.PI - dnu
  const A = Math.sin(dnu) * Math.sqrt((R1 * R2) / (1 - cosd))
  if (!isFinite(A) || Math.abs(A) < 1e-9) return null
  const sq = Math.sqrt(mu)
  const yOf = (z: number) => R1 + R2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z))
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI
  for (let k = 0; k < 90; k++) {
    const z = (lo + hi) / 2, y = yOf(z)
    if (!(y > 0)) { lo = z; continue }
    const t = (Math.pow(y / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(y)) / sq
    if (t < tof) lo = z; else hi = z
  }
  const z = (lo + hi) / 2, y = yOf(z)
  if (!(y > 0)) return null
  const f = 1 - y / R1, g = A * Math.sqrt(y / mu), gdot = 1 - y / R2
  const v1 = mul(sub(r2, mul(r1, f)), 1 / g)
  const v2 = mul(sub(mul(r2, gdot), r1), 1 / g)
  return isFinite(v1[0]) && isFinite(v2[0]) ? { v1, v2 } : null
}

type Arc = { v1: Vec; v2: Vec }

/** Both revolution-count-N roots at once (they share the expensive minimum-time search): lo = lower-z root, hi = upper-z root. */
export function lambertRevBranches(r1: Vec, r2: Vec, tof: number, mu: number, revs: number): { lo: Arc | null; hi: Arc | null } {
  const none = { lo: null, hi: null }
  if (revs <= 0) return none
  const R1 = norm(r1), R2 = norm(r2)
  const cosd = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)))
  // Cheap necessary condition: every ellipse through both points has a >= s/2 (s = semi-perimeter of the triangle Sun-r1-r2),
  // and an N-rev arc lasts at least N periods.
  const c = norm(sub(r2, r1)), sp = (R1 + R2 + c) / 2
  if (tof < revs * 2 * Math.PI * Math.sqrt((sp / 2) ** 3 / mu)) return none
  let dnu = Math.acos(cosd)
  if (cross(r1, r2)[2] < 0) dnu = 2 * Math.PI - dnu
  const A = Math.sin(dnu) * Math.sqrt((R1 * R2) / (1 - cosd))
  if (!isFinite(A) || Math.abs(A) < 1e-9) return none
  const sq = Math.sqrt(mu)
  const yOf = (z: number) => R1 + R2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z))
  const tOf = (z: number) => {
    const C = stumpC(z), S = stumpS(z), y = yOf(z)
    if (!(C > 0) || !(y > 0)) return Infinity
    return (Math.pow(y / C, 1.5) * S + A * Math.sqrt(y)) / sq
  }
  const a = (2 * Math.PI * revs) ** 2, b = (2 * Math.PI * (revs + 1)) ** 2
  // locate the minimum time of flight inside this revolution window
  let zm = a, tm = Infinity
  const N = 48
  for (let i = 1; i < N; i++) { const z = a + ((b - a) * i) / N, t = tOf(z); if (t < tm) { tm = t; zm = z } }
  if (!isFinite(tm)) return none
  let l = zm - (b - a) / N, h = zm + (b - a) / N
  for (let k = 0; k < 50; k++) {
    const m1 = l + (h - l) / 3, m2 = h - (h - l) / 3
    if (tOf(m1) < tOf(m2)) h = m2; else l = m1
  }
  zm = (l + h) / 2; tm = tOf(zm)
  if (tof < tm) return none
  const branch = (which: 'lo' | 'hi'): Arc | null => {
    let lo: number, hi: number
    if (which === 'lo') { lo = a; hi = zm } else { lo = zm; hi = b }
    for (let k = 0; k < 80; k++) {
      const m = (lo + hi) / 2, tooLong = tOf(m) > tof
      // lo branch: t falls as z grows; hi branch: t rises with z
      if (which === 'lo') { if (tooLong) lo = m; else hi = m } else if (tooLong) hi = m; else lo = m
    }
    const z = (lo + hi) / 2, y = yOf(z)
    if (!(y > 0)) return null
    // the bisection must actually have found a root (near-degenerate r2 ≈ r1 cases can end on the bracket edge)
    if (!(Math.abs(tOf(z) - tof) <= 1e-7 * tof)) return null
    const f = 1 - y / R1, g = A * Math.sqrt(y / mu), gdot = 1 - y / R2
    const v1 = mul(sub(r2, mul(r1, f)), 1 / g)
    const v2 = mul(sub(mul(r2, gdot), r1), 1 / g)
    return isFinite(v1[0]) && isFinite(v2[0]) ? { v1, v2 } : null
  }
  return { lo: branch('lo'), hi: branch('hi') }
}

/** Prograde Lambert arc with `revs` extra revolutions. branch: 'lo' = lower-z root, 'hi' = upper-z root (revs >= 1 has two). */
export function lambertRev(r1: Vec, r2: Vec, tof: number, mu: number, revs = 0, branch: 'lo' | 'hi' = 'lo'): Arc | null {
  if (revs <= 0) return lambert0(r1, r2, tof, mu) ?? lambert(r1, r2, tof, mu)
  return lambertRevBranches(r1, r2, tof, mu, revs)[branch]
}

function solve3(J: number[][], b: Vec): Vec | null {
  const [a, bb, c] = J
  const det = a[0] * (bb[1] * c[2] - bb[2] * c[1]) - a[1] * (bb[0] * c[2] - bb[2] * c[0]) + a[2] * (bb[0] * c[1] - bb[1] * c[0])
  if (!isFinite(det) || Math.abs(det) < 1e-30) return null
  const d = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const col = (i: number) => J.map((row, r) => row.map((x, k) => (k === i ? b[r] : x)))
  return [d(col(0)) / det, d(col(1)) / det, d(col(2)) / det]
}

/** Lambert arc (see lambertRev) polished by differential correction: a few Newton steps on the departure velocity so that the
 *  two-body propagation lands on r2. Near-resonant legs (r2 ≈ r1) are ill-conditioned for the closed-form solver; the polish
 *  changes the velocity by mm/s but closes the arc to metres. */
export function lambertLeg(r1: Vec, r2: Vec, tof: number, mu: number, revs = 0, branch: 'lo' | 'hi' = 'lo'): { v1: Vec; v2: Vec } | null {
  return polishArc(r1, r2, tof, mu, lambertRev(r1, r2, tof, mu, revs, branch))
}

/** Differential correction of an existing Lambert solution (see lambertLeg). */
export function polishArc(r1: Vec, r2: Vec, tof: number, mu: number, s: Arc | null): Arc | null {
  if (!s) return null
  let v1 = s.v1
  const miss = (v: Vec) => sub(propagate(r1, v, tof, mu).r, r2)
  let e = miss(v1)
  for (let it = 0; it < 8 && norm(e) > 1; it++) {
    const h = 1e-6
    const cols = [0, 1, 2].map((i) => {
      const dv: Vec = [0, 0, 0]; dv[i] = h
      return mul(sub(miss(add(v1, dv)), e), 1 / h)
    })
    const J = [0, 1, 2].map((r) => [cols[0][r], cols[1][r], cols[2][r]])
    const step = solve3(J, e)
    if (!step) break
    const cand = sub(v1, step)
    const ec = miss(cand)
    if (!(norm(ec) < norm(e))) break
    v1 = cand; e = ec
  }
  return { v1, v2: propagate(r1, v1, tof, mu).v }
}
