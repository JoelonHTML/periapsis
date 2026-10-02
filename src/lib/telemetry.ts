// Pure mission bookkeeping: propellant / mass after every burn (Tsiolkovsky), live state at a given time, chart series.
// No React, no store: everything takes a Solution and a craft ({dry, prop, isp}) so it can be unit-tested.
import { G0, MU_SUN, bodyState, norm, propagate, sub, type BodyId, type Vec } from './astro.ts'
import { craftState, type FlightEvent, type Solution } from './mga.ts'

export interface CraftMass { dry: number; prop: number; isp: number }

/** Effective exhaust velocity (km/s). */
const ve = (isp: number) => isp * G0
/** m0 = mf·e^{Δv/(Isp g0)}: wet mass needed to still have `mf` after Δv (km/s). */
export const wetMassFor = (mf: number, dv: number, isp: number) => mf * Math.exp(dv / ve(isp))
/** Propellant (kg) needed to push a given dry (= final) mass through Δv: mf (e^{Δv/(Isp g0)} − 1). */
export const propForDry = (dry: number, dv: number, isp: number) => wetMassFor(dry, dv, isp) - dry

export interface BurnStep {
  index: number // index into sol.events
  kind: FlightEvent['kind']
  body: BodyId
  t: number
  dv: number // km/s of this burn
  cumDv: number // km/s including this burn
  mBefore: number // kg
  mAfter: number // kg
  prop: number // kg burned in this step
  cumProp: number // kg burned including this step
}
export interface MassPlan {
  /** Wet mass at launch. = dry + tank when the tank suffices; otherwise the REQUIRED wet mass dry·e^{Δv/(Isp g0)},
   *  so that masses never drop below the dry mass and the last burn ends exactly on it. */
  m0: number
  mFinal: number // mass after the last burn (= dry when the route is over budget)
  steps: BurnStep[]
  totalDv: number
  totalProp: number // kg burned over the whole route (= propellant required)
  budget: number // Δv (km/s) the tank can deliver
  tank: number // propellant actually on board (kg)
  remaining: number // propellant left after the last burn, relative to the propellant the plan assumes (0 when over budget)
  shortfall: number // kg missing in the tank (0 when it suffices)
  ok: boolean
}

/** Mass after every burn, burns applied sequentially: m_{k+1} = m_k·e^{−Δv_k/(Isp g0)} (exactly the one-shot rocket equation in total). */
export function massPlan(sol: Solution, craft: CraftMass): MassPlan {
  const totalDv = sol.events.reduce((a, e) => a + e.dv, 0)
  const budget = ve(craft.isp) * Math.log((craft.dry + craft.prop) / craft.dry)
  const ok = totalDv <= budget + 1e-9
  const m0 = ok ? craft.dry + craft.prop : wetMassFor(craft.dry, totalDv, craft.isp)
  let m = m0, cum = 0
  const steps: BurnStep[] = sol.events.map((e, index) => {
    const mAfter = m * Math.exp(-e.dv / ve(craft.isp))
    cum += e.dv
    const s: BurnStep = { index, kind: e.kind, body: e.body, t: e.t, dv: e.dv, cumDv: cum, mBefore: m, mAfter, prop: m - mAfter, cumProp: m0 - mAfter }
    m = mAfter
    return s
  })
  const totalProp = m0 - m
  return {
    m0, mFinal: m, steps, totalDv: cum, totalProp, budget, tank: craft.prop, remaining: m - craft.dry,
    shortfall: ok ? 0 : Math.max(0, totalProp - craft.prop), ok,
  }
}

/** Cumulative Δv (km/s) and mass (kg) at time t (burns are instantaneous at their event time). */
export function planAt(plan: MassPlan, t: number) {
  let cumDv = 0, mass = plan.m0, burned = 0
  for (const s of plan.steps) if (s.t <= t) { cumDv = s.cumDv; mass = s.mAfter; burned = s.cumProp }
  return { cumDv, mass, burned }
}

export interface MissionState {
  phase: 'before' | 'cruise' | 'after'
  elapsed: number // s since launch (negative before)
  r: Vec; v: Vec // heliocentric, km, km/s
  speed: number // km/s relative to the Sun
  rSun: number // km
  rEarth: number // km
  dvUsed: number; budget: number // km/s
  burned: number // kg
  remaining: number // kg propellant left, relative to the propellant the plan assumes (required propellant when over budget)
  mass: number // kg
  next: { event: FlightEvent; index: number; dt: number } | null
  plan: MassPlan
}

export function missionState(sol: Solution, craft: CraftMass, t: number): MissionState {
  const plan = massPlan(sol, craft)
  const { cumDv, mass, burned } = planAt(plan, t)
  const { r, v } = craftState(sol, t)
  const index = sol.events.findIndex((e) => e.t > t)
  return {
    phase: t < sol.tDep ? 'before' : t >= sol.tArr ? 'after' : 'cruise',
    elapsed: t - sol.tDep, r, v, speed: norm(v), rSun: norm(r), rEarth: norm(sub(r, bodyState('earth', t).r)),
    dvUsed: cumDv, budget: plan.budget, burned, remaining: plan.m0 - craft.dry - burned, mass, plan,
    next: index < 0 ? null : { event: sol.events[index], index, dt: sol.events[index].t - t },
  }
}

export interface ChartSample { t: number; speed: number; rSun: number }
/** Heliocentric speed and Sun distance along the Lambert legs (a jump in speed at a flyby is real: the burn/turn is instantaneous). */
export function legSamples(sol: Solution, total = 280): ChartSample[] {
  const per = Math.max(30, Math.round(total / sol.legs.length)), out: ChartSample[] = []
  for (const l of sol.legs)
    for (let i = 0; i <= per; i++) {
      const dt = ((l.t2 - l.t1) * i) / per
      const s = i === 0 ? { r: l.r1, v: l.v1 } : propagate(l.r1, l.v1, dt, MU_SUN)
      out.push({ t: l.t1 + dt, speed: norm(s.v), rSun: norm(s.r) })
    }
  return out
}

/** "T+ 12 d 03 u 05 m" / "T− …" */
export function fmtMet(s: number) {
  const a = Math.abs(Math.round(s / 60)), d = Math.floor(a / 1440), h = Math.floor((a % 1440) / 60), m = a % 60
  return `T${s < 0 ? '−' : '+'} ${d} d ${String(h).padStart(2, '0')} u ${String(m).padStart(2, '0')} m`
}
