// Procedural planet surfaces (canvas), used by the flyby close-up. Seamless: noise is sampled on the unit sphere, not on (u,v).
import * as THREE from 'three'
import type { BodyId } from '@/lib/astro'

function hash(i: number, j: number, k: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const sm = (t: number) => t * t * (3 - 2 * t)
function noise(x: number, y: number, z: number) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const u = sm(x - i), v = sm(y - j), w = sm(z - k)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(hash(i, j, k), hash(i + 1, j, k), u), l(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
    l(l(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), l(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w)
}
function fbm(x: number, y: number, z: number, oct = 4) {
  let a = 0.5, s = 0, f = 1
  for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f, z * f); f *= 2.03; a *= 0.5 }
  return s / (1 - 0.5 ** oct)
}
type RGB = [number, number, number]
const mix = (a: RGB, b: RGB, t: number): RGB => {
  t = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
const ss = (a: number, b: number, x: number) => sm(Math.max(0, Math.min(1, (x - a) / (b - a))))

/** colour at unit-sphere point (x,y,z); y is the pole axis, `lat` in radians, `lon` in radians */
type Shader = (x: number, y: number, z: number, lat: number, lon: number) => RGB

const SHADERS: Partial<Record<BodyId, Shader>> = {
  venus: (x, y, z) => {
    const swirl = fbm(x * 1.6 + fbm(x * 3, y * 3, z * 3, 2) * 0.7, y * 6, z * 1.6, 5)
    const c = mix([246, 228, 176], [205, 168, 108], ss(0.35, 0.68, swirl))
    return mix(c, [250, 240, 205], ss(0.62, 0.8, fbm(x * 3, y * 9, z * 3, 3)) * 0.5)
  },
  mars: (x, y, z, lat) => {
    const f = fbm(x * 3, y * 3, z * 3, 5), big = fbm(x * 1.4 + 7, y * 1.4, z * 1.4, 4)
    let c = mix([188, 100, 58], [226, 160, 106], ss(0.3, 0.72, f))
    c = mix(c, [78, 48, 40], ss(0.5, 0.62, big) * (0.6 + 0.4 * ss(0.4, 0.6, f)) * (Math.abs(lat) < 1.15 ? 1 : 0.25))
    c = mix(c, [236, 190, 140], ss(0.66, 0.78, fbm(x * 2 + 3, y * 2, z * 2, 3)) * 0.5) // bright dust plains
    const cap = ss(1.43 - 0.06 * fbm(x * 9, y * 9, z * 9, 3), 1.5, Math.abs(lat))
    return mix(c, [246, 244, 248], cap)
  },
  jupiter: (x, y, z, lat, lon) => {
    const turb = fbm(x * 3, y * 9, z * 3, 5)
    const b = Math.sin(lat * 15 + (turb - 0.5) * 3.2) * 0.5 + 0.5 + 0.18 * Math.sin(lat * 36 + turb * 5)
    let c = mix([236, 220, 190], [170, 112, 74], ss(0.25, 0.85, b))
    c = mix(c, [246, 238, 224], ss(0.7, 0.95, fbm(x * 2, y * 14, z * 2, 3)) * 0.45)
    // Great Red Spot, south of the equator
    const dl = Math.atan2(Math.sin(lon - 1.2), Math.cos(lon - 1.2)), dy = (lat + 0.39) / 0.11, dx = dl / 0.26
    const spot = 1 - ss(0.55, 1, Math.hypot(dx, dy))
    return mix(c, [188, 84, 56], spot * 0.9)
  },
  saturn: (x, y, z, lat) => {
    const turb = fbm(x * 2, y * 10, z * 2, 4)
    const b = Math.sin(lat * 18 + (turb - 0.5) * 1.6) * 0.5 + 0.5
    return mix(mix([226, 206, 156], [196, 166, 112], b), [240, 228, 188], ss(0.6, 0.9, turb) * 0.5)
  },
  mercury: (x, y, z) => {
    const f = fbm(x * 5, y * 5, z * 5, 6), c = fbm(x * 14, y * 14, z * 14, 3)
    return mix(mix([110, 106, 100], [176, 170, 160], f), [70, 68, 66], ss(0.62, 0.75, c) * 0.6)
  },
  uranus: (x, y, z, lat) => mix([150, 216, 222], [120, 196, 210], Math.sin(lat * 10) * 0.5 + 0.5 + (fbm(x * 2, y * 8, z * 2, 3) - 0.5) * 0.4),
  neptune: (x, y, z, lat) => {
    const t = fbm(x * 2, y * 10, z * 2, 4)
    return mix(mix([54, 98, 224], [38, 70, 190], t), [150, 190, 255], ss(0.7, 0.9, fbm(x * 4 + 3, y * 12, z * 4, 3)) * 0.55 * (Math.abs(lat) < 0.7 ? 1 : 0.4))
  },
  pluto: (x, y, z, lat) => mix(mix([150, 118, 96], [214, 196, 170], fbm(x * 4, y * 4, z * 4, 5)), [120, 70, 56], ss(0.55, 0.7, fbm(x * 2 + 5, y * 2, z * 2, 3)) * (Math.abs(lat) < 0.5 ? 0.8 : 0.2)),
  ceres: (x, y, z) => mix([112, 108, 102], [170, 164, 154], fbm(x * 6, y * 6, z * 6, 5)),
}

const cache = new Map<string, THREE.Texture>()
/** 1024×512 equirectangular surface for a body without a photo texture (null for Earth). */
export function planetTexture(id: BodyId): THREE.Texture | null {
  const shader = SHADERS[id]
  if (!shader) return null
  const hit = cache.get(id)
  if (hit) return hit
  const W = 1024, H = 512, c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!, img = g.createImageData(W, H)
  for (let py = 0; py < H; py++) {
    const lat = Math.PI * (0.5 - (py + 0.5) / H), cl = Math.cos(lat), sl = Math.sin(lat)
    for (let px = 0; px < W; px++) {
      const lon = 2 * Math.PI * ((px + 0.5) / W) - Math.PI
      const x = cl * Math.cos(lon), z = cl * Math.sin(lon)
      const [r, gg, b] = shader(x, sl, z, lat, lon)
      const k = 1 + (fbm(x * 22, sl * 22, z * 22, 3) - 0.5) * (id === 'jupiter' || id === 'saturn' || id === 'venus' || id === 'neptune' || id === 'uranus' ? 0.1 : 0.34) // fine grain
      const o = (py * W + px) * 4
      img.data[o] = r * k; img.data[o + 1] = gg * k; img.data[o + 2] = b * k; img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(id, t)
  return t
}

/** Saturn's rings: radial brightness profile (C, B, Cassini division, A, Encke gap) on a ring geometry with radial UVs. */
export function ringTexture() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 4
  const g = c.getContext('2d')!, img = g.createImageData(1024, 4)
  for (let x = 0; x < 1024; x++) {
    const r = 1.24 + (2.27 - 1.24) * (x / 1023) // in planet radii
    let a = 0, tone = 0.8
    if (r < 1.53) { a = 0.18 + 0.12 * ss(1.24, 1.53, r); tone = 0.55 } // C ring
    else if (r < 1.95) { a = 0.78 + 0.18 * Math.sin(r * 38); tone = 0.95 } // B ring
    else if (r < 2.03) { a = 0.1; tone = 0.6 } // Cassini division
    else { a = 0.58 + 0.1 * Math.sin(r * 55); tone = 0.85; if (Math.abs(r - 2.215) < 0.012) a = 0.08 } // A ring + Encke gap
    a *= 0.9 + 0.1 * hash(x, 3, 1)
    for (let y = 0; y < 4; y++) {
      const o = (y * 1024 + x) * 4
      img.data[o] = 232 * tone; img.data[o + 1] = 212 * tone; img.data[o + 2] = 168 * tone; img.data[o + 3] = Math.max(0, Math.min(1, a)) * 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Soft halo sprite texture: transparent inside `inner` (hidden behind the planet), fades out to the edge. */
export function haloTexture(inner: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, 'rgba(255,255,255,0)')
  gr.addColorStop(inner * 0.97, 'rgba(255,255,255,0)')
  gr.addColorStop(inner, 'rgba(255,255,255,1)')
  gr.addColorStop(inner + (1 - inner) * 0.35, 'rgba(255,255,255,0.28)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}
