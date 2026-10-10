// Live update ("app only has to restart"): download the new single-file web build of a GitHub release, keep it in IndexedDB, and let the
// bootstrap in index.html run it on the next start instead of the build baked into the APK. Only web code can change this way; anything
// that needs new native code bumps the "periapsis-native" epoch in index.html and still needs a new APK.
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const DB = 'periapsis-ota'


/** Read a <meta name content> value out of a built HTML string. */
export function metaOf(html: string, name: string): string {
  return new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1] ?? ''
}

export const NATIVE_EPOCH = (typeof document !== 'undefined' ? document.querySelector('meta[name="periapsis-native"]')?.getAttribute('content') : null) ?? '1'

export type OtaFail = 'offline' | 'bad-file' | 'needs-apk' | 'storage' | 'notready' | 'installfail'
export type OtaResult = { ok: true } | { ok: false; why: OtaFail }

/** Is this downloaded text a complete Periapsis build for exactly this version and this APK generation? */
export function checkBundle(html: string, version: string, epoch: string): OtaFail | null {
  if (html.length < 500_000 || !/<\/html>\s*$/i.test(html)) return 'bad-file' // a cut-off download must never replace a working app
  if (metaOf(html, 'periapsis-version') !== version) return 'bad-file'
  if (metaOf(html, 'periapsis-native') !== epoch) return 'needs-apk'
  return null
}

function put(html: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('kv')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', 'readwrite')
      tx.objectStore('kv').put({ version, html, native: metaOf(html, 'periapsis-native') }, 'bundle')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
  })
}

/** Download the release's Periapsis.html (natively, so GitHub's redirect and CORS do not matter) and store it for the next start. */
export async function downloadBundle(htmlUrl: string, version: string): Promise<OtaResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, why: 'needs-apk' }
  let html: string
  try {
    const r = await CapacitorHttp.get({ url: htmlUrl, responseType: 'text' })
    if (r.status !== 200 || typeof r.data !== 'string') return { ok: false, why: 'bad-file' }
    html = r.data
  } catch {
    return { ok: false, why: 'offline' }
  }
  const bad = checkBundle(html, version, NATIVE_EPOCH)
  if (bad) return { ok: false, why: bad }
  try { await put(html, version) } catch { return { ok: false, why: 'storage' } }
  try { localStorage.setItem('periapsis.ota.tries', '0') } catch { /* ignore */ }
  return { ok: true }
}

/** The start that reached "ready" proves the running build works: forget earlier failed attempts. */
export function markReady() { try { localStorage.setItem('periapsis.ota.tries', '0') } catch { /* ignore */ } }
