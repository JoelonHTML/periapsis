import { useMemo, useState, type ReactNode } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { locate, setObserver, useObserver } from '@/lib/observer'
import { useSettings } from '@/lib/settings'
import { useT } from '@/lib/i18n'
import './i18n'
import type { Site } from './sky.ts'
import { localISO, num, timeStr, type L } from './fmt.ts'

export const useLang = (): L => useSettings((s) => s.lang)

/** The observer as a pure `Site` (stable between renders while the place does not change). */
export function useSite(): Site {
  const lat = useObserver((s) => s.lat), lon = useObserver((s) => s.lon), altM = useObserver((s) => s.altM)
  return useMemo(() => ({ lat, lon, altM }), [lat, lon, altM])
}

/** Time of day; a small "+1" marks instants after midnight of the chosen night's date. */
export function TimeOf({ ms, day, dash = '—' }: { ms: number | null | undefined; day?: string; dash?: string }) {
  const lang = useLang()
  if (ms == null) return <span className="text-muted-foreground">{dash}</span>
  const later = day && localISO(ms) > day
  return <span className="tabular-nums">{timeStr(ms, lang)}{later && <sup className="ml-0.5 text-[9px] text-muted-foreground">+1</sup>}</span>
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'ok' | 'muted' | 'info' | 'warn' }) {
  const c = tone === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : tone === 'info' ? 'bg-sky-500/15 text-sky-300' : tone === 'warn' ? 'bg-amber-500/15 text-amber-300' : 'bg-muted text-muted-foreground'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${c}`}>{children}</span>
}

const parseCoord = (s: string) => parseFloat(s.trim().replace(',', '.'))

/** Where am I: name + coordinates, with GPS and manual entry (shared observer store). */
export function LocationBar() {
  const t = useT()
  const lat = useObserver((s) => s.lat), lon = useObserver((s) => s.lon), name = useObserver((s) => s.name), gps = useObserver((s) => s.fromGps)
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  const [la, setLa] = useState(''), [lo, setLo] = useState(''), [nm, setNm] = useState('')
  const label = name || (gps ? 'GPS' : t('sky.loc.unnamed'))
  const coord = `${num(Math.abs(lat), 2, lang)}°${t(lat >= 0 ? 'sky.dir.0' : 'sky.dir.8')} ${num(Math.abs(lon), 2, lang)}°${t(lon >= 0 ? 'sky.dir.4' : 'sky.dir.12')}`
  const commit = (nlat: string, nlon: string, nname: string) => {
    const a = parseCoord(nlat), b = parseCoord(nlon)
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) setObserver({ lat: a, lon: b, name: nname.trim(), fromGps: false })
  }
  const toggle = () => {
    if (!open) { setLa(String(lat)); setLo(String(lon)); setNm(name) }
    setOpen(!open)
  }
  const useGps = async () => {
    setBusy(true); setFail(false)
    const ok = await locate()
    setBusy(false)
    if (ok) setOpen(false); else setFail(true)
  }
  return (
    <div className="grid gap-2">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/40 px-3 text-left text-sm">
        <MapPin className="size-4 shrink-0 text-sky-300" />
        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{label}</span> <span className="text-muted-foreground tabular-nums">· {coord}</span></span>
        <span className="shrink-0 text-xs text-muted-foreground">{t('sky.loc.change')}</span>
      </button>
      {open && (
        <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-3">
          <Button type="button" variant="secondary" className="h-11 gap-2" disabled={busy} onClick={useGps}>
            <LocateFixed className="size-4" />{busy ? t('sky.loc.locating') : t('sky.loc.gps')}
          </Button>
          {fail && <p role="status" className="text-xs text-amber-300">{t('sky.loc.gpsFail')}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="sky-lat" className="text-xs text-muted-foreground">{t('sky.loc.lat')}</Label>
              <Input id="sky-lat" className="h-11" inputMode="decimal" value={la} onChange={(e) => { setLa(e.target.value); commit(e.target.value, lo, nm) }} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sky-lon" className="text-xs text-muted-foreground">{t('sky.loc.lon')}</Label>
              <Input id="sky-lon" className="h-11" inputMode="decimal" value={lo} onChange={(e) => { setLo(e.target.value); commit(la, e.target.value, nm) }} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sky-name" className="text-xs text-muted-foreground">{t('sky.loc.name')}</Label>
            <Input id="sky-name" className="h-11" value={nm} onChange={(e) => { setNm(e.target.value); commit(la, lo, e.target.value) }} />
          </div>
          <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>{t('sky.loc.done')}</Button>
        </div>
      )}
    </div>
  )
}
