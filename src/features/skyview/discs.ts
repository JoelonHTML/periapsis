// Round, textured discs of the Moon and planets for the Sky view: the bundled equirectangular maps (Solar System Scope, CC BY 4.0, see PLANET_CREDITS;
// the maps are shared with the System view, so they cost no extra bytes) are projected orthographically once into small sprites (prime meridian
// facing us, no libration). Built lazily: the first request starts the image decode, later frames find the sprite.
import MERCURY from '@/assets/planets/mercury.jpg'
import VENUS from '@/assets/planets/venus.jpg'
import MARS from '@/assets/planets/mars.jpg'
import JUPITER from '@/assets/planets/jupiter.jpg'
import SATURN from '@/assets/planets/saturn.jpg'
import URANUS from '@/assets/planets/uranus.jpg'
import NEPTUNE from '@/assets/planets/neptune.jpg'
import MOON from '@/assets/planets/moon.jpg'

const MAPS: Record<string, [url: string, limbDarkening: number]> = {
  mercury: [MERCURY, 0], venus: [VENUS, 0.3], mars: [MARS, 0.25], jupiter: [JUPITER, 0.55], saturn: [SATURN, 0.5], uranus: [URANUS, 0.4], neptune: [NEPTUNE, 0.4], moon: [MOON, 0],
}
const SIZE = 192, MAP_W = 512, MAP_H = 256
const sprites = new Map<string, HTMLCanvasElement>(), pending = new Set<string>()
/** Monotone counter that grows whenever a sprite became available (callers may use it to know a redraw is worthwhile). */
export let spriteVersion = 0

function build(kind: string, img: HTMLImageElement) {
  const m = document.createElement('canvas'); m.width = MAP_W; m.height = MAP_H
  const mg = m.getContext('2d', { willReadFrequently: true })!
  mg.drawImage(img, 0, 0, MAP_W, MAP_H)
  const src = mg.getImageData(0, 0, MAP_W, MAP_H).data, dark = MAPS[kind][1]
  const c = document.createElement('canvas'); c.width = c.height = SIZE
  const g = c.getContext('2d')!, out = g.createImageData(SIZE, SIZE), o = out.data
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = ((i + 0.5) / SIZE) * 2 - 1, y = 1 - ((j + 0.5) / SIZE) * 2, rr = x * x + y * y
    if (rr >= 1) continue
    const z = Math.sqrt(1 - rr), u = (Math.atan2(x, z) / (2 * Math.PI) + 0.5) * MAP_W - 0.5, v = (0.5 - Math.asin(y) / Math.PI) * MAP_H - 0.5
    const u0 = Math.floor(u), v0 = Math.max(0, Math.min(MAP_H - 2, Math.floor(v))), fu = u - u0, fv = Math.max(0, Math.min(1, v - v0))
    const px = (uu: number, vv: number, k: number) => src[(vv * MAP_W + (((uu % MAP_W) + MAP_W) % MAP_W)) * 4 + k]
    const sh = 1 - dark + dark * z ** 0.7, p = (j * SIZE + i) * 4
    for (let k = 0; k < 3; k++) o[p + k] = sh * (px(u0, v0, k) * (1 - fu) * (1 - fv) + px(u0 + 1, v0, k) * fu * (1 - fv) + px(u0, v0 + 1, k) * (1 - fu) * fv + px(u0 + 1, v0 + 1, k) * fu * fv)
    o[p + 3] = rr > 0.985 ? Math.max(0, (1 - rr) / 0.015) * 255 : 255 // soft edge (anti-aliasing)
  }
  g.putImageData(out, 0, 0)
  sprites.set(kind, c); spriteVersion++
}

/** The sprite of a body ('moon', 'mars', 'jupiter', ...) or null while its map is still loading (or when it has none). */
export function discSprite(kind: string): HTMLCanvasElement | null {
  const s = sprites.get(kind)
  if (s) return s
  if (!MAPS[kind] || pending.has(kind) || typeof document === 'undefined') return null
  pending.add(kind)
  const img = new Image()
  img.onload = () => { try { build(kind, img) } catch { /* canvas blocked: the flat disc stays */ } }
  img.src = MAPS[kind][0]
  return null
}
