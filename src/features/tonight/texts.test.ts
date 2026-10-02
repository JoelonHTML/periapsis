import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nl, en, el } from './texts.ts'
import { SHOWERS } from './events.ts'

test('nl/en/el dictionaries have identical keys and the same {placeholders}', () => {
  const keys = Object.keys(nl).sort()
  assert.deepEqual(Object.keys(en).sort(), keys)
  assert.deepEqual(Object.keys(el).sort(), keys)
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
  for (const k of keys) { assert.equal(vars(en[k]), vars(nl[k]), `en ${k}`); assert.equal(vars(el[k]), vars(nl[k]), `el ${k}`) }
  for (const k of keys) assert.ok(k.startsWith('sky.'))
})

test('Greek texts are real Greek (no Latin-only strings except abbreviations)', () => {
  const allowed = new Set<string>()
  for (const [k, v] of Object.entries(el)) {
    if (allowed.has(k)) continue
    assert.ok(/[Ͱ-Ͽ]/.test(v), `el ${k} = ${v}`)
  }
})

test('every key used by the views exists', () => {
  const have = new Set(Object.keys(nl))
  const files = ['TonightView.tsx', 'EventsView.tsx', 'ui.tsx']
  const used = new Set<string>()
  for (const f of files) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    for (const m of src.matchAll(/'(sky\.[A-Za-z0-9.]+)'/g)) used.add(m[1])
  }
  for (const k of used) assert.ok(have.has(k), `missing ${k}`)
  // dynamic families
  const dyn: string[] = []
  for (const p of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon', 'sun']) dyn.push(`sky.p.${p}`)
  for (let i = 0; i < 16; i++) dyn.push(`sky.dir.${i}`)
  for (let i = 0; i < 8; i++) dyn.push(`sky.phase.${i}`)
  for (const k of ['new', 'first', 'full', 'last']) dyn.push(`sky.ev.moon.${k}`)
  for (const k of ['marEq', 'junSol', 'sepEq', 'decSol']) dyn.push(`sky.ev.${k}`, `sky.ev.${k}.d`)
  for (const k of ['total', 'annular', 'hybrid', 'partial']) dyn.push(`sky.ev.solar.${k}`)
  for (const k of ['total', 'partial', 'penumbral']) dyn.push(`sky.ev.lunar.${k}`)
  for (const k of ['ok', 'day', 'below']) dyn.push(`sky.loc.${k}`)
  for (const k of ['below', 'twilight', 'low']) dyn.push(`sky.why.${k}`)
  for (const k of ['ok', 'web', 'denied', 'past', 'error']) if (k !== 'ok') dyn.push(`sky.rem.${k}`)
  for (const k of ['all', 'moon', 'planets', 'eclipse', 'meteor', 'season']) dyn.push(`sky.f.${k}`)
  for (const k of ['eve', 'hour']) dyn.push(`sky.lead.${k}`)
  for (const s of SHOWERS) dyn.push(`sky.sh.${s.id}`, `sky.con.${s.con}`)
  for (const k of dyn) assert.ok(have.has(k), `missing dynamic ${k}`)
})
