// Run with: node --test test/changed-span.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, type Node } from 'prosemirror-model'
import { changedSpan } from '../src/renderer/src/lib/text-edit.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', attrs: { blockId: { default: null } } },
    text: { group: 'inline' },
  },
})
const doc = (...lines: string[]): Node => schema.node('doc', null, lines.map((words) => schema.node('paragraph', null, words ? [schema.text(words)] : [])))

test('nothing changed: no stretch', () => {
  const one = doc('first', 'second')
  assert.equal(changedSpan(one, one), null)
  assert.equal(changedSpan(one, doc('first', 'second')), null)
})

test('a letter typed: the stretch is that letter, in each', () => {
  // "second" starts at 8 (the first line is 7 long, its words at 1 to 6).
  assert.deepEqual(changedSpan(doc('first', 'second'), doc('first', 'secxond')), { from: 11, oldTo: 11, newTo: 12 })
})

test('a letter typed beside the same letter: the two ends are put right, not before the start', () => {
  const span = changedSpan(doc('aa'), doc('aaa'))!
  assert.ok(span.oldTo >= span.from && span.newTo >= span.from, JSON.stringify(span))
  assert.equal(span.newTo - span.oldTo, 1)
})

test('a whole note pasted into an empty one: from the start to the ends of each', () => {
  const empty = doc('')
  const full = doc('one', 'two', 'three')
  assert.deepEqual(changedSpan(empty, full), { from: 1, oldTo: 1, newTo: full.content.size - 1 })
})

test('a line given a name (its attributes alone): the stretch is that line', () => {
  const named = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('first')]), schema.node('paragraph', { blockId: 'x' }, [schema.text('second')])])
  assert.deepEqual(changedSpan(doc('first', 'second'), named), { from: 7, oldTo: 15, newTo: 15 })
})
