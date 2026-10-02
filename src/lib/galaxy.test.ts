// Run: node --test src/lib/galaxy.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateGalaxy } from '../components/galaxy/generate.ts'
import {
  BODIES, C_KMS, G_LY_YR2, LY_KM, YEAR_S, accelFlip, bodyById, computePlan, fmtYears, galToXyz, gamma, ionBurn, kmsToBeta, xyzToGal,
} from './galaxy.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b}`)
const rel = (a: number, b: number, r: number, msg = '') => near(a / b, 1, r, msg)

test('constants: 1 ly = 9.4607×10¹² km, 1 g = 1.032 ly/yr²', () => {
  rel(LY_KM, 9.4607e12, 1e-4)
  near(G_LY_YR2, 1.0323, 5e-4)
})

test('(l, b, d) → Cartesian: Sgr A* straight ahead, l=90° along rotation, b=90° to the pole', () => {
  const [x, y, z] = galToXyz(0, 0, 26000)
  near(x, 26000, 1e-9); near(y, 0, 1e-9); near(z, 0, 1e-9)
  const p = galToXyz(90, 0, 10); near(p[1], 10, 1e-12); near(p[0], 0, 1e-12)
  const n = galToXyz(0, 90, 10); near(n[2], 10, 1e-12)
  const g = xyzToGal(galToXyz(123.4, -56.7, 99)); near(g.l, 123.4, 1e-9); near(g.b, -56.7, 1e-9); near(g.d, 99, 1e-9)
})

test('catalogue galactic coordinates match SIMBAD (±0.05°)', () => {
  const ref: Record<string, [number, number]> = {
    sirius: [227.23, -8.89], polaris: [123.28, 26.46], vega: [67.44, 19.24], alphacen: [315.73, -0.68],
    cygx1: [71.33, 3.07], etacar: [287.6, -0.63], betelgeuse: [199.79, -8.96], lmc: [280.47, -32.89], m31: [121.17, -21.57],
  }
  for (const [id, [l, b]] of Object.entries(ref)) {
    const o = bodyById(id)!
    near(o.l, l, 0.05, id + ' l'); near(o.b, b, 0.05, id + ' b')
  }
  // Proxima and α Cen are 15 000 AU ≈ 0.24 ly apart in reality
  const a = galToXyz(bodyById('proxima')!.l, bodyById('proxima')!.b, 4.246), c = galToXyz(bodyById('alphacen')!.l, bodyById('alphacen')!.b, 4.37)
  const sep = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])
  assert.ok(sep > 0.1 && sep < 0.3, `sep ${sep}`)
  assert.ok(BODIES.every((o) => o.d > 0 && o.name && o.note))
  near(bodyById('rim')!.d, 76000, 1)
})

test('Lorentz factor and travel time', () => {
  near(gamma(0.5), 1.1547, 1e-4)
  near(gamma(0.9), 2.2942, 1e-4)
  near(kmsToBeta(100000), 0.33356, 1e-5)
  near(kmsToBeta(1e8) , 333.564, 1e-3)
  const p = computePlan({ d: 4.246, model: 'ideal', vKms: C_KMS, ion: { thrustN: 0.1, isp: 3000, powerW: 1000, propKg: 1, dryKg: 1 }, aG: 1 })
  near(p.tEarthYr, 4.246, 1e-9) // at c one year per light-year
  const h = computePlan({ d: 4.246, model: 'ideal', vKms: C_KMS / 2, ion: p.ion as never, aG: 1 })
  near(h.tEarthYr, 8.492, 1e-9)
  near(h.tauYr!, 8.492 / 1.1547, 1e-3)
  // 100 000 km/s to Proxima: 4.246·9.4607e12 km / 1e5 km/s = 4.017e8 s = 12.73 yr
  rel(computePlan({ d: 4.246, model: 'ideal', vKms: 1e5, ion: p.ion as never, aG: 1 }).tEarthYr, 4.017e8 / YEAR_S, 1e-3)
  // Sun → far rim at c: 76 000 years
  near(computePlan({ d: 76000, model: 'ideal', vKms: C_KMS, ion: p.ion as never, aG: 1 }).tEarthYr, 76000, 1e-6)
  // faster than light: no proper time
  const f = computePlan({ d: 100, model: 'ideal', vKms: 1e8, ion: p.ion as never, aG: 1 })
  assert.equal(f.tauYr, null); assert.ok(f.ftl); rel(f.tEarthYr, 100 / 333.564, 1e-4)
})

