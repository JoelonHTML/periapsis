// Canvas rendering of a porkchop grid: colour map + contour lines (marching squares) + axes + markers.
import { DAY, toMs } from '../../lib/astro.ts'
import { finiteStats, niceLevels, type Grid, type GridSpec, type Metric } from './porkchop.ts'

export const MARGIN = { l: 42, r: 10, t: 8, b: 30 }
export const plotRect = (W: number, H: number) => ({ x: MARGIN.l, y: MARGIN.t, w: W - MARGIN.l - MARGIN.r, h: H - MARGIN.t - MARGIN.b })

/** CSS pixel position in the canvas → (departure epoch, time of flight in s), or null outside the plot. */
export function pxToPoint(s: GridSpec, W: number, H: number, x: number, y: number) {
  const p = plotRect(W, H)
  if (x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) return null
  return { tDep: s.t0 + ((x - p.x) / p.w) * (s.t1 - s.t0), tof: s.tof0 + (1 - (y - p.y) / p.h) * (s.tof1 - s.tof0) }
}
export function pointToPx(s: GridSpec, W: number, H: number, tDep: number, tof: number) {
  const p = plotRect(W, H)
  return { x: p.x + ((tDep - s.t0) / (s.t1 - s.t0)) * p.w, y: p.y + (1 - (tof - s.tof0) / (s.tof1 - s.tof0)) * p.h }
}

// inferno, reversed: low (good) = bright
const STOPS: [number, [number, number, number]][] = [
  [0, [252, 255, 164]], [0.2, [249, 142, 9]], [0.4, [188, 55, 84]], [0.6, [120, 28, 109]], [0.8, [50, 10, 94]], [1, [8, 4, 20]],
]
const LUT = (() => {
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++
    const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1], u = (t - t0) / (t1 - t0)
    for (let c = 0; c < 3; c++) out[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * u
  }
  return out
})()
export const colourCss = (t: number) => { const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 3; return `rgb(${LUT[i]},${LUT[i + 1]},${LUT[i + 2]})` }

/** Value range used for colours and contour levels: from the minimum up to where ~30 % of the valid cells lie. */
export function scaleOf(a: Float32Array, kind: 'c3' | 'dv' | 'vinf') {
  const st = finiteStats(a)
  const hi = kind === 'c3' ? st.min * 8 + 6 : kind === 'dv' ? st.min * 2.2 : st.min * 2 + 1
  return { min: st.min, max: hi }
}

export interface DrawOpts {
  metric: Metric
  labels: { x: string; y: string }
  sel?: { tDep: number; tof: number } | null
  min?: { tDep: number; tof: number } | null
}

function bilinear(a: Float32Array, nx: number, ny: number, fx: number, fy: number) {
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), u = fx - i, v = fy - j
  const a00 = a[j * nx + i], a10 = a[j * nx + i + 1], a01 = a[(j + 1) * nx + i], a11 = a[(j + 1) * nx + i + 1]
  if (Number.isFinite(a00 + a10 + a01 + a11)) return a00 * (1 - u) * (1 - v) + a10 * u * (1 - v) + a01 * (1 - u) * v + a11 * u * v
  const near = a[(Math.round(fy)) * nx + Math.round(fx)]
  return near
}

const SEGS: Record<number, number[][]> = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[3, 2]],
  9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[3, 0]],
}

function contours(a: Float32Array, s: GridSpec, level: number, toPx: (fi: number, fj: number) => [number, number]) {
  const segs: [number, number, number, number][] = []
  const { nx, ny } = s
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const A = a[j * nx + i], B = a[j * nx + i + 1], C = a[(j + 1) * nx + i + 1], D = a[(j + 1) * nx + i]
    if (!Number.isFinite(A + B + C + D)) continue
    const idx = (A >= level ? 1 : 0) | (B >= level ? 2 : 0) | (C >= level ? 4 : 0) | (D >= level ? 8 : 0)
    const list = SEGS[idx]
    if (!list) continue
    // edges: 0 = A–B (bottom row j), 1 = B–C (right), 2 = D–C (top row j+1), 3 = A–D (left)
    const pt = (e: number): [number, number] => {
      if (e === 0) return toPx(i + (level - A) / (B - A), j)
      if (e === 1) return toPx(i + 1, j + (level - B) / (C - B))
      if (e === 2) return toPx(i + (level - D) / (C - D), j + 1)
      return toPx(i, j + (level - A) / (D - A))
    }
    for (const [e1, e2] of list) { const p = pt(e1), q = pt(e2); segs.push([p[0], p[1], q[0], q[1]]) }
  }
  return segs
}

const monthLabel = (t: number) => new Date(toMs(t)).toISOString().slice(0, 7)

