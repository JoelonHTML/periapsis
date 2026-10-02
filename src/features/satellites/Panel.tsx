import { Check, LocateFixed, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KV, Section, f } from '@/components/bits'
import { toJ2000, toMs } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { locate, setObserver, useObserver } from '@/lib/observer'
import { clock } from '@/lib/store'
import { GroundTrack } from './GroundTrack'
import { GROUPS, type GroupId } from './data'
import './i18n'
import { compass8, isSunlit, orbitInfo, stateAt, sunAt } from './orbit'
import { findPasses } from './passes'
import { MAX_SELECTED, SEL_COLORS, addCustomTle, jumpToNow, selectGroup, setActive, toggleSat, useSats } from './state'
import { epochMs, satrecOf, type SatRecord } from './tle'

/** Re-renders once a second with the app clock (ms since 1970), so time controls and the "Nu" button are honoured. */
function useSimMs() {
  const [ms, setMs] = useState(() => toMs(clock.t))
  useEffect(() => {
    const id = setInterval(() => setMs(toMs(clock.t)), 1000)
    return () => clearInterval(id)
  }, [])
  return ms
}
const fmtAge = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 90 ? `${m} min` : m < 2880 ? `${(m / 60).toFixed(m < 600 ? 1 : 0)} h` : `${Math.round(m / 1440)} d`
}
const GROUP_IDS: GroupId[] = [...GROUPS, 'custom']
const localTime = (ms: number, withDate = true) => new Date(ms).toLocaleString([], withDate ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function useBootGroup() {
  const group = useSats((s) => s.group), status = useSats((s) => s.status)
  useEffect(() => { if (status === 'idle') void selectGroup(group) }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

export function SatsPanel() {
  const t = useT()
  useBootGroup()
  const s = useSats((x) => x)
  const obs = useObserver((o) => o)
  const ms = useSimMs()
  const [q, setQ] = useState(''), [msg, setMsg] = useState(''), [paste, setPaste] = useState('')
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? s.sats.filter((x) => x.name.toLowerCase().includes(n) || String(x.norad).includes(n)) : s.sats
  }, [s.sats, q])
  const shown = list.slice(0, 60)
  const act = s.selected[s.active]
  const sr = act ? satrecOf(act) : null
  const live = sr ? stateAt(sr, ms) : null
  const info = sr ? orbitInfo(sr) : null
  const lit = live ? isSunlit(live.r, sunAt(ms)) : null
  const age = s.fetchedAt ? fmtAge(Date.now() - s.fetchedAt) : null
  const ep = act ? epochMs(act) : NaN
  const epAgeD = Number.isFinite(ep) ? (ms - ep) / 86400000 : NaN
  const pick = (r: SatRecord) => { if (toggleSat(r) === 'max') setMsg(t('sat.max', { m: MAX_SELECTED })); else setMsg('') }

  return (
    <div className="grid gap-4">
      <Section title={t('tab.sats')}>
        <div className="flex flex-wrap gap-1.5">
          {GROUP_IDS.map((g) => (
            <Button key={g} size="sm" variant={s.group === g ? 'default' : 'outline'} className="h-11 px-3 text-xs" onClick={() => void selectGroup(g)}>{t(`sat.group.${g}`)}</Button>
          ))}
        </div>
        {s.group === 'starlink' && <p className="text-[11px] text-amber-300/90">{t('sat.starlink.hint')}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            {s.status === 'loading' ? t('sat.loading') : age ? t('sat.age', { age }) : t('sat.age.none')}
            {s.status !== 'loading' && s.status !== 'idle' && s.status !== 'cached' && <div className={s.status === 'fresh' ? 'text-emerald-400' : 'text-amber-300'}>{t(`sat.st.${s.status}`)}</div>}
          </div>
          {s.group !== 'custom' && (
            <Button size="icon" variant="outline" className="size-11 shrink-0" aria-label={t('sat.refresh')} title={t('sat.refresh')} disabled={s.status === 'loading'} onClick={() => void selectGroup(s.group, true)}>
              <RefreshCw className={s.status === 'loading' ? 'animate-spin' : ''} />
            </Button>
          )}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sat.search')} className="h-11" inputMode="search" />
        <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {shown.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t('sat.none')}</p>}
          {shown.map((r) => {
            const on = s.selected.some((x) => x.norad === r.norad)
            return (
              <button key={r.norad} type="button" onClick={() => pick(r)} aria-pressed={on}
                className={`flex min-h-11 w-full items-center justify-between gap-2 border-b border-white/5 px-3 text-left text-sm last:border-0 ${on ? 'bg-cyan-500/15' : 'hover:bg-white/5'}`}>
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground tabular-nums">{r.norad}{on && <Check className="size-4 text-cyan-400" />}</span>
              </button>
            )
          })}
          {list.length > shown.length && <p className="p-2 text-center text-[11px] text-muted-foreground">{t('sat.more', { n: list.length - shown.length })}</p>}
        </div>
        {msg && <p className="text-[11px] text-amber-300">{msg}</p>}
        <details className="rounded-lg border border-white/10">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs text-muted-foreground">{t('sat.paste')}</summary>
          <div className="grid gap-2 p-3 pt-0">
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={t('sat.paste.ph')} spellCheck={false}
              className="w-full rounded-md border border-input bg-transparent p-2 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            <Button className="h-11" variant="secondary" onClick={() => { try { addCustomTle(paste); setPaste(''); setMsg('') } catch { setMsg(t('sat.err.tle')) } }}>{t('sat.paste.add')}</Button>
          </div>
        </details>
      </Section>

      {s.selected.length > 0 && (
        <Section title={t('sat.selected', { n: s.selected.length, m: MAX_SELECTED })}>
          <div className="flex flex-wrap gap-1.5">
            {s.selected.map((r, i) => (
              <div key={r.norad} className={`flex h-11 items-center rounded-full border text-xs ${i === s.active ? 'border-white/50 bg-white/10' : 'border-white/15'}`}>
                <button type="button" className="flex h-11 items-center gap-1.5 pl-3 pr-1" aria-label={t('sat.focus', { n: r.name })} onClick={() => setActive(i)}>
                  <span className="size-2.5 rounded-full" style={{ background: SEL_COLORS[i % 4] }} />{r.name}
                </button>
                <button type="button" className="flex size-11 items-center justify-center text-muted-foreground" aria-label={t('sat.remove', { n: r.name })} onClick={() => toggleSat(r)}><X className="size-4" /></button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {act && (
        <Section title={act.name}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">{t('sat.time')}: <span className="tabular-nums text-foreground">{localTime(ms, true)}</span></div>
            <Button className="h-11 min-w-16" variant="outline" title={t('sat.now.h')} onClick={() => { jumpToNow(); }}>{t('sat.now')}</Button>
          </div>
          {live && info ? (
            <div>
              <KV k={t('sat.lat')} v={`${f(live.lat, 3)}° ${live.lat >= 0 ? 'N' : 'Z'}`} />
              <KV k={t('sat.lon')} v={`${f(Math.abs(live.lon), 3)}° ${live.lon >= 0 ? 'O' : 'W'}`} />
              <KV k={t('sat.alt')} v={`${Math.round(live.alt).toLocaleString()} km`} strong />
              <KV k={t('sat.speed')} v={`${f(live.speed, 2)} km/s`} />
              <KV k={t('sat.period')} v={`${f(info.periodS / 60, 1)} min`} />
              <KV k={t('sat.inc')} v={`${f(info.incDeg, 2)}°`} />
              <KV k={t('sat.apsides')} v={`${Math.round(info.perigeeAlt)} / ${Math.round(info.apogeeAlt)} km`} />
              <KV k={t('sat.sunlit')} v={<span className={lit ? 'text-amber-300' : 'text-sky-300'}>{lit ? t('sat.sunlit.yes') : t('sat.sunlit.no')}</span>} />
              {Number.isFinite(epAgeD) && <KV k={t('sat.epoch')} v={<span className={Math.abs(epAgeD) > 14 ? 'text-amber-300' : ''}>{f(Math.abs(epAgeD), 1)} d</span>} />}
              {Math.abs(epAgeD) > 14 && <p className="text-[11px] text-amber-300">{t('sat.epoch.warn')}</p>}
            </div>
          ) : <p className="text-xs text-amber-300">{t('sat.decayed')}</p>}
        </Section>
      )}

      {s.selected.length > 0 && (
        <Section title={t('sat.track')}>
          <GroundTrack recs={s.selected} active={s.active} ms={ms} obs={obs} youLabel={t('sat.you')} />
          <p className="text-[11px] text-muted-foreground">{t('sat.legend')}</p>
        </Section>
      )}
    </div>
  )
}

const PASS_DAYS = 5
export function PassesPanel() {
  const t = useT()
  useBootGroup()
  const s = useSats((x) => x)
  const obs = useObserver((o) => o)
  const [onlyVis, setOnlyVis] = useState(false), [gpsMsg, setGpsMsg] = useState(''), [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const act = s.selected[s.active]
  const startMs = useMemo(() => toMs(clock.t), [act, obs.lat, obs.lon, obs.altM, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const passes = useMemo(() => {
    const sr = act ? satrecOf(act) : null
    return sr ? findPasses(sr, obs, startMs, PASS_DAYS, 10) : []
  }, [act, obs, startMs])
  const rows = onlyVis ? passes.filter((p) => p.visible) : passes
  const dir = (az: number) => `${t(`dir.${compass8(az)}`)} ${Math.round(az)}°`
  const num = (v: string, lim: number, key: 'lat' | 'lon') => { const x = parseFloat(v.replace(',', '.')); if (Number.isFinite(x) && Math.abs(x) <= lim) setObserver({ [key]: x, fromGps: false, name: '' }) }

  if (!s.selected.length) {
    return <p className="text-sm text-muted-foreground">{t('sat.pick')}</p>
  }
  return (
    <div className="grid gap-4">
      <Section title={t('pas.sat')}>
        <div className="flex flex-wrap gap-1.5">
          {s.selected.map((r, i) => (
            <Button key={r.norad} size="sm" variant={i === s.active ? 'default' : 'outline'} className="h-11 gap-1.5 px-3 text-xs" onClick={() => setActive(i)}>
              <span className="size-2.5 rounded-full" style={{ background: SEL_COLORS[i % 4] }} />{r.name}
            </Button>
          ))}
        </div>
      </Section>
      <Section title={t('pas.place')}>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">{t('pas.lat')}
            <Input key={`la${obs.lat}`} defaultValue={obs.lat.toFixed(4)} inputMode="decimal" className="h-11" onBlur={(e) => num(e.target.value, 90, 'lat')} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">{t('pas.lon')}
            <Input key={`lo${obs.lon}`} defaultValue={obs.lon.toFixed(4)} inputMode="decimal" className="h-11" onBlur={(e) => num(e.target.value, 180, 'lon')} />
          </label>
        </div>
        <Button variant="outline" className="h-11 gap-2" disabled={busy} onClick={async () => { setBusy(true); const ok = await locate(); setBusy(false); setGpsMsg(ok ? '' : t('pas.gps.fail')) }}>
          <LocateFixed className="size-4" />{t('pas.gps')}{obs.fromGps ? ' ✓' : obs.name ? ` · ${obs.name}` : ''}
        </Button>
        {gpsMsg && <p className="text-[11px] text-amber-300">{gpsMsg}</p>}
      </Section>
      <Section title={`${t('pas.title')} · ${t('pas.days')}`}>
        <div className="flex items-center justify-between gap-2">
          <Button variant={onlyVis ? 'default' : 'outline'} className="h-11 px-3 text-xs" aria-pressed={onlyVis} onClick={() => setOnlyVis(!onlyVis)}>{t('pas.onlyvis')}</Button>
          <Button size="icon" variant="outline" className="size-11" aria-label={t('sat.refresh')} onClick={() => setTick(tick + 1)}><RefreshCw /></Button>
        </div>
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{t('pas.none')}</p>}
        <div className="grid gap-2">
          {rows.slice(0, 40).map((p) => (
            <button key={p.riseMs} type="button" title={t('pas.go')} onClick={() => { clock.t = toJ2000(p.riseMs - 30000) }}
              className={`min-h-11 rounded-lg border p-2.5 text-left text-xs ${p.visible ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">{localTime(p.riseMs)}{p.ongoing && p.riseMs === startMs ? ` · ${t('pas.ongoing')}` : ''}</span>
                <span className={p.visible ? 'text-emerald-400' : 'text-muted-foreground'}>{p.visible ? t('pas.vis') : t('pas.novis')}</span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 tabular-nums text-muted-foreground">
                <span>{t('pas.rise')} {localTime(p.riseMs, false).slice(0, 5)}<br />{dir(p.riseAz)}</span>
                <span>{t('pas.max')} {localTime(p.maxMs, false).slice(0, 5)}<br /><b className="text-foreground">{t('pas.maxel', { e: Math.round(p.maxEl) })}</b> {dir(p.maxAz)}</span>
                <span>{t('pas.set')} {localTime(p.setMs, false).slice(0, 5)}<br />{dir(p.setAz)}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{t('pas.dur', { m: Math.max(1, Math.round((p.setMs - p.riseMs) / 60000)) })}</div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('pas.def')}</p>
      </Section>
    </div>
  )
}
