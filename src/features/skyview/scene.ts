// Astronomy glue of the Sky view (no DOM): Sun / Moon / planet / dwarf planet / satellite positions in the horizon frame, Saturn's rings and the
// Galilean moons, meteor radiants, object descriptions (rise / transit / set, distance) and object search.
// Heavy lifting lives in ../tonight/sky.ts, ../satellites and ./geom.ts.
import { AU, DEG, RE, bodyState, ecl2eq, mul, norm, sub } from '../../lib/astro.ts'
import { createStore } from '../../lib/mini-store.ts'
import { t } from '../../lib/i18n.ts'
import { settings } from '../../lib/settings.ts'
import { PLANETS, altAzOf, bodyAltAz, jdeOf, moonPhaseAt, moonVecJDE, phaseAngle, planetMag, planetPos, precess, separation, sunApparentJDE, sunVecJDE, type PlanetId, type Site } from '../tonight/sky.ts'
import { lookAt, isSunlit, sunAt, temeAt } from '../satellites/orbit.ts'
import { satrecOf, type SatRecord } from '../satellites/tle.ts'
import type { SatRec } from '../satellites/sgp4.ts'
import { loadGroup } from '../satellites/data.ts'
import { conIndexAt, loadSky, spectralClass, type SkyData } from './skydata.ts'
import { applyM, horizonMatrix, hzAltAz, hzVec, radecVec, riseTransitSet, type RTS, type V3 } from './geom.ts'
import { galileanMoons, JUPITER_RADIUS_KM, AU_KM, type JupMoon } from './jupmoons.ts'

export type DwarfId = 'ceres' | 'pluto'
export type Obj =
  | { k: 'star'; i: number } | { k: 'sun' } | { k: 'moon' } | { k: 'planet'; id: PlanetId } | { k: 'dwarf'; id: DwarfId }
  | { k: 'dso'; i: number } | { k: 'sat'; norad: number } | { k: 'con'; i: number }
export const objKey = (o: Obj | null) => (!o ? '' : o.k === 'star' || o.k === 'dso' || o.k === 'con' ? `${o.k}${o.i}` : o.k === 'planet' ? `p${o.id}` : o.k === 'dwarf' ? `d${o.id}` : o.k === 'sat' ? `s${o.norad}` : o.k)

export const PLANET_COLOR: Record<PlanetId, string> = { mercury: '#c8c4bc', venus: '#fff4d0', mars: '#ff9a6c', jupiter: '#f6e2bd', saturn: '#ecd9a0', uranus: '#a8eef2', neptune: '#86a8ff' }
export const DWARFS: { id: DwarfId; name: string; H: number; G: number; radiusKm: number }[] = [
  { id: 'ceres', name: 'Ceres', H: 3.34, G: 0.12, radiusKm: 469.7 }, { id: 'pluto', name: 'Pluto', H: -0.45, G: 0.15, radiusKm: 1188.3 },
]
/** Equatorial radii, km (IAU 2015 nominal values). */
export const PLANET_RADIUS_KM: Record<PlanetId, number> = { mercury: 2439.7, venus: 6051.8, mars: 3396.2, jupiter: 71492, saturn: 60268, uranus: 25559, neptune: 24764 }
/** North poles, J2000 (RA, Dec in degrees; IAU WGCCRE 2009), as unit vectors. */
export const POLES: Record<PlanetId | 'moon', V3> = {
  mercury: radecVec(281.01, 61.41), venus: radecVec(272.76, 67.16), mars: radecVec(317.68, 52.89), jupiter: radecVec(268.057, 64.495),
  saturn: radecVec(40.589, 83.537), uranus: radecVec(257.311, -15.175), neptune: radecVec(299.36, 43.46), moon: radecVec(266.86, 65.64),
}
export const CELESTIAL_POLE: V3 = [0, 0, 1]

export interface BodyPos { alt: number; az: number; hv: V3; mag: number; /** angular radius, degrees */ radius: number }
export interface PlanetBody extends BodyPos {
  id: PlanetId
  /** fraction of the disc lit, 0..1 */ illum: number
  /** geocentric distance, AU */ d: number
  /** angle Sun-planet-Earth, degrees */ phase: number
  /** elongation from the Sun, degrees */ elong: number
  /** Saturn: angle (deg) of the Sun-lit ring plane above the line of sight (sub-Earth ring latitude); 0 for the others */ ringB: number
}
export interface Bodies {
  sunAlt: number
  sun: BodyPos
  moon: BodyPos & { illum: number; elong: number; waxing: boolean; distKm: number; idx: number }
  planets: PlanetBody[]
  dwarfs: (BodyPos & { id: DwarfId; name: string; d: number })[]
  /** Io, Europa, Ganymede, Callisto relative to Jupiter (Jupiter radii: x west, y north of the pole, z towards the Earth) */
  jupMoons: JupMoon[]
}
const pos = (alt: number, az: number, mag: number, radius: number): BodyPos => ({ alt, az, hv: hzVec(alt, az), mag, radius })
const radiusDeg = (km: number, distKm: number) => Math.asin(Math.min(1, km / distKm)) / DEG

