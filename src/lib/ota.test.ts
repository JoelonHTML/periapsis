// Run: node --test src/lib/ota.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkBundle, metaOf } from './ota.ts'

const page = (version: string, epoch: string, size = 600_000) =>
  `<!doctype html><html><head><meta name="periapsis-version" content="${version}" /><meta name="periapsis-native" content="${epoch}" /></head><body>${'x'.repeat(size)}</body></html>\n`

test('metaOf reads the build markers', () => {
  assert.equal(metaOf(page('0.5.2', '1'), 'periapsis-version'), '0.5.2')
  assert.equal(metaOf(page('0.5.2', '3'), 'periapsis-native'), '3')
  assert.equal(metaOf('<html></html>', 'periapsis-native'), '')
})

test('checkBundle accepts a complete matching build and rejects the rest', () => {
  assert.equal(checkBundle(page('0.5.2', '1'), '0.5.2', '1'), null)
  assert.equal(checkBundle(page('0.5.2', '1', 10), '0.5.2', '1'), 'bad-file') // too small: cut off or an error page
  assert.equal(checkBundle(page('0.5.2', '1').slice(0, -20), '0.5.2', '1'), 'bad-file') // truncated download
  assert.equal(checkBundle(page('0.5.1', '1'), '0.5.2', '1'), 'bad-file') // not the version the release says
  assert.equal(checkBundle(page('0.5.2', '2'), '0.5.2', '1'), 'needs-apk') // needs new native code
})
