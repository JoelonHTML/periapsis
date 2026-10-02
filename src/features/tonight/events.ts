// The 12-month agenda: Moon phases, conjunctions, oppositions, greatest elongations, seasons, eclipses, meteor showers.
// Everything except the meteor-shower table is computed from the ephemerides in sky.ts / lunation.ts.
import { AU, DEG, mul, norm, sub } from '../../lib/astro.ts'
import {
  PLANETS, altAzOf, bodyAltAz, eqToEcl, jdeOf, lstDeg, moonPhaseAt, moonVecJDE, obliquityDeg, observerVec,
  planetMag, planetPos, separation, sunVecJDE, type PlanetId, type Site, type SkyBody,
} from './sky.ts'
import {
  eclipsesBetween, phasesBetween, seasonsBetween, timeOfSolarLongitude, type Eclipse, type PhaseKind, type SeasonKind,
} from './lunation.ts'

export type EvKind = 'moon' | 'conj' | 'opp' | 'elong' | 'season' | 'solar' | 'lunar' | 'meteor'
export interface SkyEvent {
  id: string
  kind: EvKind
  /** instant (UT ms) */
  ms: number
  phase?: PhaseKind
  a?: SkyBody
  b?: SkyBody
  /** conjunction: minimum separation (deg) */
  sep?: number
  /** elong: elongation (deg); opp: distance (AU); meteor: ZHR */
  value?: number
  mag?: number
  /** conj/elong: true when the object(s) stand east of the Sun (evening sky) */
  evening?: boolean
  season?: SeasonKind
  eclipse?: Eclipse
  shower?: string
  /** Moon illuminated fraction at this instant (meteor showers, full/new moons) */
  illum?: number
}

// ---------- Meteor showers: static table, IMO meteor shower calendar (peak λ☉ J2000, ZHR, geocentric speed); dates follow from λ☉ ----------
export interface Shower { id: string; lon: number; zhr: number; speed: number; con: string }
export const SHOWER_SOURCE = 'IMO Meteor Shower Calendar (International Meteor Organization)'
export const SHOWERS: Shower[] = [
  { id: 'quadrantids', lon: 283.15, zhr: 80, speed: 41, con: 'boo' },
  { id: 'lyrids', lon: 32.32, zhr: 18, speed: 49, con: 'lyr' },
  { id: 'etaAquariids', lon: 45.5, zhr: 50, speed: 66, con: 'aqr' },
  { id: 'perseids', lon: 140, zhr: 100, speed: 59, con: 'per' },
  { id: 'orionids', lon: 208, zhr: 20, speed: 66, con: 'ori' },
  { id: 'leonids', lon: 235.27, zhr: 15, speed: 71, con: 'leo' },
  { id: 'geminids', lon: 262.2, zhr: 150, speed: 35, con: 'gem' },
]

// ---------- helpers ----------
const H = 3600e3
const datePart = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '')
const wrap180 = (x: number) => ((((x % 360) + 360) % 360) + 180) % 360 - 180

/** Minimise f on [a, b] (unimodal) by ternary search. */
function argmin(f: (t: number) => number, a: number, b: number, it = 30) {
  for (let i = 0; i < it; i++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3
    if (f(m1) < f(m2)) b = m2; else a = m1
  }
  const t = (a + b) / 2
  return { t, v: f(t) }
}

const lonOf = (v: [number, number, number], jde: number) => eqToEcl(v, obliquityDeg(jde)).lon
/** Signed ecliptic longitude of a vector relative to the Sun (deg, +east = evening sky). */
function lonFromSun(v: [number, number, number], t: number) {
  const jde = jdeOf(t)
  return wrap180(lonOf(v, jde) - lonOf(sunVecJDE(jde), jde))
}
const MIN_ELONG = 12 // closer to the Sun than this and a pair cannot be seen

