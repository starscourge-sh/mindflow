import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byLetter, headword, letterOf } from '../src/renderer/src/lib/headword.ts'

test('a word alone is its own headword', () => {
  assert.deepEqual(headword('Bereft'), { word: 'Bereft' })
  assert.deepEqual(headword('Bereft', 'Deprived of something, often by loss.'), { word: 'Bereft', meaning: 'Deprived of something, often by loss.' })
})

test('"Word: meaning" reads as the word, then its meaning', () => {
  assert.deepEqual(headword('Petrichor: the smell of rain on dry earth.'), { word: 'Petrichor', meaning: 'the smell of rain on dry earth.' })
  assert.deepEqual(headword('Sfumato - soft blending, like smoke'), { word: 'Sfumato', meaning: 'soft blending, like smoke' })
  // The written meaning wins over the title's.
  assert.deepEqual(headword('Petrichor: rain smell', 'The smell of rain on dry earth.'), { word: 'Petrichor', meaning: 'The smell of rain on dry earth.' })
})

test('a question, a link or a long line before a colon stays whole', () => {
  assert.deepEqual(headword('Why does Gatsby watch the green light?'), { word: 'Why does Gatsby watch the green light?' })
  assert.deepEqual(headword('https://example.com'), { word: 'https://example.com' })
  assert.equal(headword('What the narrator keeps returning to across the whole book: the house').word, 'What the narrator keeps returning to across the whole book: the house')
})

test('letters file words A to Z, the rest under #', () => {
  assert.equal(letterOf('éclat'), 'E')
  assert.equal(letterOf('“Sonder”'), 'S')
  assert.equal(letterOf('42'), '#')
  assert.deepEqual(['#', 'B', 'A'].sort(byLetter), ['A', 'B', '#'])
})
