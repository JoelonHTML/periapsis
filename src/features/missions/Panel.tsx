import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KV, Section, f } from '@/components/bits'
import { AU, DAY, YEAR, norm } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { SPEEDS, clock, jumpTo, store } from '@/lib/store'
import { MISSIONS, missionById, type Mission } from './data'
import './i18n'
import { evT, reconstruct, stateAt, type Recon } from './recon'
import { missionsUi } from './store'
import { eventTitle, fitRadius, fmtEvDate, legColor, missionTargets, missionYears, playSpeed } from './texts'

/** Frames the whole path in the solar view. */
function frame(rc: Recon) { store.set({ view: 'solar', follow: 'none', flybyIdx: -1, camFit: fitRadius(rc) }) }

function open(id: string) {
  missionsUi.set({ selected: id })
  const m = missionById(id)
  if (m) frame(reconstruct(m))
}

function play(rc: Recon) {
  frame(rc)
  jumpTo(rc.tStart - 2 * DAY)
  clock.target = SPEEDS[playSpeed(rc)].s
  clock.paused = false
}

function jumpToEvent(ts: number) {
  store.set({ view: 'solar' })
  jumpTo(ts)
  clock.paused = true
}

/** Re-renders a few times per second: the clock is a mutable object, not React state. */
function useClockT(ms = 500) {
  const [t, setT] = useState(clock.t)
  useEffect(() => {
    const id = setInterval(() => setT(clock.t), ms)
    return () => clearInterval(id)
  }, [ms])
  return t
}

