// Canvas 2D renderer of the Sky view. One call = one frame: sky colour and glows, Milky Way, grids, IAU boundaries, constellation figures, deep sky,
// up to 41 000 stars (magnitude-sorted, so the loop stops at the current limit), meteor radiants, planets with phases / rings / moons, Moon, Sun,
// satellites, ground. Stars are projected with a single 3x3 matrix and drawn as pixels / small discs (no per-star DOM, no three.js): 60 fps on a mid phone.
import { project, type Cam, type V3, hzVec, D2R } from './geom.ts'
import { applyM } from './geom.ts'
import { live } from './control.ts'
import { PALETTE, galVec, type Dso, type SkyData } from './skydata.ts'
import type { Layers } from './state.ts'
import { objKey, PLANET_COLOR, POLES, CELESTIAL_POLE, conName, activeShowers, type Bodies, type Obj, type SatPos } from './scene.ts'
import { MOON_NAMES } from './jupmoons.ts'
import { discSprite } from './discs.ts'
import { bortleGlow, extinctionMag, nakedEyeLimit, refractVec, refractionBennett, zoomGain } from './optics.ts'
import { t } from '../../lib/i18n.ts'
import type { Lang } from '../../lib/settings.ts'

export interface Hit { x: number; y: number; obj: Obj; pri: number }
export interface Frame {
  w: number; h: number; dpr: number; cam: Cam; M: number[]; data: SkyData; layers: Layers; lang: Lang
  b: Bodies; sats: SatPos[]; sel: Obj | null
  /** localized compass points N, NE, E, SE, S, SW, W, NW */
  compass: string[]
  fov: number
  names: { sun: string; moon: string; planets: Record<string, string> }
}

const P = { x: 0, y: 0 }
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const lerp3 = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const rgb = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const dotv = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const TAU = Math.PI * 2

// Sky colours by Sun altitude: [sunAlt, zenith, horizon]
const SKY: [number, number[], number[]][] = [
  [-18, [2, 4, 10], [5, 9, 20]], [-15, [4, 7, 18], [12, 18, 40]], [-12, [7, 12, 30], [30, 40, 78]], [-9, [14, 24, 58], [78, 70, 106]], [-6, [24, 42, 92], [168, 108, 108]],
  [-3, [38, 66, 128], [236, 140, 96]], [0, [50, 92, 160], [244, 168, 112]], [4, [58, 110, 190], [186, 204, 232]], [15, [60, 120, 205], [160, 206, 240]],
]
function skyColors(sunAlt: number) {
  if (sunAlt <= SKY[0][0]) return { top: SKY[0][1], hor: SKY[0][2] }
  for (let i = 1; i < SKY.length; i++)
    if (sunAlt <= SKY[i][0]) { const k = (sunAlt - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]); return { top: lerp3(SKY[i - 1][1], SKY[i][1], k), hor: lerp3(SKY[i - 1][2], SKY[i][2], k) } }
  const l = SKY[SKY.length - 1]
  return { top: l[1], hor: l[2] }
}

// ---------- cached helpers ----------
const glow: HTMLCanvasElement[] = []
function glowSprite(bucket: number) {
  if (glow[bucket]) return glow[bucket]
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, [r, gg, b] = PALETTE[bucket] ?? [255, 255, 255]
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.18, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return (glow[bucket] = c)
}
const PAL_CSS = PALETTE.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
const STAR_G: number[][] = Array.from({ length: PALETTE.length * 4 }, () => [])
let whiteGlowCan: HTMLCanvasElement | null = null
function whiteGlow() {
  if (whiteGlowCan) return whiteGlowCan
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return (whiteGlowCan = c)
}

/** Grid polylines as unit vectors in the frame they are defined in. */
function circleLat(lat: number, step = 4): V3[] { const o: V3[] = []; for (let a = 0; a <= 360; a += step) o.push(hzVec(lat, a)); return o } // (frame-agnostic: "alt" = latitude, "az" measured like RA mirrored; fine for a grid)
function meridian(az: number, from: number, to: number, step = 4): V3[] { const o: V3[] = []; for (let a = from; a <= to; a += step) o.push(hzVec(a, az)); return o }
let GRID_AZ: V3[][] | null = null, GRID_EQ: V3[][] | null = null, GRID_GAL: V3[][] | null = null, ECL: V3[] | null = null, EQU: V3[] | null = null, MERID: V3[] | null = null
function gridAz() {
  return (GRID_AZ ??= [...[15, 30, 45, 60, 75].map((a) => circleLat(a)), ...Array.from({ length: 12 }, (_, i) => meridian(i * 30, 0, 88))])
}
// equatorial grid: vectors built with radec convention (ra, dec) = (x,y,z) of the J2000 frame
function eqVec(ra: number, dec: number): V3 { const c = Math.cos(dec * D2R); return [c * Math.cos(ra * D2R), c * Math.sin(ra * D2R), Math.sin(dec * D2R)] }
function gridEq() {
  if (GRID_EQ) return GRID_EQ
  const g: V3[][] = []
  for (const d of [-75, -60, -45, -30, -15, 15, 30, 45, 60, 75]) { const l: V3[] = []; for (let r = 0; r <= 360; r += 4) l.push(eqVec(r, d)); g.push(l) }
  for (let h = 0; h < 24; h += 2) { const l: V3[] = []; for (let d = -88; d <= 88; d += 4) l.push(eqVec(h * 15, d)); g.push(l) }
  return (GRID_EQ = g)
}
const equatorLine = () => (EQU ??= Array.from({ length: 91 }, (_, i) => eqVec(i * 4, 0)))
function gridGal() {
  if (GRID_GAL) return GRID_GAL
  const g: V3[][] = []
  for (const b of [-60, -30, -15, 15, 30, 60]) { const l: V3[] = []; for (let a = 0; a <= 360; a += 4) l.push(galVec(a, b)); g.push(l) }
  for (let l0 = 0; l0 < 360; l0 += 30) { const l: V3[] = []; for (let b = -88; b <= 88; b += 4) l.push(galVec(l0, b)); g.push(l) }
  return (GRID_GAL = g)
}
const galEquator = () => Array.from({ length: 91 }, (_, i) => galVec(i * 4, 0))
let GAL_EQ: V3[] | null = null
function ecliptic() {
  if (ECL) return ECL
  const eps = 23.4393 * D2R, l: V3[] = []
  for (let a = 0; a <= 360; a += 3) { const x = Math.cos(a * D2R), y = Math.sin(a * D2R); l.push([x, y * Math.cos(eps), y * Math.sin(eps)]) }
  return (ECL = l)
}
const meridianLine = () => (MERID ??= [...meridian(0, -90, 90, 3), ...meridian(180, 87, -90, -3)])

