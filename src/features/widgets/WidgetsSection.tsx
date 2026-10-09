import { useEffect, useState } from 'react'
import { LayoutGrid, Plus, RefreshCw } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useT } from '@/lib/i18n'
import './i18n'
import { WIDGET_KINDS, pinSupported, pinWidget, setWidgetAlpha, syncWidgets, widgetPrefs, widgetsAvailable } from './sync'

/** Settings card: widget background opacity, refresh, and one "add to home screen" button per widget kind. */
export function WidgetsSection() {
  const t = useT()
  const alpha = widgetPrefs.useStore((s) => s.alpha)
  const native = Capacitor.isNativePlatform() && widgetsAvailable()
  const [pin, setPin] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (native) void pinSupported().then(setPin) }, [native])
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium"><LayoutGrid className="size-4 text-cyan-400" /> {t('wid.title')}</h3>
      {!native ? <p className="text-[11px] leading-snug text-muted-foreground">{t('wid.web')}</p> : (
        <>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs"><span>{t('wid.opacity')}</span><span className="tabular-nums text-muted-foreground">{Math.round(alpha * 100)}%</span></div>
            <Slider min={0.2} max={1} step={0.05} value={[alpha]} onValueChange={([v]) => setWidgetAlpha(v)} aria-label={t('wid.opacity')} />
          </div>
          <Button variant="outline" className="h-11 justify-start gap-3" onClick={() => void syncWidgets().then((ok) => ok && say(t('wid.refreshed')))}>
            <RefreshCw className="size-4" /> {t('wid.refresh')}
          </Button>
          {msg && <p className="text-[11px] text-emerald-300" role="status">{msg}</p>}
          <ul className="grid gap-1.5">
            {WIDGET_KINDS.map((k) => (
              <li key={k} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{t(`wid.k.${k}`)}</span>
                <Button size="sm" variant="secondary" className="h-9 shrink-0 gap-1.5 text-xs" aria-label={`${t('wid.k.' + k)}: ${t('wid.add')}`}
                  onClick={() => void pinWidget(k).then((ok) => { if (!ok) say(t('wid.hint')) })}>
                  <Plus className="size-3.5" /> {t('wid.add')}
                </Button>
              </li>
            ))}
          </ul>
          {!pin && <p className="text-[11px] leading-snug text-muted-foreground">{t('wid.hint')}</p>}
        </>
      )}
    </section>
  )
}
