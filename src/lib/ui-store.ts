import { createStore } from './mini-store.ts'

export type Tab = 'mission' | 'earth' | 'system' | 'calc' | 'lagrange' | 'galaxy' | 'formulas' | 'view' | 'more'
  | 'sats' | 'passes' | 'tonight' | 'events' | 'bodies' | 'missions' | 'live' | 'burns' | 'catalog'
export type Mode = 'design' | 'sky' | 'explore'
const MODE_KEY = 'periapsis.mode.v1'
const savedMode = (): Mode => { try { const m = globalThis.localStorage?.getItem(MODE_KEY); return m === 'sats' ? 'explore' : m === 'sky' || m === 'explore' ? m : 'design' /* satellites moved into Explore */ } catch { return 'design' } }
export type Sheet = 'closed' | 'half' | 'full'

/** UI chrome state shared by the shell, the tour and the native (Android back button) layer. */
export const ui = createStore({
  tab: (new URLSearchParams(globalThis.location?.hash.slice(1) ?? '').get('tab') ?? 'mission') as Tab,
  /** Side panel (desktop) / bottom sheet (phone) visible. */
  panelOpen: true,
  /** Phone: height of the bottom drawer (closed = only the time dock peeks out). */
  sheet: 'closed' as Sheet,
  /** Phone: pixels of the 3D view covered by the drawer (bottom) or the landscape side panel (left); the camera re-centres in what is left. */
  covered: { bottom: 0, left: 0 },
  /** Settings sheet (gear button). */
  settingsOpen: false,
  /** Which "world" of the app is open (each has its own tabs, see modes.ts). */
  mode: savedMode(),
  /** Start screen (choose a world) visible. Shown on every start unless a deep link picks a tab. */
  home: !new URLSearchParams(globalThis.location?.hash.slice(1) ?? '').get('tab'),
})
export const useUi = ui.useStore

/** Open a world: remember it, show its first tab. */
export function openMode(mode: Mode, firstTab: Tab) {
  try { globalThis.localStorage?.setItem(MODE_KEY, mode) } catch { /* ignore */ }
  ui.set({ mode, home: false, tab: firstTab })
}
