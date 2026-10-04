// Periapsis for Windows: the same single-file web app in an Electron window, plus
//  - CORS-free HTTP for the public APIs (renderer asks the main process, see preload.cjs),
//  - automatic updates from the GitHub releases (installer build only; the portable build opens the release page instead).
const { app, BrowserWindow, Menu, ipcMain, net, shell } = require('electron')
const path = require('path')

const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_FILE
let win = null
const send = (msg) => { if (win && !win.isDestroyed()) win.webContents.send('periapsis:update', msg) }

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#04060b', title: 'Periapsis', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  })
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  // links to other sites open in the normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) } })
}

// ---- HTTP for the renderer (main process has no CORS rules)
ipcMain.handle('periapsis:fetch', async (_e, url, headers) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return { status: 0, body: '' }
  try {
    const r = await net.fetch(url, { headers: headers && typeof headers === 'object' ? headers : {} })
    return { status: r.status, body: await r.text() }
  } catch {
    return { status: 0, body: '' }
  }
})
ipcMain.handle('periapsis:openExternal', (_e, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url) })
ipcMain.handle('periapsis:info', () => ({ portable: PORTABLE, version: app.getVersion(), packaged: app.isPackaged }))

// ---- automatic updates (installer build)
function setupUpdater() {
  if (!app.isPackaged || PORTABLE) return
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true // an update that was downloaded is installed on the next close at the latest
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent) }))
  autoUpdater.on('update-available', (i) => send({ type: 'available', version: i.version }))
  autoUpdater.on('update-downloaded', (i) => send({ type: 'downloaded', version: i.version }))
  autoUpdater.on('error', (e) => send({ type: 'error', message: String(e && e.message || e).slice(0, 200) }))
  ipcMain.handle('periapsis:checkUpdate', () => autoUpdater.checkForUpdates().then(() => true).catch(() => false))
  ipcMain.handle('periapsis:installUpdate', () => autoUpdater.quitAndInstall(true, true)) // silent, and start the app again
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 8000) // after start-up, in the background
}
if (!app.isPackaged || PORTABLE) {
  ipcMain.handle('periapsis:checkUpdate', () => false)
  ipcMain.handle('periapsis:installUpdate', () => false)
}

const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); setupUpdater() })
  app.on('window-all-closed', () => app.quit())
}
