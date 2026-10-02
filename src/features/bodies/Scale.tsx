import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { BODY_LIST, BODY_MAP, AU_KM, bodyName } from './data.ts'
import { fmtAU, fmtNum, fmtRadius } from './format.ts'
import { BodyDisc } from './BodyDisc'

const PRESETS: Record<string, string[]> = {
  planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'],
  rocky: ['mercury', 'venus', 'earth', 'mars', 'moon'],
  giants: ['jupiter', 'saturn', 'uranus', 'neptune', 'earth'],
  moons: ['moon', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'triton', 'enceladus', 'charon', 'phobos'],
  earth: ['earth', 'moon'],
}
const chip = (on: boolean) => `min-h-[44px] shrink-0 rounded-full border px-3 text-xs ${on ? 'border-primary bg-primary/20 text-foreground' : 'border-border text-muted-foreground'}`

export function ScalePanel({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT()
  const [mode, setMode] = useState<'size' | 'dist'>('size')
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['size', 'dist'] as const).map((m) => (
          <Button key={m} role="tab" aria-selected={mode === m} variant={mode === m ? 'secondary' : 'outline'} className="h-11" onClick={() => setMode(m)}>{t(`bod.sc.${m}`)}</Button>
        ))}
      </div>
      {mode === 'size' ? <SizeCompare onOpen={onOpen} /> : <DistanceCompare onOpen={onOpen} />}
    </div>
  )
}

