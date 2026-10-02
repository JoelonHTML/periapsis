// Run: node --test src/lib/settings.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
const { defaultSettings, normalize, resetSettings, setSetting, settings } = await import('./settings.ts')

test('normalize keeps valid values and repairs bad ones', () => {
  const d = defaultSettings()
  assert.deepEqual(normalize(null), d)
  assert.deepEqual(normalize('junk'), d)
  assert.deepEqual(normalize({ showLabels: false, speedIdx: 3, trueScale: 'yes', keepAwake: true }), { ...d, showLabels: false, speedIdx: 3, keepAwake: true })
  assert.equal(normalize({ speedIdx: 99 }).speedIdx, d.speedIdx)
  assert.equal(normalize({ speedIdx: 1.5 }).speedIdx, d.speedIdx)
})

test('setSetting persists, resetSettings clears', () => {
  setSetting('showLabels', false)
  setSetting('speedIdx', 2)
  assert.equal(JSON.parse(mem.get('periapsis.settings.v1')!).speedIdx, 2)
  assert.equal(settings.get().showLabels, false)
  resetSettings()
  assert.equal(mem.has('periapsis.settings.v1'), false)
  assert.deepEqual(settings.get(), defaultSettings())
})
