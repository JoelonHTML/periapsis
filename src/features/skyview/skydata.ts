// Decodes data/sky.json (built by scripts/build-skydata.mjs from d3-celestial, BSD-3-Clause) into typed arrays. Loaded lazily.
import { bvColor, radecVec } from './geom.ts'

export type RawSky = {
  stars: [hip: number, ra: number, dec: number, mag: number, bv: number][]
  names: Record<string, [name: string, bayer: string, con: string, el: string, ly: number]>
  cons: [id: string, la: string, en: string, nl: string, el: string, ra: number, dec: number][]
  lines: Record<string, [number, number][][]>
  dsos: [id: string, type: string, ra: number, dec: number, mag: number, name: string, el: string][]
  mw: { w: number; h: number; rle: number[] }
}
export interface StarName { name: string; bayer: string; con: string; el: string; ly: number }
export interface Con { id: string; la: string; en: string; nl: string; el: string; ra: number; dec: number; vec: [number, number, number] }
export interface Dso { id: string; type: string; ra: number; dec: number; mag: number; name: string; el: string; vec: [number, number, number] }
export interface SkyData {
  n: number
  hip: Int32Array; ra: Float32Array; dec: Float32Array; mag: Float32Array; bv: Float32Array
  /** J2000 unit vectors, 3 per star */
  vec: Float32Array
  /** colour bucket 0..BUCKETS-1 */
  col: Uint8Array
  names: (StarName | undefined)[]
  cons: Con[]
  /** constellation figure segments: 2 J2000 unit vectors (6 floats) per segment, and the constellation index per segment */
  lineSegs: Float32Array
  lineCon: Uint8Array
  dsos: Dso[]
  mw: { w: number; h: number; cells: Uint8Array; max: number }
}

export const BUCKETS = 24
const BV_MIN = -0.3, BV_MAX = 2.0
export const bucketOf = (bv: number) => Math.max(0, Math.min(BUCKETS - 1, Math.round(((bv - BV_MIN) / (BV_MAX - BV_MIN)) * (BUCKETS - 1))))
export const PALETTE: [number, number, number][] = Array.from({ length: BUCKETS }, (_, i) => bvColor(BV_MIN + (i / (BUCKETS - 1)) * (BV_MAX - BV_MIN)))

export function decodeSky(raw: RawSky): SkyData {
  const n = raw.stars.length
  const hip = new Int32Array(n), ra = new Float32Array(n), dec = new Float32Array(n), mag = new Float32Array(n), bv = new Float32Array(n), vec = new Float32Array(n * 3), col = new Uint8Array(n)
  const names: (StarName | undefined)[] = new Array(n)
  raw.stars.forEach((s, i) => {
    hip[i] = s[0]; ra[i] = s[1]; dec[i] = s[2]; mag[i] = s[3]; bv[i] = s[4]; col[i] = bucketOf(s[4])
    vec.set(radecVec(s[1], s[2]), i * 3)
    const nm = raw.names[s[0]]
    if (nm) names[i] = { name: nm[0], bayer: nm[1], con: nm[2], el: nm[3], ly: nm[4] }
  })
  const cons: Con[] = raw.cons.map((c) => ({ id: c[0], la: c[1], en: c[2], nl: c[3], el: c[4], ra: c[5], dec: c[6], vec: radecVec(c[5], c[6]) }))
  const segs: number[] = [], segCon: number[] = []
  cons.forEach((c, ci) => {
    for (const poly of raw.lines[c.id] ?? [])
      for (let k = 0; k + 1 < poly.length; k++) { segs.push(...radecVec(poly[k][0], poly[k][1]), ...radecVec(poly[k + 1][0], poly[k + 1][1])); segCon.push(ci) }
  })
  const dsos: Dso[] = raw.dsos.map((d) => ({ id: d[0], type: d[1], ra: d[2], dec: d[3], mag: d[4], name: d[5], el: d[6], vec: radecVec(d[2], d[3]) }))
  const cells = new Uint8Array(raw.mw.w * raw.mw.h)
  let p = 0, max = 0
  for (let i = 0; i + 1 < raw.mw.rle.length; i += 2) { cells.fill(raw.mw.rle[i], p, p + raw.mw.rle[i + 1]); max = Math.max(max, raw.mw.rle[i]); p += raw.mw.rle[i + 1] }
  return { n, hip, ra, dec, mag, bv, vec, col, names, cons, lineSegs: new Float32Array(segs), lineCon: new Uint8Array(segCon), dsos, mw: { w: raw.mw.w, h: raw.mw.h, cells, max } }
}

let cache: Promise<SkyData> | null = null
/** Lazy: the 200 KB star catalogue is only fetched/parsed when the Sky view opens. */
export const loadSky = () => (cache ??= import('./data/sky.json').then((m) => decodeSky(m.default as unknown as RawSky)))

/** Faint glow of the Milky Way (0..1) at an equatorial J2000 direction: bilinear over the 1-degree grid. */
export function mwLevel(mw: SkyData['mw'], raDeg: number, decDeg: number): number {
  const x = (((raDeg % 360) + 360) % 360) - 0.5, y = 90 - decDeg - 0.5
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(mw.h - 2, Math.floor(y))), fx = x - x0, fy = Math.max(0, Math.min(1, y - y0))
  const g = (xx: number, yy: number) => mw.cells[yy * mw.w + ((xx % mw.w) + mw.w) % mw.w]
  const v = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy
  return v / mw.max
}