test('1 g flip-and-burn to Proxima: ≈3.5–3.6 yr on board, ≈5.9 yr on Earth, γ_max ≈ 3.2', () => {
  const r = accelFlip(4.246, 1)
  near(r.tau, 3.54, 0.06); near(r.t, 5.87, 0.06); near(r.gammaPeak, 3.19, 0.02)
  // textbook: 1 g to the Galactic centre (26 000 ly) ≈ 20 yr on board
  const gc = accelFlip(26000, 1)
  near(gc.tau, 19.8, 0.5)
  // the profile reproduces the closed form and is symmetric
  const p = computePlan({ d: 4.246, model: 'accel', vKms: 0, ion: { thrustN: 1, isp: 1, powerW: 1, propKg: 1, dryKg: 1 }, aG: 1 })
  near(p.profile(4.246).t, r.t, 1e-9); near(p.profile(4.246).tau!, r.tau, 1e-9)
  near(p.profile(0).t, 0, 1e-12)
  near(p.profile(2.123).t, r.t / 2, 1e-9); near(p.profile(2.123).beta, r.betaPeak, 1e-9)
  near(p.profile(1).beta, p.profile(3.246).beta, 1e-9)
  let last = -1
  for (let i = 0; i <= 50; i++) { const m = p.profile((4.246 * i) / 50); assert.ok(m.t >= last); last = m.t }
})

test('ion thruster: Tsiolkovsky Δv, ṁ, burn time and burn distance', () => {
  // equal dry and propellant mass → Δv = ve·ln 2
  const a = ionBurn({ thrustN: 0.092, isp: 3100, powerW: 2300, propKg: 500, dryKg: 500 })
  near(a.ve, 30400.6, 0.5)
  near(a.dv, 21072, 5)
  rel(a.mdot, 0.092 / 30400.6, 1e-6)
  near(a.tBurn, 500 / a.mdot, 1)
  near(a.eta, 0.61, 0.02) // NSTAR's published total efficiency is ≈ 0.6
  // numeric integration of the same burn agrees with the closed-form distance
  let m = a.m0, v = 0, s = 0
  const dt = 1000
  for (let t = 0; t < a.tBurn; t += dt) { v = a.ve * Math.log(a.m0 / m); s += v * dt; m -= a.mdot * dt }
  rel(a.sBurn, s, 2e-3)
  // a Dawn-class craft reaches Proxima only after ~10⁵ years
  const p = computePlan({ d: 4.246, model: 'ion', vKms: 0, ion: { thrustN: 0.092, isp: 3100, powerW: 2300, propKg: 425, dryKg: 750 }, aG: 1 })
  near(p.ion!.dv / 1000, 13.66, 0.05)
  assert.ok(p.tEarthYr > 5e4 && p.tEarthYr < 2e5, `${p.tEarthYr}`)
  near(p.tauYr! / p.tEarthYr, 1, 1e-6)
})

test('Dutch time formatting', () => {
  assert.equal(fmtYears(0.01).main, '3,65 dagen')
  assert.equal(fmtYears(5.87).main, '5,87 jaar')
  assert.equal(fmtYears(250).alt, '≈ 2,5 eeuwen')
  assert.equal(fmtYears(76000).alt, '≈ 76 millennia')
  assert.equal(fmtYears(2.54e6).main, '2,54 miljoen jaar')
})

test('procedural Milky Way: ~200 k points, centred on the Galactic centre 2 600 scene units from the Sun', () => {
  const g = generateGalaxy()
  const n = g.main.n + g.local.n
  assert.ok(n > 150000 && n < 240000, `${n}`)
  let sx = 0, sy = 0, maxR = 0
  for (let i = 0; i < g.main.n; i++) {
    const x = g.main.pos[3 * i], y = g.main.pos[3 * i + 1], z = g.main.pos[3 * i + 2]
    assert.ok(Number.isFinite(x + y + z))
    sx += x; sy += Math.abs(y)
    maxR = Math.max(maxR, Math.hypot(x - 2600, z))
  }
  near(sx / g.main.n, 2600, 500)
  assert.ok(sy / g.main.n < 40, 'thin disc: mean |z| < 400 ly')
  assert.ok(maxR < 5300, `rim ${maxR}`)
  const again = generateGalaxy()
  assert.equal(again.main.pos[12345], g.main.pos[12345]) // seeded → deterministic
})
