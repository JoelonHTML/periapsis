// Run: node --test src/lib/tour-steps.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { TOUR, clampStep } from './tour-steps.ts'
import { dictionaries } from './i18n.ts'

test('every tour step has a title and text in every language; clampStep stays in range', () => {
  assert.ok(TOUR.length >= 5)
  for (const lang of ['nl', 'en', 'el'] as const) {
    const d = dictionaries[lang] as Record<string, string>
    for (let i = 0; i < TOUR.length; i++) assert.ok(d[`tour.${i}.t`]?.length > 2 && d[`tour.${i}.x`]?.length > 20, `${lang} step ${i}`)
  }
  assert.equal(clampStep(-3), 0)
  assert.equal(clampStep(999), TOUR.length - 1)
})
