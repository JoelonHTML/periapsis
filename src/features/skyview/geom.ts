// Pure geometry of the Sky view: J2000 equatorial -> horizon frame, stereographic projection, device orientation (AR) -> view basis,
// rise / transit / set search, B-V colours. No DOM, no three.js (Node tests import this file).
//
// Horizon frame ("hz"): x = east, y = north, z = up (right-handed). A direction is a unit vector [e, n, u].
import { jdeOf, lstDeg, precess } from '../tonight/sky.ts'

export type V3 = [number, number, number]
export const D2R = Math.PI / 180
const mod = (x: number, m: number) => ((x % m) + m) % m

export const radecVec = (raDeg: number, decDeg: number): V3 => {
  const c = Math.cos(decDeg * D2R)
  return [c * Math.cos(raDeg * D2R), c * Math.sin(raDeg * D2R), Math.sin(decDeg * D2R)]
}
export const hzVec = (altDeg: number, azDeg: number): V3 => {
  const c = Math.cos(altDeg * D2R)
  return [c * Math.sin(azDeg * D2R), c * Math.cos(azDeg * D2R), Math.sin(altDeg * D2R)]
}
export const hzAltAz = (h: V3) => ({ alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) / D2R, az: mod(Math.atan2(h[0], h[1]) / D2R, 360) })

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n] }

/** Row-major 3x3 turning a J2000 equatorial unit vector into a horizon vector for a place and moment
 *  (IAU 1976 precession to the date, then the local sidereal time; no nutation, no refraction). */
export function horizonMatrix(ms: number, latDeg: number, lonDeg: number): number[] {
  const T = (jdeOf(ms) - 2451545) / 36525
  const px = precess([1, 0, 0], T), py = precess([0, 1, 0], T), pz = precess([0, 0, 1], T) // columns of the precession matrix
  const th = lstDeg(ms, lonDeg) * D2R, ph = latDeg * D2R
  const E: V3 = [-Math.sin(th), Math.cos(th), 0]
  const N: V3 = [-Math.sin(ph) * Math.cos(th), -Math.sin(ph) * Math.sin(th), Math.cos(ph)]
  const U: V3 = [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)]
  return [E, N, U].flatMap((row) => [dot(row, px), dot(row, py), dot(row, pz)])
}
export const applyM = (m: number[], v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
/** Transpose = inverse for a rotation. */
export const applyMT = (m: number[], v: V3): V3 => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]]

// ---------- camera / projection ----------
export interface Basis { f: V3; r: V3; u: V3 }
/** Looking at (az, alt) with the horizon level. */
export function basisAzAlt(azDeg: number, altDeg: number): Basis {
  const f = hzVec(altDeg, azDeg), a = azDeg * D2R
  const r: V3 = [Math.cos(a), -Math.sin(a), 0]
  return { f, r, u: cross(r, f) }
}
/** `rect` = rectilinear (pinhole, what a camera sees; k = focal length in px) instead of stereographic (k = 2 * tan(fov/4) scale). */
export interface Cam extends Basis { cx: number; cy: number; k: number; rect?: boolean }
/** `fovDeg` is the angular size of the SHORTER screen side; stereographic projection (angle-friendly up to 120 degrees and more). */
export const camScale = (w: number, h: number, fovDeg: number) => Math.min(w, h) / 2 / (2 * Math.tan((fovDeg * D2R) / 4))

/** Screen position of a horizon vector; false when it is (nearly) behind the camera. */
export function project(c: Cam, h: V3, out: { x: number; y: number }): boolean {
  const d = dot(h, c.f)
  if (c.rect) {
    if (d < 0.02) return false
    out.x = c.cx + (c.k * dot(h, c.r)) / d
    out.y = c.cy - (c.k * dot(h, c.u)) / d
    return true
  }
  if (d < -0.985) return false
  const s = (2 * c.k) / (1 + d)
  out.x = c.cx + s * dot(h, c.r)
  out.y = c.cy - s * dot(h, c.u)
  return true
}
/** Inverse of `project`: the horizon direction under a screen point. */
export function unproject(c: Cam, sx: number, sy: number): V3 {
  if (c.rect) {
    const X = (sx - c.cx) / c.k, Y = -(sy - c.cy) / c.k
    return unit([c.f[0] + X * c.r[0] + Y * c.u[0], c.f[1] + X * c.r[1] + Y * c.u[1], c.f[2] + X * c.r[2] + Y * c.u[2]])
  }
  const X = (sx - c.cx) / c.k, Y = -(sy - c.cy) / c.k, p2 = X * X + Y * Y
  const d = (4 - p2) / (4 + p2), s = 4 / (4 + p2)
  return unit([d * c.f[0] + s * (X * c.r[0] + Y * c.u[0]), d * c.f[1] + s * (X * c.r[1] + Y * c.u[1]), d * c.f[2] + s * (X * c.r[2] + Y * c.u[2])])
}
/** Angle (deg) between the view axis and a direction. */
export const angleFrom = (c: Basis, h: V3) => Math.acos(Math.max(-1, Math.min(1, dot(h, c.f)))) / D2R

