import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RootIndex, rootsOf } from '../src/main/roots.ts'

// A note naming "constructor", "toString" or "__proto__" broke every offer: the words were looked up in a plain
// object, found Object's own functions, and "root.endsWith is not a function" stopped the offers handler (6 Nov).
test('words that are names on every object stay words', () => {
  const words = 'the constructor calls toString and valueOf then hasOwnProperty on __proto__'
  for (const root of rootsOf(words)) assert.equal(typeof root, 'string', root)
  assert.ok(rootsOf(words).includes('constructor'))
  assert.equal(rootsOf('running', { running: 'run' })[0], 'run')
})

test('a book with such words builds and matches', () => {
  const book = new RootIndex([
    { key: 'a', title: 'Classes', text: 'A constructor sets up an object; toString says it as words.' },
    { key: 'b', title: 'Objects', text: 'Every object has a constructor and a prototype.' },
  ])
  assert.equal(book.notes.length, 2)
})
