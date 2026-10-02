import type { BodyId } from '@/lib/astro'
import { store } from '@/lib/store'
import { goCam, setBody } from '@/lib/system-store'
import { ui } from '@/lib/ui-store'
import { BODY_MAP } from './data.ts'

/** Switch the 3D scene to a body. `solar` = follow it in the Solar System view; otherwise open its planet system (moons: camera on the moon). */
export function view3D(id: string, solar = false) {
  const b = BODY_MAP[id]
  if (!b) return
  if (b.kind === 'star') store.set({ view: 'solar', follow: 'none' })
  else if (solar && b.kind !== 'moon') store.set({ view: 'solar', follow: id })
  else if (b.kind === 'moon') {
    setBody(b.parent as BodyId)
    goCam('moon', id)
    store.set({ view: 'system' })
  } else {
    setBody(id as BodyId)
    store.set({ view: 'system' })
  }
  ui.set({ sheet: 'closed' }) // phone: slide the drawer down so the 3D view is visible
}
