import { createStore } from './mini-store.ts'
import { downloadBundle, type OtaFail } from './ota.ts'
import { getUpdateStatus, type Update } from './update.ts'

/** One update state shared by the top banner and the settings button, so they can never disagree. */
export type UpdateState =
  | { phase: 'idle' | 'checking' | 'offline' | 'error' }
  | { phase: 'latest' | 'available' | 'downloading' | 'restarting'; latest: Update }
  | { phase: 'applyfail'; latest: Update; why: OtaFail }

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

/** Live update: fetch the release's web build, store it, restart the app into it. Resolves false (state 'applyfail') if anything goes wrong,
 *  so the UI can fall back to the APK download. */
export async function applyUpdate(latest: Update): Promise<boolean> {
  if (!latest.htmlUrl) return false
  updates.set({ s: { phase: 'downloading', latest } })
  const r = await downloadBundle(latest.htmlUrl, latest.version)
  if (!r.ok) { updates.set({ s: { phase: 'applyfail', latest, why: r.why } }); return false }
  updates.set({ s: { phase: 'restarting', latest } })
  setTimeout(() => location.reload(), 700) // the bootstrap in index.html starts the downloaded build
  return true
}
