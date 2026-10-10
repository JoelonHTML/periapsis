// Periapsis for Windows: the same single-file web app in an Electron window, plus
//  - CORS-free HTTP for the public APIs (renderer asks the main process, see preload.cjs),
//  - automatic updates from the GitHub releases (installer build only; the portable build opens the release page instead),
//  - notifications: system-tray icon, hide-to-tray on close, optional start with Windows, and a 30-minute background poll (space weather + launches).
const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, ipcMain, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const alertsLogic = require('./alerts-logic.cjs')

const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_FILE
const HIDDEN_START = process.argv.includes('--hidden') // started by 'Start with Windows': go straight to the tray
let win = null
let tray = null
let quitting = false
// The updater's latest state lives here too, so a reloaded window (or one opened later) still knows a download is running or ready.
let updState = null // { type: 'available'|'downloaded', version } | null
const send = (msg) => {
  if (msg.type === 'available' || msg.type === 'downloaded') updState = { type: msg.type, version: msg.version }
  else if (msg.type === 'error' && updState && updState.type === 'available') updState = null
  if (win && !win.isDestroyed()) win.webContents.send('periapsis:update', msg)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#04060b', title: 'Periapsis', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  })
  win.once('ready-to-show', () => { if (!(HIDDEN_START && alerts.trayOn)) win.show() })
  // closing the window keeps the app running in the tray while notifications are on
  win.on('close', (e) => {
    if (quitting || !alerts.trayOn) return
    e.preventDefault()
    win.hide()
    if (!alerts.state.balloonShown && tray) {
      alerts.state.balloonShown = true; saveState()
      try { tray.displayBalloon({ title: 'Periapsis', content: alerts.balloon || 'Periapsis keeps running in the tray for notifications', iconType: 'info' }) } catch { /* not Windows */ }
    }
  })
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  // links to other sites open in the normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) } })
}

// ---- HTTP for the renderer (main process has no CORS rules)
// Dev/test only (never in the packaged app): PERIAPSIS_MOCK_API=http://127.0.0.1:PORT sends every API call to a local mock server.
const MOCK = !app.isPackaged && process.env.PERIAPSIS_MOCK_API ? process.env.PERIAPSIS_MOCK_API : ''
ipcMain.handle('periapsis:fetch', async (_e, url, headers) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return { status: 0, body: '', error: 'bad url' }
  try {
    const target = MOCK ? MOCK + new URL(url).pathname + new URL(url).search : url
    const r = await net.fetch(target, { headers: headers && typeof headers === 'object' ? headers : {} })
    return { status: r.status, body: await r.text() }
  } catch (e) {
    return { status: 0, body: '', error: String((e && e.message) || e).slice(0, 160) } // e.g. net::ERR_NAME_NOT_RESOLVED, ERR_CERT_*, ERR_PROXY_*
  }
})
ipcMain.handle('periapsis:openExternal', (_e, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url) })
ipcMain.handle('periapsis:info', () => ({ portable: PORTABLE, version: app.getVersion(), packaged: app.isPackaged }))


// ---- notifications: config from the renderer, tray, poller
// userData/alerts-config.json = what the renderer last sent ({config, trayOn, autostart, muted}); alerts-state.json = dedupe + last-run bookkeeping.
const userFile = (n) => path.join(app.getPath('userData'), n)
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(userFile(n), 'utf8')) } catch { return d } }
const writeJson = (n, v) => { try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(userFile(n), JSON.stringify(v)) } catch { /* ignore */ } }
const alerts = { config: null, trayOn: false, autostart: false, muted: false, state: {}, balloon: '', timer: null, running: false }
const saveState = () => writeJson('alerts-state.json', alerts.state)
const saveConfig = () => writeJson('alerts-config.json', { config: alerts.config, trayOn: alerts.trayOn, autostart: alerts.autostart, muted: alerts.muted })
function loadAlerts() {
  const c = readJson('alerts-config.json', {})
  Object.assign(alerts, { config: c.config || null, trayOn: !!c.trayOn, autostart: !!c.autostart, muted: !!c.muted, state: readJson('alerts-state.json', {}) })
}
const alertsStatus = () => ({ lastRun: alerts.state.lastRun || null, lastError: alerts.state.lastError || null, supported: true })

function showWindow(link) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  if (typeof link === 'string' && link) win.webContents.send('periapsis:navigate', link)
}

