// Spacecraft systems: attitude control, electrical power, reliability. Pure SI functions (m, kg, s, W, N, T), no UI.
// Sources: EPFL "Space Mission Design and Operations" (Nicollier) 5.2 / 5.3 / 5.4 after C.D. Brown, Elements of Spacecraft Design;
// Wertz & Larson SMAD ch. 10-11 and Fortescue, Spacecraft Systems Engineering for the parts the slides do not give (marked "SMAD" in cards.ts).
export const G0 = 9.80665
export const C_LIGHT = 299792458
export const MU_EARTH_SI = 3.986004418e14 // m³/s²
export const RE_M = 6378137
export const S_SUN = 1361 // W/m² at 1 AU
export const M_DIPOLE = 7.96e15 // T·m³: Earth dipole constant used by SMAD (B_equator = M/R³, B_pole = 2M/R³). IGRF-2020 gives ≈ 7.6e15, so this is ~5 % conservative
export const PU238_HALF_LIFE_YR = 87.7
export const F_FARADAY = 96485.33212 // C/mol
export const M_H2 = 2.01588e-3 // kg/mol
export const M_H2O = 18.01528e-3

const rad = (d: number) => (d * Math.PI) / 180

// ------------------------------------------------------------------ Attitude: disturbance torques (SMAD)
/** Gravity-gradient torque on a body with principal inertias Iz, Iy at orbit radius R, angle θ from local vertical. */
export const gravityGradientTorque = (mu: number, R: number, Iz: number, Iy: number, thetaDeg: number) =>
  ((3 * mu) / (2 * R ** 3)) * Math.abs(Iz - Iy) * Math.abs(Math.sin(2 * rad(thetaDeg)))
/** Solar-radiation-pressure torque: (Fs/c) As (1+q) cos(i) · (c_ps − c_g). */
export const srpTorque = (Fs: number, As: number, q: number, incDeg: number, arm: number) => (Fs / C_LIGHT) * As * (1 + q) * Math.cos(rad(incDeg)) * arm
/** Residual-dipole magnetic torque D·B. */
export const magneticDisturbance = (D: number, B: number) => D * B
/** Worst-case (polar) dipole field strength at radius R: 2M/R³. */
export const dipoleBmax = (R: number, M = M_DIPOLE) => (2 * M) / R ** 3
/** Aerodynamic torque ½ρV²·A·Cd·(c_p − c_g). */
export const aeroTorque = (rho: number, V: number, A: number, Cd: number, arm: number) => 0.5 * rho * V * V * A * Cd * arm
export const orbitPeriod = (mu: number, R: number) => 2 * Math.PI * Math.sqrt(R ** 3 / mu)

// ------------------------------------------------------------------ Attitude: spin, slew, wheel sizing (SMAD ch. 11)
/** Angular momentum of a spinner, H = I·ω (ω in rad/s). */
export const spinMomentum = (I: number, w: number) => I * w
/** Torque-driven drift of the spin axis: dθ/dt = T/H (rad/s). */
export const spinPrecessionRate = (T: number, H: number) => T / H
/** Nutation of an axisymmetric spinner: body-frame rate λ·ω_s with λ = (Is−It)/It; inertial rate Is·ω_s/It. */
export const nutationRates = (Is: number, It: number, ws: number) => ({ body: ((Is - It) / It) * ws, inertial: (Is / It) * ws })
/** Rest-to-rest slew by θ in time t (accelerate t/2, brake t/2, constant torque): T = 4θI/t². */
export const slewTorque = (thetaRad: number, I: number, t: number) => (4 * thetaRad * I) / (t * t)
/** Peak body rate of that slew, ω_max = 2θ/t (= T·t/(2I)). */
export const slewPeakRate = (thetaRad: number, t: number) => (2 * thetaRad) / t
/** Wheel momentum storage for a cyclic (sinusoidal) disturbance, SMAD: H = T_d·(P/4)·0.707. */
export const wheelCyclicMomentum = (Td: number, P: number) => Td * (P / 4) * 0.707
/** Time until a wheel with capacity H saturates under a secular (constant) torque. */
export const saturationTime = (H: number, Tsec: number) => H / Tsec

// ------------------------------------------------------------------ Attitude: actuators (course 5.2)
/** Magnetic torquer, T = N B A I sin θ. */
export const magnetorquer = (N: number, B: number, A: number, I: number, thetaDeg: number) => N * B * A * I * Math.sin(rad(thetaDeg))
/** One-axis thruster manoeuvre: accelerate for tb, coast for tc, brake for tb. */
export function thrusterManeuver(p: { n: number; F: number; L: number; Iv: number; tb: number; tc: number; Isp: number }) {
  const T = p.n * p.F * p.L
  const alpha = T / p.Iv
  const wmax = alpha * p.tb
  const thetaM = alpha * p.tb ** 2 + alpha * p.tb * p.tc // = nFL/Iv·tb² + nFL/Iv·tb·tc
  const tTotal = 2 * p.tb + p.tc
  const prop = (2 * p.n * p.F * p.tb) / (G0 * p.Isp) // m_p = 2 tb · ṁ_p, ṁ_p = nF/(g Isp)
  return { T, alpha, wmax, thetaM, tTotal, prop }
}
/** Spacecraft rotation by a reaction wheel accelerated for tm/2 and decelerated for tm/2: Δθ_v = α_w I_w tm² / (4 I_v). */
export const reactionWheelAngle = (alphaW: number, Iw: number, tm: number, Iv: number) => (alphaW * Iw * tm * tm) / (4 * Iv)
/** Propellant to dump a stored momentum H with thrusters at lever arm L (impulse F·dt = H/L). */
export const dumpPropellant = (H: number, L: number, Isp: number) => H / (L * Isp * G0)

