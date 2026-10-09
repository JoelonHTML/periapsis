import { test } from 'node:test'
import assert from 'node:assert/strict'
import { basisFromQuat, jittery, poseOf, qAngle, qMul, qNorm, qSlerp, quatFromEuler, smoothStep, type Quat } from './ar.ts'
import { basisFromOrientation, hzAltAz } from './geom.ts'

const near = (a: number, b: number, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} != ${b}`)
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const pose = (a: number, b: number, g: number, scr = 0) => poseOf(basisFromQuat(quatFromEuler(a, b, g), scr))

test('upright, back camera towards north: az 0, alt 0, level', () => {
  const p = pose(0, 90, 0)
  near(angDiff(p.az, 0), 0); near(p.alt, 0); near(p.roll, 0)
})
test('upright facing east / west / south (alpha is counter-clockwise from north)', () => {
  near(angDiff(pose(270, 90, 0).az, 90), 0, 1e-6, 'east')
  near(angDiff(pose(90, 90, 0).az, 270), 0, 1e-6, 'west')
  near(angDiff(pose(180, 90, 0).az, 180), 0, 1e-6, 'south')
})
test('flat: face-down aims the back camera at the zenith, face-up at the nadir', () => {
  near(pose(0, 180, 0).alt, 90, 1e-6, 'face down'); near(pose(0, 0, 0).alt, -90, 1e-6, 'face up')
})
test('tilted: 45 degrees from upright', () => {
  const dn = pose(0, 45, 0), up = pose(0, 135, 0)
  near(dn.alt, -45, 1e-6); near(angDiff(dn.az, 0), 0)
  near(up.alt, 45, 1e-6); near(angDiff(up.az, 0), 0)
  near(dn.roll, 0, 1e-6); near(up.roll, 0, 1e-6)
})
test('roll: turning the phone about its camera axis rolls the horizon, direction unchanged', () => {
  const up: Quat = quatFromEuler(0, 90, 0)
  const spin = (deg: number): Quat => { const h = (deg * Math.PI) / 360; return qNorm(qMul(up, [0, 0, Math.sin(h), Math.cos(h)])) } // about device z (screen normal)
  const a = poseOf(basisFromQuat(spin(30))), b = poseOf(basisFromQuat(spin(-30)))
  near(a.alt, 0); near(angDiff(a.az, 0), 0)
  near(Math.abs(a.roll), 30); near(a.roll, -b.roll)
})
test('landscape: the screen angle keeps the aim and a level horizon', () => {
  const q = quatFromEuler(0, 0, 0) // placeholder to keep types; real poses below
  void q
  // phone upright facing north, then turned 90 degrees anticlockwise (top to the left): device +x points up -> rotation of -90 about the camera axis
  const ccw = qNorm(qMul(quatFromEuler(0, 90, 0), [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)]))
  const p = poseOf(basisFromQuat(ccw, 90))
  near(angDiff(p.az, 0), 0); near(p.alt, 0); near(p.roll, 0)
  const cw = qNorm(qMul(quatFromEuler(0, 90, 0), [0, 0, -Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)]))
  const p2 = poseOf(basisFromQuat(cw, 270))
  near(angDiff(p2.az, 0), 0); near(p2.alt, 0); near(p2.roll, 0)
  near(Math.abs(poseOf(basisFromQuat(ccw, 0)).roll), 90, 1e-6, 'without the screen angle the horizon is rolled 90')
})
test('quaternion pose agrees with the Euler-matrix basis of geom.ts', () => {
  for (const [a, b, g, s] of [[10, 80, 5, 0], [200, 120, -20, 0], [300, 60, 30, 90], [45, 100, -70, 270], [123, 15, 8, 180]]) {
    const A = basisFromQuat(quatFromEuler(a, b, g), s), B = basisFromOrientation(a, b, g, s)
    for (let i = 0; i < 3; i++) { near(A.f[i], B.f[i], 1e-9); near(A.u[i], B.u[i], 1e-9) }
  }
})
test('slerp: endpoints, midpoint, shortest arc across the q / -q double cover', () => {
  const a = quatFromEuler(0, 90, 0), b = quatFromEuler(40, 90, 0)
  near(qAngle(qSlerp(a, b, 0), a), 0); near(qAngle(qSlerp(a, b, 1), b), 0)
  near(qAngle(a, qSlerp(a, b, 0.5)), qAngle(a, b) / 2, 1e-4)
  const nb: Quat = [-b[0], -b[1], -b[2], -b[3]] // same rotation, opposite sign
  near(qAngle(qSlerp(a, nb, 0.5), a), qAngle(a, b) / 2, 1e-4)
})
test('heading wrap 359 -> 1 degrees takes the 2 degree path, not 358', () => {
  const a = quatFromEuler(359, 90, 0), b = quatFromEuler(1, 90, 0)
  near(qAngle(a, b), 2)
  near(angDiff(poseOf(basisFromQuat(qSlerp(a, b, 0.5))).az, 0), 0)
})
test('smoothStep: tiny jitter is damped, a fast turn nearly keeps up', () => {
  const cur = quatFromEuler(0, 90, 0), jit = quatFromEuler(0.3, 90, 0), far = quatFromEuler(40, 90, 0)
  assert.ok(qAngle(smoothStep(cur, jit, 1 / 60), jit) > 0.3 * 0.9, 'jitter barely moves')
  assert.ok(qAngle(smoothStep(cur, far, 1 / 60), far) < 40 * 0.6, 'big move catches up fast')
  near(qAngle(smoothStep(cur, far, 0), cur), 0, 1e-9)
})
test('jittery: still phone with a long noisy path is flagged, a steady sweep is not', () => {
  const still = Array.from({ length: 60 }, (_, i) => ({ t: i * 33, q: quatFromEuler((i % 2 ? 1 : -1) * 1.5, 90, 0) }))
  assert.equal(jittery(still), true)
  const sweep = Array.from({ length: 60 }, (_, i) => ({ t: i * 33, q: quatFromEuler(i * 0.5, 90, 0) }))
  assert.equal(jittery(sweep), false)
  assert.equal(jittery(still.slice(0, 5)), false)
})
test('hzAltAz sanity', () => { near(hzAltAz([0, 1, 0]).az, 0) })
