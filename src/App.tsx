import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp, Orbit, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Scene } from '@/components/Scene'
import { LabelLayer } from '@/components/kit'
import { TimeBar, ViewCard } from '@/components/Controls'
import { FlybyBar } from '@/components/FlybyBar'
import { FlybyCard } from '@/components/FlybyCard'
import { MissionPanel } from '@/components/Mission'
import { TelemetryHud } from '@/components/Telemetry'
import { EarthPanel } from '@/components/EarthOrbit'
import { FormulasPanel, LagrangePanel } from '@/components/Info'
import { CalcPanel } from '@/components/Calculators'
import { GalaxyPanel } from '@/components/Galaxy'
import { SystemPanel } from '@/components/PlanetSystem'
import { SITES, earthPlan } from '@/lib/astro'
import { autoAllowed, enteredWindow, leftWindow } from '@/lib/closeup'
import { flybyWindow, type Solution } from '@/lib/mga'
import { ui, useUi, type Tab } from '@/lib/ui-store'
import { Tour } from '@/components/tour/Tour'
import { clock, closeCloseup, closeupEnabled, openCloseup, selectedSolution, store, tickClock, useApp, type View } from '@/lib/store'

const windows = new WeakMap<Solution, number[]>()
const flybyWindows = (s: Solution) => {
  let w = windows.get(s)
  if (!w) windows.set(s, (w = s.events.map((e, k) => (e.kind === 'flyby' ? flybyWindow(s, k).tWin : 0))))
  return w
}

/** Drives the simulation clock and the automatic flyby close-up.
 *  The close-up only ever reacts to the interval the clock integrated ITSELF in this frame (t0 → t1). A time jump made by
 *  anything else (jumpTo, SkipBack, new route, date field) happens between frames, before t0 is read, so it can never look
 *  like "the clock ran across a flyby window" — that was the cause of the Mars close-up right after launch. */
