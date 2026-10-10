import { useEffect, useState, type ReactNode } from 'react'
import { Bell, FlaskConical, RefreshCw } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/i18n'
import { isDesktop } from '@/lib/desktop'
import './i18n'
import { anyOn, updateAlerts, useAlerts, type AlertSettings } from './settings'
import { alertsStatus, checkNow, nativeAvailable, refreshStatus, requestPermission, testNotification } from './sync'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
function Sw({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return <Row label={label} hint={hint}><Switch checked={on} onCheckedChange={set} aria-label={label} /></Row>
}
function Pick({ label, value, opts, set, w = 'w-40' }: { label: string; value: string; opts: [string, string][]; set: (v: string) => void; w?: string }) {
  return (
    <Row label={label}>
      <Select value={value} onValueChange={set}>
        <SelectTrigger className={`${w} data-[size=default]:h-11`} aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map(([v, n]) => <SelectItem key={v} value={v}>{n}</SelectItem>)}</SelectContent>
      </Select>
    </Row>
  )
}
const TimeIn = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
  <input type="time" aria-label={label} value={value} onChange={(e) => e.target.value && set(e.target.value)}
    className="h-11 w-28 rounded-md border bg-background px-2 text-sm tabular-nums" />
)

/** A category card: header switch, details only while it is on. */
function Group({ title, hint, on, set, children }: { title: string; hint: string; on: boolean; set: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 px-3">
      <Sw label={title} hint={hint} on={on} set={set} />
      {on && <div className="divide-y border-t border-border/50">{children}</div>}
    </div>
  )
}

const upd = (f: (s: AlertSettings) => AlertSettings) => updateAlerts(f)

