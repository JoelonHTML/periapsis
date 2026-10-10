// Run: node --test src/features/live/*.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseKpForecast, currentKp, dailyMaxKp, gScale, parseOvation, auroraAt, ovalEdge, parsePlasma, parseMag, parseFlare } from './spaceweather.ts'
import { parseApod, APOD_PAGE } from './apod.ts'
import { parseLaunches } from './launches.ts'
import { parseApproaches, parseCd, diameterKm, sizeRangeM, LD_KM } from './asteroids.ts'
import { formatCountdown, ageParts, parseUtc, safeUrl } from './util.ts'
import { kpFixture, ovationFixture, plasmaFixture, magFixture, flareFixture, apodFixture, launchesFixture, cadFixture } from './fixtures.ts'

const NOW = Date.parse('2026-10-03T19:00:00Z')
const junk: unknown[] = [null, undefined, 42, 'x', {}, [], [[]], [1, 2], { results: 'no' }, [['a'], ['b']], { fields: 1, data: 2 }]
const mustThrow = (p: (b: unknown) => unknown) => { for (const j of junk) assert.throws(() => p(j), undefined, JSON.stringify(j)) }

test('Kp forecast: table form, current value, daily maxima, G-scale', () => {
  const rows = parseKpForecast(kpFixture(NOW))
  assert.ok(rows.length > 20)
  const cur = currentKp(rows, NOW)!
  assert.notEqual(cur.kind, 'predicted')
  assert.ok(cur.t <= NOW)
  const days = dailyMaxKp(rows, NOW, 3)
  assert.equal(days.length, 3)
  assert.ok(days[0].max >= 5)
  assert.equal(gScale(4.67), 0); assert.equal(gScale(5), 1); assert.equal(gScale(7.33), 3); assert.equal(gScale(9), 5)
})
test('Kp forecast: object rows and bad rows are skipped', () => {
  const rows = parseKpForecast([{ time_tag: '2026-10-03T00:00:00', kp: 3, observed: 'observed' }, { time_tag: 'nope', kp: 1 }, { time_tag: '2026-10-03T03:00:00', kp: 12 }, null])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].t, Date.parse('2026-10-03T00:00:00Z'))
  mustThrow(parseKpForecast)
  assert.throws(() => parseKpForecast([['time_tag', 'kp'], ['bad', 'bad']]))
})
test('OVATION: nearest cell, wrap of negative longitudes, oval edge', () => {
  const o = parseOvation(ovationFixture())
  assert.ok(o.forecast !== null && o.cells.length > 300 && o.cells.length % 3 === 0)
  // Utrecht 52.09 N 5.12 E -> cell lon 5 lat 52
  const direct = auroraAt({ forecast: null, cells: [5, 52, 33, 6, 52, 99] }, 52.09, 5.12)
  assert.equal(direct, 33)
  assert.equal(auroraAt({ forecast: null, cells: [355, 40, 7] }, 40.2, -5), 7) // -5° = 355°
  assert.equal(auroraAt({ forecast: null, cells: [355, 40, 7] }, 41, -5), 0)
  assert.equal(auroraAt(o, 0, 0), 0)
  const e = ovalEdge(o, 52.09, 5.12)!
  assert.ok(e.lat > 52 && e.lat < 66)
  assert.ok(Math.abs(e.kmFromObserver - (e.lat - 52.09) * 111.2) < 1)
  assert.equal(ovalEdge({ forecast: null, cells: [5, 70, 5] }, 52, 5), null) // below the 10 % threshold
  const south = ovalEdge({ forecast: null, cells: [5, -60, 40, 5, -70, 40] }, -45, 5)!
  assert.equal(south.lat, -60)
  assert.equal(ovalEdge({ forecast: null, cells: [100, 60, 50] }, 52, 5), null) // other longitude
})
test('OVATION: raw array accepted, malformed rejected', () => {
  assert.equal(parseOvation([[1, 2, 30], [3, 4, 0], 'bad', [1]]).cells.length, 3)
  mustThrow(parseOvation)
  assert.throws(() => parseOvation({ coordinates: [['a', 'b', 'c']] }))
})
test('solar wind plasma / mag use the latest row with a value', () => {
  assert.deepEqual(parsePlasma(plasmaFixture), { t: Date.parse('2026-10-03T18:51:00Z'), speed: 462.7, density: 5.4 })
  const m = parseMag(magFixture)
  assert.equal(m.bz, -5.6); assert.equal(m.bt, 6.6)
  mustThrow(parsePlasma); mustThrow(parseMag)
  assert.throws(() => parsePlasma([['time_tag', 'speed'], ['2026-10-03 00:00:00', null]]))
})
test('X-ray flares: class of the latest, empty list ok, junk rejected', () => {
  assert.deepEqual(parseFlare(flareFixture), { cls: 'M1.4', maxT: Date.parse('2026-10-03T14:10:00Z') })
  assert.equal(parseFlare([]), null)
  assert.equal(parseFlare([{ max_class: 'zzz' }, 5]), null)
  assert.throws(() => parseFlare({}))
  assert.throws(() => parseFlare(null))
})
test('APOD: image, video, hostile urls, rate-limit error', () => {
  const a = parseApod(apodFixture)
  assert.equal(a.video, false); assert.equal(a.copyright, 'Some Astro Photographer'); assert.ok(a.hdurl)
  const v = parseApod({ title: 'V', url: 'https://www.youtube.com/embed/x?rel=0', media_type: 'video', thumbnail_url: 'https://img.youtube.com/a.jpg', date: '2026-10-01' })
  assert.equal(v.video, true); assert.equal(v.thumb, 'https://img.youtube.com/a.jpg'); assert.equal(v.copyright, null)
  assert.throws(() => parseApod({ title: 'X', url: 'javascript:alert(1)', media_type: 'image' }))
  assert.throws(() => parseApod({ error: { code: 'OVER_RATE_LIMIT', message: 'x' } }))
  assert.equal(parseApod({ title: 'X', url: 'https://a.b/c.jpg', hdurl: 'javascript:1', media_type: 'image' }).hdurl, null)
  mustThrow(parseApod)
})
const APOD_HTML = `<html>
<head>
<title> APOD: 2026 October 9 - The Pillars &amp; More
</title>
</head>
<body BGCOLOR="#F4F4FF" text="#000000" link="#0000FF" vlink="#7F0F9F" alink="#FF0000">
<center>
<h1> Astronomy Picture of the Day </h1>
<p>
<a href="archivepix.html">Discover the cosmos!</a>
Each day a different image or photograph of our fascinating universe is
featured, along with a brief explanation written by a professional astronomer.
<p>
2026 October 9
<br>
<a href="image/2610/Pillars_Webb_4000.jpg">
<IMG SRC="image/2610/Pillars_Webb_1080.jpg"
alt="See Explanation.  Clicking on the picture will download
the highest resolution version available." style="max-width:100%"></a>
</center>

<center>
<b> The Pillars &amp; More </b> <br>
<b> Image Credit &amp;
<a href="lib/about_apod.html#srapply">Copyright</a>: </b>
<a href="https://example.org">Some Astro</a>
</center> <p>

<b> Explanation: </b>
What do the <a href="x.html">Pillars</a> look like in infrared?
Dark dust is transparent here.
<p> <center>
<b> Tomorrow's picture: </b>open space
</center>
</body></html>`
test('APOD: web page fallback and pages without an image url', () => {
  const a = parseApod(APOD_HTML)
  assert.equal(a.date, '2026-10-09'); assert.equal(a.title, 'The Pillars & More'); assert.equal(a.video, false)
  assert.equal(a.url, new URL('image/2610/Pillars_Webb_1080.jpg', APOD_PAGE).href)
  assert.equal(a.hdurl, 'https://apod.nasa.gov/apod/image/2610/Pillars_Webb_4000.jpg')
  assert.equal(a.copyright, 'Some Astro'); assert.match(a.explanation, /^What do the Pillars look like in infrared\? Dark dust is transparent here\.$/)
  const yt = parseApod(APOD_HTML.replace(/<a href="image[\s\S]*?<\/a>/, '<iframe width="960" height="540" src="https://www.youtube.com/embed/abc?rel=0" frameborder="0"></iframe>'))
  assert.equal(yt.video, true); assert.equal(yt.url, 'https://www.youtube.com/embed/abc?rel=0')
  const other = parseApod({ title: 'Interactive', media_type: 'other', date: '2026-10-08' })
  assert.equal(other.url, 'https://apod.nasa.gov/apod/ap261008.html'); assert.equal(other.video, true)
  assert.throws(() => parseApod('<html>Service Unavailable</html>'))
})
test('OVATION robustness: swapped columns, stray equatorial cells, rtsw solar wind (newest first, active spacecraft)', () => {
  // file that lists [lat, lon, p] and says so
  const sw = parseOvation({ 'Data Format': '[Latitude, Longitude, Aurora]', coordinates: [[62, 5, 40], [61, 5, 30], [60, 5, 12]] })
  assert.deepEqual(sw.cells.slice(0, 3), [5, 62, 40])
  // unlabeled but swapped (a "lat" column beyond 90): detected
  assert.deepEqual(parseOvation({ coordinates: [[62, 300, 40]] }).cells, [300, 62, 40])
  // band 66..58 °N around 5°E plus noise near the equator: edge is the band's equatorward end, not 0°
  const cells: number[] = []
  for (let la = 70; la >= 58; la--) cells.push(5, la, la >= 64 ? 60 : 20)
  cells.push(5, 0, 15, 5, 1, 12, 5, 30, 11)
  const e = ovalEdge({ forecast: null, cells }, 51.5, 4.5)!
  assert.equal(e.lat, 58); assert.equal(e.kmFromObserver, Math.round(6.5 * 111.2))
  // rtsw files: objects, newest first, two spacecraft
  const wind = [
    { time_tag: '2026-10-10T19:59:00', active: false, source: 'ACE', proton_speed: 999, proton_density: 1 },
    { time_tag: '2026-10-10T19:58:00', active: true, source: 'DSCOVR', proton_speed: 512.3, proton_density: 6.1 },
    { time_tag: '2026-10-10T19:30:00', active: true, source: 'DSCOVR', proton_speed: 400, proton_density: 3 },
  ]
  assert.deepEqual(parsePlasma(wind), { t: Date.parse('2026-10-10T19:58:00Z'), speed: 512.3, density: 6.1 })
  const mag = [{ time_tag: '2026-10-10T19:57:00', active: true, bt: 12.1, bz_gsm: -8.4 }, { time_tag: '2026-10-10T19:50:00', active: true, bt: 5, bz_gsm: 2 }]
  assert.deepEqual(parseMag(mag), { t: Date.parse('2026-10-10T19:57:00Z'), bz: -8.4, bt: 12.1 })
})
test('APOD page with a site header (new layout): finds the picture and the real title, not "NASA Science"; junk pages throw', () => {
  const html = `<!doctype html><html><head><title>APOD: 2026 October 10 - Moon and Venus at Dawn</title>
<link rel=stylesheet href="/apod/style.css"></head><body>
<header class=site><a href="https://science.nasa.gov"><img src='https://science.nasa.gov/wp-content/uploads/nasa-logo.svg' alt=NASA></a><b>NASA Science</b></header>
<center><h1>Astronomy Picture of the Day</h1><p>2026 October 10<br>
<a href='image/2610/MoonVenus_Big.jpg'><img src='image/2610/MoonVenus_1080.jpg' alt='Moon and Venus' style='max-width:100%'></a></center>
<center><b>NASA Science</b> <b> Moon and Venus at Dawn </b><br><b>Image Credit &amp; Copyright:</b> A. Photographer</center>
<p><b> Explanation: </b> A thin crescent Moon met brilliant Venus.</p><center><b> Tomorrow's picture: </b></center></body></html>`
  const a = parseApod(html)
  assert.equal(a.title, 'Moon and Venus at Dawn'); assert.equal(a.video, false); assert.equal(a.date, '2026-10-10')
  assert.equal(a.url, 'https://apod.nasa.gov/apod/image/2610/MoonVenus_1080.jpg')
  assert.equal(a.hdurl, 'https://apod.nasa.gov/apod/image/2610/MoonVenus_Big.jpg')
  assert.equal(a.explanation, 'A thin crescent Moon met brilliant Venus.')
  // a NASA landing page (redirect) has no APOD picture: throw so the next mirror is used
  assert.throws(() => parseApod('<html><head><title>NASA Science</title></head><body><img src="/logo.svg"><b>NASA Science</b></body></html>'))
  // video day from the page: still from YouTube
  const v = parseApod(html.replace(/<a href='image[\s\S]*?<\/a>/, '<iframe width=960 height=540 src="https://www.youtube.com/embed/abcDEF123?rel=0"></iframe>'))
  assert.equal(v.video, true); assert.equal(v.thumb, 'https://img.youtube.com/vi/abcDEF123/hqdefault.jpg')
})
test('launches: documented shape, missing fields, string info_urls', () => {
  const l = parseLaunches(launchesFixture(NOW))
  assert.equal(l.length, 3)
  assert.equal(l[0].provider, 'SpaceX'); assert.equal(l[0].pad, 'Space Launch Complex 40, Florida, USA')
  assert.equal(l[1].webcast, null); assert.equal(l[0].webcast, 'https://www.youtube.com/watch?v=abc')
  assert.equal(l[0].net, NOW + 5.5 * 3600000)
  const sparse = parseLaunches({ results: [{ name: 'Bare', info_urls: ['https://x.org/a'], net: 'garbage' }, { nothing: true }] })
  assert.equal(sparse.length, 1); assert.equal(sparse[0].net, null); assert.equal(sparse[0].info, 'https://x.org/a'); assert.equal(sparse[0].provider, '')
  assert.deepEqual(parseLaunches({ results: [] }), [])
  assert.throws(() => parseLaunches({ results: [{ id: 1 }] }))
  mustThrow(parseLaunches)
})
test('close approaches: fields/data by name, missing H, bad rows', () => {
  const a = parseApproaches(cadFixture)
  assert.equal(a.length, 3); assert.equal(a[0].des, '2026 TX3')
  assert.equal(a[0].t, Date.UTC(2026, 9, 8, 14, 56))
  assert.ok(Math.abs(a[0].distLd - 0.0123456 * 149597870.7 / LD_KM) < 1e-9)
  assert.ok(Math.abs(a[0].distLd - 4.80) < 0.01)
  assert.equal(a[0].vRel, 9.87); assert.equal(a[2].h, null)
  assert.equal(parseApproaches({ fields: ['des', 'jd', 'dist'], data: [['A', '2440587.5', '0.01'], ['B'], 'x'] }).length, 1)
  assert.deepEqual(parseApproaches({ fields: ['des', 'cd', 'dist'], data: [] }), [])
  assert.throws(() => parseApproaches({ fields: ['x'], data: [] }))
  assert.throws(() => parseApproaches({ fields: ['des', 'cd', 'dist'], data: [['A', 'garbage', 'x']] }))
  assert.equal(parseCd('2026-Dec-31 23:59'), Date.UTC(2026, 11, 31, 23, 59)); assert.equal(parseCd('2026-Foo-01'), null)
  mustThrow(parseApproaches)
})
test('H to diameter: D = 1329 km / sqrt(albedo) * 10^(-H/5)', () => {
  assert.ok(Math.abs(diameterKm(22, 0.14) - 0.1415) < 0.0005) // the classic "H=22 ~ 140 m"
  assert.ok(Math.abs(diameterKm(0, 1) - 1329) < 1e-9)
  assert.ok(Math.abs(diameterKm(5, 1) / diameterKm(10, 1) - 10) < 1e-9) // 5 mag = factor 10
  const r = sizeRangeM(24.1)
  assert.ok(r.min < r.max); assert.ok(Math.abs(r.max / r.min - Math.sqrt(5)) < 1e-9)
  assert.ok(r.min > 20 && r.max < 120)
})
test('countdown and age formatting', () => {
  assert.equal(formatCountdown(2 * 86400000 + 3 * 3600000 + 14 * 60000 + 5999), 'T−2d 03:14:05')
  assert.equal(formatCountdown(65000), 'T−00:01:05')
  assert.equal(formatCountdown(0), 'T−00:00:00')
  assert.equal(formatCountdown(-750000), 'T+00:12:30')
  assert.equal(formatCountdown(86400000, { d: 'dg' }), 'T−1dg 00:00:00')
  assert.equal(formatCountdown(NaN), '—')
  assert.deepEqual(ageParts(30_000), { n: 0, unit: 'min' }); assert.deepEqual(ageParts(5 * 60000), { n: 5, unit: 'min' })
  assert.deepEqual(ageParts(3 * 3600000), { n: 3, unit: 'h' }); assert.deepEqual(ageParts(5 * 86400000), { n: 5, unit: 'd' })
  assert.deepEqual(ageParts(-5), { n: 0, unit: 'min' })
})
test('utc parsing and url filter', () => {
  assert.equal(parseUtc('2026-10-03 00:00:00'), Date.UTC(2026, 9, 3)); assert.equal(parseUtc('2026-10-03T00:00:00Z'), Date.UTC(2026, 9, 3))
  assert.equal(parseUtc('2026-10-03 00:00:00.000'), Date.UTC(2026, 9, 3)); assert.equal(parseUtc(5), null)
  assert.equal(safeUrl('https://a.b'), 'https://a.b'); assert.equal(safeUrl('javascript:alert(1)'), null); assert.equal(safeUrl('https://a b'), null)
})
