// Run with: node --test test/dates.test.ts
// "Today" and "yesterday" go by the calendar, never by 24 hours.
process.env.TZ = 'Europe/London'
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
const { ago, heldFor, daysAgo } = await import('../src/main/dates.ts')

test('a moment late last night is yesterday, even under 24 hours ago', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T09:00:00+01:00') })
  try {
    const lastNight = '2026-10-06T22:00:00+01:00'
    assert.equal(daysAgo(lastNight), 1)
    assert.equal(ago(lastNight), 'yesterday')
    assert.equal(heldFor(lastNight), 'open since yesterday')
    assert.equal(ago('2026-10-07T00:30:00+01:00'), 'today')
    assert.equal(heldFor('2026-10-07T00:30:00+01:00'), 'open since today')
    // Two to six days back: the weekday, as the rest of the app says it.
    assert.equal(heldFor('2026-10-05T23:00:00+01:00'), 'open since Monday')
    assert.equal(ago('2026-10-04T12:00:00+01:00'), '3 days ago')
    assert.equal(heldFor('2026-09-20T12:00:00+01:00'), 'open for 2 weeks')
  } finally {
    mock.timers.reset()
  }
})
