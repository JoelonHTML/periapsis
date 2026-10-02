import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY, add, bodyState, norm, toJ2000, type Vec } from './astro.ts'
import type { Solution } from './mga.ts'
import { LAUNCH_MARGIN, autoAllowed, cycleFlyby, enteredWindow, flybyState, leftWindow, windowPhase } from './closeup.ts'

const tc = 1e8, w = 10 * DAY // window [tc-w, tc+w]

test('forward run across the window start enters; backward run across the end enters', () => {
  assert.equal(enteredWindow(tc - w - 100, tc - w + 100, tc, w), 1)
  assert.equal(enteredWindow(tc + w + 100, tc + w - 100, tc, w), -1)
})

test('no entry when the clock merely sits inside / outside, or runs away from the window', () => {
  assert.equal(enteredWindow(tc - 5, tc + 5, tc, w), 0) // already inside
  assert.equal(enteredWindow(tc - 3 * w, tc - 2 * w, tc, w), 0) // before, not reaching
  assert.equal(enteredWindow(tc - w - 100, tc - w - 200, tc, w), 0) // moving away backwards
  assert.equal(enteredWindow(tc + w + 100, tc + w + 200, tc, w), 0)
})

test('a tick that spans the whole window still counts as a crossing', () => {
  assert.equal(enteredWindow(tc - 2 * w, tc + 2 * w, tc, w), 1)
})

test('leaving the window', () => {
  assert.equal(leftWindow(tc + w - 1, tc + w + 1, tc, w), 1)
  assert.equal(leftWindow(tc - w + 1, tc - w - 1, tc, w), -1)
  assert.equal(leftWindow(tc - 5, tc + 5, tc, w), 0)
})

// The bug: a time jump (new route, rewind to start, SkipBack) used to look like a "crossing". The loop now only feeds the
// interval the clock integrated itself, so the same scenario must produce no auto close-up.
test('scenario: rewind/jump to launch never triggers; a normal run to the flyby triggers exactly once', () => {
  const tDep = tc - 400 * DAY
  const fired: number[] = []
  let clock = tc + 50 * DAY // user was far past the flyby ...
  const tick = (dt: number) => {
    const t0 = clock
    clock += dt
    if (enteredWindow(t0, clock, tc, w) !== 0 && autoAllowed(clock, tDep, true)) fired.push(clock)
  }
  clock = tDep // ... and presses SkipBack: a jump, no tick evaluated
  assert.equal(fired.length, 0)
  for (let i = 0; i < 1000; i++) tick(0.4 * DAY) // 1 month/s at ~12 fps
  assert.equal(fired.length, 1)
})

test('auto close-up is held back just after launch and for disabled flybys', () => {
  const tDep = 5e7
  assert.equal(autoAllowed(tDep + LAUNCH_MARGIN - 1, tDep, true), false)
  assert.equal(autoAllowed(tDep + LAUNCH_MARGIN, tDep, true), true)
  assert.equal(autoAllowed(tDep + 400 * DAY, tDep, false), false)
})

test('windowPhase reports before / inside / after with the offset', () => {
  assert.deepEqual(windowPhase(tc - 20 * DAY, tc, w), { phase: 'before', offset: -20 * DAY })
  assert.equal(windowPhase(tc, tc, w).phase, 'inside')
  assert.equal(windowPhase(tc + 11 * DAY, tc, w).phase, 'after')
})

test('cycleFlyby wraps around the flybys only', () => {
  const ev = [{ kind: 'launch' }, { kind: 'flyby' }, { kind: 'flyby' }, { kind: 'arrival' }] as const
  assert.equal(cycleFlyby([...ev], 1, 1), 2)
  assert.equal(cycleFlyby([...ev], 2, 1), 1)
  assert.equal(cycleFlyby([...ev], 1, -1), 2)
  assert.equal(cycleFlyby([...ev], -1, 1), 1)
  assert.equal(cycleFlyby([{ kind: 'launch' }, { kind: 'arrival' }], -1, 1), -1)
})

test('flybyState: speed follows vis-viva, helio speed at the window edges = planet velocity + v_inf', () => {
  // Unpowered Mars flyby, v_inf = 3 km/s turned by 30 deg; only the fields flybyState/flybyWindow read are filled in.
  const t = toJ2000(Date.UTC(2031, 5, 1)), th = (30 * Math.PI) / 180
  const vinfIn: Vec = [3, 0, 0], vinfOut: Vec = [3 * Math.cos(th), 3 * Math.sin(th), 0]
  const sol = { events: [{ kind: 'flyby', body: 'mars', t, vinfIn, vinfOut }] } as unknown as Solution
  const vMars = bodyState('mars', t).v
  const mid = flybyState(sol, 0, t)
  // vis-viva with mu(Mars) = 42828.4 km^3/s^2: v^2 = vinf^2 + 2 mu / r
  assert.ok(Math.abs(mid.vRel - Math.sqrt(9 + (2 * 42828.4) / mid.r)) / mid.vRel < 5e-3)
  assert.ok(mid.r > 3389.5 * 1.05) // never inside the planet
  const before = flybyState(sol, 0, t - 1e12), after = flybyState(sol, 0, t + 1e12)
  assert.ok(Math.abs(before.vHelio / norm(add(vMars, vinfIn)) - 1) < 5e-3)
  assert.ok(Math.abs(after.vHelio / norm(add(vMars, vinfOut)) - 1) < 5e-3)
})
