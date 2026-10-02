import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { AU, BODIES } from '@/lib/astro'
import { allShips, clock, selectedSolution, useApp } from '@/lib/store'
import { fmtMet, missionState } from '@/lib/telemetry'
import { KV, f } from './bits'

const nl = (x: number, d = 0) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Distances: km up to 1 million km, then AU. */
const fmtDist = (km: number) => (km < 1e6 ? `${nl(km)} km` : `${nl(km / AU, 3)} AU`)
const evName = (k: string, body: string) => (k === 'launch' ? 'Lancering' : k === 'flyby' ? 'Gravity assist' : 'Aankomst') + ' ' + BODIES[body as keyof typeof BODIES].name

/** Live mission parameters (propellant burned so far, speed, distances, next event ...) shown over the 3D view. */
export function TelemetryHud() {
  const state = useApp((s) => s)
  const [, tick] = useState(0)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 100) // ~10 Hz, same as the time bar
    return () => clearInterval(id)
  }, [])

  const sol = selectedSolution(state)
  const ships = allShips(state)
  const others = ships.filter((_, i) => i !== state.active).filter((sh) => sh.selected >= 0 && sh.solutions[sh.selected])
  if (!sol && others.length === 0) return null

  const t = clock.t
  const ms = sol ? missionState(sol, state.craft, t) : null
  const me = ships[state.active]
  // over-budget routes are counted from the REQUIRED propellant (see massPlan): burned/remaining/mass stay physical
  const burned = ms?.burned ?? 0
  const mass = ms?.mass ?? 0
  const propPlan = ms ? ms.plan.m0 - state.craft.dry : 0
  return (
    <Card className="w-64 gap-2 py-3">
      {ms && sol && (
        <>
          <CardHeader className="cursor-pointer px-3" onClick={() => setOpen(!open)} title={open ? 'Inklappen' : 'Uitklappen'}>
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: me.color }} />
                <span className="truncate">{ships.length > 1 ? me.name : 'Telemetrie'}</span>
              </span>
              <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
            </CardTitle>
            <div className="font-mono text-sm font-semibold tabular-nums">{fmtMet(ms.elapsed)}</div>
          </CardHeader>
          {open && <CardContent className="grid gap-0.5 px-3">
            <KV k="Afstand tot Zon" v={`${nl(ms.rSun / AU, 3)} AU`} />
            <KV k="Afstand tot Aarde" v={fmtDist(ms.rEarth)} />
            <KV k="Snelheid t.o.v. Zon" v={`${f(ms.speed)} km/s`} />
            <div className="mt-1 grid gap-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Brandstof verbrand</span>
                <span className="font-semibold tabular-nums text-amber-300">{nl(burned, burned < 100 ? 1 : 0)} kg</span>
              </div>
              <Progress value={propPlan > 0 ? (burned / propPlan) * 100 : 0} className="h-1.5" />
            </div>
            <KV k="Brandstof over" v={<span>{nl(Math.max(0, ms.remaining), ms.remaining < 100 ? 1 : 0)} kg</span>} />
            <KV k="Massa nu" v={`${nl(mass, 0)} kg`} />
            <KV k="Δv gebruikt / budget" v={<span className={ms.dvUsed > ms.budget + 1e-9 ? 'text-red-400' : ''}>{f(ms.dvUsed)} / {f(ms.budget)} km/s</span>} />
            {!ms.plan.ok && (
              <div className="mt-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] leading-snug text-red-400">
                Te weinig brandstof: nodig {nl(ms.plan.totalProp)} kg, tank {nl(state.craft.prop)} kg (tekort {nl(ms.plan.shortfall)} kg)
              </div>
            )}
            {ms.next ? (
              <div className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-xs">
                <div className="truncate font-medium">{evName(ms.next.event.kind, ms.next.event.body)}</div>
                <div className="flex justify-between tabular-nums text-muted-foreground">
                  <span>{fmtMet(-ms.next.dt)}</span>
                  <span>v∞ {f(ms.next.event.vinf)} km/s</span>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">Missie voltooid.</div>
            )}
          </CardContent>}
        </>
      )}
      {others.length > 0 && (open || !ms) && (
        <CardContent className={`grid gap-1 px-3 ${ms ? 'border-t pt-2' : ''}`}>
          {others.map((sh) => {
            const s = missionState(sh.solutions[sh.selected], sh.craft, t)
            return (
              <div key={sh.id} className="grid gap-0 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: sh.color }} />
                    <span className="truncate font-medium">{sh.name}</span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{fmtMet(s.elapsed)}</span>
                </div>
                <div className="flex justify-between pl-3.5 tabular-nums text-muted-foreground">
                  <span>{nl(s.burned, s.burned < 100 ? 1 : 0)} kg verbrand</span>
                  <span>{nl(s.rSun / AU, 2)} AU</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
