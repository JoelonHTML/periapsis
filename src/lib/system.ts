// Planet systems (planet + moons), spacecraft orbit propagation and the impulsive orbit-adjustment planner.
// Pure logic — no React/three. Units: km, s, km/s, rad unless a name says otherwise. Relative imports only (node --test).
import {
  BODIES, DAY, DEG, G0, OBLIQUITY, add, bodyState, elementsToState, gmst, moonGeoEcliptic, mul, norm, unit, visViva,
  type BodyId, type Vec,
} from './astro.ts'

export type SysId = BodyId
export const SYS_IDS: SysId[] = ['mercury', 'venus', 'earth', 'mars', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']

// ---------------------------------------------------------------------------------------------------------------------
// Catalogue. Moon elements: NASA/JPL "Planetary Satellite Mean Elements" (a, e, i w.r.t. the planet's equator or — for
// the distant irregulars — the Laplace plane, treated as the equator here), sidereal period, mean radius.
// Phases (L0 = mean longitude at J2000, Ω, ω) are only literature values for the four Galilean moons (Meeus; they
// satisfy the Laplace resonance λ_Io − 3λ_Eur + 2λ_Gan = 180°); every other moon gets a fixed, documented phase.
// Earth's Moon is not propagated from these elements but from astro.moonGeoEcliptic (accurate position).
// ---------------------------------------------------------------------------------------------------------------------
export interface MoonDef {
  id: string; name: string
  a: number // km
  e: number
  i: number // deg; > 90 = retrograde
  P: number // sidereal period, days
  R: number // mean radius, km
  color: string
  tex: string
  L0: number; O: number; w: number // deg
  far?: boolean // left out of the "heel stelsel" framing
}
export interface RingDef { rIn: number; rOut: number; kind: 'saturn' | 'faint'; opacity: number }
export interface SysDef {
  id: SysId
  pole: [number, number] // IAU pole RA, Dec (deg, ICRF/J2000 equatorial)
  w0: number; wRate: number // prime-meridian angle W = w0 + wRate·days since J2000 (deg, deg/day)
  tex: string
  rings?: RingDef
  atm?: { color: string; opacity: number }
  atmAlt: number // altitude below which a periapsis is inside the atmosphere (km)
  moons: MoonDef[]
}
const m = (id: string, name: string, a: number, e: number, i: number, P: number, R: number, color: string, tex: string, L0: number, O = 0, w = 0, far = false): MoonDef =>
  ({ id, name, a, e, i, P, R, color, tex, L0, O, w, far })

export const SYSTEMS: Record<SysId, SysDef> = {
  mercury: { id: 'mercury', pole: [281.0097, 61.4143], w0: 329.5469, wRate: 6.1385025, tex: 'mercury', atmAlt: 0, moons: [] },
  venus: { id: 'venus', pole: [272.76, 67.16], w0: 160.2, wRate: -1.4813688, tex: 'venus', atm: { color: '#f5deb3', opacity: 0.16 }, atmAlt: 150, moons: [] },
  earth: {
    id: 'earth', pole: [0, 90], w0: 0, wRate: 0, tex: 'earth', atm: { color: '#60a5fa', opacity: 0.1 }, atmAlt: 120,
    moons: [m('moon', 'Maan', 384399, 0.0549, 5.145, 27.321661, 1737.4, '#d1d5db', 'moon', 0)],
  },
  mars: {
    id: 'mars', pole: [317.68143, 52.8865], w0: 176.63, wRate: 350.89198226, tex: 'mars', atm: { color: '#e8a37c', opacity: 0.07 }, atmAlt: 80,
    moons: [
      m('phobos', 'Phobos', 9376, 0.0151, 1.08, 0.31891, 11.1, '#9a8f84', 'rock', 232, 150, 150),
      m('deimos', 'Deimos', 23458, 0.0002, 1.79, 1.26244, 6.2, '#b7a99a', 'rock', 28, 50, 0),
    ],
  },
  ceres: { id: 'ceres', pole: [291.418, 66.764], w0: 170.65, wRate: 952.1532, tex: 'ceres', atmAlt: 0, moons: [] },
  jupiter: {
    id: 'jupiter', pole: [268.056595, 64.495303], w0: 284.95, wRate: 870.536, tex: 'jupiter', atmAlt: 0,
    rings: { rIn: 92000, rOut: 129000, kind: 'faint', opacity: 0.18 },
    moons: [
      m('amalthea', 'Amalthea', 181366, 0.0032, 0.374, 0.49818, 83.5, '#b45f3c', 'rock', 35),
      m('io', 'Io', 421800, 0.0041, 0.036, 1.769138, 1821.6, '#e8d36a', 'io', 106.07, 0, 0),
      m('europa', 'Europa', 671100, 0.0094, 0.466, 3.551181, 1560.8, '#e6dccd', 'europa', 175.73),
      m('ganymede', 'Ganymedes', 1070400, 0.0013, 0.177, 7.154553, 2634.1, '#a8a29a', 'ganymede', 120.56),
      m('callisto', 'Callisto', 1882700, 0.0074, 0.192, 16.689017, 2410.3, '#6b6259', 'callisto', 84.44),
      m('himalia', 'Himalia', 11461000, 0.162, 27.5, 250.56, 69.8, '#8b8b8b', 'rock', 100, 60, 40, true),
    ],
  },
  saturn: {
    id: 'saturn', pole: [40.589, 83.537], w0: 38.9, wRate: 810.7939024, tex: 'saturn', atmAlt: 0,
    rings: { rIn: 74500, rOut: 140220, kind: 'saturn', opacity: 1 },
    moons: [
      m('mimas', 'Mimas', 185540, 0.0196, 1.574, 0.942422, 198.2, '#c9c6c1', 'ice', 20, 120),
      m('enceladus', 'Enceladus', 238040, 0.0047, 0.009, 1.370218, 252.1, '#f4f6f8', 'enceladus', 140),
      m('tethys', 'Tethys', 294670, 0.0001, 1.091, 1.887802, 531.1, '#e4e4e2', 'ice', 250),
      m('dione', 'Dione', 377420, 0.0022, 0.028, 2.736915, 561.4, '#dcdad6', 'ice', 310),
      m('rhea', 'Rhea', 527070, 0.0013, 0.333, 4.5175, 763.8, '#d6d4d0', 'ice', 80),
      m('titan', 'Titan', 1221870, 0.0288, 0.306, 15.945421, 2574.7, '#d99a3a', 'titan', 163, 24, 180),
      m('hyperion', 'Hyperion', 1500880, 0.1042, 0.43, 21.276609, 135, '#b89f86', 'rock', 200, 100, 200, true),
      m('iapetus', 'Iapetus', 3560840, 0.0283, 15.5, 79.3215, 734.5, '#a39a8c', 'iapetus', 55, 80, 270, true),
      m('phoebe', 'Phoebe', 12947780, 0.1635, 175, 550.56, 106.5, '#6e6a66', 'rock', 300, 270, 340, true),
    ],
  },
  uranus: {
    id: 'uranus', pole: [257.311, -15.175], w0: 203.81, wRate: -501.1600928, tex: 'uranus', atmAlt: 0,
    rings: { rIn: 41837, rOut: 51149, kind: 'faint', opacity: 0.2 },
    moons: [
      m('miranda', 'Miranda', 129390, 0.0013, 4.232, 1.413479, 235.8, '#c4c1bd', 'ice', 90),
      m('ariel', 'Ariel', 191020, 0.0012, 0.26, 2.520379, 578.9, '#cfcdca', 'ice', 200),
      m('umbriel', 'Umbriel', 266300, 0.0039, 0.128, 4.144176, 584.7, '#7b7a78', 'rock', 300),
      m('titania', 'Titania', 435910, 0.0011, 0.34, 8.705872, 788.9, '#bdb5ab', 'ice', 40),
      m('oberon', 'Oberon', 583520, 0.0014, 0.058, 13.463239, 761.4, '#9d9186', 'rock', 140),
    ],
  },
  neptune: {
    id: 'neptune', pole: [299.36, 43.46], w0: 253.18, wRate: 536.3128492, tex: 'neptune', atmAlt: 0,
    rings: { rIn: 41900, rOut: 62932, kind: 'faint', opacity: 0.14 },
    moons: [
      m('proteus', 'Proteus', 117647, 0.0005, 0.524, 1.122315, 210, '#7d7a77', 'rock', 330),
      m('triton', 'Triton', 354759, 0.000016, 156.885, 5.876854, 1353.4, '#e8cfc4', 'triton', 214),
      m('nereid', 'Nereid', 5513820, 0.7512, 7.09, 360.1362, 170, '#a8a29e', 'rock', 10, 330, 290, true),
    ],
  },
  pluto: {
    id: 'pluto', pole: [132.993, -6.163], w0: 302.695, wRate: -56.3625225, tex: 'pluto', atmAlt: 0,
    moons: [
      m('charon', 'Charon', 19591, 0.0002, 0.08, 6.3872, 606, '#9b948c', 'charon', 40),
      m('nix', 'Nix', 48694, 0.002, 0.133, 24.856, 19.3, '#c9c4bd', 'rock', 160),
      m('hydra', 'Hydra', 64738, 0.0059, 0.242, 38.202, 20, '#d4d0ca', 'rock', 260),
    ],
  },
}

export const sysName = (id: SysId) => BODIES[id].name
export const sysMu = (id: SysId) => BODIES[id].mu
export const sysR = (id: SysId) => BODIES[id].radius
/** Radius (km) that frames the whole system (outermost moon that is not flagged `far`; planets without moons: 8 R). */
export function fitRadius(id: SysId) {
  const near = SYSTEMS[id].moons.filter((x) => !x.far)
  return near.length ? Math.max(...near.map((x) => x.a * (1 + x.e))) : sysR(id) * 8
}

// ---------------------------------------------------------------------------------------------------------------------
// Frames. Everything is expressed in ecliptic J2000 (the app's heliocentric frame), centred on the planet.
// ---------------------------------------------------------------------------------------------------------------------
const eq2ecl = (v: Vec): Vec => {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY)
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c]
}
const crossV = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Planet-fixed inertial frame in ecliptic coordinates: Z = north pole (IAU), X = ascending node of the equator on the ICRF equator. */
export function planetFrame(id: SysId) {
  const [ra, dec] = SYSTEMS[id].pole.map((x) => x * DEG)
  const Z: Vec = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
  const X: Vec = Math.abs(Math.sin(dec)) > 1 - 1e-12 ? [1, 0, 0] : unit([-Math.sin(ra), Math.cos(ra), 0])
  const Y = crossV(Z, X)
  return { X: eq2ecl(X), Y: eq2ecl(Y), Z: eq2ecl(Z) }
}
export type Frame = ReturnType<typeof planetFrame>
/** Planet-frame vector → ecliptic vector. */
export const toEcl = (f: Frame, v: Vec): Vec => add(add(mul(f.X, v[0]), mul(f.Y, v[1])), mul(f.Z, v[2]))
/** Ecliptic vector → planet-frame vector. */
export const fromEcl = (f: Frame, v: Vec): Vec => [f.X[0] * v[0] + f.X[1] * v[1] + f.X[2] * v[2], f.Y[0] * v[0] + f.Y[1] * v[1] + f.Y[2] * v[2], f.Z[0] * v[0] + f.Z[1] * v[1] + f.Z[2] * v[2]]