// ------------------------------------------------------------------ Power: solar array / battery / orbit
/** Fraction of a circular orbit in eclipse (cylindrical shadow), altitude h and radius R of the planet (same unit), beta angle. */
export function eclipseFraction(h: number, Rp: number, betaDeg: number) {
  const r = Rp + h, cb = Math.cos(rad(betaDeg))
  const x = Math.sqrt(h * h + 2 * Rp * h) / (r * cb)
  return x >= 1 ? 0 : Math.acos(x) / Math.PI
}
/** Array output the array must generate: P_sa = (Pe Te/Xe + Pd Td/Xd)/Td  (SMAD, direct-energy-transfer paths Xd, Xe). */
export const arrayPower = (Pe: number, Te: number, Xe: number, Pd: number, Td: number, Xd: number) => (((Pe * Te) / Xe) + ((Pd * Td) / Xd)) / Td
/** Specific power at BOL: P0 = S·η, P_BOL = P0·Id·cos θ; life degradation Ld = (1−d)^years. */
export function arrayArea(p: { Psa: number; S: number; eta: number; Id: number; thetaDeg: number; degPerYear: number; years: number }) {
  const P0 = p.S * p.eta
  const Pbol = P0 * p.Id * Math.cos(rad(p.thetaDeg))
  const Ld = (1 - p.degPerYear) ** p.years
  const Peol = Pbol * Ld
  return { P0, Pbol, Ld, Peol, area: p.Psa / Peol }
}
/** Battery capacity Cr = Pe Te / (DOD · N · n) in Wh (Pe W, Te hours). */
export const batteryCapacity = (Pe: number, TeHours: number, dod: number, N: number, n: number) => (Pe * TeHours) / (dod * N * n)
/** RTG thermal/electrical power after t years of Pu-238 decay: P0 · 2^(−t/t½). */
export const rtgPower = (P0: number, years: number, halfLife = PU238_HALF_LIFE_YR) => P0 * 2 ** (-years / halfLife)
/** H2 mass flow of a hydrogen/oxygen fuel cell at electrical power P and cell voltage Vc: P·M/(2F·Vc). Water output is 8.937× that. */
export const fuelCellH2 = (P: number, Vc: number) => (P * M_H2) / (2 * F_FARADAY * Vc)
/** Faraday: motional EMF of a tether, U = (V × B)·L; perpendicular case magnitude. */
export const tetherEmf = (V: number, B: number, L: number, angleDeg = 90) => V * B * L * Math.sin(rad(angleDeg))
/** Lorentz force on a tether carrying current I (perpendicular): F = I·L·B. */
export const tetherForce = (I: number, L: number, B: number) => I * L * B
/** Gravity-gradient tension of a tether end mass at distance L from the centre of mass: F_gg ≈ 3 L M n². */
export const tetherGravityGradient = (L: number, M: number, mu: number, r: number) => 3 * L * M * (mu / r ** 3)

// ------------------------------------------------------------------ Reliability (course 5.4)
export const reliability = (lambda: number, t: number) => Math.exp(-lambda * t)
export const mtbfToLambda = (mtbf: number) => 1 / mtbf
export const seriesR = (rs: number[]) => rs.reduce((a, r) => a * r, 1)
export const parallelR = (rs: number[]) => 1 - rs.reduce((a, r) => a * (1 - r), 1)
const choose = (n: number, k: number) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return c }
/** At least k of n identical independent units (each reliability r) work. */
export function kOfN(k: number, n: number, r: number) {
  let s = 0
  for (let i = k; i <= n; i++) s += choose(n, i) * r ** i * (1 - r) ** (n - i)
  return s
}
/** Two identical units with constant failure rate λ: series (both needed) and active parallel (one needed). */
export function twoUnits(lambda: number, t: number) {
  const r = Math.exp(-lambda * t)
  return { series: r * r, parallel: 2 * r - r * r, mttfSeries: 1 / (2 * lambda), mttfParallel: 3 / (2 * lambda) }
}
/** Series system of independent units with constant λ_i: λ_s = Σλ_i. */
export const seriesLambda = (ls: number[]) => ls.reduce((a, l) => a + l, 0)
/** Weibull model for the bathtub phases: R = exp(−(t/η)^β), λ(t) = (β/η)(t/η)^(β−1). β<1 infant mortality, =1 useful life, >1 wear-out. */
export const weibull = (beta: number, eta: number, t: number) => ({ R: Math.exp(-((t / eta) ** beta)), lambda: (beta / eta) * (t / eta) ** (beta - 1) })
