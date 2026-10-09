// Decodes the Sky view data (built by scripts/build-skydata.mjs from d3-celestial, BSD-3-Clause) into typed arrays. Loaded lazily:
//  data/sky.json  names, constellations, figure lines, IAU boundaries, Milky Way grid
//  data/stars.bin 41 411 stars to mag 8 (Hipparcos/Tycho via d3-celestial), packed + deflate-raw
//  data/dsos.bin  5 197 Messier / NGC / IC / Collinder objects, packed + deflate-raw
import { bvColor, radecVec, D2R, type V3 } from './geom.ts'

export type RawSky = {
  /** by HIP number: proper name, Bayer letter, constellation, Greek name, light-years (0 = unknown), Flamsteed number, HD number, variable-star designation */
  names: Record<string, [name: string, bayer: string, con: string, el: string, ly: number, flam: string, hd: string, vr: string]>
  cons: [id: string, la: string, en: string, nl: string, el: string, ra: number, dec: number][]
  lines: Record<string, [number, number][][]>
  bounds: Record<string, [number, number][][]>
  dsoNames: Record<string, [name: string, el: string]>
  mw: { w: number; h: number; rle: number[] }
}
export interface StarName { name: string; bayer: string; con: string; el: string; ly: number; flam: string; hd: string; vr: string }
export interface Con { id: string; la: string; en: string; nl: string; el: string; ra: number; dec: number; vec: [number, number, number] }
export interface Dso {
  id: string; /** secondary catalogue name (M 31 = NGC 224) */ alt: string; type: string; ra: number; dec: number; mag: number; name: string; el: string
  vec: [number, number, number]
  /** major / minor axis, arc-minutes (0 = unknown) */ maj: number; min: number
  /** surface brightness, mag per arcsec^2 (Infinity when the size or magnitude is unknown) */ sb: number
  /** position angle east of north, degrees, when known */ pa?: number
}
export interface SkyData {
  n: number
  hip: Int32Array; ra: Float32Array; dec: Float32Array; mag: Float32Array; bv: Float32Array
  /** J2000 unit vectors, 3 per star */
  vec: Float32Array
  /** colour bucket 0..BUCKETS-1 */
  col: Uint8Array
  /** by star index (sorted by magnitude) */
  names: (StarName | undefined)[]
  cons: Con[]
  /** constellation figure segments: 2 J2000 unit vectors (6 floats) per segment, and the constellation index per segment */
  lineSegs: Float32Array
  lineCon: Uint8Array
  /** IAU boundaries as polylines of J2000 unit vectors, ~1 degree apart: [x,y,z, x,y,z, ...] per polyline */
  borders: Float32Array[]
  bounds: [number, number][][][]
  /** sorted by magnitude (brightest first) */
  dsos: Dso[]
  /** Milky Way brightness 0..1, 1 degree cells (RA x Dec), smoothed */
  mw: { w: number; h: number; cells: Float32Array }
}

export const BUCKETS = 24
const BV_MIN = -0.3, BV_MAX = 2.0
export const bucketOf = (bv: number) => Math.max(0, Math.min(BUCKETS - 1, Math.round(((bv - BV_MIN) / (BV_MAX - BV_MIN)) * (BUCKETS - 1))))
export const PALETTE: [number, number, number][] = Array.from({ length: BUCKETS }, (_, i) => bvColor(BV_MIN + (i / (BUCKETS - 1)) * (BV_MAX - BV_MIN)))

const r24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)

/** Planar approximation of the spectral class from B-V (main-sequence calibration; indicative only). */
export function spectralClass(bv: number): string {
  const T: [number, string][] = [[-0.3, 'O'], [-0.2, 'B'], [0.0, 'A'], [0.3, 'F'], [0.58, 'G'], [0.81, 'K'], [1.4, 'M']]
  let c = 'O'
  for (const [b, s] of T) if (bv >= b) c = s
  return c
}

// Brighter objects whose position angle (deg, east of north) is well known; the permissively licensed catalogues carry no angles.
const PA: Record<string, number> = { M31: 35, M33: 23, M81: 157, M82: 65, M104: 89, M65: 174, M66: 13, 'NGC 891': 22 }
const DSO_TYPES = ['g', 'oc', 'gc', 'pn', 'bn', 'en', 'rn', 'sfr', 'snr', 'dn', 'gg', 's', 's0', 'e', 'i', 'sd']
const DSO_CATS = ['M', 'NGC', 'IC', 'Cr', 'LMC', 'SMC']

