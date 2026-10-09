import { CheckCircle2, Download, Orbit, GraduationCap, Loader2, RefreshCw, RotateCcw, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { canLiveUpdate, downloadApk } from '@/components/UpdateBanner'
import { resetSettings, setSetting, useSettings, type Lang, type Settings } from '@/lib/settings'
import { SPEEDS } from '@/lib/store'
import { LANGS, useT } from '@/lib/i18n'
import { startTour } from '@/lib/tour-store'
import { ui, useUi } from '@/lib/ui-store'
import { applyUpdate, refreshUpdates, restartForUpdate, useUpdates } from '@/lib/update-store'
import { isDesktop } from '@/lib/desktop'
import { APP_VERSION } from '@/lib/update'
import { WidgetsSection } from '@/features/widgets/WidgetsSection'

const ver = (v: string) => (v === 'dev' ? 'dev' : `v${v}`)

/** Big update card at the top of the settings: same store as the top banner, so both always agree. */
function UpdateCard() {
  const t = useT()
  const st = useUpdates((s) => s.s)
  const latest = 'latest' in st ? st.latest : null
  const live = !!latest && (canLiveUpdate(latest) || isDesktop())
  const busy = st.phase === 'checking' || st.phase === 'downloading' || st.phase === 'restarting'
  const available = (st.phase === 'available' || st.phase === 'applyfail' || st.phase === 'needperm' || st.phase === 'installprompt' || st.phase === 'readyrestart') && latest
  const failMsg = st.phase === 'applyfail' ? { offline: t('upd.offline'), 'needs-apk': t('upd.fail.needsapk'), 'bad-file': t('upd.fail.bad'), storage: t('upd.fail.storage') }[st.why] : ''
  const msg = {
    idle: t('upd.idle'),
    checking: t('upd.checking'),
    latest: t('upd.latest'),
    available: latest ? t('upd.available', { v: latest.version }) : '',
    downloading: st.phase === 'downloading' && st.pct !== undefined ? t('upd.downloadingPct', { p: st.pct }) : t('upd.downloading'),
    installprompt: t('upd.prompt'),
    needperm: t('upd.perm'),
    readyrestart: t('upd.ready'),
    restarting: t('upd.restarting'),
    applyfail: failMsg,
    offline: t('upd.offline'),
    error: t('upd.error'),
  }[st.phase]
  const tone = available ? (st.phase === 'applyfail' || st.phase === 'needperm' ? 'text-amber-400' : 'text-cyan-300') : st.phase === 'latest' ? 'text-emerald-400' : st.phase === 'offline' || st.phase === 'error' ? 'text-amber-400' : 'text-muted-foreground'
  const Icon = busy ? Loader2 : available ? Download : st.phase === 'latest' ? CheckCircle2 : st.phase === 'offline' ? WifiOff : RefreshCw
  const retryLive = st.phase === 'needperm' || (st.phase === 'applyfail' && st.why !== 'needs-apk' && st.why !== 'storage')
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-muted/50 px-2 py-2.5">
          <div className="text-[11px] text-muted-foreground">{t('upd.yours')}</div>
          <div className="text-lg font-semibold tabular-nums">{ver(APP_VERSION)}</div>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2.5">
          <div className="text-[11px] text-muted-foreground">{t('upd.newest')}</div>
          <div className="text-lg font-semibold tabular-nums">{latest ? ver(latest.version) : '–'}</div>
        </div>
      </div>
      <div className={`flex items-center justify-center gap-2 text-center text-sm font-medium ${tone}`}>
        <Icon className={`size-4 shrink-0 ${busy ? 'animate-spin' : ''}`} /> {msg}
      </div>
      <Button size="lg" className="h-14 w-full text-base" disabled={busy} variant={available ? 'default' : 'secondary'}
        onClick={() => {
          if (!available) void refreshUpdates()
          else if (st.phase === 'readyrestart') restartForUpdate()
          else if (live && (st.phase === 'available' || st.phase === 'installprompt' || retryLive)) void applyUpdate(latest)
          else downloadApk(latest.apkUrl)
        }}>
        {available
          ? <><Download className="size-5" /> {st.phase === 'readyrestart' ? t('upd.restart') : live && (st.phase === 'available' || st.phase === 'installprompt' || retryLive) ? t('upd.now', { v: latest.version }) : t('upd.apk', { v: latest.version })}</>
          : <><RefreshCw className="size-5" /> {st.phase === 'idle' ? t('upd.check') : t('upd.recheck')}</>}
      </Button>
      {available && live && <p className="text-center text-[11px] text-muted-foreground">{t('upd.liveHint')}{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => downloadApk(latest.apkUrl)}>{t('upd.apkInstead')}</button></p>}
      {available && !live && <p className="text-center text-[11px] text-muted-foreground">{t('upd.apkHint')}</p>}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ k, label, hint }: { k: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]; label: string; hint?: string }) {
  const on = useSettings((s) => s[k])
  return <Row label={label} hint={hint}><Switch checked={on} onCheckedChange={(v) => setSetting(k, v)} aria-label={label} /></Row>
}

