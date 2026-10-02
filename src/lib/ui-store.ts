import { createStore } from './mini-store.ts'

export type Tab = 'mission' | 'earth' | 'system' | 'calc' | 'lagrange' | 'galaxy' | 'formulas'

/** UI chrome state shared by the shell, the tour and the native (Android back button) layer. */
export const ui = createStore({
  tab: (new URLSearchParams(globalThis.location?.hash.slice(1) ?? '').get('tab') ?? 'mission') as Tab,
  /** Side panel (desktop) / bottom sheet (phone) visible. */
  panelOpen: true,
})
export const useUi = ui.useStore
