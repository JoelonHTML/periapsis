import { useEffect, useState } from 'react'
import { Pause, Play, Rewind, FastForward, SkipBack, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BODIES, BODY_IDS, dvBudget, fmtDateTime, toJ2000, toMs } from '@/lib/astro'
import { SPEEDS, clock, currentSpeed, fmtSpeed, store, useApp, type Craft } from '@/lib/store'
import { KV, NumField, Section, Tex, f } from './bits'

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const toLocalInput = (t: number) => {
  const d = new Date(toMs(t))
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function TimeBar() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 100)
    return () => clearInterval(id)
  }, [])
  const startT = useApp((s) => s.startT)
  const dir = Math.sign(clock.target) || 1
  const idx = SPEEDS.findIndex((s) => s.s === Math.abs(clock.target))
  const setDir = (d: number) => {
    const i = Math.max(0, idx)
    if (Math.sign(clock.target) === d && !clock.paused) clock.target = d * SPEEDS[Math.min(SPEEDS.length - 1, i + 1)].s
    else clock.target = d * SPEEDS[i].s
    clock.paused = false
  }
  return (
    <Card className="gap-0 py-2.5">
      <CardContent className="flex flex-wrap items-center gap-3 px-3">
        <div className="flex items-center gap-1">
          <Tip label="Terug naar startdatum">
            <Button size="icon" variant="ghost" onClick={() => { clock.t = startT }}><SkipBack /></Button>
          </Tip>
          <Tip label="Terugspoelen (nogmaals = sneller)">
            <Button size="icon" variant={dir < 0 && !clock.paused ? 'secondary' : 'ghost'} onClick={() => setDir(-1)}><Rewind /></Button>
          </Tip>
          <Tip label={clock.paused ? 'Afspelen' : 'Pauzeren'}>
            <Button size="icon" onClick={() => { clock.paused = !clock.paused }}>{clock.paused ? <Play /> : <Pause />}</Button>
          </Tip>
          <Tip label="Vooruitspoelen (nogmaals = sneller)">
            <Button size="icon" variant={dir > 0 && !clock.paused ? 'secondary' : 'ghost'} onClick={() => setDir(1)}><FastForward /></Button>
          </Tip>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={idx >= 0 ? String(idx) : ''}
          onValueChange={(v) => { if (v !== '') { clock.target = dir * SPEEDS[+v].s; clock.paused = false } }}>
          {SPEEDS.map((s, i) => <ToggleGroupItem key={s.s} value={String(i)} className="px-2.5 text-xs">{s.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tabular-nums">{fmtDateTime(clock.t)} UTC</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">tempo {fmtSpeed(clock.paused && Math.abs(currentSpeed()) < 0.05 ? 0 : currentSpeed())}</div>
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Startdatum (UTC)</Label>
            <div className="flex gap-1">
              <Input type="datetime-local" className="h-8 w-[190px]" value={toLocalInput(startT)}
                onChange={(e) => {
                  const ms = new Date(e.target.value).getTime()
                  if (Number.isFinite(ms)) { const t = toJ2000(ms); store.set({ startT: t }); clock.t = t }
                }} />
              <Tip label="Nu">
                <Button size="icon" variant="outline" className="size-8" onClick={() => { const t = toJ2000(Date.now()); store.set({ startT: t }); clock.t = t }}><Clock /></Button>
              </Tip>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ViewCard() {
  const s = useApp((x) => x)
  const followOpts = s.view === 'solar'
    ? [['none', 'Vrij (Zon)'], ...BODY_IDS.map((b) => [b, BODIES[b].name]), ['craft', 'Ruimtevaartuig']]
    : null
  return (
    <Card className="w-64 gap-3 py-3">
      <CardHeader className="px-3"><CardTitle className="text-sm">Weergave</CardTitle></CardHeader>
      <CardContent className="grid gap-2.5 px-3 text-xs">
        <Row label="Ware schaal (planeten)"><Switch checked={s.trueScale} onCheckedChange={(v) => store.set({ trueScale: v })} /></Row>
        {!s.trueScale && (
          <div className="grid gap-1.5">
            <div className="flex justify-between text-muted-foreground"><span>Vergroting</span><span className="tabular-nums">{s.magnify}×</span></div>
            <Slider min={2} max={200} step={1} value={[s.magnify]} onValueChange={([v]) => store.set({ magnify: v })} />
            <p className="text-[10.5px] leading-snug text-muted-foreground">Max 200× zodat de Aarde nooit over Zon–Aarde L1/L2 (1,5 mln km) heen groeit.</p>
          </div>
        )}
        <Row label="Labels"><Switch checked={s.showLabels} onCheckedChange={(v) => store.set({ showLabels: v })} /></Row>
        <Row label="Planetoïdengordel + Trojanen"><Switch checked={s.showBelt} onCheckedChange={(v) => store.set({ showBelt: v })} /></Row>
        <Row label="Lagrangepunten"><Switch checked={s.showLagrange} onCheckedChange={(v) => store.set({ showLagrange: v })} /></Row>
        {followOpts && (
          <div className="grid gap-1">
            <span className="text-muted-foreground">Camera volgt</span>
            <Select value={s.follow} onValueChange={(v) => store.set({ follow: v })}>
              <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{followOpts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span>{label}</span>{children}</div>
}

export function CraftFields() {
  const c = useApp((s) => s.craft)
  const set = (p: Partial<Craft>) => store.set({ craft: { ...c, ...p } })
  const dv = dvBudget(c.dry, c.prop, c.isp)
  return (
    <Section title="Ruimtevaartuig">
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Droge massa" unit="kg" value={c.dry} min={1} onChange={(v) => set({ dry: Math.max(1, v) })} />
        <NumField label="Brandstof" unit="kg" value={c.prop} min={0} onChange={(v) => set({ prop: Math.max(0, v) })} />
        <NumField label="Isp" unit="s" value={c.isp} onChange={(v) => set({ isp: Math.max(1, v) })} />
        <NumField label="Cd" value={c.cd} step={0.1} onChange={(v) => set({ cd: v })} />
        <NumField label="Frontaal opp." unit="m²" value={c.area} step={0.5} onChange={(v) => set({ area: v })} />
      </div>
      <KV k="Δv-budget van de tank (Tsiolkovsky)" v={`${f(dv)} km/s`} strong />
      <Tex block tex={`\\Delta v = I_{sp} g_0 \\ln\\frac{m_0}{m_f} = ${c.isp}\\cdot 9{,}807\\cdot\\ln\\frac{${c.dry + c.prop}}{${c.dry}} = ${(dv * 1000).toFixed(0)}\\ \\text{m/s}`} />
    </Section>
  )
}
