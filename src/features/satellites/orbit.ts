// Satellite geometry: SGP4 wrappers, ground track, look angles, sunlit test. Pure (no DOM).
// Frame note: SGP4 returns TEME. We treat TEME ≈ J2000 equatorial (the frame the app's Earth view uses): the difference is
// the precession since 2000 (~0.36° in 2026), invisible on the globe but it is an approximation.
import { eciToGeodetic, eciToEcf, gstime, propagate } from './sgp4.ts'
import type { SatRec } from './sgp4.ts'
import { DEG, MU_EARTH, RE, norm, sunGeo, toJ2000, type Vec } from '../../lib/astro.ts'

export interface Observer { lat: number; lon: number; altM: number }
export interface SatState { r: Vec; v: Vec; lat: number; lon: number; alt: number; speed: number }

/** TEME position/velocity (km, km/s) at ms since 1970, or null if SGP4 fails (decayed / out of range). */
export function temeAt(sr: SatRec, ms: number): { r: Vec; v: Vec } | null {
  const pv = propagate(sr, new Date(ms))
  if (!pv || typeof pv.position === 'boolean' || typeof pv.velocity === 'boolean') return null
  const p = pv.position, v = pv.velocity
  if (![p.x, p.y, p.z].every(Number.isFinite)) return null
  return { r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] }
}

export function stateAt(sr: SatRec, ms: number): SatState | null {
  const s = temeAt(sr, ms)
  if (!s) return null
  const g = eciToGeodetic({ x: s.r[0], y: s.r[1], z: s.r[2] }, gstime(new Date(ms)))
  return { ...s, lat: g.latitude / DEG, lon: ((g.longitude / DEG + 540) % 360) - 180, alt: g.height, speed: norm(s.v) }
}

/** Mean orbit figures from the element set (period from mean motion, apsides from the mean semi-major axis). */
export function orbitInfo(sr: SatRec) {
  const n = sr.no / 60 // rad/s (satrec.no is rad/min)
  const a = Math.cbrt(MU_EARTH / (n * n))
  return { periodS: (2 * Math.PI) / n, incDeg: sr.inclo / DEG, ecc: sr.ecco, perigeeAlt: a * (1 - sr.ecco) - RE, apogeeAlt: a * (1 + sr.ecco) - RE }
}

/** Sun position (J2000 equatorial, km) at ms since 1970. */
export const sunAt = (ms: number): Vec => sunGeo(toJ2000(ms))

/** Cylindrical Earth shadow: true when the point at geocentric `r` is in the Sun's light. */
export function isSunlit(r: Vec, sun: Vec): boolean {
  const sn = norm(sun), s: Vec = [sun[0] / sn, sun[1] / sn, sun[2] / sn]
  const along = r[0] * s[0] + r[1] * s[1] + r[2] * s[2]
  if (along >= 0) return true
  return Math.hypot(r[0] - along * s[0], r[1] - along * s[1], r[2] - along * s[2]) > RE
}

/** Sub-satellite points (deg) from `-backS` to `fwdS` around `ms`. */
export function groundTrack(sr: SatRec, ms: number, backS: number, fwdS: number, stepS: number) {
  const pts: { lat: number; lon: number; past: boolean }[] = []
  for (let t = -backS; t <= fwdS + 1e-9; t += stepS) {
    const s = stateAt(sr, ms + t * 1000)
    if (s) pts.push({ lat: s.lat, lon: s.lon, past: t < 0 })
  }
  return pts
}

/** Sub-solar point (deg) at ms. */
export function subSolar(ms: number) {
  const s = sunAt(ms), g = gstime(new Date(ms))
  const lon = (Math.atan2(s[1], s[0]) - g) / DEG
  return { lat: Math.asin(s[2] / norm(s)) / DEG, lon: ((lon + 540) % 360) - 180 }
}

// ---- look angles (WGS84 observer) ----
const WGS_A = 6378.137, WGS_F = 1 / 298.257223563
export function observerEcef(o: Observer): Vec {
  const la = o.lat * DEG, lo = o.lon * DEG, e2 = WGS_F * (2 - WGS_F), h = o.altM / 1000
  const N = WGS_A / Math.sqrt(1 - e2 * Math.sin(la) ** 2)
  return [(N + h) * Math.cos(la) * Math.cos(lo), (N + h) * Math.cos(la) * Math.sin(lo), (N * (1 - e2) + h) * Math.sin(la)]
}
/** Azimuth (deg from north, clockwise), elevation (deg) and range (km) of an ECEF point seen from the observer. */
export function lookFromEcef(o: Observer, p: Vec) {
  const q = observerEcef(o), d: Vec = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
  const la = o.lat * DEG, lo = o.lon * DEG
  const e = -Math.sin(lo) * d[0] + Math.cos(lo) * d[1]
  const n = -Math.sin(la) * Math.cos(lo) * d[0] - Math.sin(la) * Math.sin(lo) * d[1] + Math.cos(la) * d[2]
  const u = Math.cos(la) * Math.cos(lo) * d[0] + Math.cos(la) * Math.sin(lo) * d[1] + Math.sin(la) * d[2]
  const rng = Math.hypot(e, n, u)
  return { az: ((Math.atan2(e, n) / DEG) + 360) % 360, el: Math.asin(u / rng) / DEG, range: rng }
}
export function lookAt(o: Observer, rEci: Vec, ms: number) {
  const f = eciToEcf({ x: rEci[0], y: rEci[1], z: rEci[2] }, gstime(new Date(ms)))
  return lookFromEcef(o, [f.x, f.y, f.z])
}
/** Sun elevation (deg) at the observer. */
export const sunElevation = (o: Observer, ms: number) => lookAt(o, sunAt(ms), ms).el

/** Compass sector 0..7 (N, NO, O, ZO, Z, ZW, W, NW) of an azimuth in degrees. */
export const compass8 = (az: number) => Math.round((((az % 360) + 360) % 360) / 45) % 8