export function computeBodies(ms: number, site: Site): Bodies {
  const s = bodyAltAz('sun', ms, site), m = bodyAltAz('moon', ms, site), ph = moonPhaseAt(ms)
  const phaseDeg = Math.acos(2 * ph.illum - 1) / DEG
  let jupMoons: JupMoon[] = []
  const planets = PLANETS.map((id): PlanetBody => {
    const p = planetPos(id, ms), a = altAzOf(mul(p.vec, AU), ms, site), ph2 = phaseAngle(p)
    const u = mul(p.vecJ, 1 / (norm(p.vecJ) || 1))
    let ringB = 0
    if (id === 'saturn') { const n = POLES.saturn; ringB = Math.asin(-(u[0] * n[0] + u[1] * n[1] + u[2] * n[2])) / DEG }
    if (id === 'jupiter') jupMoons = galileanMoons(jdeOf(ms) - p.d / 173, u)
    const elong = Math.acos(Math.max(-1, Math.min(1, (p.R * p.R + p.d * p.d - p.r * p.r) / (2 * p.R * p.d)))) / DEG
    return { id, ...pos(a.alt, a.az, planetMag(id, p), radiusDeg(PLANET_RADIUS_KM[id], p.d * AU)), illum: (1 + Math.cos(ph2 * DEG)) / 2, d: p.d, phase: ph2, elong, ringB }
  })
  const dwarfs = DWARFS.map((dw) => {
    const q = smallPos(dw.id, ms), a = altAzOf(mul(q.vec, AU), ms, site)
    const al = q.phase * DEG, tn = Math.tan(al / 2)
    const phi = (1 - dw.G) * Math.exp(-3.33 * tn ** 0.63) + dw.G * Math.exp(-1.87 * tn ** 1.22)
    const mag = dw.H + 5 * Math.log10(q.r * q.d) - 2.5 * Math.log10(Math.max(phi, 1e-3))
    return { id: dw.id, name: dw.name, d: q.d, ...pos(a.alt, a.az, mag, radiusDeg(dw.radiusKm, q.d * AU)) }
  })
  return {
    sunAlt: s.alt,
    sun: pos(s.alt, s.az, -26.7, 0.267),
    moon: { ...pos(m.alt, m.az, -12.74 + 0.026 * phaseDeg + 4e-9 * phaseDeg ** 4, Math.asin(1737.4 / ph.distKm) / DEG), illum: ph.illum, elong: ph.elong, waxing: ph.waxing, distKm: ph.distKm, idx: ph.idx },
    planets, dwarfs, jupMoons,
  }
}
/** Geocentric position of Ceres / Pluto (Keplerian elements of the app, light time, precession to the date), AU. */
function smallPos(id: DwarfId, ms: number) {
  const jde = jdeOf(ms), tt = (jde - 2451545) * 86400
  const earth = bodyState('earth', tt).r
  let g = sub(bodyState(id, tt).r, earth)
  const p = bodyState(id, tt - norm(g) / 299792.458).r
  g = sub(p, earth)
  const eq = ecl2eq(g), r = norm(p) / AU, d = norm(g) / AU, R = norm(earth) / AU
  return { vec: mul(precess(eq, (jde - 2451545) / 36525), 1 / AU), vecJ: mul(eq, 1 / AU), r, d, R, phase: Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)))) / DEG }
}

