// In-app APK update: the native ApkInstaller plugin (android/.../ApkInstallerPlugin.java) downloads the release APK and opens Android's install dialog.
import { Capacitor, registerPlugin } from '@capacitor/core'

interface ApkInstallerPlugin {
  install(o: { url: string }): Promise<{ status: 'started' | 'needs-permission' }>
  addListener(ev: 'progress', cb: (p: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>
}
const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')

/** Only an APK built with this plugin can do it (epoch 2 and up); older installs fall back to the browser download. */
export const canInstallInApp = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ApkInstaller')

export type InstallStatus = 'started' | 'needs-permission'
/** Download `url` and open the system installer. `onPercent` gets 0–100 while downloading. Rejects when the download or hand-over fails. */
export async function installApkInApp(url: string, onPercent: (p: number) => void): Promise<InstallStatus> {
  const sub = await ApkInstaller.addListener('progress', (p) => onPercent(p.percent))
  try { return (await ApkInstaller.install({ url })).status } finally { void sub.remove() }
}