// ---------- device orientation (AR) ----------
/** W3C DeviceOrientation (alpha about z, beta about x, gamma about y; degrees) -> where the BACK of the phone points (f) and where
 *  the top of the SCREEN points (u), in the horizon frame. `screenAngle` = screen.orientation.angle (0, 90, 180, 270).
 *  With an absolute orientation alpha is measured from north (counter-clockwise seen from above). */
export function basisFromOrientation(alpha: number, beta: number, gamma: number, screenAngle = 0): Basis {
  const cA = Math.cos(alpha * D2R), sA = Math.sin(alpha * D2R), cB = Math.cos(beta * D2R), sB = Math.sin(beta * D2R), cG = Math.cos(gamma * D2R), sG = Math.sin(gamma * D2R)
  const m = [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG, cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB, -cB * sG, sB, cB * cG] // Rz(a) Rx(b) Ry(g)
  const f = applyM(m, [0, 0, -1])
  const q = screenAngle * D2R
  const u = applyM(m, [Math.sin(q), Math.cos(q), 0]) // top of the screen in device axes, for a rotated screen
  return { f, u, r: cross(f, u) }
}
/** Smooth a basis towards a target (k 0..1) and re-orthonormalise: no angle wrap-around problems, unlike filtering alpha/beta/gamma. */
export function blendBasis(a: Basis, b: Basis, k: number): Basis {
  const mix = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]
  const f = unit(mix(a.f, b.f))
  let u = mix(a.u, b.u)
  const d = dot(u, f)
  u = unit([u[0] - d * f[0], u[1] - d * f[1], u[2] - d * f[2]])
  return { f, u, r: cross(f, u) }
}
/** Turn a basis about the vertical axis (heading fine-tune: magnetic declination, sensor offset). */
export function yawBasis(b: Basis, deg: number): Basis {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R)
  // heading increases clockwise seen from above: a vector at azimuth a moves to a + deg
  const rot = (v: V3): V3 => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]
  return { f: rot(b.f), r: rot(b.r), u: rot(b.u) }
}
export const basisAzAltOf = (b: Basis) => hzAltAz(b.f)

// ---------- rise / transit / set ----------
export interface RTS { rise: number | null; set: number | null; transit: { ms: number; alt: number } | null; always: 'up' | 'down' | null }
/** Next rise, set and highest point within 25 h from `from`. `alt(ms)` in degrees, h0 = altitude of the horizon event. */
export function riseTransitSet(alt: (ms: number) => number, from: number, h0: number, stepMs = 10 * 60000): RTS {
  const n = Math.ceil((25 * 3600e3) / stepMs)
  let rise: number | null = null, set: number | null = null, best = -91, bestI = 0, prev = alt(from) - h0
  const vals = [prev + h0]
  for (let i = 1; i <= n; i++) {
    const t = from + i * stepMs, v = alt(t) - h0
    vals.push(v + h0)
    if ((prev < 0) !== (v < 0)) {
      let lo = t - stepMs, hi = t
      for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if ((alt(mid) - h0 < 0) === (prev < 0)) lo = mid; else hi = mid }
      const x = Math.round((lo + hi) / 2)
      if (v > prev) { if (rise == null) rise = x } else if (set == null) set = x
    }
    prev = v
  }
  for (let i = 0; i < vals.length; i++) if (vals[i] > best) { best = vals[i]; bestI = i }
  let transit: RTS['transit'] = null
  if (bestI > 0 && bestI < vals.length - 1) { // a real maximum inside the window: refine with a ternary search
    let lo = from + (bestI - 1) * stepMs, hi = from + (bestI + 1) * stepMs
    for (let k = 0; k < 24; k++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (alt(a) < alt(b)) lo = a; else hi = b }
    const t = Math.round((lo + hi) / 2)
    transit = { ms: t, alt: alt(t) }
  }
  const always = rise == null && set == null ? (vals[0] > h0 ? 'up' : 'down') : null
  return { rise, set, transit, always }
}

// ---------- colours ----------
/** Star colour from B-V: Ballesteros temperature, Tanner Helland blackbody fit, 35 % towards white (eyes see pale stars). */
export function bvColor(bv: number): [number, number, number] {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = Math.min(400, Math.max(10, T / 100))
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x)) * 0.65 + 255 * 0.35)
  return [c(r), c(g), c(b)]
}

/** Local mean solar time of a place as HH:MM (the offline app has no time-zone database); `day` = +1/-1/0 relative to `ref`. */
export function solarClock(ms: number, lonDeg: number, ref = ms) {
  const t = new Date(ms + (lonDeg / 15) * 3600e3), r = new Date(ref + (lonDeg / 15) * 3600e3)
  const p = (x: number) => String(x).padStart(2, '0')
  const day = Math.round((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate())) / 86400000)
  return { hhmm: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`, day }
}
/** Sky brightness limit: the faintest magnitude visible for a Sun altitude (deg). */
export function limitingMag(sunAlt: number): number {
  const T: [number, number][] = [[-18, 9], [-12, 5.8], [-9, 4.2], [-6, 3], [-3, 1.6], [0, 0.3], [4, -1.5], [10, -3]]
  if (sunAlt <= T[0][0]) return T[0][1]
  for (let i = 1; i < T.length; i++) if (sunAlt <= T[i][0]) { const [a, m] = T[i - 1], [b, n] = T[i]; return m + ((n - m) * (sunAlt - a)) / (b - a) }
  return T[T.length - 1][1]
}
