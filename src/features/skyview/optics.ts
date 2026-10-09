// Atmosphere and visibility physics of the Sky view (pure, no DOM): refraction, extinction, light pollution, naked-eye limits.
import { limitingMag, hzAltAz, hzVec, type V3 } from './geom.ts'

const D2R = Math.PI / 180
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Refraction (degrees) for an APPARENT altitude h (deg): Bennett (1982), standard atmosphere (1010 hPa, 10 C). 34.5' at the horizon, ~1' at 45 deg. */
export const refractionBennett = (h: number) => (1 / Math.tan((h + 7.31 / (h + 4.4)) * D2R)) / 60
/** Refraction (degrees) for a TRUE altitude h (deg): Saemundsson (1986), inverse of Bennett to ~0.07'. 29' at a true altitude of 0. */
export const refractionSaemundsson = (h: number) => (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R)) / 60
/** Lift (deg) to add to a true altitude. Clamped and faded below -1 deg so the mapping stays continuous and monotone. */
export function refractionLift(trueAlt: number): number {
  if (trueAlt >= 89.9) return 0
  const k = clamp((trueAlt + 3) / 2, 0, 1)
  return k === 0 ? 0 : refractionSaemundsson(Math.max(trueAlt, -1)) * k
}
/** Apply refraction to a horizon-frame unit vector (true -> apparent). Only low directions are touched. */
export function refractVec(v: V3, out: V3 = [0, 0, 0]): V3 {
  if (v[2] > 0.45) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out } // above 27 deg: < 2 arc-minutes, left alone
  const alt = Math.asin(clamp(v[2], -1, 1)) / D2R, a2 = (alt + refractionLift(alt)) * D2R
  const hn = Math.hypot(v[0], v[1])
  if (hn < 1e-9) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out }
  const s = Math.cos(a2) / hn
  out[0] = v[0] * s; out[1] = v[1] * s; out[2] = Math.sin(a2)
  return out
}

/** Relative air mass for an apparent altitude (deg): Kasten and Young (1989). 1 at the zenith, ~38 at the horizon. */
export const airMass = (h: number) => { const a = Math.max(h, -0.5); return 1 / (Math.sin(a * D2R) + 0.50572 * (a + 6.07995) ** -1.6364) }
/** Extinction in magnitudes relative to the zenith (catalogue-magnitudes dimmed by the air above the horizon). k = 0.25 mag/airmass, clean air. */
export const extinctionMag = (h: number, k = 0.25) => k * (airMass(h) - 1)

/** Bortle dark-sky class 1..9 -> naked-eye limiting magnitude (centre of the usual ranges). */
export const BORTLE_NELM = [7.8, 7.3, 6.8, 6.3, 5.8, 5.3, 4.8, 4.3, 4.0]
export const bortleLimit = (b: number) => BORTLE_NELM[clamp(Math.round(b), 1, 9) - 1]
/** 0 (class 1-2: no visible glow) .. 1 (class 9, city): strength of the sky-glow wash near the horizon. */
export const bortleGlow = (b: number) => clamp((b - 2) / 7, 0, 1)

/** Moonlight lowers the visible magnitude: up to ~1.8 mag for a high full Moon, nothing when it is below the horizon or the Sun is up. */
export const moonPenalty = (moonAlt: number, illum: number) => 1.8 * illum ** 0.9 * Math.max(0, Math.sin(moonAlt * D2R)) ** 0.7

/** Faintest naked-eye magnitude: twilight, Bortle class, Moon. */
export const nakedEyeLimit = (sunAlt: number, bortle: number, moonAlt: number, moonIllum: number) =>
  Math.min(limitingMag(sunAlt), bortleLimit(bortle)) - (sunAlt < -3 ? moonPenalty(moonAlt, moonIllum) : 0)

/** Extra depth of a zoomed-in view (like looking through binoculars / a small telescope): 0 at fov >= 70 deg, 3 mag at 7 deg. */
export const zoomGain = (fovDeg: number) => clamp(3 * Math.log10(70 / fovDeg), 0, 3.5)

export { hzAltAz, hzVec }
