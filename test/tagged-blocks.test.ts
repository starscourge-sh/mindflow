// Run with: node --test test/tagged-blocks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taggedBlocks } from '../src/renderer/src/lib/tagged-blocks.ts'

const doc = (...lines: string[]): unknown => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })

test('a tag on one block of a longer note shows that block alone', () => {
  const body = doc('Notes from the lecture', 'Light bends in water #physics', 'Lunch was good')
  assert.deepEqual(taggedBlocks(body, 'physics'), { lines: ['Light bends in water'], more: 0 })
})

test('a tag that files the whole note shows the note', () => {
  assert.equal(taggedBlocks(doc('One idea', 'Another', '#physics'), 'physics'), null)
  assert.equal(taggedBlocks(doc('Only line #physics'), 'physics'), null)
  assert.equal(taggedBlocks(doc('No tag here', 'Nor here'), 'physics'), null)
})

test('a nested tag counts for its parent, lists and Markdown too', () => {
  const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prisms split light #physics/optics' }] }] }] }] }
  assert.deepEqual(taggedBlocks(body, 'physics'), { lines: ['Prisms split light'], more: 0 })
  assert.deepEqual(taggedBlocks('# Day\n- bought bread\n- read about #Kant today', 'kant'), { lines: ['read about #Kant today'], more: 0 })
})

test('more than three tagged blocks are counted, not all shown', () => {
  const body = doc('Intro', 'a #x', 'b #x', 'c #x', 'd #x', 'outro')
  assert.deepEqual(taggedBlocks(body, 'x'), { lines: ['a', 'b', 'c'], more: 1 })
})
