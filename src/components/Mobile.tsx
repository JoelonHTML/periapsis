import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Calculator, Ellipsis, FastForward, Orbit, Pause, Play, Rewind, Rocket, Settings, SkipBack, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'
import { fmtDateTime } from '@/lib/astro'
import { SPEEDS, clock, store } from '@/lib/store'
import { ui, useUi, type Tab } from '@/lib/ui-store'
import { useClockTick } from '@/components/FlybyBar'

const NAV: { tab: Tab; label: string; Icon: typeof Rocket }[] = [
  { tab: 'mission', label: 'Missie', Icon: Rocket },
  { tab: 'earth', label: 'Aardbaan', Icon: Orbit },
  { tab: 'calc', label: 'Rekenen', Icon: Calculator },
  { tab: 'view', label: 'Beeld', Icon: SlidersHorizontal },
  { tab: 'more', label: 'Meer', Icon: Ellipsis },
]
export const MORE_TABS: { tab: Tab; label: string; hint: string }[] = [
  { tab: 'system', label: 'Stelsel', hint: 'Planeten en hun manen' },
  { tab: 'lagrange', label: 'Lagrange', hint: 'Evenwichtspunten L1–L5' },
  { tab: 'galaxy', label: 'Melkweg', hint: 'De Melkweg op schaal' },
  { tab: 'formulas', label: 'Formules', hint: 'Alle vergelijkingen' },
]
const isMore = (t: Tab) => MORE_TABS.some((m) => m.tab === t)

const DOCK = 64 // px: drag handle + time row, always visible above the tab bar
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Compact time controls; the full date/speed card lives in the "Beeld" tab. */
function Dock({ onDate }: { onDate: () => void }) {
  useClockTick(100)
  const dir = Math.sign(clock.target) || 1
  const idx = SPEEDS.findIndex((s) => s.s === Math.abs(clock.target))
  const setDir = (d: number) => {
    const i = Math.max(0, idx)
    clock.target = d * (Math.sign(clock.target) === d && !clock.paused ? SPEEDS[Math.min(SPEEDS.length - 1, i + 1)].s : SPEEDS[i].s)
    clock.paused = false
  }
  const b = 'size-11 shrink-0'
  return (
    <div className="flex h-12 items-center gap-0.5 px-1.5">
      <Button size="icon" variant="ghost" className={b} aria-label="Terug naar startdatum" onClick={() => { clock.t = store.get().startT }}><SkipBack /></Button>
      <Button size="icon" variant={dir < 0 && !clock.paused ? 'secondary' : 'ghost'} className={b} aria-label="Terugspoelen" onClick={() => setDir(-1)}><Rewind /></Button>
      <Button size="icon" className={b} aria-label={clock.paused ? 'Afspelen' : 'Pauzeren'} onClick={() => { clock.paused = !clock.paused }}>{clock.paused ? <Play /> : <Pause />}</Button>
      <Button size="icon" variant={dir > 0 && !clock.paused ? 'secondary' : 'ghost'} className={b} aria-label="Vooruitspoelen" onClick={() => setDir(1)}><FastForward /></Button>
      <Select value={idx >= 0 ? String(idx) : ''} onValueChange={(v) => { clock.target = dir * SPEEDS[+v].s; clock.paused = false }}>
        <SelectTrigger className="h-11 w-[5.6rem] shrink-0 px-2 text-xs" aria-label="Tempo"><SelectValue placeholder="tempo" /></SelectTrigger>
        <SelectContent>{SPEEDS.map((s, i) => <SelectItem key={s.s} value={String(i)}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <button type="button" onClick={onDate} className="ml-auto min-w-0 truncate px-1.5 text-right font-mono text-[11px] leading-tight tabular-nums" aria-label="Datum en tijd instellen">
        {fmtDateTime(clock.t).slice(0, 10)}<br />{fmtDateTime(clock.t).slice(11)} UTC
      </button>
    </div>
  )
}

/** Bottom drawer that snaps between closed / half / full by dragging its handle (or tapping it). Moves with the dock. */
function Drawer({ land, children, dock }: { land: boolean; children: ReactNode; dock: ReactNode }) {
  const sheet = useUi((s) => s.sheet)
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0) // measured drawer height
  const [drag, setDrag] = useState<number | null>(null) // live offset in px while dragging
  const g = useRef({ y0: 0, off0: 0, t: 0, v: 0, lastY: 0, moved: false })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [land])
  const offsets = { full: 0, half: Math.max(0, h - window.innerHeight * 0.5), closed: Math.max(0, h - DOCK) }
  const set = (sheet: 'closed' | 'half' | 'full') => ui.set({ sheet })
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,[role=combobox],select')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    g.current = { y0: e.clientY, off0: offsets[sheet], t: e.timeStamp, v: 0, lastY: e.clientY, moved: false }
    setDrag(offsets[sheet])
  }
  const move = (e: React.PointerEvent) => {
    if (drag === null) return
    const s = g.current
    if (Math.abs(e.clientY - s.y0) > 6) s.moved = true
    const dt = e.timeStamp - s.t
    if (dt > 0) s.v = (e.clientY - s.lastY) / dt
    s.lastY = e.clientY; s.t = e.timeStamp
    setDrag(Math.min(offsets.closed, Math.max(0, s.off0 + e.clientY - s.y0)))
  }
  const up = () => {
    if (drag === null) return
    const s = g.current
    if (!s.moved) set(sheet === 'closed' ? 'half' : 'closed') // tap on the handle
    else {
      const proj = drag + s.v * 180 // where the flick would end up
      const best = (Object.entries(offsets) as ['closed' | 'half' | 'full', number][]).reduce((a, b) => (Math.abs(b[1] - proj) < Math.abs(a[1] - proj) ? b : a))
      set(best[0])
    }
    setDrag(null)
  }
  const y = drag ?? offsets[sheet]
  // tell the 3D camera how much of the screen the drawer / side panel hides (nav bar is outside the canvas area it should centre in)
  useEffect(() => {
    const navH = document.querySelector<HTMLElement>('nav[aria-label="Hoofdmenu"]')?.offsetHeight ?? 56
    if (land) ui.set({ covered: { bottom: DOCK + 12, left: sheet === 'closed' ? 0 : Math.min(480, window.innerWidth * 0.52) } })
    else ui.set({ covered: { bottom: Math.max(0, h - offsets[sheet]) + navH, left: 0 } })
  }, [land, sheet, h]) // eslint-disable-line react-hooks/exhaustive-deps
  const closed = sheet === 'closed' && drag === null
  if (land) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] bottom-[calc(env(safe-area-inset-bottom)+3rem)] z-20">
        <div className="pointer-events-auto absolute inset-y-1 left-1 flex w-[min(30rem,52vw)] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur"
          style={{ transform: sheet === 'closed' ? 'translateX(calc(-100% - 1rem))' : 'none', transition: `transform 260ms ${EASE}` }} inert={closed || undefined}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        </div>
        <div className="pointer-events-auto absolute right-1 bottom-1 w-[min(28rem,46vw)] rounded-2xl border bg-card/95 shadow-xl backdrop-blur">{dock}</div>
      </div>
    )
  }
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-x-0 z-20 flex flex-col rounded-t-3xl border-t bg-card/95 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] backdrop-blur will-change-transform"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 3.5rem)', height: 'calc(100dvh - env(safe-area-inset-top) - 3.5rem - env(safe-area-inset-bottom) - 3.5rem)', transform: `translateY(${y}px)`, transition: drag === null ? `transform 280ms ${EASE}` : 'none' }}>
      <div data-tour="dock" className="shrink-0 touch-none select-none" style={{ height: DOCK }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        {dock}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-4 pt-3 pb-6" inert={closed || undefined}>{children}</div>
    </div>
  )
}

