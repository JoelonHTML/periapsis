// Run: node --test src/features/widgets/widgets.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, NIGHTS } from './snapshot.ts'
import { parseDeepLink } from './links.ts'

const site = { lat: 52.09, lon: 5.12, altM: 0, name: 'Utrecht' }
const now = Date.UTC(2026, 9, 9, 18, 0)
const iss = { name: 'ISS', norad: 25544, tle: ['1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927', '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537'] as [string, string] }

test('snapshot structure, 14 sorted nights, size', () => {
  const s = buildSnapshot({ site, now, lang: 'nl', alpha: 0.5, iss, launches: [{ name: 'Late', net: now + 9e6, provider: 'X' }, { name: 'Soon', net: now + 1e6, provider: '' }] as never,
    kp: [{ t: now - 3600e3, kp: 5.33, kind: 'observed' }, { t: now + 3600e3, kp: 2, kind: 'predicted' }] })
  assert.equal(s.v, 1)
  assert.equal(s.gen, now)
  assert.deepEqual(s.style, { alpha: 0.5, accent: '#22d3ee' })
  assert.equal(s.site.name, 'Utrecht')
  for (const k of ['tonight', 'planets', 'none', 'moon', 'sunrise', 'sunset', 'dusk', 'dawn', 'next_event', 'iss', 'launch', 'kp', 'no_data', 'updated', 'visible_from', 'until', 'eye', 'binoculars', 'telescope', 'phase0', 'phase7'])
    assert.ok(s.labels[k], k)
  assert.equal(s.nights.length, NIGHTS)
  assert.equal(NIGHTS, 14)
  assert.ok(s.nights[0].end > now, 'first night is the current/next one')
  for (const [i, n] of s.nights.entries()) {
    assert.ok(n.end > n.start)
    if (i) assert.ok(n.start > s.nights[i - 1].start)
    assert.ok(n.moon.idx >= 0 && n.moon.idx <= 7 && n.moon.illum >= 0 && n.moon.illum <= 1)
    for (let j = 1; j < n.planets.length; j++) assert.ok(n.planets[j].mag >= n.planets[j - 1].mag, 'brightest first')
    for (const p of n.planets) { assert.ok(p.name && p.dir && ['eye', 'binoculars', 'telescope'].includes(p.aid)); assert.ok(p.from <= p.best && p.best <= p.to, `${p.id} best inside window`) }
  }
  assert.ok(s.nights.some((n) => n.planets.length > 0), 'some planet is visible in two weeks')
  assert.ok(s.events.length > 0 && s.events.length <= 20)
  for (let i = 0; i < s.events.length; i++) { assert.ok(s.events[i].title && !s.events[i].title.startsWith('sky.')); if (i) assert.ok(s.events[i].ms >= s.events[i - 1].ms) }
  assert.ok(s.passes.length <= 8)
  assert.deepEqual(s.launch, { name: 'Soon', ms: now + 1e6, provider: null })
  assert.equal(s.kp?.value, 5.33)
  assert.equal(s.kp?.label, 'Storm G1')
  assert.ok(JSON.stringify(s).length < 100_000)
})

test('missing caches give null/empty, other languages localize', () => {
  const s = buildSnapshot({ site, now, lang: 'en' })
  assert.equal(s.launch, null); assert.equal(s.kp, null); assert.deepEqual(s.passes, [])
  assert.equal(s.labels.tonight, 'Tonight')
  assert.equal(buildSnapshot({ site, now, lang: 'el' }).labels.tonight, 'Απόψε')
})

test('deep links', () => {
  assert.deepEqual(parseDeepLink('periapsis://open/sky/tonight'), { mode: 'sky', tab: 'tonight' })
  assert.deepEqual(parseDeepLink('periapsis://open/explore/passes'), { mode: 'explore', tab: 'passes' })
  assert.deepEqual(parseDeepLink('periapsis://open/sky/live/'), { mode: 'sky', tab: 'live' })
  for (const bad of ['periapsis://open/sky/passes', 'periapsis://open/nope/tonight', 'https://x/open/sky/tonight', 'periapsis://open/sky', '', null, undefined])
    assert.equal(parseDeepLink(bad), null, String(bad))
})
