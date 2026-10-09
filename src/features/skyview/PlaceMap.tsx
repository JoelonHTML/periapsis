// Flat world map to pick an observing place by tapping (drag = pan, pinch / wheel / buttons = zoom). Coastlines and borders come
// from the Earth feature's compact data (Natural Earth, public domain); place names from the offline places list.
import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setObserver, useObserver } from '@/lib/observer'
import { useT } from '@/lib/i18n'
import { loadBorders } from '../earth/borders.ts'
import { loadPlaces, nearestPlace, type Place } from './places.ts'

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const MIN_SPAN = 1.5

export function PlaceMap() {
  const t = useT()
  const lat = useObserver((s) => s.lat), lon = useObserver((s) => s.lon)
  const cv = useRef<HTMLCanvasElement>(null)
  const [c, setC] = useState({ lon, lat, span: 360 })
  const [places, setPlaces] = useState<Place[]>([])
  const cRef = useRef(c); cRef.current = c
  useEffect(() => { void loadPlaces().then(setPlaces) }, [])
  // follow the observer when it changes elsewhere (search, GPS)
  useEffect(() => { setC((s) => (Math.abs(wrap(s.lon - lon)) > s.span * 0.4 || Math.abs(s.lat - lat) > s.span * 0.2 ? { ...s, lon, lat, span: Math.min(s.span, 40) } : s)) }, [lon, lat])

  useEffect(() => {
    const el = cv.current!, ctx = el.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = el.clientWidth, H = el.clientHeight
    el.width = W * dpr; el.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const dpp = c.span / W
    const X = (lo: number) => wrap(lo - c.lon) / dpp + W / 2, Y = (la: number) => (c.lat - la) / dpp + H / 2
    ctx.fillStyle = '#0b1a2e'; ctx.fillRect(0, 0, W, H)
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,160,220,0.14)'
    const gs = c.span > 200 ? 30 : c.span > 80 ? 10 : c.span > 20 ? 5 : 1
    ctx.beginPath()
    for (let g = -180; g <= 180; g += gs) { const x = X(g); ctx.moveTo(x, 0); ctx.lineTo(x, H) }
    for (let g = -90; g <= 90; g += gs) { const y = Y(g); ctx.moveTo(0, y); ctx.lineTo(W, y) }
    ctx.stroke()
    const lines = (ls: Float32Array[], style: string) => {
      ctx.strokeStyle = style; ctx.beginPath()
      for (const a of ls) {
        let px = 0
        for (let i = 0; i < a.length; i += 2) {
          const x = X(a[i]), y = Y(a[i + 1])
          if (i === 0 || Math.abs(x - px) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          px = x
        }
      }
      ctx.stroke()
    }
    const b = loadBorders()
    if (c.span < 140) lines(b.borders, 'rgba(150,170,200,0.28)')
    ctx.lineWidth = 1.1; lines(b.coast, 'rgba(190,215,255,0.8)')
    // places
    if (c.span < 60) {
      ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      let n = 0
      const minPop = c.span > 30 ? 800 : c.span > 12 ? 250 : 0
      for (const p of places) {
        if (p[4] < minPop || n > 40) continue
        const x = X(p[3]), y = Y(p[2])
        if (x < 0 || x > W || y < 0 || y > H) continue
        n++
        ctx.fillStyle = 'rgba(255,230,160,0.9)'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
        ctx.fillStyle = 'rgba(230,236,250,0.85)'; ctx.fillText(p[0], x + 5, y)
      }
    }
    // the observer
    const ox = X(lon), oy = Y(lat)
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, 6.3); ctx.moveTo(ox - 12, oy); ctx.lineTo(ox + 12, oy); ctx.moveTo(ox, oy - 12); ctx.lineTo(ox, oy + 12); ctx.stroke()
  }, [c, lat, lon, places])

  useEffect(() => {
    const el = cv.current!
    const ptrs = new Map<number, { x: number; y: number }>()
    let g = { x0: 0, y0: 0, moved: false, d0: 0, span0: 0 }
    const zoom = (f: number) => setC((s) => ({ ...s, span: Math.min(360, Math.max(MIN_SPAN, s.span * f)) }))
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size === 1) g = { x0: e.clientX, y0: e.clientY, moved: false, d0: 0, span0: cRef.current.span }
      else { const [a, b] = [...ptrs.values()]; g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; g.span0 = cRef.current.span; g.moved = true }
    }
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId); if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY
      if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; setC((s) => ({ ...s, span: Math.min(360, Math.max(MIN_SPAN, g.span0 * (g.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1)))) })); return }
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6) g.moved = true
      if (!g.moved) return
      const dpp = cRef.current.span / el.clientWidth
      setC((s) => ({ ...s, lon: wrap(s.lon - dx * dpp), lat: Math.max(-85, Math.min(85, s.lat + dy * dpp)) }))
    }
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (g.moved || ptrs.size) return
      const s = cRef.current, r = el.getBoundingClientRect(), dpp = s.span / r.width
      const la = s.lat - (e.clientY - r.top - r.height / 2) * dpp, lo = wrap(s.lon + (e.clientX - r.left - r.width / 2) * dpp)
      if (Math.abs(la) > 90) return
      const near = nearestPlace(la, lo, placesRef.current, Math.max(15, s.span * 0.8))
      setObserver({ lat: +la.toFixed(3), lon: +lo.toFixed(3), altM: 0, name: near ? near[0] : '', fromGps: false })
    }
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.002)) }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false })
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel) }
  }, [])
  const placesRef = useRef<Place[]>([]); placesRef.current = places
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <canvas ref={cv} role="img" aria-label={t('sv.map.aria')} className="block aspect-[16/10] w-full touch-none rounded-lg border border-border" />
        <div className="absolute right-1.5 bottom-1.5 flex flex-col gap-1.5">
          <Button size="icon" variant="outline" className="size-10 bg-background/80" aria-label={t('sv.zoomIn')} onClick={() => setC((s) => ({ ...s, span: Math.max(MIN_SPAN, s.span / 2) }))}><Plus /></Button>
          <Button size="icon" variant="outline" className="size-10 bg-background/80" aria-label={t('sv.zoomOut')} onClick={() => setC((s) => ({ ...s, span: Math.min(360, s.span * 2) }))}><Minus /></Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('sv.map.h')}</p>
    </div>
  )
}
