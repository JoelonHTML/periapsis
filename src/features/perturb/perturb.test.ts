// Run: node --test src/features/perturb/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, DEG, MU_EARTH, RE, captureDv, decayLifetime, j2Rates } from '../../lib/astro.ts'
import { ALL_FORCES, NO_FORCES, accel, createSimFromElements, sunAt, elementsOf, simulate, slope, type CraftParams, type Forces } from './propagate.ts'
import { densityF107 } from './atmo.ts'
import { parseFlux } from './flux.ts'
import { aerobrake, aerocapture } from './aero.ts'

const P: CraftParams = { cd: 2.2, area: 10, mass: 1000, cr: 1.3, f107: 150 }
const T0 = 8.0e8 // s since J2000 (2025-ish), arbitrary
const opts = (days: number, period: number, rtol = 1e-10) => ({ span: days * DAY, sampleDt: Math.max(days * DAY / 100, 2 * period), rtol, hMax: Math.min(600, period / 8), decayAlt: 100 })
const period = (a: number) => 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH)

function run(alt: number, e: number, incDeg: number, F: Forces, days: number, p = P, rtol = 1e-10) {
  const a = (RE + alt) / (1 - e)
  const sim = createSimFromElements(T0, a, e, incDeg * DEG, 40 * DEG, 30 * DEG, 0, F, p, opts(days, period(a), rtol))
  return simulate(sim)
}
const raanRate = (sim: ReturnType<typeof run>) => slope(sim.samples.map((s) => s.t), sim.samples.map((s) => s.raan)) * DAY // deg/day

test('two-body energy conserved to 1e-8 over 10 orbits (eccentric orbit)', () => {
  const a = 12000, e = 0.3
  const sim = createSimFromElements(T0, a, e, 40 * DEG, 10 * DEG, 20 * DEG, 0.5, NO_FORCES, P, { ...opts(1, period(a), 1e-12), span: 10 * period(a) })
  const e0 = elementsOf(sim.y).energy
  simulate(sim)
  const e1 = elementsOf(sim.y).energy
  assert.ok(Math.abs((e1 - e0) / e0) < 1e-8, `dE/E = ${(e1 - e0) / e0}`)
  assert.ok(Math.abs(sim.t - sim.t0 - 10 * period(a)) < 1e-3)
})

test('zonal acceleration matches the textbook J2 formula', () => {
  const y = [5000, -3000, 4000, 0, 0, 0], out = [0, 0, 0]
  accel(T0, y, { ...NO_FORCES, central: false, j2: true }, P, out)
  const [x, yy, z] = y, r = Math.hypot(x, yy, z), k = -1.5 * 1.08262668e-3 * MU_EARTH * RE ** 2 / r ** 4
  const ref = [k * (x / r) * (1 - 5 * z * z / (r * r)), k * (yy / r) * (1 - 5 * z * z / (r * r)), k * (z / r) * (3 - 5 * z * z / (r * r))]
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(out[i] - ref[i]) < 1e-12 * Math.abs(ref[i]) + 1e-18, `${i}: ${out[i]} vs ${ref[i]}`)
})

test('J2-only RAAN drift, ISS-like orbit, vs analytic (within 2 %)', () => {
  const sim = run(420, 0.0005, 51.64, { ...NO_FORCES, j2: true }, 10)
  const num = raanRate(sim)
  const ana = (j2Rates(RE + 420, 0.0005, 51.64 * DEG).dO * DAY) / DEG
  assert.ok(Math.abs(num / ana - 1) < 0.02, `numeric ${num} analytic ${ana}`)
  assert.ok(Math.abs(ana + 5) < 0.1, `analytic ${ana} should be about -5 deg/day`)
})

test('sun-synchronous 700 km / 98.2 deg drifts about +0.9856 deg/day', () => {
  const sim = run(700, 0.0001, 98.2, { ...NO_FORCES, j2: true }, 10)
  const num = raanRate(sim)
  assert.ok(Math.abs(num - 0.9856) < 0.02, `drift ${num}`)
})