export function decodeStars(b: Uint8Array, names: RawSky['names']) {
  const n = u16(b, 0) | (u16(b, 2) << 16)
  const oRa = 4, oDec = oRa + 3 * n, oMag = oDec + 3 * n, oBv = oMag + n, oHip = oBv + n
  const hip0 = new Int32Array(n), mag0 = new Float32Array(n)
  let h = 0
  for (let i = 0; i < n; i++) { h += u16(b, oHip + 2 * i); hip0[i] = h; mag0[i] = b[oMag + i] / 20 - 2 }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => mag0[x] - mag0[y] || x - y)
  const hip = new Int32Array(n), ra = new Float32Array(n), dec = new Float32Array(n), mag = new Float32Array(n), bv = new Float32Array(n), vec = new Float32Array(n * 3), col = new Uint8Array(n)
  const nm: (StarName | undefined)[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const i = order[k]
    hip[k] = hip0[i]; mag[k] = mag0[i]
    ra[k] = (r24(b, oRa + 3 * i) / 0x1000000) * 360; dec[k] = (r24(b, oDec + 3 * i) / 0x1000000) * 180 - 90
    bv[k] = b[oBv + i] === 255 ? 0.6 : b[oBv + i] / 100 - 0.5
    col[k] = bucketOf(bv[k])
    vec.set(radecVec(ra[k], dec[k]), k * 3)
    const x = names[hip[k]]
    if (x) nm[k] = { name: x[0], bayer: x[1], con: x[2], el: x[3], ly: x[4], flam: x[5], hd: x[6], vr: x[7] }
  }
  return { n, hip, ra, dec, mag, bv, vec, col, names: nm }
}

export function decodeDsos(b: Uint8Array, dsoNames: RawSky['dsoNames']): Dso[] {
  const n = u16(b, 0) | (u16(b, 2) << 16), RS = 17, out: Dso[] = []
  for (let i = 0, o = 4; i < n; i++, o += RS) {
    const ra = (r24(b, o) / 0x1000000) * 360, dec = (r24(b, o + 3) / 0x1000000) * 180 - 90
    const type = DSO_TYPES[b[o + 6]], cat = DSO_CATS[b[o + 7]], mraw = b[o + 8], num = u16(b, o + 9), ngc = u16(b, o + 11), maj = u16(b, o + 13) / 10, min = u16(b, o + 15) / 10
    const mag = mraw === 255 ? 99 : mraw / 10 - 3
    const id = cat === 'LMC' || cat === 'SMC' ? cat : cat === 'M' ? `M${num}` : `${cat} ${num}`
    const nm = dsoNames[i]
    // a size of 0 (or a magnitude that is missing) means "unknown": no surface brightness, so the visibility rule falls back to the magnitude alone
    const area = Math.PI / 4 * (maj * 60) * ((min || maj) * 60)
    out.push({ id, alt: ngc ? `NGC ${ngc}` : '', type, ra, dec, mag, name: nm?.[0] ?? '', el: nm?.[1] ?? '', vec: radecVec(ra, dec), maj, min: min || maj, sb: mag < 90 && area > 0 ? mag + 2.5 * Math.log10(area) : Infinity, pa: PA[id] ?? (ngc ? PA[`NGC ${ngc}`] : undefined) })
  }
  return out
}

/** RA of consecutive vertices differs by < 180 degrees (the boundary data jumps at the +-180 seam). */
function unwrap(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [[ring[0][0], ring[0][1]]]
  for (let i = 1; i < ring.length; i++) { let x = ring[i][0]; const q = out[i - 1][0]; while (x - q > 180) x -= 360; while (x - q < -180) x += 360; out.push([x, ring[i][1]]) }
  return out
}
/** A boundary that circles a celestial pole does not close in RA/Dec: go up to the pole and back so that point-in-polygon works. */
function closeAtPole(ring: [number, number][]): [number, number][] {
  const a = ring[0], b = ring[ring.length - 1]
  if (Math.abs(b[0] - a[0]) < 180) return ring
  const pole = ring.reduce((s, p) => s + p[1], 0) > 0 ? 90 : -90
  return [...ring, [b[0], pole], [a[0], pole]]
}

/** Interpolate a boundary polygon into polylines of unit vectors about `step` degrees apart (constant-Dec / constant-RA edges are straight in RA/Dec). */
function polyline(ring: [number, number][], step = 1): Float32Array {
  const out: number[] = []
  for (let i = 0; i + 1 < ring.length; i++) {
    const [a, b] = [ring[i], ring[i + 1]], m = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * D2R), Math.abs(b[1] - a[1])) / step))
    for (let k = 0; k < m; k++) out.push(...radecVec(a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m))
  }
  const l = ring[ring.length - 1]
  out.push(...radecVec(l[0], l[1]))
  return new Float32Array(out)
}

/** 1-degree Milky Way cells (nested outline counts 0..max) -> smooth 0..1 brightness: 3 box blurs along RA (wrapping) and Dec. */
function smoothMw(cells: Uint8Array, w: number, h: number, max: number): Float32Array {
  let a = Float32Array.from(cells, (v) => v / max), b = new Float32Array(a.length)
  const R = 2
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -R; k <= R; k++) s += a[y * w + ((x + k + w) % w)]; b[y * w + x] = s / (2 * R + 1) }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -R; k <= R; k++) s += b[Math.min(h - 1, Math.max(0, y + k)) * w + x]; a[y * w + x] = s / (2 * R + 1) }
  }
  let mx = 0
  for (let i = 0; i < a.length; i++) mx = Math.max(mx, a[i])
  for (let i = 0; i < a.length; i++) a[i] /= mx
  return a
}