/** Rotation angle of the prime meridian about the pole (rad). Earth uses GMST. */
export function spinAngle(id: SysId, t: number) {
  if (id === 'earth') return gmst(t)
  const d = SYSTEMS[id]
  return (d.w0 + d.wRate * (t / DAY)) * DEG
}
/** Unit vector from the planet towards the Sun (ecliptic). */
export const sunDir = (id: SysId, t: number): Vec => unit(mul(bodyState(id, t).r, -1))

// ---------------------------------------------------------------------------------------------------------------------
// Moons
// ---------------------------------------------------------------------------------------------------------------------
/** Moon position in the planet frame (km). */
export function moonPosPlanet(mn: MoonDef, t: number): Vec {
  const M = (mn.L0 - mn.O - mn.w) * DEG + (2 * Math.PI * t) / (mn.P * DAY)
  return elementsToState(mn.a, mn.e, mn.i * DEG, mn.O * DEG, mn.w * DEG, M, 1).r // μ only scales the velocity
}
/** Moon position relative to the planet in ecliptic coordinates (km). */
export function moonPosEcl(id: SysId, mn: MoonDef, t: number, f: Frame = planetFrame(id)): Vec {
  return mn.id === 'moon' ? moonGeoEcliptic(t) : toEcl(f, moonPosPlanet(mn, t))
}
/** One full orbit of a moon in the planet frame (perifocal-sampled). Not used for the Moon (see moonOrbitEcl). */
export function moonOrbitPlanet(mn: MoonDef, n = 240): Vec[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const M = (mn.L0 - mn.O - mn.w) * DEG + (2 * Math.PI * k) / n
    return elementsToState(mn.a, mn.e, mn.i * DEG, mn.O * DEG, mn.w * DEG, M, 1).r
  })
}
/** Kepler's third law: period (s) of a body orbiting mu at semi-major axis a. */
export const keplerPeriod = (a: number, mu: number) => 2 * Math.PI * Math.sqrt((a * a * a) / mu)

