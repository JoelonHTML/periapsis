import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './native'
import { toJ2000 } from '@/lib/astro'
import { runMga, type MgaInput } from '@/lib/mga'
import { flybyWindow } from '@/lib/mga'
import { addShip, clock, fitRoute, jumpTo, openCloseup, removeShip, renameShip, selectShip, selectedSolution, setSpeedNow, store, type View } from '@/lib/store'

// Deep links: #view=galaxy&tab=galaxy&speed=3600&t=2038-11-03   (speed in s/s, t = UTC date)
const hash = new URLSearchParams(location.hash.slice(1))
const view = hash.get('view')
if (view) store.set({ view: view as View })
if (hash.get('speed')) setSpeedNow(Number(hash.get('speed')))
if (hash.get('t')) jumpTo(toJ2000(Date.parse(hash.get('t')!)))
if (import.meta.env.DEV) {
  // Dev only: window.__orbitlab for scripted states, and #js=<code> (URL-encode '+' as %2B) runs once after load,
  // e.g. #view=solar&js=__orbitlab.demo()
  // demo(): compute a mission on the main thread and select it, e.g. __orbitlab.demo('jupiter', '2038-11-03', 2, {mustVisit: 'mars'})
  // pick = body id: select the first route that has a gravity assist at that body, e.g. demo('jupiter','2038-11-03',2,{},'mars')
  const demo = (target = 'jupiter', arrive = '2038-11-03', maxFlybys = 2, extra: Partial<MgaInput> = {}, pick = '') => {
    const inp = {
      target, maxFlybys, flybyBodies: ['venus', 'earth', 'mars', 'jupiter', 'saturn'], mode: 'arrival', tRef: toJ2000(Date.parse(arrive)),
      windowDays: 0, objective: 'mindv', dvBudget: 99, parkAlt: 200, arrival: 'ellipse', capAlt: 500, capEcc: 0.9, ...extra,
    } as MgaInput
    const r = runMga(inp, () => {})
    const sel = Math.max(0, r.solutions.findIndex((x) => !pick || x.seq.slice(1, -1).includes(pick as never)))
    const chosen = r.solutions[sel]
    store.set({ solutions: r.solutions, selected: chosen ? sel : -1, target: target as never, view: 'solar', flybyIdx: -1, camFit: chosen ? fitRoute(chosen) : 0 })
    if (chosen) jumpTo(chosen.tDep)
    return r.solutions.map((x) => `${x.seq.join('>')} dv=${x.dv.toFixed(2)} tof=${(x.tof / 86400 / 365.25).toFixed(2)}y`)
  }
  // closeup(body, frac): open the close-up of the first gravity assist at `body` and park the clock at frac (−1…1) of its window, paused
  const closeup = (body: string, frac = 0, cam: 'wide' | 'close' | 'sun' = 'wide') => {
    const sol = selectedSolution(store.get()), k = sol?.events.findIndex((e) => e.kind === 'flyby' && e.body === body) ?? -1
    if (!sol || k < 0) return 'no such flyby'
    openCloseup(sol, k)
    store.set({ flybyCam: { mode: cam, n: 1 } })
    jumpTo(sol.events[k].t + frac * flybyWindow(sol, k).tWin)
    clock.paused = true
    return `${body}: flyby ${k}`
  }
  Object.assign(window, { __orbitlab: { store, clock, jumpTo, setSpeedNow, runMga, demo, closeup, addShip, selectShip, removeShip, renameShip } })
  const js = hash.get('js')
  if (js) setTimeout(() => { try { new Function(js)() } catch (e) { console.error(e) } }, 1500)
}

// Dark-only UI; set on <html> so Radix portals (menus, tooltips) inherit it too.
document.documentElement.classList.add('dark')
document.documentElement.style.colorScheme = 'dark'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
