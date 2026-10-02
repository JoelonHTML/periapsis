import { createStore } from './mini-store.ts'
import { canInstallInApp, installApkInApp } from './apk-install.ts'
import { downloadBundle, type OtaFail } from './ota.ts'
import { getUpdateStatus, type Update } from './update.ts'

/** One update state shared by the top banner and the settings button, so they can never disagree. */
export type UpdateState =
  | { phase: 'idle' | 'checking' | 'offline' | 'error' }
  | { phase: 'latest' | 'available' | 'restarting' | 'installprompt' | 'needperm'; latest: Update }
  | { phase: 'downloading'; latest: Update; pct?: number }
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

/** Update from inside the app. 1) swap the web build and restart (no prompt) when this APK can run it; 2) otherwise download the APK and
 *  open Android's installer (the user confirms). Resolves false (state 'applyfail' / 'needperm') when the caller should offer a fallback. */
export async function applyUpdate(latest: Update): Promise<boolean> {
  updates.set({ s: { phase: 'downloading', latest } })
  if (latest.htmlUrl) {
    const r = await downloadBundle(latest.htmlUrl, latest.version)
    if (r.ok) {
      updates.set({ s: { phase: 'restarting', latest } })
      setTimeout(() => location.reload(), 700) // the bootstrap in index.html starts the downloaded build
      return true
    }
    if (r.why === 'offline') { updates.set({ s: { phase: 'applyfail', latest, why: 'offline' } }); return false }
    // not runnable as a web swap (needs new native code, bad file, no storage): fall through to the full APK
  }
  return installApk(latest)
}

export async function installApk(latest: Update): Promise<boolean> {
  if (!canInstallInApp()) { updates.set({ s: { phase: 'applyfail', latest, why: 'needs-apk' } }); return false }
  updates.set({ s: { phase: 'downloading', latest, pct: 0 } })
  try {
    const st = await installApkInApp(latest.apkUrl, (pct) => updates.set({ s: { phase: 'downloading', latest, pct } }))
    updates.set({ s: { phase: st === 'started' ? 'installprompt' : 'needperm', latest } })
    return st === 'started'
  } catch {
    updates.set({ s: { phase: 'applyfail', latest, why: 'bad-file' } })
    return false
  }
}
