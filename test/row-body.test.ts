// Run with: node --test test/row-body.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowBody } from '../src/renderer/src/lib/row-body.ts'

const doc = (...lines: string[]) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) })
const TITLE = 'Entry-level position: requires 5 years of experience'

test('a first line that is the title again goes, case, punctuation and tags aside', () => {
  assert.deepEqual(rowBody(doc('entry-level position requires 5 years of experience.', 'More words'), TITLE), doc('More words'))
  assert.deepEqual(rowBody(doc('Something else', 'More'), TITLE), doc('Something else', 'More'))
  assert.deepEqual(rowBody(`${TITLE}\nMore words`, TITLE), 'More words')
})

test('a last line of nothing but tags goes; tags inside the words stay', () => {
  assert.deepEqual(rowBody(doc(TITLE, '#bit #programming-humour #career'), TITLE), doc())
  assert.deepEqual(rowBody(doc('A joke about #career', '#bit #career')), doc('A joke about #career'))
  assert.equal(rowBody('A joke\n#bit #career'), 'A joke')
})

test('a line break inside one paragraph counts as a line', () => {
  const one = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: TITLE }, { type: 'hardBreak' }, { type: 'text', text: 'Why it is funny' }, { type: 'hardBreak' }, { type: 'text', text: '#bit #career' }] }] }
  assert.deepEqual(rowBody(one, TITLE), doc('Why it is funny'))
})

test('words that would be left empty with no title stay whole', () => {
  assert.deepEqual(rowBody(doc('#bit #career')), doc('#bit #career'))
  assert.equal(rowBody('#bit'), '#bit')
})
