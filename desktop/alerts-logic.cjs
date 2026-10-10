'use strict'
// Space-weather + launch alert logic for the Windows app. Plain CommonJS with NO electron imports, so it runs in the main process
// AND under `node --test` (alerts-logic.test.cjs). Same rules as the Android background worker (config JSON v1, see src/features/alerts/config.ts).
//
// SWPC alerts.json = [{ product_id, issue_datetime: "2026-10-03 14:10:00.000", message: "Space Weather Message Code: ALTK05\r\nSerial Number: ...\r\n...ALERT: Geomagnetic K-index of 5\r\n..." }]
// Product codes (SWPC subscription-services page): ALTK04..ALTK09 = ALERT geomagnetic K-index of n (observed), WARK04..WARK07 = WARNING K-index n expected,
// WATA.. / WATK.. = WATCH geomagnetic storm category Gn predicted, ALTTP2 / ALTTP4 = ALERT Type II / Type IV radio emission, SUM10R = SUMMARY 10 cm radio burst.
// Because exact watch codes are not documented in one place, watches are recognised by the "WATCH:" headline as well as by the code prefix.

const MIN = 60e3, HOUR = 3600e3
const SW = 'https://services.swpc.noaa.gov/'
const URLS = {
  kp: SW + 'products/noaa-planetary-k-index-forecast.json',
  alerts: SW + 'products/alerts.json',
  ovation: SW + 'json/ovation_aurora_latest.json',
  flares: SW + 'json/goes/primary/xray-flares-latest.json',
  launches: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list',
}
const POLL_MS = 30 * MIN
const ALERT_MAX_AGE = 6 * HOUR, FLARE_MAX_AGE = 3 * HOUR, LAUNCH_FETCH_MIN = HOUR
const G_LAT = { 1: 60, 2: 55, 3: 50, 4: 45, 5: 40 } // NOAA: equatorward edge (geomagnetic latitude) of the visible aurora per G level

const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : '{' + k + '}'))
const gFromKp = (kp) => (kp >= 5 ? Math.min(5, Math.floor(kp + 1e-9) - 4) : 0)
function parseUtc(s) {
  if (typeof s !== 'string' || !s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const ms = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + 'Z')
  return Number.isFinite(ms) ? ms : null
}
/** NOAA tables: [[header...], [row...]] or an array of objects -> array of objects. */
function rows(body) {
  if (!Array.isArray(body) || body.length === 0) return []
  if (!Array.isArray(body[0])) return body.filter((x) => x && typeof x === 'object')
  const head = body[0]
  return body.slice(1).filter(Array.isArray).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

// ---- quiet hours (device-local clock)
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null }
function inQuiet(quiet, now) {
  if (!quiet || !quiet.on) return false
  const a = hm(quiet.from), b = hm(quiet.to)
  if (a == null || b == null || a === b) return false
  const d = new Date(now), m = d.getHours() * 60 + d.getMinutes()
  return a < b ? m >= a && m < b : m >= a || m < b
}

// ---- Sun altitude (low precision, +-0.5 deg is plenty): is it dark enough for aurora to matter?
function sunAltDeg(lat, lon, ms) {
  const rad = Math.PI / 180, d = ms / 86400000 - 10957.5 // days since J2000
  const L = (280.46 + 0.9856474 * d) % 360, g = ((357.528 + 0.9856003 * d) % 360) * rad
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = 23.439 * rad
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam))
  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  const H = ((gmst + lon) * rad) - ra, la = lat * rad
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H)) / rad
}

const fmtPlace = (site) => site.name || `${Math.abs(site.lat).toFixed(1)}°${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(1)}°${site.lon >= 0 ? 'E' : 'W'}`
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)
const FLARE_RANK = { M: 1, X: 2 }

/** Headline of a SWPC message: the first line starting with ALERT:/WARNING:/WATCH:/SUMMARY: (else the first non-empty line after the serial number). */
function headline(msg) {
  const lines = String(msg || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING|CONTINUED ALERT):/i.test(l)) || lines[1] || lines[0] || ''
}

