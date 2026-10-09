// Astronomy glue of the Sky view (no DOM): Sun / Moon / planet / satellite positions in the horizon frame, object descriptions
// (rise / transit / set, distance) and object search. Heavy lifting lives in ../tonight/sky.ts, ../satellites and ./geom.ts.
import { AU, DEG, RE, mul, norm } from '../../lib/astro.ts'
import { createStore } from '../../lib/mini-store.ts'
import { t } from '../../lib/i18n.ts'
import { settings } from '../../lib/settings.ts'
import { PLANETS, altAzOf, bodyAltAz, moonPhaseAt, planetMag, planetPos, type PlanetId, type Site } from '../tonight/sky.ts'
import { lookAt, isSunlit, sunAt, temeAt } from '../satellites/orbit.ts'
import { satrecOf, type SatRecord } from '../satellites/tle.ts'
import type { SatRec } from '../satellites/sgp4.ts'
import { loadGroup } from '../satellites/data.ts'
import { applyM, horizonMatrix, hzAltAz, hzVec, riseTransitSet, type RTS, type V3 } from './geom.ts'
import { loadSky, type SkyData } from './skydata.ts'

export type Obj =
  | { k: 'star'; i: number } | { k: 'sun' } | { k: 'moon' } | { k: 'planet'; id: PlanetId }
  | { k: 'dso'; i: number } | { k: 'sat'; norad: number } | { k: 'con'; i: number }
export const objKey = (o: Obj | null) => (!o ? '' : o.k === 'star' || o.k === 'dso' || o.k === 'con' ? `${o.k}${o.i}` : o.k === 'planet' ? `p${o.id}` : o.k === 'sat' ? `s${o.norad}` : o.k)

export const PLANET_COLOR: Record<PlanetId, string> = { mercury: '#c8c4bc', venus: '#fff4d0', mars: '#ff9a6c', jupiter: '#f6e2bd', saturn: '#ecd9a0', uranus: '#a8eef2', neptune: '#86a8ff' }

export interface BodyPos { alt: number; az: number; hv: V3; mag: number; /** angular radius, degrees */ radius: number }
export interface Bodies {
  sunAlt: number
  sun: BodyPos
  moon: BodyPos & { illum: number; elong: number; waxing: boolean; distKm: number; idx: number }
  planets: (BodyPos & { id: PlanetId })[]
}
const pos = (alt: number, az: number, mag: number, radius: number): BodyPos => ({ alt, az, hv: hzVec(alt, az), mag, radius })

export function computeBodies(ms: number, site: Site): Bodies {
  const s = bodyAltAz('sun', ms, site), m = bodyAltAz('moon', ms, site), ph = moonPhaseAt(ms)
  const phaseDeg = Math.acos(2 * ph.illum - 1) / DEG
  const planets = PLANETS.map((id) => {
    const p = planetPos(id, ms), a = altAzOf(mul(p.vec, AU), ms, site)
    return { id, ...pos(a.alt, a.az, planetMag(id, p), 0) }
  })
  return {
    sunAlt: s.alt,
    sun: pos(s.alt, s.az, -26.7, 0.267),
    moon: { ...pos(m.alt, m.az, -12.74 + 0.026 * phaseDeg + 4e-9 * phaseDeg ** 4, Math.asin(1737.4 / ph.distKm) / DEG), illum: ph.illum, elong: ph.elong, waxing: ph.waxing, distKm: ph.distKm, idx: ph.idx },
    planets,
  }
}

// ---------- satellites ----------
export interface SatRef { name: string; norad: number; sr: SatRec }
export interface SatPos { name: string; norad: number; alt: number; az: number; hv: V3; rangeKm: number; heightKm: number; speedKms: number; sunlit: boolean }
export const skyState = createStore({ skyReady: false, satStatus: 'idle' as 'idle' | 'loading' | 'ok' | 'none', satCount: 0 })
export const skyCtx: { data: SkyData | null; sats: SatRef[] } = { data: null, sats: [] }

