// Run with: node --test test/spoken.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spoken } from '../src/renderer/src/lib/spoken.ts'

test('spoken punctuation becomes marks, with capitals after each sentence', () => {
  assert.equal(spoken('hello there full stop how are you question mark'), 'Hello there. How are you?')
  assert.equal(spoken('apples comma pears new line plums'), 'Apples, pears\nPlums')
  assert.equal(spoken('one new paragraph two'), 'One\n\nTwo')
})

test('a mark Apple wrote as well as the spoken one is written once', () => {
  assert.equal(spoken('It works full stop.'), 'It works.')
  assert.equal(spoken('Yes, comma, really'), 'Yes, really')
})

test('words joined to what was there: a space after a word, a capital only at a new sentence', () => {
  assert.equal(spoken('And then some', 'I wrote'), ' and then some')
  assert.equal(spoken('then', 'Done. '), 'Then')
  assert.equal(spoken('then', 'Done.'), ' Then')
  assert.equal(spoken('I think so', 'and'), ' I think so')
  assert.equal(spoken('', 'x'), '')
})
