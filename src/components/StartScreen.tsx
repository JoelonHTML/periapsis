import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Compass, Orbit, Search, Telescope, X } from 'lucide-react'
import { keyFeatures, searchFeatures, type Feature } from '@/lib/feature-index'
import { useSettings } from '@/lib/settings'
import { useT } from '@/lib/i18n'
import { tap } from '@/lib/haptics'
import { MODES, MODE_ORDER, modeTabs } from '@/lib/modes'
import { store } from '@/lib/store'
import { openMode, ui, useUi, type Mode } from '@/lib/ui-store'
import EARTH from '@/assets/earth.jpg'
import MOON from '@/assets/planets/moon.jpg'
import JUPITER from '@/assets/planets/jupiter.jpg'

const ICON: Record<Mode, typeof Orbit> = { design: Orbit, sky: Telescope, explore: Compass }
/** Background photo per world (maps already bundled for the 3D views, so no extra download). */
const PHOTO: Record<Mode, string> = { design: EARTH, sky: MOON, explore: JUPITER }
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
  const box = useRef<HTMLDivElement>(null)
  // Keyboard: the dialog takes focus when it opens and Tab cycles inside it, so Tab reaches the search box and the tiles, not the app behind.
  useEffect(() => { if (home) box.current?.focus({ preventScroll: true }) }, [home])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const els = [...box.current.querySelectorAll<HTMLElement>('a[href], button, input')]
    if (!els.length) return
    const first = els[0], last = els[els.length - 1], a = document.activeElement
    if (e.shiftKey && (a === first || a === box.current)) { e.preventDefault(); last.focus() } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus() }
  }
  if (!home) return null
  const hits = searchFeatures(q, lang)
  const open = (f: Feature) => { setQ(''); enterMode(f.mode, f.tab) }
  return (
    <div ref={box} tabIndex={-1} onKeyDown={trap} aria-modal="true" className="tour-fade fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background/85 outline-none backdrop-blur-md" role="dialog" aria-label={t('home.title')}>
      <div className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="home-in flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground"><Orbit className="size-5 text-cyan-400" /> Periapsis</div>
        <h1 className="home-in mt-2 mb-4 text-center text-2xl font-semibold">{t('home.title')}</h1>
        <label className="home-in relative mx-auto mb-4 block w-full max-w-lg">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('home.search')} aria-label={t('home.search')}
            className="h-12 w-full rounded-2xl border bg-card/90 pr-11 pl-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60" />
          {q && <button type="button" aria-label={t('set.close')} onClick={() => setQ('')} className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center text-muted-foreground"><X className="size-4" /></button>}
        </label>
        {q.trim() ? (
          <ul className="mx-auto grid w-full max-w-lg gap-2" aria-live="polite">
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
          <nav className="home-cats" aria-label={t('home.title')}>
            {MODE_ORDER.map((m, i) => {
              const Icon = ICON[m]
              return (
                // A real link (Tab-reachable, focus-visible = hover); the click opens the world in place.
                <a key={m} href={`#tab=${modeTabs(m)[0]}`} onClick={(e) => { e.preventDefault(); enterMode(m) }}
                  className={`home-cat home-in ${m === last ? 'home-cat--last' : ''}`} style={{ backgroundImage: `url(${PHOTO[m]})`, animationDelay: `${i * 0.15}s` }}>
                  <span className="home-cat__more">
                    <span className="block text-sm text-white/85">{t(`mode.${m}.h`)}</span>
                    <span className="mt-1.5 grid gap-0.5 text-xs text-white/70">{keyFeatures(m).map((f) => <span key={f.id} className="truncate">· {f.txt[lang][0]}</span>)}</span>
                  </span>
                  <span className="home-cat__label">
                    <Icon className={`home-cat__icon size-5 ${TINT[m]}`} strokeWidth={1.8} />
                    <span>{t(`mode.${m}`)}</span>
                    <span className="home-cat__arrow" aria-hidden>→</span>
                  </span>
                  <span className="home-cat__sub">{t(`mode.${m}.h`)}</span>
                </a>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}
