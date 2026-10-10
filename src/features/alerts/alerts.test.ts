// Run: node --test src/features/alerts/alerts.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { afterQuiet, buildPlan, inQuiet, MAX_SCHEDULED } from './plan.ts'
import { buildConfig, defaults, normalize, anyOn } from './settings.ts'
import { NOTIF } from './texts.ts'

const site = { lat: 52.09, lon: 5.12, altM: 0 }
const now = Date.UTC(2026, 9, 9, 18, 0)
const iss = { name: 'ISS', norad: 25544, tle: ['1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927', '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537'] as [string, string] }
const on = () => { const s = defaults(); s.sky.on = true; s.summary.evening = true; s.summary.morning = true; return s }

test('defaults: everything off, nothing planned', () => {
  const s = defaults()
  assert.equal(anyOn(s), false)
  assert.deepEqual(buildPlan({ s, site, now, lang: 'nl', iss }), [])
})

test('plan: unique ids/keys, sorted, within limits and horizon, future only', () => {
  const plan = buildPlan({ s: on(), site, now, lang: 'nl', iss })
  assert.ok(plan.length > 0 && plan.length <= MAX_SCHEDULED)
  assert.equal(new Set(plan.map((p) => p.id)).size, plan.length)
  assert.equal(new Set(plan.map((p) => p.key)).size, plan.length)
  for (const [i, p] of plan.entries()) {
    assert.ok(p.id > 0 && p.id < 2 ** 31)
    assert.ok(p.at > now && p.at < now + 11 * 86400e3, p.key)
    assert.ok(p.title && p.body && p.link.startsWith('periapsis://open/'))
    if (i) assert.ok(p.at >= plan[i - 1].at)
  }
  assert.ok(plan.some((p) => p.key.startsWith('sum:evening:')) && plan.some((p) => p.key.startsWith('sum:morning:')))
})

test('plan is deterministic (same ids on reschedule) and respects per-kind switches', () => {
  const a = buildPlan({ s: on(), site, now, lang: 'en', iss }), b = buildPlan({ s: on(), site, now, lang: 'en', iss })
  assert.deepEqual(a.map((p) => [p.key, p.id, p.at]), b.map((p) => [p.key, p.id, p.at]))
  const s = defaults(); s.sky.on = true; s.sky.iss = false
  const p = buildPlan({ s, site, now, lang: 'en', iss })
  assert.ok(!p.some((x) => x.key.startsWith('iss:') || x.key.startsWith('sum:')))
  const n = defaults(); n.sky.on = true; n.sky.meteor = n.sky.eclipse = n.sky.conj = n.sky.moon = n.sky.opp = n.sky.iss = false
  assert.deepEqual(buildPlan({ s: n, site, now, lang: 'en', iss }), [])
})

test('ISS: at most one pass per day, notice ~10 min ahead, link to passes', () => {
  const s = defaults(); s.sky.on = true
  const plan = buildPlan({ s, site, now, lang: 'en', iss }).filter((p) => p.key.startsWith('iss:'))
  // the 2008 element set has drifted far by 2026, so passes may or may not exist; whatever is planned must be well-formed
  assert.equal(new Set(plan.map((p) => p.key)).size, plan.length)
  for (const p of plan) { assert.ok(p.eventMs - p.at <= 10 * 60e3 + 1 && p.eventMs - p.at >= 2 * 60e3); assert.match(p.title, /^ISS visible in \d+ min$/); assert.equal(p.link, 'periapsis://open/explore/passes') }
})

test('summary text: planets, Moon phase, nothing planned in the past', () => {
  const s = defaults(); s.summary.evening = true
  const plan = buildPlan({ s, site, now, lang: 'nl', iss: null })
  assert.ok(plan.length >= 9 && plan.length <= 10)
  const p = plan[0]
  assert.equal(p.title, 'Vanavond te zien')
  assert.match(p.body, / · \S.*\d+%/) // "<planets> · <Maan fase> NN%"
  assert.equal(p.link, 'periapsis://open/sky/tonight')
  assert.equal(new Date(p.at).getHours(), 19)
  // asking at 20:00 local: today's 19:00 summary is gone, tomorrow's stays
  const late = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate(), 20, 0).getTime()
  assert.ok(buildPlan({ s, site, now: late, lang: 'nl', iss: null }).every((x) => x.at > late))
})

test('quiet hours: shifted to the end, dropped when that is past the event', () => {
  const q = { on: true, from: '23:00', to: '07:00' }
  const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m).getTime()
  assert.equal(inQuiet(q, at(23, 30)), true); assert.equal(inQuiet(q, at(6, 59)), true); assert.equal(inQuiet(q, at(7)), false); assert.equal(inQuiet({ ...q, on: false }, at(2)), false)
  assert.equal(afterQuiet(q, at(23, 30)), new Date(2026, 9, 11, 7, 0).getTime())
  assert.equal(afterQuiet(q, at(3)), at(7))
  assert.equal(afterQuiet(q, at(12)), at(12))
  const s = defaults(); s.summary.evening = true; s.summary.eveningTime = '23:30'; s.quiet = q
  const plan = buildPlan({ s, site, now, lang: 'nl', iss: null })
  for (const p of plan) assert.ok(!inQuiet(q, p.at), p.key)
})

test('config: contract v1 shape and localized texts', () => {
  const s = defaults(); s.spaceweather.on = true; s.launches.on = true; s.quiet.on = true
  const c = buildConfig(s, 'nl', { lat: 52.0912345, lon: 5.1, name: 'Utrecht' })
  assert.equal(c.v, 1); assert.equal(c.lang, 'nl'); assert.deepEqual(c.site, { lat: 52.091, lon: 5.1, name: 'Utrecht' })
  assert.deepEqual(Object.keys(c.spaceweather).sort(), ['aurora', 'auroraMin', 'cme', 'flareMin', 'kpMin', 'on', 'radio', 'watches'])
  assert.deepEqual(c.launches, { on: true, leadMin: 60 }); assert.deepEqual(c.quiet, { on: true, from: '23:00', to: '07:00' })
  for (const l of ['nl', 'en', 'el'] as const) for (const k of ['kp_title', 'kp_body', 'aurora_title', 'aurora_body', 'flare_title', 'flare_body', 'cme_title', 'cme_body', 'radio_title', 'radio_body', 'watch_title', 'watch_body', 'launch_title', 'launch_body', 'channel_spaceweather', 'channel_launches'])
    assert.ok(NOTIF[l][k], `${l}.${k}`)
  assert.equal(c.texts.kp_title, 'Geomagnetische storm {g}')
  assert.equal(buildConfig(s, 'en', null).site, null)
  JSON.stringify(c)
})

test('normalize rejects garbage, keeps valid values', () => {
  assert.deepEqual(normalize(null), defaults())
  const n = normalize({ spaceweather: { on: true, kpMin: 42, flareMin: 'Z', auroraMin: 50 }, launches: { on: true, leadMin: 45 }, quiet: { from: '25:00', to: '06:30' }, summary: { morningTime: '07:15' }, autostart: 'yes' })
  assert.equal(n.spaceweather.on, true); assert.equal(n.spaceweather.kpMin, 6); assert.equal(n.spaceweather.flareMin, 'off'); assert.equal(n.spaceweather.auroraMin, 50)
  assert.equal(n.launches.leadMin, 60); assert.equal(n.quiet.from, '23:00'); assert.equal(n.quiet.to, '06:30'); assert.equal(n.summary.morningTime, '07:15'); assert.equal(n.autostart, false)
})