// ---------------------------------------------------------------------------------------------------------------------
// Spacecraft orbit around the central body
// ---------------------------------------------------------------------------------------------------------------------
/** Orbit by radii from the body's centre (km), angles in rad, tp = epoch of periapsis passage (s since J2000). */
export interface Orb { rp: number; ra: number; i: number; O: number; w: number; tp: number }
/** User-facing orbit: altitudes above the mean radius (km) and angles in degrees. */
export interface OrbAlt { rpAlt: number; raAlt: number; incDeg: number; nodeDeg: number; argpDeg: number }

export const orbA = (o: Orb) => (o.rp + o.ra) / 2
export const eccOf = (rp: number, ra: number) => (ra - rp) / (ra + rp)
export const apoFromE = (rp: number, e: number) => (rp * (1 + e)) / (1 - e)
export const orbPeriod = (o: Orb, mu: number) => keplerPeriod(orbA(o), mu)
export const vPeri = (o: Orb, mu: number) => visViva(mu, o.rp, orbA(o))
export const vApo = (o: Orb, mu: number) => visViva(mu, o.ra, orbA(o))
/** Specific orbital energy ε = −μ/2a (km²/s²). */
export const energy = (o: Orb, mu: number) => -mu / (2 * orbA(o))

/** Order the radii, clamp to a physical ellipse (e < 0.995) and convert altitudes to radii. */
export function toOrb(alt: OrbAlt, R: number, tp: number): Orb {
  let rp = R + Math.min(alt.rpAlt, alt.raAlt), ra = R + Math.max(alt.rpAlt, alt.raAlt)
  rp = Math.max(rp, 1)
  ra = Math.max(ra, rp)
  if (eccOf(rp, ra) > 0.995) ra = apoFromE(rp, 0.995)
  return { rp, ra, i: alt.incDeg * DEG, O: alt.nodeDeg * DEG, w: alt.argpDeg * DEG, tp }
}
export const toAlt = (o: Orb, R: number): OrbAlt => ({ rpAlt: o.rp - R, raAlt: o.ra - R, incDeg: o.i / DEG, nodeDeg: o.O / DEG, argpDeg: o.w / DEG })

