import { useT } from '@/lib/i18n'
import { Clamp, ExtLink, FeedCard, LOC, useFeed, useLang, useNow } from './widgets'
import { parseLaunches, type Launch } from './launches.ts'
import { formatCountdown } from './util.ts'

const tone = (ab: string) => (/^go$/i.test(ab) ? 'bg-emerald-500/15 text-emerald-300' : /^(success)$/i.test(ab) ? 'bg-emerald-500/15 text-emerald-300' : /fail|hold/i.test(ab) ? 'bg-red-500/15 text-red-300' : 'bg-muted text-muted-foreground')

function LaunchRow({ l, now }: { l: Launch; now: number }) {
  const t = useT(), loc = LOC[useLang()]
  return (
    <li className="grid gap-1 rounded-lg bg-muted/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-medium leading-snug">{l.name}</div>
        {l.live ? <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300">{t('live.ln.live')}</span>
          : l.status ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${tone(l.statusAbbrev)}`}>{l.status}</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">{[l.provider, l.rocket].filter(Boolean).join(' · ')}</div>
      {l.pad && <div className="text-xs text-muted-foreground">{l.pad}</div>}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span>{l.net !== null ? t('live.ln.net', { time: new Date(l.net).toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) }) : t('live.ln.tbd')}</span>
        {l.net !== null && <span className="font-semibold text-emerald-400 tabular-nums">{formatCountdown(l.net - now, { d: t('live.dayUnit') })}</span>}
      </div>
      <Clamp text={l.description} lines={2} />
      {(l.webcast || l.info) && (
        <div className="flex flex-wrap gap-x-3">
          {l.webcast && <ExtLink url={l.webcast}>{t('live.ln.webcast')}</ExtLink>}
          {l.info && <ExtLink url={l.info}>{t('live.ln.info')}</ExtLink>}
        </div>
      )}
    </li>
  )
}

export function LaunchesSection() {
  const t = useT()
  const now = useNow(1000)
  const f = useFeed({
    key: 'live.launches', url: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10', fallbackUrl: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10',
    maxAgeMs: 60 * 60_000, minRetryMs: 20 * 60_000, parse: parseLaunches,
  })
  return (
    <FeedCard title={t('live.ln.title')} credit={t('live.ln.credit')} feeds={[f]} onRefresh={f.refresh}>
      {f.data && f.data.length === 0 ? <p className="text-xs text-muted-foreground">{t('live.ln.empty')}</p>
        : <ul className="grid gap-2">{f.data?.map((l) => <LaunchRow key={l.id} l={l} now={now} />)}</ul>}
    </FeedCard>
  )
}
