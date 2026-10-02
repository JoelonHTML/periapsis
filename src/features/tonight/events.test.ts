// Run: node --test src/features/tonight/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvents, solarVisibility, lunarVisibility, localView, SHOWERS } from './events.ts'
import { eclipsesBetween } from './lunation.ts'

const ms = (s: string) => Date.parse(s)
const days = (a: number, b: number) => Math.abs(a - b) / 86400000

test('Mars opposition 2027-02-19 (+-2 d), Saturn 2026-10-04, Uranus 2026-11-25', () => {
  const ev = buildEvents(ms('2026-10-02T00:00:00Z'), 12)
  const mars = ev.find((e) => e.kind === 'opp' && e.a === 'mars')!
  assert.ok(days(mars.ms, ms('2027-02-19T00:00:00Z')) <= 2, new Date(mars.ms).toISOString())
  assert.ok(mars.mag! < -1 && mars.mag! > -1.6, `mars mag ${mars.mag}`)
  const sat = ev.find((e) => e.kind === 'opp' && e.a === 'saturn')!
  assert.ok(days(sat.ms, ms('2026-10-04T00:00:00Z')) <= 2, new Date(sat.ms).toISOString())
  const ura = ev.find((e) => e.kind === 'opp' && e.a === 'uranus')!
  assert.ok(days(ura.ms, ms('2026-11-25T00:00:00Z')) <= 2, new Date(ura.ms).toISOString())
})

test('Venus-Jupiter conjunction in June 2026 (+-2 d of 2026-06-09), < 2 deg', () => {
  const ev = buildEvents(ms('2026-05-01T00:00:00Z'), 12)
  const c = ev.find((e) => e.kind === 'conj' && e.a === 'venus' && e.b === 'jupiter')!
  assert.ok(c, 'found')
  assert.ok(days(c.ms, ms('2026-06-09T00:00:00Z')) <= 2, new Date(c.ms).toISOString())
  assert.ok(c.sep! < 2)
})

test('Greatest elongations: Venus east 2026-08-15 (45.9 deg), Venus west 2027-01-03', () => {
  const ev = buildEvents(ms('2026-07-01T00:00:00Z'), 12)
  const v = ev.filter((e) => e.kind === 'elong' && e.a === 'venus')
  assert.equal(v.length, 2)
  assert.ok(days(v[0].ms, ms('2026-08-15T00:00:00Z')) <= 2 && v[0].evening, new Date(v[0].ms).toISOString())
  assert.ok(Math.abs(v[0].value! - 45.9) < 0.5, `${v[0].value}`)
  assert.ok(days(v[1].ms, ms('2027-01-03T00:00:00Z')) <= 3 && !v[1].evening, new Date(v[1].ms).toISOString())
})

test('12-month agenda from 2026-10-02: contents', () => {
  const t0 = Date.now()
  const ev = buildEvents(ms('2026-10-02T00:00:00Z'), 12)
  const dt = Date.now() - t0
  const by = (k: string) => ev.filter((e) => e.kind === k)
  assert.ok(by('moon').length >= 48 && by('moon').length <= 50, `phases ${by('moon').length}`)
  assert.equal(by('season').length, 4) // Dec 2026 solstice, Mar, Jun, Sep 2027
  assert.equal(by('meteor').length, 7)
  assert.ok(by('solar').length === 2 && by('lunar').length === 2, `eclipses ${by('solar').length}/${by('lunar').length}`)
  assert.ok(ev.some((e) => e.kind === 'solar' && e.eclipse!.kind === 'total' && days(e.ms, ms('2027-08-02T10:07:00Z')) < 0.1))
  assert.ok(by('conj').some((e) => e.a === 'moon'))
  assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].ms <= e.ms))
  assert.ok(new Set(ev.map((e) => e.id)).size === ev.length, 'unique ids')
  assert.ok(dt < 3000, `computation took ${dt} ms`)
  const per = by('meteor').find((e) => e.shower === 'perseids')!
  assert.ok(days(per.ms, ms('2027-08-12T20:00:00Z')) < 1.5, new Date(per.ms).toISOString())
  const gem = by('meteor').find((e) => e.shower === 'geminids')!
  assert.ok(days(gem.ms, ms('2026-12-14T12:00:00Z')) < 1.5, new Date(gem.ms).toISOString())
  assert.equal(SHOWERS.length, 7)
})

test('Eclipse visibility from Amsterdam / Madrid / Sydney', () => {
  const ams = { lat: 52.37, lon: 4.89, altM: 0 }, mad = { lat: 40.42, lon: -3.7, altM: 650 }, syd = { lat: -33.87, lon: 151.21, altM: 0 }
  const e2027 = eclipsesBetween(ms('2027-07-01T00:00:00Z'), ms('2027-09-01T00:00:00Z')).find((e) => e.type === 'solar')!
  const vm = solarVisibility(e2027, mad)
  assert.ok(vm.visible && vm.mag > 0.8, `Madrid mag ${vm.mag}`) // just outside / at the edge of totality: very large partial
  const va = solarVisibility(e2027, ams)
  assert.ok(va.visible && va.mag > 0.1 && va.mag < 0.9, `Amsterdam partial mag ${va.mag}`)
  assert.ok(!solarVisibility(e2027, syd).visible)
  const l = eclipsesBetween(ms('2026-03-01T00:00:00Z'), ms('2026-03-05T00:00:00Z'))[0]
  assert.ok(['visible', 'partial', 'none'].includes(lunarVisibility(l, ams).state))
  assert.equal(lunarVisibility(l, syd).state, 'visible')
  assert.ok(localView({ id: 'x', kind: 'opp', ms: ms('2026-10-04T00:00:00Z'), a: 'saturn' }, ams) !== null)
})
