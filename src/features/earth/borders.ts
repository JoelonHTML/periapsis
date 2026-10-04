// Decoder for the compact coastline / border data in data/borders-data.ts (see scripts/build-earth-borders.mjs).
import { BORDER_B64, BORDER_UNITS_PER_DEG, COAST_B64 } from './data/borders-data.ts'
import { latLonToXyz } from './geo.ts'

/** Polylines as flat [lon, lat, lon, lat, ...] arrays in degrees. */
export type Polylines = Float32Array[]

function decode(b64: string): Polylines {
  const s = atob(b64)
  let p = 0
  const varint = () => {
    let n = 0, sh = 0, b: number
    do { b = s.charCodeAt(p++); n |= (b & 0x7f) << sh; sh += 7 } while (b & 0x80)
    return (n >>> 1) ^ -(n & 1)
  }
  const lines: Polylines = []
  const nLines = varint()
  for (let i = 0; i < nLines; i++) {
    const n = varint()
    if (n < 2) continue
    const a = new Float32Array(n * 2)
    let x = 0, y = 0
    for (let k = 0; k < n; k++) {
      x += varint(); y += varint()
      a[k * 2] = x / BORDER_UNITS_PER_DEG; a[k * 2 + 1] = y / BORDER_UNITS_PER_DEG
    }
    lines.push(a)
  }
  return lines
}

let cache: { coast: Polylines; borders: Polylines } | null = null
export function loadBorders() { return (cache ??= { coast: decode(COAST_B64), borders: decode(BORDER_B64) }) }

/** Vertex positions (pairs of points) for THREE.LineSegments on a sphere of radius r. Long edges are split so they follow the curvature. */
export function lineSegmentPositions(lines: Polylines, r: number, maxStepDeg = 2): Float32Array {
  // longitude difference taken the short way round, so edges crossing the date line (Chukotka, Fiji, Antarctica) stay short
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
  const steps = (a: Float32Array, k: number) => Math.max(1, Math.ceil(Math.max(Math.abs(wrap(a[k * 2 + 2] - a[k * 2])), Math.abs(a[k * 2 + 3] - a[k * 2 + 1])) / maxStepDeg))
  let count = 0
  for (const a of lines) for (let k = 0; k < a.length / 2 - 1; k++) count += steps(a, k)
  const out = new Float32Array(count * 6)
  let o = 0
  for (const a of lines) {
    for (let k = 0; k < a.length / 2 - 1; k++) {
      const n = steps(a, k)
      const lo0 = a[k * 2], la0 = a[k * 2 + 1], dlo = wrap(a[k * 2 + 2] - lo0), dla = a[k * 2 + 3] - la0
      for (let j = 0; j < n; j++) {
        latLonToXyz(la0 + (dla * j) / n, lo0 + (dlo * j) / n, r, out, o)
        latLonToXyz(la0 + (dla * (j + 1)) / n, lo0 + (dlo * (j + 1)) / n, r, out, o + 3)
        o += 6
      }
    }
  }
  return out
}
