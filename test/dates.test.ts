// Run with: node --test test/dates.test.ts
// "Today" and "yesterday" go by the calendar, never by 24 hours.
process.env.TZ = 'Europe/London'
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
const { ago, heldFor, daysAgo, when, short, moment, dated } = await import('../src/main/dates.ts')

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

test('a date in another year says its year, so 1999 never reads like this year', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T09:00:00+01:00') })
  try {
    assert.equal(when('1999-01-01T14:00:00Z', false), '1 Jan 1999 14:00')
    assert.equal(when('2025-09-02T12:00:00+01:00'), '2 Sept 2025')
    assert.equal(when('2099-12-31T10:00:00Z'), '31 Dec 2099')
    assert.equal(when('2026-12-31T10:00:00Z'), '31 Dec')
    assert.equal(short('1999-01-01T14:00:00Z', true), '1 Jan 1999')
    assert.equal(moment('2025-03-04T15:00:00Z'), 'Tue 4 Mar 2025, 15:00')
    assert.equal(moment('2026-03-04T15:00:00Z'), 'Wed 4 Mar, 15:00')
    assert.equal(dated('2026-03-04', 'ddd D MMM'), 'Wed 4 Mar')
  } finally {
    mock.timers.reset()
  }
})
