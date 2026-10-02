// Procedural canvas textures (equirectangular, 1024×512) for planets and moons — no downloads. Deterministic (seeded).
import * as THREE from 'three'

const W = 1024, H = 512
const rngOf = (seed: number) => {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

type Ctx = CanvasRenderingContext2D
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

/** Soft round blotch, drawn three times (−W, 0, +W) so it wraps around the longitude seam. */
function blotch(g: Ctx, x: number, y: number, rx: number, ry: number, color: string, a: number) {
  for (const dx of [-W, 0, W]) {
    if (x + dx + rx < 0 || x + dx - rx > W) continue
    g.save()
    g.translate(x + dx, y)
    g.scale(1, ry / rx)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx)
    gr.addColorStop(0, rgba(color, a))
    gr.addColorStop(1, rgba(color, 0))
    g.fillStyle = gr
    g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill()
    g.restore()
  }
}
function crater(g: Ctx, x: number, y: number, r: number, dark: string, light: string) {
  for (const dx of [-W, 0, W]) {
    g.beginPath(); g.arc(x + dx, y, r, 0, Math.PI * 2)
    g.fillStyle = rgba(dark, 0.22); g.fill()
    g.beginPath(); g.arc(x + dx - r * 0.18, y - r * 0.18, r * 0.9, 0, Math.PI * 2)
    g.strokeStyle = rgba(light, 0.28); g.lineWidth = Math.max(0.6, r * 0.14); g.stroke()
  }
}

function base(): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  return { c, g: c.getContext('2d')! }
}

