// Run with: node --test test/linked-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doneById, shownDone, syncLinked, taskAt } from '../src/main/linked-lines.ts'

const item = (text: string, attrs: Record<string, unknown>) => ({ type: 'taskItem', attrs, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Saturday' }] },
    { type: 'taskList', content: [item('Frames', { checked: false, taskId: 't1' }), item('Plumber', { checked: true, taskId: 't2' }), item('Plain', { checked: false })] }
  ]
}

test('a sticky finds the task a ticked line is linked to', () => {
  assert.equal(taskAt(doc, [1, 0]), 't1')
  assert.equal(taskAt(doc, [1, 2]), null)
  assert.equal(taskAt(doc, [0]), null)
})

test('a linked line shows as its task is, an unlinked one as written', () => {
  const done = doneById([{ id: 't1', status: 'done' }, { id: 't2', status: 'open' }, { id: 't3', status: 'dropped' }])
  assert.equal(shownDone(doc.content[1].content![0].attrs, done), true)
  assert.equal(shownDone(doc.content[1].content![1].attrs, done), false)
  assert.equal(shownDone({ checked: true, taskId: 't3' }, done), true)
  assert.equal(shownDone({ checked: false }, done), false)
})

test('ticked elsewhere, the note is ticked to match; nothing to change, the same doc back', () => {
  const { doc: next, changed } = syncLinked(doc, [{ id: 't1', status: 'done' }, { id: 't2', status: 'done' }])
  assert.equal(changed, true)
  assert.equal(next.content[1].content![0].attrs!.checked, true)
  assert.equal(next.content[1].content![2].attrs!.checked, false)
  const same = syncLinked(next, [{ id: 't1', status: 'done' }, { id: 't2', status: 'done' }])
  assert.equal(same.changed, false)
  assert.equal(same.doc, next)
})
