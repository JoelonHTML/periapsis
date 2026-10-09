// Run: node --test src/features/skyview/optics.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { airMass, bortleLimit, extinctionMag, moonPenalty, nakedEyeLimit, refractionBennett, refractionLift, refractionSaemundsson, refractVec, zoomGain } from './optics.ts'
import { galileanMoons } from './jupmoons.ts'
import { hzAltAz, hzVec } from './geom.ts'
import { jdeOf, planetPos } from '../tonight/sky.ts'

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`)

test('refraction: Bennett 34.5 arc-min at the horizon, ~1 arc-min at 45 deg (Meeus ch. 16)', () => {
  near(refractionBennett(0) * 60, 34.5, 0.4)
  near(refractionBennett(45) * 60, 0.97, 0.03)
  near(refractionBennett(90) * 60, 0, 0.05)
  near(refractionBennett(10) * 60, 5.3, 0.15)
})
test('refraction: Saemundsson (true altitude) is the inverse of Bennett (apparent) to 0.1 arc-min', () => {
  for (const h of [0, 2, 5, 10, 20, 45, 70]) {
    const R = refractionSaemundsson(h) // apparent = h + R
    near(refractionBennett(h + R) * 60, R * 60, 0.1, `h=${h}`)
  }
  near(refractionSaemundsson(0) * 60, 29, 0.5)
})
test('refractVec lifts low directions, leaves high ones, keeps unit length, monotone through the horizon', () => {
  const lo = hzVec(1, 40), hi = hzVec(60, 40)
  const a = hzAltAz(refractVec(lo)), b = hzAltAz(refractVec(hi))
  near(a.alt, 1 + refractionSaemundsson(1), 1e-6); near(a.az, 40, 1e-6)
  near(b.alt, 60, 1e-9)
  near(Math.hypot(...refractVec(hzVec(3, 100))), 1, 1e-12)
  let prev = -99
  for (let h = -6; h <= 30; h += 0.25) { const v = hzAltAz(refractVec(hzVec(h, 10))).alt; assert.ok(v > prev, `monotone at ${h}`); prev = v }
  near(refractionLift(-10), 0, 1e-12)
})
test('extinction: zero at the zenith, 0.25 mag/airmass, ~38 air masses at the horizon (Kasten & Young)', () => {
  near(airMass(90), 1, 0.001)
  near(airMass(30), 1.995, 0.01)
  near(airMass(0), 38.2, 0.5)
  near(extinctionMag(90), 0, 0.001)
  near(extinctionMag(30), 0.25 * 0.995, 0.005)
  assert.ok(extinctionMag(5) > 2 && extinctionMag(5) < 3.2)
})
test('limiting magnitude: Bortle table, Moon and twilight', () => {
  assert.equal(bortleLimit(1), 7.8); assert.equal(bortleLimit(9), 4.0); assert.equal(bortleLimit(4), 6.3)
  near(zoomGain(70), 0, 1e-9); near(zoomGain(7), 3, 1e-9); assert.equal(zoomGain(120), 0)
  assert.equal(moonPenalty(-5, 1), 0)
  assert.ok(moonPenalty(60, 1) > 1.4 && moonPenalty(60, 0.1) < 0.3)
  assert.ok(nakedEyeLimit(-30, 3, -20, 0) === 6.8, 'dark site, no Moon')
  assert.ok(nakedEyeLimit(-30, 3, 50, 1) < 5.5, 'full Moon')
  assert.ok(nakedEyeLimit(5, 1, -20, 0) < 0, 'daylight')
})

// Meeus, Astronomical Algorithms 2nd ed., example 44.a: 1992 December 16, 0h UT. Meeus gives X (Jupiter radii, west positive):
// I -3.44, II +7.44, III +1.24, IV +7.08 (low-accuracy method, good to ~0.1; the L1.2 theory used here is more accurate, so allow 0.2).
test('Galilean moons match Meeus example 44.a', () => {
  const ms = Date.UTC(1992, 11, 16, 0, 0, 0)
  const p = planetPos('jupiter', ms), n = Math.hypot(...p.vecJ), u: [number, number, number] = [p.vecJ[0] / n, p.vecJ[1] / n, p.vecJ[2] / n]
  const jde = jdeOf(ms) - p.d / 173 // light time
  const m = galileanMoons(jde, u)
  const want = [-3.44, 7.44, 1.24, 7.08]
  m.forEach((x, i) => near(x.x, want[i], 0.2, `moon ${i + 1}`))
  assert.ok(m.every((x) => Math.abs(x.y) < 1.3), 'moons stay close to the equatorial plane (|Y| ~ r sin(tilt))')
})
test('Galilean moons: periods and radii', () => {
  const u: [number, number, number] = [1, 0, 0], jde = 2461000.5
  const r = (j: number) => galileanMoons(j, u).map((m) => Math.hypot(m.x, m.y, m.z))
  const a = r(jde)
  ;[5.9, 9.4, 15.0, 26.4].forEach((want, i) => near(a[i], want, 0.4, `radius ${i}`))
  // Io returns to the same place after its sidereal period 1.769138 d (x,y,z in Jupiter radii; Jupiter's equator barely moves)
  const x0 = galileanMoons(jde, u)[0], x1 = galileanMoons(jde + 1.769138, u)[0]
  near(x0.x, x1.x, 0.15); near(x0.z, x1.z, 0.15)
})
