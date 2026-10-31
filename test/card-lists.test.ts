// Run with: node --test test/card-lists.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardListOf, cardsOf, guessSeparator, headingsOf } from '../src/main/card-lists.ts'

const pairs = (cards: { term: string; meaning: string }[]): string[][] => cards.map((card) => [card.term, card.meaning])

test('the separator is found by counting: ::, a tab, a pipe, a semicolon', () => {
  assert.equal(guessSeparator('Peru :: Lima\nChile :: Santiago'), ' :: ')
  assert.equal(guessSeparator('mitochondria\tpowerhouse of the cell\nribosome\tmakes proteins'), '\t')
  assert.equal(guessSeparator('What is GPT? | Generative Pre-trained Transformer\nWho wrote Hamlet? | Shakespeare'), '|')
  assert.equal(guessSeparator('1066;Battle of Hastings\n1215;Magna Carta'), ';')
})

test('a two-column spreadsheet makes a card a row, its header row spotted', () => {
  const sheet = 'Front\tBack\nmitochondria\tpowerhouse of the cell\nribosome\tmakes proteins'
  assert.deepEqual(headingsOf(sheet, '\t'), ['Front', 'Back'])
  assert.deepEqual(pairs(cardsOf(sheet, '\t')), [['mitochondria', 'powerhouse of the cell'], ['ribosome', 'makes proteins']])
  const csv = 'Event,Date\n"Treaty of Versailles, signed",1919\nFall of Rome,476'
  assert.deepEqual(pairs(cardsOf(csv, guessSeparator(csv))), [['Treaty of Versailles, signed', '1919'], ['Fall of Rome', '476']])
})

test('a line that splits in three is split at the first and flagged', () => {
  const [card] = cardsOf('Pythagoras | a^2 + b^2 = c^2 | right triangles', '|')
  assert.equal(card.term, 'Pythagoras')
  assert.equal(card.three, true)
})

test('maths and code in a pasted list stay whole', () => {
  assert.deepEqual(pairs(cardsOf('Derivative of $x^2$ :: $2x$\nIntegral of $\\int_0^1 x\\,dx$ :: $\\frac12$', ' :: ')), [['Derivative of $x^2$', '$2x$'], ['Integral of $\\int_0^1 x\\,dx$', '$\\frac12$']])
  assert.deepEqual(cardsOf('a - b = c\nx^2 - 4 = 0', ' - '), [])
})

test('a note takes a paste as cards only when it is plainly a card list', () => {
  assert.equal(cardListOf('Just one line | with a pipe'), null)
  assert.equal(cardListOf('Some prose - with a dash\nmore prose - another'), null)
  assert.equal(cardListOf('| Name | Year |\n|---|---|\n| Monet | 1872 |'), null)
  assert.equal(cardListOf('Name\tYear\tPlace\nMonet\t1872\tLe Havre\nTurner\t1839\tLondon'), null)
  assert.equal(cardListOf('A paragraph of writing.\nAnother; with a semicolon.\nA third line with nothing.'), null)
  const list = cardListOf('Front | Back\nhola | hello\nadiós | goodbye')
  assert.deepEqual(list && { separator: list.separator, headings: list.headings, cards: pairs(list.cards) }, { separator: '|', headings: ['Front', 'Back'], cards: [['hola', 'hello'], ['adiós', 'goodbye']] })
})
