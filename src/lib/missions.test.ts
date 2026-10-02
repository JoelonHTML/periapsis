// Run: node --test src/lib/missions.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
const { MAX_SAVED, deleteMission, loadMissions, normalizeMissions, saveMission } = await import('./missions.ts')

const craft = { dry: 1200, prop: 1800, isp: 320, cd: 2.2, area: 4 }
const m = (name: string) => ({ name, target: 'jupiter', craft, params: { date: '2038-11-03' } })

test('save / load / delete round-trip, newest first', () => {
  saveMission(m('A'), 1000)
  saveMission(m('B'), 2000)
  assert.deepEqual(loadMissions().map((x) => x.name), ['B', 'A'])
  const id = loadMissions()[0].id
  assert.deepEqual(deleteMission(id).map((x) => x.name), ['A'])
  assert.deepEqual(loadMissions().map((x) => x.name), ['A'])
})

test('list is capped and malformed entries are dropped', () => {
  mem.clear()
  for (let i = 0; i < MAX_SAVED + 5; i++) saveMission(m(`m${i}`), i)
  assert.equal(loadMissions().length, MAX_SAVED)
  assert.equal(loadMissions()[0].name, `m${MAX_SAVED + 4}`)
  assert.deepEqual(normalizeMissions('x'), [])
  assert.deepEqual(normalizeMissions([{ id: 1 }, null, { id: 'a', name: 'n', target: 't', savedAt: 1, craft: { dry: 1 }, params: {} }]), [])
})
