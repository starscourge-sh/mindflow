import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NameBook, nameFrom, reading, type Name } from '../src/main/name-match.ts'

// The mentions read a long note a part at a time, so the main process is never held for the whole of it
// (haligtree.ts findInTurns). The answer must be the one a single reading gives: each name once, where it first
// stands, the same line numbers, with the note's own name and its twin left out.
const everyday = (word: string): boolean => ['reading', 'queue', 'protocol', 'language', 'server', 'garden'].includes(word)
const titles = ['Stoicism', 'Language Server Protocol', 'Frankenstein', 'Reading queue', 'Stoicism', 'Garden', 'Byzantine Empire']
const names = titles.map((title, at) => nameFrom(`n${at}`, title)).filter((one): one is Name => !!one)
const book = new NameBook(names, everyday)
const lines = [
  'The Stoicism of Marcus is not the stoicism of the porch.',
  'Nothing here but a garden.',
  'See the Language Server Protocol, and Frankenstein too.',
  'My Reading Queue grows; the reading queue never shrinks. A Garden, at last.',
  'Frankenstein again, and Stoicism again, in the Byzantine Empire.',
  'language server protocol in lower case, byzantine empire too',
  'Own Title is this note itself.'
]

test('names read a part at a time are the names read in one go', () => {
  for (const strict of [true, false]) {
    for (const leave of [new Set<string>(), new Set(['n2'])]) {
      const whole = book.find(lines, leave, strict, 'Own Title')
      assert.ok(whole.length > 2, 'the lines hold names to find')
      for (const size of [1, 2, 3, 5]) {
        const part = reading('Own Title')
        const parts = []
        for (let from = 0; from < lines.length; from += size) parts.push(...book.find(lines.slice(from, from + size), leave, strict, 'Own Title', part))
        assert.deepEqual(parts, whole, `in parts of ${size}, strict ${strict}`)
      }
    }
  }
})
