// Procedural barred-spiral Milky Way (deterministic, seeded). Node-safe (no aliases) so galaxy.test.ts can import it.
// Galactocentric frame P = star − Galactic centre, axes parallel to the Sun-centred galactic frame of lib/galaxy.ts
// (x → from the Sun toward the centre, y → l=90°, z → north). Sun at P = (−26 000, 0, 0) ly, φ = atan2(y, x), Sun at φ = π.
// Seen from the north pole the Galaxy turns clockwise (Sun moves toward +y) and the arms trail: φ grows with r.
import { GAL_RADIUS_LY, SUN_GC_LY } from '../../lib/galaxy.ts'

const DEG = Math.PI / 180
export const PITCH = 12 * DEG
const K = Math.tan(PITCH) // log spiral r = r0·exp(K·Δφ)
const R_SAG = 21500 // Sagittarius arm crosses the Sun–centre line 4.5 kly inside the Sun
const Q = Math.exp((K * Math.PI) / 2) // radial spacing of 4 arms 90° apart on one ray
/** Arms: radius where each crosses the ray centre→Sun (φ = π). Perseus/Scutum–Centaurus end up on the bar tips. */
export const ARMS = [
  { id: 'scutum', name: 'Scutum–Centaurus', rRef: R_SAG / Q, w: 0.28 },
  { id: 'sag', name: 'Sagittarius', rRef: R_SAG, w: 0.2 },
  { id: 'perseus', name: 'Perseus', rRef: R_SAG * Q, w: 0.32 },
  { id: 'outer', name: 'Norma / Buitenste arm', rRef: R_SAG * Q * Q, w: 0.2 },
]
export const armPhi = (i: number, r: number) => Math.PI + Math.log(r / ARMS[i].rRef) / K
export const armPoint = (i: number, r: number): [number, number] => { const p = armPhi(i, r); return [r * Math.cos(p), r * Math.sin(p)] }
export const BAR_HALF = 13500
export const BAR_ANGLE = -27 * DEG // far end direction (φ); the near end sits at φ = π − 27°, i.e. toward positive l

export interface Cloud { pos: Float32Array; col: Float32Array; size: Float32Array; n: number }

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCALE = 0.1 // 1 scene unit = 10 ly

function cloud(n: number): Cloud & { i: number } {
  return { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), n, i: 0 }
}

