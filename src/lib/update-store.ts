import { createStore } from './mini-store.ts'
import { getUpdateStatus, type Update } from './update.ts'

/** One update state shared by the top banner and the settings button, so they can never disagree. */
export type UpdateState =
  | { phase: 'idle' | 'checking' | 'offline' | 'error' }
  | { phase: 'latest' | 'available'; latest: Update }

export const updates = createStore<{ s: UpdateState }>({ s: { phase: 'idle' } })
export const useUpdates = updates.useStore

let inflight: Promise<void> | null = null
/** Ask GitHub for the newest release and publish the outcome. Concurrent calls share one request. */
export function refreshUpdates(current?: string): Promise<void> {
  if (inflight) return inflight
  updates.set({ s: { phase: 'checking' } })
  inflight = getUpdateStatus(current).then((st) => {
    updates.set({ s: st.kind === 'ok' ? { phase: st.newer ? 'available' : 'latest', latest: st.latest } : { phase: st.kind } })
  }).finally(() => { inflight = null })
  return inflight
}
