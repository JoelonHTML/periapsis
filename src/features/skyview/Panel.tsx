// Tab "Sterrenkaart" (skyview) in Explore: pick a place on Earth, then look at the sky from there (the canvas is Stage.tsx).
import { useEffect, useMemo, useState } from 'react'
import { LocateFixed, Map as MapIcon, Search, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Section } from '@/components/bits'
import { fmtDateTime, toJ2000 } from '@/lib/astro'
import { clock, setSpeedNow } from '@/lib/store'
import { locate, observer, setObserver, useObserver } from '@/lib/observer'
import { useSettings } from '@/lib/settings'
import { useT } from '@/lib/i18n'
import { ui } from '@/lib/ui-store'
import { useClockTick } from '@/components/FlybyBar'
import '../tonight/i18n'
import './i18n'
import { SkyStage } from './Stage.tsx'
import { PlaceMap } from './PlaceMap.tsx'
import { findPlaces, loadPlaces, nearestPlace, coordText, type Place } from './places.ts'
import { gotoObj, toggleAr } from './control.ts'
import { searchObjects, skyCtx, skyState } from './scene.ts'
import { layers, setLayer, useLayers, useView, type Layers } from './state.ts'
import { solarClock } from './geom.ts'

const parseCoords = (q: string): [number, number] | null => {
  const m = q.trim().replace(/,/g, ' ').replace(/[°NnEe]/g, ' ').split(/\s+/).map(Number)
  return m.length === 2 && m.every(Number.isFinite) && Math.abs(m[0]) <= 90 && Math.abs(m[1]) <= 180 ? [m[0], m[1]] : null
}