function MorePanel({ onTab }: { onTab: (t: Tab) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MORE_TABS.map((m) => (
        <button key={m.tab} type="button" onClick={() => onTab(m.tab)} className="flex min-h-24 flex-col items-start justify-center gap-1 rounded-2xl border bg-muted/40 p-4 text-left active:bg-muted">
          <span className="text-base font-semibold">{m.label}</span>
          <span className="text-xs text-muted-foreground">{m.hint}</span>
        </button>
      ))}
    </div>
  )
}

/** Phone layout: 3D scene full-screen, chips on top, drawer + tab bar at the bottom. Panels come in as `content` (TabsContent set). */
export function MobileApp({ scene, views, extras, content, tab, onTab, land }: {
  scene: ReactNode; views: ReactNode; extras: ReactNode; content: ReactNode; tab: Tab; onTab: (t: Tab) => void; land: boolean
}) {
  const sheet = useUi((s) => s.sheet)
  const nav = (t: Tab) => {
    if (t === tab && sheet !== 'closed') ui.set({ sheet: 'closed' })
    else { onTab(t); if (sheet === 'closed') ui.set({ sheet: 'half' }) }
  }
  useEffect(() => { document.documentElement.style.overscrollBehavior = 'none' }, [])
  const active = isMore(tab) ? 'more' : tab
  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">{scene}</div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-1 pl-2">
          <div data-tour="views" className="pointer-events-auto min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{views}</div>
          <Button size="icon" variant="outline" className="pointer-events-auto mr-2 size-11 shrink-0 bg-background/80 backdrop-blur" aria-label="Instellingen" data-tour="settings" onClick={() => ui.set({ settingsOpen: true })}><Settings /></Button>
        </div>
        <div className="flex justify-center px-2">{extras}</div>
      </div>

      <Drawer land={land} dock={<Dock onDate={() => { onTab('view'); ui.set({ sheet: 'half' }) }} />}>
        {isMore(tab) && (
          <button type="button" onClick={() => onTab('more')} className="mb-3 flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted">
            <ArrowLeft className="size-4" /> Meer
          </button>
        )}
        <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)} className="gap-0">
          {content}
          {tab === 'more' && <MorePanel onTab={onTab} />}
        </Tabs>
      </Drawer>

      <nav className="absolute inset-x-0 bottom-0 z-30 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Hoofdmenu">
        {NAV.map(({ tab: t, label, Icon }) => {
          const on = active === t && sheet !== 'closed'
          return (
            <button key={t} type="button" data-tour={`nav-${t === 'mission' ? 'mission' : t}`} onClick={() => nav(t)} aria-current={on ? 'page' : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:scale-95 active:bg-muted ${on ? 'text-cyan-300' : 'text-muted-foreground'}`}>
              <Icon className="size-5" /> {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
