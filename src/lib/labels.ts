// Registry for 3D-anchored HTML labels: r3f components register an Object3D anchor,
// a DOM overlay renders the content, and one per-frame projector positions them all.
import type { ReactNode } from 'react'
import type { Object3D } from 'three'

export interface LabelEntry {
  id: number
  obj: Object3D
  node: ReactNode
  className?: string
  occluder: number // radius of a sphere at the origin that hides the label (0 = none)
  el: HTMLDivElement | null
}

const entries = new Map<number, LabelEntry>()
const listeners = new Set<() => void>()
let nextId = 1
let list: LabelEntry[] = []
const emit = () => { list = [...entries.values()]; listeners.forEach((l) => l()) }

export const labels = {
  add(e: Omit<LabelEntry, 'id' | 'el'>) {
    const id = nextId++
    entries.set(id, { ...e, id, el: null })
    emit()
    return id
  },
  update(id: number, patch: Partial<LabelEntry>) {
    const e = entries.get(id)
    if (e) { Object.assign(e, patch); emit() }
  },
  remove(id: number) { if (entries.delete(id)) emit() },
  all: () => list,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
}
