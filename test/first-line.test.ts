// Run with: node --test test/first-line.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstLine } from '../src/main/import.ts'

const doc = (...lines: string[]) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) })

test('a line of tags alone is not a name: the first line with words is, its tags after it', () => {
  assert.equal(firstLine(doc('#bit', 'Why did the scarecrow win an award?')), 'Why did the scarecrow win an award? #bit')
  assert.equal(firstLine(doc('', '#bit #joke', 'Out standing in his field')), 'Out standing in his field #bit #joke')
})

test('code is not a name: a note is named from its first line that is not code, else "Code" (captures.ts label)', () => {
  const code = { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: '// block 1\nconst a = 1' }] }
  assert.equal(firstLine({ type: 'doc', content: [code] }), '')
  assert.equal(firstLine({ type: 'doc', content: [code, { type: 'paragraph', content: [{ type: 'text', text: 'What this does' }] }] }), 'What this does')
})

test('words with a tag in them, or tags with nothing else, stay as they are', () => {
  assert.equal(firstLine(doc('Book Star Wars tickets #todo', 'second')), 'Book Star Wars tickets #todo')
  assert.equal(firstLine(doc('#bit')), '#bit')
})
