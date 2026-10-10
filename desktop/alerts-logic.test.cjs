const test = require('node:test'), assert = require('node:assert/strict')
const L = require('./alerts-logic.cjs')

const NOW = Date.parse('2026-10-03T22:30:00Z')
const texts = { kp_title: 'Storm {g}', kp_body: 'Kp {kp} lat {lat}', aurora_title: 'Aurora {pct}', aurora_body: '{pct}% over {place}', flare_title: 'Flare {cls}', flare_body: '{cls} at {time}', cme_title: 'CME', cme_body: '{msg}', radio_title: 'Radio', radio_body: '{msg}', watch_title: 'Watch {g}', watch_body: '{msg}', launch_title: 'Launch in {min} min', launch_body: '{name} — {provider}' }
const cfg = (o = {}) => ({ v: 1, lang: 'en', site: { lat: 52, lon: 5 }, spaceweather: { on: true, kpMin: 5, aurora: true, auroraMin: 30, flareMin: 'M', cme: true, radio: true, watches: true }, launches: { on: true, leadMin: 60 }, quiet: { on: false, from: '23:00', to: '07:00' }, texts, ...o })
const kp = (v) => [['time_tag', 'kp', 'observed', 'noaa_scale'], ['2026-10-03 18:00:00', '2.0', 'observed', null], ['2026-10-03 21:00:00', String(v), 'estimated', null], ['2026-10-04 00:00:00', '8.00', 'predicted', null]]
const msg = (code, head) => `Space Weather Message Code: ${code}\r\nSerial Number: 1\r\nIssue Time: 2026 Oct 03 2200 UTC\r\n\r\n${head}\r\n`

