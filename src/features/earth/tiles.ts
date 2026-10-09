// Pure math + bookkeeping for the streaming Earth tiles (no three.js, no DOM): Web Mercator (EPSG:3857, "XYZ") tile maths,
// quadtree selection by screen-space error with horizon/frustum culling, tile sources and an LRU that never evicts what is on screen.
// Frame: unit sphere in the Earth group's local frame (see geo.ts).
import { latLonToXyz } from './geo.ts'

const D2R = Math.PI / 180
/** Web Mercator stops here; the poles keep the bundled map. */
export const MAX_LAT = 85.0511287798066
export const TILE_PX = 256

export type TileId = { z: number; x: number; y: number }
export const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`

export const lonOfX = (x: number, z: number) => (x / 2 ** z) * 360 - 180
export const latOfY = (y: number, z: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R // y may be fractional
export const xOfLon = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
export function yOfLat(lat: number, z: number) {
  const s = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * D2R)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z
}
/** Tile containing a point (x wraps around the date line, y clamps at the Mercator limit). */
export function tileAt(lat: number, lon: number, z: number): TileId {
  const n = 2 ** z
  return { z, x: ((Math.floor(xOfLon(lon, z)) % n) + n) % n, y: Math.min(n - 1, Math.max(0, Math.floor(yOfLat(lat, z)))) }
}
export const parentOf = (t: TileId): TileId | null => (t.z === 0 ? null : { z: t.z - 1, x: t.x >> 1, y: t.y >> 1 })

/**
 * Vertex grid of one tile: positions on the unit sphere, global equirect UV (for the shared bump/cloud/night maps) and the tile's own UV.
 * Rows are spaced evenly in Mercator y, so the tile texture's v is exactly linear in the row (per-vertex projection mapping).
 */
export function tileGrid(t: TileId, seg: number) {
  const n = seg + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), tuv = new Float32Array(n * n * 2)
  for (let j = 0; j <= seg; j++) {
    const lat = latOfY(t.y + j / seg, t.z)
    for (let i = 0; i <= seg; i++) {
      const lon = lonOfX(t.x + i / seg, t.z), k = j * n + i
      latLonToXyz(lat, lon, 1, pos, k * 3)
      uv[k * 2] = (lon + 180) / 360; uv[k * 2 + 1] = (lat + 90) / 180
      tuv[k * 2] = i / seg; tuv[k * 2 + 1] = 1 - j / seg // image row 0 = north (three flips Y on upload)
    }
  }
  const index: number[] = []
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1
    index.push(a, c, b, b, c, d) // counter-clockwise seen from outside (checked in the tests)
  }
  return { pos, uv, tuv, index: new Uint16Array(index) }
}

type Sphere = { c: [number, number, number]; r: number; cosLat: number }
/** Bounding sphere (centre + radius) of a tile on the unit sphere. */
export function tileSphere(t: TileId): Sphere {
  const lat0 = latOfY(t.y, t.z), lat1 = latOfY(t.y + 1, t.z), lon0 = lonOfX(t.x, t.z), lon1 = lonOfX(t.x + 1, t.z)
  const latM = latOfY(t.y + 0.5, t.z), lonM = (lon0 + lon1) / 2
  const c = latLonToXyz(latM, lonM) as number[]
  let r = 0
  for (const la of [lat0, latM, lat1]) for (const lo of [lon0, lonM, lon1]) {
    const p = latLonToXyz(la, lo)
    r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))
  }
  return { c: [c[0], c[1], c[2]], r, cosLat: Math.cos(latM * D2R) }
}

export type SelectOpts = {
  /** Camera position in the unit-sphere frame. */
  cam: [number, number, number]
  /** Angular size of one screen pixel in radians (2·tan(fov/2)/height_px). */
  pixelRad: number
  /** Frustum test for a bounding sphere; defaults to "visible". */
  inFrustum?: (c: [number, number, number], r: number) => boolean
  minZ: number
  maxZ: number
  /** Split while a texel is larger than this many pixels. */
  maxTexelPx?: number
}

const sphereCache = new Map<string, Sphere>()
const sphereOf = (t: TileId) => {
  const k = tileKey(t.z, t.x, t.y)
  let s = sphereCache.get(k)
  if (!s) { if (sphereCache.size > 4000) sphereCache.clear(); sphereCache.set(k, (s = tileSphere(t))) }
  return s
}
const dist3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Texel size of a tile in screen pixels (>1: magnified, so a deeper level would add detail). */
export function texelPixels(t: TileId, cam: [number, number, number], pixelRad: number) {
  const s = sphereOf(t)
  const d = Math.max(dist3(cam, s.c) - s.r, 1e-9)
  return ((2 * Math.PI * s.cosLat) / 2 ** t.z / TILE_PX) / (d * pixelRad)
}

/** Visible tiles (z >= minZ) that give about one texel per pixel, nearest first. Where a deeper level is not needed at z < minZ the bundled map suffices. */
export function selectTiles(o: SelectOpts): TileId[] {
  const D = Math.hypot(o.cam[0], o.cam[1], o.cam[2])
  if (D <= 1.0000001) return []
  const horizon = Math.acos(1 / D), thr = o.maxTexelPx ?? 1, out: TileId[] = []
  const visit = (t: TileId) => {
    const s = sphereOf(t)
    // horizon: the tile's bounding cap must reach above the limb as seen from the camera
    const cosAng = (o.cam[0] * s.c[0] + o.cam[1] * s.c[1] + o.cam[2] * s.c[2]) / D / Math.hypot(s.c[0], s.c[1], s.c[2])
    if (Math.acos(Math.min(1, cosAng)) > horizon + 2 * Math.asin(Math.min(1, s.r / 2)) + 1e-6) return
    if (o.inFrustum && !o.inFrustum(s.c, s.r)) return
    if (t.z < o.maxZ && texelPixels(t, o.cam, o.pixelRad) > thr) {
      for (let k = 0; k < 4; k++) visit({ z: t.z + 1, x: t.x * 2 + (k & 1), y: t.y * 2 + (k >> 1) })
    } else if (t.z >= o.minZ) out.push(t)
  }
  visit({ z: 0, x: 0, y: 0 })
  return out.sort((a, b) => dist3(o.cam, sphereOf(a).c) - dist3(o.cam, sphereOf(b).c))
}

/** Least-recently-used map. `trim` evicts the oldest entries beyond `max`, skipping the protected keys (what is on screen right now). */
export class Lru<V> {
  private m = new Map<string, V>()
  max: number
  private onEvict: (k: string, v: V) => void
  constructor(max: number, onEvict: (k: string, v: V) => void = () => {}) { this.max = max; this.onEvict = onEvict }
  get size() { return this.m.size }
  has(k: string) { return this.m.has(k) }
  peek(k: string) { return this.m.get(k) }
  /** Read and mark as most recently used. */
  get(k: string) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v) } return v }
  set(k: string, v: V) { this.m.delete(k); this.m.set(k, v) }
  trim(protect: ReadonlySet<string>) {
    for (const [k, v] of this.m) {
      if (this.m.size <= this.max) break
      if (protect.has(k)) continue
      this.m.delete(k); this.onEvict(k, v)
    }
  }
  clear() { const all = [...this.m]; this.m.clear(); for (const [k, v] of all) this.onEvict(k, v) }
}

export type TileSource = { id: string; name: string; url: (z: number, x: number, y: number) => string; maxZ: number; attribution: string; licence: string }

/** Primary first. Both are Web Mercator XYZ-compatible, CORS-enabled and free to use with attribution. */
export const TILE_SOURCES: TileSource[] = [
  {
    id: 'eox', name: 'Sentinel-2 cloudless 2016 (EOX)', maxZ: 14,
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/g/${z}/${y}/${x}.jpg`,
    attribution: 'Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)', licence: 'CC BY 4.0',
  },
  {
    id: 'gibs', name: 'Blue Marble (NASA GIBS)', maxZ: 8,
    url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
    attribution: 'Imagery: NASA Blue Marble via GIBS / EOSDIS', licence: 'Public domain',
  },
]

/** Detail tiles: 'on' always, 'off' never, 'auto' unless the device is weak (low tier) or asks to save data. */
export function detailEnabled(mode: 'auto' | 'on' | 'off', lowTier: boolean, saveData: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && !lowTier && !saveData)
}
