import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AU, BODIES, DAY, bodyState, fmtDate, fmtDateTime, norm } from '@/lib/astro'
import type { Solution } from '@/lib/mga'
import { clock, closeupEnabled, jumpTo, openCloseup, toggleCloseup, useApp } from '@/lib/store'
import { fmtMet, legSamples, massPlan, missionState, type CraftMass } from '@/lib/telemetry'
import { f } from './bits'

type SeriesId = 'dv' | 'speed' | 'mass' | 'dist'
const SERIES: { id: SeriesId; label: string; color: string; axis: 'L' | 'R' }[] = [
  { id: 'dv', label: 'Δv (cum.)', color: '#fbbf24', axis: 'L' },
  { id: 'speed', label: 'Snelheid', color: '#38bdf8', axis: 'L' },
  { id: 'mass', label: 'Massa', color: '#34d399', axis: 'R' },
  { id: 'dist', label: 'Afstand Zon', color: '#c084fc', axis: 'R' },
]
const H = 228, M = { t: 40, r: 40, b: 30, l: 34 }

/** 1-2-5 axis: nice ticks covering [lo, hi]. */
function scale(lo: number, hi: number, n = 4) {
  const raw = Math.max(hi - lo, 1e-9) / n, mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw * 0.999) ?? 10) * mag
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(+v.toPrecision(10))
  return { lo: a, hi: b, ticks }
}
const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ','))

