import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onlyInTitles } from '../src/main/title-names.ts'

test('a name met only inside a work title is a character, not a person', () => {
  assert.equal(onlyInTitles('The Picture of Dorian Gray #book', 'Dorian Gray', ['The Picture of Dorian Gray']), true)
  assert.equal(onlyInTitles('Read The Picture of Dorian Gray. Dorian Gray is vain.', 'Dorian Gray', ['The Picture of Dorian Gray']), false)
  assert.equal(onlyInTitles('Lunch with Mary Shelley', 'Mary Shelley', ['The Picture of Dorian Gray']), false)
})
