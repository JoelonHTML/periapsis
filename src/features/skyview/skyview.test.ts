// Run: node --test src/features/skyview/skyview.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { applyM, applyMT, basisAzAlt, basisFromOrientation, blendBasis, bvColor, camScale, horizonMatrix, hzAltAz, hzVec, limitingMag, project, radecVec, riseTransitSet, solarClock, unproject, yawBasis, type Cam, type V3 } from './geom.ts'
import { bodyAltAz } from '../tonight/sky.ts'
import { findPlaces, nearestPlace, ALIASES, type Place } from './places.ts'
import { conIndexAt, decodeSky, galVec, spectralClass, type RawSky } from './skydata.ts'

const raw = JSON.parse(readFileSync(new URL('./data/sky.json', import.meta.url), 'utf8')) as RawSky
const places = JSON.parse(readFileSync(new URL('./data/places.json', import.meta.url), 'utf8')) as Place[]
const bin = (f: string) => new Uint8Array(inflateRawSync(readFileSync(new URL(`./data/${f}`, import.meta.url))))
const sky = decodeSky(raw, bin('stars.bin'), bin('dsos.bin'))
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`)
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const star = (name: string) => { const i = sky.names.findIndex((n) => n?.name === name); assert.ok(i >= 0, name); return i }

test('Polaris stands about as high as the latitude, due north', () => {
  const p = radecVec(...(([ra, dec]) => [ra, dec] as [number, number])([sky.ra[star('Polaris')], sky.dec[star('Polaris')]]))
  for (const [lat, lon, ms] of [[52.09, 5.12, Date.UTC(2026, 0, 15, 21)], [37.98, 23.73, Date.UTC(2026, 6, 1, 1)], [10, -60, Date.UTC(2026, 3, 3, 12)], [-20, 30, Date.UTC(2026, 3, 3, 12)]] as const) {
    const h = hzAltAz(applyM(horizonMatrix(ms, lat, lon), p))
    if (lat > 0) { near(h.alt, lat, 1.1, `lat ${lat}`); assert.ok(angDiff(h.az, 0) < 3 / Math.cos(lat * Math.PI / 180) + 1, `az ${h.az}`) }
    else assert.ok(h.alt < 0, 'below the horizon in the south')
  }
})

// independent calculation: Meeus 12.4 sidereal time, precession by the annual rates, textbook alt/az
function sirius(ms: number, lat: number, lon: number) {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525, yrs = (jd - 2451545) / 365.25
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T) % 360
  const r = Math.PI / 180
  let ra = 101.28715533, dec = -16.71611586
  const dra = (3.07496 + 1.33621 * Math.sin(ra * r) * Math.tan(dec * r)) * 15 / 3600, ddec = (20.0431 * Math.cos(ra * r)) / 3600
  ra += dra * yrs; dec += ddec * yrs
  const H = (gmst + lon - ra) * r, p = lat * r, d = dec * r
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H))
  const az = Math.atan2(-Math.sin(H) * Math.cos(d), Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H))
  return { alt: alt / r, az: ((az / r) + 360) % 360 }
}
test('Sirius altitude and azimuth match an independent calculation (< 0.1 deg)', () => {
  const s = star('Sirius'), v = radecVec(sky.ra[s], sky.dec[s])
  near(sky.mag[s], -1.44, 0.06)
  for (const [lat, lon, ms] of [[52.09, 5.12, Date.UTC(2026, 0, 15, 21)], [-33.9, 18.4, Date.UTC(2026, 1, 1, 20, 30)], [35, 139, Date.UTC(2025, 11, 20, 14)], [64, -22, Date.UTC(2026, 9, 9, 3)]] as const) {
    const mine = hzAltAz(applyM(horizonMatrix(ms, lat, lon), v)), ref = sirius(ms, lat, lon)
    near(mine.alt, ref.alt, 0.1, 'alt'); assert.ok(angDiff(mine.az, ref.az) < 0.1 / Math.max(0.2, Math.cos(ref.alt * Math.PI / 180)), `az ${mine.az} vs ${ref.az}`)
  }
  assert.ok(sirius(Date.UTC(2026, 0, 15, 21), 52.09, 5.12).alt > 5, 'sanity: Sirius is up on a January evening in Utrecht')
})

test('horizon matrix is a rotation; transposed it is the inverse', () => {
  const m = horizonMatrix(Date.UTC(2026, 4, 5, 3, 2), -41, 174), v: V3 = radecVec(123, -33)
  const w = applyM(m, v), back = applyMT(m, w)
  for (let i = 0; i < 3; i++) near(back[i], v[i], 1e-12)
  near(Math.hypot(...w), 1, 1e-12)
})

test('stereographic projection round-trips (pixels and directions), up to 120 deg fov', () => {
  for (const fov of [20, 60, 120]) {
    const b = basisAzAlt(200, 35), cam: Cam = { ...b, cx: 200, cy: 380, k: camScale(400, 860, fov) }
    const o = { x: 0, y: 0 }
    for (const [x, y] of [[200, 380], [10, 20], [390, 800], [123, 456]]) {
      const h = unproject(cam, x, y)
      assert.ok(project(cam, h, o))
      near(o.x, x, 1e-6); near(o.y, y, 1e-6)
    }
    const edge = unproject(cam, 200, 380 - 200)  // top of the short side's half extent... x half = 200 px
    const ang = Math.acos(edge[0] * b.f[0] + edge[1] * b.f[1] + edge[2] * b.f[2]) * 180 / Math.PI
    near(ang, fov / 2, 1e-6, 'fov maps to the shorter side')
  }
  // the view centre is what we look at; north is up when looking at the horizon in the north, east is to the right
  const cam: Cam = { ...basisAzAlt(0, 0), cx: 0, cy: 0, k: 100 }, o = { x: 0, y: 0 }
  project(cam, hzVec(0, 0), o); near(o.x, 0, 1e-9); near(o.y, 0, 1e-9)
  project(cam, hzVec(0, 20), o); assert.ok(o.x > 0, 'east is right')
  project(cam, hzVec(20, 0), o); assert.ok(o.y < 0, 'up is up on screen')
})

test('device orientation -> view direction (phone held upright, portrait)', () => {
  const az = (b: { f: V3 }) => hzAltAz(b.f)
  // upright, back of the phone to the north: beta 90, alpha 0
  let b = basisFromOrientation(0, 90, 0); near(az(b).alt, 0, 1e-9); near(az(b).az, 0, 1e-9); near(b.u[2], 1, 1e-9)
  // turned clockwise (seen from above) to face east: alpha 270
  b = basisFromOrientation(270, 90, 0); near(az(b).az, 90, 1e-9)
  b = basisFromOrientation(180, 90, 0); near(az(b).az, 180, 1e-9)
  // tilted back 30 deg from upright (looking 30 deg above the horizon), facing west (alpha 90)
  b = basisFromOrientation(90, 120, 0); near(az(b).alt, 30, 1e-9); near(az(b).az, 270, 1e-9)
  // flat on a table, screen up: looks straight down
  b = basisFromOrientation(0, 0, 0); near(az(b).alt, -90, 1e-9)
  // phone sideways (landscape, screen angle 90 = rotated counter-clockwise): same viewing direction, screen top still points up
  b = basisFromOrientation(0, 0, -90, 90)
  near(az(b).alt, 0, 1e-9); near(b.u[2], 1, 1e-9)
  // right vector is east when facing north
  b = basisFromOrientation(0, 90, 0); near(b.r[0], 1, 1e-9)
  // smoothing across the 0/360 seam does not swing through the opposite direction
  const s = blendBasis(basisFromOrientation(359, 90, 0), basisFromOrientation(1, 90, 0), 0.5); near(angDiff(az(s).az, 0), 0, 1e-6)
  // yaw nudges the heading clockwise
  near(az(yawBasis(basisFromOrientation(0, 90, 0), 10)).az, 10, 1e-9)
})

test('rise, transit and set of the Sun at the equator at the March equinox', () => {
  const site = { lat: 0, lon: 0, altM: 0 }, from = Date.UTC(2026, 2, 20, 0, 0)
  const r = riseTransitSet((ms) => bodyAltAz('sun', ms, site).alt, from, -0.833)
  const hr = (ms: number | null) => ((ms ?? 0) - from) / 3600e3
  near(hr(r.rise), 5.95, 0.15); near(hr(r.set), 18.05, 0.15)
  assert.ok(r.transit && r.transit.alt > 85 && Math.abs(hr(r.transit.ms) - 12) < 0.3)
  // circumpolar star and a star that never rises
  const pol = radecVec(37.95, 89.26), m = (lat: number) => (ms: number) => hzAltAz(applyM(horizonMatrix(ms, lat, 5), pol)).alt
  assert.equal(riseTransitSet(m(52), from, 0).always, 'up'); assert.equal(riseTransitSet(m(-30), from, 0).always, 'down')
})

test('solar clock: noon at the Greenwich meridian is 12:00 UTC; day offset', () => {
  assert.equal(solarClock(Date.UTC(2026, 5, 1, 12), 0).hhmm, '12:00')
  assert.equal(solarClock(Date.UTC(2026, 5, 1, 12), 90).hhmm, '18:00')
  assert.equal(solarClock(Date.UTC(2026, 5, 1, 20), 90, Date.UTC(2026, 5, 1, 12)).day, 1)
})

test('colours and daylight limit are sane', () => {
  const blue = bvColor(-0.2), red = bvColor(1.6)
  assert.ok(blue[2] >= blue[0] && red[0] > red[2])
  assert.ok(limitingMag(-30) > 6 && limitingMag(-6) < 4 && limitingMag(20) < -2 && limitingMag(-10) > limitingMag(-5))
})

test('sky data is complete: 41k stars to mag 8, constellations, Milky Way, deep sky', () => {
  assert.ok(sky.n > 41000 && sky.mag[0] < -1 && sky.mag[sky.n - 1] > 7.5 && sky.mag[sky.n - 1] <= 8.1)
  for (let i = 1; i < sky.n; i++) if (sky.mag[i] < sky.mag[i - 1]) assert.fail('sorted by magnitude')
  near(sky.ra[star('Sirius')], 101.287, 0.01); near(sky.dec[star('Sirius')], -16.716, 0.01)
  assert.equal(sky.cons.length, 88)
  assert.ok(sky.lineSegs.length / 6 > 600)
  assert.ok(sky.borders.length >= 88)
  const g = sky.mw // the band: bright at the galactic centre (RA 266, Dec -29), empty at the north galactic pole (RA 192, Dec 27)
  assert.ok(g.w === 360 && g.cells[(90 + 29) * 360 + 266] > 0.3 && g.cells[(90 - 27) * 360 + 192] < 0.05)
  assert.ok(g.cells[(90 - 60) * 360 + 5] > 0.1, 'Cassiopeia in the band')
})

test('deep-sky catalogue: parsing, ids, sizes, surface brightness', () => {
  const by = (id: string) => { const d = sky.dsos.find((x) => x.id === id); assert.ok(d, id); return d! }
  assert.ok(sky.dsos.length > 5000)
  for (let i = 1; i < sky.dsos.length; i++) assert.ok(sky.dsos[i].mag >= sky.dsos[i - 1].mag, 'sorted by magnitude')
  const m31 = by('M31')
  assert.equal(m31.alt, 'NGC 224'); assert.equal(m31.type, 's'); near(m31.mag, 3.4, 0.1); near(m31.ra, 10.685, 0.01); near(m31.dec, 41.269, 0.01)
  near(m31.maj, 189, 2); near(m31.min, 62, 2); assert.equal(m31.pa, 35); near(m31.sb, 22.2, 0.5, 'M31 surface brightness (mag/arcsec2)')
  const m42 = by('M42'); assert.equal(m42.alt, 'NGC 1976'); assert.equal(m42.type, 'bn'); assert.ok(m42.name.includes('Orion'))
  assert.equal(by('M45').type, 'sfr'); assert.ok(by('NGC 7000').maj >= 100); assert.ok(sky.dsos.filter((x) => x.id.startsWith('M')).length >= 105)
  assert.ok(sky.dsos.some((x) => x.id.startsWith('IC ')) && sky.dsos.some((x) => x.id.startsWith('NGC ')))
  assert.ok(sky.dsos.some((x) => x.type === 'gc' && x.id === 'NGC 5139'), 'omega Centauri')
  assert.ok(by('M13').type === 'gc' && by('M57').type === 'pn')
  assert.ok(Number.isFinite(m42.sb) === (m42.mag < 90))
})

test('constellation lookup from the IAU boundaries: known stars', () => {
  const at = (name: string) => { const i = star(name); return sky.cons[conIndexAt(sky, sky.ra[i], sky.dec[i])]?.id }
  assert.equal(at('Polaris'), 'UMi'); assert.equal(at('Betelgeuse'), 'Ori'); assert.equal(at('Sirius'), 'CMa'); assert.equal(at('Vega'), 'Lyr')
  assert.equal(at('Rigil Kentaurus'), 'Cen'); assert.equal(at('Acrux'), 'Cru'); assert.equal(at('Deneb'), 'Cyg'); assert.equal(at('Antares'), 'Sco')
  assert.equal(at('Spica'), 'Vir'); assert.equal(at('Regulus'), 'Leo'); assert.equal(at('Aldebaran'), 'Tau'); assert.equal(at('Thuban'), 'Dra')
  assert.equal(sky.cons[conIndexAt(sky, 0, -89.5)].id, 'Oct', 'south pole'); assert.equal(sky.cons[conIndexAt(sky, 180, 89.9)].id, 'UMi', 'north pole')
  assert.equal(at('Algenib'), 'Peg', 'east of 0h RA'); assert.equal(at('Alpheratz'), 'And'); assert.equal(at('Markab'), 'Peg', 'west of 0h RA'); assert.equal(at('Caph'), 'Cas')
  assert.equal(at('Unukalhai'), 'Ser', 'two-part constellation (Serpens)')
})
test('constellation lookup agrees with the catalogue designations (Bayer/Flamsteed) for >98 % of 3000 named stars', () => {
  let ok = 0, n = 0
  for (let i = 0; i < sky.n; i++) {
    const nm = sky.names[i]
    if (!nm?.con || !(nm.bayer || nm.flam)) continue
    n++
    if (sky.cons[conIndexAt(sky, sky.ra[i], sky.dec[i])]?.id === nm.con) ok++
  }
  assert.ok(n > 2000 && ok / n > 0.98, `${ok}/${n}`)
})

test('galactic coordinates: the centre, the pole and the plane', () => {
  const sgr = galVec(0, 0), ra = (Math.atan2(sgr[1], sgr[0]) * 180 / Math.PI + 360) % 360, dec = Math.asin(sgr[2]) * 180 / Math.PI
  near(ra, 266.405, 0.05); near(dec, -28.936, 0.05)
  const p = galVec(0, 90); near((Math.atan2(p[1], p[0]) * 180 / Math.PI + 360) % 360, 192.859, 0.01); near(Math.asin(p[2]) * 180 / Math.PI, 27.128, 0.01)
  const a = galVec(180, 0); near(a[0] * sgr[0] + a[1] * sgr[1] + a[2] * sgr[2], -1, 1e-9)
  assert.equal(spectralClass(-0.2), 'B'); assert.equal(spectralClass(0.65), 'G'); assert.equal(spectralClass(1.7), 'M')
})

test('place search: offline, diacritics, aliases, nearest place', () => {
  const top = (q: string) => findPlaces(q, places, 3)[0]?.[0]
  assert.equal(top('amsterdam'), 'Amsterdam')
  assert.equal(top('Utrecht'), 'Utrecht')
  assert.equal(top('zürich'), 'Zürich')
  assert.equal(top('londen'), 'London'); assert.equal(top('Αθήνα'), 'Athens'); assert.equal(top('mauna'), 'Mauna Kea')
  for (const [k, v] of Object.entries(ALIASES)) assert.ok(places.some((p) => p[0] === v), `alias ${k} -> ${v} must exist`)
  assert.equal(nearestPlace(52.1, 5.1, places, 50)?.[0], 'Utrecht')
  assert.equal(nearestPlace(0, -140, places, 300), null, 'mid-Pacific: no place')
})

test('texts: nl/en/el have the same keys and placeholders, Greek is Greek, every used key exists', async () => {
  const { nl, en, el } = await import('./texts.ts')
  const { DEFAULT_LAYERS } = await import('./state.ts')
  const keys = Object.keys(nl).sort()
  assert.deepEqual(Object.keys(en).sort(), keys); assert.deepEqual(Object.keys(el).sort(), keys)
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
  for (const k of keys) { assert.equal(vars(en[k]), vars(nl[k]), `en ${k}`); assert.equal(vars(el[k]), vars(nl[k]), `el ${k}`); assert.ok(k === 'sv.ar' || /[Ͱ-Ͽ]/.test(el[k]), `el ${k} is not Greek`) }
  const used = new Set<string>()
  for (const f of ['Panel.tsx', 'Stage.tsx', 'InfoCard.tsx', 'PlaceMap.tsx', 'scene.ts', 'control.ts']) for (const m of readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').matchAll(/['"`](sv\.[A-Za-z0-9.]+)['"`]/g)) used.add(m[1])
  for (const k of used) assert.ok(k in nl, `missing text ${k}`)
  for (const l of Object.keys(DEFAULT_LAYERS)) if (l !== 'magLim' && l !== 'bortle') assert.ok(`sv.l.${l}` in nl, `layer text ${l}`)
  for (const k of ['star', 'sun', 'moon', 'planet', 'body', 'con', 'dso', 'sat', 'dwarf']) assert.ok(`sv.k.${k}` in nl)
  for (const k of ['galaxy', 'cluster', 'globular', 'planetary', 'nebula', 'snr']) assert.ok(`sv.type.${k}` in nl)
  for (const i of [0, 1, 2, 3, 4]) assert.ok(`sv.col.${i}` in nl)
})