function Body() {
  const t = useT()
  const speedIdx = useSettings((s) => s.speedIdx)
  const trueScale = useSettings((s) => s.trueScale)
  const lang = useSettings((s) => s.lang)
  return (
    <div className="grid gap-4">
      <UpdateCard />
      <section className="divide-y rounded-2xl border bg-card px-4">
        <Row label={t('set.lang')} hint={t('set.lang.h')}>
          <Select value={lang} onValueChange={(v) => setSetting('lang', v as Lang)}>
            <SelectTrigger className="w-44 data-[size=default]:h-11" aria-label={t('set.lang')}><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map((l) => <SelectItem key={l.id} value={l.id}>{l.native}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Toggle k="showLabels" label={t('set.labels')} hint={t('set.labels.h')} />
        <Row label={t('set.scale')} hint={trueScale ? t('set.scale.true.h') : t('set.scale.mag.h')}>
          <Select value={trueScale ? 'true' : 'mag'} onValueChange={(v) => setSetting('trueScale', v === 'true')}>
            <SelectTrigger className="w-44 data-[size=default]:h-11" aria-label={t('set.scale')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="true">{t('set.scale.true')}</SelectItem><SelectItem value="mag">{t('set.scale.mag')}</SelectItem></SelectContent>
          </Select>
        </Row>
        <Row label={t('set.speed')} hint={t('set.speed.h')}>
          <Select value={String(speedIdx)} onValueChange={(v) => setSetting('speedIdx', +v)}>
            <SelectTrigger className="w-44 data-[size=default]:h-11" aria-label={t('set.speed')}><SelectValue /></SelectTrigger>
            <SelectContent>{SPEEDS.map((s, i) => <SelectItem key={s.s} value={String(i)}>{t(`speed.${i}` as never)}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Toggle k="reduceMotion" label={t('set.motion')} hint={t('set.motion.h')} />
        <Toggle k="haptics" label={t('set.haptics')} hint={t('set.haptics.h')} />
        <Toggle k="keepAwake" label={t('set.awake')} hint={t('set.awake.h')} />
      </section>
      <WidgetsSection />
      <section className="grid gap-2">
        <Button variant="outline" className="h-12 justify-start gap-3 text-sm" onClick={() => { ui.set({ settingsOpen: false }); startTour() }}>
          <GraduationCap className="size-5" /> {t('set.tour')}
        </Button>
        <Button variant="outline" className="h-12 justify-start gap-3 text-sm text-destructive" onClick={resetSettings}>
          <RotateCcw className="size-5" /> {t('set.reset')}
        </Button>
      </section>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">{t('set.offline')}</p>
      <Credits />
    </div>
  )
}

/** Signature at the bottom of the settings. */
function Credits() {
  const t = useT()
  return (
    <footer className="mt-2 flex flex-col items-center gap-2 border-t pt-6 pb-2 text-center">
      <Orbit className="size-5 text-cyan-400/80" strokeWidth={1.5} />
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">{t('set.by')}</div>
      <div className="font-serif text-xl tracking-wide text-foreground">Joël Nieuwkoop</div>
      <p className="max-w-[17rem] text-[10.5px] leading-relaxed text-muted-foreground">
        © {new Date().getFullYear()} Joël Nieuwkoop · Periapsis<br />
        {t('set.rights')}
      </p>
      <p className="max-w-[17rem] text-[10px] leading-relaxed text-muted-foreground/80">
        Planet &amp; Moon maps: Solar System Scope (solarsystemscope.com/textures), derived from NASA data, CC BY 4.0
      </p>
    </footer>
  )
}

/** Gear menu: a bottom sheet on phones (swipe down to close), a side drawer on wide screens. */
export function SettingsSheet({ wide }: { wide: boolean }) {
  const t = useT()
  const open = useUi((s) => s.settingsOpen)
  return (
    <Drawer open={open} onOpenChange={(settingsOpen) => ui.set({ settingsOpen })} direction={wide ? 'right' : 'bottom'}>
      <DrawerContent className="settings-sheet max-h-[88dvh] data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-[26rem]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <DrawerTitle className="text-lg">{t('set.title')}</DrawerTitle>
          <Button size="icon" variant="ghost" className="size-10" aria-label={t('set.close')} onClick={() => ui.set({ settingsOpen: false })}><X className="size-5" /></Button>
        </div>
        <DrawerDescription className="sr-only">{t('set.desc')}</DrawerDescription>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-vaul-no-drag>
          <Body />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
