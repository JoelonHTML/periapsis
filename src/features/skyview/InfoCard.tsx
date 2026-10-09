// Card shown when an object is tapped / found: type, magnitude, where it is now, rise / transit / set, distance.
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { AU } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { compassIdx } from '../tonight/sky.ts'
import { num } from '../tonight/fmt.ts'
import { useSite } from '../tonight/ui'
import { solarClock } from './geom.ts'
import { describe, objKey, objectAltAz, skyState, type Info, type Obj } from './scene.ts'
import { live } from './control.ts'

const colorKey = (bv: number) => (bv < 0.0 ? 0 : bv < 0.45 ? 1 : bv < 0.85 ? 2 : bv < 1.4 ? 3 : 4)

export function InfoCard({ sel, onClose }: { sel: Obj; onClose: () => void }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const site = useSite()
  const ready = skyState.useStore((s) => s.skyReady)
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i) }, [])
  const key = objKey(sel), bucket = Math.floor(live.ms / 300000), have = live.b ? 1 : 0
  const slow = useMemo(() => (live.b ? describe(sel, live.ms, site, live.b, live.sats) : null), [key, bucket, site, ready, have]) // eslint-disable-line react-hooks/exhaustive-deps
  const info: Info | null = sel.k === 'sat' && live.b ? describe(sel, live.ms, site, live.b, live.sats) : slow
  if (!info) return null
  const aa = live.b ? objectAltAz(sel, live.ms, site, live.b, live.sats) : null
  const alt = aa?.alt ?? info.alt, az = aa?.az ?? info.az
  const below = alt < 0
  const fmtT = (ms: number | null) => { if (ms == null) return '—'; const c = solarClock(ms, site.lon, live.ms); return <span className="tabular-nums">{c.hhmm}{c.day !== 0 && <sup className="ml-0.5 text-[9px] text-slate-400">{c.day > 0 ? `+${c.day}` : c.day}</sup>}</span> }
  const row = (k: string, v: React.ReactNode, full = false) => <div className={`flex items-baseline justify-between gap-2 ${full ? 'col-span-2' : ''}`}><dt className="text-slate-400">{k}</dt><dd className="text-right tabular-nums">{v}</dd></div>
  const dist = info.distKm != null
    ? info.distKm > 5e6 ? `${num(info.distKm / AU, 2, lang)} AU · ${num((info.distKm / 299792.458) / 60, 1, lang)} ${t('sv.lightMin')}` : `${num(Math.round(info.distKm / 100) * 100, 0, lang)} km`
    : info.distLy ? `${num(info.distLy, info.distLy < 20 ? 1 : 0, lang)} ${t('sv.ly')}` : null
  const raTxt = (deg: number) => { const h = deg / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m); return `${hh}h ${String(mm).padStart(2, '0')}m ${String(Math.round((m - mm) * 60) % 60).padStart(2, '0')}s` }
  const decTxt = (deg: number) => { const a = Math.abs(deg), d = Math.floor(a), m = Math.round((a - d) * 60); return `${deg < 0 ? '−' : '+'}${d}° ${String(m % 60).padStart(2, '0')}′` }
  const angTxt = (as: number) => (as >= 120 ? `${num(as / 60, as >= 600 ? 0 : 1, lang)}′` : `${num(as, as < 10 ? 1 : 0, lang)}″`)
  const sizeTxt = (v: number) => (v >= 60 ? `${num(v / 60, 1, lang)}°` : `${num(v, v < 10 ? 1 : 0, lang)}′`)
  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-slate-100 shadow-xl backdrop-blur max-h-[calc(100dvh-14rem)] overflow-y-auto overscroll-contain" role="region" aria-label={info.title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold leading-tight">{info.title}</div>
          <div className="truncate text-xs text-slate-400">{[t(`sv.k.${info.kind === 'dso' ? 'dso' : info.kind}`), info.typeKey && t(`sv.type.${info.typeKey}`), info.sub].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" onClick={onClose} aria-label={t('sv.close')} className="-m-1 grid size-10 shrink-0 place-items-center rounded-full text-slate-300 active:bg-white/10"><X className="size-4" /></button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
        {row(t('sky.alt'), <>{num(alt, 1, lang)}°</>)}
        {row(t('sky.az'), `${num(az, 0, lang)}° ${t(`sky.dir.${compassIdx(az)}`)}`)}
        {info.mag != null && row(t('sky.mag'), num(info.mag, 1, lang))}
        {info.illum != null && row(t('sky.illum'), `${Math.round(info.illum * 100)} %`)}
        {info.bv != null && row(t('sv.colour'), t(`sv.col.${colorKey(info.bv)}`))}
        {info.spec && row(t('sv.spec'), info.spec)}
        {info.conName && row(t('sv.con'), info.conName)}
        {info.elongSun != null && row(t('sky.elong'), `${num(info.elongSun, 0, lang)}°`)}
        {info.diamArcsec != null && row(t('sv.angDiam'), angTxt(info.diamArcsec))}
        {info.sizeArcmin && row(t('sv.size'), `${sizeTxt(info.sizeArcmin[0])} × ${sizeTxt(info.sizeArcmin[1])}`)}
        {info.sb != null && row(t('sv.sb'), `${num(info.sb, 1, lang)} ${t('sv.sbUnit')}`, true)}
        {info.vr && row(t('sv.var'), info.vr)}
        {dist && row(t('sky.dist'), dist, true)}
        {info.ra != null && row(t('sv.raJ'), `${raTxt(info.ra)} · ${decTxt(info.dec ?? 0)}`, true)}
        {info.raD != null && row(t('sv.raD'), `${raTxt(info.raD)} · ${decTxt(info.decD ?? 0)}`, true)}
        {info.heightKm != null && row(t('sv.height'), `${num(info.heightKm, 0, lang)} km`)}
        {info.rangeKm != null && row(t('sv.range'), `${num(info.rangeKm, 0, lang)} km`)}
        {info.speedKms != null && row(t('sv.speed'), `${num(info.speedKms, 1, lang)} km/s`)}
        {info.sunlit != null && row(t('sv.light'), t(info.sunlit ? 'sv.sunlit' : 'sv.shadow'), true)}
        {info.rts && !info.rts.always && <>
          {row(t('sky.rise'), fmtT(info.rts.rise))}
          {row(t('sv.transit'), info.rts.transit ? <>{fmtT(info.rts.transit.ms)} <span className="text-slate-400">· {num(info.rts.transit.alt, 0, lang)}°</span></> : '—', true)}
          {row(t('sky.set'), fmtT(info.rts.set))}
        </>}
      </dl>
      {info.designations && info.designations.length > 1 && <p className="mt-1.5 text-[11px] text-slate-400"><span className="text-slate-500">{t('sv.desig')}: </span>{info.designations.join(' · ')}</p>}
      {below && <p className="mt-1.5 inline-block rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">{t('sky.below')}</p>}
      {info.rts?.always && <p className="mt-1.5 text-xs text-slate-300">{t(info.rts.always === 'up' ? 'sv.alwaysUp' : 'sv.alwaysDown')}</p>}
      {info.rts && <p className="mt-1 text-[10px] text-slate-500">{t('sv.solarNote')}</p>}
      {info.kind === 'sat' && info.sunlit != null && <p className="mt-1.5 text-xs text-slate-300">{t(info.sunlit && !below && alt > 5 && (live.b?.sunAlt ?? 0) < -4 ? 'sv.satVisible' : 'sv.satNotVisible')}</p>}
    </div>
  )
}
