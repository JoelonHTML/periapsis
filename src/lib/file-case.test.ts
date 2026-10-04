// Run: node --test src/lib/file-case.test.ts
// Windows (and macOS) file systems ignore letter case: two files whose names differ only in case, or only in .ts/.tsx, make the
// TypeScript build fail on a Windows CI runner (that broke the first Windows build). Keep every file stem unique per folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

test('no two source files in the same folder share a name apart from case/extension', () => {
  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const f of walk('src')) {
    const key = f.replace(/\.(tsx?|jsx?)$/i, '').toLowerCase()
    const prev = seen.get(key)
    if (prev && prev !== f) clashes.push(`${prev}  ↔  ${f}`)
    seen.set(key, f)
  }
  assert.deepEqual(clashes, [])
})
