// Canvas 2D renderer of the Sky view. One call = one frame. ~5000 stars are projected with a single 3x3 matrix and drawn as
// pixels / small discs (no per-star DOM, no three.js), which is plenty for 60 fps on a mid-range phone.
import { limitingMag, project, unproject, type Cam, type V3, applyM, hzVec, D2R } from './geom.ts'
import { PALETTE, mwLevel, type SkyData } from './skydata.ts'
import type { Layers } from './state.ts'
import { objKey, PLANET_COLOR, conName, type Bodies, type Obj, type SatPos } from './scene.ts'
import type { Lang } from '../../lib/settings.ts'

export interface Hit { x: number; y: number; obj: Obj; pri: number }
export interface Frame {
  w: number; h: number; dpr: number; cam: Cam; M: number[]; data: SkyData; layers: Layers; lang: Lang
  b: Bodies; sats: SatPos[]; sel: Obj | null
  /** localized compass points N, NE, E, SE, S, SW, W, NW */
  compass: string[]
  fov: number
  /** AR over the live camera picture: transparent canvas (no sky / ground fill), pinhole camera, stars visible in daylight too */
  overlay?: boolean
  names: { sun: string; moon: string; planets: Record<string, string> }
}

const P = { x: 0, y: 0 }
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const lerp3 = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const rgb = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
const dotv = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// Sky colours by Sun altitude: [sunAlt, zenith, horizon]
const SKY: [number, number[], number[]][] = [
  [-18, [3, 5, 12], [6, 10, 22]], [-12, [6, 10, 26], [22, 30, 60]], [-6, [20, 34, 78], [150, 100, 100]], [-1, [44, 74, 138], [238, 150, 104]],
  [4, [58, 110, 190], [176, 202, 232]], [15, [60, 120, 205], [160, 206, 240]],
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
  const g = c.getContext('2d')!, [r, gg, b] = PALETTE[bucket]
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.18, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return (glow[bucket] = c)
}
const PAL_CSS = PALETTE.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)

/** Grid polylines as unit vectors in the frame they are defined in. */
function circleLat(lat: number, step = 4): V3[] { const o: V3[] = []; for (let a = 0; a <= 360; a += step) o.push(hzVec(lat, a)); return o } // (frame-agnostic: "alt" = latitude, "az" measured like RA mirrored; fine for a grid)
function meridian(az: number, from: number, to: number, step = 4): V3[] { const o: V3[] = []; for (let a = from; a <= to; a += step) o.push(hzVec(a, az)); return o }
let GRID_AZ: V3[][] | null = null, GRID_EQ: V3[][] | null = null, ECL: V3[] | null = null
function gridAz() {
  return (GRID_AZ ??= [...[15, 30, 45, 60, 75].map((a) => circleLat(a)), ...Array.from({ length: 12 }, (_, i) => meridian(i * 30, 0, 88))])
}
// equatorial grid: vectors built with radec convention (ra, dec) = (x,y,z) of the J2000 frame
function eqVec(ra: number, dec: number): V3 { const c = Math.cos(dec * D2R); return [c * Math.cos(ra * D2R), c * Math.sin(ra * D2R), Math.sin(dec * D2R)] }
function gridEq() {
  if (GRID_EQ) return GRID_EQ
  const g: V3[][] = []
  for (const d of [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75]) { const l: V3[] = []; for (let r = 0; r <= 360; r += 4) l.push(eqVec(r, d)); g.push(l) }
  for (let h = 0; h < 24; h += 2) { const l: V3[] = []; for (let d = -88; d <= 88; d += 4) l.push(eqVec(h * 15, d)); g.push(l) }
  return (GRID_EQ = g)
}
function ecliptic() {
  if (ECL) return ECL
  const eps = 23.4393 * D2R, l: V3[] = []
  for (let a = 0; a <= 360; a += 3) { const x = Math.cos(a * D2R), y = Math.sin(a * D2R); l.push([x, y * Math.cos(eps), y * Math.sin(eps)]) }
  return (ECL = l)
}

