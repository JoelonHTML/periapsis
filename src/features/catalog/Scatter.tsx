// Orbital period (x, days) vs radius (y, Earth radii) on log–log axes, coloured by discovery method. Canvas, tap to pick the nearest point.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { logFrac, type Exo } from './exo.ts'

export const METHOD_COLORS: Record<string, string> = {
  Transit: '#38bdf8', 'Radial Velocity': '#fb923c', Microlensing: '#a3e635', Imaging: '#f472b6', 'Transit Timing Variations': '#c084fc',
}
export const OTHER_COLOR = '#94a3b8'
export const methodColor = (m: string) => METHOD_COLORS[m] ?? OTHER_COLOR

const X = { lo: 0.1, hi: 1e6 }, Y = { lo: 0.3, hi: 100 }
const PAD = { l: 34, r: 8, t: 8, b: 30 }
const H = 250
const REFS = [{ k: 'cat.earth', p: 365.25, r: 1 }, { k: 'cat.jupiter', p: 4332.6, r: 11.2 }]
const sup = (n: number) => String(n).replace(/-/g, '−').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])

export function Scatter({ list, selected, onPick }: { list: Exo[]; selected: Exo | null; onPick: (p: Exo) => void }) {
  const t = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(340)
  const pts = useMemo(() => list.filter((p) => p.periodD !== null && p.periodD > 0 && p.radius !== null && p.radius > 0), [list])
  const geom = useRef<{ x: number; y: number; p: Exo }[]>([])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.floor(el.clientWidth))))
    ro.observe(el)
    setW(Math.max(240, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
    cv.width = w * dpr; cv.height = H * dpr
    const c = cv.getContext('2d')!
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, w, H)
    const pw = w - PAD.l - PAD.r, ph = H - PAD.t - PAD.b
    const px = (v: number) => PAD.l + Math.min(1, Math.max(0, logFrac(v, X.lo, X.hi))) * pw
    const py = (v: number) => PAD.t + (1 - Math.min(1, Math.max(0, logFrac(v, Y.lo, Y.hi)))) * ph
    c.font = '10px system-ui, sans-serif'
    c.lineWidth = 1
    c.fillStyle = '#94a3b8'; c.strokeStyle = 'rgba(148,163,184,0.16)'
    c.textAlign = 'center'; c.textBaseline = 'top'
    for (let e = -1; e <= 6; e++) {
      const x = px(10 ** e)
      c.beginPath(); c.moveTo(x, PAD.t); c.lineTo(x, PAD.t + ph); c.stroke()
      if (e % 2 !== 0) c.fillText(`10${sup(e)}`, x, PAD.t + ph + 4)
    }
    c.textAlign = 'right'; c.textBaseline = 'middle'
    for (const v of [0.3, 1, 3, 10, 30, 100]) {
      const y = py(v)
      c.beginPath(); c.moveTo(PAD.l, y); c.lineTo(PAD.l + pw, y); c.stroke()
      c.fillText(String(v), PAD.l - 4, y)
    }
    c.textAlign = 'center'; c.textBaseline = 'bottom'
    c.fillText(t('cat.plot.x'), PAD.l + pw / 2, H - 1)
    c.save(); c.translate(9, PAD.t + ph / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'top'; c.fillText(t('cat.plot.y'), 0, -2); c.restore()

    const g: { x: number; y: number; p: Exo }[] = []
    for (const p of pts) {
      const x = px(p.periodD!), y = py(p.radius!)
      g.push({ x, y, p })
      c.fillStyle = methodColor(p.method); c.globalAlpha = 0.65
      c.beginPath(); c.arc(x, y, 2.2, 0, 6.2832); c.fill()
    }
    c.globalAlpha = 1
    geom.current = g

    // Earth and Jupiter: ring + name
    c.font = '11px system-ui, sans-serif'
    for (const r of REFS) {
      const x = px(r.p), y = py(r.r)
      c.strokeStyle = '#f8fafc'; c.lineWidth = 1.5
      c.beginPath(); c.arc(x, y, 5, 0, 6.2832); c.stroke()
      c.fillStyle = '#f8fafc'; c.textAlign = r.p > 1000 ? 'right' : 'left'; c.textBaseline = 'middle'
      const lx = x + (r.p > 1000 ? -8 : 8), ly = y + (r.p > 1000 ? -9 : 9)
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,10,12,0.9)'; c.strokeText(t(r.k), lx, ly); c.fillText(t(r.k), lx, ly)
    }
    if (selected && selected.periodD && selected.radius) {
      const x = px(selected.periodD), y = py(selected.radius)
      c.strokeStyle = '#facc15'; c.lineWidth = 2
      c.beginPath(); c.arc(x, y, 7, 0, 6.2832); c.stroke()
    }
  }, [pts, selected, w, t])

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    let best: Exo | null = null, bd = 18 * 18
    for (const q of geom.current) {
      const d = (q.x - mx) ** 2 + (q.y - my) ** 2
      if (d < bd) { bd = d; best = q.p }
    }
    if (best) onPick(best)
  }

  return (
    <div ref={wrap} className="grid gap-1.5">
      <canvas ref={ref} style={{ width: '100%', height: H, touchAction: 'manipulation' }} className="rounded-md bg-black/20" onPointerUp={pick}
        role="img" aria-label={`${t('cat.plot')}: ${t('cat.plot.n', { n: pts.length })}`} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {[...Object.keys(METHOD_COLORS), '…'].map((m) => (
          <span key={m} className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: m === '…' ? OTHER_COLOR : methodColor(m) }} />{m === '…' ? '+' : m}</span>
        ))}
        <span className="ml-auto tabular-nums">{t('cat.plot.n', { n: pts.length })}</span>
      </div>
    </div>
  )
}