function PlaceBlock() {
  const t = useT()
  const lat = useObserver((s) => s.lat), lon = useObserver((s) => s.lon), name = useObserver((s) => s.name), gps = useObserver((s) => s.fromGps)
  const [q, setQ] = useState(''), [places, setPlaces] = useState<Place[]>([]), [map, setMap] = useState(false), [busy, setBusy] = useState(false), [fail, setFail] = useState(false)
  useEffect(() => { if (q.length >= 1 && !places.length) void loadPlaces().then(setPlaces) }, [q, places.length])
  const coords = parseCoords(q)
  const hits = useMemo(() => (coords ? [] : findPlaces(q, places, 6)), [q, places, coords])
  const choose = (p: Place) => { setObserver({ lat: p[2], lon: p[3], altM: p[5] ?? 0, name: p[0], fromGps: false }); setQ(''); ui.set({ sheet: 'closed' }) }
  const fromGps = async () => {
    setBusy(true); setFail(false)
    const ok = await locate()
    if (ok) { const l = await loadPlaces(), o = observer.get(), n = nearestPlace(o.lat, o.lon, l, 30); setObserver({ name: n ? n[0] : '' }) } else setFail(true)
    setBusy(false)
  }
  return (
    <div className="grid gap-2">
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="text-base font-semibold leading-tight">{name || (gps ? 'GPS' : t('sky.loc.unnamed'))}</div>
        <div className="text-xs tabular-nums text-muted-foreground">{coordText(lat, lon)} · {t('sv.solarTime')} {solarClock(Date.now(), lon).hhmm}</div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sv.placeSearch')} aria-label={t('sv.placeSearch')} autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter') { if (coords) { setObserver({ lat: coords[0], lon: coords[1], altM: 0, name: '', fromGps: false }); setQ('') } else if (hits[0]) choose(hits[0]) } }} />
      </div>
      {coords && <Button type="button" variant="secondary" className="h-11 justify-start" onClick={() => { setObserver({ lat: coords[0], lon: coords[1], altM: 0, name: '', fromGps: false }); setQ('') }}>{t('sv.useCoords', { c: coordText(coords[0], coords[1]) })}</Button>}
      {hits.length > 0 && (
        <ul className="grid gap-1" role="listbox">
          {hits.map((p, i) => (
            <li key={`${p[0]}${p[2]}${i}`}>
              <button type="button" onClick={() => choose(p)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border px-3 text-left text-sm active:bg-muted">
                <span className="min-w-0 truncate">{p[0]} <span className="text-muted-foreground">{p[1]}</span></span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{coordText(p[2], p[3])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !coords && places.length > 0 && hits.length === 0 && <p className="text-xs text-muted-foreground">{t('sv.noPlace')}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="h-11 gap-2" disabled={busy} onClick={() => void fromGps()}><LocateFixed className="size-4" />{busy ? t('sky.loc.locating') : t('sv.gps')}</Button>
        <Button type="button" variant={map ? 'default' : 'secondary'} className="h-11 gap-2" aria-expanded={map} onClick={() => setMap(!map)}><MapIcon className="size-4" />{t('sv.map')}</Button>
      </div>
      {fail && <p role="status" className="text-xs text-amber-300">{t('sky.loc.gpsFail')}</p>}
      {map && <PlaceMap />}
    </div>
  )
}

function TimeBlock() {
  const t = useT()
  useClockTick(500)
  const lon = useObserver((s) => s.lon)
  const ms = Date.UTC(2000, 0, 1, 12) + clock.t * 1000
  const step = (s: number) => { clock.t += s }
  const now = () => { clock.t = toJ2000(Date.now()); setSpeedNow(1); clock.paused = false }
  return (
    <div className="grid gap-2">
      <div className="text-sm tabular-nums">{fmtDateTime(clock.t)} UTC · <span className="text-muted-foreground">{solarClock(ms, lon).hhmm} {t('sv.solarTime')}</span></div>
      <div className="grid grid-cols-5 gap-1.5">
        <Button variant="outline" className="h-11 px-0" onClick={() => step(-86400)} aria-label={t('sky.prev')}>−1 d</Button>
        <Button variant="outline" className="h-11 px-0" onClick={() => step(-3600)}>−1 h</Button>
        <Button className="h-11 px-0" onClick={now}>{t('sky.now')}</Button>
        <Button variant="outline" className="h-11 px-0" onClick={() => step(3600)}>+1 h</Button>
        <Button variant="outline" className="h-11 px-0" onClick={() => step(86400)} aria-label={t('sky.next')}>+1 d</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('sv.timeH')}</p>
    </div>
  )
}

function FindBlock() {
  const t = useT()
  const [q, setQ] = useState('')
  const ready = skyState.useStore((s) => s.skyReady), nSat = skyState.useStore((s) => s.satCount)
  const hits = useMemo(() => searchObjects(q, skyCtx.sats), [q, ready, nSat])
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sv.findPh')} aria-label={t('sv.find')} autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { gotoObj(hits[0].obj); setQ(''); ui.set({ sheet: 'closed' }) } }} />
      </div>
      {hits.length > 0 && (
        <ul className="grid gap-1">
          {hits.map((h, i) => (
            <li key={i}>
              <button type="button" onClick={() => { gotoObj(h.obj); setQ(''); ui.set({ sheet: 'closed' }) }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border px-3 text-left text-sm active:bg-muted">
                <span className="min-w-0 truncate">{h.label}</span><span className="shrink-0 text-[11px] text-muted-foreground">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const GROUPS: [string, (keyof Layers)[]][] = [
  ['sv.g.stars', ['stars', 'starNames', 'lines', 'conNames']],
  ['sv.g.solar', ['sun', 'moon', 'planets']],
  ['sv.g.sats', ['sats', 'satsSunlitOnly']],
  ['sv.g.deep', ['mw', 'dso']],
  ['sv.g.help', ['gridAz', 'gridEq', 'ecliptic', 'ground', 'cardinals', 'atmosphere']],
]
function Filters() {
  const t = useT()
  const L = useLayers((s) => s)
  const satStatus = skyState.useStore((s) => s.satStatus), nSat = skyState.useStore((s) => s.satCount), ready = skyState.useStore((s) => s.skyReady)
  const count = useMemo(() => { const d = skyCtx.data; if (!d) return 0; let n = 0; while (n < d.n && d.mag[n] <= L.magLim) n++; return n }, [L.magLim, ready])
  return (
    <div className="grid gap-3">
      {GROUPS.map(([title, keys]) => (
        <div key={title} className="grid gap-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">{t(title)}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {keys.map((k) => (
              <label key={k} className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-2.5 text-[13px] leading-tight ${k === 'satsSunlitOnly' && !L.sats ? 'opacity-50' : ''}`}>
                <span className="min-w-0">{t(`sv.l.${k}`)}</span>
                <Switch checked={L[k] as boolean} disabled={k === 'satsSunlitOnly' && !L.sats} onCheckedChange={(v) => setLayer(k, v as never)} aria-label={t(`sv.l.${k}`)} />
              </label>
            ))}
          </div>
          {title === 'sv.g.sats' && <p className="text-[11px] text-muted-foreground">{satStatus === 'loading' ? t('sv.sats.loading') : satStatus === 'ok' ? t('sv.sats.ok', { n: nSat }) : satStatus === 'none' ? t('sv.sats.none') : ''}</p>}
        </div>
      ))}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between text-sm"><span>{t('sv.magLim')}</span><span className="tabular-nums text-muted-foreground">{L.magLim.toFixed(1)} · {count} {t('sv.stars')}</span></div>
        <Slider min={2} max={6.5} step={0.1} value={[L.magLim]} onValueChange={(v) => setLayer('magLim', v[0])} aria-label={t('sv.magLim')} />
      </div>
      <Button variant="ghost" size="sm" className="justify-self-start text-xs" onClick={() => layers.set({ ...layers.get(), stars: true, starNames: true, lines: true, conNames: true, sun: true, moon: true, planets: true, sats: true, satsSunlitOnly: false, mw: true, dso: true, gridAz: false, gridEq: false, ecliptic: false, ground: true, cardinals: true, atmosphere: true, magLim: 6 })}>{t('sv.reset')}</Button>
    </div>
  )
}

export function SkyviewPanel() {
  const t = useT()
  const ar = useView((s) => s.ar)
  useSettings((s) => s.lang)
  return (
    <div className="grid gap-5">
      <SkyStage />
      <Section title={t('sv.place')}><PlaceBlock /></Section>
      <Section title={t('sv.find')}><FindBlock /></Section>
      <Section title={t('sv.time')}><TimeBlock /></Section>
      <Section title={t('sv.filters')}><Filters /></Section>
      <Section title={t('sv.arTitle')}>
        <div className="grid gap-2">
          <Button variant={ar === 'on' ? 'default' : 'secondary'} className="h-11 gap-2" aria-pressed={ar === 'on'} onClick={() => void toggleAr()}><Smartphone className="size-4" />{t(ar === 'on' ? 'sv.ar.on' : 'sv.ar')}</Button>
          <p className="text-xs text-muted-foreground">{t('sv.ar.h')}</p>
        </div>
      </Section>
      <p className="text-xs text-muted-foreground">{t('sv.intro')}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t('sv.credits')}</p>
    </div>
  )
}