test('drag lowers a 300 km orbit; higher F10.7 decays faster', () => {
  const F = { ...NO_FORCES, j2: true, drag: true }
  const lo = run(300, 0.0005, 51.6, F, 5, { ...P, f107: 70 }, 1e-9)
  const mid = run(300, 0.0005, 51.6, F, 5, { ...P, f107: 150 }, 1e-9)
  const hi = run(300, 0.0005, 51.6, F, 5, { ...P, f107: 250 }, 1e-9)
  const drop = (s: ReturnType<typeof run>) => s.samples[0].ra - s.samples[s.samples.length - 1].ra
  assert.ok(drop(mid) > 0, 'orbit should decay')
  assert.ok(drop(lo) < drop(mid) && drop(mid) < drop(hi), `drops ${drop(lo)} ${drop(mid)} ${drop(hi)}`)
  const nodrag = run(300, 0.0005, 51.6, { ...NO_FORCES, j2: true }, 5, P, 1e-9)
  assert.ok(Math.abs(drop(nodrag)) < 0.5, `no-drag drop ${drop(nodrag)}`)
})

test('density: scaling with F10.7 is monotonic, reference at F=150 equals the table', () => {
  assert.equal(densityF107(400, 150), densityF107(400, 150))
  assert.ok(Math.abs(densityF107(400, 150) / 3.725e-12 - 1) < 1e-9)
  const r = densityF107(400, 250) / densityF107(400, 70)
  assert.ok(r > 5 && r < 300, `ratio ${r}`)
  assert.equal(densityF107(100, 70), densityF107(100, 250)) // below 120 km unscaled
})

test('re-entry is detected when a low orbit decays within the span', () => {
  const sim = run(180, 0.0005, 51.6, { ...NO_FORCES, drag: true }, 30, { ...P, f107: 200 }, 1e-9)
  assert.ok(sim.decayT !== null && sim.decayT > 0 && sim.decayT < 30 * DAY, `decay ${sim.decayT}`)
  // same order of magnitude as the app's circular-orbit lifetime estimate (different density scaling, so loose)
  const est = decayLifetime(180, (P.cd * P.area) / P.mass)
  assert.ok(sim.decayT! / est > 0.1 && sim.decayT! / est < 10, `${sim.decayT} vs ${est}`)
})

test('SRP: zero in the Earth shadow, ~P Cr A/m in sunlight, tiny for a dense craft', () => {
  const rs = sunAt(T0), d = Math.hypot(rs[0], rs[1], rs[2]), u = rs.map((x) => x / d)
  const F = { ...NO_FORCES, srp: true, central: false }
  const mag = (a: number[]) => Math.hypot(a[0], a[1], a[2])
  const night = [0, 0, 0], day = [0, 0, 0], light = [0, 0, 0], j2 = [0, 0, 0]
  accel(T0, [-7000 * u[0], -7000 * u[1], -7000 * u[2], 0, 0, 0], F, P, night)
  assert.equal(mag(night), 0)
  const dense = { ...P, mass: 1000, area: 1 } // A/m = 1e-3 m²/kg
  accel(T0, [7000 * u[0], 7000 * u[1], 7000 * u[2], 0, 0, 0], F, dense, day)
  const expected = (1361 / 299792458) * 1.3 * 1e-3 / 1000 * (149597870.7 / (d - 7000)) ** 2 // km/s²
  assert.ok(Math.abs(mag(day) / expected - 1) < 1e-9, `${mag(day)} vs ${expected}`)
  accel(T0, [7000 * u[0], 7000 * u[1], 7000 * u[2], 0, 0, 0], F, { ...P, mass: 10, area: 10 }, light)
  assert.ok(mag(light) > 900 * mag(day))
  accel(T0, [7000, 0, 0, 0, 0, 0], { ...NO_FORCES, central: false, j2: true }, P, j2)
  assert.ok(mag(day) / mag(j2) < 1e-5, `SRP/J2 = ${mag(day) / mag(j2)}`)
  // over 2 days SRP changes the mean semi-major axis of a dense craft by far less than 10 m
  const withS = run(700, 0.001, 60, { ...NO_FORCES, j2: true, srp: true }, 2, dense)
  const without = run(700, 0.001, 60, { ...NO_FORCES, j2: true }, 2, dense)
  const da = Math.abs(withS.samples[withS.samples.length - 1].a - without.samples[without.samples.length - 1].a)
  assert.ok(da < 0.01, `da = ${da} km`)
})