function stroke(ctx: CanvasRenderingContext2D, cam: Cam, pts: V3[], xf?: (v: V3) => V3) {
  let pen = false
  ctx.beginPath()
  for (const p of pts) {
    const v = xf ? xf(p) : p
    if (dotv(v, cam.f) > -0.55 && project(cam, v, P)) { if (pen) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); pen = true } } else pen = false
  }
  ctx.stroke()
}

// ---------- Milky Way ----------
let mwCan: HTMLCanvasElement | null = null, mwImg: ImageData | null = null
const GC = galVec(0, 0)
function drawMilkyWay(ctx: CanvasRenderingContext2D, f: Frame, vis: number) {
  const q = Math.max(5, Math.ceil(Math.sqrt((f.w * f.h) / 26000))), mw = Math.ceil(f.w / q), mh = Math.ceil(f.h / q)
  if (!mwCan || mwCan.width !== mw || mwCan.height !== mh) { mwCan = document.createElement('canvas'); mwCan.width = mw; mwCan.height = mh; mwImg = null }
  const g = mwCan.getContext('2d')!
  mwImg ??= g.createImageData(mw, mh)
  const px = mwImg.data, c = f.cam, m = f.M, cells = f.data.mw.cells, W = f.data.mw.w, H = f.data.mw.h
  const R = f.layers.refraction
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const X = (x * q + q / 2 - c.cx) / c.k, Y = -(y * q + q / 2 - c.cy) / c.k, p2 = X * X + Y * Y, d = (4 - p2) / (4 + p2), s = 4 / (4 + p2)
    let hx = d * c.f[0] + s * (X * c.r[0] + Y * c.u[0]), hy = d * c.f[1] + s * (X * c.r[1] + Y * c.u[1]), hz = d * c.f[2] + s * (X * c.r[2] + Y * c.u[2])
    const o = (y * mw + x) * 4
    if (hz < -0.03 && f.layers.ground) { px[o + 3] = 0; continue }
    if (R && hz < 0.45) { // un-refract: the screen shows apparent positions (lift is ~0.5 deg at the horizon, so a one-step inverse is plenty)
      const alt = Math.asin(clamp(hz, -1, 1)) / D2R, a2 = (alt - (alt < -1 ? 0 : refractionBennett(Math.max(alt, -0.5)))) * D2R, hn = Math.hypot(hx, hy) || 1, k = Math.cos(a2) / hn
      hx *= k; hy *= k; hz = Math.sin(a2)
    }
    const ex = m[0] * hx + m[3] * hy + m[6] * hz, ey = m[1] * hx + m[4] * hy + m[7] * hz, ez = m[2] * hx + m[5] * hy + m[8] * hz
    // bilinear sample of the 1-degree grid
    const ra = ((Math.atan2(ey, ex) / D2R) % 360 + 360) % 360 - 0.5, dec = Math.asin(clamp(ez, -1, 1)) / D2R, yy = 90 - dec - 0.5
    const x0 = Math.floor(ra), y0 = Math.max(0, Math.min(H - 2, Math.floor(yy))), fx = ra - x0, fy = Math.max(0, Math.min(1, yy - y0))
    const gx = (xx: number, y1: number) => cells[y1 * W + ((xx % W) + W) % W]
    const lv = gx(x0, y0) * (1 - fx) * (1 - fy) + gx(x0 + 1, y0) * fx * (1 - fy) + gx(x0, y0 + 1) * (1 - fx) * fy + gx(x0 + 1, y0 + 1) * fx * fy
    const warm = clamp((ex * GC[0] + ey * GC[1] + ez * GC[2]) * 1.4 - 0.1, 0, 1)
    px[o] = 150 + 88 * warm; px[o + 1] = 172 + 34 * warm; px[o + 2] = 222 - 72 * warm
    px[o + 3] = Math.min(255, lv ** 1.25 * 165 * vis)
  }
  g.putImageData(mwImg, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(mwCan, 0, 0, mw * q, mh * q)
}
// ---------- discs (Moon, planets) ----------
/** Path of the lit part of a disc (Sun to the right), r = radius, f = illuminated fraction. */
function litPath(ctx: CanvasRenderingContext2D, r: number, f: number) {
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
  ctx.ellipse(0, 0, Math.max(0.01, r * Math.abs(1 - 2 * f)), r, 0, Math.PI / 2, -Math.PI / 2, f < 0.5)
}
/** Dark part of a phase disc: the lit crescent of the opposite phase, turned round. */
function shadePhase(ctx: CanvasRenderingContext2D, r: number, f: number, sunAng: number, colour: string) {
  ctx.save(); ctx.rotate(sunAng + Math.PI); litPath(ctx, r * 1.01, 1 - f); ctx.fillStyle = colour; ctx.fill(); ctx.restore()
}
const sunAngle = (x: number, y: number, sunPx: { x: number; y: number } | null) => (sunPx ? Math.atan2(sunPx.y - y, sunPx.x - x) : -Math.PI / 4)
function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, b: Bodies, sunPx: { x: number; y: number } | null, night: number, sky: number[], poleAng: number) {
  const m = b.moon, ang = sunAngle(x, y, sunPx), spr = r >= 6 ? discSprite('moon') : null
  ctx.save(); ctx.translate(x, y)
  const earthshine = 0.1 * (1 - m.illum) ** 1.5
  // unlit part: Earth-lit grey at night, the sky colour by day (it vanishes into the blue)
  const dark = lerp3(sky, [10, 13, 22], night)
  if (spr) {
    ctx.save(); ctx.rotate(poleAng); ctx.imageSmoothingEnabled = true; ctx.drawImage(spr, -r, -r, 2 * r, 2 * r); ctx.restore()
    shadePhase(ctx, r, m.illum, ang, rgba(dark, 0.9 - earthshine * night))
  } else {
    ctx.fillStyle = `rgba(40,48,66,${0.22 + 0.68 * night})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill()
    ctx.save(); ctx.rotate(ang); litPath(ctx, r, m.illum); ctx.fillStyle = '#f1ecd9'; ctx.fill(); ctx.restore()
  }
  ctx.restore()
}
/** Planet disc: textured sprite (or flat colour), phase shading, polar flattening, Saturn's rings. `poleDir` = screen direction of the north pole. */
function drawPlanet(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number, color: string, illum: number, sunAng: number, poleAng: number, ringB: number, sky: number[], alpha: number) {
  const flat = id === 'jupiter' ? 0.065 : id === 'saturn' ? 0.098 : 0
  const spr = r >= 2.5 ? discSprite(id) : null
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha
  const ring = (back: boolean) => {
    const s = Math.max(0.02, Math.abs(Math.sin(ringB * D2R)))
    ctx.save(); ctx.rotate(poleAng); ctx.scale(1, s)
    const up = ringB > 0 // north face towards us: the far side of the rings is the upper half
    const a0 = back === up ? Math.PI : 0
    for (const [ri, ro, col] of [[1.24, 1.53, 'rgba(140,125,100,0.30)'], [1.53, 1.95, 'rgba(238,222,184,0.88)'], [2.03, 2.27, 'rgba(204,190,156,0.75)']] as [number, number, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, (ro - ri) * r); ctx.beginPath(); ctx.ellipse(0, 0, ((ri + ro) / 2) * r, ((ri + ro) / 2) * r, 0, a0, a0 + Math.PI); ctx.stroke()
    }
    ctx.restore()
  }
  if (id === 'saturn') ring(true)
  if (spr) {
    ctx.save(); ctx.rotate(poleAng); ctx.scale(1, 1 - flat); ctx.drawImage(spr, -r, -r, 2 * r, 2 * r); ctx.restore()
  } else {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
    g.addColorStop(0, color); g.addColorStop(1, rgba(lerp3([60, 60, 60], [200, 190, 170], 0.5), 1))
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill()
  }
  if (illum < 0.985 && !flat) shadePhase(ctx, r, illum, sunAng, rgba(lerp3(sky, [6, 8, 14], 0.7), 0.88))
  if (id === 'saturn') ring(false)
  ctx.restore(); ctx.globalAlpha = 1
}

/** Unit screen direction (in px space) of an axis (horizon frame) at a direction; null at the screen's singular points. */
function axisDir(cam: Cam, hv: V3, ax: V3): [number, number] | null {
  const d = dotv(ax, hv), tx = ax[0] - d * hv[0], ty = ax[1] - d * hv[1], tz = ax[2] - d * hv[2], n = Math.hypot(tx, ty, tz)
  if (n < 1e-6 || !project(cam, hv, P)) return null
  const x0 = P.x, y0 = P.y, e = 0.003 / n, q: V3 = [hv[0] + e * tx, hv[1] + e * ty, hv[2] + e * tz], qn = Math.hypot(q[0], q[1], q[2])
  q[0] /= qn; q[1] /= qn; q[2] /= qn
  if (!project(cam, q, P)) return null
  const dx = P.x - x0, dy = P.y - y0, l = Math.hypot(dx, dy)
  return l < 1e-9 ? null : [dx / l, dy / l]
}

interface Label { x: number; y: number; text: string; pri: number; color: string; size?: number; italic?: boolean }

const DSO_RGB: Record<string, number[]> = { g: [255, 214, 150], s: [255, 214, 150], s0: [255, 214, 150], e: [255, 214, 150], i: [255, 214, 150], sd: [255, 214, 150], gg: [255, 214, 150], oc: [255, 238, 150], gc: [255, 205, 120], pn: [120, 240, 200], bn: [255, 140, 170], en: [255, 120, 140], rn: [130, 180, 255], sfr: [255, 140, 170], snr: [190, 150, 255], dn: [120, 120, 120] }
const isGal = (t0: string) => t0 === 'g' || t0 === 's' || t0 === 's0' || t0 === 'e' || t0 === 'i' || t0 === 'sd' || t0 === 'gg'

export function drawSky(ctx: CanvasRenderingContext2D, f: Frame): Hit[] {
  const { w, h, dpr, cam, data: d, layers: L, b } = f
  const hits: Hit[] = []
  const labels: Label[] = []
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sunAlt = L.atmosphere ? b.sunAlt : -30
  const naked = L.atmosphere ? nakedEyeLimit(b.sunAlt, L.bortle, b.moon.alt, b.moon.illum) : 99
  const night = clamp((naked - 2) / 4, 0, 1) // 0 in daylight, 1 when dark
  const lim = Math.min(8.2, Math.min(naked, L.magLim) + (L.atmosphere ? zoomGain(f.fov) * night : zoomGain(f.fov))) // faintest magnitude drawn (zooming in = binoculars)
  const refr = L.refraction
  const RV: V3 = [0, 0, 0]
  const app = (v: V3): V3 => (refr ? refractVec(v, RV) : v)
  const kScale = (th: number) => 1 / Math.cos(th / 2) ** 2 // stereographic: local scale relative to the view centre
  const kpx = (radiusDeg: number, minPx: number, at: V3) => { const th = Math.acos(clamp(dotv(at, cam.f), -1, 1)); return Math.max(minPx, radiusDeg * D2R * cam.k * kScale(th)) }
  const kpxExact = (radiusDeg: number, at: V3) => radiusDeg * D2R * cam.k * kScale(Math.acos(clamp(dotv(at, cam.f), -1, 1)))

  // ---- sky background (twilight colours, light pollution, Sun and Moon glow)
  const { top, hor } = skyColors(sunAlt)
  const azv = Math.atan2(cam.f[0], cam.f[1]) / D2R
  const pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 }
  const wash = L.atmosphere ? bortleGlow(L.bortle) * clamp((naked + 1) / 5, 0, 1) * clamp(1 - (sunAlt + 6) / 10, 0, 1) : 0 // city glow, only in the dark
  const horP = lerp3(hor, [104, 74, 52], 0.8 * wash), midP = lerp3(lerp3(hor, top, 0.45), [40, 30, 30], 0.5 * wash)
  const okA = project(cam, hzVec(0, azv), pa), okB = project(cam, hzVec(75, azv), pb)
  if (okA && okB && Math.hypot(pa.x - pb.x, pa.y - pb.y) > 30) {
    const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y)
    g.addColorStop(0, rgb(horP)); g.addColorStop(0.4, rgb(midP)); g.addColorStop(1, rgb(top)); ctx.fillStyle = g
  } else ctx.fillStyle = rgb(lerp3(horP, top, 0.5))
  ctx.fillRect(0, 0, w, h)
  if (L.atmosphere) {
    // glow of the twilight arch round the Sun
    const gl = clamp(1 - Math.abs(sunAlt + 3) / 14, 0, 1)
    if (gl > 0.02 && project(cam, hzVec(Math.max(-8, Math.min(sunAlt, 4)), b.sun.az), P)) {
      const R = 2 * cam.k * Math.tan(28 * D2R / 2) * 1.0
      const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, R)
      g.addColorStop(0, `rgba(255,150,72,${0.46 * gl})`); g.addColorStop(0.45, `rgba(240,110,90,${0.18 * gl})`); g.addColorStop(1, 'rgba(240,110,90,0)')
      ctx.fillStyle = g; ctx.fillRect(P.x - R, P.y - R, 2 * R, 2 * R)
    }
    // moonlit sky
    if (b.moon.alt > -2 && night > 0.2 && b.moon.illum > 0.05 && dotv(b.moon.hv, cam.f) > -0.3 && project(cam, b.moon.hv, P)) {
      const R = 2 * cam.k * Math.tan(20 * D2R / 2), a = 0.2 * b.moon.illum ** 0.8 * night * clamp((b.moon.alt + 2) / 12, 0, 1)
      const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, R)
      g.addColorStop(0, `rgba(170,190,235,${a})`); g.addColorStop(1, 'rgba(170,190,235,0)')
      ctx.fillStyle = g; ctx.fillRect(P.x - R, P.y - R, 2 * R, 2 * R)
    }
  }

  // ---- Milky Way
  if (L.mw) { const v = clamp((Math.min(naked, 7.4) - 3.2) / 3, 0, 1) * (1 - 0.7 * wash); if (v > 0.02) drawMilkyWay(ctx, f, v) }

  // ---- grids and guide lines
  ctx.lineWidth = 1
    const toHzR = (v: V3) => app(applyM(f.M, v)).slice() as V3
  if (L.gridEq) { ctx.strokeStyle = 'rgba(190,150,255,0.26)'; for (const l of gridEq()) stroke(ctx, cam, l, toHzR) }
  if (L.gridGal) { ctx.strokeStyle = 'rgba(255,140,190,0.26)'; for (const l of gridGal()) stroke(ctx, cam, l, toHzR) }
  if (L.gridAz) { ctx.strokeStyle = 'rgba(90,170,255,0.30)'; for (const l of gridAz()) stroke(ctx, cam, l) }
  if (L.equator) { ctx.strokeStyle = 'rgba(190,150,255,0.6)'; stroke(ctx, cam, equatorLine(), toHzR) }
  if (L.gridGal) { ctx.strokeStyle = 'rgba(255,140,190,0.6)'; stroke(ctx, cam, (GAL_EQ ??= galEquator()), toHzR) }
  if (L.ecliptic) { ctx.strokeStyle = 'rgba(255,210,120,0.55)'; ctx.setLineDash([6, 5]); stroke(ctx, cam, ecliptic(), toHzR); ctx.setLineDash([]) }
  if (L.meridian) { ctx.strokeStyle = 'rgba(120,230,170,0.5)'; stroke(ctx, cam, meridianLine()) }

  // ---- IAU constellation boundaries
  if (L.conBounds) {
    ctx.strokeStyle = `rgba(214,160,104,${0.34 * clamp((naked - 1) / 3, 0.3, 1)})`; ctx.lineWidth = 1; ctx.beginPath()
    const v: V3 = [0, 0, 0], m = f.M
    for (const pl of d.borders) {
      let pen = false
      for (let i = 0; i < pl.length; i += 3) {
        const ox = pl[i], oy = pl[i + 1], oz = pl[i + 2]
        v[0] = m[0] * ox + m[1] * oy + m[2] * oz; v[1] = m[3] * ox + m[4] * oy + m[5] * oz; v[2] = m[6] * ox + m[7] * oy + m[8] * oz
        const a = app(v)
        if (dotv(a, cam.f) > -0.3 && project(cam, a, P)) { if (pen) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); pen = true } } else pen = false
      }
    }
    ctx.stroke()
  }

  // ---- constellation figures
  const zoomF = clamp(Math.sqrt(70 / f.fov), 0.8, 1.5) // stars/labels grow a little when zoomed in
  if (L.lines) {
    ctx.strokeStyle = `rgba(110,160,230,${0.38 * clamp((naked - 1) / 3, 0, 1)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    const s = d.lineSegs, tmpA: V3 = [0, 0, 0], tmpB: V3 = [0, 0, 0]
    for (let i = 0; i < s.length; i += 6) {
      tmpA[0] = s[i]; tmpA[1] = s[i + 1]; tmpA[2] = s[i + 2]; tmpB[0] = s[i + 3]; tmpB[1] = s[i + 4]; tmpB[2] = s[i + 5]
      const a = applyM(f.M, tmpA), c2 = applyM(f.M, tmpB)
      if (dotv(a, cam.f) < -0.3 || dotv(c2, cam.f) < -0.3) continue
      const a1 = app(a)
      if (!project(cam, a1, P)) continue
      const ax = P.x, ay = P.y
      if (!project(cam, app(c2), P)) continue
      if ((ax < -50 && P.x < -50) || (ax > w + 50 && P.x > w + 50) || (ay < -50 && P.y < -50) || (ay > h + 50 && P.y > h + 50)) continue
      ctx.moveTo(ax, ay); ctx.lineTo(P.x, P.y)
    }
    ctx.stroke()
  }

  // ---- deep sky: symbols at wide views, true size and shape when zoomed
  if (L.dso && night > 0.15) {
    const dsoLim = lim + 1.8, sbLim = 17 + 0.85 * lim, otherLim = lim + (f.fov > 40 ? -1.2 : f.fov > 15 ? -0.2 : 1.0)
    ctx.lineWidth = 1
    let drawnBig = 0
    const showNames = L.dsoNames
    const lbLim = f.fov > 60 ? 4.6 : f.fov > 25 ? 6.6 : f.fov > 8 ? 9 : 14
    for (let i = 0; i < d.dsos.length; i++) {
      const x: Dso = d.dsos[i]
      if (x.mag > dsoLim) break // sorted by magnitude
      if (x.mag < 90 && x.sb > sbLim && x.mag > 7) continue // too diffuse for this sky
      const isM = x.id.charCodeAt(0) === 77 && x.id.charCodeAt(1) >= 48 && x.id.charCodeAt(1) <= 57
      if (!isM && x.mag > otherLim) continue
      if (x.mag >= 90 && f.fov > 30) continue
      if (x.id.charCodeAt(0) === 67 && x.id.charCodeAt(1) === 114 && x.mag > 4.5 && f.fov > 30) continue // sparse Collinder clusters only when zoomed
      const v = app(applyM(f.M, x.vec))
      if ((L.ground && v[2] < -0.01) || dotv(v, cam.f) < 0 || !project(cam, v, P)) continue
      const cx = P.x, cy = P.y
      if (cx < -60 || cx > w + 60 || cy < -60 || cy > h + 60) continue
      const rgbc = x.id === 'M45' ? [160, 195, 255] : DSO_RGB[x.type] ?? [150, 220, 255], a = night
      const Rpx = kpxExact((x.maj / 60) / 2, v) // half the major axis in pixels
      const rMin = clamp(5.2 - x.mag * 0.28, 2.6, 5.6) * zoomF
      if (Rpx < 5) { // symbol
        const r = Math.max(rMin, Rpx)
        ctx.strokeStyle = rgba(rgbc, 0.85 * a); ctx.beginPath()
        if (isGal(x.type)) ctx.ellipse(cx, cy, r * 1.5, r * 0.8, -0.5, 0, TAU)
        else if (x.type === 'oc' || x.type === 'sfr') { ctx.setLineDash([2, 2]); ctx.arc(cx, cy, r, 0, TAU) }
        else if (x.type === 'gc') { ctx.arc(cx, cy, r, 0, TAU); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r) }
        else if (x.type === 'pn') { ctx.arc(cx, cy, r * 0.7, 0, TAU); ctx.moveTo(cx + r * 0.7, cy); ctx.lineTo(cx + r * 1.3, cy); ctx.moveTo(cx - r * 0.7, cy); ctx.lineTo(cx - r * 1.3, cy); ctx.moveTo(cx, cy + r * 0.7); ctx.lineTo(cx, cy + r * 1.3); ctx.moveTo(cx, cy - r * 0.7); ctx.lineTo(cx, cy - r * 1.3) }
        else ctx.rect(cx - r, cy - r, r * 2, r * 2)
        ctx.stroke(); ctx.setLineDash([])
      } else if (drawnBig < 400) { // true size
        drawnBig++
        const ratio = x.maj > 0 ? Math.max(0.12, x.min / x.maj) : 1
        // PA (east of north) is only known for a few big galaxies; every other object is drawn as the circle of equal area
        const rx = x.pa != null ? Rpx : Rpx * Math.sqrt(ratio), ry = x.pa != null ? Rpx * ratio : rx
        let rot = 0
        if (x.pa != null) { const dir = axisDir(cam, v, applyM(f.M, CELESTIAL_POLE)); if (dir) { const e = [dir[1], -dir[0]], pr = x.pa * D2R; rot = Math.atan2(dir[1] * Math.cos(pr) + e[1] * Math.sin(pr), dir[0] * Math.cos(pr) + e[0] * Math.sin(pr)) } }
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
        if (x.type !== 'oc' && x.type !== 'gc') {
          ctx.save(); ctx.scale(1, ry / rx)
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
          g.addColorStop(0, rgba(rgbc, 0.26 * a)); g.addColorStop(0.55, rgba(rgbc, 0.11 * a)); g.addColorStop(1, rgba(rgbc, 0))
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill()
          ctx.restore()
          ctx.strokeStyle = rgba(rgbc, 0.42 * a); ctx.setLineDash(x.type === 'snr' ? [4, 3] : []); ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.97, ry * 0.97, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([])
          if (x.type === 'pn') { ctx.strokeStyle = rgba(rgbc, 0.8 * a); ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, rx * 0.35), 0, TAU); ctx.stroke() }
        } else { // star clusters: a dotted outline, globulars with a glow
          if (x.type === 'gc') { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, rgba(rgbc, 0.55 * a)); g.addColorStop(1, rgba(rgbc, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill() }
          ctx.strokeStyle = rgba(rgbc, 0.7 * a * clamp(70 / rx, 0.3, 1)); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.stroke(); ctx.setLineDash([])
        }
        ctx.restore()
      }
      const rHit = Math.max(Rpx, rMin)
      hits.push({ x: cx, y: cy, obj: { k: 'dso', i }, pri: 1 })
      if (showNames && x.mag < lbLim + (isM ? 2 : 0)) {
        const nm = f.lang === 'el' && x.el ? x.el : x.name
        labels.push({ x: cx + rHit + 3, y: cy + 3, text: nm && f.fov < 45 ? nm : x.id, pri: 2 - x.mag * 0.1 + (nm ? 0.3 : 0), color: rgba([...rgbc].map((c) => c * 0.35 + 255 * 0.65), 0.9 * a), size: 10 })
      }
    }
  }

  // ---- stars
  if (L.stars) {
    const vec = d.vec, mag = d.mag, col = d.col
    const nameMag = clamp(2 + 2.3 * Math.log10(75 / f.fov), 2, 7.2)
    const hitMag = f.fov < 15 ? lim : 4.2
    const v: V3 = [0, 0, 0], m = f.M, cf = cam.f
    let lastCol = -1
    for (const g of STAR_G) g.length = 0
    const gMin = L.ground ? -0.012 : -2
    const sizeLim = Math.min(lim, 6.6 + (lim - 6.6) * 0.5) // star discs grow slower than the limit
    for (let i = 0; i < d.n; i++) {
      const mg = mag[i]
      if (mg > lim) break // sorted by magnitude
      const ox = vec[i * 3], oy = vec[i * 3 + 1], oz = vec[i * 3 + 2]
      v[0] = m[0] * ox + m[1] * oy + m[2] * oz; v[1] = m[3] * ox + m[4] * oy + m[5] * oz; v[2] = m[6] * ox + m[7] * oy + m[8] * oz
      let ext = 0
      if (refr && v[2] < 0.45) { // refraction lifts low stars, extinction dims them (apparent altitude)
        refractVec(v, v)
        if (v[2] < 0.5) ext = extinctionMag(Math.asin(clamp(v[2], -1, 1)) / D2R)
      }
      const vis = clamp((lim - mg - ext) / 1.3, 0, 1)
      if (vis <= 0.02) continue
      if (v[2] < gMin || v[0] * cf[0] + v[1] * cf[1] + v[2] * cf[2] < -0.2 || !project(cam, v, P)) continue
      const x = P.x, y = P.y
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
      const r = clamp(0.5 + 0.38 * (6.6 - mg - ext * 0.5) + (sizeLim - 6.6) * 0.1, 0.45, 7) * zoomF
      const al = vis * Math.min(1, 0.4 + r * 0.45)
      if (r < 1.3) STAR_G[col[i] * 4 + Math.min(3, (al * 4) | 0)].push(x - r, y - r, 2 * r) // faint stars: batched per colour and brightness class, one fill each
      else {
        if (col[i] !== lastCol) { ctx.fillStyle = PAL_CSS[col[i]]; lastCol = col[i] }
        ctx.globalAlpha = al
        if (r > 2.2) { ctx.globalAlpha = vis * 0.9; ctx.drawImage(glowSprite(col[i]), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8); ctx.globalAlpha = vis }
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
      }
      const nm = d.names[i]
      if (mg < hitMag || (nm && mg < 5.5)) hits.push({ x, y, obj: { k: 'star', i }, pri: 1.5 - mg * 0.1 })
      if (L.starNames && nm && mg < nameMag && vis > 0.5) {
        const txt = (f.lang === 'el' && nm.el) || nm.name || (nm.bayer ? nm.bayer : nm.flam ? nm.flam : '') + (nm.bayer || nm.flam ? ` ${nm.con}` : '')
        if (txt.trim()) labels.push({ x: x + r + 3, y: y - 2, text: txt.trim(), pri: 4 - mg, color: 'rgba(210,225,255,0.85)', size: 11 })
      }
    }
    for (let gi = 0; gi < STAR_G.length; gi++) {
      const g = STAR_G[gi]
      if (!g.length) continue
      ctx.fillStyle = PAL_CSS[gi >> 2]; ctx.globalAlpha = ((gi & 3) + 0.5) / 4
      ctx.beginPath()
      for (let k = 0; k < g.length; k += 3) ctx.rect(g[k], g[k + 1], g[k + 2], g[k + 2])
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // ---- meteor shower radiants of tonight, galactic centre
  if (L.showers && night > 0.3) {
    for (const s of activeShowers(live.ms)) {
      const v = app(applyM(f.M, eqVec(s.ra, s.dec)))
      if ((L.ground && v[2] < -0.01) || dotv(v, cam.f) < 0 || !project(cam, v, P)) continue
      if (P.x < -20 || P.x > w + 20 || P.y < -20 || P.y > h + 20) continue
      const a = (0.45 + 0.5 * s.strength) * night
      ctx.strokeStyle = `rgba(140,255,170,${a})`; ctx.lineWidth = 1.2; ctx.beginPath()
      for (let k = 0; k < 8; k++) { const an = (k * Math.PI) / 4, r0 = 3, r1 = k % 2 ? 7 : 11; ctx.moveTo(P.x + Math.cos(an) * r0, P.y + Math.sin(an) * r0); ctx.lineTo(P.x + Math.cos(an) * r1, P.y + Math.sin(an) * r1) }
      ctx.stroke(); ctx.lineWidth = 1
      labels.push({ x: P.x + 13, y: P.y + 4, text: `${t(`sky.sh.${s.id}`)}`, pri: 3, color: `rgba(150,255,180,${0.9 * night})`, size: 11, italic: false })
    }
  }
  if (L.gridGal && night > 0.2) {
    const v = app(applyM(f.M, GC))
    if (!(L.ground && v[2] < -0.01) && dotv(v, cam.f) > 0 && project(cam, v, P) && P.x > 10 && P.x < w - 10 && P.y > 10 && P.y < h - 10) {
      ctx.strokeStyle = `rgba(255,150,200,${0.8 * night})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(P.x, P.y, 7, 0, TAU); ctx.moveTo(P.x - 12, P.y); ctx.lineTo(P.x + 12, P.y); ctx.moveTo(P.x, P.y - 12); ctx.lineTo(P.x, P.y + 12); ctx.stroke(); ctx.lineWidth = 1
      labels.push({ x: P.x + 11, y: P.y - 8, text: t('sv.gc'), pri: 3, color: `rgba(255,170,210,${0.9 * night})`, size: 11 })
    }
  }

  // ---- constellation names
  if (L.conNames && night > 0.1) {
    d.cons.forEach((c, i) => {
      const v = app(applyM(f.M, c.vec))
      if ((L.ground && v[2] < -0.1) || dotv(v, cam.f) < 0.1 || !project(cam, v, P)) return
      if (P.x < 20 || P.x > w - 20 || P.y < 20 || P.y > h - 20) return
      labels.push({ x: P.x, y: P.y, text: conName(c).toUpperCase(), pri: 0.5, color: `rgba(120,165,235,${0.7 * night})`, size: 10, italic: true })
      hits.push({ x: P.x, y: P.y, obj: { k: 'con', i }, pri: 0 })
    })
  }

  // ---- Sun, Moon, planets
  const sunP = { x: 0, y: 0 }
  const sunApp = app(b.sun.hv).slice() as V3
  const sunOk = project(cam, sunApp, sunP) // also needed for the Moon's and planets' phases when the Sun layer is off
  const skyMid = lerp3(hor, top, 0.5)
  const drawn: { hv: V3; x: number; y: number; name: string }[] = []
  if (L.sun && sunOk && (!L.ground || b.sun.hv[2] > -0.04) && dotv(sunApp, cam.f) > -0.2) {
    const r = kpx(b.sun.radius, 7, sunApp)
    const g = ctx.createRadialGradient(sunP.x, sunP.y, r * 0.6, sunP.x, sunP.y, r * 6)
    g.addColorStop(0, 'rgba(255,230,160,0.55)'); g.addColorStop(1, 'rgba(255,210,120,0)')
    ctx.fillStyle = g; ctx.fillRect(sunP.x - r * 6, sunP.y - r * 6, r * 12, r * 12)
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, r, 0, TAU); ctx.fill()
    hits.push({ x: sunP.x, y: sunP.y, obj: { k: 'sun' }, pri: 3 })
    labels.push({ x: sunP.x + r + 4, y: sunP.y - r, text: f.names.sun, pri: 9, color: '#ffe9a8', size: 12 })
  }
  const northHz = applyM(f.M, CELESTIAL_POLE)
  if (L.moon && (!L.ground || b.moon.hv[2] > -0.03) && dotv(b.moon.hv, cam.f) > -0.2) {
    const mv = app(b.moon.hv)
    if (project(cam, mv, P)) {
      const r = kpx(b.moon.radius, 9, mv)
      const mx = P.x, my = P.y
      const sp = sunOk ? sunP : null
      { const hr = r + Math.min(r * 1.2, 46), hg = ctx.createRadialGradient(mx, my, r * 0.9, mx, my, hr); hg.addColorStop(0, `rgba(255,255,240,${0.1 + 0.08 * night})`); hg.addColorStop(1, 'rgba(255,255,240,0)'); ctx.fillStyle = hg; ctx.fillRect(mx - hr, my - hr, 2 * hr, 2 * hr) }
      const dir = axisDir(cam, mv, northHz), poleAng = dir ? Math.atan2(dir[0], -dir[1]) : 0
      project(cam, mv, P)
      drawMoon(ctx, mx, my, r, b, sp, night, skyMid, poleAng)
      hits.push({ x: mx, y: my, obj: { k: 'moon' }, pri: 3 })
      labels.push({ x: mx + r + 4, y: my - r, text: f.names.moon, pri: 9, color: '#f1ecd9', size: 12 })
      drawn.push({ hv: b.moon.hv, x: mx, y: my, name: f.names.moon })
    }
  }
  if (L.dwarfs) {
    for (const p of b.dwarfs) {
      const vis = clamp((lim - p.mag) / 1.2, 0, 1)
      if (vis < 0.05) continue
      const pv = app(p.hv)
      if ((L.ground && p.hv[2] < -0.01) || dotv(pv, cam.f) < -0.2 || !project(cam, pv, P)) continue
      if (P.x < -10 || P.x > w + 10 || P.y < -10 || P.y > h + 10) continue
      ctx.globalAlpha = vis; ctx.strokeStyle = '#d6cfc4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(P.x, P.y, 3.5, 0, TAU); ctx.stroke(); ctx.fillStyle = '#d6cfc4'; ctx.beginPath(); ctx.arc(P.x, P.y, 1.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1
      hits.push({ x: P.x, y: P.y, obj: { k: 'dwarf', id: p.id }, pri: 2.5 })
      labels.push({ x: P.x + 7, y: P.y - 4, text: p.name, pri: 6, color: '#d6cfc4', size: 11 })
    }
  }
  if (L.planets) {
    const sunDirPx = sunOk ? sunP : null
    for (const p of b.planets) {
      const pv = app(p.hv)
      if ((L.ground && p.hv[2] < -0.01) || dotv(pv, cam.f) < -0.2 || !project(cam, pv, P)) continue
      const vis = clamp((lim - p.mag) / 1.2, 0, 1) * (p.mag < -2 ? 1 : 1)
      if (vis < 0.05) continue
      const px = P.x, py = P.y
      if (px < -60 || px > w + 60 || py < -60 || py > h + 60) continue
      const physR = kpxExact(p.radius, pv) // true angular radius in pixels
      const rDot = clamp(2 + (1.5 - p.mag) * 0.7, 2, 5.5) * zoomF
      const showDisc = physR >= 2.5
      const r = Math.max(physR, 0)
      const jup = p.id === 'jupiter' && L.jovMoons && b.jupMoons.length && physR >= 1.6
      const dirN = axisDir(cam, pv, applyM(f.M, POLES[p.id]))
      const nx = dirN ? dirN[0] : 0, ny = dirN ? dirN[1] : -1
      project(cam, pv, P)
      // Jupiter's moons behind the planet first, then the disc, then the ones in front
      const moonPos = jup ? b.jupMoons.map((mm, k) => ({ k, x: px + (-ny * mm.x + nx * mm.y) * physR, y: py + (nx * mm.x + ny * mm.y) * physR, z: mm.z, hid: Math.hypot(mm.x, mm.y) < 1 && mm.z < 0 })) : []
      const drawMoons = (front: boolean) => {
        for (const mm of moonPos) { if (mm.hid || (mm.z >= 0) !== front) continue; ctx.globalAlpha = vis; ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(mm.x, mm.y, clamp(physR * 0.14, 1.2, 2.6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1 }
      }
      if (jup) drawMoons(false)
      if (showDisc) {
        ctx.globalAlpha = vis
        const gr = Math.min(r * 2.2, r + 14)
        ctx.drawImage(whiteGlow(), px - gr, py - gr, gr * 2, gr * 2)
        ctx.globalAlpha = 1
        const poleAng = Math.atan2(nx, -ny), ringB = p.id === 'saturn' ? p.ringB : 0
        drawPlanet(ctx, p.id, px, py, r, PLANET_COLOR[p.id], p.illum, sunAngle(px, py, sunDirPx), poleAng, ringB, skyMid, vis)
      } else {
        const rr = p.id === 'saturn' ? Math.max(rDot, 2) : rDot
        ctx.globalAlpha = vis
        ctx.fillStyle = PLANET_COLOR[p.id]
        ctx.drawImage(whiteGlow(), px - rr * 3.5, py - rr * 3.5, rr * 7, rr * 7)
        ctx.beginPath(); ctx.arc(px, py, rr, 0, TAU); ctx.fill()
        ctx.globalAlpha = 1
      }
      if (jup) {
        drawMoons(true)
        if (physR >= 9) for (const mm of moonPos) if (!mm.hid) labels.push({ x: mm.x + 4, y: mm.y - 2, text: MOON_NAMES[mm.k], pri: 5, color: '#e8dfc0', size: 10 })
      }
      const lr = showDisc ? Math.max(r, rDot) : rDot
      hits.push({ x: px, y: py, obj: { k: 'planet', id: p.id }, pri: 3 })
      labels.push({ x: px + lr + 4, y: py - lr, text: f.names.planets[p.id] ?? '', pri: 8, color: PLANET_COLOR[p.id], size: 12 })
      drawn.push({ hv: p.hv, x: px, y: py, name: f.names.planets[p.id] ?? '' })
    }
  }
  // conjunctions: bodies closer than 5 degrees get a dotted link and the separation
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const a = drawn[i], c2 = drawn[j], sep = Math.acos(clamp(dotv(a.hv, c2.hv), -1, 1)) / D2R
    if (sep > 5 || sep < 0.01) continue
    const dd = Math.hypot(a.x - c2.x, a.y - c2.y)
    if (dd < 14) continue
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c2.x, c2.y); ctx.stroke(); ctx.setLineDash([])
    labels.push({ x: (a.x + c2.x) / 2 + 4, y: (a.y + c2.y) / 2 - 4, text: `${sep < 1 ? sep.toFixed(2) : sep.toFixed(1)}°`, pri: 6.5, color: 'rgba(255,255,255,0.8)', size: 10 })
  }

  // ---- satellites
  if (L.sats) {
    for (const s of f.sats) {
      if (L.satsSunlitOnly && !s.sunlit) continue
      const sv = app(s.hv)
      if ((L.ground && s.hv[2] < -0.005) || dotv(sv, cam.f) < -0.2 || !project(cam, sv, P)) continue
      if (P.x < -10 || P.x > w + 10 || P.y < -10 || P.y > h + 10) continue
      const iss = s.norad === 25544
      const vis = s.sunlit ? 1 : 0.45
      ctx.fillStyle = s.sunlit ? '#ffe28a' : '#8892a8'
      ctx.globalAlpha = vis
      const r = iss ? 3.6 : 2
      ctx.beginPath()
      if (iss) { ctx.moveTo(P.x, P.y - r - 1); ctx.lineTo(P.x + r + 1, P.y); ctx.lineTo(P.x, P.y + r + 1); ctx.lineTo(P.x - r - 1, P.y); ctx.closePath() } else ctx.arc(P.x, P.y, r, 0, TAU)
      ctx.fill(); ctx.globalAlpha = 1
      hits.push({ x: P.x, y: P.y, obj: { k: 'sat', norad: s.norad }, pri: 2.5 })
      if (iss || zoomF > 1.15) labels.push({ x: P.x + r + 4, y: P.y + 3, text: s.name, pri: iss ? 7 : 1, color: s.sunlit ? '#ffe9a8' : '#9aa3b8', size: 10 })
    }
  }

  // ---- ground + horizon
  {
    const nz = cam.f[2] // = sin(alt of view)
    const nx = cam.r[2], ny = cam.u[2]
    const gc = lerp3(lerp3([8, 11, 9], [52, 66, 46], clamp((sunAlt + 8) / 18, 0, 1)), [34, 26, 22], 0.55 * wash)
    if (L.ground) {
      ctx.fillStyle = rgb(gc)
      if (Math.abs(nz) < 0.003) {
        ctx.save(); ctx.translate(cam.cx, cam.cy); ctx.rotate(Math.atan2(ny, -nx)); ctx.fillRect(0, -1e5, 1e5, 2e5); ctx.restore()
      } else {
        const Xc = (2 * nx) / nz, Yc = (2 * ny) / nz, R = (2 * cam.k) / Math.abs(nz)
        const cx = cam.cx + cam.k * Xc, cy = cam.cy - cam.k * Yc
        ctx.beginPath()
        if (nz > 0) { ctx.rect(-1e5, -1e5, 2e5, 2e5); ctx.arc(cx, cy, R, 0, Math.PI * 2, true) } else ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.fill(nz > 0 ? 'evenodd' : 'nonzero')
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
      }
    }
    if (L.cardinals) {
      const items = f.compass
      for (let i = 0; i < 8; i++) {
        const v = hzVec(L.ground ? 1.2 : 0, i * 45)
        if (dotv(v, cam.f) < -0.1 || !project(cam, v, P)) continue
        if (P.x < -30 || P.x > w + 30 || P.y < -30 || P.y > h + 30) continue
        ctx.font = `${i % 2 ? 11 : 15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillStyle = i === 0 ? '#ff7b72' : i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)'
        ctx.fillText(items[i], P.x, P.y - 3)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath()
      for (let a = 0; a < 360; a += 10) { const v = hzVec(0, a), v2 = hzVec(a % 30 ? 0.8 : 1.6, a); if (dotv(v, cam.f) > -0.1 && project(cam, v, P)) { const x0 = P.x, y0 = P.y; if (project(cam, v2, P)) { ctx.moveTo(x0, y0); ctx.lineTo(P.x, P.y) } } }
      ctx.stroke()
    }
  }

  // ---- labels (greedy, no overlaps; brightest first)
  labels.sort((a, c) => c.pri - a.pri)
  const placed: [number, number, number, number][] = []
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  for (const lb of labels) {
    if (!lb.text) continue
    const sz = lb.size ?? 11, wd = lb.text.length * sz * (lb.italic ? 0.66 : 0.58)
    const x0 = lb.italic ? lb.x - wd / 2 : lb.x, y0 = lb.y - sz
    if (x0 < 2 || x0 + wd > w - 2 || y0 < 2 || lb.y > h - 2) continue
    if (placed.some((p) => x0 < p[2] && x0 + wd > p[0] && y0 < p[3] && lb.y > p[1])) continue
    placed.push([x0, y0, x0 + wd, lb.y])
    ctx.font = `${lb.italic ? 'italic ' : ''}${sz}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(lb.text, x0 + 1, lb.y + 1)
    ctx.fillStyle = lb.color; ctx.fillText(lb.text, x0, lb.y)
  }

  // ---- selection marker / edge arrow
  if (f.sel) {
    const key = objKey(f.sel)
    const hit = hits.find((hh) => objKey(hh.obj) === key)
    if (hit) {
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hit.x, hit.y, 14, 0, 6.3); ctx.stroke()
    }
  }
  return hits
}

/** Arrow at the screen edge pointing towards a direction that is off-screen. Returns the angular distance in degrees, or null when visible. */
export function drawEdgeArrow(ctx: CanvasRenderingContext2D, f: Frame, hv: V3, color: string): number | null {
  const { cam, w, h } = f
  const ang = Math.acos(clamp(dotv(hv, cam.f), -1, 1)) / D2R
  const inside = project(cam, hv, P) && dotv(hv, cam.f) > 0 && P.x > 8 && P.x < w - 8 && P.y > 8 && P.y < h - 8
  if (inside) return null
  const x = dotv(hv, cam.r), y = dotv(hv, cam.u), a = Math.atan2(-y, x)
  const rx = Math.min(w, h) * 0.38, cx = cam.cx, cy = cam.cy
  const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * rx
  ctx.save(); ctx.translate(px, py); ctx.rotate(a)
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.stroke(); ctx.fill()
  ctx.restore()
  ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`${Math.round(ang)}°`, px - Math.cos(a) * 24 + 1, py - Math.sin(a) * 24 + 1)
  ctx.fillStyle = color; ctx.fillText(`${Math.round(ang)}°`, px - Math.cos(a) * 24, py - Math.sin(a) * 24)
  return ang
}
