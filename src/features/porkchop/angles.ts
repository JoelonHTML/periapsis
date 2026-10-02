// Departure / arrival read-outs for a selected route, in the style of the KSP Transfer Window Planner.
// Frames: every state in src/lib/astro.ts is HELIOCENTRIC ECLIPTIC J2000 (mean ecliptic & equinox of J2000, +z = ecliptic north,
// angles counter-clockwise seen from north). `ecl2eq` rotates about +x by the obliquity into the equatorial J2000 frame (EME2000).
import { DEG, MU_EARTH, RE, bodyState, cross, dot, ecl2eq, norm, sub, type BodyId, type Vec } from '../../lib/astro.ts'
import type { Solution } from '../../lib/mga.ts'

const wrap180 = (a: number) => { a = ((((a + 180) % 360) + 360) % 360) - 180; return a === -180 ? 180 : a }
const wrap360 = (a: number) => ((a % 360) + 360) % 360

/** Right ascension [0,360) and declination [-90,90] in degrees of an EQUATORIAL J2000 vector. */
export function raDec(v: Vec) {
  return { ra: wrap360(Math.atan2(v[1], v[0]) / DEG), dec: Math.asin(Math.max(-1, Math.min(1, v[2] / norm(v)))) / DEG }
}
/** Same for an ECLIPTIC J2000 vector (it is rotated to the equator first). */
export const raDecFromEcliptic = (v: Vec) => raDec(ecl2eq(v))
export const eclLon = (r: Vec) => Math.atan2(r[1], r[0]) / DEG

export interface DepartureReadout {
  to: BodyId // destination of the first leg
  t: number
  /** Heliocentric ecliptic longitude of the destination minus that of Earth at departure (deg, -180…180; + = destination ahead of Earth). */
  phase: number
  vinf: number // km/s
  c3: number // km²/s²
  /** Ejection v∞ vector, heliocentric ecliptic J2000 (km/s). */
  vinfEcl: Vec
  /** … and as equatorial J2000 (EME2000) components. */
  vinfEq: Vec
  /** Direction of the escape asymptote in the Earth-centred equatorial J2000 frame (deg). */
  ra: number
  dec: number
  /** Angle between v∞ and Earth's heliocentric velocity (3-D, 0 = exactly prograde, 180 = retrograde), deg. */
  angleToPrograde: number
  /** In-ecliptic part: signed angle from Earth's prograde direction to the projection of v∞, + = towards the Sun, − = away from it (deg). */
  inPlane: number
  /** Ecliptic latitude of v∞ (out-of-plane part, + = north), deg. */
  outOfPlane: number
  /** True anomaly of the escape asymptote on the hyperbola from a circular parking orbit (deg). */
  asymptoteAnomaly: number
  /** KSP "ejection angle": the burn point on the parking orbit lies this far BEHIND Earth's prograde point
   *  (in the orbit plane, against the direction of motion), 0–360°; = asymptote anomaly − in-plane angle. Planar approximation. */
  ejection: number
  eccentricity: number
}

export function departureReadout(sol: Solution, parkAlt = 200): DepartureReadout {
  const leg = sol.legs[0]
  const earth = bodyState('earth', leg.t1), dest = bodyState(leg.to, leg.t1)
  const vinfEcl = sub(leg.v1, earth.v)
  const vinf = norm(vinfEcl)
  const vinfEq = ecl2eq(vinfEcl)
  const { ra, dec } = raDec(vinfEq)
  const phase = wrap180(eclLon(dest.r) - eclLon(earth.r))
  const angleToPrograde = Math.acos(Math.max(-1, Math.min(1, dot(vinfEcl, earth.v) / (vinf * norm(earth.v))))) / DEG
  const pa: Vec = [earth.v[0], earth.v[1], 0], pb: Vec = [vinfEcl[0], vinfEcl[1], 0]
  const inPlane = Math.atan2(cross(pa, pb)[2], dot(pa, pb)) / DEG
  const outOfPlane = Math.asin(vinfEcl[2] / vinf) / DEG
  const e = 1 + ((RE + parkAlt) * vinf * vinf) / MU_EARTH
  const nuInf = Math.acos(-1 / e) / DEG
  return { to: leg.to, t: leg.t1, phase, vinf, c3: vinf * vinf, vinfEcl, vinfEq, ra, dec, angleToPrograde, inPlane, outOfPlane, asymptoteAnomaly: nuInf, ejection: wrap360(nuInf - inPlane), eccentricity: e }
}

export interface ArrivalReadout { body: BodyId; t: number; vinf: number; c3: number; ra: number; dec: number; vHelio: number }
/** v∞ at the final body; direction (RA/Dec) of the arrival asymptote velocity in the equatorial J2000 axes, centred on that body. */
export function arrivalReadout(sol: Solution): ArrivalReadout {
  const leg = sol.legs[sol.legs.length - 1]
  const b = bodyState(leg.to, leg.t2)
  const v = sub(leg.v2, b.v)
  const { ra, dec } = raDecFromEcliptic(v)
  return { body: leg.to, t: leg.t2, vinf: norm(v), c3: norm(v) ** 2, ra, dec, vHelio: norm(leg.v2) }
}