function stroke(ctx: CanvasRenderingContext2D, cam: Cam, pts: V3[], xf?: (v: V3) => V3) {
  let pen = false
  ctx.beginPath()
  for (const p of pts) {
    const v = xf ? xf(p) : p
    if (dotv(v, cam.f) > -0.55 && project(cam, v, P)) { if (pen) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); pen = true } } else pen = false
  }
  ctx.stroke()
}

let mwCan: HTMLCanvasElement | null = null, mwImg: ImageData | null = null

function drawMilkyWay(ctx: CanvasRenderingContext2D, f: Frame, vis: number) {
  const q = 8, mw = Math.ceil(f.w / q), mh = Math.ceil(f.h / q)
  if (!mwCan || mwCan.width !== mw || mwCan.height !== mh) { mwCan = document.createElement('canvas'); mwCan.width = mw; mwCan.height = mh; mwImg = null }
  const g = mwCan.getContext('2d')!
  mwImg ??= g.createImageData(mw, mh)
  const px = mwImg.data, c = f.cam, m = f.M
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let hx: number, hy: number, hz: number
    if (c.rect) { [hx, hy, hz] = unproject(c, x * q + q / 2, y * q + q / 2) } else {
      const X = (x * q + q / 2 - c.cx) / c.k, Y = -(y * q + q / 2 - c.cy) / c.k, p2 = X * X + Y * Y, d = (4 - p2) / (4 + p2), s = 4 / (4 + p2)
      hx = d * c.f[0] + s * (X * c.r[0] + Y * c.u[0]); hy = d * c.f[1] + s * (X * c.r[1] + Y * c.u[1]); hz = d * c.f[2] + s * (X * c.r[2] + Y * c.u[2])
    }
    const o = (y * mw + x) * 4
    if (hz < -0.03 && f.layers.ground) { px[o + 3] = 0; continue }
    const ex = m[0] * hx + m[3] * hy + m[6] * hz, ey = m[1] * hx + m[4] * hy + m[7] * hz, ez = m[2] * hx + m[5] * hy + m[8] * hz
    const lv = mwLevel(f.data.mw, Math.atan2(ey, ex) / D2R, Math.asin(clamp(ez, -1, 1)) / D2R)
    px[o] = 176; px[o + 1] = 190; px[o + 2] = 228
    px[o + 3] = Math.min(255, lv ** 1.15 * 150 * vis)
  }
  g.putImageData(mwImg, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(mwCan, 0, 0, mw * q, mh * q)
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, b: Bodies, sunPx: { x: number; y: number } | null, night: number) {
  const m = b.moon
  // bright limb faces the Sun on screen
  const ang = sunPx ? Math.atan2(sunPx.y - y, sunPx.x - x) : -Math.PI / 4
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang)
  ctx.fillStyle = `rgba(40,48,66,${0.22 + 0.68 * night})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  const f = m.illum
  ctx.fillStyle = '#f1ecd9'; ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
  ctx.ellipse(0, 0, Math.max(0.01, r * Math.abs(1 - 2 * f)), r, 0, Math.PI / 2, -Math.PI / 2, f < 0.5)
  ctx.fill()
  ctx.restore()
}

interface Label { x: number; y: number; text: string; pri: number; color: string; size?: number; italic?: boolean }

export function drawSky(ctx: CanvasRenderingContext2D, f: Frame): Hit[] {
  const { w, h, dpr, cam, data: d, layers: L, b } = f
  const hits: Hit[] = []
  const labels: Label[] = []
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sunAlt = L.atmosphere ? b.sunAlt : -30
  const lim = f.overlay ? Math.max(5, L.atmosphere ? limitingMag(b.sunAlt) : 99) : L.atmosphere ? limitingMag(b.sunAlt) : 99 // over a camera picture the bright stars stay marked in daylight
  const night = clamp((lim - 2) / 4, 0, 1) // 0 in daylight, 1 when dark

  // ---- sky background
  if (f.overlay) ctx.clearRect(0, 0, w, h) // the camera shows through
  const { top, hor } = skyColors(sunAlt)
  const azv = Math.atan2(cam.f[0], cam.f[1]) / D2R
  const pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 }
  const okA = project(cam, hzVec(0, azv), pa), okB = project(cam, hzVec(75, azv), pb)
  if (okA && okB && Math.hypot(pa.x - pb.x, pa.y - pb.y) > 30) {
    const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y)
    g.addColorStop(0, rgb(hor)); g.addColorStop(1, rgb(top)); ctx.fillStyle = g
  } else ctx.fillStyle = rgb(lerp3(hor, top, 0.5))
  if (!f.overlay) ctx.fillRect(0, 0, w, h)

  // ---- Milky Way
  if (L.mw) { const v = clamp((lim - 3) / 3, 0, 1); if (v > 0.02) drawMilkyWay(ctx, f, v) }

  // ---- grids
  ctx.lineWidth = 1
  if (L.gridEq) { ctx.strokeStyle = 'rgba(190,150,255,0.28)'; for (const l of gridEq()) stroke(ctx, cam, l, (v) => applyM(f.M, v)) }
  if (L.gridAz) { ctx.strokeStyle = 'rgba(90,170,255,0.30)'; for (const l of gridAz()) stroke(ctx, cam, l) }
  if (L.ecliptic) { ctx.strokeStyle = 'rgba(255,210,120,0.55)'; ctx.setLineDash([6, 5]); stroke(ctx, cam, ecliptic(), (v) => applyM(f.M, v)); ctx.setLineDash([]) }

  // ---- constellation figures
  const zoomF = clamp(Math.sqrt(70 / f.fov), 0.8, 1.5) // stars/labels grow a little when zoomed in
  if (L.lines) {
    ctx.strokeStyle = `rgba(110,160,230,${0.38 * clamp((lim - 1) / 3, 0, 1) + 0.0})`
    ctx.lineWidth = 1
    ctx.beginPath()
    const s = d.lineSegs, tmpA: V3 = [0, 0, 0], tmpB: V3 = [0, 0, 0]
    for (let i = 0; i < s.length; i += 6) {
      tmpA[0] = s[i]; tmpA[1] = s[i + 1]; tmpA[2] = s[i + 2]; tmpB[0] = s[i + 3]; tmpB[1] = s[i + 4]; tmpB[2] = s[i + 5]
      const a = applyM(f.M, tmpA), c2 = applyM(f.M, tmpB)
      if (dotv(a, cam.f) < -0.3 || dotv(c2, cam.f) < -0.3) continue
      if (!project(cam, a, P)) continue
      const ax = P.x, ay = P.y
      if (!project(cam, c2, P)) continue
      if ((ax < -50 && P.x < -50) || (ax > w + 50 && P.x > w + 50) || (ay < -50 && P.y < -50) || (ay > h + 50 && P.y > h + 50)) continue
      ctx.moveTo(ax, ay); ctx.lineTo(P.x, P.y)
    }
    ctx.stroke()
  }

  // ---- deep sky
  if (L.dso && night > 0.2) {
    const dsoLim = L.magLim + 2.5
    ctx.lineWidth = 1
    d.dsos.forEach((x, i) => {
      if (x.mag > dsoLim) return
      const v = applyM(f.M, x.vec)
      if ((L.ground && v[2] < -0.01) || dotv(v, cam.f) < 0 || !project(cam, v, P)) return
      if (P.x < -20 || P.x > w + 20 || P.y < -20 || P.y > h + 20) return
      const col = `rgba(120,215,255,${0.85 * night})`
      ctx.strokeStyle = col
      const r = clamp(5 - x.mag * 0.3, 3, 6) * zoomF
      ctx.beginPath()
      if (x.type === 'g' || x.type === 'e' || x.type === 's' || x.type === 'i') ctx.ellipse(P.x, P.y, r * 1.5, r * 0.8, -0.5, 0, 6.3)
      else if (x.type === 'oc' || x.type === 'gc') { ctx.setLineDash([2, 2]); ctx.arc(P.x, P.y, r, 0, 6.3) }
      else ctx.rect(P.x - r, P.y - r, r * 2, r * 2)
      ctx.stroke(); ctx.setLineDash([])
      hits.push({ x: P.x, y: P.y, obj: { k: 'dso', i }, pri: 1 })
      if (x.mag < (f.fov > 60 ? 5.2 : 9)) labels.push({ x: P.x + r + 3, y: P.y + 3, text: x.id, pri: 2 - x.mag * 0.1, color: `rgba(140,220,255,${0.9 * night})`, size: 10 })
    })
  }

  // ---- stars
  if (L.stars) {
    const lm = L.magLim, vec = d.vec, mag = d.mag, col = d.col
    const nameMag = zoomF > 1.2 ? 3.6 : zoomF > 1 ? 2.8 : 2.0
    const v: V3 = [0, 0, 0], m = f.M, cf = cam.f
    let lastCol = -1
    const gMin = L.ground ? -0.012 : -2
    for (let i = 0; i < d.n; i++) {
      const mg = mag[i]
      if (mg > lm) break // sorted by magnitude
      const vis = clamp((lim - mg) / 1.3, 0, 1)
      if (vis <= 0.02) continue
      const ox = vec[i * 3], oy = vec[i * 3 + 1], oz = vec[i * 3 + 2]
      v[0] = m[0] * ox + m[1] * oy + m[2] * oz; v[1] = m[3] * ox + m[4] * oy + m[5] * oz; v[2] = m[6] * ox + m[7] * oy + m[8] * oz
      if (v[2] < gMin || v[0] * cf[0] + v[1] * cf[1] + v[2] * cf[2] < -0.2 || !project(cam, v, P)) continue
      const x = P.x, y = P.y
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue
      const r = (0.5 + 0.38 * (6.6 - mg)) * zoomF
      if (col[i] !== lastCol) { ctx.fillStyle = PAL_CSS[col[i]]; lastCol = col[i] }
      ctx.globalAlpha = vis * Math.min(1, 0.4 + r * 0.45)
      if (r < 1.0) ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
      else {
        if (r > 2.2) { ctx.globalAlpha = vis * 0.9; ctx.drawImage(glowSprite(col[i]), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8); ctx.globalAlpha = vis }
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill()
      }
      const nm = d.names[i]
      if (mg < 4.2 || (nm && mg < 5)) hits.push({ x, y, obj: { k: 'star', i }, pri: 1.5 - mg * 0.1 })
      if (L.starNames && nm && mg < nameMag && vis > 0.5) labels.push({ x: x + r + 3, y: y - 2, text: nm.name || `${nm.bayer} ${nm.con}`, pri: 4 - mg, color: 'rgba(210,225,255,0.85)', size: 11 })
    }
    ctx.globalAlpha = 1
  }

  // ---- constellation names
  if (L.conNames && night > 0.1) {
    d.cons.forEach((c, i) => {
      const v = applyM(f.M, c.vec)
      if ((L.ground && v[2] < -0.1) || dotv(v, cam.f) < 0.1 || !project(cam, v, P)) return
      if (P.x < 20 || P.x > w - 20 || P.y < 20 || P.y > h - 20) return
      labels.push({ x: P.x, y: P.y, text: conName(c).toUpperCase(), pri: 0.5, color: `rgba(120,165,235,${0.7 * night})`, size: 10, italic: true })
      hits.push({ x: P.x, y: P.y, obj: { k: 'con', i }, pri: 0 })
    })
  }

  // ---- Sun, Moon, planets
  const sunP = { x: 0, y: 0 }
  const sunOk = project(cam, b.sun.hv, sunP) // also needed for the Moon's orientation when the Sun layer is off
  const kpx = (radiusDeg: number, minPx: number, at: V3) => { const th = Math.acos(clamp(dotv(at, cam.f), -1, 1)); const sc = 1 / Math.cos(th / 2) ** 2; return Math.max(minPx, radiusDeg * D2R * cam.k * sc) }
  if (L.sun && sunOk && (!L.ground || b.sun.hv[2] > -0.04) && dotv(b.sun.hv, cam.f) > -0.2) {
    const r = kpx(b.sun.radius, 7, b.sun.hv)
    const g = ctx.createRadialGradient(sunP.x, sunP.y, r * 0.6, sunP.x, sunP.y, r * 6)
    g.addColorStop(0, 'rgba(255,230,160,0.55)'); g.addColorStop(1, 'rgba(255,210,120,0)')
    ctx.fillStyle = g; ctx.fillRect(sunP.x - r * 6, sunP.y - r * 6, r * 12, r * 12)
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, r, 0, 6.3); ctx.fill()
    hits.push({ x: sunP.x, y: sunP.y, obj: { k: 'sun' }, pri: 3 })
    labels.push({ x: sunP.x + r + 4, y: sunP.y - r, text: f.names.sun, pri: 9, color: '#ffe9a8', size: 12 })
  }
  if (L.moon && (!L.ground || b.moon.hv[2] > -0.03) && dotv(b.moon.hv, cam.f) > -0.2 && project(cam, b.moon.hv, P)) {
    const r = kpx(b.moon.radius, 9, b.moon.hv)
    const mx = P.x, my = P.y
    const sp = sunOk ? sunP : null
    ctx.fillStyle = 'rgba(255,255,240,0.08)'; ctx.beginPath(); ctx.arc(mx, my, r * 2.2, 0, 6.3); ctx.fill()
    drawMoon(ctx, mx, my, r, b, sp, night)
    hits.push({ x: mx, y: my, obj: { k: 'moon' }, pri: 3 })
    labels.push({ x: mx + r + 4, y: my - r, text: f.names.moon, pri: 9, color: '#f1ecd9', size: 12 })
  }
  if (L.planets) {
    for (const p of b.planets) {
      if ((L.ground && p.hv[2] < -0.01) || dotv(p.hv, cam.f) < -0.2 || !project(cam, p.hv, P)) continue
      const vis = clamp((lim - p.mag) / 1.2, 0, 1)
      if (vis < 0.05) continue
      const r = clamp(2 + (1.5 - p.mag) * 0.7, 2, 5.5) * zoomF
      ctx.globalAlpha = vis
      ctx.fillStyle = PLANET_COLOR[p.id]
      ctx.drawImage(glowSprite(8), P.x - r * 3.5, P.y - r * 3.5, r * 7, r * 7)
      ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, 6.3); ctx.fill()
      ctx.globalAlpha = 1
      hits.push({ x: P.x, y: P.y, obj: { k: 'planet', id: p.id }, pri: 3 })
      labels.push({ x: P.x + r + 4, y: P.y - r, text: f.names.planets[p.id] ?? '', pri: 8, color: PLANET_COLOR[p.id], size: 12 })
    }
  }

  // ---- satellites
  if (L.sats) {
    for (const s of f.sats) {
      if (L.satsSunlitOnly && !s.sunlit) continue
      if ((L.ground && s.hv[2] < -0.005) || dotv(s.hv, cam.f) < -0.2 || !project(cam, s.hv, P)) continue
      if (P.x < -10 || P.x > w + 10 || P.y < -10 || P.y > h + 10) continue
      const iss = s.norad === 25544
      const vis = s.sunlit ? 1 : 0.45
      ctx.fillStyle = s.sunlit ? '#ffe28a' : '#8892a8'
      ctx.globalAlpha = vis
      const r = iss ? 3.6 : 2
      ctx.beginPath()
      if (iss) { ctx.moveTo(P.x, P.y - r - 1); ctx.lineTo(P.x + r + 1, P.y); ctx.lineTo(P.x, P.y + r + 1); ctx.lineTo(P.x - r - 1, P.y); ctx.closePath() } else ctx.arc(P.x, P.y, r, 0, 6.3)
      ctx.fill(); ctx.globalAlpha = 1
      hits.push({ x: P.x, y: P.y, obj: { k: 'sat', norad: s.norad }, pri: 2.5 })
      if (iss || zoomF > 1.15) labels.push({ x: P.x + r + 4, y: P.y + 3, text: s.name, pri: iss ? 7 : 1, color: s.sunlit ? '#ffe9a8' : '#9aa3b8', size: 10 })
    }
  }

  // ---- ground + horizon
  {
    const nz = cam.f[2] // = sin(alt of view)
    const nx = cam.r[2], ny = cam.u[2]
    const gc = lerp3([8, 11, 9], [52, 66, 46], clamp((sunAlt + 8) / 18, 0, 1))
    if (f.overlay) { // real horizon is in the camera picture: just the line (it tilts with the phone's roll)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5
      const hz: V3[] = []; for (let a = 0; a <= 360; a += 2) hz.push(hzVec(0, a))
      stroke(ctx, cam, hz)
    } else if (L.ground) {
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
