// Your pace through a book (main/pace.ts): the day you finish at the pages a day you go at.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finishBy } from '../src/main/pace.ts'

test('two days of reading say when you finish', () => {
  // 20 pages over 2 days from p. 100: 10 a day, 80 left: 8 days on from 3 Nov.
  assert.equal(finishBy([{ day: '2026-11-01', furthest: 100 }, { day: '2026-11-03', furthest: 120 }], 120, 200, '2026-11-03'), '2026-11-11')
})
test('one day, no pages gone, a finished book or a year away say nothing', () => {
  assert.equal(finishBy([{ day: '2026-11-01', furthest: 10 }], 10, 200, '2026-11-01'), null)
  assert.equal(finishBy([{ day: '2026-11-01', furthest: 10 }, { day: '2026-11-02', furthest: 10 }], 10, 200, '2026-11-02'), null)
  assert.equal(finishBy([{ day: '2026-11-01', furthest: 10 }, { day: '2026-11-02', furthest: 200 }], 200, 200, '2026-11-02'), null)
  assert.equal(finishBy([{ day: '2026-01-01', furthest: 10 }, { day: '2026-11-02', furthest: 11 }], 11, 2000, '2026-11-02'), null)
})
