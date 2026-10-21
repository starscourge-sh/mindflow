// Run with: node --test test/blocks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockIn, linesIn, nameLineIn, withBlockMarks, wordsOf } from '../src/main/blocks.ts'

const line = (text: string, attrs?: Record<string, unknown>) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: text ? [{ type: 'text', text }] : [] })
const doc = (...content: unknown[]) => ({ type: 'doc', content })

test('a note with no named lines reads as it always did: every line offered, none named', () => {
  const body = doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] }, line('First'), line(''), { type: 'bulletList', content: [{ type: 'listItem', content: [line('Nested')] }] })
  assert.deepEqual(linesIn(body), [
    { index: 0, text: 'Title', id: null, heading: true },
    { index: 1, text: 'First', id: null, heading: false },
    { index: 3, text: 'Nested', id: null, heading: false }
  ])
})

test('naming a line copies the body, names only that line, and keeps a name it already had', () => {
  const body = doc(line('One'), line('Two'), line('Three'))
  const named = nameLineIn(body, 1, 'Two')!
  assert.match(named.id, /^[a-z0-9]{6}$/)
  assert.equal((body.content[1] as { attrs?: unknown }).attrs, undefined)
  assert.equal(blockIn(named.body, named.id)?.content?.[0]?.text, 'Two')
  const again = nameLineIn(named.body, 1, 'Two')!
  assert.equal(again.id, named.id)
  assert.equal(again.body, named.body)
})

test('a line that moved is still found by its words', () => {
  const body = doc(line('New first line'), line('One'), line('Two'))
  const named = nameLineIn(body, 1, 'Two')!
  assert.equal(blockIn(named.body, named.id)?.content?.[0]?.text, 'Two')
  assert.equal(nameLineIn(body, 9, 'Not here'), null)
})

test('Markdown marks a named line with its ^id, as Obsidian does', () => {
  const marked = withBlockMarks(doc(line('Kept', { blockId: 'abc123' }), line('Plain')))
  assert.equal(wordsOf(marked.content![0]), 'Kept ^abc123')
  assert.equal(wordsOf(marked.content![1]), 'Plain')
})

test('a link reads as its words inside a line', () => {
  assert.equal(wordsOf(line('') && { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { label: 'Note' } }] }), 'See Note')
})

test('a gem kept as plain words can have a line named: it becomes the editor\'s document', () => {
  const named = nameLineIn('A gem line worth keeping\n\nA second thought', 1, 'A second')!
  assert.equal((named.body as { type: string }).type, 'doc')
  assert.equal(blockIn(named.body, named.id)?.content?.[0]?.text, 'A second thought')
  assert.equal(nameLineIn('**Marked** up words', 0, 'Marked'), null)
  assert.equal(linesIn('One\nTwo').length, 2)
})