function useSimulationLoop() {
  useEffect(() => {
    let last = performance.now(), raf = 0
    const loop = (now: number) => {
      const t0 = clock.t
      tickClock(Math.min(0.1, (now - last) / 1000))
      last = now
      const t1 = clock.t, st = store.get(), sol = selectedSolution(st)
      if (st.view === 'flyby') {
        const ev = sol?.events[st.flybyIdx]
        if (!sol || ev?.kind !== 'flyby') closeCloseup() // route/ship changed under an open close-up
        else if (t1 !== t0) {
          const tw = flybyWindows(sol)[st.flybyIdx], out = leftWindow(t0, t1, ev.t, tw)
          if (out) {
            if (st.closeupAuto) closeCloseup() // the speed that was active before comes back (store.set)
            else { clock.t = ev.t + out * tw; clock.paused = true } // user-opened: stop at the edge instead of drifting off
          }
        }
      } else if (t1 !== t0 && st.simActive && st.autoCloseup && st.view === 'solar' && sol) {
        const w = flybyWindows(sol)
        for (let k = 0; k < sol.events.length; k++) {
          if (sol.events[k].kind !== 'flyby') continue
          const dir = enteredWindow(t0, t1, sol.events[k].t, w[k])
          if (dir && autoAllowed(t1, sol.tDep, closeupEnabled(st, sol, k))) { openCloseup(sol, k, { dir, auto: true }); break }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

const VIEWS: [View, string][] = [['solar', 'Zonnestelsel'], ['earth', 'Alleen Aarde'], ['earthmoon', 'Aarde–Maan'], ['system', 'Planeet & manen'], ['galaxy', 'Melkweg'], ['flyby', 'Flyby close-up']]

/** compact = two columns, as wide as the right-column cards (used below 1400 px, where the top strip has no room). */
function ViewSwitcher({ compact = false }: { compact?: boolean }) {
  const view = useApp((s) => s.view)
  const sol = useApp(selectedSolution)
  const firstFlyby = sol?.events.findIndex((e) => e.kind === 'flyby') ?? -1
  return (
    <ToggleGroup type="single" variant="outline" className={compact ? 'pointer-events-auto grid w-64 grid-cols-2 bg-background/80 backdrop-blur' : 'pointer-events-auto flex-wrap justify-center bg-background/80 backdrop-blur'} value={view}
      onValueChange={(v) => {
        if (!v) return
        if (v === 'flyby') { if (sol && firstFlyby >= 0) openCloseup(sol, firstFlyby) }
        else store.set({ view: v as View })
      }}>
      {VIEWS.map(([v, l]) => (
        <ToggleGroupItem key={v} value={v} className={compact ? 'w-full px-2 text-xs' : 'px-3 text-xs'} disabled={v === 'flyby' && firstFlyby < 0}>{l}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Earth–Moon view: frame the Moon's orbit, or zoom out to the Sun–Earth L1/L2 points (1,5 mln km either side). */
function EarthMoonBar() {
  const cam = useApp((s) => s.emCam)
  return (
    <ToggleGroup type="single" variant="outline" size="sm" className="pointer-events-auto rounded-lg border bg-card/90 p-1 shadow-lg backdrop-blur" value={cam.mode}
      onValueChange={(v) => { if (v) store.set({ emCam: { mode: v as 'moon' | 'l12', n: cam.n + 1 } }) }}>
      <ToggleGroupItem value="moon" className="h-7 px-2 text-xs">Maanbaan</ToggleGroupItem>
      <ToggleGroupItem value="l12" className="h-7 px-2 text-xs" title="Zo ver uitgezoomd dat Zon–Aarde L1 en L2 (±1,5 mln km) in beeld zijn">Zon–Aarde L1/L2</ToggleGroupItem>
    </ToggleGroup>
  )
}

const mq = (q: string) => (cb: () => void) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const useMedia = (q: string) => useSyncExternalStore(mq(q), () => window.matchMedia(q).matches)

/** The ViewCard (frozen, lives in Controls.tsx) with a collapse chevron on top, so the right column stays short on small screens. */
function CollapsibleViewCard() {
  const [open, setOpen] = useState(() => window.innerHeight >= 800)
  return open ? (
    <div className="relative">
      <ViewCard />
      <button type="button" aria-label="Weergave inklappen" className="absolute top-2.5 right-2 grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setOpen(false)}>
        <ChevronUp className="size-4" />
      </button>
    </div>
  ) : (
    <button type="button" aria-label="Weergave uitklappen" className="flex h-9 w-64 items-center justify-between rounded-xl bg-card px-3 text-sm font-medium ring-1 ring-foreground/10 hover:bg-muted" onClick={() => setOpen(true)}>
      Weergave <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  )
}

export default function App() {
  useSimulationLoop()
  const tab = useUi((s) => s.tab)
  const setTab = (tab: Tab) => ui.set({ tab })
  const view = useApp((s) => s.view)
  const panel = useUi((s) => s.panelOpen) // the panel can be hidden to give the 3D view the whole screen (phones!)
  const setPanel = (panelOpen: boolean) => ui.set({ panelOpen })
  const wide = useMedia('(min-width: 1000px)') // below: panel at the bottom, cards on top (see max-[999px] classes)
  useEffect(() => {
    if (view === 'galaxy') setTab('galaxy')
    else if (view === 'system') setTab('system')
  }, [view])
  const onTab = (v: string) => {
    setTab(v as Tab)
    const cur = store.get().view
    if (v === 'galaxy' || v === 'system') store.set({ view: v })
    else if (cur === 'galaxy' || cur === 'system') store.set({ view: 'solar' })
  }
  const orbit = useApp((s) => s.orbit)
  const craft = useApp((s) => s.craft)
  const startT = useApp((s) => s.startT)
  const siteIdx = useApp((s) => s.siteIdx)
  const customLat = useApp((s) => s.customLat)
  const customLon = useApp((s) => s.customLon)
  const site = siteIdx < 0 ? { name: 'Eigen locatie', lat: customLat, lon: customLon } : SITES[siteIdx]
  const plan = useMemo(
    () => earthPlan(orbit, site.lat, site.lon, startT, craft.dry + craft.prop, craft.isp, craft.cd, craft.area),
    [orbit, site.lat, site.lon, startT, craft],
  )
  return (
    <TooltipProvider>
      <div className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
        <div className="absolute inset-0">
          <Scene view={view} plan={plan} lat={site.lat} lon={site.lon} siteName={site.name} />
          <LabelLayer />
        </div>

        {wide && (
          <div className="pointer-events-none absolute top-3 right-[280px] left-[416px] z-10 flex flex-col items-center gap-2">
            <div className="hidden min-[1400px]:block"><ViewSwitcher /></div>
            {view === 'flyby' && <FlybyBar />}
            {view === 'earthmoon' && <EarthMoonBar />}
          </div>
        )}

        <Card className={`absolute top-3 bottom-3 left-3 z-10 w-[400px] gap-0 overflow-hidden bg-card/90 py-0 backdrop-blur max-[999px]:top-auto max-[999px]:right-2 max-[999px]:bottom-2 max-[999px]:left-2 max-[999px]:h-[46dvh] max-[999px]:w-auto ${panel ? '' : 'hidden'}`}>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Orbit className="size-5 text-cyan-400" />
            <div>
              <div className="text-sm font-semibold leading-none">Periapsis</div>
              <div className="text-[11px] text-muted-foreground">Missieontwerp · GMAT/EMTG-stijl</div>
            </div>
            <Button size="icon" variant="ghost" className="ml-auto" aria-label="Paneel verbergen" title="Paneel verbergen" onClick={() => setPanel(false)}><PanelLeftClose /></Button>
          </div>
          <Tabs value={tab} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col gap-0">
            {/* one rounded muted pill around both rows (the stock TabsList is a fixed single row of h-8) */}
            <TabsList className="mx-3 mt-3 grid w-auto grid-cols-4 gap-0.5 group-data-horizontal/tabs:h-auto">
              {[['mission', 'Missie'], ['earth', 'Aardbaan'], ['system', 'Stelsel'], ['calc', 'Rekenen'], ['lagrange', 'Lagrange'], ['galaxy', 'Melkweg'], ['formulas', 'Formules']].map(([v, l]) => (
                <TabsTrigger key={v} value={v} className="h-7 text-xs">{l}</TabsTrigger>
              ))}
            </TabsList>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                <TabsContent value="mission"><MissionPanel /></TabsContent>
                <TabsContent value="earth"><EarthPanel plan={plan} /></TabsContent>
                <TabsContent value="system"><SystemPanel /></TabsContent>
                <TabsContent value="calc"><CalcPanel /></TabsContent>
                <TabsContent value="lagrange"><LagrangePanel /></TabsContent>
                <TabsContent value="galaxy"><GalaxyPanel /></TabsContent>
                <TabsContent value="formulas"><FormulasPanel /></TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </Card>

        <div className={`absolute top-3 right-3 z-10 flex max-h-[calc(100dvh-110px)] flex-col gap-3 overflow-y-auto overscroll-contain max-[999px]:right-2 max-[999px]:left-2 max-[999px]:items-center ${panel ? 'max-[999px]:max-h-[calc(54dvh-90px)]' : ''}`}>
          <div className="min-[1400px]:hidden"><ViewSwitcher compact={wide} /></div>
          {!wide && view === 'flyby' && <FlybyBar />}
          {!wide && view === 'earthmoon' && <EarthMoonBar />}
          <div className="max-[999px]:hidden"><CollapsibleViewCard /></div>
          {view === 'flyby' && <div className="max-[999px]:hidden"><FlybyCard /></div>}
          <div className="max-[999px]:hidden"><TelemetryHud /></div>
        </div>

        {!panel && (
          <Button variant="outline" size="sm" className="absolute top-3 left-3 z-10 bg-background/80 backdrop-blur max-[999px]:top-auto max-[999px]:bottom-2 max-[999px]:left-2" onClick={() => setPanel(true)}>
            <PanelLeftOpen /> Paneel
          </Button>
        )}

        <div className={`absolute right-3 bottom-3 z-10 max-[999px]:right-2 max-[999px]:left-2 ${panel ? 'left-[416px] max-[999px]:bottom-[calc(46dvh+16px)]' : 'left-3 max-[999px]:bottom-12'}`}>
          <TimeBar />
        </div>
        <Tour />
      </div>
    </TooltipProvider>
  )
}
