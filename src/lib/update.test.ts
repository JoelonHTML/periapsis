// Run: node --test src/lib/update.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkForUpdate, isNewer } from './update.ts'

test('isNewer compares x.y.z numerically', () => {
  assert.equal(isNewer('v0.2.0', '0.1.1'), true)
  assert.equal(isNewer('0.10.0', '0.9.9'), true)
  assert.equal(isNewer('1.0.0', '0.99.99'), true)
  assert.equal(isNewer('v0.1.1', '0.1.1'), false)
  assert.equal(isNewer('0.1.0', '0.1.1'), false)
})

test('dev or malformed versions never trigger an update', () => {
  assert.equal(isNewer('v0.2.0', 'dev'), false)
  assert.equal(isNewer('latest', '0.1.0'), false)
  assert.equal(isNewer('0.2', '0.1.0'), false)
})

test('checkForUpdate picks the APK of a newer release and stays quiet otherwise', async () => {
  const real = globalThis.fetch
  const release = { tag_name: 'v0.3.0', body: 'notes', assets: [{ name: 'Periapsis.html', browser_download_url: 'h' }, { name: 'Periapsis.apk', browser_download_url: 'https://x/Periapsis.apk' }] }
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify(release))) as typeof fetch
    assert.deepEqual(await checkForUpdate('0.2.0'), { version: '0.3.0', apkUrl: 'https://x/Periapsis.apk', notes: 'notes' })
    assert.equal(await checkForUpdate('0.3.0'), null)
    globalThis.fetch = (async () => new Response(JSON.stringify({ ...release, assets: [] }))) as typeof fetch
    assert.equal(await checkForUpdate('0.2.0'), null)
    globalThis.fetch = (async () => { throw new Error('offline') }) as typeof fetch
    assert.equal(await checkForUpdate('0.2.0'), null)
  } finally {
    globalThis.fetch = real
  }
})