function SizeCompare({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT(), lang = useSettings((s) => s.lang)
  const [sel, setSel] = useState<string[]>(['earth', 'moon', 'jupiter'])
  const [zoom, setZoom] = useState(0) // 0..100, log slider: factor 1 … 60
  const bodies = useMemo(() => sel.map((id) => BODY_MAP[id]).sort((a, b) => a.R - b.R), [sel])
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const maxR = Math.max(1, ...bodies.map((b) => b.R))
  const z = 60 ** (zoom / 100)
  const pxKm = (100 / maxR) * z // the largest selected body has a 100 px radius at zoom 1
  const GAP = 14, MINSLOT = 76, H = 250, CY = 112
  let x = GAP
  const slots = bodies.map((b) => {
    const r = b.R * pxKm, w = Math.max(2 * r, MINSLOT), cx = x + w / 2
    x += w + GAP
    return { b, r, cx }
  })
  const W = Math.max(x, 320)
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {Object.keys(PRESETS).map((p) => (
          <Button key={p} size="sm" variant="outline" className="h-11 px-3 text-xs" onClick={() => setSel(PRESETS[p])}>{t(`bod.sc.p.${p}`)}</Button>
        ))}
        <Button size="sm" variant="ghost" className="h-11 px-3 text-xs" onClick={() => setSel([])}>{t('bod.sc.p.clear')}</Button>
      </div>
      <Section title={t('bod.sc.pick')}>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {BODY_LIST.map((b) => (
            <button key={b.id} type="button" aria-pressed={sel.includes(b.id)} className={`${chip(sel.includes(b.id))} flex items-center gap-1.5`} onClick={() => toggle(b.id)}>
              <BodyDisc id={b.id} size={18} />{bodyName(b.id, lang)}
            </button>
          ))}
        </div>
      </Section>
      <div className="overflow-x-auto rounded-lg border border-border bg-black/30" tabIndex={0}>
        <svg width={W} height={H} role="img" aria-label={t('bod.sc.size')} style={{ display: 'block' }}>
          <defs>
            {bodies.map((b) => (
              <radialGradient key={b.id} id={`bsg-${b.id}`} cx="36%" cy="30%" r="80%">
                <stop offset="0" stopColor={b.color} stopOpacity="1" />
                <stop offset="0.55" stopColor={b.color} stopOpacity="0.92" />
                <stop offset="1" stopColor="#000" stopOpacity="0.55" />
              </radialGradient>
            ))}
            <clipPath id="bsg-clip"><rect x="0" y="0" width={W} height={H - 44} /></clipPath>
          </defs>
          <g clipPath="url(#bsg-clip)">
            {slots.map(({ b, r, cx }) => (
              <g key={b.id} onClick={() => onOpen(b.id)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={CY} r={Math.max(r, 0.8)} fill={`url(#bsg-${b.id})`} />
                {r < 3 && <circle cx={cx} cy={CY} r={9} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 3" />}
              </g>
            ))}
          </g>
          {slots.map(({ b, cx }) => (
            <g key={`l-${b.id}`} onClick={() => onOpen(b.id)} style={{ cursor: 'pointer' }} fill="currentColor" textAnchor="middle">
              <text x={cx} y={H - 26} fontSize="12" fontWeight="600">{bodyName(b.id, lang)}</text>
              <text x={cx} y={H - 10} fontSize="10" opacity="0.65">{fmtRadius(b.R, lang)}</text>
            </g>
          ))}
        </svg>
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        <span className="flex justify-between"><span>{t('bod.sc.zoom')}</span><span className="tabular-nums">×{fmtNum(z, lang)}</span></span>
        <input type="range" min={0} max={100} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="h-11 w-full accent-primary" aria-label={t('bod.sc.zoom')} />
      </label>
      <p className="text-xs text-muted-foreground">{t('bod.sc.hint')}</p>
    </div>
  )
}

const ORBITERS = ['mercury', 'venus', 'earth', 'mars', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
const RANGES = { mars: 1.8, saturn: 10, all: 41 } as const
const ang = (i: number) => (i * 137.5 + 20) * (Math.PI / 180)

function DistanceCompare({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT(), lang = useSettings((s) => s.lang)
  const [log, setLog] = useState(false)
  const [range, setRange] = useState<keyof typeof RANGES>('all')
  const C = 180, RMAX = 164
  const amax = log ? 42 : RANGES[range], amin = 0.3
  const rad = (au: number) => (log ? 16 + (RMAX - 16) * (Math.log(au / amin) / Math.log(amax / amin)) : (au / amax) * RMAX)
  const rings = log ? [0.5, 1, 2, 5, 10, 20, 40] : range === 'mars' ? [0.5, 1, 1.5] : range === 'saturn' ? [2, 4, 6, 8, 10] : [10, 20, 30, 40]
  const items = ORBITERS.map((id, i) => ({ id, au: BODY_MAP[id].a! / AU_KM, th: ang(i) }))
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((l) => <Button key={String(l)} size="sm" variant={log === l ? 'secondary' : 'outline'} className="h-11" onClick={() => setLog(l)}>{t(l ? 'bod.sc.log' : 'bod.sc.lin')}</Button>)}
      </div>
      {!log && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t('bod.sc.range')}</span>
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => <Button key={r} size="sm" variant={range === r ? 'secondary' : 'outline'} className="h-11 px-3 text-xs" onClick={() => setRange(r)}>{t(`bod.sc.r.${r}`)}</Button>)}
        </div>
      )}
      <div className="rounded-lg border border-border bg-black/30">
        <svg viewBox="0 0 360 360" className="block w-full" role="img" aria-label={t('bod.sc.dist')}>
          {rings.map((au) => (
            <g key={au}>
              <circle cx={C} cy={C} r={rad(au)} fill="none" stroke="currentColor" strokeOpacity="0.14" />
              <text x={C + rad(au) * Math.cos(-0.5) + 2} y={C + rad(au) * Math.sin(-0.5)} fontSize="8" fill="currentColor" opacity="0.5">{fmtNum(au, lang)}</text>
            </g>
          ))}
          <circle cx={C} cy={C} r={5} fill="#fbbf24" />
          {items.filter((p) => p.au <= amax * 1.001).map((p) => {
            const r = rad(p.au), x = C + r * Math.cos(p.th), y = C + r * Math.sin(p.th), b = BODY_MAP[p.id]
            const anchorLeft = x > 250
            return (
              <g key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
                <circle cx={C} cy={C} r={r} fill="none" stroke={b.color} strokeOpacity="0.45" />
                <circle cx={x} cy={y} r={14} fill="transparent" />
                <circle cx={x} cy={y} r={4} fill={b.color} />
                {(log || range === 'mars' || r >= 45) && <text x={anchorLeft ? x - 7 : x + 7} y={y + 3} fontSize="10" fill="currentColor" textAnchor={anchorLeft ? 'end' : 'start'}>{bodyName(p.id, lang)}</text>}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">{t(log ? 'bod.sc.distHint.log' : 'bod.sc.distHint.lin')} {t('bod.sc.tapHint')}</p>
      <div className="grid grid-cols-2 gap-x-3">
        {items.map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex min-h-[44px] items-center justify-between gap-2 border-b border-border/50 text-left text-xs">
            <span className="flex items-center gap-2"><BodyDisc id={p.id} size={18} />{bodyName(p.id, lang)}</span>
            <span className="tabular-nums text-muted-foreground">{fmtAU(BODY_MAP[p.id].a!, lang)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
