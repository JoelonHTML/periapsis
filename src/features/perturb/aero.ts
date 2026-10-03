// Aerocapture and aerobraking estimators (pure physics; the calculator cards live in src/components/calc/defs-aero.ts).
// All lengths km, speeds km/s, mu km³/s², unless a name says otherwise (…M = metres, …Pa).
import { BODIES, captureDv, type BodyId } from '../../lib/astro.ts'

export interface AeroBody {
  id: string; name: string; mu: number; radius: number
  /** Exponential fit rho = rho0 exp(-h/H) to the lower atmosphere (kg/m³, km): only used for the Allen–Eggers estimate. */
  rho0: number; H: number
  /** Example inputs when this body is picked (user-editable placeholders, NOT design corridors). */
  def: { vinf: number; raAlt: number; rpAlt: number; entryAlt: number; passAlt: number }
}
const fromBody = (id: BodyId) => ({ mu: BODIES[id].mu, radius: BODIES[id].radius })
export const AERO_BODIES: AeroBody[] = [
  // rho0, H: NASA Planetary Fact Sheets (surface density, scale height). Titan: Huygens-era textbook values (surface 5.4 kg/m³, H ≈ 20 km), rough.
  { id: 'mars', name: 'Mars', ...fromBody('mars'), rho0: 0.020, H: 11.1, def: { vinf: 2.7, raAlt: 20000, rpAlt: 300, entryAlt: 125, passAlt: 40 } },
  { id: 'earth', name: 'Aarde', ...fromBody('earth'), rho0: 1.217, H: 8.5, def: { vinf: 3.0, raAlt: 40000, rpAlt: 300, entryAlt: 122, passAlt: 60 } },
  { id: 'venus', name: 'Venus', ...fromBody('venus'), rho0: 65, H: 15.9, def: { vinf: 3.0, raAlt: 20000, rpAlt: 300, entryAlt: 150, passAlt: 100 } },
  // Titan: GM = 8978.14 km³/s², R = 2574.73 km (Iess et al. 2010, Science 327; IAU).
  { id: 'titan', name: 'Titan', mu: 8978.14, radius: 2574.73, rho0: 5.4, H: 20, def: { vinf: 2.0, raAlt: 20000, rpAlt: 1500, entryAlt: 1270, passAlt: 700 } },
]
export const G_EARTH = 9.80665 // m/s²

const vApo = (mu: number, rp: number, ra: number) => Math.sqrt(mu * (2 / ra - 2 / (ra + rp)))
const vPer = (mu: number, rp: number, ra: number) => Math.sqrt(mu * (2 / rp - 2 / (ra + rp)))

export interface AerocaptureIn {
  mu: number; radius: number; vinf: number
  raAlt: number // target apoapsis altitude
  rpAlt: number // target (final) periapsis altitude
  entryAlt: number // atmospheric interface
  passAlt: number // periapsis altitude of the entry hyperbola (inside the atmosphere)
  m: number; cd: number; area: number // kg, -, m²
  rho0: number; H: number // exponential atmosphere (kg/m³, km)
}
export function aerocapture(p: AerocaptureIn) {
  const { mu, radius: R, vinf } = p
  const rT = R + p.rpAlt, raT = R + p.raAlt, eT = (raT - rT) / (raT + rT)
  // Δv saved = Δv of a propulsive capture at the periapsis of the final orbit into the same target orbit.
  const dvProp = captureDv(vinf, rT, mu, eT)
  const rPass = R + p.passAlt, re = R + p.entryAlt
  const vPass = Math.sqrt(vinf * vinf + (2 * mu) / rPass) // hyperbola speed at its periapsis (inside the atmosphere)
  const ve = Math.sqrt(vinf * vinf + (2 * mu) / re) // speed at the atmospheric interface
  // angular momentum h = rPass vPass = re ve cos(gamma)
  const cosG = Math.min(1, (rPass * vPass) / (re * ve))
  const gamma = Math.acos(cosG) // flight-path angle below the local horizontal at the interface
  const vExit = vPer(mu, rPass, raT) // speed at periapsis of the post-pass orbit (rp = pass altitude, ra = target)
  const dvAtm = vPass - vExit // speed the atmosphere has to remove
  const dvRaise = rT > rPass ? vApo(mu, rT, raT) - vApo(mu, rPass, raT) : 0 // cleanup burn at apoapsis to lift the periapsis
  // Ballistic coefficient and Allen–Eggers peak deceleration (steep ballistic entry in an exponential atmosphere)
  const beta = p.m / (p.cd * p.area) // kg/m²
  const HM = p.H * 1000, veM = ve * 1000, sinG = Math.sin(gamma)
  const aMax = (veM * veM * sinG) / (2 * Math.E * HM) // m/s²
  const rhoPeak = (beta * sinG) / HM // kg/m³ at peak deceleration
  const hPeak = rhoPeak > 0 ? p.H * Math.log(p.rho0 / rhoPeak) : NaN // km (exponential atmosphere from the surface)
  const vPeak = (veM / Math.sqrt(Math.E)) / 1000 // km/s
  const qPeak = beta * aMax // Pa = beta * a
  return { rT, raT, eT, dvProp, dvSaved: dvProp, rPass, re, vPass, ve, gamma, vExit, dvAtm, dvRaise, dvNet: dvProp - dvRaise, beta, aMax, gLoad: aMax / G_EARTH, rhoPeak, hPeak, vPeak, qPeak }
}

export interface AerobrakeIn {
  mu: number; radius: number
  raStartAlt: number; raEndAlt: number; rpAlt: number
  dvPass: number // m/s removed per pass (assumed constant)
  m: number; cd: number; area: number
  H: number // local density scale height at periapsis, km
}
export function aerobrake(p: AerobrakeIn) {
  const { mu, radius: R } = p
  const rp = R + p.rpAlt, ra0 = R + p.raStartAlt, raT = R + p.raEndAlt
  const dv = p.dvPass / 1000 // km/s
  const periodOf = (a: number) => 2 * Math.PI * Math.sqrt(a ** 3 / mu)
  const vp0 = vPer(mu, rp, ra0), vpT = vPer(mu, rp, raT)
  // Each pass lowers the periapsis speed by dv; the new semi-major axis follows from vis-viva at fixed rp.
  let vp = vp0, ra = ra0, n = 0, time = 0
  const MAX = 1e6
  while (ra > raT && n < MAX) {
    time += periodOf((rp + ra) / 2)
    vp -= dv
    n++
    const inv = 2 / rp - (vp * vp) / mu // 1/a
    if (!(inv > 0)) break
    const a = 1 / inv
    ra = 2 * a - rp
    if (ra <= rp) { ra = rp; break }
  }
  const beta = p.m / (p.cd * p.area)
  // Per-pass Δv from drag with an exponential density: dv = (1/2) (Cd A/m) rho_p v_p sqrt(2 pi r_p H)  (Gaussian path integral)
  // → required periapsis density for the chosen dv; q = rho v²/2; free-molecular heat flux upper bound q̇ = rho v³/2.
  const HM = p.H * 1000, rpM = rp * 1000
  const vpM = vp0 * 1000
  const rhoP = (2 * p.dvPass * beta) / (vpM * Math.sqrt(2 * Math.PI * rpM * HM))
  const q = 0.5 * rhoP * vpM * vpM
  const heat = 0.5 * rhoP * vpM ** 3 // W/m²
  return { n, time, vp0, vpT, dvTotal: vp0 - vpT, rhoP, q, heat, beta, reached: ra <= raT, raFinal: ra, passed: n >= MAX }
}
