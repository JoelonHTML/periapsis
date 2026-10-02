// 2D ground track on the app's equirectangular Earth texture (2048×1024, lon 0 in the centre, north up).
import { useEffect, useRef } from 'react'
import TEX_EARTH from '@/assets/earth.jpg'
import { DEG } from '../../lib/astro.ts'
import { groundTrack, orbitInfo, stateAt, subSolar } from './orbit.ts'
import { satrecOf, type SatRecord } from './tle.ts'
import { SEL_COLORS } from './state.ts'

let earthImg: HTMLImageElement | null = null
function getEarth(done: () => void) {
  if (earthImg) return earthImg
  const im = new Image()
  im.onload = done
  im.src = TEX_EARTH
  return (earthImg = im)
}

const W = 720, H = 360
const X = (lon: number) => ((lon + 180) / 360) * W
const Y = (lat: number) => ((90 - lat) / 180) * H

let nightCanvas: HTMLCanvasElement | null = null
/** Night shading from the Sun's elevation at every cell: sin(el) = sin φ sin δ + cos φ cos δ cos(λ − λ☉); soft through twilight. */
function drawNight(g: CanvasRenderingContext2D, ms: number) {
  const nw = 180, nh = 90, s = subSolar(ms)
  nightCanvas ??= Object.assign(document.createElement('canvas'), { width: nw, height: nh })
  const ng = nightCanvas.getContext('2d')!, img = ng.createImageData(nw, nh)
  const sd = Math.sin(s.lat * DEG), cd = Math.cos(s.lat * DEG)
  for (let j = 0; j < nh; j++) {
    const lat = (90 - (j + 0.5) * (180 / nh)) * DEG
    for (let i = 0; i < nw; i++) {
      const lon = (-180 + (i + 0.5) * (360 / nw)) * DEG
      const el = Math.asin(Math.sin(lat) * sd + Math.cos(lat) * cd * Math.cos(lon - s.lon * DEG)) / DEG
      const a = el >= 0 ? 0 : el <= -12 ? 0.62 : 0.62 * (-el / 12)
      const k = (j * nw + i) * 4
      img.data[k] = 2; img.data[k + 1] = 6; img.data[k + 2] = 20; img.data[k + 3] = a * 255
    }
  }
  ng.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.drawImage(nightCanvas, 0, 0, W, H)
  // sub-solar point
  g.fillStyle = '#fde047'; g.beginPath(); g.arc(X(s.lon), Y(s.lat), 5, 0, 7); g.fill()
}

function strokeTrack(g: CanvasRenderingContext2D, pts: { lat: number; lon: number }[], color: string, width: number) {
  g.strokeStyle = color; g.lineWidth = width; g.beginPath()
  pts.forEach((p, i) => {
    if (i === 0 || Math.abs(p.lon - pts[i - 1].lon) > 180) g.moveTo(X(p.lon), Y(p.lat)); else g.lineTo(X(p.lon), Y(p.lat))
  })
  g.stroke()
}

export function GroundTrack({ recs, active, ms, obs, youLabel }: { recs: SatRecord[]; active: number; ms: number; obs: { lat: number; lon: number }; youLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const redraw = useRef<() => void>(() => {})
  useEffect(() => {
    const c = ref.current!, g = c.getContext('2d')!
    const draw = () => {
      g.clearRect(0, 0, W, H)
      const im = getEarth(() => redraw.current())
      if (im.complete && im.naturalWidth) g.drawImage(im, 0, 0, W, H); else { g.fillStyle = '#0b1b33'; g.fillRect(0, 0, W, H) }
      drawNight(g, ms)
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.beginPath()
      for (let lon = -150; lon <= 150; lon += 30) { g.moveTo(X(lon), 0); g.lineTo(X(lon), H) }
      for (let lat = -60; lat <= 60; lat += 30) { g.moveTo(0, Y(lat)); g.lineTo(W, Y(lat)) }
      g.stroke()
      g.font = '600 20px system-ui, sans-serif'; g.textBaseline = 'middle'
      recs.forEach((rec, i) => {
        const sr = satrecOf(rec)
        if (!sr) return
        const P = orbitInfo(sr).periodS, isActive = i === active
        const tr = groundTrack(sr, ms, Math.min(P, 6 * 3600), Math.min(P, 6 * 3600), Math.max(20, Math.min(P, 6 * 3600) / 150))
        const past = tr.filter((p) => p.past), next = tr.filter((p) => !p.past)
        strokeTrack(g, past, isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', isActive ? 3 : 2)
        strokeTrack(g, [past[past.length - 1], ...next].filter(Boolean), isActive ? '#fde047' : SEL_COLORS[i % 4], isActive ? 3 : 2)
        const s = stateAt(sr, ms)
        if (!s) return
        g.fillStyle = SEL_COLORS[i % 4]; g.strokeStyle = '#000'; g.lineWidth = 3
        g.beginPath(); g.arc(X(s.lon), Y(s.lat), isActive ? 9 : 7, 0, 7); g.fill(); g.stroke()
        const right = X(s.lon) < W - 160
        g.textAlign = right ? 'left' : 'right'
        g.strokeText(rec.name, X(s.lon) + (right ? 14 : -14), Y(s.lat) - 14); g.fillStyle = '#fff'
        g.fillText(rec.name, X(s.lon) + (right ? 14 : -14), Y(s.lat) - 14)
      })
      g.fillStyle = '#ef4444'; g.strokeStyle = '#fff'; g.lineWidth = 2.5
      g.beginPath(); g.moveTo(X(obs.lon), Y(obs.lat) - 10); g.lineTo(X(obs.lon) + 8, Y(obs.lat) + 6); g.lineTo(X(obs.lon) - 8, Y(obs.lat) + 6); g.closePath(); g.fill(); g.stroke()
      g.textAlign = X(obs.lon) < W - 90 ? 'left' : 'right'; g.fillStyle = '#fff'
      g.fillText(youLabel, X(obs.lon) + (g.textAlign === 'left' ? 12 : -12), Y(obs.lat) + 16)
    }
    redraw.current = draw
    draw()
  }, [recs, active, ms, obs.lat, obs.lon, youLabel])
  return <canvas ref={ref} width={W} height={H} className="block w-full rounded-lg border border-white/10" style={{ aspectRatio: '2 / 1' }} />
}
