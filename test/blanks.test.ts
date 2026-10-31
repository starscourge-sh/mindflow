// Run with: node --test test/blanks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBlank, addsUp, answersOf, blankFor, blanksIn, listItemCount, onlyBlank } from '../src/renderer/src/lib/blanks.ts'
import { pictureInText, withPicture } from '../src/renderer/src/lib/answer-picture.ts'

test('a number with its unit blanks the number and keeps the unit showing', () => {
  assert.deepEqual(blankFor('About 75% of people', '75%'), { words: '75', at: 6, unit: '%', article: null })
  assert.equal(blankFor('1,200 mL a minute', '1,200 mL')?.words, '1,200')
  assert.equal(blankFor('Plasma is 3 L', '3 L')?.unit, 'L')
  assert.equal(blankFor('Light moves at 300000 km/s', '300000 km/s')?.unit, 'km/s')
  // A word is a word: nothing kept outside.
  assert.equal(blankFor('Painted by Vermeer', 'Vermeer')?.unit, null)
})

test('"a" or "an" before the words goes inside the blank', () => {
  const found = blankFor('The heart is an organ of the body', 'organ')
  assert.equal(found?.words, 'an organ')
  assert.equal(addBlank('The heart is an organ of the body', 'organ')?.prompt, 'The heart is _____ of the body')
  assert.equal(addBlank('Napoleon was a general', 'general')?.prompt, 'Napoleon was _____')
  // "and" or "Canada" are not articles.
  assert.equal(addBlank('Ottawa is in Canada', 'Canada')?.prompt, 'Ottawa is in _____')
})

test('a second blank goes outside the first, and a hint sits inside its blank', () => {
  const one = addBlank('Surfactant is made by type 2 cells but taken up by macrophages', 'type 2 cells')!.prompt
  const two = addBlank(one, 'macrophages', 'which cells')!.prompt
  assert.equal(two, 'Surfactant is made by _____ but taken up by _____ (which cells)')
  assert.deepEqual(blanksIn(two), [{ hint: null }, { hint: 'which cells' }])
})

test('each blank\'s answer is read back from the words', () => {
  const text = 'Body water: intracellular 25 L, interstitial 13 L, plasma 3 L, about 41 L in all.'
  let prompt = text
  for (const words of ['25 L', '13 L', '3 L']) prompt = addBlank(prompt, words)!.prompt
  assert.equal(prompt, 'Body water: intracellular _____ L, interstitial _____ L, plasma _____ L, about 41 L in all.')
  assert.deepEqual(answersOf(prompt, text), ['25', '13', '3'])
  assert.deepEqual(answersOf('_____ (who) painted the Night Watch', 'Rembrandt painted the Night Watch'), ['Rembrandt'])
  assert.equal(answersOf('No blank here', 'No blank here'), null)
})

test('numbers that add up are asked together, with the reason', () => {
  assert.match(addsUp(['25', '13', '3'], 'intracellular 25 L, interstitial 13 L, plasma 3 L, about 41 L in all') ?? '', /41 minus 25 minus 13 is 3/)
  assert.match(addsUp(['40', '15', '55'], 'x') ?? '', /make 55/)
  assert.equal(addsUp(['1066', '1215'], 'Hastings in 1066, Magna Carta in 1215'), null)
  assert.equal(addsUp(['Rome', 'Paris'], 'Rome and Paris'), null)
})

test('an item of a list is spotted, so its position is not what is learnt', () => {
  assert.equal(listItemCount('The plasma proteins are albumin, fibrinogen and globulins.', 'fibrinogen'), 3)
  assert.equal(listItemCount('Causes:\n- smoking\n- age\n- diet\n- genes', 'age'), 4)
  assert.equal(listItemCount('Paris is the capital of France.', 'Paris'), 0)
  assert.equal(listItemCount('Rome and Paris', 'Paris'), 0)
})

test('asked apart, each card keeps one blank and the others are filled in', () => {
  assert.equal(onlyBlank('_____ is made by _____', ['Surfactant', 'type 2 cells'], 1), 'Surfactant is made by _____')
})

test('a picture goes under the answer, as a block or as Markdown', () => {
  assert.deepEqual(withPicture({ type: 'doc', content: [{ type: 'paragraph' }] }, 'haligtree://assets/a.png'), { type: 'doc', content: [{ type: 'paragraph' }, { type: 'image', attrs: { src: 'haligtree://assets/a.png' } }] })
  assert.equal(withPicture('Baku', 'haligtree://assets/a.png'), 'Baku\n\n![](haligtree://assets/a.png)')
  assert.deepEqual(pictureInText('On the Caspian', 14, 'haligtree://assets/m.png'), { text: 'On the Caspian\n![](haligtree://assets/m.png)', caret: 44 })
})

test('a Context keeps its words and pictures apart, and together again', async () => {
  const { picturesIn, wordsOf, withPictures } = await import('../src/renderer/src/lib/answer-picture.ts')
  const text = 'On the Caspian\n![](haligtree://assets/m.png)\nOil capital'
  assert.deepEqual(picturesIn(text), ['haligtree://assets/m.png'])
  assert.equal(wordsOf(text), 'On the Caspian\n\nOil capital')
  assert.equal(withPictures('On the Caspian', ['haligtree://assets/m.png']), 'On the Caspian\n![](haligtree://assets/m.png)')
})

test('Anki blanks typed by hand are read as blanks, with hints, one number a card', async () => {
  const { askCloze, clozeNumbers, onlyCloze } = await import('../src/renderer/src/lib/blanks.ts')
  const typed = 'Surfactant is made by {{c1::type 2 cells::which cells}} and taken up by {{c2::macrophages}}'
  assert.deepEqual(clozeNumbers(typed), [1, 2])
  assert.deepEqual(askCloze(typed), { asked: 'Surfactant is made by _____ (which cells) and taken up by macrophages', answers: ['type 2 cells'] })
  assert.deepEqual(askCloze(typed, 2).answers, ['macrophages'])
  assert.equal(onlyCloze(typed, 2), 'Surfactant is made by type 2 cells and taken up by {{c2::macrophages}}')
  assert.deepEqual(askCloze('{{c1::25}} L and {{c1::13}} L').answers, ['25', '13'])
  assert.deepEqual(clozeNumbers('No blanks'), [])
})

test('a question with typed blanks is shown with gaps, never its answers', async () => {
  const { typedAsGaps } = await import('../src/renderer/src/lib/blanks.ts')
  assert.equal(typedAsGaps('{{c1::Baku::a city}} is the capital of {{c2::Azerbaijan}}'), '_____ (a city) is the capital of _____')
})
