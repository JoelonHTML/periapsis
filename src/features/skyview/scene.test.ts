// Run: node --test src/features/skyview/scene.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { decodeSky, type RawSky } from './skydata.ts'
import { activeShowers, computeBodies, describe, objKey, searchObjects, skyCtx } from './scene.ts'

const bin = (f: string) => new Uint8Array(inflateRawSync(readFileSync(new URL(`./data/${f}`, import.meta.url))))
skyCtx.data = decodeSky(JSON.parse(readFileSync(new URL('./data/sky.json', import.meta.url), 'utf8')) as RawSky, bin('stars.bin'), bin('dsos.bin'))
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`)
const site = { lat: 52.09, lon: 5.12, altM: 0 }

test('search finds objects by every catalogue name: M, NGC, IC, HIP, HD, Bayer, common name', () => {
  const top = (q: string) => searchObjects(q, [])[0]
  assert.equal(objKey(top('m31').obj), objKey(searchObjects('NGC 224', [])[0].obj))
  assert.ok(top('M 42').label.includes('Orion'))
  assert.ok(top('ngc7000').label.includes('North America'))
  assert.ok(top('Andromeda Galaxy').label.startsWith('M31'))
  assert.ok(top('hip 32349').label.length > 0 && top('hip 32349').obj.k === 'star')
  assert.ok(top('HD 48915').obj.k === 'star', 'Sirius by HD number')
  assert.ok(top('betelgeuse').obj.k === 'star'); assert.ok(searchObjects('ceres', []).some((f) => f.obj.k === 'dwarf'))
})

test('describe: star, deep-sky object, planet carry the rich data', () => {
  const ms = Date.UTC(2026, 0, 15, 21), b = computeBodies(ms, site)
  const bet = searchObjects('betelgeuse', [])[0].obj, i = describe(bet, ms, site, b, [])!
  assert.equal(i.conName, 'Orion'); assert.ok(i.designations?.some((x) => x === 'HIP 27989') && i.designations?.some((x) => x === 'HD 39801'))
  assert.equal(i.spec, 'M'); near(i.mag!, 0.4, 0.3); near(i.distLy!, 550, 1); near(i.ra!, 88.79, 0.05); near(i.dec!, 7.407, 0.05)
  assert.ok(Math.abs(i.raD! - i.ra!) < 1 && Math.abs(i.raD! - i.ra!) > 0.1, 'of-date RA differs by precession (26 yr x 50 arcsec)')
  const m31 = describe(searchObjects('M31', [])[0].obj, ms, site, b, [])!
  near(m31.sizeArcmin![0], 189, 2); assert.equal(m31.conName, 'Andromeda'); assert.equal(m31.typeKey, 'galaxy'); assert.ok(m31.sb! > 21 && m31.sb! < 23)
  const jup = describe({ k: 'planet', id: 'jupiter' }, ms, site, b, [])!
  near(jup.diamArcsec!, 47, 3); assert.ok(jup.conName === 'Twins' || jup.conName === 'Gemini' || jup.conName === 'Tweelingen'); assert.ok(jup.illum! > 0.98); near(jup.mag!, -2.7, 0.15)
})

test('solar-system bodies: sizes, phases, ring tilt, Jupiter moons, dwarf planets', () => {
  const b = computeBodies(Date.UTC(2026, 9, 9, 22), site)
  const p = (id: string) => b.planets.find((x) => x.id === id)!
  near(p('saturn').radius * 2 * 3600, 18, 3, 'Saturn disc ~18 arcsec'); near(p('saturn').ringB, -7.3, 1.5, 'south face of the rings visible in late 2026')
  near(computeBodies(Date.UTC(2025, 2, 23), site).planets.find((x) => x.id === 'saturn')!.ringB, 0, 0.3, 'ring-plane crossing of March 2025')
  near(computeBodies(Date.UTC(2023, 8, 1), site).planets.find((x) => x.id === 'saturn')!.ringB, 9.2, 1.5, 'north face open 9 deg in Sep 2023')
  near(computeBodies(Date.UTC(2032, 5, 1), site).planets.find((x) => x.id === 'saturn')!.ringB, -26.9, 1.5, 'maximum opening in 2032')
  assert.ok(p('venus').illum > 0 && p('venus').illum <= 1 && p('mars').radius > 0)
  assert.equal(b.jupMoons.length, 4); assert.ok(b.jupMoons.every((m) => Math.hypot(m.x, m.y, m.z) > 5 && Math.hypot(m.x, m.y, m.z) < 28))
  const ceres = b.dwarfs.find((d) => d.id === 'ceres')!, pluto = b.dwarfs.find((d) => d.id === 'pluto')!
  assert.ok(ceres.mag > 6.5 && ceres.mag < 10 && pluto.mag > 13 && pluto.mag < 16, `Ceres ${ceres.mag.toFixed(1)}, Pluto ${pluto.mag.toFixed(1)}`)
})

test('meteor radiants: active around the peak only', () => {
  const ids = (ms: number) => activeShowers(ms).map((s) => s.id)
  assert.ok(ids(Date.UTC(2026, 7, 12, 22)).includes('perseids')); assert.ok(ids(Date.UTC(2026, 11, 14, 22)).includes('geminids'))
  assert.ok(!ids(Date.UTC(2026, 2, 20)).includes('perseids')); assert.ok(activeShowers(Date.UTC(2026, 7, 12, 22)).find((s) => s.id === 'perseids')!.strength > 0.8)
  assert.ok(ids(Date.UTC(2026, 0, 3, 12)).includes('quadrantids'))
})