test('lunisolar third-body acceleration is small but non-zero at GEO', () => {
  const o = [0, 0, 0]
  accel(T0, [42164, 0, 0, 0, 3.07, 0], { ...NO_FORCES, central: false, sun: true, moon: true }, P, o)
  const m = Math.hypot(o[0], o[1], o[2])
  assert.ok(m > 1e-10 && m < 1e-8, `a = ${m} km/s²`) // order 1e-9 km/s² = 1e-6 m/s²
})

test('combined run with every force is finite and keeps the sample grid', () => {
  const sim = run(550, 0.001, 53, ALL_FORCES, 3, P, 1e-9)
  assert.ok(sim.samples.length >= 3)
  assert.ok(sim.samples.every((s) => Number.isFinite(s.rp) && Number.isFinite(s.raan)))
})

test('NOAA flux parser: defensive', () => {
  assert.deepEqual(parseFlux([{ time_tag: '2025-01-01T00:00:00', flux: 150 }, { time_tag: '2025-01-03T00:00:00', flux: '172.5' }, { time_tag: '2025-01-02T00:00:00', flux: 160 }]), { f107: 172.5, time: '2025-01-03T00:00:00' })
  assert.equal(parseFlux({ data: [{ f107: 99 }] }).f107, 99)
  assert.equal(parseFlux([{ Flux_value: 120 }]).f107, 120)
  assert.throws(() => parseFlux({}))
  assert.throws(() => parseFlux([{ flux: 'x' }, { flux: 5 }]))
  assert.throws(() => parseFlux('<html>'))
})

test('aerocapture: Δv saved equals the propulsive captureDv; Allen–Eggers formula', () => {
  const R = 3389.5, mu = 42828.4
  const r = aerocapture({ mu, radius: R, vinf: 2.7, raAlt: 20000, rpAlt: 300, entryAlt: 125, passAlt: 40, m: 2000, cd: 1.5, area: 10, rho0: 0.02, H: 11.1 })
  const eT = (R + 20000 - (R + 300)) / (R + 20000 + R + 300)
  assert.equal(r.dvSaved, captureDv(2.7, R + 300, mu, eT))
  assert.ok(r.dvSaved > 0.5 && r.dvSaved < 2)
  assert.ok(Math.abs(r.beta - 2000 / 15) < 1e-9)
  // a_max = v_e² sin(γ) / (2 e H)
  assert.ok(Math.abs(r.aMax - ((r.ve * 1000) ** 2 * Math.sin(r.gamma)) / (2 * Math.E * 11100)) < 1e-9)
  assert.ok(r.dvAtm > 0 && r.dvNet < r.dvSaved && r.gamma > 0 && r.gamma < 0.5)
  // energy: atmosphere removes the difference between hyperbola and exit orbit at periapsis
  assert.ok(Math.abs(r.vPass - r.vExit - r.dvAtm) < 1e-12)
})

test('aerobraking: passes, total Δv equals the propulsive apoapsis change', () => {
  const R = 3389.5, mu = 42828.4
  const r = aerobrake({ mu, radius: R, raStartAlt: 20000, raEndAlt: 1000, rpAlt: 110, dvPass: 2, m: 1000, cd: 2.2, area: 10, H: 7 })
  assert.ok(r.reached && r.n > 10)
  assert.ok(r.n * 2e-3 >= r.dvTotal - 1e-9 && (r.n - 1) * 2e-3 < r.dvTotal)
  assert.ok(r.time > 0 && r.rhoP > 0 && r.heat > 0)
  const r2 = aerobrake({ mu, radius: R, raStartAlt: 20000, raEndAlt: 1000, rpAlt: 110, dvPass: 4, m: 1000, cd: 2.2, area: 10, H: 7 })
  assert.ok(r2.n <= Math.ceil(r.n / 2) + 1)
})