// ---------- the scan ----------
export function buildEvents(startMs: number, months = 12): SkyEvent[] {
  const endD = new Date(startMs); endD.setUTCMonth(endD.getUTCMonth() + months)
  const endMs = endD.getTime()
  const out: SkyEvent[] = []

  // Moon phases
  for (const p of phasesBetween(startMs, endMs))
    out.push({ id: `moon:${p.kind}:${datePart(p.ms)}`, kind: 'moon', ms: p.ms, phase: p.kind, illum: moonPhaseAt(p.ms).illum })

  // Seasons
  for (const s of seasonsBetween(startMs, endMs)) out.push({ id: `season:${s.kind}:${datePart(s.ms)}`, kind: 'season', ms: s.ms, season: s.kind })

  // Eclipses
  for (const e of eclipsesBetween(startMs, endMs))
    out.push({ id: `${e.type}:${e.kind}:${datePart(e.ms)}`, kind: e.type, ms: e.ms, eclipse: e, illum: e.type === 'lunar' ? 1 : 0 })

  // Meteor showers
  for (let y = new Date(startMs).getUTCFullYear(); y <= new Date(endMs).getUTCFullYear(); y++)
    for (const s of SHOWERS) {
      const ms = timeOfSolarLongitude(y, s.lon)
      if (ms >= startMs && ms <= endMs) out.push({ id: `meteor:${s.id}:${datePart(ms)}`, kind: 'meteor', ms, shower: s.id, value: s.zhr, illum: moonPhaseAt(ms).illum })
    }

  // Planet grid (12 h)
  const step = 12 * H
  const n = Math.floor((endMs - startMs) / step) + 1
  const ts = Array.from({ length: n }, (_, i) => startMs + i * step)
  const pos = PLANETS.map((id) => ts.map((t) => planetPos(id, t).vec))
  const rel = PLANETS.map((_, k) => ts.map((t, i) => lonFromSun(pos[k][i], t)))

  // Planet-planet conjunctions (< 2 deg), both at least MIN_ELONG from the Sun
  for (let a = 0; a < PLANETS.length; a++)
    for (let b = a + 1; b < PLANETS.length; b++) {
      const s = ts.map((_, i) => separation(pos[a][i], pos[b][i]))
      for (let i = 1; i + 1 < n; i++) {
        if (!(s[i] < s[i - 1] && s[i] <= s[i + 1]) || s[i] > 4) continue
        const f = (t: number) => separation(planetPos(PLANETS[a], t).vec, planetPos(PLANETS[b], t).vec)
        const m = argmin(f, ts[i - 1], ts[i + 1])
        if (m.v >= 2 || m.t < startMs || m.t > endMs) continue
        const ra = lonFromSun(planetPos(PLANETS[a], m.t).vec, m.t), rb = lonFromSun(planetPos(PLANETS[b], m.t).vec, m.t)
        if (Math.abs(ra) < MIN_ELONG || Math.abs(rb) < MIN_ELONG) continue
        out.push({ id: `conj:${PLANETS[a]}-${PLANETS[b]}:${datePart(m.t)}`, kind: 'conj', ms: Math.round(m.t), a: PLANETS[a], b: PLANETS[b], sep: m.v, evening: ra > 0 })
      }
    }

  // Oppositions (outer planets) and greatest elongations (Mercury, Venus)
  PLANETS.forEach((id, k) => {
    if (id === 'mercury' || id === 'venus') {
      const el = ts.map((_, i) => Math.abs(rel[k][i]))
      for (let i = 1; i + 1 < n; i++) {
        if (!(el[i] > el[i - 1] && el[i] >= el[i + 1])) continue
        const f = (t: number) => -separation(planetPos(id, t).vec, sunVecJDE(jdeOf(t)))
        const m = argmin(f, ts[i - 1], ts[i + 1])
        if (m.t < startMs || m.t > endMs) continue
        out.push({ id: `elong:${id}:${datePart(m.t)}`, kind: 'elong', ms: Math.round(m.t), a: id, value: -m.v, evening: lonFromSun(planetPos(id, m.t).vec, m.t) > 0, mag: planetMag(id, planetPos(id, m.t)) })
      }
    } else {
      for (let i = 0; i + 1 < n; i++) {
        const d0 = wrap180(rel[k][i] + 180), d1 = wrap180(rel[k][i + 1] + 180) // 0 at opposition
        if (Math.abs(d0) > 60 || Math.abs(d1) > 60 || (d0 < 0) === (d1 < 0)) continue
        let lo = ts[i], hi = ts[i + 1]
        for (let it = 0; it < 30; it++) {
          const mid = (lo + hi) / 2
          if ((wrap180(lonFromSun(planetPos(id, mid).vec, mid) + 180) < 0) === (d0 < 0)) lo = mid; else hi = mid
        }
        const t = Math.round((lo + hi) / 2), p = planetPos(id, t)
        out.push({ id: `opp:${id}:${datePart(t)}`, kind: 'opp', ms: t, a: id, value: p.d, mag: planetMag(id, p) })
      }
    }
  })

  // Moon - planet conjunctions (< 3 deg, geocentric), Mercury..Saturn, planet at least MIN_ELONG from the Sun
  const mstep = 2 * H
  const nm = Math.floor((endMs - startMs) / mstep) + 1
  const naked: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn']
  const mt = Array.from({ length: nm }, (_, i) => startMs + i * mstep)
  const mv = mt.map((t) => moonVecJDE(jdeOf(t)))
  for (const id of naked) {
    const s = mt.map((t, i) => separation(mv[i], planetPos(id, t).vec))
    for (let i = 1; i + 1 < nm; i++) {
      if (!(s[i] < s[i - 1] && s[i] <= s[i + 1]) || s[i] > 5) continue
      const f = (t: number) => separation(moonVecJDE(jdeOf(t)), planetPos(id, t).vec)
      const m = argmin(f, mt[i - 1], mt[i + 1], 24)
      if (m.v >= 3 || m.t < startMs || m.t > endMs) continue
      const r = lonFromSun(planetPos(id, m.t).vec, m.t)
      if (Math.abs(r) < MIN_ELONG) continue
      out.push({ id: `conj:moon-${id}:${datePart(m.t)}`, kind: 'conj', ms: Math.round(m.t), a: 'moon', b: id, sep: m.v, evening: r > 0, illum: moonPhaseAt(m.t).illum })
    }
  }

  return out.sort((x, y) => x.ms - y.ms)
}