export function MissionChart({ sol, craft }: { sol: Solution; craft: CraftMass }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(360)
  const [on, setOn] = useState<SeriesId[]>(['dv', 'mass'])
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const cursor = useRef<SVGLineElement>(null)
  const readout = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setActive(null), [sol])

  const plan = useMemo(() => massPlan(sol, craft), [sol, craft])
  const samples = useMemo(() => legSamples(sol), [sol])
  const tof = sol.tof, pw = W - M.l - M.r, ph = H - M.t - M.b
  const x = (t: number) => M.l + ((t - sol.tDep) / tof) * pw
  const tAt = (px: number) => sol.tDep + Math.min(1, Math.max(0, (px - M.l) / pw)) * tof

  // ---- axes ----
  const leftOn = on.filter((s) => s === 'dv' || s === 'speed'), rightId = on.find((s) => s === 'mass' || s === 'dist')
  const maxSpeed = Math.max(...samples.map((s) => s.speed)), maxDist = Math.max(...samples.map((s) => s.rSun)) / AU
  const yl = useMemo(() => {
    const hi = Math.max(leftOn.includes('dv') ? plan.totalDv : 0, leftOn.includes('speed') ? maxSpeed : 0, 0.1)
    return scale(0, hi)
  }, [leftOn.join(), plan.totalDv, maxSpeed])
  const yr = useMemo(() => {
    if (rightId === 'dist') return scale(0, maxDist)
    return scale(0, plan.m0)
  }, [rightId, maxDist, plan.m0])
  const yL = (v: number) => M.t + ph - ((v - yl.lo) / (yl.hi - yl.lo)) * ph
  const yR = (v: number) => M.t + ph - ((v - yr.lo) / (yr.hi - yr.lo)) * ph

  // ---- x axis: years / months / days from launch ----
  const [xu, xd] = tof > 1.5 * 365.25 * DAY ? ['jaar', 365.25 * DAY] as const : tof > 150 * DAY ? ['maanden', 30.4375 * DAY] as const : ['dagen', DAY] as const
  const xs = scale(0, tof / xd, 5).ticks.filter((v) => v <= tof / xd + 1e-9)

  // ---- paths ----
  const step = (pts: [number, number][], y: (v: number) => number) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const dvPts: [number, number][] = [[sol.tDep, 0]]
  plan.steps.forEach((s) => { dvPts.push([s.t, s.cumDv - s.dv], [s.t, s.cumDv]) })
  dvPts.push([sol.tArr, plan.totalDv])
  const massPts: [number, number][] = [[sol.tDep, plan.m0]]
  plan.steps.forEach((s) => { massPts.push([s.t, s.mBefore], [s.t, s.mAfter]) })
  massPts.push([sol.tArr, plan.mFinal])
  const spdPath = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${yL(s.speed).toFixed(1)}`).join('')
  const distPath = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${yR(s.rSun / AU).toFixed(1)}`).join('')

  /** y of the event marker on the first visible curve (value right after the event). */
  const markerY = (k: number) => {
    const e = sol.events[k], s = plan.steps[k]
    if (on.includes('dv')) return yL(s.cumDv)
    if (rightId === 'mass') return yR(s.mAfter)
    if (on.includes('speed')) return yL(e.vHelioOut ?? e.vHelioIn ?? 0)
    if (rightId === 'dist') return yR(norm(bodyState(e.body, e.t).r) / AU)
    return M.t + ph
  }

  // ---- live cursor at clock.t (10 Hz, no React renders) ----
  useEffect(() => {
    const upd = () => {
      const t = clock.t, c = cursor.current
      if (c) {
        const inside = t >= sol.tDep && t <= sol.tArr
        c.setAttribute('visibility', inside ? 'visible' : 'hidden')
        const px = String(x(Math.min(sol.tArr, Math.max(sol.tDep, t))))
        c.setAttribute('x1', px); c.setAttribute('x2', px)
      }
      if (readout.current) {
        const s = missionState(sol, craft, t)
        readout.current.textContent = `Nu: ${fmtDateTime(t)} · ${fmtMet(s.elapsed)} · Δv ${f(s.dvUsed)} km/s · ${s.mass.toFixed(0)} kg · ${f(s.speed, 1)} km/s · ${f(s.rSun / AU)} AU`
      }
    }
    upd()
    const id = setInterval(upd, 100)
    return () => clearInterval(id)
  }, [sol, craft, W])

  const hov = hover ? missionState(sol, craft, hover.t) : null
  const rel = (e: React.MouseEvent) => e.clientX - wrap.current!.getBoundingClientRect().left
  const flybyOn = useApp((s) => (active !== null && sol.events[active]?.kind === 'flyby' ? closeupEnabled(s, sol, active) : false))
  const ev = active !== null ? sol.events[active] : null
  const evName = (k: number) => BODIES[sol.events[k].body].name
  const short = (k: number) => (sol.events[k].kind === 'launch' ? 'Start' : evName(k))

  return (
    <div className="grid gap-2">
      <ToggleGroup type="multiple" size="sm" variant="outline" className="flex-wrap justify-start" value={on}
        onValueChange={(v) => {
          // left axis (km/s) may show Δv and speed together; the right axis shows one of mass / distance
          const added = v.find((x) => !on.includes(x as SeriesId)) as SeriesId | undefined
          const next = (added === 'mass' ? v.filter((x) => x !== 'dist') : added === 'dist' ? v.filter((x) => x !== 'mass') : v) as SeriesId[]
          if (next.length) setOn(next)
        }}>
        {SERIES.map((s) => (
          <ToggleGroupItem key={s.id} value={s.id} className="h-7 gap-1.5 px-2 text-[11px]">
            <span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div ref={wrap} className="relative w-full select-none">
        <svg width={W} height={H} className="block overflow-visible text-[10px]" role="img" aria-label="Grafiek van Δv, massa, snelheid en afstand over de missie">
          {/* grid + axes */}
          {yl.ticks.map((v) => leftOn.length > 0 && (
            <g key={`l${v}`}>
              <line x1={M.l} x2={M.l + pw} y1={yL(v)} y2={yL(v)} className="stroke-border" />
              <text x={M.l - 5} y={yL(v) + 3} textAnchor="end" className="fill-muted-foreground tabular-nums">{fmtTick(v)}</text>
            </g>
          ))}
          {rightId && yr.ticks.map((v) => (
            <text key={`r${v}`} x={M.l + pw + 5} y={yR(v) + 3} className="fill-muted-foreground tabular-nums">{fmtTick(v)}</text>
          ))}
          {leftOn.length > 0 && <text x={M.l} y={M.t - 7} textAnchor="end" className="fill-muted-foreground">km/s</text>}
          {rightId && <text x={M.l + pw} y={M.t - 7} textAnchor="start" fill={SERIES.find((s) => s.id === rightId)!.color}>{rightId === 'mass' ? 'kg' : 'AU'}</text>}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} className="stroke-muted-foreground/50" />
          {xs.map((v) => (
            <g key={`x${v}`}>
              <line x1={x(sol.tDep + v * xd)} x2={x(sol.tDep + v * xd)} y1={M.t + ph} y2={M.t + ph + 3} className="stroke-muted-foreground/50" />
              <text x={x(sol.tDep + v * xd)} y={M.t + ph + 14} textAnchor="middle" className="fill-muted-foreground tabular-nums">{fmtTick(v)}</text>
            </g>
          ))}
          <text x={M.l + pw / 2} y={H - 3} textAnchor="middle" className="fill-muted-foreground">tijd sinds lancering ({xu})</text>

          {/* dry-mass reference */}
          {rightId === 'mass' && craft.dry >= yr.lo && craft.dry <= yr.hi && (
            <g>
              <line x1={M.l} x2={M.l + pw} y1={yR(craft.dry)} y2={yR(craft.dry)} stroke="#34d399" strokeOpacity={0.45} strokeDasharray="3 3" />
              <text x={M.l + pw - 2} y={yR(craft.dry) - 3} textAnchor="end" fill="#34d399" fillOpacity={0.8}>droge massa {craft.dry} kg</text>
            </g>
          )}

          {/* series */}
          {on.includes('speed') && <path d={spdPath} fill="none" stroke={SERIES[1].color} strokeWidth={1.6} strokeLinejoin="round" />}
          {rightId === 'dist' && <path d={distPath} fill="none" stroke={SERIES[3].color} strokeWidth={1.6} strokeLinejoin="round" />}
          {rightId === 'mass' && <path d={step(massPts, yR)} fill="none" stroke={SERIES[2].color} strokeWidth={1.8} strokeLinejoin="round" />}
          {on.includes('dv') && (
            <>
              <path d={`${step(dvPts, yL)}L${x(sol.tArr)},${yL(0)}L${x(sol.tDep)},${yL(0)}Z`} fill={SERIES[0].color} fillOpacity={0.12} />
              <path d={step(dvPts, yL)} fill="none" stroke={SERIES[0].color} strokeWidth={1.8} strokeLinejoin="round" />
            </>
          )}

          {/* event markers: guide line, dot, label in the top margin (two rows so neighbours do not collide) */}
          {sol.events.map((e, k) => {
            const px = x(e.t), py = markerY(k), anchor = k === 0 ? 'start' : k === sol.events.length - 1 ? 'end' : 'middle'
            const row = k % 2 === 0 ? 8 : 20, sel = active === k
            return (
              <g key={k} className="cursor-pointer" onClick={(ev2) => { ev2.stopPropagation(); setActive(k); jumpTo(e.t) }}>
                <line x1={px} x2={px} y1={row + 3} y2={M.t + ph} className="stroke-muted-foreground/40" strokeDasharray="2 3" />
                <text x={px} y={row} textAnchor={anchor} className={sel ? 'fill-foreground font-semibold' : 'fill-foreground/80'}>
                  {short(k)} · {f(e.dv)}
                </text>
                <circle cx={px} cy={py} r={sel ? 5.5 : 4} className={e.kind === 'flyby' ? 'fill-card' : 'fill-foreground'} stroke={SERIES[on.includes('dv') ? 0 : rightId === 'mass' ? 2 : on.includes('speed') ? 1 : 3].color} strokeWidth={2} />
              </g>
            )
          })}

          {/* hover hairline + live cursor (cursor is moved via ref) */}
          {hover && <line x1={hover.x} x2={hover.x} y1={M.t} y2={M.t + ph} className="stroke-foreground/50" />}
          <line ref={cursor} y1={M.t} y2={M.t + ph} strokeWidth={1.5} strokeDasharray="4 2" className="stroke-cyan-400" pointerEvents="none" />
          <rect x={M.l} y={M.t} width={pw} height={ph} fill="transparent" className="cursor-crosshair"
            onMouseMove={(e) => { const px = rel(e); setHover({ x: Math.min(M.l + pw, Math.max(M.l, px)), t: tAt(px) }) }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => jumpTo(tAt(rel(e)))} />
          {/* the transparent rect sits under the markers' hit circles */}
          {sol.events.map((e, k) => (
            <circle key={`h${k}`} cx={x(e.t)} cy={markerY(k)} r={11} fill="transparent" className="cursor-pointer"
              onMouseMove={() => setHover(null)} onClick={() => { setActive(k); jumpTo(e.t) }} />
          ))}
        </svg>

        {hover && hov && (
          <div className="pointer-events-none absolute z-10 w-52 rounded-md border bg-popover px-2 py-1.5 text-[11px] text-popover-foreground shadow-md"
            style={{ top: M.t + 4, left: hover.x > W / 2 ? hover.x - 218 : hover.x + 10 }}>
            <div className="font-medium tabular-nums">{fmtDate(hover.t)} · {fmtMet(hov.elapsed)}</div>
            <div className="tabular-nums text-muted-foreground">
              Δv gebruikt <span className="text-foreground">{f(hov.dvUsed)} km/s</span><br />
              massa <span className="text-foreground">{hov.mass.toFixed(0)} kg</span> ({hov.burned.toFixed(0)} kg verbrand)<br />
              snelheid <span className="text-foreground">{f(hov.speed, 1)} km/s</span> · {f(hov.rSun / AU)} AU
            </div>
          </div>
        )}
      </div>

      <div ref={readout} className="text-[10.5px] leading-snug text-muted-foreground tabular-nums" />

      {ev && active !== null ? (
        <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{ev.kind === 'launch' ? 'Lancering' : ev.kind === 'flyby' ? 'Gravity assist' : 'Aankomst'} — {evName(active)}</span>
            <span className="tabular-nums text-muted-foreground">{fmtDate(ev.t)} · Δv {f(ev.dv, 3)} km/s</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => jumpTo(ev.t)}><Crosshair /> Ga naar tijdstip</Button>
            {ev.kind === 'flyby' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openCloseup(sol, active)}><ScanSearch /> Close-up</Button>}
          </div>
          {ev.kind === 'flyby' && (
            <label className="flex items-center gap-1.5">
              <Checkbox checked={flybyOn} onCheckedChange={() => toggleCloseup(sol, active)} /> Automatisch close-up
            </label>
          )}
        </div>
      ) : (
        <p className="text-[10.5px] text-muted-foreground">Klik in de grafiek om de klok te verzetten; klik een markering voor ‘Ga naar tijdstip’ en ‘Close-up’. Labels = motor-Δv in km/s.</p>
      )}
    </div>
  )
}