export function decodeSky(raw: RawSky, starBytes: Uint8Array, dsoBytes: Uint8Array): SkyData {
  const s = decodeStars(starBytes, raw.names)
  const cons: Con[] = raw.cons.map((c) => ({ id: c[0], la: c[1], en: c[2], nl: c[3], el: c[4], ra: c[5], dec: c[6], vec: radecVec(c[5], c[6]) }))
  const segs: number[] = [], segCon: number[] = []
  cons.forEach((c, ci) => {
    for (const poly of raw.lines[c.id] ?? [])
      for (let k = 0; k + 1 < poly.length; k++) { segs.push(...radecVec(poly[k][0], poly[k][1]), ...radecVec(poly[k + 1][0], poly[k + 1][1])); segCon.push(ci) }
  })
  const unwrapped = cons.map((c) => raw.bounds[c.id].map(unwrap))
  const borders = unwrapped.flatMap((rings) => rings.map((ring) => polyline(ring)))
  const bounds = unwrapped.map((rings) => rings.map(closeAtPole))
  const cells = new Uint8Array(raw.mw.w * raw.mw.h)
  let p = 0, max = 0
  for (let i = 0; i + 1 < raw.mw.rle.length; i += 2) { cells.fill(raw.mw.rle[i], p, p + raw.mw.rle[i + 1]); max = Math.max(max, raw.mw.rle[i]); p += raw.mw.rle[i + 1] }
  return { ...s, cons, lineSegs: new Float32Array(segs), lineCon: new Uint8Array(segCon), borders, bounds, dsos: decodeDsos(dsoBytes, raw.dsoNames), mw: { w: raw.mw.w, h: raw.mw.h, cells: smoothMw(cells, raw.mw.w, raw.mw.h, max) } }
}

// ---------- which constellation is a point in (IAU boundaries) ----------
function inRing(ring: [number, number][], ra: number, dec: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > dec !== yj > dec && ra < ((xj - xi) * (dec - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
/** Index into `cons` of the constellation containing a J2000 RA/Dec (degrees), -1 when none matches. */
export function conIndexAt(d: Pick<SkyData, 'bounds' | 'cons'>, raDeg: number, decDeg: number): number {
  const ra = ((raDeg % 360) + 360) % 360
  for (let i = 0; i < d.bounds.length; i++)
    for (const ring of d.bounds[i]) for (const o of [0, -360, 360]) if (inRing(ring, ra + o, decDeg)) return i
  return -1
}

let cache: Promise<SkyData> | null = null
async function inflate(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  return new Uint8Array(await new Response(res.body!.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
}
/** Lazy: the catalogues (about 700 KB packed) are only fetched/parsed when the Sky view opens. */
export const loadSky = () => (cache ??= Promise.all([import('./data/sky.json'), import('./data/stars.bin?url'), import('./data/dsos.bin?url')]).then(async ([j, s, d]) => decodeSky(j.default as unknown as RawSky, await inflate(s.default), await inflate(d.default))))

/** Faint glow of the Milky Way (0..1) at an equatorial J2000 direction: bilinear over the 1-degree grid. */
export function mwLevel(mw: SkyData['mw'], raDeg: number, decDeg: number): number {
  const x = (((raDeg % 360) + 360) % 360) - 0.5, y = 90 - decDeg - 0.5
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(mw.h - 2, Math.floor(y))), fx = x - x0, fy = Math.max(0, Math.min(1, y - y0))
  const g = (xx: number, yy: number) => mw.cells[yy * mw.w + ((xx % mw.w) + mw.w) % mw.w]
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy
}

// ---------- galactic coordinates (J2000: NGP at RA 192.85948, Dec 27.12825; l of the north celestial pole 122.93192) ----------
const NGP = radecVec(192.85948, 27.12825)
const cr = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const X0: V3 = (() => { const c = cr([0, 0, 1], NGP), n = Math.hypot(...c); return [c[0] / n, c[1] / n, c[2] / n] })() // direction of the ascending node of the galactic plane on the equator
const Y0 = cr(NGP, X0)
/** Equatorial J2000 unit vector of galactic (l, b), degrees. */
export function galVec(l: number, b: number): V3 {
  const lr = (l - 32.93192) * D2R, br = b * D2R // l of the ascending node is 32.93192
  const c = Math.cos(br), x = c * Math.cos(lr), y = c * Math.sin(lr), z = Math.sin(br)
  return [X0[0] * x + Y0[0] * y + NGP[0] * z, X0[1] * x + Y0[1] * y + NGP[1] * z, X0[2] * x + Y0[2] * y + NGP[2] * z]
}
