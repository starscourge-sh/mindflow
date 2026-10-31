// Run with: node --test test/fillers.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tidySpeech } from '../src/renderer/src/lib/fillers.ts'

test('thinking sounds go, the words stay', () => {
  assert.equal(tidySpeech('Um, I think the, uh, patent statute came first.'), 'I think the patent statute came first.')
  assert.equal(tidySpeech('So erm we should hmm check it'), 'So we should check it')
})

test('a word said twice in a row is said once', () => {
  assert.equal(tidySpeech('It was the the guilds that kept it.'), 'It was the guilds that kept it.')
  assert.equal(tidySpeech('I I I mean it'), 'I mean it')
})

test('"you know" and "like" go only as pauses at a clause edge', () => {
  assert.equal(tidySpeech('You know, Venice did it first.'), 'Venice did it first.')
  assert.equal(tidySpeech('It worked, you know.'), 'It worked.')
  assert.equal(tidySpeech('It was, like, a monopoly.'), 'It was a monopoly.')
  // Meant words are kept.
  assert.equal(tidySpeech('I like the guilds.'), 'I like the guilds.')
  assert.equal(tidySpeech('Do you know the answer?'), 'Do you know the answer?')
})

test('what is said on purpose is left as it is', () => {
  assert.equal(tidySpeech('No, no, that is wrong.'), 'No, no, that is wrong.')
  assert.equal(tidySpeech('The umbrella and the hummus.'), 'The umbrella and the hummus.')
})

test('the line Settings shows', () => {
  assert.equal(tidySpeech('Um, so the the Venetian statute, uh, came first, you know.'), 'So the Venetian statute came first.')
})

test('nothing left is never an empty line', () => {
  assert.equal(tidySpeech('Um.'), 'Um.')
  assert.equal(tidySpeech('uh'), 'uh')
})