/** Settings card: what to be notified about, thresholds, quiet hours, permission, status and a test button. */
export function AlertsSection() {
  const t = useT()
  const s = useAlerts((x) => x)
  const st = alertsStatus.useStore((x) => x)
  const [msg, setMsg] = useState('')
  const native = Capacitor.isNativePlatform(), desk = isDesktop()
  useEffect(() => { void refreshStatus() }, [])
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }
  /** Switching a category on asks for the permission right away (system dialog on Android 13+). */
  const toggle = (f: (s: AlertSettings, v: boolean) => AlertSettings) => (v: boolean) => { upd((x) => f(x, v)); if (v && st.perm !== 'granted') void requestPermission() }
  const time = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-label={t('al.title')}>
      <h3 className="flex items-center gap-2 text-sm font-medium"><Bell className="size-4 text-cyan-400" /> {t('al.title')}</h3>
      <p className="text-[11px] leading-snug text-muted-foreground">{t('al.intro')}</p>

      <Group title={t('al.sw')} hint={t('al.sw.h')} on={s.spaceweather.on} set={toggle((x, v) => ({ ...x, spaceweather: { ...x.spaceweather, on: v } }))}>
        <Pick label={t('al.sw.kp')} value={String(s.spaceweather.kpMin)} opts={[5, 6, 7, 8, 9].map((k) => [String(k), `G${k - 4} (Kp ${k})`])} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, kpMin: +v } }))} />
        <Sw label={t('al.sw.aurora')} on={s.spaceweather.aurora} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, aurora: v } }))} />
        {s.spaceweather.aurora && <Pick label={t('al.sw.auroraMin')} value={String(s.spaceweather.auroraMin)} opts={[10, 20, 30, 50, 70].map((p) => [String(p), `${p}%`])} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, auroraMin: +v } }))} />}
        <Pick label={t('al.sw.flare')} w="w-48" value={s.spaceweather.flareMin} opts={[['off', t('al.flare.off')], ['M', t('al.flare.M')], ['X', t('al.flare.X')]]} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, flareMin: v as 'off' | 'M' | 'X' } }))} />
        <Sw label={t('al.sw.cme')} on={s.spaceweather.cme} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, cme: v } }))} />
        <Sw label={t('al.sw.radio')} on={s.spaceweather.radio} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, radio: v } }))} />
        <Sw label={t('al.sw.watches')} on={s.spaceweather.watches} set={(v) => upd((x) => ({ ...x, spaceweather: { ...x.spaceweather, watches: v } }))} />
      </Group>

      <Group title={t('al.sky')} hint={t('al.sky.h')} on={s.sky.on} set={toggle((x, v) => ({ ...x, sky: { ...x.sky, on: v } }))}>
        {(['iss', 'meteor', 'eclipse', 'conj', 'moon', 'opp'] as const).map((k) => (
          <Sw key={k} label={t(`al.sky.${k}`)} on={s.sky[k]} set={(v) => upd((x) => ({ ...x, sky: { ...x.sky, [k]: v } }))} />
        ))}
      </Group>

      <Group title={t('al.la')} hint={t('al.la.h')} on={s.launches.on} set={toggle((x, v) => ({ ...x, launches: { ...x.launches, on: v } }))}>
        <Pick label={t('al.la.lead')} value={String(s.launches.leadMin)} opts={[15, 30, 60, 120].map((m) => [String(m), t('al.min', { n: m })])} set={(v) => upd((x) => ({ ...x, launches: { ...x.launches, leadMin: +v as 15 | 30 | 60 | 120 } }))} />
      </Group>

      <div className="rounded-xl border bg-muted/20 px-3">
        <div className="py-2"><div className="text-sm">{t('al.sum')}</div><div className="text-[11px] leading-snug text-muted-foreground">{t('al.sum.h')}</div></div>
        <div className="divide-y border-t border-border/50">
          {(['morning', 'evening'] as const).map((k) => (
            <Row key={k} label={t(`al.sum.${k}`)}>
              <div className="flex items-center gap-3">
                {s.summary[k] && <TimeIn label={`${t(`al.sum.${k}`)} ${t('al.sum.at')}`} value={s.summary[k === 'morning' ? 'morningTime' : 'eveningTime']} set={(v) => upd((x) => ({ ...x, summary: { ...x.summary, [k === 'morning' ? 'morningTime' : 'eveningTime']: v } }))} />}
                <Switch checked={s.summary[k]} onCheckedChange={toggle((x, v) => ({ ...x, summary: { ...x.summary, [k]: v } }))} aria-label={t(`al.sum.${k}`)} />
              </div>
            </Row>
          ))}
        </div>
      </div>

      <Group title={t('al.quiet')} hint={t('al.quiet.h')} on={s.quiet.on} set={(v) => upd((x) => ({ ...x, quiet: { ...x.quiet, on: v } }))}>
        <Row label={t('al.quiet.from')}><TimeIn label={t('al.quiet.from')} value={s.quiet.from} set={(v) => upd((x) => ({ ...x, quiet: { ...x.quiet, from: v } }))} /></Row>
        <Row label={t('al.quiet.to')}><TimeIn label={t('al.quiet.to')} value={s.quiet.to} set={(v) => upd((x) => ({ ...x, quiet: { ...x.quiet, to: v } }))} /></Row>
      </Group>

      {desk && (
        <div className="rounded-xl border bg-muted/20 px-3">
          <Sw label={t('al.desk.login')} hint={t('al.desk.tray')} on={s.autostart} set={(v) => upd((x) => ({ ...x, autostart: v }))} />
        </div>
      )}

      <div className="grid gap-2">
        <Button variant="outline" className="h-11 justify-start gap-3" onClick={() => void requestPermission()}><Bell className="size-4" /> {t('al.permission')}</Button>
        <p className={`text-[11px] leading-snug ${st.perm === 'granted' ? 'text-emerald-300' : 'text-muted-foreground'}`} role="status">
          {native || desk || st.perm !== 'unsupported' ? (st.perm === 'granted' ? t('al.perm.ok') : native ? t('al.perm.no') : t('al.perm.web')) : t('al.perm.web')}
        </p>
        <Button variant="outline" className="h-11 justify-start gap-3" onClick={() => void testNotification().then((ok) => say(t(ok ? 'al.test.sent' : 'al.test.fail')))}><FlaskConical className="size-4" /> {t('al.test')}</Button>
        {msg && <p className="text-[11px] text-emerald-300" role="status">{msg}</p>}
        {(nativeAvailable() || desk) && (
          <div className="grid gap-1 text-[11px] leading-snug text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>{t('al.lastRun', { t: st.lastRun ? time(st.lastRun) : t('al.never') })}</span>
              <Button size="sm" variant="secondary" className="h-9 gap-1.5 text-xs" disabled={!anyOn(s)} onClick={() => void checkNow()}><RefreshCw className="size-3.5" /> {t('al.checkNow')}</Button>
            </div>
            {st.lastError && <span className="text-amber-300">{t('al.error', { e: st.lastError })}</span>}
          </div>
        )}
        {anyOn(s) && st.scheduled > 0 && <p className="text-[11px] text-muted-foreground">{t('al.scheduled', { n: st.scheduled })}</p>}
      </div>
    </section>
  )
}
