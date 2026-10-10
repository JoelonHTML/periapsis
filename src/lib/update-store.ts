import { createStore } from './mini-store.ts'
import { canInstallInApp, installApkInApp } from './apk-install.ts'
import { desktop } from './desktop.ts'
import { downloadBundle, type OtaFail } from './ota.ts'
import { getUpdateStatus, type Update } from './update.ts'

/** One update state shared by the top banner and the settings button, so they can never disagree. */
export type UpdateState =
  | { phase: 'idle' | 'checking' | 'offline' | 'error' }
  | { phase: 'latest' | 'available' | 'restarting' | 'installprompt' | 'needperm' | 'readyrestart'; latest: Update }
  | { phase: 'downloading'; latest: Update; pct?: number }
  | { phase: 'applyfail'; latest: Update; why: OtaFail }

export const updates = createStore<{ s: UpdateState }>({ s: { phase: 'idle' } })
export const useUpdates = updates.useStore

let inflight: Promise<void> | null = null
/** Ask GitHub for the newest release and publish the outcome. Concurrent calls share one request. */
export function refreshUpdates(current?: string): Promise<void> {
  if (inflight) return inflight
  // Windows: the background updater is already downloading / done — a GitHub check must not knock that back to "available"
  // (nor hide the "update did not install" help)
  const cur = updates.get().s
  if (cur.phase === 'downloading' || cur.phase === 'readyrestart' || cur.phase === 'restarting' || (cur.phase === 'applyfail' && cur.why === 'installfail')) return Promise.resolve()
  updates.set({ s: { phase: 'checking' } })
  inflight = getUpdateStatus(current).then((st) => {
    updates.set({ s: st.kind === 'ok' ? { phase: st.newer ? 'available' : 'latest', latest: st.latest } : { phase: st.kind } })
  }).finally(() => { inflight = null })
  return inflight
}

/** Update from inside the app. 1) swap the web build and restart (no prompt) when this APK can run it; 2) otherwise download the APK and
 *  open Android's installer (the user confirms). Resolves false (state 'applyfail' / 'needperm') when the caller should offer a fallback. */
export async function applyUpdate(latest: Update): Promise<boolean> {
  const d = desktop()
  if (d) return applyDesktop(latest, d)
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

/** Windows app. Installer build: download in the app and restart into the new version (electron-updater). Portable build: open the release page. */
async function applyDesktop(latest: Update, d: NonNullable<ReturnType<typeof desktop>>): Promise<boolean> {
  const info = await d.info()
  if (info.portable || !info.packaged) { await d.openExternal(`https://github.com/JoelonHTML/periapsis/releases/tag/v${latest.version}`); return false }
  if (updates.get().s.phase === 'readyrestart') { void d.installUpdate(); return true }
  updates.set({ s: { phase: 'downloading', latest, pct: 0 } })
  const ok = await d.checkUpdate() // progress / downloaded events arrive through initDesktop(); the last one flips the state to 'readyrestart'
  if (ok !== true) {
    // A release whose Windows files are still being uploaded answers 404 / "Cannot find latest.yml": that is "not ready yet", not "no connection".
    const why = typeof ok === 'string' && /404|latest\.yml|cannot find/i.test(ok) ? 'notready' : 'offline'
    updates.set({ s: { phase: 'applyfail', latest, why } }); return false
  }
  return true
}
/** Restart into the downloaded update (Windows app). */
export function restartForUpdate() { void desktop()?.installUpdate() }
