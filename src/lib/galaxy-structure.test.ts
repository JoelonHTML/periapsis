// Run: node --test src/lib/galaxy-structure.test.ts — statistics of the procedural Milky Way (arms, bar, Sun, no central clump).
import test from 'node:test'
import assert from 'node:assert/strict'
import { ARMS, BAR_ANGLE, LOCAL_ARM, PITCH_DEG, armPath, generateGalaxy } from '../components/galaxy/generate.ts'
import { SUN_GC_LY } from './galaxy.ts'

const DEG = Math.PI / 180
const g = generateGalaxy()
/** main cloud as galactocentric (x, y, z) in ly: scene = (x, z, −y)/10 relative to the Sun, Galactic centre at x = 2600 */
const P = Array.from({ length: g.main.n }, (_, i) => [(g.main.pos[3 * i] - 2600) * 10, -g.main.pos[3 * i + 2] * 10, g.main.pos[3 * i + 1] * 10])

test('arms are logarithmic spirals with pitch ≈ 13–15° (Reid+ 2019: 9–17°)', () => {
  for (let i = 0; i < ARMS.length; i++) {
    const p = armPath(i)
    let phi = Math.atan2(p.y[0], p.x[0]), prev = phi, unwrapped = phi
    const U: number[] = [], L: number[] = []
    for (let k = 0; k < p.n; k++) {
      phi = Math.atan2(p.y[k], p.x[k]); let d = phi - prev; if (d < -Math.PI) d += 2 * Math.PI; if (d > Math.PI) d -= 2 * Math.PI
      unwrapped += d; prev = phi; U.push(unwrapped); L.push(Math.log(p.r[k]))
    }
    assert.ok(U[U.length - 1] > U[0], `${ARMS[i].id} trails: φ grows with r`)
    const pitch = Math.atan((L[L.length - 1] - L[0]) / (U[U.length - 1] - U[0])) / DEG
    assert.ok(Math.abs(pitch - PITCH_DEG) < 0.5 && pitch > 9 && pitch < 17, `${ARMS[i].id} pitch ${pitch}`)
  }
})

test('Sun: 26 000 ly from the centre, on the Orion spur, between Sagittarius (inside) and Perseus (outside)', () => {
  assert.equal(SUN_GC_LY, 26000)
  const sp = armPath(LOCAL_ARM, 50)
  let best = 1e9
  for (let k = 0; k < sp.n; k++) best = Math.min(best, Math.hypot(sp.x[k] + SUN_GC_LY, sp.y[k]))
  assert.ok(best < 100, `spur misses the Sun by ${best} ly`)
  const crossing = (id: string) => { // radius where the arm crosses the Sun–centre ray (φ = π)
    const p = armPath(ARMS.findIndex((a) => a.id === id), 50)
    for (let k = 1; k < p.n; k++) if (p.x[k] < 0 && p.y[k - 1] * p.y[k] <= 0) return p.r[k]
    return NaN
  }
  const sag = crossing('sag'), per = crossing('perseus')
  assert.ok(sag > 18000 && sag < 24500, `Sagittarius at ${sag}`)
  assert.ok(per > 29000 && per < 36000, `Perseus at ${per}`)
})

test('bar: elongated, 27° from the Sun–centre line, far end toward negative l', () => {
  let sxx = 0, syy = 0, sxy = 0, n = 0
  for (const [x, y, z] of P) if (Math.hypot(x, y) < 11000 && Math.abs(z) < 3000) { sxx += x * x; syy += y * y; sxy += x * y; n++ }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy) / DEG // principal axis, mod 180°
  assert.ok(Math.abs(ang - BAR_ANGLE / DEG) < 8, `bar axis ${ang}°`)
  const lam = (sxx + syy) / 2, d = Math.hypot((sxx - syy) / 2, sxy)
  assert.ok(Math.sqrt((lam + d) / (lam - d)) > 1.4, 'axis ratio')
})

test('no clump: density has no spike beyond the smooth bulge/bar profile; thin disc', () => {
  const inner = P.filter(([x, y]) => Math.hypot(x, y) < 3000).length
  assert.ok(inner / P.length < 0.3, `${inner} of ${P.length} points within 3 kly of the centre`)
  // 1 kly cells outside the bar region: the densest cell must stay within a few × the mean of cells in the same annulus
  const cells = new Map<string, number>()
  for (const [x, y] of P) { const r = Math.hypot(x, y); if (r > 15000 && r < 40000) { const k = `${Math.floor(x / 1000)},${Math.floor(y / 1000)}`; cells.set(k, (cells.get(k) ?? 0) + 1) } }
  const v = [...cells.values()], mean = v.reduce((a, b) => a + b, 0) / v.length, max = v.reduce((a, b) => Math.max(a, b), 0)
  assert.ok(max < 12 * mean, `peak cell ${max} vs mean ${mean.toFixed(1)}`)
  const zs = P.map((p) => Math.abs(p[2])).sort((a, b) => a - b)
  assert.ok(zs[Math.floor(zs.length / 2)] < 500, 'median |z| < 500 ly')
  assert.ok(P.every(([x, y]) => Math.hypot(x, y) < 53000))
})