// ---------- meteor radiants (IMO working list; positions at the peak, drift ignored) ----------
/** radiant RA/Dec J2000 in degrees, activity half-width in degrees of solar longitude; peak longitude = SHOWERS in ../tonight/events.ts */
export const RADIANTS: { id: string; ra: number; dec: number; lon: number; hw: number }[] = [
  { id: 'quadrantids', ra: 230, dec: 49, lon: 283.15, hw: 2 }, { id: 'lyrids', ra: 271, dec: 34, lon: 32.32, hw: 5 }, { id: 'etaAquariids', ra: 338, dec: -1, lon: 45.5, hw: 12 },
  { id: 'perseids', ra: 48, dec: 58, lon: 140, hw: 10 }, { id: 'orionids', ra: 95, dec: 16, lon: 208, hw: 12 }, { id: 'leonids', ra: 152, dec: 22, lon: 235.27, hw: 6 }, { id: 'geminids', ra: 112, dec: 33, lon: 262.2, hw: 9 },
]
/** Showers whose activity window contains the moment: strength 0..1 (1 at the peak). */
export function activeShowers(ms: number): { id: string; ra: number; dec: number; strength: number }[] {
  const lon = sunApparentJDE(jdeOf(ms)).lon - 0.36 // IMO longitudes are J2000
  return RADIANTS.flatMap((r) => { const d = Math.abs(((lon - r.lon + 540) % 360) - 180); return d < r.hw ? [{ id: r.id, ra: r.ra, dec: r.dec, strength: 1 - d / r.hw }] : [] })
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
  /** RA/Dec of the date (precessed), degrees */ raD?: number; decD?: number
  /** constellation containing the position */ conName?: string
  /** apparent size: arc-seconds for solar-system bodies (diameter), arc-minutes (major, minor) for deep-sky objects */ diamArcsec?: number; sizeArcmin?: [number, number]
  spec?: string; hd?: string; flam?: string; vr?: string; designations?: string[]; sb?: number; moonAgeNote?: string; phaseDeg?: number; altId?: string
}
const lang = () => settings.get().lang
export const conName = (c: SkyData['cons'][number]) => { const l = lang(); return l === 'nl' ? c.nl : l === 'el' ? c.el : c.en }
export const starTitle = (n: SkyData['names'][number], hip: number) => {
  if (!n) return `HIP ${hip}`
  const l = lang()
  return (l === 'el' && n.el) || n.name || (n.bayer ? `${n.bayer} ${n.con}` : n.flam ? `${n.flam} ${n.con}` : n.vr ? `${n.vr} ${n.con}` : `HIP ${hip}`)
}
export const DSO_TYPE: Record<string, string> = { g: 'galaxy', s: 'galaxy', s0: 'galaxy', e: 'galaxy', i: 'galaxy', sd: 'galaxy', gg: 'galaxy', oc: 'cluster', gc: 'globular', pn: 'planetary', bn: 'nebula', en: 'nebula', rn: 'nebula', sfr: 'nebula', dn: 'nebula', snr: 'snr' }

/** RA / Dec (degrees) of a unit vector of the J2000 frame, precessed to the date. */
export function raDecOfDate(v: V3, ms: number): { ra: number; dec: number } {
  const p = precess(v, (jdeOf(ms) - 2451545) / 36525)
  return { ra: (Math.atan2(p[1], p[0]) / DEG + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, p[2]))) / DEG }
}

export function objectAltAz(o: Obj, ms: number, site: Site, b: Bodies, sats: SatPos[] = []): { alt: number; az: number } | null {
  const d = skyCtx.data
  switch (o.k) {
    case 'sun': return b.sun
    case 'moon': return b.moon
    case 'planet': return b.planets.find((p) => p.id === o.id) ?? null
    case 'dwarf': return b.dwarfs.find((p) => p.id === o.id) ?? null
    case 'sat': return sats.find((s) => s.norad === o.norad) ?? null
    case 'star': case 'dso': case 'con': {
      if (!d) return null
      const v: V3 = o.k === 'star' ? [d.vec[o.i * 3], d.vec[o.i * 3 + 1], d.vec[o.i * 3 + 2]] : o.k === 'dso' ? d.dsos[o.i].vec : d.cons[o.i].vec
      return hzAltAz(applyM(horizonMatrix(ms, site.lat, site.lon), v))
    }
  }
}

/** J2000 equatorial coordinates of a solar-system body now (from its geocentric vector of date, un-precessed is close enough for display: < 0.4 deg, so use the of-date values for the card). */
function ofDate(vecOfDate: V3) { return { ra: (Math.atan2(vecOfDate[1], vecOfDate[0]) / DEG + 360) % 360, dec: Math.asin(vecOfDate[2] / norm(vecOfDate)) / DEG } }

