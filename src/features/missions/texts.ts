import { AU, DAY } from '../../lib/astro.ts'
import { SPEEDS } from '../../lib/store.ts'
import { isNode, type Mission, type MissionEvent } from './data.ts'
import { samplePath, type Recon } from './recon.ts'
import type { Lang } from '../../lib/settings.ts'

type T = (key: string, vars?: Record<string, string | number>) => string

export function eventTitle(ev: MissionEvent, t: T, lang: Lang): string {
  if (ev.text) return ev.text[lang]
  const b = ev.body ? t(`rm.body.${ev.body}`) : ''
  if (ev.kind === 'launch') return t('rm.ev.launch')
  if (ev.kind === 'flyby') return t('rm.ev.flyby', { b })
  return ev.orbit ? t('rm.ev.orbit', { b }) : t('rm.ev.arrival', { b })
}

/** "1979-07-09 22:29" (UTC), or "≈ 2025-01-08" when only the day is certain. */
export const fmtEvDate = (ev: MissionEvent) => (ev.approx ? `≈ ${ev.date.slice(0, 10)}` : `${ev.date.slice(0, 10)} ${ev.date.slice(11, 16)}`)

export const missionYears = (m: Mission) => {
  const a = m.events[0].date.slice(0, 4), b = m.events[m.events.length - 1].date.slice(0, 4)
  return a === b ? a : `${a}–${b}`
}

/** Distinct bodies visited after launch, in order, plus non-ephemeris targets. */
export function missionTargets(m: Mission, t: T): string[] {
  const seen: string[] = []
  m.events.forEach((e, i) => {
    if (i === 0 || !isNode(e) || !e.body || e.body === 'earth' || seen.includes(e.body)) return
    seen.push(e.body)
  })
  const names = seen.map((b) => t(`rm.body.${b}`))
  if (m.events.slice(1).some((e) => isNode(e) && e.body === 'earth' && e.kind === 'arrival')) names.push(t('rm.body.earth'))
  return [...names, ...(m.extraTargets ?? [])]
}

/** Solar-view camera framing radius (scene units, 1 unit = 10⁶ km) that fits the whole path. */
export function fitRadius(rc: Recon): number {
  const p = samplePath(rc, 40)
  const r = Math.max(...p.pts.map((x) => Math.hypot(x[0], x[1], x[2])))
  return Math.max(r * 1e-6 * 1.15, 0.5 * AU * 1e-6)
}

/** Clock speed (index into SPEEDS) that plays the whole mission in about a minute. */
export function playSpeed(rc: Recon): number {
  const want = rc.tof / 60
  let best = 3
  for (let i = 3; i < SPEEDS.length; i++) if (Math.abs(Math.log(SPEEDS[i].s / want)) < Math.abs(Math.log(SPEEDS[best].s / want))) best = i
  return best
}

export const daysBetween = (t1: number, t2: number) => Math.round((t2 - t1) / DAY)

const LEG_COLORS = ['#22d3ee', '#c084fc', '#f472b6', '#fbbf24', '#4ade80', '#fb923c', '#60a5fa', '#f87171']
export const legColor = (k: number) => LEG_COLORS[k % LEG_COLORS.length]
