// Run: node --test src/lib/panels-wired.test.ts
// Every tab of every world must have a panel in App.tsx's single `panelTabs` list (used by BOTH the phone and the desktop layout).
// The Windows app once shipped with empty feature tabs because the desktop layout had its own hand-written list.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MODE_ORDER, modeTabs } from './modes.ts'

test('every world tab has a panel; the desktop layout reuses panelTabs instead of its own list', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  const feat = readFileSync('src/features/index.ts', 'utf8')
  const wired = new Set([...app.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]))
  for (const m of feat.match(/FEATURE_PANELS[^}]*\{([^}]*)\}/s)?.[1].matchAll(/(\w+):/g) ?? []) wired.add(m[1])
  for (const mode of MODE_ORDER) for (const tab of modeTabs(mode)) assert.ok(wired.has(tab), `${mode}/${tab} has no panel`)
  assert.equal((app.match(/^\s+\{panelTabs/gm) ?? []).length, 1, 'desktop layout must render {panelTabs}')
  assert.equal((app.match(/<TabsContent value="mission"/g) ?? []).length, 1, 'only one hand-written panel list')
})
