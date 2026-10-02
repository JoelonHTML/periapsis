// Shared state of the Satellites world: current group list, selected satellites (persisted with their elements, so they
// keep working offline) and the loading status. UI + 3D layer both read it.
import { clock, setSpeedNow } from '../../lib/store.ts'
import { toJ2000 } from '../../lib/astro.ts'
import { createStore } from '../../lib/mini-store.ts'
import { loadGroup, readCache, writeCache, type GroupId, type LoadStatus } from './data.ts'
import { parseTleText, type SatRecord } from './tle.ts'

export const MAX_SELECTED = 4
export const SEL_COLORS = ['#22d3ee', '#f472b6', '#facc15', '#a3e635']
const SEL_KEY = 'periapsis.sat.sel.v1', GROUP_KEY = 'periapsis.sat.group.v1'

interface S {
  group: GroupId; sats: SatRecord[]; fetchedAt: number | null
  status: LoadStatus | 'loading' | 'idle'
  selected: SatRecord[]; active: number
}
function loadSel(): SatRecord[] {
  try { const a = JSON.parse(localStorage.getItem(SEL_KEY) ?? '[]'); return Array.isArray(a) ? a.filter((r) => r && r.norad && (r.row || r.tle)).slice(0, MAX_SELECTED) : [] } catch { return [] }
}
function loadGroupId(): GroupId { try { return (localStorage.getItem(GROUP_KEY) as GroupId) || 'stations' } catch { return 'stations' } }

export const sats = createStore<S>({ group: loadGroupId(), sats: [], fetchedAt: null, status: 'idle', selected: loadSel(), active: 0 })
export const useSats = sats.useStore

const persist = () => { try { localStorage.setItem(SEL_KEY, JSON.stringify(sats.get().selected)) } catch { /* ignore */ } }

export async function selectGroup(g: GroupId, force = false) {
  try { localStorage.setItem(GROUP_KEY, g) } catch { /* ignore */ }
  sats.set({ group: g, status: 'loading' })
  const r = await loadGroup(g, { force })
  if (sats.get().group !== g) return
  // refresh the elements of selected satellites that are in the new data
  const byId = new Map((r.data?.sats ?? []).map((s) => [s.norad, s]))
  const selected = sats.get().selected.map((s) => (s.tle ? s : byId.get(s.norad) ?? s))
  sats.set({ sats: r.data?.sats ?? [], fetchedAt: r.data?.fetchedAt ?? null, status: r.status, selected })
  persist()
}

export function toggleSat(rec: SatRecord): 'max' | 'ok' {
  const s = sats.get(), i = s.selected.findIndex((x) => x.norad === rec.norad)
  if (i >= 0) {
    const selected = s.selected.filter((_, k) => k !== i)
    sats.set({ selected, active: Math.max(0, Math.min(s.active - (i < s.active ? 1 : 0), selected.length - 1)) })
  } else {
    if (s.selected.length >= MAX_SELECTED) return 'max'
    sats.set({ selected: [...s.selected, rec], active: s.selected.length })
  }
  persist()
  return 'ok'
}
export const setActive = (i: number) => sats.set({ active: i })

/** Adds pasted TLE text (throws Error('bad-tle')). The records join the 'custom' list and the selection. */
export function addCustomTle(text: string) {
  const recs = parseTleText(text)
  const old = readCache(localStorage, 'custom')?.sats ?? []
  const merged = [...recs, ...old.filter((o) => !recs.some((r) => r.norad === o.norad))]
  writeCache(localStorage, 'custom', { fetchedAt: Date.now(), sats: merged })
  const s = sats.get()
  const selected = [...s.selected.filter((x) => !recs.some((r) => r.norad === x.norad)), ...recs].slice(-MAX_SELECTED)
  sats.set({ selected, active: selected.length - 1 })
  persist()
  void selectGroup('custom')
}

/** The app clock jumps to the real current time at normal speed. */
export function jumpToNow() { clock.t = toJ2000(Date.now()); setSpeedNow(1); clock.paused = false }