/** Everything the info card shows. Sats come from the live list (`computeSats`). */
export function describe(o: Obj, ms: number, site: Site, b: Bodies, sats: SatPos[]): Info | null {
  const d = skyCtx.data, aa = objectAltAz(o, ms, site, b, sats)
  if (!aa) return null
  const base = { obj: o, kind: o.k, alt: aa.alt, az: aa.az }
  const fixedRts = (v: V3) => riseTransitSet((x) => hzAltAz(applyM(horizonMatrix(x, site.lat, site.lon), v)).alt, ms, -0.5667)
  const jde = jdeOf(ms), T = (jde - 2451545) / 36525
  const conOf = (ra: number, dec: number) => { if (!d) return undefined; const i = conIndexAt(d, ra, dec); return i >= 0 ? conName(d.cons[i]) : undefined }
  const solarEq = (vecOfDate: V3) => { const e = ofDate(vecOfDate); const j = precess(vecOfDate, -T); const jj = { ra: (Math.atan2(j[1], j[0]) / DEG + 360) % 360, dec: Math.asin(j[2] / norm(j)) / DEG }; return { raD: e.ra, decD: e.dec, ra: jj.ra, dec: jj.dec } }
  if (o.k === 'sun') {
    const e = solarEq(sunVecJDE(jde) as V3)
    return { ...base, title: t('sky.p.sun'), sub: '', mag: -26.7, distKm: AU, diamArcsec: 2 * b.sun.radius * 3600, rts: riseTransitSet((x) => bodyAltAz('sun', x, site).alt, ms, -0.833), rtsH0: -0.833, ...e, conName: conOf(e.ra, e.dec) }
  }
  if (o.k === 'moon') {
    const e = solarEq(moonVecJDE(jde) as V3)
    return { ...base, title: t('sky.p.moon'), sub: t(`sky.phase.${b.moon.idx}`), mag: b.moon.mag, distKm: b.moon.distKm, illum: b.moon.illum, phaseIdx: b.moon.idx, diamArcsec: 2 * b.moon.radius * 3600, elongSun: b.moon.elong, rts: riseTransitSet((x) => bodyAltAz('moon', x, site).alt, ms, -0.833), rtsH0: -0.833, ...e, conName: conOf(e.ra, e.dec) }
  }
  if (o.k === 'planet') {
    const p = planetPos(o.id, ms), bp = b.planets.find((x) => x.id === o.id)!
    const e = solarEq(p.vec)
    return { ...base, title: t(`sky.p.${o.id}`), sub: '', mag: bp.mag, distKm: p.d * AU, illum: bp.illum, diamArcsec: 2 * bp.radius * 3600, elongSun: bp.elong, phaseDeg: bp.phase, rts: riseTransitSet((x) => bodyAltAz(o.id, x, site).alt, ms, -0.5667), rtsH0: -0.5667, ...e, conName: conOf(e.ra, e.dec) }
  }
  if (o.k === 'dwarf') {
    const dw = b.dwarfs.find((x) => x.id === o.id)!, q = smallPos(o.id, ms)
    const e = solarEq(q.vec)
    return { ...base, title: dw.name, sub: t('sv.k.dwarf'), mag: dw.mag, distKm: q.d * AU, illum: (1 + Math.cos(q.phase * DEG)) / 2, diamArcsec: 2 * dw.radius * 3600, phaseDeg: q.phase, rts: fixedRts(q.vecJ.map((x) => x / norm(q.vecJ)) as V3), rtsH0: -0.5667, ...e, conName: conOf(e.ra, e.dec) }
  }
  if (o.k === 'sat') {
    const s = sats.find((x) => x.norad === o.norad)!
    return { ...base, title: s.name, sub: '', sunlit: s.sunlit, rangeKm: s.rangeKm, heightKm: s.heightKm, speedKms: s.speedKms }
  }
  if (!d) return null
  if (o.k === 'star') {
    const n = d.names[o.i], hip = d.hip[o.i]
    const v: V3 = [d.vec[o.i * 3], d.vec[o.i * 3 + 1], d.vec[o.i * 3 + 2]], od = raDecOfDate(v, ms)
    const des: string[] = []
    if (n?.bayer) des.push(`${n.bayer} ${n.con}`)
    if (n?.flam) des.push(`${n.flam} ${n.con}`)
    if (n?.vr) des.push(`${n.vr} ${n.con}`)
    des.push(`HIP ${hip}`)
    if (n?.hd) des.push(`HD ${n.hd}`)
    return { ...base, title: starTitle(n, hip), sub: des.filter((x) => x !== starTitle(n, hip)).slice(0, 2).join(' · '), designations: des, mag: d.mag[o.i], bv: d.bv[o.i], spec: spectralClass(d.bv[o.i]), hd: n?.hd, vr: n?.vr, distLy: n?.ly || undefined, ra: d.ra[o.i], dec: d.dec[o.i], raD: od.ra, decD: od.dec, conName: conOf(d.ra[o.i], d.dec[o.i]), rts: fixedRts(v), rtsH0: -0.5667 }
  }
  if (o.k === 'dso') {
    const x = d.dsos[o.i], l = lang(), od = raDecOfDate(x.vec, ms)
    return { ...base, title: (l === 'el' && x.el) || x.name || x.id, sub: [x.name ? x.id : '', x.alt].filter(Boolean).join(' · '), altId: x.alt, typeKey: DSO_TYPE[x.type] ?? 'nebula', mag: x.mag < 90 ? x.mag : undefined, ra: x.ra, dec: x.dec, raD: od.ra, decD: od.dec, conName: conOf(x.ra, x.dec), sizeArcmin: x.maj ? [x.maj, x.min] : undefined, sb: Number.isFinite(x.sb) ? x.sb : undefined, rts: fixedRts(x.vec), rtsH0: -0.5667 }
  }
  const c = d.cons[o.i]
  return { ...base, title: conName(c), sub: c.la, ra: c.ra, dec: c.dec, rts: fixedRts(c.vec), rtsH0: -0.5667 }
}

