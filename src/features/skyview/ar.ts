// True AR pose: absolute device orientation (quaternion) -> where the back camera looks (az / alt / roll), smoothing, and the sensor
// plumbing (AbsoluteOrientationSensor, else deviceorientationabsolute, else iOS webkitCompassHeading). Maths is pure (Node tests).
//
// Frames: Earth = horizon frame of geom.ts (x east, y north, z up), device = W3C (x right, y top of the screen, z out of the screen).
// The back camera looks along -z of the device. Quaternions are [x, y, z, w] and rotate DEVICE vectors into EARTH vectors.
import { D2R, hzAltAz, type Basis, type V3 } from './geom.ts'

export type Quat = [number, number, number, number]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n] }

export const qNorm = (q: Quat): Quat => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n] }
export const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
export const qRotate = (q: Quat, v: V3): V3 => {
  const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
}
/** Angle between two orientations in degrees (0..180). */
export const qAngle = (a: Quat, b: Quat) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) / D2R
/** Spherical interpolation along the SHORT arc (q and -q are the same rotation, so the sign is fixed first: no flip, no wrap-around). */
export function qSlerp(a: Quat, b: Quat, k: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const s: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b
  d = Math.abs(d)
  if (d > 0.9995) return qNorm([a[0] + (s[0] - a[0]) * k, a[1] + (s[1] - a[1]) * k, a[2] + (s[2] - a[2]) * k, a[3] + (s[3] - a[3]) * k])
  const th = Math.acos(d), sn = Math.sin(th), wa = Math.sin((1 - k) * th) / sn, wb = Math.sin(k * th) / sn
  return [a[0] * wa + s[0] * wb, a[1] * wa + s[1] * wb, a[2] * wa + s[2] * wb, a[3] * wa + s[3] * wb]
}

/** W3C DeviceOrientation Euler angles (degrees; Z-X'-Y'' intrinsic: alpha about z, beta about x, gamma about y) -> quaternion. With an
 *  absolute orientation alpha is measured counter-clockwise from north. */
export function quatFromEuler(alpha: number, beta: number, gamma: number): Quat {
  const hz = (alpha * D2R) / 2, hx = (beta * D2R) / 2, hy = (gamma * D2R) / 2
  const qz: Quat = [0, 0, Math.sin(hz), Math.cos(hz)], qx: Quat = [Math.sin(hx), 0, 0, Math.cos(hx)], qy: Quat = [0, Math.sin(hy), 0, Math.cos(hy)]
  return qNorm(qMul(qMul(qz, qx), qy))
}

/** Camera basis from a device attitude: f = back-camera direction, u = top of the SCREEN (rotated with the display:
 *  `screenAngle` = screen.orientation.angle), r = f x u. Roll is inside u: the drawn horizon tilts with the phone. */
export function basisFromQuat(q: Quat, screenAngle = 0): Basis {
  const a = screenAngle * D2R
  const f = unit(qRotate(q, [0, 0, -1])), u0 = qRotate(q, [Math.sin(a), Math.cos(a), 0])
  const d = dot(u0, f), u = unit([u0[0] - d * f[0], u0[1] - d * f[1], u0[2] - d * f[2]])
  return { f, u, r: cross(f, u) }
}
/** Roll of the camera about its axis in degrees (0 = level; positive = turned clockwise as seen through the screen); 0 when looking straight up/down. */
export function rollOf(b: Basis): number {
  const up: V3 = [0, 0, 1], d = dot(up, b.f)
  const h: V3 = [up[0] - d * b.f[0], up[1] - d * b.f[1], up[2] - d * b.f[2]] // "up" projected on the image plane = where the sky's up should be
  if (Math.hypot(h[0], h[1], h[2]) < 1e-3) return 0
  const hu = dot(h, b.u), hr = dot(h, b.r)
  return Math.atan2(-hr, hu) / D2R
}
export const poseOf = (b: Basis) => ({ ...hzAltAz(b.f), roll: rollOf(b) })

