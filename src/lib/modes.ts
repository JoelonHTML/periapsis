import type { Mode, Tab } from './ui-store.ts'

/** The four "worlds" of the app. Each keeps its own short tab bar so unrelated tools never crowd each other.
 *  `tabs` = bottom bar on a phone (max 5, 'view' = time/display, 'more' = the `more` list), `scene` = 3D view it opens on. */
export interface ModeDef { id: Mode; tabs: Tab[]; more: Tab[]; scene: 'solar' | 'earth' | 'galaxy' }
export const MODES: Record<Mode, ModeDef> = {
  design: { id: 'design', tabs: ['mission', 'earth', 'calc', 'view', 'more'], more: ['lagrange', 'formulas'], scene: 'solar' },
  sats: { id: 'sats', tabs: ['sats', 'passes', 'view'], more: [], scene: 'earth' },
  sky: { id: 'sky', tabs: ['tonight', 'events', 'view'], more: [], scene: 'solar' },
  explore: { id: 'explore', tabs: ['bodies', 'missions', 'system', 'galaxy', 'more'], more: ['lagrange', 'formulas'], scene: 'solar' },
}
export const MODE_ORDER: Mode[] = ['design', 'sats', 'sky', 'explore']
/** Every tab a world can show (bar + more list), for the desktop tab strip and for switching worlds. */
export const modeTabs = (m: Mode): Tab[] => [...MODES[m].tabs.filter((t) => t !== 'view' && t !== 'more'), ...MODES[m].more]
export const modeOfTab = (t: Tab): Mode | null => (MODE_ORDER.find((m) => modeTabs(m).includes(t)) ?? null)
