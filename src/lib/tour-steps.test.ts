// Run: node --test src/lib/tour-steps.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { TOUR, clampStep } from './tour-steps.ts'

test('every step has Dutch copy and clampStep stays in range', () => {
  assert.ok(TOUR.length >= 5)
  for (const s of TOUR) assert.ok(s.title.length > 2 && s.text.length > 20)
  assert.equal(clampStep(-3), 0)
  assert.equal(clampStep(999), TOUR.length - 1)
  assert.equal(clampStep(2), 2)
})
