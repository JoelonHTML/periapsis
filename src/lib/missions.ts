// Saved missions: the INPUTS of a mission (target, craft, optimizer settings), kept in localStorage. Loading one re-runs the optimizer,
// so a saved mission always reflects the current physics instead of a stale result.
const KEY = 'periapsis.missions.v1'
export const MAX_SAVED = 30

export interface SavedMission {
  id: string
  name: string
  savedAt: number
  target: string
  craft: { dry: number; prop: number; isp: number; cd: number; area: number }
  /** the optimizer settings of the Missie tab (date, flyby bodies, objective, ...) */
  params: Record<string, unknown>
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Keep only well-formed entries (the stored JSON is untrusted: older versions, hand edits). */
export function normalizeMissions(raw: unknown): SavedMission[] {
  if (!Array.isArray(raw)) return []
  const out: SavedMission[] = []
  for (const m of raw) {
    const c = m?.craft
    if (typeof m?.id !== 'string' || typeof m?.name !== 'string' || typeof m?.target !== 'string' || !isNum(m?.savedAt)) continue
    if (!c || !['dry', 'prop', 'isp', 'cd', 'area'].every((k) => isNum(c[k]))) continue
    if (!m.params || typeof m.params !== 'object' || Array.isArray(m.params)) continue
    out.push({ id: m.id, name: m.name.slice(0, 80), savedAt: m.savedAt, target: m.target, craft: { dry: c.dry, prop: c.prop, isp: c.isp, cd: c.cd, area: c.area }, params: m.params })
  }
  return out.slice(0, MAX_SAVED)
}

export function loadMissions(): SavedMission[] {
  try { return normalizeMissions(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')) } catch { return [] }
}
function write(list: SavedMission[]) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(list)) } catch { /* private mode: not saved */ }
}

/** Newest first; the oldest entry falls off past MAX_SAVED. Returns the new list. */
export function saveMission(m: Omit<SavedMission, 'id' | 'savedAt'>, now = Date.now()): SavedMission[] {
  const list = [{ ...m, id: `${now}-${Math.random().toString(36).slice(2, 7)}`, savedAt: now }, ...loadMissions()].slice(0, MAX_SAVED)
  write(list)
  return list
}
export function deleteMission(id: string): SavedMission[] {
  const list = loadMissions().filter((m) => m.id !== id)
  write(list)
  return list
}
