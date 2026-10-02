import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BODIES, fmtDate, fmtDuration } from '@/lib/astro'
import { CLOSEUP_RATES, cycleFlyby, flybyIndices, windowPhase } from '@/lib/closeup'
import { flybyWindow } from '@/lib/mga'
import { clock, closeCloseup, openCloseup, selectedSolution, setCloseupRate, store, useApp } from '@/lib/store'

/** Re-renders a few times per second so the readouts follow the (non-React) simulation clock. */
export function useClockTick(ms = 150) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

/** Control strip of the flyby close-up: pick which flyby, how fast to watch it, camera, and the out-of-window notice. */
export function FlybyBar() {
  useClockTick()
  const sol = useApp(selectedSolution)
  const k = useApp((s) => s.flybyIdx)
  const rate = useApp((s) => s.closeupRate)
  const cam = useApp((s) => s.flybyCam)
  const ev = sol?.events[k]
  if (!sol || !ev || ev.kind !== 'flyby') return null
  const list = flybyIndices(sol.events), pos = list.indexOf(k) + 1
  const { tWin } = flybyWindow(sol, k)
  const { phase, offset } = windowPhase(clock.t, ev.t, tWin)
  const go = (dir: 1 | -1) => { const n = cycleFlyby(sol.events, k, dir); if (n >= 0) openCloseup(sol, n) }
  const rateIdx = CLOSEUP_RATES.indexOf(rate)
  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1.5">
      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border bg-card/90 px-2 py-1.5 shadow-lg backdrop-blur">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={list.length < 2} onClick={() => go(-1)}><ChevronLeft /> Vorige flyby</Button>
        <div className="min-w-[120px] text-center leading-tight">
          <div className="text-xs font-semibold">{BODIES[ev.body].name} · {pos}/{list.length}</div>
          <div className="text-[10.5px] text-muted-foreground">{fmtDate(ev.t)}</div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={list.length < 2} onClick={() => go(1)}>Volgende flyby <ChevronRight /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant="outline" className="size-7" title={clock.paused ? 'Afspelen' : 'Pauzeren'} onClick={() => { clock.paused = !clock.paused }}>
          {clock.paused ? <Play /> : <Pause />}
        </Button>
        <ToggleGroup type="single" variant="outline" size="sm" value={rateIdx >= 0 ? String(rateIdx) : ''}
          onValueChange={(v) => { if (v !== '') { setCloseupRate(sol, k, CLOSEUP_RATES[+v]); clock.paused = false } }}>
          {CLOSEUP_RATES.map((r, i) => <ToggleGroupItem key={r} value={String(i)} className="h-7 px-2 text-xs" title={`${String(r).replace('.', ',')}× — heel venster in ${Math.round(30 / r)} s`}>{String(r).replace('.', ',')}×</ToggleGroupItem>)}
        </ToggleGroup>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToggleGroup type="single" variant="outline" size="sm" value={cam.mode}
          onValueChange={(v) => { if (v) store.set({ flybyCam: { mode: v as 'wide' | 'close' | 'sun', n: cam.n + 1 } }) }}>
          <ToggleGroupItem value="wide" className="h-7 px-2 text-xs">Overzicht</ToggleGroupItem>
          <ToggleGroupItem value="close" className="h-7 px-2 text-xs">Dichtbij</ToggleGroupItem>
          <ToggleGroupItem value="sun" className="h-7 px-2 text-xs" title="Kijk richting de Zon: de andere planeten staan op hun ware richting">Richting Zon</ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={closeCloseup}><Undo2 /> Terug naar zonnestelsel</Button>
      </div>
      <div className="flex w-full max-w-[560px] items-center gap-2 rounded-lg border bg-card/80 px-3 py-1.5 backdrop-blur">
        <span className="w-16 text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">T−{fmtDuration(tWin)}</span>
        <Slider min={-tWin} max={tWin} step={tWin / 400} value={[Math.max(-tWin, Math.min(tWin, offset))]}
          onValueChange={([v]) => { clock.t = ev.t + v; clock.paused = true }} />
        <span className="w-16 font-mono text-[10.5px] tabular-nums text-muted-foreground">T+{fmtDuration(tWin)}</span>
      </div>
      {phase !== 'inside' && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/80 px-3 py-1.5 text-xs text-amber-100 shadow-lg backdrop-blur">
          <span>
            Buiten het flyby-venster — nu {phase === 'before' ? `T−${fmtDuration(-offset)} vóór` : `T+${fmtDuration(offset)} na`} de flyby
          </span>
          <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => openCloseup(sol, k)}>Spring naar flyby</Button>
        </div>
      )}
    </div>
  )
}
