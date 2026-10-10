const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions, pendingOutcome, trimLog } = require('./update-logic.cjs')

test('version compare', () => {
  assert.equal(compareVersions('0.12.1', '0.13.0'), -1)
  assert.equal(compareVersions('v0.13.0', '0.13.0'), 0)
  assert.equal(compareVersions('0.13.10', '0.13.9'), 1)
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.13.0-beta.1', '0.13.0'), 0)
})

test('pending update outcome after restart', () => {
  const now = 1e12
  assert.equal(pendingOutcome(null, '0.12.1', now), 'none')
  assert.equal(pendingOutcome({ version: '0.13.0', at: now - 60e3 }, '0.13.0', now), 'installed')
  assert.equal(pendingOutcome({ version: '0.13.0', at: now - 60e3 }, '0.12.1', now), 'failed') // the case from the bug report
  assert.equal(pendingOutcome({ version: '0.13.0', at: now - 30 * 86400e3 }, '0.12.1', now), 'stale')
})

test('log trimming keeps whole lines at the end', () => {
  const t = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
  const r = trimLog(t, 40)
  assert.ok(r.length <= 40 && r.endsWith('line 99') && !r.startsWith('ine'))
})
