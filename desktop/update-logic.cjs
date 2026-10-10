// Pure helpers for the Windows update flow (no Electron), so they can be tested with node --test.
'use strict'

/** -1 / 0 / 1 for dotted numeric versions ("0.12.1" < "0.13.0"); a leading "v" and pre-release tails are ignored. */
function compareVersions(a, b) {
  const p = (v) => String(v || '').replace(/^v/, '').split(/[-+]/)[0].split('.').map((x) => parseInt(x, 10) || 0)
  const x = p(a), y = p(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1 }
  return 0
}

/** After a restart: did the update we started actually install? pending = { version, file, at } written just before the installer ran. */
function pendingOutcome(pending, running, now = Date.now()) {
  if (!pending || !pending.version) return 'none'
  if (compareVersions(running, pending.version) >= 0) return 'installed'
  if (now - (pending.at || 0) > 14 * 86400e3) return 'stale' // a very old attempt: forget it, the normal check takes over
  return 'failed'
}

/** Keep the log small: the last `max` characters, cut at a line start. */
function trimLog(text, max = 64 * 1024) {
  if (text.length <= max) return text
  const cut = text.slice(text.length - max)
  const nl = cut.indexOf('\n')
  return nl >= 0 ? cut.slice(nl + 1) : cut
}

module.exports = { compareVersions, pendingOutcome, trimLog }
