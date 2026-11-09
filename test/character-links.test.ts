import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renamePerson } from '../src/main/link-rename.ts'

const key = (name: string): string => name.trim().toLowerCase()

test('a character renamed: its @ links follow, as a person\'s do, and keep their kind', () => {
  const text = 'Read [[@character:Paul Atreides|Paul Atreides]] with [[@person:Frank Herbert|Frank Herbert]].'
  const out = renamePerson(text, 'Paul Atreides', 'Paul Muad\'Dib', key)
  assert.equal(out.count, 1)
  assert.equal(out.body, 'Read [[@character:Paul Muad\'Dib|Paul Muad\'Dib]] with [[@person:Frank Herbert|Frank Herbert]].')
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'noteLink', attrs: { id: 'character:Paul Atreides', label: 'Paul Atreides' } },
    { type: 'noteLink', attrs: { id: 'person:Paul Atreides', label: 'Paul' } }
  ] }] }
  const moved = renamePerson(doc, 'Paul Atreides', 'Paul Muad\'Dib', key) as { body: typeof doc; count: number }
  assert.equal(moved.count, 2)
  assert.deepEqual(moved.body.content[0].content.map((one) => one.attrs), [
    { id: 'character:Paul Muad\'Dib', label: 'Paul Muad\'Dib' },
    { id: 'person:Paul Muad\'Dib', label: 'Paul' }
  ])
})