export async function ensureSky() {
  if (skyCtx.data) return
  skyCtx.data = await loadSky()
  skyState.set({ skyReady: true })
}
/** Bright satellites: space stations + the "visual" list of CelesTrak, from the same cache as the Satellites tab (no extra downloads when fresh). */
export async function ensureSats() {
  if (skyState.get().satStatus !== 'idle') return
  skyState.set({ satStatus: 'loading' })
  try {
    const [a, b] = await Promise.all([loadGroup('stations'), loadGroup('visual')])
    const seen = new Set<number>(), out: SatRef[] = []
    for (const rec of [...(a.data?.sats ?? []), ...(b.data?.sats ?? [])] as SatRecord[]) {
      if (seen.has(rec.norad)) continue
      seen.add(rec.norad)
      const sr = satrecOf(rec)
      if (sr) out.push({ name: rec.name, norad: rec.norad, sr })
    }
    skyCtx.sats = out
    skyState.set({ satStatus: out.length ? 'ok' : 'none', satCount: out.length })
  } catch { skyState.set({ satStatus: 'none' }) }
}

export function computeSats(sats: SatRef[], ms: number, site: Site): SatPos[] {
  const sun = sunAt(ms), out: SatPos[] = []
  for (const s of sats) {
    const st = temeAt(s.sr, ms)
    if (!st) continue
    const l = lookAt(site, st.r, ms)
    out.push({ name: s.name, norad: s.norad, alt: l.el, az: l.az, hv: hzVec(l.el, l.az), rangeKm: l.range, heightKm: norm(st.r) - RE, speedKms: norm(st.v), sunlit: isSunlit(st.r, sun) })
  }
  return out
}

// ---------- describing / locating objects ----------
export interface Info {
  obj: Obj; kind: Obj['k']; title: string; sub: string
  alt: number; az: number; mag?: number
  rts?: RTS | null; rtsH0?: number
  distKm?: number; distLy?: number
  /** kind-specific extras */
  illum?: number; phaseIdx?: number; typeKey?: string; sunlit?: boolean; rangeKm?: number; heightKm?: number; speedKms?: number; ra?: number; dec?: number; bv?: number; con?: string; elongSun?: number
}
const lang = () => settings.get().lang
export const conName = (c: SkyData['cons'][number]) => { const l = lang(); return l === 'nl' ? c.nl : l === 'el' ? c.el : c.en }
export const starTitle = (n: SkyData['names'][number], hip: number) => {
  if (!n) return `HIP ${hip}`
  const l = lang()
  return (l === 'el' && n.el) || n.name || `${n.bayer} ${n.con}`
}
export const DSO_TYPE: Record<string, string> = { g: 'galaxy', oc: 'cluster', gc: 'globular', pn: 'planetary', bn: 'nebula', en: 'nebula', rn: 'nebula', sfr: 'nebula', snr: 'snr', e: 'galaxy', s: 'galaxy', i: 'galaxy', sd: 'galaxy', gx: 'galaxy' }

export function objectAltAz(o: Obj, ms: number, site: Site, b: Bodies, sats: SatPos[] = []): { alt: number; az: number } | null {
  const d = skyCtx.data
  switch (o.k) {
    case 'sun': return b.sun
    case 'moon': return b.moon
    case 'planet': return b.planets.find((p) => p.id === o.id) ?? null
    case 'sat': return sats.find((s) => s.norad === o.norad) ?? null
    case 'star': case 'dso': case 'con': {
      if (!d) return null
      const v: V3 = o.k === 'star' ? [d.vec[o.i * 3], d.vec[o.i * 3 + 1], d.vec[o.i * 3 + 2]] : o.k === 'dso' ? d.dsos[o.i].vec : d.cons[o.i].vec
      return hzAltAz(applyM(horizonMatrix(ms, site.lat, site.lon), v))
    }
  }
}