/**
 * Candidate notifications from fetched data. data = { kp, alerts, ovation, flares } (parsed JSON, any may be missing).
 * Returns [{ key, cat: 'spaceweather', title, body, tag }] - NOT yet deduped (see takeNew).
 */
function classifySpaceWeather(data, cfg, now) {
  const sw = cfg.spaceweather, tx = cfg.texts || {}, out = []
  if (!sw || !sw.on) return out
  const kpMin = Number.isFinite(sw.kpMin) ? sw.kpMin : 5
  const kpNote = (kp, g, key) => out.push({ key, tag: 'kp', title: fill(tx.kp_title, { g: 'G' + g }), body: fill(tx.kp_body, { kp: kp.toFixed(kp % 1 ? 1 : 0), g: 'G' + g, lat: G_LAT[Math.min(5, g)] }) })

  // 1. planetary Kp now (observed/estimated) - one notification per G level per UTC day
  let cur = null
  for (const r of rows(data.kp)) {
    const t = parseUtc(r.time_tag), kp = Number(r.kp ?? r.kp_index), k = String(r.observed || '').toLowerCase()
    if (t == null || !Number.isFinite(kp) || k === 'predicted' || t > now) continue
    if (!cur || t > cur.t) cur = { t, kp }
  }
  if (cur && cur.kp >= kpMin && gFromKp(cur.kp) > 0) kpNote(cur.kp, gFromKp(cur.kp), `kp:${dayKey(now)}:G${gFromKp(cur.kp)}`)

  // 2. aurora chance at the observer, only when it is dark there
  if (sw.aurora && cfg.site && data.ovation && Array.isArray(data.ovation.coordinates) && sunAltDeg(cfg.site.lat, cfg.site.lon, now) < -6) {
    const la = Math.round(cfg.site.lat), lo = ((Math.round(cfg.site.lon) % 360) + 360) % 360
    let pct = 0
    for (const c of data.ovation.coordinates) if (c[0] === lo && c[1] === la) { pct = Number(c[2]) || 0; break }
    if (pct >= (sw.auroraMin ?? 30)) out.push({ key: `aurora:${Math.floor(now / (12 * HOUR))}`, tag: 'aurora', title: fill(tx.aurora_title, { pct }), body: fill(tx.aurora_body, { pct, place: fmtPlace(cfg.site) }) })
  }

  // 3. X-ray flares
  if (sw.flareMin === 'M' || sw.flareMin === 'X') {
    const min = FLARE_RANK[sw.flareMin]
    for (const f of rows(data.flares)) {
      const cls = String(f.max_class || f.current_class || '').toUpperCase(), t = parseUtc(f.max_time || f.time_tag)
      const rank = FLARE_RANK[cls[0]]
      if (!rank || rank < min || t == null || now - t > FLARE_MAX_AGE || t > now + 5 * MIN) continue
      out.push({ key: `flare:${f.max_time || f.time_tag}`, tag: 'flare', title: fill(tx.flare_title, { cls }), body: fill(tx.flare_body, { cls, time: new Date(t).toISOString().slice(11, 16) + ' UTC' }) })
    }
  }

  // 4. SWPC alerts / warnings / watches
  for (const a of Array.isArray(data.alerts) ? data.alerts : []) {
    const id = String(a.product_id || ''), t = parseUtc(a.issue_datetime), msg = headline(a.message)
    if (!id || t == null || now - t > ALERT_MAX_AGE) continue
    const key = `al:${id}:${a.issue_datetime}`
    let m
    if ((m = /^(?:ALT|WAR)K0?(\d)$/.exec(id))) {
      const k = +m[1], g = gFromKp(k)
      if (id.startsWith('ALT')) { if (g > 0 && k >= kpMin) kpNote(k, g, `kp:${dayKey(t)}:G${g}`) } // observed: same key as the Kp rows, so only one notification
      else if (sw.watches && k >= kpMin) out.push({ key, tag: 'watch', title: fill(tx.watch_title, { g: 'G' + g }), body: fill(tx.watch_body, { msg }) })
    } else if (/^WAT/.test(id) || /^WATCH:/i.test(msg)) {
      const gm = /Category G(\d)/i.exec(a.message || '') || /\bG(\d)\b/.exec(msg)
      if (sw.watches && (!gm || +gm[1] + 4 >= kpMin)) out.push({ key, tag: 'watch', title: fill(tx.watch_title, { g: gm ? 'G' + gm[1] : '' }), body: fill(tx.watch_body, { msg }) })
    } else if (id === 'ALTTP2' || /\bCME\b|Coronal Mass/i.test(a.message || '')) {
      if (sw.cme) out.push({ key, tag: 'cme', title: fill(tx.cme_title, {}), body: fill(tx.cme_body, { msg }) })
    } else if (id === 'ALTTP4' || id === 'SUM10R' || /Radio Blackout/i.test(a.message || '')) {
      if (sw.radio) out.push({ key, tag: 'radio', title: fill(tx.radio_title, {}), body: fill(tx.radio_body, { msg }) })
    }
  }
  return out
}

