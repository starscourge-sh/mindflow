// Run with: node --test test/voice.test.ts
// Whose words a note is: theirs, what you understood, or yours; and p131 against (p131).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageRef, voiceOf } from '../src/main/voice.ts'

test('a bare page is a direct quote, a page in brackets a paraphrase', () => {
  assert.deepEqual(pageRef('Waste no more time p131'), { page: '131', direct: true })
  assert.deepEqual(pageRef('p. 42'), { page: '42', direct: true })
  assert.deepEqual(pageRef('He means the time is short (p131)'), { page: '131', direct: false })
  assert.deepEqual(pageRef('(pp 10-12)'), { page: '10-12', direct: false })
  assert.equal(pageRef('a step up'), null)
  assert.equal(pageRef(''), null)
})

test('quotes are their words, a sourced gem what you understood, the rest yours', () => {
  assert.equal(voiceOf({ kind: 'quote', attribution: 'A. Writer' }), 'theirs')
  assert.equal(voiceOf({ kind: 'quote' }), 'theirs')
  assert.equal(voiceOf({ type: 'nugget', kind: 'note', attribution: 'A. Writer' }), 'understood')
  assert.equal(voiceOf({ type: 'nugget', kind: 'note' }), 'mine')
  assert.equal(voiceOf({ kind: 'decision' }), 'mine')
  assert.equal(voiceOf({ kind: 'note', medium: 'A book', label: 'Time is short (p131)' }), 'understood')
  assert.equal(voiceOf({ kind: 'note', medium: 'A book', label: 'Time is short p131' }), 'theirs')
  // A page with no source says nothing about whose words they are.
  assert.equal(voiceOf({ kind: 'note', label: 'Time is short (p131)' }), 'mine')
})