const statusKey = (m: Mission) => `rm.status.${m.status}`
const statusCls = (m: Mission) => (m.status === 'ended' ? 'bg-white/10 text-muted-foreground' : m.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')

function Disclaimer() {
  const t = useT()
  return (
    <div className="flex gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11.5px] leading-snug text-amber-100/90">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
      <span>{t('rm.disclaimer')}</span>
    </div>
  )
}

function MissionList() {
  const t = useT()
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">{t('rm.intro')}</p>
      <Disclaimer />
      <div className="grid gap-2">
        {MISSIONS.map((m) => (
          <button key={m.id} type="button" onClick={() => open(m.id)}
            className="grid min-h-14 gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left active:bg-white/10">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{m.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{missionYears(m)}</span>
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-muted-foreground">{missionTargets(m, t).join(' · ')}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCls(m)}`}>{t(statusKey(m))}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NowBox({ rc }: { rc: Recon }) {
  const t = useT()
  const now = useClockT()
  const s = stateAt(rc, now)
  return (
    <Section title={t('rm.now')}>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        {s ? (
          <>
            <KV k={t('rm.now.fly', { d: Math.max(0, Math.round((now - rc.tStart) / DAY)), n: Math.round(rc.tof / DAY) })} v={`${Math.round(((now - rc.tStart) / rc.tof) * 100)} %`} />
            <KV k={t('rm.now.sun')} v={`${f(norm(s.r) / AU, 2)} AU`} />
            <KV k={t('rm.now.speed')} v={`${f(norm(s.v), 1)} km/s`} />
          </>
        ) : (
          <p className="py-1 text-xs text-muted-foreground">{now < rc.tStart ? t('rm.now.before') : t('rm.now.after')}</p>
        )}
      </div>
    </Section>
  )
}

function Timeline({ m }: { m: Mission }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  return (
    <Section title={t('rm.timeline')}>
      <p className="-mt-1 text-[11px] text-muted-foreground">{t('rm.timeline.h')} {t('rm.dates')}</p>
      <ol className="grid gap-1.5">
        {m.events.map((e, i) => {
          const node = e.kind === 'launch' || e.kind === 'flyby' || e.kind === 'arrival'
          return (
            <li key={i}>
              <button type="button" onClick={() => jumpToEvent(evT(e))} aria-label={`${eventTitle(e, t, lang)} ${e.date.slice(0, 10)}`}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left active:bg-white/10">
                <span className={`size-2.5 shrink-0 rounded-full ${node ? 'bg-fuchsia-400' : 'border border-white/40'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] leading-tight ${node ? 'font-medium' : 'text-muted-foreground'}`}>{eventTitle(e, t, lang)}</span>
                  <span className="block text-[11px] tabular-nums text-muted-foreground">{fmtEvDate(e)}{e.approx ? '' : ' UTC'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function Numbers({ rc }: { rc: Recon }) {
  const t = useT()
  const first = rc.legs[0], last = rc.legs[rc.legs.length - 1]
  const dep = first?.degenerate, arr = last?.degenerate
  return (
    <Section title={t('rm.numbers')}>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <KV k={t('rm.c3')} v={dep ? t('rm.undetermined') : `${f(rc.c3, 1)} km²/s²`} />
        <KV k={t('rm.vinfDep')} v={dep ? t('rm.undetermined') : `${f(rc.vinfLaunch, 2)} km/s`} />
        <KV k={t('rm.vinfArr')} v={arr ? t('rm.undetermined') : `${f(rc.vinfArrival, 2)} km/s`} />
        <KV k={t('rm.tof')} v={`${f(rc.tof / YEAR, 2)} j · ${Math.round(rc.tof / DAY)} d`} />
        {rc.flybys.length > 0 && <KV k={t('rm.mismatchSum')} v={`${f(rc.dvMismatch * 1000, 0)} m/s`} strong />}
      </div>
      {(dep || arr || rc.legs.some((l) => l.degenerate)) && <p className="text-[11px] leading-snug text-amber-200/80">{t('rm.degenerate')}</p>}

      {rc.flybys.length > 0 && (
        <>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('rm.flybys')}</div>
          <div className="grid gap-1.5">
            {rc.flybys.map((fb, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5">
                <div className="flex items-baseline justify-between text-[13px] font-medium">
                  <span>{t(`rm.body.${fb.body}`)}</span>
                  <span className="text-[11px] font-normal tabular-nums text-muted-foreground">{rc.mission.events[rc.nodes[fb.node].evIdx].date.slice(0, 10)}</span>
                </div>
                <KV k={t('rm.fb.vinf')} v={`${f(fb.vinfIn, 2)} → ${f(fb.vinfOut, 2)} km/s`} />
                <KV k={t('rm.fb.dv')} v={`${f(fb.dv * 1000, 0)} m/s`} />
                <KV k={t('rm.fb.turn')} v={`${f((fb.turn * 180) / Math.PI, 0)}° / ${f((fb.turnMax * 180) / Math.PI, 0)}°`} />
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t('rm.fb.note')}</p>
        </>
      )}

      <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('rm.legs')}</div>
      <div className="grid gap-1">
        {rc.legs.map((l) => (
          <div key={l.k} className="flex items-center gap-2 rounded-md px-1 text-[11.5px] tabular-nums">
            <span className="h-1 w-4 shrink-0 rounded-full" style={{ background: legColor(l.k) }} />
            <span className="min-w-0 flex-1 truncate">{t(`rm.body.${l.from}`)} → {t(`rm.body.${l.to}`)}</span>
            <span className="text-muted-foreground">{f((l.t2 - l.t1) / DAY, 0)} d · a {f(l.a / AU, 2)} AU · e {f(l.e, 2)}{l.revs ? ` · ${l.revs}×` : ''}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Detail({ m }: { m: Mission }) {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const rc = reconstruct(m)
  return (
    <div className="grid gap-4">
      <Button variant="ghost" className="-ml-2 h-11 w-fit justify-start gap-1 px-2 text-xs" onClick={() => missionsUi.set({ selected: null })}>
        <ChevronLeft className="size-4" />{t('rm.back')}
      </Button>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">{m.name}</h2>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCls(m)}`}>{t(statusKey(m))}</span>
        </div>
        <div className="text-xs text-muted-foreground">{m.agency} · {missionYears(m)} · {missionTargets(m, t).join(' · ')}</div>
        <p className="text-[13px] leading-snug">{m.desc[lang]}</p>
        <div className="text-[11px] text-muted-foreground">{t('rm.src')}: {m.source}</div>
      </div>
      <Disclaimer />
      {rc.error ? (
        <p className="text-xs text-red-300">{rc.error}</p>
      ) : (
        <>
          <Button className="h-11 gap-2" onClick={() => play(rc)}>
            <Play className="size-4" />{t('rm.play')}
          </Button>
          <p className="-mt-2 text-[11px] text-muted-foreground">{t('rm.play.h')}</p>
          <NowBox rc={rc} />
          <Timeline m={m} />
          <Numbers rc={rc} />
        </>
      )}
    </div>
  )
}

export function MissionsPanel() {
  const t = useT()
  const sel = missionsUi.useStore((s) => s.selected)
  const m = sel ? missionById(sel) : undefined
  return (
    <div className="grid gap-3 pb-4">
      {!m && <h2 className="text-base font-semibold">{t('rm.title')}</h2>}
      {m ? <Detail m={m} /> : <MissionList />}
    </div>
  )
}