/** Position/velocity in the planet frame (km, km/s) at time t. */
export function orbState(o: Orb, mu: number, t: number) {
  const a = orbA(o), e = eccOf(o.rp, o.ra)
  return elementsToState(a, e, o.i, o.O, o.w, Math.sqrt(mu / (a * a * a)) * (t - o.tp), mu)
}

/** Ellipse (or an arc of it between true anomalies nu0..nu1, rad) in perifocal coordinates, km. */
export function orbitArc(o: Orb, nu0 = 0, nu1 = 2 * Math.PI, n = 240): Vec[] {
  const e = eccOf(o.rp, o.ra), p = o.rp * (1 + e)
  return Array.from({ length: n + 1 }, (_, k) => {
    const nu = nu0 + ((nu1 - nu0) * k) / n, r = p / (1 + e * Math.cos(nu))
    return [r * Math.cos(nu), r * Math.sin(nu), 0] as Vec
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Orbit-adjustment planner: two impulsive burns (Hohmann-style).
//   burn 1 at the old periapsis changes the opposite apsis to the target apogee radius;
//   burn 2, half a transfer orbit later at that new apsis, sets the periapsis (and, combined, the inclination).
// ---------------------------------------------------------------------------------------------------------------------
export interface Burn {
  n: 1 | 2
  name: string
  t: number // epoch
  r: number // radius of the burn point (km from centre)
  vBefore: number; vAfter: number // km/s along the track
  dI: number // plane change in this burn (rad)
  dv: number // km/s
  kg: number // propellant mass for this burn
  after: Orb // orbit that results from this burn (burn 1: the transfer ellipse, burn 2: the final orbit)
}
export interface Plan {
  burns: Burn[] // only burns with Δv > 1 mm/s
  dv: number
  kg: number
  mFinal: number
  tof: number // time between the two burns
  tb1: number; tb2: number
  transfer: Orb
  final: Orb
  same: boolean // target equals current orbit: nothing to do
}

/** Δv of a burn that turns the velocity vector (v1 → v2) through a plane-change angle dI: √(v1²+v2²−2 v1 v2 cos ΔI). */
export const combinedDv = (v1: number, v2: number, dI: number) => Math.sqrt(Math.max(0, v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(dI)))
/** Tsiolkovsky: propellant (kg) needed for a burn of dv (km/s) with total mass m0 (kg). */
export const propFor = (m0: number, dv: number, isp: number) => m0 * (1 - Math.exp(-dv / (isp * G0)))

export function planManeuver(mu: number, from: Orb, to: { rp: number; ra: number; i: number }, tNow: number, m0: number, isp: number): Plan {
  const rp2 = Math.min(to.rp, to.ra), ra2 = Math.max(to.rp, to.ra)
  const rp1 = from.rp
  const T1 = orbPeriod(from, mu)
  // next periapsis passage of the current orbit at or after tNow
  const tb1 = from.tp + Math.ceil((tNow - from.tp) / T1 - 1e-9) * T1
  const aT = (rp1 + ra2) / 2, tT = Math.PI * Math.sqrt((aT * aT * aT) / mu)
  const tb2 = tb1 + tT
  const raising = rp1 <= ra2
  const transfer: Orb = raising
    ? { rp: rp1, ra: ra2, i: from.i, O: from.O, w: from.w, tp: tb1 }
    : { rp: ra2, ra: rp1, i: from.i, O: from.O, w: from.w + Math.PI, tp: tb1 + tT }
  const aF = (rp2 + ra2) / 2
  const final: Orb = { rp: rp2, ra: ra2, i: to.i, O: from.O, w: from.w, tp: tb2 + Math.PI * Math.sqrt((aF * aF * aF) / mu) }

  const v0 = visViva(mu, rp1, orbA(from)), v1 = visViva(mu, rp1, aT)
  const dv1 = Math.abs(v1 - v0)
  const vT = visViva(mu, ra2, aT), vF = visViva(mu, ra2, aF)
  const dI = to.i - from.i
  const dv2 = combinedDv(vT, vF, dI)
  const kg1 = propFor(m0, dv1, isp), kg2 = propFor(m0 - kg1, dv2, isp)
  const burns: Burn[] = []
  if (dv1 > 1e-6) {
    burns.push({
      n: 1, t: tb1, r: rp1, vBefore: v0, vAfter: v1, dI: 0, dv: dv1, kg: kg1, after: transfer,
      name: `Burn 1 — perigeum: apogeum ${v1 > v0 ? 'verhogen' : 'verlagen'} (r = ${Math.round(ra2)} km)`,
    })
  }
  if (dv2 > 1e-6) {
    burns.push({
      n: 2, t: tb2, r: ra2, vBefore: vT, vAfter: vF, dI, dv: dv2, kg: kg2, after: final,
      name: `Burn 2 — apogeum: perigeum ${rp2 > rp1 ? 'verhogen' : rp2 < rp1 ? 'verlagen' : 'houden'}${Math.abs(dI) > 1e-9 ? ' + vlakverandering' : ''}`,
    })
  }
  const kg = kg1 + kg2
  return { burns, dv: dv1 + dv2, kg, mFinal: m0 - kg, tof: tT, tb1, tb2, transfer, final, same: burns.length === 0 }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ship timeline: initial orbit → [transfer → new orbit]*  — evaluated by epoch, so the animation is just a lookup.
// ---------------------------------------------------------------------------------------------------------------------
export interface Seg { t0: number; t1: number; orb: Orb; kind: 'orbit' | 'transfer' }
export function segAt(segs: Seg[], t: number): Seg {
  let s = segs[0]
  for (const x of segs) if (x.t0 <= t) s = x
  return s
}
export function appendPlan(segs: Seg[], plan: Plan): Seg[] {
  const out = segs.map((s) => ({ ...s }))
  const last = out[out.length - 1]
  last.t1 = plan.tb1
  out.push({ t0: plan.tb1, t1: plan.tb2, orb: plan.transfer, kind: 'transfer' })
  out.push({ t0: plan.tb2, t1: Infinity, orb: plan.final, kind: 'orbit' })
  return out
}
export function shipState(segs: Seg[], mu: number, t: number) {
  const s = segAt(segs, t), st = orbState(s.orb, mu, t)
  return { seg: s, ...st, rad: norm(st.r), speed: norm(st.v) }
}

/** Orbit to start from: the mission's arrival orbit if it fits this body, else a circular default. */
export function initialOrbit(
  id: SysId, sol: { arrival: { kind: string; body: BodyId; rp: number; e: number }; tArr: number } | null, tNow: number,
): { alt: OrbAlt; tp: number; src: 'mission' | 'default' } {
  const R = sysR(id)
  // Orientation is not part of the mission model: i = 30° (ISS-like 51.6° at Earth), Ω = 0, ω = 0 (periapsis on the line of nodes,
  // so a plane change at apoapsis is exact).
  const incDeg = id === 'earth' ? 51.6 : 30
  if (sol && sol.arrival.kind !== 'flyby' && sol.arrival.body === id) {
    const e = Math.min(0.995, Math.max(0, sol.arrival.e)), rp = sol.arrival.rp
    const r1 = (x: number) => Math.round(x * 10) / 10
    return { alt: { rpAlt: r1(rp - R), raAlt: r1(apoFromE(rp, e) - R), incDeg, nodeDeg: 0, argpDeg: 0 }, tp: sol.tArr, src: 'mission' }
  }
  return { alt: { rpAlt: 200, raAlt: 200, incDeg, nodeDeg: 0, argpDeg: 0 }, tp: tNow, src: 'default' }
}
