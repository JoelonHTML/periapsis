import { Compass, Orbit, Satellite, Telescope } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { tap } from '@/lib/haptics'
import { MODES, MODE_ORDER, modeTabs } from '@/lib/modes'
import { store } from '@/lib/store'
import { openMode, ui, useUi, type Mode } from '@/lib/ui-store'

const ICON: Record<Mode, typeof Orbit> = { design: Orbit, sats: Satellite, sky: Telescope, explore: Compass }
const TINT: Record<Mode, string> = { design: 'text-cyan-300', sats: 'text-emerald-300', sky: 'text-amber-200', explore: 'text-violet-300' }

/** Open a world: its first tab, its own 3D view, drawer half open so its tools are visible. */
export function enterMode(m: Mode) {
  tap()
  openMode(m, modeTabs(m)[0])
  const v = MODES[m].scene
  if (store.get().view !== v && !(m === 'design' && store.get().view !== 'galaxy' && store.get().view !== 'system')) store.set({ view: v })
  ui.set({ sheet: 'half' })
}

/** Start screen: choose one of the four worlds. Each world has its own short tab bar. */
export function StartScreen() {
  const t = useT()
  const home = useUi((s) => s.home)
  const last = useUi((s) => s.mode)
  if (!home) return null
  return (
    <div className="tour-fade fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md" role="dialog" aria-label={t('home.title')}>
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground"><Orbit className="size-5 text-cyan-400" /> Periapsis</div>
      <h1 className="mt-2 mb-6 text-center text-2xl font-semibold">{t('home.title')}</h1>
      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {MODE_ORDER.map((m) => {
          const Icon = ICON[m]
          return (
            <button key={m} type="button" onClick={() => enterMode(m)}
              className={`tour-pop flex min-h-36 flex-col items-start justify-between rounded-3xl border bg-card/90 p-4 text-left shadow-lg transition-transform active:scale-[0.97] ${m === last ? 'ring-2 ring-cyan-400/60' : ''}`}>
              <Icon className={`size-8 ${TINT[m]}`} strokeWidth={1.6} />
              <div>
                <div className="text-base font-semibold leading-tight">{t(`mode.${m}`)}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{t(`mode.${m}.h`)}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