export function generateGalaxy(seed = 20260922) {
  const rnd = mulberry32(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const logistic = () => { const u = Math.min(Math.max(rnd(), 1e-6), 1 - 1e-6); return Math.log(u / (1 - u)) }
  const main = cloud(150000), local = cloud(30000)

  // Galactocentric ly → scene units (x, z, −y)/10 relative to the Sun
  const put = (c: ReturnType<typeof cloud>, X: number, Y: number, Z: number, r: number, g: number, b: number, k: number, size: number) => {
    const o = c.i * 3
    c.pos[o] = X * SCALE; c.pos[o + 1] = Z * SCALE; c.pos[o + 2] = -Y * SCALE
    c.col[o] = r * k; c.col[o + 1] = g * k; c.col[o + 2] = b * k
    c.size[c.i++] = size
  }
  const gal = (px: number, py: number, pz: number, r: number, g: number, b: number, k: number, size: number) =>
    put(main, SUN_GC_LY + px, py, pz, r, g, b, k, size)
  const armPick = () => { let u = rnd(); for (let i = 0; i < 4; i++) { u -= ARMS[i].w; if (u <= 0) return i } return 3 }
  const armSample = (rMin: number, rMax: number, scale: number) => {
    // truncated exponential in r, inner arms thin out smoothly
    const e = 1 - Math.exp(-(rMax - rMin) / scale)
    return rMin - scale * Math.log(1 - rnd() * e)
  }
  const armFactor = (px: number, py: number) => {
    const r = Math.hypot(px, py), phi = Math.atan2(py, px)
    let best = 0
    for (let i = 0; i < 4; i++) {
      let d = phi - armPhi(i, r)
      d = Math.atan2(Math.sin(d), Math.cos(d))
      const w = r * d
      best = Math.max(best, Math.exp(-(w * w) / (2 * 1700 * 1700)))
    }
    return best
  }

  // 1 — old, dim, yellowish disc (exponential, scale length ≈ 8.5 kly, mild arm modulation)
  for (let k = 0; k < 42000;) {
    const r = -8500 * Math.log(rnd() * rnd() + 1e-9)
    if (r < 700 || r > GAL_RADIUS_LY) continue
    const phi = rnd() * 2 * Math.PI, x = r * Math.cos(phi), y = r * Math.sin(phi)
    if (rnd() > 0.45 + 0.55 * armFactor(x, y)) continue
    const h = 300 * (1 + 0.6 * (r / GAL_RADIUS_LY))
    gal(x, y, 0.5 * h * logistic(), 1, 0.86 + 0.08 * rnd(), 0.62 + 0.1 * rnd(), 0.12 + 0.2 * rnd() * rnd(), 1.1 + 0.4 * rnd())
    k++
  }
  // 2 — young blue-white arm population + a yellower arm component
  for (let k = 0; k < 48000;) {
    const i = armPick(), r = armSample(4200, 49000, 15000)
    if (r < 7500 && rnd() > (r - 4200) / 3300) continue
    const phi = armPhi(i, r) + (gauss() * (750 + 0.055 * r)) / r
    const z = gauss() * 170
    if (rnd() < 0.25) gal(r * Math.cos(phi), r * Math.sin(phi), z * 1.4, 1, 0.9, 0.72, 0.1 + 0.25 * rnd() * rnd(), 1.1 + 0.5 * rnd())
    else {
      const t = rnd(), big = rnd() ** 4
      gal(r * Math.cos(phi), r * Math.sin(phi), z, 0.58 + 0.28 * t, 0.7 + 0.2 * t, 1, 0.3 + 0.7 * rnd() ** 3, 1.2 + 1.8 * big)
    }
    k++
  }
  // 3 — pink HII clumps strung along the arms
  for (let c = 0; c < 70; c++) {
    const i = armPick(), r = 12000 + rnd() * 33000
    const phi = armPhi(i, r) + (gauss() * 800) / r
    const cx = r * Math.cos(phi), cy = r * Math.sin(phi), cz = gauss() * 90
    for (let k = 0; k < 22; k++) gal(cx + gauss() * 380, cy + gauss() * 380, cz + gauss() * 90, 1, 0.5 + 0.15 * rnd(), 0.72, 0.3 + 0.4 * rnd(), 1.5 + 1.2 * rnd())
  }
  // 4 — bulge (Plummer, a = 1.8 kly, cut at 6.5 kly, flattened) in warm yellow-orange
  for (let k = 0; k < 24000;) {
    const u = rnd(), r = 1800 / Math.sqrt(Math.pow(u, -2 / 3) - 1)
    if (r > 6500) continue
    const ct = 2 * rnd() - 1, st = Math.sqrt(1 - ct * ct), ph = rnd() * 2 * Math.PI
    gal(r * st * Math.cos(ph), r * st * Math.sin(ph), 0.62 * r * ct, 1, 0.7 + 0.12 * rnd(), 0.38 + 0.1 * rnd(), 0.1 + 0.2 * rnd(), 1.1 + 0.5 * rnd())
    k++
  }
  // 5 — bar: 27 kly long, boxy Gaussian, at −27° to the Sun–centre line
  const bx = Math.cos(BAR_ANGLE), by = Math.sin(BAR_ANGLE)
  for (let k = 0; k < 20000;) {
    const u = gauss() * 5200, w = gauss() * 1300, z = gauss() * 600
    if (Math.abs(u) > BAR_HALF) continue
    gal(u * bx - w * by, u * by + w * bx, z, 1, 0.76 + 0.1 * rnd(), 0.44 + 0.1 * rnd(), 0.12 + 0.2 * rnd(), 1.1 + 0.5 * rnd())
    k++
  }
  // 6 — Orion Spur: short arm segment through the Sun, pitch ≈ 12° (outward toward −y, trailing)
  {
    const dx = -Math.tan(PITCH), dy = -1, dn = Math.hypot(dx, dy)
    for (let k = 0; k < 1400; k++) {
      const t = -4500 + rnd() * 12500, w = gauss() * 450
      const x = -SUN_GC_LY + (dx / dn) * t - (dy / dn) * w, y = (dy / dn) * t + (dx / dn) * w
      const big = rnd() ** 4
      gal(x, y, gauss() * 120, 0.62 + 0.25 * rnd(), 0.76 + 0.15 * rnd(), 1, 0.2 + 0.5 * rnd() ** 3, 1.2 + 1.4 * big)
    }
  }

  // 7/8 — local star field around the Sun (separate cloud, faded out when the whole Galaxy is in view)
  const starColour = () => {
    const u = rnd()
    if (u < 0.5) return [1, 0.93 + 0.05 * rnd(), 0.82 + 0.1 * rnd()] // G/F
    if (u < 0.75) return [1, 0.72 + 0.1 * rnd(), 0.48 + 0.1 * rnd()] // K/M
    if (u < 0.9) return [0.78 + 0.1 * rnd(), 0.85 + 0.08 * rnd(), 1] // A/B
    return [1, 0.52 + 0.1 * rnd(), 0.38] // M
  }
  const loc = (x: number, y: number, z: number) => {
    const [r, g, b] = starColour(), q = rnd()
    put(local, x, y, z, r, g, b, 0.3 + 0.7 * q * q, 1.2 + 2.6 * rnd() ** 6)
  }
  for (let k = 0; k < 24000; k++) { // thin disc out to 3 500 ly
    const r = 3500 * Math.pow(rnd(), 0.62), phi = rnd() * 2 * Math.PI
    loc(r * Math.cos(phi), r * Math.sin(phi), 150 * logistic())
  }
  for (let k = 0; k < 5500; k++) { // the immediate neighbourhood, uniform sphere of 180 ly
    const r = 180 * Math.cbrt(rnd()), ct = 2 * rnd() - 1, st = Math.sqrt(1 - ct * ct), ph = rnd() * 2 * Math.PI
    loc(r * st * Math.cos(ph), r * st * Math.sin(ph), r * ct)
  }
  // local cloud positions are Sun-relative galactic coordinates already (put() applies the same axis swap)
  return { main: trim(main), local: trim(local) }
}

function trim(c: Cloud & { i: number }): Cloud {
  const n = c.i
  return { pos: c.pos.subarray(0, n * 3), col: c.col.subarray(0, n * 3), size: c.size.subarray(0, n), n }
}
