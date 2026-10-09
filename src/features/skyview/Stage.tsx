// The sky itself: a full-screen canvas behind the app chrome (portal), with drag / pinch / wheel, tap-to-identify, AR (device
// orientation) and the floating place + info cards. Drawing lives in render.ts, astronomy in scene.ts / geom.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toJ2000 } from '@/lib/astro'
import { clock } from '@/lib/store'
import { setSpeedNow } from '@/lib/store'
import { useObserver } from '@/lib/observer'
import { settings, useSettings } from '@/lib/settings'
import { t, useT } from '@/lib/i18n'
import { tap } from '@/lib/haptics'
import { useUi } from '@/lib/ui-store'
import '../tonight/i18n'
import './i18n'
import { basisAzAlt, basisFromOrientation, blendBasis, camScale, horizonMatrix, hzVec, hzAltAz, solarClock, yawBasis, type Basis, type Cam } from './geom.ts'
import { computeBodies, computeSats, ensureSats, ensureSky, objKey, objectAltAz, skyCtx, skyState, type SatPos } from './scene.ts'
import { drawEdgeArrow, drawSky, type Frame, type Hit } from './render.ts'
import { FOV_MAX, FOV_MIN, layers, saveYaw, view, useView } from './state.ts'
import { coordText } from './places.ts'
import { InfoCard } from './InfoCard.tsx'
import { live, showHint, simMs, siteNow, clampAlt, toggleAr, PLANET_IDS } from './control.ts'

