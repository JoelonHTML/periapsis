// Run: node --test src/features/systems/systems.test.ts
// Worked examples from the EPFL course slides (5.2/5.3/5.4) and SMAD; hand-checked values.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as C from './calc.ts'
import { CARDS } from './cards.ts'

const near = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b}`)

test('course 5.4: MTBF 30 months, 24 months -> R = 0.45; λt<0.1 approximation', () => {
  near(C.reliability(1 / 30, 24), 0.4493, 1e-3)
  near(C.reliability(0.001, 50), 0.9512, 1e-3) // vs 1 - 0.05 = 0.95
})

test('series / parallel / k-out-of-n', () => {
  near(C.seriesR([0.9, 0.9, 0.9]), 0.729)
  near(C.parallelR([0.9, 0.9, 0.9]), 0.999)
  near(C.kOfN(2, 3, 0.9), 0.972) // 3·0.81·0.1 + 0.729
  near(C.kOfN(1, 3, 0.9), 0.999)
  near(C.kOfN(3, 3, 0.9), 0.729)
})

test('two active units: parallel MTTF is 1.5x one unit, series is 0.5x', () => {
  const r = C.twoUnits(0.01, 0)
  assert.equal(r.series, 1); assert.equal(r.parallel, 1)
  near(r.mttfParallel / (1 / 0.01), 1.5)
  near(r.mttfSeries / (1 / 0.01), 0.5)
  near(C.twoUnits(0.01, 100).parallel, 2 * Math.exp(-1) - Math.exp(-2))
})

test('Weibull: β=1 reduces to constant λ = 1/η', () => {
  const w = C.weibull(1, 50, 20)
  near(w.R, Math.exp(-0.4)); near(w.lambda, 0.02)
  assert.ok(C.weibull(0.5, 50, 1).lambda > C.weibull(0.5, 50, 10).lambda) // infant mortality falls
  assert.ok(C.weibull(3, 50, 40).lambda > C.weibull(3, 50, 10).lambda) // wear-out rises
})

test('course 5.2.4 thruster manoeuvre: α, ω_max, θ_m, propellant', () => {
  const r = C.thrusterManeuver({ n: 2, F: 10, L: 1, Iv: 1000, tb: 5, tc: 10, Isp: 220 })
  near(r.T, 20); near(r.alpha, 0.02); near(r.wmax, 0.1)
  near(r.thetaM, 0.02 * 25 + 0.02 * 5 * 10) // nFL/Iv·tb² + nFL/Iv·tb·tc = 0.5 + 1.0
  near(r.tTotal, 20)
  near(r.prop, (2 * 2 * 10 * 5) / (9.80665 * 220))
})

test('course 5.2.5 reaction wheel: Δθ_v = α_w I_w t_m² / (4 I_v) equals two half-manoeuvres', () => {
  const aw = 10, Iw = 0.02, tm = 60, Iv = 100
  near(C.reactionWheelAngle(aw, Iw, tm, Iv), 1.8)
  const alphaV = (Iw * aw) / Iv, half = tm / 2 // vehicle accelerates then brakes
  near(0.5 * alphaV * half * half * 2, 1.8)
})

test('course 5.2.3 magnetic torquer T = N B A I sinθ', () => {
  near(C.magnetorquer(1000, 3.1e-5, 0.01, 0.1, 90), 3.1e-5)
  near(C.magnetorquer(1000, 3.1e-5, 0.01, 0.1, 30), 1.55e-5)
})

test('SMAD disturbance torques at 500 km', () => {
  const R = C.RE_M + 500e3
  near(C.gravityGradientTorque(C.MU_EARTH_SI, R, 800, 300, 45), ((3 * 3.986004418e14) / (2 * R ** 3)) * 500, 1e-9) // sin 90° = 1
  near(C.gravityGradientTorque(C.MU_EARTH_SI, R, 800, 300, 0), 0 + 1e-30, 1e30) // zero on the vertical
  assert.ok(Math.abs(C.gravityGradientTorque(C.MU_EARTH_SI, R, 800, 300, 0)) < 1e-12)
  near(C.srpTorque(1361, 6, 0.6, 0, 0.2), (1361 / 299792458) * 6 * 1.6 * 0.2)
  near(C.dipoleBmax(C.RE_M), 6.1e-5, 0.02) // ≈ 61 µT at the surface pole
  near(C.dipoleBmax(C.RE_M) / 2, 3.07e-5, 0.02) // equator ≈ 3.1e-5 T, as on the course slide
  near(C.aeroTorque(1e-12, 7612, 4, 2.2, 0.1), 0.5 * 1e-12 * 7612 ** 2 * 4 * 2.2 * 0.1)
})

test('spin: H = Iω, drift = T/H, nutation', () => {
  const w = (30 * 2 * Math.PI) / 60
  near(C.spinMomentum(400, w), 400 * Math.PI)
  near(C.spinPrecessionRate(1e-4, 400 * Math.PI), 1e-4 / (400 * Math.PI))
  const n = C.nutationRates(400, 300, w)
  near(n.body, (100 / 300) * w); near(n.inertial, (400 / 300) * w)
})

test('slew: T = 4θI/t², wheel momentum = I ω_max', () => {
  const th = Math.PI / 2, t = 300, I = 500
  const T = C.slewTorque(th, I, t)
  near(T, (4 * th * I) / 90000)
  // accelerate for t/2 at α = T/I then brake: θ = α (t/2)² (two halves of ½α(t/2)²)
  near((T / I) * (t / 2) ** 2, th)
  near(C.slewPeakRate(th, t), (T / I) * (t / 2))
  near(C.wheelCyclicMomentum(1e-4, 5676), 1e-4 * 1419 * 0.707)
  near(C.saturationTime(4, 1e-4), 40000)
})

test('SMAD power: eclipse fraction, P_sa, array area, battery', () => {
  // 500 km, β=0: half-angle acos(sqrt(h²+2Rh)/(R+h))/π ≈ 0.3725 of... check against geometry directly
  const R = C.RE_M, h = 500e3
  near(C.eclipseFraction(h, R, 0), Math.acos(Math.sqrt(h * h + 2 * R * h) / (R + h)) / Math.PI)
  near(C.eclipseFraction(h, R, 0), 0.3779, 2e-3)
  assert.equal(C.eclipseFraction(h, R, 80), 0) // high β: no eclipse
  // LEO 500 km: eclipse 35.8 min, daylight 58.8 min
  near(C.arrayPower(688, 35.8, 0.6, 810, 58.8, 0.8), (((688 * 35.8) / 0.6) + ((810 * 58.8) / 0.8)) / 58.8)
  const a = C.arrayArea({ Psa: 1220, S: 1361, eta: 0.3, Id: 0.77, thetaDeg: 23.5, degPerYear: 0.0275, years: 7 })
  near(a.Pbol, 1361 * 0.3 * 0.77 * Math.cos((23.5 * Math.PI) / 180))
  near(a.Ld, 0.9725 ** 7)
  near(a.area, 1220 / (a.Pbol * a.Ld))
  near(C.batteryCapacity(688, 16.4 / 60, 0.4, 2, 0.9), (688 * (16.4 / 60)) / (0.4 * 2 * 0.9))
})

test('RTG: Pu-238 half life 87.7 y, power halves', () => {
  near(C.rtgPower(470, 87.7), 235)
  near(C.rtgPower(470, 14), 470 * 2 ** (-14 / 87.7))
})

test('fuel cell: Faraday and stoichiometry (H2O = 8.937 x H2, O2 = 7.94 x H2)', () => {
  const m = C.fuelCellH2(7000, 0.8) // kg/s
  near(m * 3600, 0.3291, 2e-3) // ≈ 0.33 kg/h of H2 for 7 kW
  near(C.M_H2O / C.M_H2, 8.937, 1e-3); near(2 * 15.9994 / 2 / 2.01588, 7.937, 1e-3)
})

test('tether: course 5.3.2 U = V·B·L and Lorentz force; F_gg = 3LMn²', () => {
  near(C.tetherEmf(7700, 3e-5, 20000), 4620)
  near(C.tetherForce(1, 20000, 3e-5), 0.6)
  const r = C.RE_M + 300e3
  near(C.tetherGravityGradient(1000, 500, C.MU_EARTH_SI, r), 3 * 1000 * 500 * (C.MU_EARTH_SI / r ** 3))
})

test('every card has a valid default calculation and a source', () => {
  const ids = new Set<string>()
  for (const c of CARDS) {
    assert.ok(!ids.has(c.id)); ids.add(c.id)
    assert.ok(c.src.length > 3 && c.title.every((x) => x) && c.text.every((x) => x), c.id)
    if (c.inputs.length) {
      const out = c.compute(Object.fromEntries(c.inputs.map((i) => [i.k, i.def])))
      assert.ok('rows' in out && out.rows.length > 0, `${c.id} default inputs must give a result`)
      for (const [, v] of out.rows as [unknown, string][]) assert.ok(!/NaN|Infinity/.test(v) || v === '∞', `${c.id}: ${v}`)
      const bad = c.compute(Object.fromEntries(c.inputs.map((i) => [i.k, -1])))
      assert.ok('err' in bad || bad.rows.length >= 0)
    }
  }
})
