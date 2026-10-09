import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as K from './course.ts'
import { AU, DEG, J2, MU_EARTH, MU_MOON, MU_SUN, RE, departDv } from './astro.ts'
import { flyby, hohmannFull, soiRadius, vCirc } from './calc.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`)

test('3.3.1 geostationary orbit (EPFL slides: r = 42 164.2 km, V = 3.0747 km/s, 17.4°)', () => {
  const r = K.geoRadius()
  near(r, 42164.2, 0.1, 'r')
  near(vCirc(MU_EARTH, r), 3.0747, 0.0005, 'v')
  near(K.viewAngle(RE, r) / DEG, 17.4, 0.05, 'seen from GEO')
  near(K.maxViewLatitude(RE, r) / DEG, 81.3, 0.1, 'max latitude')
})

test('3.3.1 GTO apogee manoeuvre from Kennedy (28.5°): V_apogee 1.606, Δv2 1.469, Δv3 0.791 km/s', () => {
  // GTO with the apogee velocity of the slide: perigee radius from vis-viva with v_apo = 1.606 km/s.
  const rGeo = 42164.2, vApo = 1.606
  const a = 1 / (2 / rGeo - vApo ** 2 / MU_EARTH), rp = 2 * a - rGeo
  const g = K.geoInsertion(MU_EARTH, rp, rGeo, 28.5 * DEG)
  near(g.vApo, 1.606, 1e-9)
  near(g.circ, 1.469, 0.001)
  near(g.plane, 0.791, 0.001)
  near(g.separate, 2.260, 0.002)
  // the slide shows 1.821 for the combined burn; the exact law of cosines gives 1.831 (the slide is ~0.01 low)
  near(g.combined, 1.831, 0.002)
  assert.ok(g.combined < g.separate)
})

test('3.3.2 nodal regression: the course constant equals −3/2·J2·R²·√μ (a in km, °/day)', () => {
  for (const [h, e, i] of [[200, 0, 0], [800, 0, 98.6 * DEG], [400, 0.01, 51.6 * DEG], [350, 0.7, 63.4 * DEG]] as const) {
    const a = RE + h
    near(K.nodalRateEarthDeg(a, e, i) / K.nodalRateCourseDeg(a, e, i), 1, 2e-4, `h=${h}`)
  }
  near(K.nodalRateEarthDeg(RE + 200, 0, 0), -8.94, 0.01) // slide chart: ≈ −9 °/day at 200 km
  near(K.nodalRateEarthDeg(RE + 5000, 0, 0), -1.3, 0.1) // chart: ≈ −1.3 °/day at 5000 km
  assert.ok(K.nodalRateEarthDeg(RE + 600, 0, 100 * DEG) > 0, 'retrograde: node moves east')
  assert.equal(K.nodalRateEarthDeg(RE + 600, 0, 90 * DEG) | 0, 0, 'polar: no drift') // |value| < 1e-14
})

test('3.3.2 Sun-synchronous: 0.9856 °/day, i ≈ 98.6° at 800 km (Vallado/SMAD), 97–105° over 400–2400 km', () => {
  near(K.SSO_RATE * 86400 / DEG, 0.9856, 5e-5)
  const inc = (h: number, e = 0) => K.ssoInclination(MU_EARTH, RE, J2, RE + h, e) / DEG
  near(inc(800), 98.6, 0.05)
  near(inc(400), 97.0, 0.1)
  near(inc(600), 97.8, 0.1)
  near(inc(1000), 99.5, 0.1)
  near(inc(2400), 107.6, 0.2) // (slide chart is a straight-line sketch: ≈105° at 2400 km)
  assert.ok(inc(400) > 90 && inc(2400) < 180)
  // the resulting node rate is the Sun-synchronous one
  const i = K.ssoInclination(MU_EARTH, RE, J2, RE + 800, 0)
  near(K.nodalRateEarthDeg(RE + 800, 0, i), 0.9856, 5e-5)
  assert.ok(Number.isNaN(K.ssoInclination(MU_EARTH, RE, J2, 60000, 0)), 'too high')
  near(K.ssoMaxRadius(MU_EARTH, RE, J2), 12352, 20) // i = 180° at a ≈ 12 352 km (h ≈ 5974 km)
})

test('3.4 rendezvous: catch-up rate Δx = 3πΔr (≈ 10·Δr) and the exact value', () => {
  near(K.catchUpPerOrbit(1), 9.42, 0.01)
  near(K.catchUpEllipse(6778, 6770), 3 * Math.PI * 8, 1e-9)
  assert.ok(K.catchUpEllipse(6778, 6790) < 0, 'chaser above the target falls behind')
  const r = RE + 400, dr = 5
  const exactKm = K.catchUpExact(MU_EARTH, r - dr, r) * r
  near(exactKm / K.catchUpPerOrbit(dr), 1, 2e-3)
  // shuttle slide: Δv = 1 ft/s (0.3048 m/s) posigrade raises the opposite apsis by ≈ 0.5 n.mi (0.93 km … 1.1 km)
  const v = vCirc(MU_EARTH, r), dh = (4 * r * 0.0003048) / v
  near(dh / 1.852, 0.55, 0.1)
})

test('3.4 phasing orbit: target 30° ahead, 1 revolution', () => {
  const r = RE + 400
  const p = K.phasing(MU_EARTH, r, 30 * DEG, 1)
  near(p.Tp / p.T, 1 - 30 / 360, 1e-12)
  assert.ok(p.shorter && p.rOther < r)
  // after n·Tp the chaser is back at the burn point, the target has moved 360·n·Tp/T = 360 − 30 + 30
  near((((p.time / p.T) * 360) % 360), 330, 1e-9)
  const back = K.phasing(MU_EARTH, r, -30 * DEG, 1)
  assert.ok(!back.shorter && back.rOther > r, 'target behind: wait in a higher orbit')
  near(K.phasing(MU_EARTH, r, 360 * DEG, 2).Tp / p.T, 0.5, 1e-12)
})

