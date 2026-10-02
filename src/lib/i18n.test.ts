// Run: node --test src/lib/i18n.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { dictionaries, translate } from './i18n.ts'

test('every language has exactly the same keys, none empty, and the same {placeholders}', () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
  const nl = dictionaries.nl
  for (const lang of ['en', 'el'] as const) {
    assert.deepEqual(Object.keys(dictionaries[lang]).sort(), Object.keys(nl).sort(), lang)
    for (const [k, v] of Object.entries(dictionaries[lang])) {
      assert.ok(v.trim().length > 0, `${lang}.${k} empty`)
      assert.equal(ph(v), ph(nl[k as keyof typeof nl]), `${lang}.${k} placeholders`)
    }
  }
})

test('translate fills variables and falls back to the key', () => {
  assert.equal(translate('en', 'upd.available', { v: '0.5.2' }), 'Version 0.5.2 available')
  assert.equal(translate('el', 'tour.step', { n: 2, m: 7 }), 'Βήμα 2 από 7')
  assert.equal(translate('en', 'nope' as never), 'nope')
})