/** Show a system notification; click -> window + navigate. Dev/test only: PERIAPSIS_ALERTS_LOG=file appends every notification as a JSON line. */
function notify(n) {
  if (alerts.muted) return false
  if (!app.isPackaged && process.env.PERIAPSIS_ALERTS_LOG) { try { fs.appendFileSync(process.env.PERIAPSIS_ALERTS_LOG, JSON.stringify({ title: n.title, body: n.body, link: n.link }) + '\n') } catch { /* ignore */ } }
  if (!Notification.isSupported()) return false
  const x = new Notification({ title: String(n.title || 'Periapsis').slice(0, 120), body: String(n.body || '').slice(0, 400), icon: path.join(__dirname, 'build', 'icon.png') })
  x.on('click', () => showWindow(n.link))
  x.show()
  return true
}

async function fetchJson(url) {
  const target = MOCK ? MOCK + new URL(url).pathname + new URL(url).search : url
  const r = await net.fetch(target, { headers: { 'User-Agent': 'Periapsis-Desktop', Accept: 'application/json' } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}
async function pollNow() {
  const cfg = alerts.config
  if (!cfg || alerts.running) return alertsStatus()
  alerts.running = true
  try {
    const { notes, errors } = await alertsLogic.runCheck(fetchJson, cfg, alerts.state, Date.now())
    for (const n of notes) notify({ title: n.title, body: n.body, link: 'periapsis://open/sky/live' })
    alerts.state.lastRun = Date.now()
    alerts.state.lastError = errors.length ? errors.join('; ').slice(0, 200) : null
  } catch (e) { alerts.state.lastError = String((e && e.message) || e).slice(0, 200) }
  alerts.running = false
  saveState()
  return alertsStatus()
}
const pollWanted = () => !!(alerts.config && ((alerts.config.spaceweather && alerts.config.spaceweather.on) || (alerts.config.launches && alerts.config.launches.on)))
function applyAlerts() {
  clearInterval(alerts.timer); alerts.timer = null
  if (pollWanted()) { alerts.timer = setInterval(pollNow, alertsLogic.POLL_MS); setTimeout(pollNow, 20000) }
  if (alerts.trayOn) createTray(); else if (tray) { tray.destroy(); tray = null }
  if (app.isPackaged && !PORTABLE) { try { app.setLoginItemSettings({ openAtLogin: alerts.autostart, args: ['--hidden'] }) } catch { /* ignore */ } }
}
function createTray() {
  const t = (alerts.config && alerts.config.texts) || {}
  const L = { open: t.tray_open || 'Open Periapsis', on: t.tray_on || 'Notifications', quit: t.tray_quit || 'Quit' }
  alerts.balloon = t.tray_balloon || ''
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }))
    tray.setToolTip('Periapsis')
    tray.on('click', () => showWindow())
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: L.open, click: () => showWindow() },
    { label: L.on, type: 'checkbox', checked: !alerts.muted, click: (i) => { alerts.muted = !i.checked; saveConfig() } },
    { type: 'separator' },
    { label: L.quit, click: () => { quitting = true; app.quit() } },
  ]))
}
ipcMain.handle('periapsis:alertsConfig', (_e, o) => {
  if (!o || typeof o !== 'object') return alertsStatus()
  alerts.config = o.config && typeof o.config === 'object' ? o.config : null
  alerts.trayOn = !!o.trayOn; alerts.autostart = !!o.autostart
  saveConfig(); applyAlerts()
  return alertsStatus()
})
ipcMain.handle('periapsis:alertsStatus', () => alertsStatus())
ipcMain.handle('periapsis:alertsCheckNow', () => pollNow())
ipcMain.handle('periapsis:notify', (_e, n) => !!n && typeof n === 'object' && notify(n))

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
  ipcMain.handle('periapsis:checkUpdate', () => autoUpdater.checkForUpdates().then(() => true).catch((e) => String((e && e.message) || e).slice(0, 300))) // true, or why not
  ipcMain.handle('periapsis:installUpdate', () => { quitting = true; autoUpdater.quitAndInstall(true, true) }) // silent, and start the app again (quitting: close-to-tray must not hold the window open)
  ipcMain.handle('periapsis:updateState', () => updState)
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 8000) // after start-up, in the background
}
if (!app.isPackaged || PORTABLE) {
  ipcMain.handle('periapsis:checkUpdate', () => 'not packaged')
  ipcMain.handle('periapsis:installUpdate', () => false)
  ipcMain.handle('periapsis:updateState', () => null)
}

const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(() => { Menu.setApplicationMenu(null); loadAlerts(); createWindow(); setupUpdater(); applyAlerts() })
  app.on('before-quit', () => { quitting = true })
  app.on('window-all-closed', () => app.quit())
}
