import { KV } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { FeedCard, LOC, useFeed, useLang } from './widgets'
import { parseApproaches, sizeRangeM } from './asteroids.ts'

export function AsteroidsSection() {
  const t = useT(), loc = LOC[useLang()]
  const f = useFeed({
    key: 'live.cad', url: 'https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B60&dist-max=0.05&sort=date',
    maxAgeMs: 6 * 3600_000, minRetryMs: 15 * 60_000, parse: parseApproaches,
  })
  const n = (x: number, d: number) => x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d })
  const size = (m: number) => (m >= 1000 ? `${n(m / 1000, 1)} km` : m >= 100 ? `${n(Math.round(m / 10) * 10, 0)} m` : `${n(Math.round(m), 0)} m`)
  return (
    <FeedCard title={t('live.ast.title')} credit={t('live.ast.credit')} feeds={[f]} onRefresh={f.refresh}>
      <p className="text-[11px] text-muted-foreground">{t('live.ast.intro')}</p>
      {f.data && f.data.length === 0 ? <p className="text-xs text-muted-foreground">{t('live.ast.empty')}</p> : (
        <ul className="grid gap-2">
          {f.data?.map((a) => {
            const r = a.h !== null ? sizeRangeM(a.h) : null
            return (
              <li key={a.des + a.t} className="rounded-lg bg-muted/30 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{a.des}</span>
                  <span className="shrink-0 text-xs tabular-nums">{new Date(a.t).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                </div>
                <KV k={t('live.ast.dist')} v={t('live.ast.distVal', { ld: n(a.distLd, a.distLd < 10 ? 2 : 1), km: n(Math.round(a.distKm / 1000) * 1000, 0) })} />
                {a.vRel !== null && <KV k={t('live.ast.vel')} v={`${n(a.vRel, 1)} km/s`} />}
                <KV k={t('live.ast.size')} v={r ? `${size(r.min)} – ${size(r.max)}` : t('live.ast.sizeUnknown')} />
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground">{t('live.ast.sizeNote')}</p>
    </FeedCard>
  )
}
