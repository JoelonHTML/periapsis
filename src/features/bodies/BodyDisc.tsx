import { useEffect, useState } from 'react'
import { planetTexture } from '@/components/planetTex'
import type { BodyId } from '@/lib/astro'
import { BODY_MAP } from './data.ts'

// A small shaded sphere. Planets with a procedural surface (planetTex.ts) are drawn from that texture; the rest are shaded colour discs.
const TEXTURED = new Set(['mercury', 'venus', 'mars', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'])
const urls = new Map<string, string>()
const waiting = new Map<string, Set<() => void>>()
const queue: string[] = []
let running = false

const LON0: Record<string, number> = { jupiter: 1.2, mars: 1.9, pluto: 3.4 } // central meridian (Great Red Spot, Valles Marineris, Tombaugh Regio)

function render(id: string, size: number): string | null {
  const tex = planetTexture(id as BodyId)
  const src = tex?.image as HTMLCanvasElement | undefined
  if (!src) return null
  const sg = src.getContext('2d')!, W = src.width, H = src.height, data = sg.getImageData(0, 0, W, H).data
  const S = size * 2, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!, out = g.createImageData(S, S), lon0 = LON0[id] ?? 0
  const L = [-0.55, 0.5, 0.67], ln = Math.hypot(...L)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = ((x + 0.5) / S) * 2 - 1, ny = 1 - ((y + 0.5) / S) * 2, r2 = nx * nx + ny * ny
      const o = (y * S + x) * 4
      if (r2 >= 1) continue
      const nz = Math.sqrt(1 - r2), lat = Math.asin(ny), lon = Math.atan2(nx, nz) + lon0
      let u = (lon + Math.PI) / (2 * Math.PI)
      u -= Math.floor(u)
      const px = Math.min(W - 1, Math.floor(u * W)), py = Math.min(H - 1, Math.floor((0.5 - lat / Math.PI) * H)), k = (py * W + px) * 4
      const lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln), sh = 0.12 + 0.95 * lit ** 0.9
      const edge = Math.min(1, (1 - Math.sqrt(r2)) * S * 0.5) // anti-aliased rim
      out.data[o] = data[k] * sh; out.data[o + 1] = data[k + 1] * sh; out.data[o + 2] = data[k + 2] * sh; out.data[o + 3] = 255 * edge
    }
  }
  g.putImageData(out, 0, 0)
  return c.toDataURL('image/png')
}

function pump() {
  if (running) return
  running = true
  const step = () => {
    const id = queue.shift()
    if (!id) { running = false; return }
    try { const u = render(id, 64); if (u) urls.set(id, u) } catch { /* fall back to the colour disc */ }
    waiting.get(id)?.forEach((f) => f())
    setTimeout(step, 40)
  }
  setTimeout(step, 60)
}

function useTexUrl(id: string) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!TEXTURED.has(id) || urls.has(id)) return
    const f = () => bump((n) => n + 1)
    if (!waiting.has(id)) waiting.set(id, new Set())
    waiting.get(id)!.add(f)
    if (!queue.includes(id)) { queue.push(id); pump() }
    return () => { waiting.get(id)?.delete(f) }
  }, [id])
  return urls.get(id)
}

export function BodyDisc({ id, size = 48 }: { id: string; size?: number }) {
  const url = useTexUrl(id)
  const b = BODY_MAP[id]
  const col = b?.color ?? '#888'
  const base = id === 'sun'
    ? 'radial-gradient(circle at 50% 50%, #fff7d1 0%, #fcd34d 45%, #f59e0b 80%, #b45309 100%)'
    : id === 'earth'
      ? 'radial-gradient(circle at 36% 30%, #7dd3fc 0%, #2563eb 38%, #1e3a8a 72%, #0b1b44 100%)'
      : `radial-gradient(circle at 36% 30%, color-mix(in srgb, ${col} 60%, white) 0%, ${col} 45%, color-mix(in srgb, ${col} 35%, black) 100%)`
  const ring = id === 'saturn'
  const ringStyle = { position: 'absolute', left: '-42%', top: '33%', width: '184%', height: '34%', borderRadius: '50%', border: `${Math.max(2, size / 14)}px solid rgba(226,205,160,0.75)`, transform: 'rotate(-16deg)', pointerEvents: 'none' } as const
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      {ring && <span style={{ ...ringStyle, zIndex: 0 }} />}
      <span className="absolute inset-0 rounded-full" style={{ zIndex: 1, background: url ? `center/cover url(${url})` : base, boxShadow: id === 'sun' ? '0 0 14px 2px rgba(251,191,36,0.55)' : undefined }} />
      {ring && <span style={{ ...ringStyle, zIndex: 2, clipPath: 'inset(52% 0 0 0)' }} />}
    </span>
  )
}
