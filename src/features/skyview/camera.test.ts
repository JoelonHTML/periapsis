import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraModel } from './camera.ts'
import { project, unproject, hzVec, type Cam } from './geom.ts'

test('camera model: 4:3 stream on a 400x860 phone (cover) - long side ~67 deg, the screen sees less', () => {
  const m = cameraModel(480, 640, 400, 860, 1) // portrait stream 3:4 scaled up to cover the taller screen
  assert.ok(Math.abs(m.fovLong - 67.6) < 0.5, `fovLong ${m.fovLong}`)
  assert.ok(Math.abs(m.fovV - m.fovLong) < 1, `fovV ${m.fovV}`) // cropped on the sides, full height shown
  assert.ok(m.fovH < 45 && m.fovH > 30, `fovH ${m.fovH}`)
})
test('camera model: calibration factor scales the field of view', () => {
  const a = cameraModel(720, 1280, 400, 860, 1), b = cameraModel(720, 1280, 400, 860, 1.2)
  assert.ok(b.fovV > a.fovV && b.k < a.k)
})
test('pinhole project / unproject round trip', () => {
  const m = cameraModel(480, 640, 400, 860, 1)
  const cam: Cam = { f: [0, 1, 0], r: [1, 0, 0], u: [0, 0, 1], cx: 200, cy: 430, k: m.k, rect: true }
  const p = { x: 0, y: 0 }
  assert.ok(project(cam, hzVec(10, 20), p))
  const v = unproject(cam, p.x, p.y), w = hzVec(10, 20)
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(v[i] - w[i]) < 1e-9)
  assert.equal(project(cam, hzVec(0, 180), p), false) // behind the camera
})
