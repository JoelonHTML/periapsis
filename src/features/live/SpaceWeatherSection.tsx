import { useMemo } from 'react'
import { KV } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { useObserver } from '@/lib/observer'
import { FeedCard, LOC, useFeed, useLang, useNow } from './widgets'
import { auroraAt, currentKp, dailyMaxKp, gScale, ovalEdge, parseFlare, parseKpForecast, parseMag, parseOvation, parsePlasma } from './spaceweather.ts'

const BASE = 'https://services.swpc.noaa.gov/'
const MAX = 20 * 60_000, RETRY = 3 * 60_000

const kpColor = (kp: number) => (kp >= 7 ? 'bg-red-500' : kp >= 5 ? 'bg-orange-500' : kp >= 4 ? 'bg-yellow-400' : 'bg-emerald-500')

export function SpaceWeather() {
  const t = useT(), lang = useLang(), loc = LOC[lang]
  const now = useNow(60_000)
  const obs = useObserver((s) => s)
  const kp = useFeed({ key: 'live.kp', url: BASE + 'products/noaa-planetary-k-index-forecast.json', maxAgeMs: MAX, minRetryMs: RETRY, parse: parseKpForecast })
  const ov = useFeed({ key: 'live.ovation', url: BASE + 'json/ovation_aurora_latest.json', maxAgeMs: 30 * 60_000, minRetryMs: RETRY, parse: parseOvation })
  const pl = useFeed({ key: 'live.plasma', url: BASE + 'json/rtsw/rtsw_wind_1m.json', fallbackUrl: BASE + 'products/solar-wind/plasma-1-day.json', maxAgeMs: MAX, minRetryMs: RETRY, parse: parsePlasma })
  const mg = useFeed({ key: 'live.mag', url: BASE + 'json/rtsw/rtsw_mag_1m.json', fallbackUrl: BASE + 'products/solar-wind/mag-1-day.json', maxAgeMs: MAX, minRetryMs: RETRY, parse: parseMag })
  const fl = useFeed({ key: 'live.flare', url: BASE + 'json/goes/primary/xray-flares-latest.json', maxAgeMs: 30 * 60_000, minRetryMs: RETRY, parse: parseFlare })
  const feeds = [kp, ov, pl, mg, fl]
  const n1 = (x: number, d = 0) => x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−')

  const cur = useMemo(() => (kp.data ? currentKp(kp.data, now) : null), [kp.data, now])
  const days = useMemo(() => (kp.data ? dailyMaxKp(kp.data, now, 3) : []), [kp.data, now])
  const p = ov.data ? auroraAt(ov.data, obs.lat, obs.lon) : null
  const edge = ov.data ? ovalEdge(ov.data, obs.lat, obs.lon) : null
  const dayName = (ms: number) => {
    const d = new Date(now); d.setHours(0, 0, 0, 0)
    return ms === d.getTime() ? t('live.sw.today') : new Date(ms).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const g = cur ? gScale(cur.kp) : 0
  const state = cur ? (cur.kp >= 5 ? t('live.sw.storm') : cur.kp >= 4 ? t('live.sw.active') : t('live.sw.calm')) : ''

  return (
    <FeedCard title={t('live.sw.title')} credit={t('live.sw.credit')} feeds={feeds} onRefresh={() => feeds.forEach((f) => f.refresh())}>
      {cur && (
        <div className="flex items-center gap-3">
          <div className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-lg text-black ${kpColor(cur.kp)}`}>
            <span className="text-xl font-bold leading-none tabular-nums">{n1(cur.kp, 1)}</span><span className="text-[9px] font-medium">Kp</span>
          </div>
          <div className="min-w-0 text-xs">
            <div className="text-sm font-medium">{t('live.sw.kpNow')}: {state}</div>
            {g > 0 && <div className="text-amber-300">{t('live.sw.g', { n: g })}</div>}
          </div>
        </div>
      )}
      {days.length > 0 && (
        <div className="grid gap-1">
          <div className="text-[11px] text-muted-foreground">{t('live.sw.forecast')}</div>
          {days.map((d) => (
            <div key={d.day} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{dayName(d.day)}</span>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${kpColor(d.max)}`} style={{ width: `${(d.max / 9) * 100}%` }} /></div>
              <span className="w-8 shrink-0 text-right tabular-nums">{n1(d.max, 1)}</span>
            </div>
          ))}
        </div>
      )}
      {(ov.data || cur) && (
        <div className="mt-1 border-t border-border/60 pt-1.5">
          {obs.name && <div className="pb-0.5 text-[11px] text-muted-foreground">{t('live.sw.place', { name: obs.name })}</div>}
          {p !== null && <KV k={t('live.sw.aurora')} v={t('live.sw.auroraAt', { p })} strong={p >= 10} />}
          {ov.data && <KV k={t('live.sw.oval')} v={edge ? t('live.sw.ovalVal', { lat: n1(Math.abs(edge.lat)), ns: edge.lat >= 0 ? t('live.sw.north') : t('live.sw.south'), km: n1(edge.kmFromObserver) }) : t('live.sw.ovalNone')} />}
          {p !== null && <p className="pt-0.5 text-[10px] text-muted-foreground">{t('live.sw.auroraNote')}</p>}
        </div>
      )}
      {(pl.data || mg.data || fl.data !== undefined) && (
        <div className="border-t border-border/60 pt-1.5">
          <KV k={t('live.sw.speed')} v={pl.data?.speed != null ? `${n1(pl.data.speed)} km/s${pl.data.density != null ? ` · ${n1(pl.data.density, 1)} p/cm³` : ''}` : '—'} />
          <KV k={<>{t('live.sw.bz')} <span className="opacity-60">({t('live.sw.bzHint')})</span></>} v={mg.data ? `${n1(mg.data.bz, 1)} nT` : '—'} strong={!!mg.data && mg.data.bz <= -5} />
          <KV k={t('live.sw.flare')} v={fl.data ? `${fl.data.cls}${fl.data.maxT ? ` · ${new Date(fl.data.maxT).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : ''}` : fl.fetchedAt ? t('live.sw.noFlare') : '—'} />
        </div>
      )}
    </FeedCard>
  )
}
