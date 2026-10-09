// Builds the JSON snapshot the Android home-screen widgets read (contract v1). Pure: no DOM, no storage, relative imports only (runs under node --test).
import { compassIdx, skyNight, solarNoon, type NightInfo, type Site } from '../tonight/sky.ts'
import { buildEvents } from '../tonight/events.ts'
import { localISO, parseISO, shiftISO } from '../tonight/fmt.ts'
import * as tonight from '../tonight/texts.ts'
import { findPasses } from '../satellites/passes.ts'
import { satrecOf, type SatRecord } from '../satellites/tle.ts'
import { currentKp, gScale, type KpRow } from '../live/spaceweather.ts'
import type { Launch } from '../live/launches.ts'
import { KP, LABELS, type L } from './texts.ts'

export const NIGHTS = 14
export const DEFAULT_ALPHA = 0.85
export const ACCENT = '#22d3ee'
const DAY = 86400000

const DICT: Record<L, Record<string, string>> = { nl: tonight.nl, en: tonight.en, el: tonight.el }
const tr = (lang: L, key: string, vars?: Record<string, string | number>) => {
  let s = DICT[lang][key] ?? tonight.nl[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]))
  return s
}

export interface SnapshotInput {
  site: Site & { name?: string | null }
  now: number
  lang: L
  alpha?: number
  /** ISS element set from the cached CelesTrak "stations" group (null: no passes). */
  iss?: SatRecord | null
  launches?: Launch[] | null
  kp?: KpRow[] | null
}

const nightOf = (site: Site, iso: string): NightInfo => {
  const a = parseISO(iso), b = parseISO(shiftISO(iso, 1))
  return skyNight(site, solarNoon(a.y, a.m, a.d, site.lon), solarNoon(b.y, b.m, b.d, site.lon))
}

/** ISO date of the current night: today's, unless yesterday's night is still going on (before sunrise). */
function firstNightISO(site: Site, now: number): string {
  const today = localISO(now), yest = shiftISO(today, -1)
  const y = parseISO(yest), d = parseISO(today)
  const n = skyNight(site, solarNoon(y.y, y.m, y.d, site.lon), solarNoon(d.y, d.m, d.d, site.lon))
  return n.sunrise != null && now < n.sunrise ? yest : today
}

export function buildSnapshot(inp: SnapshotInput) {
  const { site, now, lang } = inp
  const name = (id?: string) => tr(lang, `sky.p.${id}`)
  const dir = (az: number) => tr(lang, `sky.dir.${compassIdx(az)}`)
  const iso0 = firstNightISO(site, now)

  const nights = Array.from({ length: NIGHTS }, (_, i) => {
    const n = nightOf(site, shiftISO(iso0, i))
    const start = n.sunset ?? n.start, end = n.sunrise ?? n.end
    const planets = n.planets.filter((p) => p.visible && p.best)
      .sort((a, b) => a.mag - b.mag)
      .map((p) => ({
        id: p.id, name: name(p.id), mag: Math.round(p.mag * 10) / 10, best: Math.round(p.best!.ms), alt: Math.round(p.best!.alt), dir: dir(p.best!.az), aid: p.aid,
        // rise/set are the first crossings of the day, so a planet that sets and rises again can fall outside: clamp around `best`
        from: Math.round(Math.min(p.best!.ms, Math.max(start, p.rise ?? start))), to: Math.round(Math.max(p.best!.ms, Math.min(end, p.set ?? end))),
      }))
    return {
      start: Math.round(start), end: Math.round(end), dusk: n.astro[0], dawn: n.astro[1],
      moon: { illum: Math.round(n.moon.illum * 1000) / 1000, idx: n.moon.idx, waxing: n.moon.waxing, rise: n.moonrise, set: n.moonset },
      planets,
    }
  })

  const events = buildEvents(now, 2).filter((e) => e.ms >= now && e.ms <= now + 30 * DAY).slice(0, 20).map((e) => {
    let title: string
    switch (e.kind) {
      case 'moon': title = tr(lang, `sky.ev.moon.${e.phase}`); break
      case 'season': title = tr(lang, `sky.ev.${e.season}`); break
      case 'conj': title = tr(lang, 'sky.ev.conj', { a: name(e.a), b: name(e.b) }); break
      case 'opp': title = tr(lang, 'sky.ev.opp', { p: name(e.a) }); break
      case 'elong': title = tr(lang, e.evening ? 'sky.ev.elongE' : 'sky.ev.elongW', { p: name(e.a) }); break
      case 'meteor': title = tr(lang, `sky.sh.${e.shower}`); break
      default: title = tr(lang, `sky.ev.${e.kind}.${e.eclipse?.kind}`) // solar | lunar
    }
    return { ms: Math.round(e.ms), kind: e.kind, title }
  })

  const sr = inp.iss ? satrecOf(inp.iss) : null
  const passes = !sr ? [] : findPasses(sr, site, now, 3, 10).filter((x) => x.visible).slice(0, 8).map((x) => ({
    sat: 'ISS', start: x.riseMs, max: x.maxMs, end: x.setMs, maxEl: Math.round(x.maxEl), dir: `${dir(x.riseAz)} → ${dir(x.setAz)}`,
  }))

  const next = (inp.launches ?? []).filter((l) => l.net != null && l.net >= now).sort((a, b) => a.net! - b.net!)[0]
  const launch = next ? { name: next.name, ms: next.net!, provider: next.provider || null } : null

  const row = inp.kp ? currentKp(inp.kp, now) : null
  const g = row ? gScale(row.kp) : 0
  const kw = KP[lang]
  const kp = row ? { value: row.kp, ms: row.t, label: g > 0 ? kw.storm.replace('{n}', String(g)) : row.kp >= 4 ? kw.active : kw.calm } : null

  return {
    v: 1, gen: now, lang,
    site: { lat: site.lat, lon: site.lon, name: site.name || null },
    style: { alpha: Math.min(1, Math.max(0, inp.alpha ?? DEFAULT_ALPHA)), accent: ACCENT },
    labels: LABELS[lang],
    nights, events, passes, launch, kp,
  }
}
export type Snapshot = ReturnType<typeof buildSnapshot>
