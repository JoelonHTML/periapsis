import { CheckCircle2, Download, GraduationCap, Loader2, RefreshCw, RotateCcw, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { downloadApk } from '@/components/UpdateBanner'
import { resetSettings, setSetting, useSettings, type Settings } from '@/lib/settings'
import { SPEEDS } from '@/lib/store'
import { startTour } from '@/lib/tour-store'
import { ui, useUi } from '@/lib/ui-store'
import { refreshUpdates, useUpdates } from '@/lib/update-store'
import { APP_VERSION } from '@/lib/update'

const ver = (v: string) => (v === 'dev' ? 'dev' : `v${v}`)

/** Big update card at the top of the settings: same store as the top banner, so both always agree. */
function UpdateCard() {
  const st = useUpdates((s) => s.s)
  const latest = 'latest' in st ? st.latest : null
  const busy = st.phase === 'checking'
  const available = st.phase === 'available' && latest
  const msg = {
    idle: 'Tik om te controleren op een nieuwe versie.',
    checking: 'Bezig met zoeken…',
    latest: 'Je hebt de nieuwste versie',
    available: latest ? `Versie ${latest.version} beschikbaar` : '',
    offline: 'Geen verbinding',
    error: 'Kon de nieuwste versie niet ophalen. Probeer het later opnieuw.',
  }[st.phase]
  const tone = available ? 'text-cyan-300' : st.phase === 'latest' ? 'text-emerald-400' : st.phase === 'offline' || st.phase === 'error' ? 'text-amber-400' : 'text-muted-foreground'
  const Icon = busy ? Loader2 : available ? Download : st.phase === 'latest' ? CheckCircle2 : st.phase === 'offline' ? WifiOff : RefreshCw
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-muted/50 px-2 py-2.5">
          <div className="text-[11px] text-muted-foreground">Jouw versie</div>
          <div className="text-lg font-semibold tabular-nums">{ver(APP_VERSION)}</div>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-2.5">
          <div className="text-[11px] text-muted-foreground">Nieuwste versie</div>
          <div className="text-lg font-semibold tabular-nums">{latest ? ver(latest.version) : '–'}</div>
        </div>
      </div>
      <div className={`flex items-center justify-center gap-2 text-sm font-medium ${tone}`}>
        <Icon className={`size-4 ${busy ? 'animate-spin' : ''}`} /> {msg}
      </div>
      <Button size="lg" className="h-14 w-full text-base" disabled={busy} variant={available ? 'default' : 'secondary'}
        onClick={() => (available ? downloadApk(latest.apkUrl) : void refreshUpdates())}>
        {available ? <><Download className="size-5" /> Download versie {latest.version}</> : <><RefreshCw className="size-5" /> {st.phase === 'idle' ? 'Controleer op updates' : 'Opnieuw controleren'}</>}
      </Button>
      {available && <p className="text-center text-[11px] text-muted-foreground">Open daarna de gedownloade APK om te installeren.</p>}
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
  const speedIdx = useSettings((s) => s.speedIdx)
  const trueScale = useSettings((s) => s.trueScale)
  return (
    <div className="grid gap-4">
      <UpdateCard />
      <section className="divide-y rounded-2xl border bg-card px-4">
        <Toggle k="showLabels" label="Labels tonen" hint="Namen bij planeten, manen en ruimtevaartuigen." />
        <Row label="Planeetgrootte" hint={trueScale ? 'Op ware schaal: planeten zijn piepklein.' : 'Vergroot, zodat ze goed te zien zijn.'}>
          <Select value={trueScale ? 'true' : 'mag'} onValueChange={(v) => setSetting('trueScale', v === 'true')}>
            <SelectTrigger className="h-10 w-36" aria-label="Planeetgrootte"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="true">Ware schaal</SelectItem><SelectItem value="mag">Vergroot</SelectItem></SelectContent>
          </Select>
        </Row>
        <Row label="Standaard tempo" hint="Waarmee de tijd start.">
          <Select value={String(speedIdx)} onValueChange={(v) => setSetting('speedIdx', +v)}>
            <SelectTrigger className="h-10 w-36" aria-label="Standaard tempo"><SelectValue /></SelectTrigger>
            <SelectContent>{SPEEDS.map((s, i) => <SelectItem key={s.s} value={String(i)}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Toggle k="reduceMotion" label="Minder animaties" hint="Geen schuif- en zweefeffecten in de menu's." />
        <Toggle k="keepAwake" label="Scherm aan houden" hint="Het scherm gaat niet uit zolang de app open is." />
      </section>
      <section className="grid gap-2">
        <Button variant="outline" className="h-12 justify-start gap-3 text-sm" onClick={() => { ui.set({ settingsOpen: false }); startTour() }}>
          <GraduationCap className="size-5" /> Rondleiding opnieuw starten
        </Button>
        <Button variant="outline" className="h-12 justify-start gap-3 text-sm text-destructive" onClick={resetSettings}>
          <RotateCcw className="size-5" /> Instellingen herstellen
        </Button>
      </section>
    </div>
  )
}

/** Gear menu: a bottom sheet on phones (swipe down to close), a side drawer on wide screens. */
export function SettingsSheet({ wide }: { wide: boolean }) {
  const open = useUi((s) => s.settingsOpen)
  return (
    <Drawer open={open} onOpenChange={(settingsOpen) => ui.set({ settingsOpen })} direction={wide ? 'right' : 'bottom'}>
      <DrawerContent className="settings-sheet max-h-[88dvh] data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-[26rem]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <DrawerTitle className="text-lg">Instellingen</DrawerTitle>
          <Button size="icon" variant="ghost" className="size-10" aria-label="Sluiten" onClick={() => ui.set({ settingsOpen: false })}><X className="size-5" /></Button>
        </div>
        <DrawerDescription className="sr-only">Update, weergave en tempo van Periapsis</DrawerDescription>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-vaul-no-drag>
          <Body />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
