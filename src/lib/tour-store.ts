import { createStore } from './mini-store.ts'

const KEY = 'periapsis.tour.v1' // 'done' | 'skipped' once the user finished or skipped the tutorial

function seen() {
  try { return globalThis.localStorage?.getItem(KEY) != null } catch { return true }
}
function remember(v: 'done' | 'skipped') {
  try { globalThis.localStorage?.setItem(KEY, v) } catch { /* private mode: just don't persist */ }
}

/** welcome = first-run choice (start the tour or skip it); running = guided tour at `step`. */
export const tour = createStore({ phase: (seen() ? 'off' : 'welcome') as 'off' | 'welcome' | 'running', step: 0 })
export const useTour = tour.useStore

export function startTour() { tour.set({ phase: 'running', step: 0 }) }
export function showWelcome() { tour.set({ phase: 'welcome', step: 0 }) }
export function endTour(how: 'done' | 'skipped') { remember(how); tour.set({ phase: 'off', step: 0 }) }