// ---------- search ----------
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ')
const squash = (s: string) => fold(s).replace(/\s+/g, '')
export interface Found { label: string; sub: string; obj: Obj }
let hipMap: Map<number, number> | null = null
export function searchObjects(q: string, sats: SatPos[] | SatRef[]): Found[] {
  const s = fold(q.trim()), sq = squash(q)
  if (s.length < 2) return []
  const d = skyCtx.data, out: [number, Found][] = []
  const add = (rank: number, f: Found) => out.push([rank, f])
  const match = (name: string): number => { const n = fold(name), at = n.indexOf(s); return at < 0 ? -1 : n === s ? 0 : at === 0 ? 1 : 2 }
  const bodies: [Obj, string][] = [[{ k: 'sun' }, t('sky.p.sun')], [{ k: 'moon' }, t('sky.p.moon')], ...PLANETS.map((id): [Obj, string] => [{ k: 'planet', id }, t(`sky.p.${id}`)]), ...DWARFS.map((dw): [Obj, string] => [{ k: 'dwarf', id: dw.id }, dw.name])]
  for (const [obj, n] of bodies) { const m = match(n); if (m >= 0) add(m, { label: n, sub: t('sv.k.body'), obj }) }
  if (d) {
    d.names.forEach((n, i) => {
      if (!n) return
      const m = Math.min(...[n.name, n.el, n.bayer && `${n.bayer} ${n.con}`, n.flam && `${n.flam} ${n.con}`, n.hd && `HD ${n.hd}`, n.vr && `${n.vr} ${n.con}`].filter(Boolean).map((x) => match(x as string)).filter((x) => x >= 0).concat(9))
      if (m < 9) add(m + 0.3, { label: starTitle(n, d.hip[i]), sub: `${t('sv.k.star')} · mag ${d.mag[i].toFixed(1)}`, obj: { k: 'star', i } })
    })
    const hm = /^hip\s*(\d{1,6})$/.exec(s)
    if (hm) {
      if (!hipMap) { hipMap = new Map(); for (let i = 0; i < d.n; i++) hipMap.set(d.hip[i], i) }
      const i = hipMap.get(+hm[1])
      if (i != null) add(0.2, { label: starTitle(d.names[i], d.hip[i]), sub: `${t('sv.k.star')} · HIP ${d.hip[i]} · mag ${d.mag[i].toFixed(1)}`, obj: { k: 'star', i } })
    }
    d.cons.forEach((c, i) => {
      const m = Math.min(...[c.nl, c.en, c.el, c.la].map(match).filter((x) => x >= 0).concat(9))
      if (m < 9) add(m + 0.1, { label: conName(c), sub: t('sv.k.con'), obj: { k: 'con', i } })
    })
    d.dsos.forEach((x, i) => {
      const keys = [x.id, x.alt, x.name, x.el].filter(Boolean)
      const m = Math.min(...keys.map((k) => { const a = match(k), b2 = squash(k).startsWith(sq) ? (squash(k) === sq ? 0 : 1) : -1; return a >= 0 && b2 >= 0 ? Math.min(a, b2) : Math.max(a, b2) }).filter((v) => v >= 0).concat(9))
      if (m < 9) add(m + 0.5 + (x.mag < 90 ? x.mag / 100 : 0.2), { label: x.name ? `${x.id} · ${x.name}` : x.alt ? `${x.id} · ${x.alt}` : x.id, sub: t('sv.k.dso'), obj: { k: 'dso', i } })
    })
  }
  for (const sat of sats) { const m = match(sat.name); if (m >= 0) add(m + 0.7, { label: sat.name, sub: t('sv.k.sat'), obj: { k: 'sat', norad: sat.norad } }) }
  return out.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1])
}

export { JUPITER_RADIUS_KM, AU_KM, separation }
