import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as C from './calc.ts'
import { AU, MU_EARTH, MU_SUN, RE, density, departDv } from './astro.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`)
const rel = (a: number, b: number, tol: number, msg = '') => near(a / b, 1, tol, msg)

test('Hohmann Earth -> Mars (textbook values)', () => {
  const h = C.hohmannFull(MU_SUN, AU, 1.524 * AU)
  near(h.vt1, 32.73, 0.02, 'v transfer at Earth')
  near(h.dv1, 2.94, 0.02, 'dv1')
  near(h.dv2, 2.65, 0.03, 'dv2')
  near(h.tof / 86400, 259, 1, 'TOF days')
  near(h.phase, 44.3, 0.7, 'phase angle')
  near(h.synodic / 86400, 780, 3, 'synodic')
})

test('synodic periods', () => {
  near(C.synodicPeriod(224.701, 365.256), 583.9, 0.1)
  near(C.synodicPeriod(365.256, 686.98), 779.9, 0.2)
})

test('circular / escape / GEO', () => {
  near(C.vEsc(MU_EARTH, 6378.137), 11.180, 0.001) // equatorial radius
  near(C.vEsc(MU_EARTH, 6371), 11.186, 0.001) // mean radius (the textbook 11.186)
  near(C.vCirc(MU_EARTH, 42164.17), 3.0747, 0.001)
  near(C.orbitPeriod(MU_EARTH, 42164.17) / 3600, 23.934, 0.01)
  rel(C.semiMajorFromPeriod(MU_EARTH, 86164.09), 42164.17, 1e-4)
})

test('ellipse from radii (Molniya-like, GTO)', () => {
  const g = C.ellipseFromRadii(MU_EARTH, RE + 250, RE + 35786) // GTO
  near(g.vp, 10.195, 0.01)
  near(g.va, 1.60, 0.02) // textbook GTO apogee speed
  near(g.T / 3600, 10.5, 0.1)
  near(g.energy, -MU_EARTH / (2 * g.a), 1e-9)
})

test('Hohmann LEO -> GEO around Earth', () => {
  const h = C.hohmannFull(MU_EARTH, RE + 300, 42164)
  near(h.dv1, 2.43, 0.03)
  near(h.dv2, 1.47, 0.03)
  near(h.tof / 3600, 5.27, 0.05)
})

test('bi-elliptic vs Hohmann', () => {
  const R = 20, mu = 1
  const hoh = (Math.sqrt((2 * R) / (1 + R)) - 1) + (1 / Math.sqrt(R)) * (1 - Math.sqrt(2 / (1 + R)))
  near(C.hohmannFull(mu, 1, R).dv, hoh, 1e-9)
  near(hoh, 0.5347, 1e-3)
  const bi = C.biElliptic(mu, 1, R, 100)
  assert.ok(bi.dv < hoh, 'bi-elliptic wins for R=20')
  assert.ok(C.biElliptic(mu, 1, 5, 20).dv > C.hohmannFull(mu, 1, 5).dv, 'Hohmann wins for R=5')
})

test('plane change', () => {
  near(C.planeChange(7.5, Math.PI / 3), 7.5, 1e-12) // 60° -> chord = v
  near(C.combinedChange(7, 7, 0.3), C.planeChange(7, 0.3), 1e-12)
  near(C.combinedChange(7, 9, 0), 2, 1e-12)
  near(C.edelbaum(7.669, 3.075, 0), 4.594, 1e-3)
})

test('SOI and Hill sphere of Earth', () => {
  const soi = C.soiRadius(AU, MU_EARTH, MU_SUN)
  rel(soi, 925000, 0.01)
  rel(C.hillRadius(AU, MU_EARTH, MU_SUN), 1.5e6, 0.01)
})

test('v-infinity / C3 / departure dv', () => {
  const r = RE + 300
  near(departDv(0, r), (Math.SQRT2 - 1) * Math.sqrt(MU_EARTH / r), 1e-9)
  for (const vinf of [0.5, 3.5, 8]) near(C.vinfFromDv(departDv(vinf, r), r, MU_EARTH), vinf, 1e-9)
  assert.ok(Number.isNaN(C.vinfFromDv(1, r, MU_EARTH)), 'below escape -> NaN')
  const e = C.hypEcc(r, 3.5, MU_EARTH)
  near(e, 1 + (r * 3.5 * 3.5) / MU_EARTH, 1e-12)
})

test('gravity assist deflection', () => {
  const g = C.flyby(3, RE + 200, MU_EARTH)
  near(g.e, 1.1485, 1e-3)
  near(g.delta / (Math.PI / 180), 121.1, 0.2)
  near(g.dvEq, (2 * 3) / g.e, 1e-12)
  near(g.vp, Math.sqrt(9 + (2 * MU_EARTH) / (RE + 200)), 1e-12)
})

