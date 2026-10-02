import { createStore } from './mini-store.ts'

export type Tab = 'mission' | 'earth' | 'system' | 'calc' | 'lagrange' | 'galaxy' | 'formulas' | 'view' | 'more'
export type Sheet = 'closed' | 'half' | 'full'

/** UI chrome state shared by the shell, the tour and the native (Android back button) layer. */
export const ui = createStore({
  tab: (new URLSearchParams(globalThis.location?.hash.slice(1) ?? '').get('tab') ?? 'mission') as Tab,
  /** Side panel (desktop) / bottom sheet (phone) visible. */
  panelOpen: true,
  /** Phone: height of the bottom drawer (closed = only the time dock peeks out). */
  sheet: 'closed' as Sheet,
  /** Settings sheet (gear button). */
  settingsOpen: false,
})
export const useUi = ui.useStore
