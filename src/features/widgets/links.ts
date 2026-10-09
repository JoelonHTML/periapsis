// Deep links from the home-screen widgets: periapsis://open/<mode>/<tab>. Pure, so it can be tested.
import { MODE_ORDER, modeTabs } from '../../lib/modes.ts'
import type { Mode, Tab } from '../../lib/ui-store.ts'

export function parseDeepLink(url: string | null | undefined): { mode: Mode; tab: Tab } | null {
  const m = /^periapsis:\/\/open\/([a-z]+)\/([a-z]+)\/?(?:[?#].*)?$/.exec((url ?? '').trim())
  if (!m) return null
  const mode = MODE_ORDER.find((x) => x === m[1])
  const tab = mode && modeTabs(mode).find((x) => x === m[2])
  return mode && tab ? { mode, tab } : null
}