test('Tsiolkovsky round trips', () => {
  const base = C.rocketSolve('dv', { dv: 0, isp: 300, m0: 1000, mf: 400 })
  near(base.dv, 300 * 9.80665 * Math.log(2.5), 1e-9)
  near(base.dv, 2695.7, 0.1)
  near(base.mp, 600, 1e-9)
  near(base.fraction, 0.6, 1e-12)
  near(C.rocketSolve('isp', { dv: base.dv, isp: 0, m0: 1000, mf: 400 }).isp, 300, 1e-9)
  near(C.rocketSolve('m0', { dv: base.dv, isp: 300, m0: 0, mf: 400 }).m0, 1000, 1e-9)
  near(C.rocketSolve('mf', { dv: base.dv, isp: 300, m0: 1000, mf: 0 }).mf, 400, 1e-9)
})

test('burn sequence adds up to one burn of the total dv', () => {
  const s = C.burnSequence(5000, 320, [3200, 800, 450])
  const one = C.rocketSolve('mf', { dv: 4450, isp: 320, m0: 5000, mf: 0 })
  near(s.final, one.mf, 1e-9)
  near(s.prop, one.mp, 1e-9)
  near(s.steps[0].before, 5000, 0)
  near(s.steps[1].before, s.steps[0].after, 0)
})

test('slew: example from the brief', () => {
  const s = C.slew({ theta: Math.PI, F: 10, n: 2, d: 1, I: 1000 })
  near(s.tau, 20, 1e-12)
  near(s.alpha, 0.02, 1e-12)
  near(s.t, 25.07, 0.01)
  near(s.w, 0.02 * s.t / 2, 1e-12)
  const lim = C.slew({ theta: Math.PI, F: 10, n: 2, d: 1, I: 1000, wMax: 0.1, isp: 220 })
  assert.ok(lim.limited)
  near(lim.t, Math.PI / 0.1 + 0.1 / 0.02, 1e-9)
  near(lim.tBurn, 10, 1e-9)
  near(lim.prop, (2 * 10 * 10) / (220 * 9.80665), 1e-9)
  const loose = C.slew({ theta: Math.PI, F: 10, n: 2, d: 1, I: 1000, wMax: 1 })
  assert.ok(!loose.limited)
  near(loose.t, 25.07, 0.01)
})

test('moments of inertia', () => {
  near(C.inertia.cylinder(1000, 1, 3), 1000, 1e-9)
  near(C.inertia.box(600, 2, 1), 250, 1e-9)
  near(C.inertia.sphere(1000, 1), 400, 1e-9)
})

test('Earth dipole', () => {
  const eq = C.dipoleField(RE, 0, C.B0_EARTH, RE)
  near(eq.B * 1e6, 31.2, 1e-9)
  near(C.dipoleField(2 * RE, 0, C.B0_EARTH, RE).B * 1e6, 3.9, 1e-9)
  const pole = C.dipoleField(RE, 90, C.B0_EARTH, RE)
  near(pole.B, 2 * eq.B, 1e-15)
  near(pole.Br, -2 * eq.B, 1e-15)
  near(Math.hypot(pole.Br, pole.Bl), pole.B, 1e-15)
  const mid = C.dipoleField(7000, 40, C.B0_EARTH, RE)
  near(Math.hypot(mid.Br, mid.Bl), mid.B, 1e-15)
  near(mid.L, 7000 / (RE * Math.cos(40 * Math.PI / 180) ** 2), 1e-9)
  near(C.dipoleB0FromMoment(C.M_EARTH, 6371.2) * 1e6, 30.7, 0.1) // μ0 M / (4π R³)
})

test('geomagnetic latitude', () => {
  near(C.magneticLatitude(80.65, -72.68), 90, 1e-9)
  near(C.magneticLatitude(-80.65, 107.32), -90, 1e-9)
  near(C.magneticLatitude(0, 107.32), -9.34, 0.03) // sinλ = -cos(80.65°)
  near(C.magneticLatitude(52, 5), 53.0, 0.1) // hand calc: sinλ = 0.7988
})

test('ballistic coefficient and drag', () => {
  near(C.ballistic(1000, 2.2, 5), 1000 / 11, 1e-12)
  near(density(400), 3.725e-12, 1e-15)
  const v = Math.sqrt(MU_EARTH / (RE + 400)) * 1000
  near(C.dragDecel(density(400), v, 100), 1.095e-6, 5e-9)
})

test('light time and solar flux / temperature', () => {
  near(C.lightTime(AU), 499.005, 0.001)
  near(C.solarFlux(1), 1361, 1)
  near(C.solarFlux(1.524), 586, 2)
  near(C.equilibriumTemp(C.solarFlux(1), 1, 1, 0.25), 278.3, 0.3)
  near(C.equilibriumTemp(1361, 1, 1, 1) / C.equilibriumTemp(1361, 1, 1, 0.5), 2 ** 0.25, 1e-12)
})

test('needPositive guard', () => {
  assert.equal(C.needPositive(['a', 1], ['b', 2]), null)
  assert.match(C.needPositive(['Massa', 0])!, /Massa/)
  assert.ok(C.needPositive(['x', NaN]))
})
