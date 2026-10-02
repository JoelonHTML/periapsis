// Beta angle and eclipse figures for the planned Earth orbit (Missies → Aardbaan). Cylindrical shadow, J2-precessing orbit plane.
import { useEffect, useMemo, useRef, useState } from 'react'
import { KV, Section, f } from '@/components/bits'
import { DAY, DEG } from '@/lib/astro'
import { useT } from '@/lib/i18n'
import { clock } from '@/lib/store'
import { betaAngle, eclipseAt, yearSeries, type PlanOrbit } from './eclipse'
import './i18n'

const fmtMin = (s: number) => `${(s / 60).toFixed(1)} min`
const W = 340, H = 96

function Chart({ beta, dur, nowDay, aria }: { beta: number[]; dur: number[]; nowDay: number; aria: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current!.getContext('2d')!
    g.clearRect(0, 0, W, H)
    const n = beta.length, X = (i: number) => 6 + (i / (n - 1)) * (W - 12)
    const maxDur = Math.max(1, ...dur), Yb = (b: number) => H / 2 - (b / (90 * DEG)) * (H / 2 - 6)
    g.fillStyle = 'rgba(56,189,248,0.22)'; g.beginPath(); g.moveTo(X(0), H)
    dur.forEach((d, i) => g.lineTo(X(i), H - (d / maxDur) * (H - 8))); g.lineTo(X(n - 1), H); g.closePath(); g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Yb(0)); g.lineTo(W, Yb(0)); g.stroke()
    g.strokeStyle = '#fbbf24'; g.lineWidth = 2; g.beginPath()
    beta.forEach((b, i) => (i ? g.lineTo(X(i), Yb(b)) : g.moveTo(X(i), Yb(b)))); g.stroke()
    if (nowDay >= 0 && nowDay < n) { g.strokeStyle = '#f87171'; g.beginPath(); g.moveTo(X(nowDay), 0); g.lineTo(X(nowDay), H); g.stroke() }
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '10px system-ui, sans-serif'; g.fillText('+90°', 2, 10); g.fillText('−90°', 2, H - 3)
  }, [beta, dur, nowDay])
  return <canvas ref={ref} width={W} height={H} role="img" aria-label={aria} className="block w-full rounded-md border border-white/10 bg-black/20" style={{ aspectRatio: `${W} / ${H}` }} />
}

export function Eclipse({ plan }: { plan: PlanOrbit }) {
  const t = useT()
  const [now, setNow] = useState(clock.t)
  useEffect(() => { const id = setInterval(() => setNow(clock.t), 2000); return () => clearInterval(id) }, [])
  const year = useMemo(() => yearSeries(plan, plan.t0, 366), [plan.a, plan.e, plan.iT, plan.O0, plan.w0, plan.t0, plan.rates.dO, plan.rates.dw]) // eslint-disable-line react-hooks/exhaustive-deps
  const beta = betaAngle(plan, now), ec = useMemo(() => eclipseAt(plan, now), [plan, Math.round(now / 600)]) // eslint-disable-line react-hooks/exhaustive-deps
  const bMax = Math.max(...year.beta) / DEG, bMin = Math.min(...year.beta) / DEG
  const noEcl = year.frac.filter((x) => x === 0).length
  return (
    <Section title={t('ecl.title')}>
      <div>
        <KV k={t('ecl.beta')} v={`${f(beta / DEG, 1)}°`} strong />
        <KV k={t('ecl.range')} v={`${f(bMin, 1)}° … ${f(bMax, 1)}°`} />
        <KV k={t('ecl.frac')} v={`${f(ec.fraction * 100, 1)} % (${fmtMin(ec.fraction * ec.period)})`} />
        <KV k={t('ecl.dur')} v={ec.maxDur > 0 ? fmtMin(ec.maxDur) : '—'} />
        <KV k={t('ecl.maxyear')} v={fmtMin(Math.max(...year.dur))} />
        {noEcl > 0 && <KV k={t('ecl.nosun', { n: noEcl })} v="" />}
      </div>
      <Chart beta={year.beta} dur={year.dur} nowDay={(now - plan.t0) / DAY} aria={t('ecl.chart')} />
      <p className="text-[11px] text-muted-foreground">{t('ecl.chart')}. {t('ecl.h')}</p>
    </Section>
  )
}