/** Launches whose NET is within leadMin (+ one poll period, so a 30-minute poll never skips the window). */
function classifyLaunches(body, cfg, now) {
  const l = cfg.launches, tx = cfg.texts || {}, out = []
  if (!l || !l.on || !body || !Array.isArray(body.results)) return out
  const lead = (l.leadMin || 60) * MIN
  for (const r of body.results) {
    const net = parseUtc(r.net), ab = String((r.status && r.status.abbrev) || '')
    if (net == null || (ab && !/^(Go|TBC)$/i.test(ab))) continue
    const dt = net - now
    if (dt <= 0 || dt > lead + POLL_MS) continue
    const name = String(r.name || '?'), provider = String((r.launch_service_provider && r.launch_service_provider.name) || (r.provider && r.provider.name) || '')
    const vars = { min: Math.max(1, Math.round(dt / MIN)), name, provider }
    out.push({ key: `launch:${r.id || name}:${r.net}`, tag: 'launch', cat: 'launches', title: fill(tx.launch_title, vars), body: fill(tx.launch_body, vars).replace(/ — $/, '') })
  }
  return out
}

/** Dedupe: drop notes already in state.seen, mark the rest, forget entries older than 7 days. Mutates state. */
function takeNew(notes, state, now) {
  state.seen = state.seen || {}
  for (const k of Object.keys(state.seen)) if (now - state.seen[k] > 7 * 24 * HOUR) delete state.seen[k]
  const fresh = []
  for (const n of notes) { if (state.seen[n.key]) continue; state.seen[n.key] = now; fresh.push(n) }
  return fresh
}

/**
 * One poll. fetchJson(url) -> parsed JSON (throws on failure). state = persisted { seen, lastLaunchFetch, launches }.
 * Returns { notes, errors }; notes are deduped + marked, and suppressed (but NOT marked) during quiet hours so they fire afterwards if still current.
 */
async function runCheck(fetchJson, cfg, state, now = Date.now()) {
  const errors = [], data = {}
  const want = async (name, url) => { try { data[name] = await fetchJson(url) } catch (e) { errors.push(`${name}: ${(e && e.message) || e}`) } }
  const sw = cfg.spaceweather
  if (sw && sw.on) {
    await Promise.all([
      want('kp', URLS.kp), want('alerts', URLS.alerts),
      ...(sw.aurora && cfg.site ? [want('ovation', URLS.ovation)] : []),
      ...(sw.flareMin === 'M' || sw.flareMin === 'X' ? [want('flares', URLS.flares)] : []),
    ])
  }
  let notes = classifySpaceWeather(data, cfg, now)
  if (cfg.launches && cfg.launches.on) {
    if (!state.lastLaunchFetch || now - state.lastLaunchFetch >= LAUNCH_FETCH_MIN || !state.launches) {
      try { state.launches = await fetchJson(URLS.launches); state.lastLaunchFetch = now } catch (e) { errors.push(`launches: ${(e && e.message) || e}`) }
    }
    notes = notes.concat(classifyLaunches(state.launches, cfg, now))
  }
  if (inQuiet(cfg.quiet, now)) return { notes: [], errors }
  return { notes: takeNew(notes, state, now), errors }
}

module.exports = { URLS, POLL_MS, fill, gFromKp, parseUtc, rows, inQuiet, sunAltDeg, headline, classifySpaceWeather, classifyLaunches, takeNew, runCheck }