test('gFromKp', () => { assert.deepEqual([4.67, 5, 6.33, 7, 9].map(L.gFromKp), [0, 1, 2, 3, 5]) })
test('kp: below threshold silent, predicted ignored, G2 notifies', () => {
  assert.equal(L.classifySpaceWeather({ kp: kp(4.33) }, cfg(), NOW).length, 0)
  const n = L.classifySpaceWeather({ kp: kp(6.33) }, cfg(), NOW)
  assert.equal(n.length, 1); assert.equal(n[0].title, 'Storm G2'); assert.equal(n[0].body, 'Kp 6.3 lat 55')
  assert.equal(L.classifySpaceWeather({ kp: kp(5) }, cfg({ spaceweather: { ...cfg().spaceweather, kpMin: 6 } }), NOW).length, 0)
})
test('aurora needs darkness and probability', () => {
  const ov = { coordinates: [[5, 52, 45], [6, 52, 10]] }
  assert.equal(L.classifySpaceWeather({ ovation: ov }, cfg(), NOW)[0].body, '45% over 52.0°N 5.0°E')
  assert.equal(L.classifySpaceWeather({ ovation: ov }, cfg(), Date.parse('2026-10-03T11:00:00Z')).length, 0) // daytime
  assert.equal(L.classifySpaceWeather({ ovation: { coordinates: [[5, 52, 10]] } }, cfg(), NOW).length, 0)
})
test('flares: M ok, C ignored, X-only filter, stale ignored', () => {
  const f = (c, t) => [{ max_class: c, max_time: t }]
  assert.equal(L.classifySpaceWeather({ flares: f('M1.4', '2026-10-03T21:10:00Z') }, cfg(), NOW).length, 1)
  assert.equal(L.classifySpaceWeather({ flares: f('C9.0', '2026-10-03T21:10:00Z') }, cfg(), NOW).length, 0)
  assert.equal(L.classifySpaceWeather({ flares: f('M1.4', '2026-10-03T21:10:00Z') }, cfg({ spaceweather: { ...cfg().spaceweather, flareMin: 'X' } }), NOW).length, 0)
  assert.equal(L.classifySpaceWeather({ flares: f('X1.0', '2026-10-03T12:10:00Z') }, cfg(), NOW).length, 0)
})
test('SWPC alerts by product code', () => {
  const a = (id, head, t = '2026-10-03 21:50:00.000') => ({ product_id: id, issue_datetime: t, message: msg(id, head) })
  const n = L.classifySpaceWeather({ alerts: [
    a('ALTK05', 'ALERT: Geomagnetic K-index of 5'), a('WARK06', 'WARNING: Geomagnetic K-index of 6 expected'), a('WATA30', 'WATCH: Geomagnetic Storm Category G3 Predicted'),
    a('ALTTP2', 'ALERT: Type II Radio Emission'), a('ALTTP4', 'ALERT: Type IV Radio Emission'), a('ALTK05', 'ALERT: Geomagnetic K-index of 5', '2026-10-02 01:00:00.000'),
  ] }, cfg(), NOW)
  assert.deepEqual(n.map((x) => x.tag), ['kp', 'watch', 'watch', 'cme', 'radio'])
  assert.equal(n[2].title, 'Watch G3'); assert.match(n[2].body, /^WATCH: Geomagnetic Storm Category G3/)
  const off = { ...cfg().spaceweather, watches: false, cme: false, radio: false }
  assert.deepEqual(L.classifySpaceWeather({ alerts: [a('WARK06', 'WARNING: x'), a('ALTTP2', 'ALERT: x')] }, cfg({ spaceweather: off }), NOW), [])
})
test('Kp row + ALTK alert give one notification (same dedupe key)', () => {
  const state = {}, d = { kp: kp(5), alerts: [{ product_id: 'ALTK05', issue_datetime: '2026-10-03 21:50:00.000', message: msg('ALTK05', 'ALERT: x') }] }
  assert.equal(L.takeNew(L.classifySpaceWeather(d, cfg(), NOW), state, NOW).length, 1)
})
test('launches: lead window, status, dedupe', () => {
  const r = (id, min, ab = 'Go') => ({ id, name: 'Falcon 9 | X', net: new Date(NOW + min * 60e3).toISOString(), status: { abbrev: ab }, launch_service_provider: { name: 'SpaceX' } })
  const body = { results: [r('a', 45), r('b', 200), r('c', 20, 'Hold'), r('d', -5), r('e', 85)] }
  const n = L.classifyLaunches(body, cfg(), NOW)
  assert.deepEqual(n.map((x) => x.title), ['Launch in 45 min', 'Launch in 85 min']) // 85 <= 60 + 30 poll slack
  assert.equal(n[0].body, 'Falcon 9 | X — SpaceX')
  const state = {}
  assert.equal(L.takeNew(n, state, NOW).length, 2); assert.equal(L.takeNew(n, state, NOW + 1000).length, 0)
  assert.equal(L.takeNew(n, state, NOW + 8 * 864e5).length, 2) // forgotten after 7 days
})
test('quiet hours (overnight window)', () => {
  const q = { on: true, from: '23:00', to: '07:00' }, at = (h, m) => new Date(2026, 9, 3, h, m).getTime()
  assert.equal(L.inQuiet(q, at(23, 30)), true); assert.equal(L.inQuiet(q, at(3, 0)), true); assert.equal(L.inQuiet(q, at(7, 0)), false); assert.equal(L.inQuiet(q, at(12, 0)), false)
  assert.equal(L.inQuiet({ ...q, on: false }, at(3, 0)), false)
})
test('runCheck: fetches, dedupes, survives partial failure, launches fetched at most hourly, quiet holds back without marking', async () => {
  let calls = []
  const fetchJson = async (u) => {
    calls.push(u)
    if (u.includes('alerts')) throw new Error('boom')
    if (u.includes('k-index')) return kp(6)
    if (u.includes('thespacedevs')) return { results: [{ id: 'z', name: 'N', net: new Date(NOW + 30 * 60e3).toISOString(), status: { abbrev: 'Go' } }] }
    return u.includes('ovation') ? { coordinates: [] } : []
  }
  const state = {}
  const r1 = await L.runCheck(fetchJson, cfg(), state, NOW)
  assert.equal(r1.notes.length, 2); assert.equal(r1.errors.length, 1)
  calls = []
  const r2 = await L.runCheck(fetchJson, cfg(), state, NOW + 30 * 60e3)
  assert.equal(r2.notes.length, 0); assert.ok(!calls.some((u) => u.includes('thespacedevs')), 'launch feed cached for an hour')
  const night = new Date(2026, 9, 4, 1, 0).getTime(), s2 = {}
  const q = cfg({ quiet: { on: true, from: '23:00', to: '07:00' } })
  assert.equal((await L.runCheck(fetchJson, q, s2, night)).notes.length, 0)
  assert.equal(Object.keys(s2.seen || {}).length, 0)
})