// ---------- Local circumstances ----------
export interface LocalView {
  /** altitude of the body (the lower of the two for a pair) and of the Sun at the event instant */
  alt: number
  sunAlt: number
  state: 'ok' | 'day' | 'below'
}
/** Is a conjunction / opposition / elongation observable from here at its instant? (Sun lower than -4 deg and body above the horizon.) */
export function localView(ev: SkyEvent, site: Site): LocalView | null {
  if (!ev.a) return null
  const bodies = [ev.a, ...(ev.b ? [ev.b] : [])]
  const alt = Math.min(...bodies.map((b) => bodyAltAz(b, ev.ms, site).alt))
  const sunAlt = bodyAltAz('sun', ev.ms, site).alt
  return { alt, sunAlt, state: alt <= 0 ? 'below' : sunAlt > -4 ? 'day' : 'ok' }
}

const rSun = 695700, rMoon = 1737.4
function discOverlap(rs: number, rm: number, d: number) {
  if (d >= rs + rm) return 0
  if (d <= Math.abs(rs - rm)) return rm < rs ? (rm / rs) ** 2 : 1
  const a = rs * rs * Math.acos((d * d + rs * rs - rm * rm) / (2 * d * rs)) + rm * rm * Math.acos((d * d + rm * rm - rs * rs) / (2 * d * rm))
  const k = 0.5 * Math.sqrt((-d + rs + rm) * (d + rs - rm) * (d - rs + rm) * (d + rs + rm))
  return (a - k) / (Math.PI * rs * rs)
}

export interface SolarVis {
  /** the Sun is partly covered somewhere between sunrise and sunset */
  visible: boolean
  /** instant of greatest local eclipse while the Sun is up, magnitude (fraction of the solar diameter covered, >= 1 means total/annular), obscuration (area fraction) */
  ms: number
  mag: number
  obsc: number
  sunAlt: number
  /** the global greatest-eclipse instant is itself below your horizon (the eclipse is cut off by sunrise/sunset) */
  cutOff: boolean
}
/** Local solar-eclipse circumstances from the Sun and Moon ephemerides: scan +-4 h around the global maximum in 1-minute steps. */
export function solarVisibility(e: Eclipse, site: Site): SolarVis {
  let best: SolarVis = { visible: false, ms: e.ms, mag: 0, obsc: 0, sunAlt: -90, cutOff: false }
  for (let t = e.ms - 4 * H; t <= e.ms + 4 * H; t += 60000) {
    const lst = lstDeg(t, site.lon)
    const obs = observerVec(site, lst)
    const jde = jdeOf(t)
    const sun = sub(mul(sunVecJDE(jde), AU), obs), moon = sub(moonVecJDE(jde), obs)
    const sa = altAzOf(mul(sunVecJDE(jde), AU), t, site).alt
    if (sa < -0.83) continue
    const sep = separation(sun, moon)
    const rs = Math.asin(rSun / norm(sun)) / DEG, rm = Math.asin(rMoon / norm(moon)) / DEG
    const mag = (rs + rm - sep) / (2 * rs)
    if (mag > best.mag) best = { visible: mag > 0, ms: t, mag, obsc: discOverlap(rs, rm, sep), sunAlt: sa, cutOff: false }
  }
  best.cutOff = best.visible && altAzOf(mul(sunVecJDE(jdeOf(e.ms)), AU), e.ms, site).alt < -0.83
  return best
}

export interface LunarVis {
  /** 'visible': Moon above the horizon at greatest eclipse; 'partial': only the start or end of the eclipse is above the horizon; 'none' */
  state: 'visible' | 'partial' | 'none'
  moonAlt: number
  sunAlt: number
}
export function lunarVisibility(e: Eclipse, site: Site): LunarVis {
  const alt = (t: number) => bodyAltAz('moon', t, site).alt
  const a0 = alt(e.ms), sunAlt = bodyAltAz('sun', e.ms, site).alt
  const half = (e.halfPartial || e.halfPen || 0) * 60000
  const ends = half ? [alt(e.ms - half), alt(e.ms + half)] : []
  const state = a0 > 0 ? 'visible' : ends.some((a) => a > 0) ? 'partial' : 'none'
  return { state, moonAlt: a0, sunAlt }
}
