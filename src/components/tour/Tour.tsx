import { useEffect, useLayoutEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Orbit, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TOUR, clampStep } from '@/lib/tour-steps'
import { endTour, startTour, tour, useTour } from '@/lib/tour-store'
import { ui } from '@/lib/ui-store'

type Box = { x: number; y: number; w: number; h: number }

/** First element matching the selector that is actually on screen (the desktop and phone layouts both exist in markup rules). */
function find(sel?: string): Box | null {
  if (!sel) return null
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  return null
}

/** First-run welcome + guided tour overlay. Mounted once in App. Can be skipped at any moment, replayed from the settings. */
export function Tour() {
  const phase = useTour((s) => s.phase)
  const step = useTour((s) => s.step)
  const [box, setBox] = useState<Box | null>(null)
  const st = TOUR[clampStep(step)]

  // show what the step talks about (tab / drawer) before measuring it
  useEffect(() => {
    if (phase !== 'running') return
    const wide = matchMedia('(min-width: 1000px) and (min-height: 501px)').matches // desktop has no drawer and no Beeld/Meer tabs
    if (st.tab && !(wide && (st.tab === 'more' || st.tab === 'view'))) ui.set({ tab: st.tab })
    if (st.sheet) ui.set({ sheet: st.sheet })
  }, [phase, step, st])
  useLayoutEffect(() => {
    if (phase !== 'running') return
    const measure = () => setBox(find(st.target))
    const id = setTimeout(measure, 340) // after the drawer finished moving
    measure()
    addEventListener('resize', measure)
    return () => { clearTimeout(id); removeEventListener('resize', measure) }
  }, [phase, step, st])

  if (phase === 'off') return null
  if (phase === 'welcome') {
    return (
      <div className="tour-fade fixed inset-0 z-[60] grid place-items-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welkom bij Periapsis">
        <div className="tour-pop w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-2xl">
          <Orbit className="mx-auto size-10 text-cyan-400" strokeWidth={1.5} />
          <h2 className="mt-3 text-2xl font-semibold">Welkom bij Periapsis</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ontwerp missies door het zonnestelsel, plan banen om de Aarde en zie precies hoe de natuurkunde werkt. Wil je een korte rondleiding?</p>
          <Button size="lg" className="mt-5 h-12 w-full text-base" onClick={startTour}>Start rondleiding</Button>
          <Button size="lg" variant="ghost" className="mt-1 h-12 w-full text-base text-muted-foreground" onClick={() => endTour('skipped')}>Overslaan</Button>
        </div>
      </div>
    )
  }

  const last = step >= TOUR.length - 1
  const pad = 6
  // card goes to the half of the screen the spotlight is not in
  const top = box ? box.y + box.h / 2 > innerHeight / 2 : false
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Rondleiding">
      {box ? (
        <div className="tour-ring pointer-events-none fixed rounded-2xl ring-2 ring-cyan-300 shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]"
          style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }} />
      ) : <div className="fixed inset-0 bg-black/55" />}
      <div className={`pointer-events-none fixed inset-x-3 flex justify-center ${!box ? 'inset-y-0 items-center' : top ? 'top-[max(1rem,env(safe-area-inset-top))]' : 'bottom-[calc(env(safe-area-inset-bottom)+5rem)]'}`}>
      <div key={step} className="tour-pop pointer-events-auto w-full max-w-sm rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground tabular-nums">Stap {step + 1} van {TOUR.length}</div>
            <h3 className="text-lg font-semibold">{st.title}</h3>
          </div>
          <Button size="icon" variant="ghost" className="size-10" aria-label="Rondleiding stoppen" onClick={() => endTour('skipped')}><X /></Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{st.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden>
            {TOUR.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-cyan-400' : 'bg-muted'}`} />)}
          </div>
          <Button variant="ghost" className="h-11" disabled={step === 0} onClick={() => tour.set({ step: step - 1 })}><ChevronLeft /> Terug</Button>
          <Button className="h-11 px-4" onClick={() => (last ? endTour('done') : tour.set({ step: step + 1 }))}>{last ? 'Klaar' : <>Volgende <ChevronRight /></>}</Button>
        </div>
      </div>
      </div>
    </div>
  )
}
