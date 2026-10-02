import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BODIES, DEG, fmtDate, fmtDuration } from '@/lib/astro'
import { flybyState, windowPhase } from '@/lib/closeup'
import { flybyWindow } from '@/lib/mga'
import { clock, closeCloseup, openCloseup, selectedSolution, useApp } from '@/lib/store'
import { useClockTick } from './FlybyBar'
import { KV, Tex, f } from './bits'

export function FlybyCard() {
  useClockTick()
  const sol = useApp(selectedSolution)
  const k = useApp((s) => s.flybyIdx)
  const ev = sol?.events[k]
  if (!sol || !ev || ev.kind !== 'flyby') return null
  const win = flybyWindow(sol, k), { g, tWin } = win
  const b = BODIES[ev.body]
  const free = ev.dv < 1e-3
  const inside = windowPhase(clock.t, ev.t, tWin).phase === 'inside'
  const live = inside ? flybyState(sol, k, clock.t, win) : null
  const gain = ev.vHelioOut! - ev.vHelioIn!
  return (
    <Card className="w-64 gap-2 py-3">
      <CardHeader className="px-3"><CardTitle className="text-sm">Gravity assist — {b.name}</CardTitle></CardHeader>
      <CardContent className="grid gap-0.5 px-3">
        <div className="mb-1 rounded-md bg-yellow-500/10 px-2 py-1.5 text-center">
          <div className="text-[10.5px] text-muted-foreground">Zonsnelheid nu</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-yellow-300">{live ? `${f(live.vHelio, 2)} km/s` : '—'}</div>
          <div className="text-[10.5px] tabular-nums text-muted-foreground">{f(ev.vHelioIn!, 2)} → {f(ev.vHelioOut!, 2)} km/s ({gain >= 0 ? '+' : '−'}{f(Math.abs(gain), 2)})</div>
        </div>
        <KV k="Snelheid t.o.v. planeet" v={live ? `${f(live.vRel, 2)} km/s` : '—'} />
        <KV k="Hoogte boven planeet" v={live ? `${Math.round(live.r - b.radius).toLocaleString('nl-NL')} km` : '—'} />
        <KV k="Datum dichtste nadering" v={fmtDate(ev.t)} />
        <KV k="v∞ in → uit" v={`${f(ev.vinf)} → ${f(Math.hypot(...ev.vinfOut!))} km/s`} />
        <KV k="Afbuiging nodig δ" v={`${f(ev.turn! / DEG, 1)}°`} />
        <KV k="Max. gratis afbuiging" v={`${f(ev.turnMax! / DEG, 1)}°`} />
        <KV k="Periapsis-hoogte" v={`${(g.rp - b.radius).toFixed(0)} km`} />
        <KV k="Snelheid in periapsis" v={`${f(g.vp)} km/s`} />
        <KV k="Winst door de planeet" v={`${gain >= 0 ? '+' : '−'}${f(Math.abs(gain))} km/s`} strong />
        <KV k="Motor-Δv tijdens flyby" v={free ? 'geen (gratis)' : `${f(ev.dv, 3)} km/s`} strong />
        <KV k="Duur in beeld" v={fmtDuration(2 * tWin)} />
        <Tex block tex={`\\delta_{max} = 2\\arcsin\\frac{1}{1 + r_p v_\\infty^2/\\mu}`} />
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" onClick={() => openCloseup(sol, k)}>Herhaal passage</Button>
          <Button size="sm" variant="ghost" onClick={closeCloseup}>Terug</Button>
        </div>
      </CardContent>
    </Card>
  )
}
