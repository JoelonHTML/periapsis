// Run: node --test src/lib/feature-index.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { FEATURES, keyFeatures, searchFeatures } from './feature-index.ts'
import { MODE_ORDER, modeTabs } from './modes.ts'

test('every feature points at a tab its world really has, ids are unique, texts in 3 languages', () => {
  assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length)
  for (const f of FEATURES) {
    assert.ok(modeTabs(f.mode).includes(f.tab), `${f.id}: ${f.tab} not in ${f.mode}`)
    for (const l of ['nl', 'en', 'el'] as const) assert.ok(f.txt[l][0] && f.txt[l][1], `${f.id} ${l}`)
  }
  for (const m of MODE_ORDER) assert.ok(keyFeatures(m).length >= 2 && keyFeatures(m).length <= 4, m)
})

test('search: keywords, other languages, no accents needed', () => {
  assert.equal(searchFeatures('porkchop', 'nl')[0].id, 'porkchop')
  assert.equal(searchFeatures('iss', 'nl')[0].id, 'track')
  assert.ok(searchFeatures('planetoiden', 'nl').some((f) => f.id === 'neo')) // planetoïden without the diaeresis
  assert.ok(searchFeatures('launches', 'nl').some((f) => f.id === 'launches')) // English word while the app is in Dutch
  assert.ok(searchFeatures('σεληνη', 'el').length > 0) // Greek without tonos
  assert.deepEqual(searchFeatures('   ', 'nl'), [])
})
