import test from 'node:test'
import assert from 'node:assert/strict'
import { planReminder, eveningBefore, notificationId, HOUR_MS } from './reminderPlan.ts'

test('reminder timing', () => {
  const now = new Date(2026, 9, 2, 10, 0).getTime()
  const ev = new Date(2026, 10, 5, 7, 30).getTime()
  const eve = planReminder(ev, 'eve', now)!
  assert.equal(new Date(eve).getHours(), 19); assert.equal(new Date(eve).getDate(), 4)
  assert.equal(planReminder(ev, 'hour', now), ev - HOUR_MS)
  // event tomorrow 07:00, now 20:00 today: the evening before is gone -> one hour before
  const now2 = new Date(2026, 10, 4, 20, 0).getTime()
  assert.equal(planReminder(ev, 'eve', now2), ev - HOUR_MS)
  // event in 20 minutes -> fire in a minute; event in 1 minute -> refuse
  assert.equal(planReminder(now2 + 20 * 60e3, 'hour', now2), now2 + 60e3)
  assert.equal(planReminder(now2 + 60e3, 'hour', now2), null)
  assert.equal(new Date(eveningBefore(ev)).getMinutes(), 0)
})

test('notification ids are stable, positive 31-bit and distinct', () => {
  const ids = ['moon:full:20261124', 'conj:venus-jupiter:20260609', 'solar:total:20270802', 'meteor:perseids:20270812'].map(notificationId)
  assert.equal(new Set(ids).size, 4)
  for (const i of ids) assert.ok(Number.isInteger(i) && i > 0 && i < 2 ** 31)
  assert.equal(notificationId('x'), notificationId('x'))
})