/** Everything the info card shows. Sats come from the live list (`computeSats`). */
export function describe(o: Obj, ms: number, site: Site, b: Bodies, sats: SatPos[]): Info | null {
  const d = skyCtx.data, aa = objectAltAz(o, ms, site, b, sats)
  if (!aa) return null
  const base = { obj: o, kind: o.k, alt: aa.alt, az: aa.az }
  const fixedRts = (v: V3) => riseTransitSet((x) => hzAltAz(applyM(horizonMatrix(x, site.lat, site.lon), v)).alt, ms, -0.5667)
  if (o.k === 'sun') return { ...base, title: t('sky.p.sun'), sub: '', mag: -26.7, distKm: AU, rts: riseTransitSet((x) => bodyAltAz('sun', x, site).alt, ms, -0.833), rtsH0: -0.833 }
  if (o.k === 'moon') return { ...base, title: t('sky.p.moon'), sub: t(`sky.phase.${b.moon.idx}`), mag: b.moon.mag, distKm: b.moon.distKm, illum: b.moon.illum, phaseIdx: b.moon.idx, rts: riseTransitSet((x) => bodyAltAz('moon', x, site).alt, ms, -0.833), rtsH0: -0.833 }
  if (o.k === 'planet') {
    const p = planetPos(o.id, ms), bp = b.planets.find((x) => x.id === o.id)!
    return { ...base, title: t(`sky.p.${o.id}`), sub: '', mag: bp.mag, distKm: p.d * AU, rts: riseTransitSet((x) => bodyAltAz(o.id, x, site).alt, ms, -0.5667), rtsH0: -0.5667 }
  }
  if (o.k === 'sat') {
    const s = sats.find((x) => x.norad === o.norad)!
    return { ...base, title: s.name, sub: '', sunlit: s.sunlit, rangeKm: s.rangeKm, heightKm: s.heightKm, speedKms: s.speedKms }
  }
  if (!d) return null
  if (o.k === 'star') {
    const n = d.names[o.i]
    return { ...base, title: starTitle(n, d.hip[o.i]), sub: n ? [n.bayer && `${n.bayer} ${n.con}`, `HIP ${d.hip[o.i]}`].filter(Boolean).join(' · ') : '', mag: d.mag[o.i], bv: d.bv[o.i], distLy: n?.ly || undefined, ra: d.ra[o.i], dec: d.dec[o.i], rts: fixedRts([d.vec[o.i * 3], d.vec[o.i * 3 + 1], d.vec[o.i * 3 + 2]]), rtsH0: -0.5667 }
  }
  if (o.k === 'dso') {
    const x = d.dsos[o.i], l = lang()
    return { ...base, title: (l === 'el' && x.el) || x.name || x.id, sub: x.name ? x.id : '', typeKey: DSO_TYPE[x.type] ?? 'nebula', mag: x.mag, ra: x.ra, dec: x.dec, rts: fixedRts(x.vec), rtsH0: -0.5667 }
  }
  const c = d.cons[o.i]
  return { ...base, title: conName(c), sub: c.la, ra: c.ra, dec: c.dec, rts: fixedRts(c.vec), rtsH0: -0.5667 }
}

// ---------- search ----------
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ')
export interface Found { label: string; sub: string; obj: Obj }
export function searchObjects(q: string, sats: SatPos[] | SatRef[]): Found[] {
  const s = fold(q.trim())
  if (s.length < 2) return []
  const d = skyCtx.data, out: [number, Found][] = []
  const add = (rank: number, f: Found) => out.push([rank, f])
  const match = (name: string): number => { const n = fold(name), at = n.indexOf(s); return at < 0 ? -1 : n === s ? 0 : at === 0 ? 1 : 2 }
  const bodies: [Obj, string][] = [[{ k: 'sun' }, t('sky.p.sun')], [{ k: 'moon' }, t('sky.p.moon')], ...PLANETS.map((id): [Obj, string] => [{ k: 'planet', id }, t(`sky.p.${id}`)])]
  for (const [obj, n] of bodies) { const m = match(n); if (m >= 0) add(m, { label: n, sub: t('sv.k.body'), obj }) }
  if (d) {
    d.names.forEach((n, i) => {
      if (!n) return
      const m = Math.min(...[n.name, n.el, `${n.bayer} ${n.con}`].filter(Boolean).map(match).filter((x) => x >= 0).concat(9))
      if (m < 9) add(m + 0.3, { label: starTitle(n, d.hip[i]), sub: `${t('sv.k.star')} · mag ${d.mag[i].toFixed(1)}`, obj: { k: 'star', i } })
    })
    d.cons.forEach((c, i) => {
      const m = Math.min(...[c.nl, c.en, c.el, c.la].map(match).filter((x) => x >= 0).concat(9))
      if (m < 9) add(m + 0.1, { label: conName(c), sub: t('sv.k.con'), obj: { k: 'con', i } })
    })
    d.dsos.forEach((x, i) => {
      const m = Math.min(...[x.id, x.name, x.el].filter(Boolean).map(match).filter((v) => v >= 0).concat(9))
      if (m < 9) add(m + 0.5, { label: x.name ? `${x.id} · ${x.name}` : x.id, sub: t('sv.k.dso'), obj: { k: 'dso', i } })
    })
  }
  for (const sat of sats) { const m = match(sat.name); if (m >= 0) add(m + 0.7, { label: sat.name, sub: t('sv.k.sat'), obj: { k: 'sat', norad: sat.norad } }) }
  return out.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1])
}
