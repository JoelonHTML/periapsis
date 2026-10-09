import { useState } from 'react'
import { ChevronRight, Compass, Orbit, Search, Telescope, X } from 'lucide-react'
import { keyFeatures, searchFeatures, type Feature } from '@/lib/feature-index'
import { useSettings } from '@/lib/settings'
import { useT } from '@/lib/i18n'
import { tap } from '@/lib/haptics'
import { MODES, MODE_ORDER, modeTabs } from '@/lib/modes'
import { store } from '@/lib/store'
import { openMode, ui, useUi, type Mode } from '@/lib/ui-store'

const ICON: Record<Mode, typeof Orbit> = { design: Orbit, sky: Telescope, explore: Compass }
const TINT: Record<Mode, string> = { design: 'text-cyan-300', sky: 'text-amber-200', explore: 'text-violet-300' }

/** Open a world: its first tab, its own 3D view, drawer half open so its tools are visible. */
export function enterMode(m: Mode, tab = modeTabs(m)[0]) {
  tap()
  openMode(m, tab)
  const v = MODES[m].scene
  if (store.get().view !== v && !(m === 'design' && store.get().view !== 'galaxy' && store.get().view !== 'system')) store.set({ view: v })
  ui.set({ sheet: 'half' })
}

/** Start screen: search any function, or choose one of the four worlds (each tile lists its main functions). */
export function StartScreen() {
  const t = useT()
  const lang = useSettings((s) => s.lang)
  const home = useUi((s) => s.home)
  const last = useUi((s) => s.mode)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Mode | null>(null) // tile that lifts up before its world opens
  if (!home) return null
  const hits = searchFeatures(q, lang)
  const open = (f: Feature) => { setQ(''); enterMode(f.mode, f.tab) }
  return (
    <div className="tour-fade fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background/85 backdrop-blur-md" role="dialog" aria-label={t('home.title')}>
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground"><Orbit className="size-5 text-cyan-400" /> Periapsis</div>
        <h1 className="mt-2 mb-4 text-center text-2xl font-semibold">{t('home.title')}</h1>
        <label className="relative mb-4 block">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('home.search')} aria-label={t('home.search')}
            className="h-12 w-full rounded-2xl border bg-card/90 pr-11 pl-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60" />
          {q && <button type="button" aria-label={t('set.close')} onClick={() => setQ('')} className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center text-muted-foreground"><X className="size-4" /></button>}
        </label>
        {q.trim() ? (
          <ul className="grid gap-2" aria-live="polite">
            {hits.length === 0 && <li className="rounded-2xl border bg-card/80 p-4 text-sm text-muted-foreground">{t('home.noHits')}</li>}
            {hits.map((f) => {
              const Icon = ICON[f.mode]
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => open(f)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card/90 p-3 text-left active:scale-[0.98]">
                    <Icon className={`size-6 shrink-0 ${TINT[f.mode]}`} strokeWidth={1.6} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{f.txt[lang][0]}</span>
                      <span className="block text-xs text-muted-foreground">{t(`mode.${f.mode}`)} › {t(`tab.${f.tab}`)} · {f.txt[lang][1]}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {MODE_ORDER.map((m, i) => {
              const Icon = ICON[m]
              return (
                <button key={m} type="button" disabled={!!picked} style={{ animationDelay: `${80 + i * 90}ms` }}
                  onClick={() => { setPicked(m); setTimeout(() => { setPicked(null); enterMode(m) }, 260) }}
                  className={`home-rise flex min-h-44 flex-col items-start gap-2 rounded-3xl border bg-card/90 p-4 text-left shadow-lg transition-[transform,opacity,box-shadow] duration-300 ease-out active:scale-[0.97] ${i === MODE_ORDER.length - 1 && MODE_ORDER.length % 2 ? 'col-span-2' : ''} ${picked === m ? '-translate-y-3 scale-[1.03] shadow-2xl shadow-cyan-500/20' : picked ? 'translate-y-2 opacity-0' : ''} ${m === last ? 'ring-2 ring-cyan-400/60' : ''}`}>
                  <Icon className={`size-8 ${TINT[m]}`} strokeWidth={1.6} />
                  <div className="mt-auto text-base font-semibold leading-tight">{t(`mode.${m}`)}</div>
                  <ul className="grid gap-0.5 text-[11.5px] leading-snug text-muted-foreground">
                    {keyFeatures(m).map((f) => <li key={f.id} className="truncate">· {f.txt[lang][0]}</li>)}
                  </ul>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