export function SkyStage() {
  const tr = useT()
  const lat = useObserver((s) => s.lat), lon = useObserver((s) => s.lon), name = useObserver((s) => s.name)
  const lang = useSettings((s) => s.lang)
  const ar = useView((s) => s.ar), hint = useView((s) => s.hint), sel = useView((s) => s.sel)
  const ready = skyState.useStore((s) => s.skyReady)
  const covered = useUi((s) => s.covered), panelOpen = useUi((s) => s.panelOpen)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [, setNowTick] = useState(0)

  useEffect(() => { void ensureSky(); void ensureSats() }, [])
  useEffect(() => { const i = setInterval(() => setNowTick((n) => n + 1), 15000); return () => clearInterval(i) }, [])
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on); return () => window.removeEventListener('resize', on)
  }, [])

  const wide = size.w >= 1000 && size.h > 500
  const inset = useMemo(() => ({ left: covered.left || (wide && panelOpen ? 416 : 0), bottom: wide ? 76 : covered.bottom, top: wide ? 0 : size.h <= 500 ? 48 : 56 }), [covered, wide, panelOpen, size.h])
  const insetRef = useRef(inset); insetRef.current = inset

  // ---------- AR: device orientation ----------
  const arTarget = useRef<Basis | null>(null), arCur = useRef<Basis | null>(null), arSeen = useRef(0)
  useEffect(() => {
    if (ar !== 'on') { arTarget.current = null; arCur.current = null; return }
    const screenAngle = () => screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0
    let relativeWarned = false
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      const wch = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading
      let alpha = e.alpha
      let absolute = e.absolute || e.type === 'deviceorientationabsolute'
      if (typeof wch === 'number' && Number.isFinite(wch)) { alpha = 360 - wch; absolute = true } // iOS: true compass heading
      arTarget.current = basisFromOrientation(alpha, e.beta, e.gamma, screenAngle())
      arSeen.current = performance.now()
      if (!absolute && !relativeWarned) { relativeWarned = true; showHint(t('sv.ar.rel'), 9000) }
    }
    const abs = 'ondeviceorientationabsolute' in window
    const type = abs ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(type, onOri as EventListener, true)
    showHint(t('sv.ar.calib'), 7000)
    const to = setTimeout(() => { if (!arSeen.current && view.get().ar === 'on') { view.set({ ar: 'nosensor' }); showHint(t('sv.ar.none'), 6000) } }, 2500)
    return () => { window.removeEventListener(type, onOri as EventListener, true); clearTimeout(to); arSeen.current = 0 }
  }, [ar])

  // ---------- main loop ----------
  useEffect(() => {
    const cv = canvas.current!, ctx = cv.getContext('2d')!
    let raf = 0, lastSig = '', lastSatReal = 0, lastSatMs = 0, lastFrame = performance.now(), hits: Hit[] = []
    let satList: SatPos[] = []
    const names = { sun: t('sky.p.sun'), moon: t('sky.p.moon'), planets: Object.fromEntries(PLANET_IDS.map((p) => [p, t(`sky.p.${p}`)])) as Record<string, string> }
    const compass = [0, 2, 4, 6, 8, 10, 12, 14].map((i) => t(`sky.dir.${i}`))
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.2, (now - lastFrame) / 1000); lastFrame = now
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); lastSig = '' }
      const v = view.get(), L = layers.get(), data = skyCtx.data
      // AR: smooth the device attitude, then it IS the view (az/alt follow so leaving AR keeps the direction)
      let basis: Basis
      if (v.ar === 'on' && arTarget.current) {
        arCur.current = arCur.current ? blendBasis(arCur.current, arTarget.current, 1 - Math.exp(-dt / 0.07)) : arTarget.current
        basis = yawBasis(arCur.current, v.arYaw)
        const a = hzAltAz(basis.f); v.az = a.az; v.alt = a.alt // (mutating on purpose: no re-render per frame)
      } else basis = basisAzAlt(v.az, clampAlt(v.alt))
      const ms = simMs(), site = siteNow()
      const real = performance.now()
      const bodies = computeBodies(ms, site)
      if (L.sats && skyCtx.sats.length && (real - lastSatReal > 700 || Math.abs(ms - lastSatMs) > 4000)) { satList = computeSats(skyCtx.sats, ms, site); lastSatReal = real; lastSatMs = ms }
      live.b = bodies; live.sats = satList; live.ms = ms
      const sig = [v.az.toFixed(2), v.alt.toFixed(2), v.fov, w, h, Math.floor(ms / (clock.target > 5 ? 1 : 2000)), objKey(v.sel), JSON.stringify(L), lastSatReal | 0, v.ar, ready0(), v.arYaw, site.lat, site.lon, insetRef.current.left, insetRef.current.bottom].join('|')
      if (sig === lastSig && v.ar !== 'on') return
      lastSig = sig
      if (!data) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, w, h); return }
      const ins = insetRef.current
      const aw = w - ins.left, ah = h - ins.top - ins.bottom
      const cam: Cam = { ...basis, cx: ins.left + aw / 2, cy: ins.top + ah / 2, k: camScale(aw, ah, v.fov) }
      const frame: Frame = { w, h, dpr, cam, M: horizonMatrix(ms, site.lat, site.lon), data, layers: L, lang: settings.get().lang, b: bodies, sats: satList, sel: v.sel, compass, fov: v.fov, names }
      hits = drawSky(ctx, frame)
      if (v.sel) {
        const aa = objectAltAz(v.sel, ms, site, bodies, satList)
        if (aa) drawEdgeArrow(ctx, frame, hzVec(aa.alt, aa.az), '#38bdf8')
      }
      hitsRef.current = hits
      camRef.current = cam
    }
    const ready0 = () => (skyCtx.data ? 1 : 0)
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [lang, ready, lat, lon])
  const hitsRef = useRef<Hit[]>([]), camRef = useRef<Cam | null>(null)

  // ---------- gestures ----------
  useEffect(() => {
    const cv = canvas.current!
    const ptrs = new Map<number, { x: number; y: number }>()
    let g = { x0: 0, y0: 0, t0: 0, moved: false, d0: 0, fov0: 0 }
    const zoom = (f: number) => view.set({ fov: Math.min(FOV_MAX, Math.max(FOV_MIN, f)) })
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size === 1) g = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, moved: false, d0: 0, fov0: view.get().fov }
      else { const [a, b] = [...ptrs.values()]; g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; g.fov0 = view.get().fov; g.moved = true }
    }
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId); if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; zoom(g.fov0 * (g.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1))); return }
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6) g.moved = true
      if (!g.moved) return
      const cam = camRef.current, k = cam?.k ?? 300, v = view.get(), degPerPx = 180 / Math.PI / k
      if (v.ar === 'on') { view.set({ arYaw: v.arYaw - dx * degPerPx }); return } // drag = fine-tune heading
      view.set({ az: (v.az - (dx * degPerPx) / Math.max(0.25, Math.cos(clampAlt(v.alt) * Math.PI / 180)) + 360) % 360, alt: clampAlt(v.alt + dy * degPerPx) })
    }
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (view.get().ar === 'on') saveYaw()
      if (g.moved || ptrs.size > 0 || e.timeStamp - g.t0 > 600) return
      pick(e.clientX, e.clientY)
    }
    const pick = (x: number, y: number) => {
      let best: Hit | null = null, bs = 1e9
      for (const hh of hitsRef.current) {
        const d = Math.hypot(hh.x - x, hh.y - y)
        if (d > (hh.pri === 0 ? 30 : 24)) continue
        const s = d - hh.pri * 5
        if (s < bs) { bs = s; best = hh }
      }
      if (best) { tap(); view.set({ sel: best.obj }) } else view.set({ sel: null })
    }
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(view.get().fov * Math.exp(e.deltaY * 0.0015)) }
    const key = (e: KeyboardEvent) => {
      const v = view.get(), s = Math.max(2, v.fov / 12)
      if (e.key === 'ArrowLeft') view.set({ az: (v.az - s + 360) % 360 })
      else if (e.key === 'ArrowRight') view.set({ az: (v.az + s) % 360 })
      else if (e.key === 'ArrowUp') view.set({ alt: clampAlt(v.alt + s) })
      else if (e.key === 'ArrowDown') view.set({ alt: clampAlt(v.alt - s) })
      else if (e.key === '+' || e.key === '=') zoom(v.fov / 1.15)
      else if (e.key === '-') zoom(v.fov * 1.15)
      else return
      e.preventDefault()
    }
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('keydown', key)
    return () => { cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); cv.removeEventListener('keydown', key) }
  }, [])

  const hasSensorUi = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || !!(window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission)

  const ms = simMs(), real = Date.now(), off = Math.abs(ms - real) > 90000
  const sc = solarClock(ms, lon)
  const coord = coordText(lat, lon)
  const arOn = ar === 'on'
  return createPortal(
    <div className="fixed inset-0 z-[5] touch-none select-none overflow-hidden bg-[#04060b]" data-skyview>
      <canvas ref={canvas} tabIndex={0} aria-label={tr('sv.canvas')} className="absolute inset-0 size-full touch-none outline-none" style={{ cursor: arOn ? 'default' : 'grab' }} />
      {!ready && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-300">{tr('sv.loading')}</div>}
      <div className="pointer-events-none absolute flex flex-col gap-2" style={{ left: wide ? inset.left + 16 : 8, right: wide ? 300 : 8, top: wide ? 12 : `calc(env(safe-area-inset-top) + ${inset.top + 4}px)` }}>
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 self-start rounded-xl border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-slate-100 backdrop-blur">
          <span className="min-w-0 truncate font-semibold">{name || tr('sky.loc.unnamed')}</span>
          <span className="tabular-nums text-slate-300">{coord}</span>
          <span className="tabular-nums" title={tr('sv.solarTime.h')}>{sc.hhmm} <span className="text-slate-400">{tr('sv.solarTime')}</span></span>
          {off && <button type="button" className="rounded-full bg-sky-500/25 px-2 py-0.5 font-medium text-sky-200 active:bg-sky-500/40" onClick={() => { clock.t = toJ2000(Date.now()); setSpeedNow(1); clock.paused = false }}>{tr('sky.now')}</button>}
        </div>
        {hint && <div role="status" className="pointer-events-auto max-w-md self-start rounded-xl border border-amber-300/30 bg-black/70 px-3 py-2 text-xs text-amber-100 backdrop-blur">{hint}</div>}
        {sel && <InfoCard sel={sel} onClose={() => view.set({ sel: null })} />}
      </div>
      <div className="absolute right-3 flex flex-col gap-2" style={{ bottom: `calc(${inset.bottom}px + 12px)` }}>
        {hasSensorUi && (
          <Button size="icon" variant={arOn ? 'default' : 'outline'} className="size-11 bg-background/80 backdrop-blur data-[on=true]:bg-sky-500" data-on={arOn} aria-pressed={arOn} aria-label={tr('sv.ar')} title={tr(arOn ? 'sv.ar.on' : 'sv.ar')} onClick={() => void toggleAr()}><Smartphone /></Button>
        )}
        <Button size="icon" variant="outline" className="size-11 bg-background/80 backdrop-blur" aria-label={tr('sv.zoomIn')} onClick={() => view.set({ fov: Math.max(FOV_MIN, view.get().fov / 1.3) })}><Plus /></Button>
        <Button size="icon" variant="outline" className="size-11 bg-background/80 backdrop-blur" aria-label={tr('sv.zoomOut')} onClick={() => view.set({ fov: Math.min(FOV_MAX, view.get().fov * 1.3) })}><Minus /></Button>
      </div>
    </div>,
    document.body,
  )
}
