// Run: node --test src/lib/modes.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { MODES, MODE_ORDER, modeTabs } from './modes.ts'

test('every world has at most 5 phone tabs and its own first tab', () => {
  for (const m of MODE_ORDER) {
    assert.ok(MODES[m].tabs.length <= 5, m)
    assert.ok(modeTabs(m).length > 0, m)
    assert.ok(!MODES[m].tabs.includes('more') || MODES[m].more.length > 0, `${m}: 'more' without content`)
  }
})
