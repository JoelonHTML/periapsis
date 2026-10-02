// In-app update check against the GitHub Releases of this repo (used by the Android app).
export const REPO = 'JoelonHTML/periapsis'
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
export const APK_URL = `${RELEASES_URL}/download/Periapsis.apk`

/** Version of this build ("0.2.0"); CI sets VITE_APP_VERSION from the git tag, local builds are "dev". */
export const APP_VERSION: string = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_APP_VERSION || 'dev'

const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10))

/** true when `latest` is a higher x.y.z than `current`; anything unparsable (e.g. "dev") never triggers an update. */
export function isNewer(latest: string, current: string) {
  const a = parts(latest), b = parts(current)
  if (a.length < 3 || b.length < 3 || [...a.slice(0, 3), ...b.slice(0, 3)].some(Number.isNaN)) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

export interface Update { version: string; apkUrl: string; /** the release's single-file web build, for the in-app live update */ htmlUrl?: string; notes: string }

/** Result of asking GitHub for the newest release. `latest` = newest version and its APK, `newer` = it beats `current`. */
export type UpdateStatus =
  | { kind: 'ok'; latest: Update; newer: boolean }
  | { kind: 'offline' } // fetch threw: no connection
  | { kind: 'error' } // GitHub answered, but not with a usable release (rate limit, no APK attached, ...)

export async function getUpdateStatus(current = APP_VERSION): Promise<UpdateStatus> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  } catch {
    return { kind: 'offline' }
  }
  try {
    if (!res.ok) return { kind: 'error' }
    const rel = (await res.json()) as { tag_name: string; body?: string; assets?: { name: string; browser_download_url: string }[] }
    const apk = rel.assets?.find((a) => a.name.endsWith('.apk'))
    if (!apk) return { kind: 'error' }
    const html = rel.assets?.find((a) => a.name.endsWith('.html'))
    const latest: Update = { version: rel.tag_name.replace(/^v/, ''), apkUrl: apk.browser_download_url, notes: rel.body ?? '' }
    if (html) latest.htmlUrl = html.browser_download_url
    return { kind: 'ok', latest, newer: isNewer(rel.tag_name, current) }
  } catch {
    return { kind: 'error' }
  }
}

/** Latest release if it is newer than this build and has an APK attached, else null. Network errors → null (stay quiet offline). */
export async function checkForUpdate(current = APP_VERSION): Promise<Update | null> {
  const st = await getUpdateStatus(current)
  return st.kind === 'ok' && st.newer ? st.latest : null
}