test('4.2 sphere of influence: EPFL table (Brown), R_S = R (μ_P/μ_Sun)^(2/5)', () => {
  const R = (au: number, mu: number) => soiRadius(au * AU, mu, MU_SUN) / 1e6
  near(R(0.387, 22031.8), 0.111, 0.002) // Mercury
  near(R(0.723, 324858.6), 0.616, 0.003) // Venus
  near(R(1, MU_EARTH), 0.924, 0.003) // Earth
  near(R(1.524, 42828.4), 0.577, 0.003) // Mars
  near(R(5.204, 126686531.9), 48.157, 0.15) // Jupiter
  near(soiRadius(384400, MU_MOON, MU_EARTH) / 1e6, 0.0662, 0.0003) // Moon w.r.t. Earth
})

test('4.2 Hohmann data table (Venus, Mars, Jupiter, Saturn)', () => {
  const rows: [number, number, number, number, number][] = [ // a (AU), duration (y), v_t at Earth, v_t at target, excess at arrival
    [0.723, 0.399, 27.29, 37.74, 2.71], [1.523, 0.708, 32.73, 21.49, -2.65], [5.204, 2.730, 38.58, 7.42, -5.64], [9.554, 6.061, 40.08, 4.19, -5.45]]
  for (const [a, y, vt1, vt2, ex] of rows) {
    const h = hohmannFull(MU_SUN, AU, a * AU)
    near(h.tof / 86400 / 365.25, y, 0.004, `t ${a}`)
    near(h.vt1, vt1, 0.02, `vt1 ${a}`)
    near(h.vt2, vt2, 0.02, `vt2 ${a}`)
    near(h.vt2 - vCirc(MU_SUN, a * AU), ex, 0.03, `excess ${a}`)
  }
})

test('4.2 departure: v_d² = v∞² + v_esc², Earth → Mars (v∞ 2.94) from 300 km gives Δv ≈ 3.6 km/s', () => {
  const r = RE + 300
  near(K.departureSpeed(MU_EARTH, 2.943, r) - vCirc(MU_EARTH, r), 3.59, 0.02)
  near(departDv(2.943, r), 3.59, 0.02)
  near(K.departureSpeed(MU_EARTH, 0, RE) , 11.18, 0.01) // v_esc surface
})

test('4.2 hyperbola in course notation (a = μ/v∞², e = (a+r_p)/a, θ∞ = arccos(−1/e), cos β = 1/e, d∞ = b)', () => {
  const mu = MU_EARTH, vinf = 3.5, rp = RE + 300
  const h = K.hyperbola(mu, vinf, rp)
  near(h.a, mu / vinf ** 2, 1e-9)
  near(h.e, 1 + (rp * vinf ** 2) / mu, 1e-12)
  near(h.c, h.a * h.e, 1e-9)
  near(h.thetaInf, Math.acos(-1 / h.e), 1e-12)
  near(h.delta, flyby(vinf, rp, mu).delta, 1e-12) // δ = 2 asin(1/e) = π − 2β
  near(h.deltaHalf, Math.asin(1 / h.e), 1e-12) // "deviation = 90° − β" (half the turn)
  near(h.c * h.c, h.a * h.a + h.b * h.b, 1e-3)
  near(K.periapsisFromImpact(mu, vinf, h.dInf), rp, 1e-6)
  near(h.vp, Math.sqrt(vinf ** 2 + (2 * mu) / rp), 1e-12)
  assert.ok(K.periapsisFromImpact(mu, vinf, 0) < 1e-6, 'd∞ = 0: head-on')
})

test('4.2 orbit insertion: Δv = √(v∞²+2μ/r_p) − √(2μ/r_p − μ/a_i)', () => {
  const mu = 42828.4, rp = 3389.5 + 300, vinf = 2.65
  const circ = K.insertionDv(mu, vinf, rp, rp)
  near(circ, Math.sqrt(vinf ** 2 + 2 * mu / rp) - Math.sqrt(mu / rp), 1e-12)
  const ell = K.insertionDv(mu, vinf, rp, 20000) // elliptical capture is cheaper
  assert.ok(ell < circ)
})

test('4.3 slingshot: |v3| = |v4|, speed in the sun frame changes only through the turn', () => {
  // Jupiter flyby, planet 13.06 km/s, craft 7.42 km/s, craft arriving behind/outward on the same heading (γ = 0)
  const none = K.slingshot(13.06, 9, 20 * DEG, 0, 1)
  near(none.V5, 9, 1e-12); near(none.gain, 0, 1e-12)
  const up = K.slingshot(13.06, 9, 20 * DEG, 60 * DEG, 1), dn = K.slingshot(13.06, 9, 20 * DEG, 60 * DEG, -1)
  near(up.v3, dn.v3, 1e-12)
  assert.ok(Math.max(up.gain, dn.gain) > 0 && Math.min(up.gain, dn.gain) < 0, 'one side speeds up, the other slows down')
  // head-on-style extreme: v∞ in line with V_P, 180° turn → V5 = V_P + (V_P − V2) → gain up to 2·(V_P − V2)... bounded by 2·|v3|
  const e = K.slingshot(10, 0, 0, Math.PI, 1) // craft at rest in the Sun frame meets a planet at 10 km/s, bounces back
  near(e.V5, 20, 1e-9)
  assert.ok(Math.max(up.gain, dn.gain) <= 2 * up.v3 + 1e-9)
})