/** Low-pass step: heavy smoothing for tiny motion (sensor noise), light for real movement (low latency). Returns the new attitude. */
export function smoothStep(cur: Quat, target: Quat, dt: number): Quat {
  const err = qAngle(cur, target)
  const tau = err < 0.4 ? 0.16 : err > 6 ? 0.025 : 0.16 - ((err - 0.4) / 5.6) * 0.135 // seconds
  return qSlerp(cur, target, 1 - Math.exp(-Math.max(0, dt) / tau))
}

/** Is the compass wobbling? Pass recent [timeMs, quaternion] samples (about the last 2 s): a phone held still whose attitude still
 *  travels a long path = noisy / uncalibrated magnetometer. */
export function jittery(s: { t: number; q: Quat }[]): boolean {
  if (s.length < 20) return false
  let path = 0
  for (let i = 1; i < s.length; i++) path += qAngle(s[i - 1].q, s[i].q)
  return qAngle(s[0].q, s[s.length - 1].q) < 4 && path > 14
}

// ---------- sensors ----------
export type PoseSource = 'sensor' | 'absolute' | 'ios' | 'relative'
export interface PoseInfo { source: PoseSource; /** iOS only: compass accuracy in degrees (-1 = unknown) */ accuracy?: number }
type SensorCtor = new (o: { frequency: number; referenceFrame?: string }) => { quaternion?: number[]; start(): void; stop(): void; onreading: (() => void) | null; onerror: ((e: unknown) => void) | null; addEventListener: (t: string, f: () => void) => void }

/** Start listening. `onQuat(q, info)` per sample (Earth <- device, magnetic north; the caller adds the declination). Returns stop().
 *  Order: AbsoluteOrientationSensor -> deviceorientationabsolute -> iOS deviceorientation with webkitCompassHeading -> plain
 *  deviceorientation (RELATIVE: no north, reported as 'relative'). */
export function startPose(onQuat: (q: Quat, info: PoseInfo) => void): () => void {
  let stopped = false
  const cleanups: (() => void)[] = []
  const stop = () => { stopped = true; cleanups.forEach((c) => c()); cleanups.length = 0 }
  let evOn = false
  const useEvents = () => {
    if (stopped || evOn) return
    evOn = true
    const abs = 'ondeviceorientationabsolute' in window
    const type = abs ? 'deviceorientationabsolute' : 'deviceorientation'
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      const x = e as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
      if (typeof x.webkitCompassHeading === 'number' && Number.isFinite(x.webkitCompassHeading)) onQuat(quatFromEuler(360 - x.webkitCompassHeading, e.beta, e.gamma), { source: 'ios', accuracy: x.webkitCompassAccuracy })
      else onQuat(quatFromEuler(e.alpha, e.beta, e.gamma), { source: e.absolute || abs ? 'absolute' : 'relative' })
    }
    window.addEventListener(type, on as EventListener, true)
    cleanups.push(() => window.removeEventListener(type, on as EventListener, true))
  }
  const Ctor = (window as unknown as { AbsoluteOrientationSensor?: SensorCtor }).AbsoluteOrientationSensor
  if (Ctor) {
    try {
      const s = new Ctor({ frequency: 60 })
      let got = false
      s.onreading = () => { if (s.quaternion && !stopped) { got = true; onQuat(qNorm(s.quaternion as Quat), { source: 'sensor' }) } }
      s.onerror = () => { if (!got) { try { s.stop() } catch { /* ignore */ } useEvents() } }
      s.start()
      cleanups.push(() => { try { s.stop() } catch { /* ignore */ } })
      const to = setTimeout(() => { if (!got) { try { s.stop() } catch { /* ignore */ } useEvents() } }, 1200) // started but silent (permissions policy, desktop)
      cleanups.push(() => clearTimeout(to))
      return stop
    } catch { /* fall through */ }
  }
  useEvents()
  return stop
}