export function drawPlot(canvas: HTMLCanvasElement, g: Grid, W: number, H: number, o: DrawOpts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const s = g.spec, p = plotRect(W, H)
  const arr = o.metric === 'c3' ? g.c3 : g.dv
  const sc = scaleOf(arr, o.metric)
  // colour map (bilinear on the node values, per device pixel)
  const pw = Math.round(p.w * dpr), ph = Math.round(p.h * dpr)
  if (pw > 1 && ph > 1 && Number.isFinite(sc.min)) {
    const img = ctx.createImageData(pw, ph)
    const span = sc.max - sc.min || 1
    for (let y = 0; y < ph; y++) {
      const fy = (1 - y / (ph - 1)) * (s.ny - 1)
      for (let x = 0; x < pw; x++) {
        const v = bilinear(arr, s.nx, s.ny, (x / (pw - 1)) * (s.nx - 1), fy)
        const k = (y * pw + x) * 4
        if (!Number.isFinite(v)) { img.data[k] = 24; img.data[k + 1] = 24; img.data[k + 2] = 27; img.data[k + 3] = 255; continue }
        const c = Math.round(Math.sqrt(Math.max(0, Math.min(1, (v - sc.min) / span))) * 255) * 3
        img.data[k] = LUT[c]; img.data[k + 1] = LUT[c + 1]; img.data[k + 2] = LUT[c + 2]; img.data[k + 3] = 255
      }
    }
    const off = document.createElement('canvas'); off.width = pw; off.height = ph
    off.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(off, p.x, p.y, p.w, p.h)
  } else {
    ctx.fillStyle = '#18181b'; ctx.fillRect(p.x, p.y, p.w, p.h)
  }
  ctx.save()
  ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip()
  const toPx = (fi: number, fj: number): [number, number] => [p.x + (fi / (s.nx - 1)) * p.w, p.y + p.h - (fj / (s.ny - 1)) * p.h]
  const drawLevels = (a: Float32Array, kind: 'c3' | 'vinf', dash: number[], colour: string, ax: number, ay: number) => {
    const r = scaleOf(a, kind)
    if (!Number.isFinite(r.min)) return
    ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const lv of niceLevels(r.min, r.max, kind === 'c3' ? 7 : 4)) {
      const segs = contours(a, s, lv, toPx)
      if (!segs.length) continue
      ctx.setLineDash(dash)
      for (const [w, st] of [[3, 'rgba(0,0,0,0.45)'], [1.1, colour]] as const) {
        ctx.lineWidth = w; ctx.strokeStyle = st; ctx.beginPath()
        for (const q of segs) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]) }
        ctx.stroke()
      }
      ctx.setLineDash([])
      // one label per level, at the segment closest to an anchor point (different anchors for C3 and v∞ so they rarely collide)
      let best = segs[0], bd = Infinity
      for (const q of segs) { const d = Math.hypot((q[0] + q[2]) / 2 - (p.x + p.w * ax), (q[1] + q[3]) / 2 - (p.y + p.h * ay)); if (d < bd) { bd = d; best = q } }
      const mx = (best[0] + best[2]) / 2, my = (best[1] + best[3]) / 2, txt = String(+lv.toFixed(2))
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, mx, my)
      ctx.fillStyle = colour; ctx.fillText(txt, mx, my)
    }
  }
  drawLevels(g.c3, 'c3', [], '#ffffff', 0.5, 0.5)
  drawLevels(g.vinfArr, 'vinf', [4, 3], '#67e8f9', 0.2, 0.85)
  ctx.restore()

  // axes
  ctx.strokeStyle = '#52525b'; ctx.lineWidth = 1; ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h)
  ctx.fillStyle = '#a1a1aa'; ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  const seen = new Set<string>()
  for (let k = 0; k < 4; k++) {
    const t = s.t0 + ((k + 0.5) / 4) * (s.t1 - s.t0)
    const d = new Date(toMs(t)); const snapped = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const ts = (snapped - toMs(0)) / 1000, lab = monthLabel(ts)
    if (seen.has(lab) || ts < s.t0 || ts > s.t1) continue
    seen.add(lab)
    const x = p.x + ((ts - s.t0) / (s.t1 - s.t0)) * p.w
    ctx.fillRect(x, p.y + p.h, 1, 4)
    ctx.fillText(lab, Math.max(p.x + 18, Math.min(p.x + p.w - 18, x)), p.y + p.h + 6)
  }
  ctx.fillText(o.labels.x, p.x + p.w / 2, H - 12)
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  for (const d of niceLevels(s.tof0 / DAY, s.tof1 / DAY, 5)) {
    const y = p.y + (1 - (d * DAY - s.tof0) / (s.tof1 - s.tof0)) * p.h
    ctx.fillRect(p.x - 4, y, 4, 1)
    ctx.fillText(String(Math.round(d)), p.x - 6, y)
  }
  ctx.save(); ctx.translate(9, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(o.labels.y, 0, 0); ctx.restore()

  // markers
  if (o.min) {
    const m = pointToPx(s, W, H, o.min.tDep, o.min.tof)
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(m.x, m.y, 6.5, 0, 7); ctx.stroke()
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x, m.y, 6.5, 0, 7); ctx.stroke()
  }
  if (o.sel) {
    const m = pointToPx(s, W, H, o.sel.tDep, o.sel.tof)
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip()
    for (const [w, c] of [[3, 'rgba(0,0,0,0.6)'], [1.2, '#22d3ee']] as const) {
      ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath()
      ctx.moveTo(m.x - 9, m.y); ctx.lineTo(m.x + 9, m.y); ctx.moveTo(m.x, m.y - 9); ctx.lineTo(m.x, m.y + 9); ctx.stroke()
    }
    ctx.restore()
  }
}

