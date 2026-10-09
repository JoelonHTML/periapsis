import type { Mode, Tab } from './ui-store.ts'

/** The three "worlds" of the app. Each keeps its own short tab bar so unrelated tools never crowd each other.
 *  `tabs` = bottom bar on a phone (max 5, 'view' = time/display, 'more' = the `more` list), `scene` = 3D view it opens on. */
export interface ModeDef { id: Mode; tabs: Tab[]; more: Tab[]; scene: 'solar' | 'earth' | 'galaxy' }
export const MODES: Record<Mode, ModeDef> = {
  design: { id: 'design', tabs: ['mission', 'earth', 'calc', 'view', 'more'], more: ['burns', 'lagrange', 'formulas'], scene: 'solar' },
  sky: { id: 'sky', tabs: ['tonight', 'events', 'live', 'view'], more: [], scene: 'solar' },
  explore: { id: 'explore', tabs: ['bodies', 'system', 'sats', 'galaxy', 'more'], more: ['missions', 'passes', 'catalog', 'lagrange'], scene: 'solar' },
}
export const MODE_ORDER: Mode[] = ['design', 'sky', 'explore']
/** Tabs that bring their own 3D view; any other tab returns to the solar system from these. */
export const TAB_VIEW: Partial<Record<Tab, 'galaxy' | 'system' | 'earth'>> = { galaxy: 'galaxy', system: 'system', sats: 'earth', passes: 'earth' }
/** Every tab a world can show (bar + more list), for the desktop tab strip and for switching worlds. */
export const modeTabs = (m: Mode): Tab[] => [...MODES[m].tabs.filter((t) => t !== 'view' && t !== 'more'), ...MODES[m].more]
export const modeOfTab = (t: Tab): Mode | null => (MODE_ORDER.find((m) => modeTabs(m).includes(t)) ?? null)
