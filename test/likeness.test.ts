// Run with: node --test test/likeness.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { similar } = await import('../src/main/likeness.ts')
const { forgives } = await import('../src/main/near.ts')
const { focusStats } = await import('../src/main/focus-numbers.ts')

test('Similar notes: shared rare words rank first, unrelated ones never show', () => {
  const docs = [
    { type: 'capture', id: 'a', title: 'Sourdough starter', kind: 'note', text: 'feed the starter flour water rye levain' },
    { type: 'capture', id: 'b', title: 'Rye loaf', kind: 'note', text: 'rye flour levain overnight starter bake' },
    { type: 'capture', id: 'c', title: 'Bike repair', kind: 'note', text: 'chain gears brake cable' },
    { type: 'nugget', id: 'd', title: 'Water the plants', kind: 'note', text: 'water ferns weekly' }
  ]
  const out = similar(docs, 'a')
  assert.equal(out[0].id, 'b')
  assert.ok(!out.some((one) => one.id === 'c'))
  assert.deepEqual(similar(docs, 'missing'), [])
})

test('Search forgives a slip of the keys, not a different short word', () => {
  assert.ok(forgives(['recieve'], 'How to receive a parcel'))
  assert.ok(forgives(['garden', 'tomatos'], 'Garden plan: tomatoes and beans'))
  assert.ok(!forgives(['cat'], 'The car is parked'))
  assert.ok(!forgives(['bicycle'], 'Sourdough notes'))
})

test('Task times: each task, the average, and which grew', () => {
  const at = (day: number, minutes: number, taskId: string) => {
    const start = new Date(Date.UTC(2026, 9, day, 9))
    return { id: `${taskId}${day}`, taskId, title: taskId, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + minutes * 60000).toISOString(), pausedMs: 0, plannedMs: null, abandonedAt: null }
  }
  const stats = focusStats([at(1, 20, 'Essay'), at(2, 40, 'Essay'), at(3, 30, 'Taxes'), at(4, 10, 'Taxes')], [], new Date(Date.UTC(2026, 9, 5)))
  assert.equal(stats.taskTimes.average, 50)
  const essay = stats.taskTimes.tasks.find((one) => one.taskId === 'Essay')!
  assert.equal(essay.minutes, 60)
  assert.equal(essay.grew, true)
  assert.equal(stats.taskTimes.tasks.find((one) => one.taskId === 'Taxes')!.grew, false)
})