/** Rocky/icy surface: base colour, large-scale albedo patches, fine speckle, craters, optional polar caps. */
function surface(seed: number, o: { base: string; patches: string[]; patchA?: number; craters?: number; crater?: [string, string]; cap?: string; speckle?: number }) {
  const { c, g } = base(), rnd = rngOf(seed)
  g.fillStyle = o.base; g.fillRect(0, 0, W, H)
  const pa = o.patchA ?? 0.35
  for (let k = 0; k < 150; k++) blotch(g, rnd() * W, rnd() * H, 20 + rnd() * 90, 10 + rnd() * 50, o.patches[Math.floor(rnd() * o.patches.length)], pa * (0.4 + rnd() * 0.6))
  for (let k = 0; k < (o.speckle ?? 1500); k++) { g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0.035)`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1 + rnd() * 3) }
  const cr = o.crater ?? ['#000000', '#ffffff']
  for (let k = 0; k < (o.craters ?? 0); k++) crater(g, rnd() * W, 20 + rnd() * (H - 40), 1 + rnd() ** 4 * 15, cr[0], cr[1])
  if (o.cap) {
    const gt = g.createLinearGradient(0, 0, 0, H)
    gt.addColorStop(0, rgba(o.cap, 0.95)); gt.addColorStop(0.07, rgba(o.cap, 0.85)); gt.addColorStop(0.13, rgba(o.cap, 0))
    gt.addColorStop(0.87, rgba(o.cap, 0)); gt.addColorStop(0.93, rgba(o.cap, 0.85)); gt.addColorStop(1, rgba(o.cap, 0.95))
    g.fillStyle = gt; g.fillRect(0, 0, W, H)
  }
  return c
}

/** Gas-giant style latitude bands with wavy streaks. stops: [latitude 0..1 (north→south), colour]. */
function bands(seed: number, stops: [number, string][], o: { streaks?: number; amp?: number; spots?: [number, number, number, number, string, number][] } = {}) {
  const { c, g } = base(), rnd = rngOf(seed)
  const gr = g.createLinearGradient(0, 0, 0, H)
  for (const [p, col] of stops) gr.addColorStop(p, col)
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  const cols = stops.map((s) => s[1])
  for (let k = 0; k < (o.streaks ?? 260); k++) {
    const y = rnd() * H, amp = (o.amp ?? 5) * (0.3 + rnd()), ph = rnd() * 6.28, fq = 2 + rnd() * 6
    g.beginPath()
    for (let x = 0; x <= W; x += 8) { const yy = y + Math.sin((x / W) * Math.PI * 2 * fq + ph) * amp; x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy) }
    g.strokeStyle = rgba(cols[Math.floor(rnd() * cols.length)], 0.1 + rnd() * 0.22)
    g.lineWidth = 1 + rnd() * 5
    g.stroke()
  }
  for (const [x, y, rx, ry, col, a] of o.spots ?? []) { blotch(g, x * W, y * H, rx, ry, col, a) }
  for (let k = 0; k < 120; k++) blotch(g, rnd() * W, rnd() * H, 8 + rnd() * 30, 3 + rnd() * 9, cols[Math.floor(rnd() * cols.length)], 0.12)
  return c
}

const BUILD: Record<string, () => HTMLCanvasElement> = {
  mercury: () => surface(1, { base: '#8a8580', patches: ['#6d6965', '#a29c94', '#7a756f'], craters: 420, crater: ['#2b2926', '#d8d2c8'] }),
  venus: () => bands(2, [[0, '#e9d3a5'], [0.25, '#f0dcb0'], [0.5, '#e4c68c'], [0.75, '#efd9a8'], [1, '#e7cf9f']], { streaks: 160, amp: 12 }),
  mars: () => surface(3, {
    base: '#b4603a', patches: ['#7e3b22', '#d08a5a', '#8c4a2b', '#c4743f', '#5e3220'], patchA: 0.55, craters: 260, crater: ['#3a1c10', '#e8b48a'], cap: '#f4f1ec', speckle: 2500,
  }),
  ceres: () => surface(4, { base: '#7d7a76', patches: ['#605d59', '#9a968f'], craters: 380, crater: ['#2a2826', '#d6d2cb'] }),
  jupiter: () => bands(5, [[0, '#a89a88'], [0.07, '#cdb89a'], [0.14, '#8b5e3c'], [0.22, '#ead9bd'], [0.3, '#b9774a'], [0.38, '#f0e2c8'], [0.46, '#c58b5a'],
    [0.54, '#efe0c4'], [0.62, '#a8683f'], [0.7, '#e8d6b8'], [0.78, '#b98456'], [0.86, '#d9c3a3'], [0.93, '#8e7b68'], [1, '#6f6459']],
  { streaks: 380, amp: 4, spots: [[0.33, 0.6, 50, 24, '#b5472d', 0.9], [0.33, 0.6, 30, 14, '#d4684a', 0.8], [0.2, 0.69, 20, 8, '#f3ece0', 0.8]] }),
  saturn: () => bands(6, [[0, '#a89878'], [0.1, '#cdb88a'], [0.2, '#e3d2a2'], [0.32, '#d6c08c'], [0.45, '#ecdcb0'], [0.55, '#d9c490'], [0.68, '#e6d4a6'], [0.8, '#cbb482'], [0.92, '#a99a78'], [1, '#8e8269']],
  { streaks: 240, amp: 2.5 }),
  uranus: () => bands(7, [[0, '#8fd5da'], [0.3, '#9be0e3'], [0.5, '#a9e8e8'], [0.7, '#9be0e3'], [1, '#86cdd4']], { streaks: 60, amp: 2 }),
  neptune: () => bands(8, [[0, '#3d62c9'], [0.25, '#4672dc'], [0.5, '#3a63cf'], [0.75, '#4a78e0'], [1, '#3558bb']],
    { streaks: 110, amp: 5, spots: [[0.3, 0.6, 38, 18, '#1d2f78', 0.85], [0.22, 0.7, 24, 5, '#e8eeff', 0.7], [0.7, 0.35, 28, 4, '#dfe8ff', 0.55]] }),
  pluto: () => surface(9, { base: '#b09a82', patches: ['#6f4a36', '#d8c8b2', '#8a6a52', '#efe3d0'], patchA: 0.5, craters: 60, crater: ['#2a1d14', '#f2e8da'] }),
  charon: () => surface(10, { base: '#8f8a85', patches: ['#6b5a52', '#a6a19b'], patchA: 0.4, craters: 140, cap: '#8a5a4a' }),
  io: () => surface(11, { base: '#e6d36a', patches: ['#f4ea98', '#d9a63c', '#b9892e', '#fff3b0', '#8c5a22'], patchA: 0.5, speckle: 900 }),
  europa: () => surface(12, { base: '#e8e1d4', patches: ['#b38a6a', '#f6f1e8', '#c7a98a', '#9a6e4f'], patchA: 0.3, speckle: 400 }),
  ganymede: () => surface(13, { base: '#9a9288', patches: ['#6f675d', '#b9b1a5', '#58504a'], patchA: 0.5, craters: 300, crater: ['#2b2723', '#ddd5c8'] }),
  callisto: () => surface(14, { base: '#645c53', patches: ['#463f38', '#7f776c'], patchA: 0.3, craters: 650, crater: ['#2a2622', '#e9e2d6'] }),
  titan: () => bands(15, [[0, '#a4752c'], [0.2, '#d99a3a'], [0.5, '#dca240'], [0.8, '#d49236'], [1, '#9a6a26']], { streaks: 14, amp: 1 }),
  enceladus: () => surface(16, { base: '#f2f5f7', patches: ['#c9d8e2', '#ffffff', '#a9c3d4'], patchA: 0.35, craters: 60, speckle: 200 }),
  ice: () => surface(17, { base: '#cfcdc8', patches: ['#a8a5a0', '#e8e6e2', '#8f8d88'], patchA: 0.35, craters: 220, crater: ['#2a2926', '#f5f3ee'] }),
  iapetus: () => { // dark leading hemisphere, bright trailing hemisphere
    const c = surface(18, { base: '#d8d5cf', patches: ['#bdb9b2', '#ece9e3'], craters: 120, crater: ['#2a2926', '#f5f3ee'] }), g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, W, 0)
    gr.addColorStop(0, 'rgba(36,28,22,0.92)'); gr.addColorStop(0.18, 'rgba(36,28,22,0.92)'); gr.addColorStop(0.28, 'rgba(36,28,22,0)')
    gr.addColorStop(0.72, 'rgba(36,28,22,0)'); gr.addColorStop(0.82, 'rgba(36,28,22,0.92)'); gr.addColorStop(1, 'rgba(36,28,22,0.92)')
    g.fillStyle = gr; g.fillRect(0, 0, W, H); return c
  },
  triton: () => surface(19, { base: '#e7d2c8', patches: ['#f4e6de', '#cfa99a', '#b78b7e', '#8f6a62'], patchA: 0.4, cap: '#f6ece6', craters: 30 }),
  rock: () => surface(20, { base: '#8c847a', patches: ['#6c655c', '#a39b90', '#585249'], patchA: 0.45, craters: 380, crater: ['#1f1c19', '#d8d0c4'] }),
}

const cache = new Map<string, THREE.CanvasTexture>()
/** Texture for a planet/moon kind (see BUILD keys); cached, sRGB, mip-mapped. Unknown kinds fall back to grey rock. */
export function bodyTexture(kind: string, variant = ''): THREE.CanvasTexture {
  const key = kind + variant
  let t = cache.get(key)
  if (!t) {
    const draw = BUILD[kind] ?? BUILD.rock
    t = new THREE.CanvasTexture(draw())
    if (variant) { // same look, different random layout for distinct small moons
      const { c, g } = base(); g.drawImage(t.image as HTMLCanvasElement, 0, 0)
      const r = rngOf(hash(variant)); g.globalCompositeOperation = 'overlay'
      for (let k = 0; k < 40; k++) blotch(g, r() * W, r() * H, 20 + r() * 60, 10 + r() * 30, r() > 0.5 ? '#ffffff' : '#000000', 0.2)
      t.dispose(); t = new THREE.CanvasTexture(c)
    }
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    cache.set(key, t)
  }
  return t
}

/** 1-D radial colour/alpha strip for the ring shader (u = 0 inner edge … 1 outer edge). */
export function ringTexture(kind: 'saturn' | 'faint', rIn: number, rOut: number): THREE.CanvasTexture {
  const w = 1024, c = document.createElement('canvas'); c.width = w; c.height = 4
  const g = c.getContext('2d')!, rnd = rngOf(77), img = g.createImageData(w, 1)
  const span = rOut - rIn
  for (let x = 0; x < w; x++) {
    const r = rIn + (x / (w - 1)) * span // km
    let a = 0, col = [214, 197, 160]
    if (kind === 'saturn') {
      const k = r / 1000
      if (k < 92) { a = 0.13 + 0.12 * ((k - 74.5) / 17.5); col = [150, 140, 125] } // C ring
      else if (k < 117.5) { a = 0.78 + 0.18 * Math.sin((k - 92) * 0.9) ** 2; col = [232, 214, 176] } // B ring
      else if (k < 122.2) { a = 0.07 + 0.05 * rnd(); col = [170, 160, 140] } // Cassini division
      else if (k < 136.8) { a = 0.55 + 0.1 * Math.sin((k - 122) * 1.7); col = [204, 188, 152] } // A ring
      else if (k > 140.0 && k < 140.5) { a = 0.55; col = [220, 205, 170] } // F ring
      if (k > 133.3 && k < 133.7) a *= 0.15 // Encke gap
      if (k > 136.4 && k < 136.7) a *= 0.3 // Keeler gap
      a *= 0.93 + 0.1 * Math.sin(k * 11) // fine ringlet structure
    } else {
      const u = x / (w - 1)
      a = 0.5 * Math.sin(Math.PI * u) ** 2 + (u > 0.93 ? 0.8 : 0) * (1 - Math.abs(u - 0.97) / 0.04 > 0 ? 1 : 0); col = [150, 140, 135]
    }
    img.data.set([col[0], col[1], col[2], Math.max(0, Math.min(1, a)) * 255], x * 4)
  }
  g.putImageData(img, 0, 0)
  g.drawImage(c, 0, 0, w, 1, 0, 1, w, 3)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
