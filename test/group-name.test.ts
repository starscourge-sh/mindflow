import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanName, sharedWords } from '../src/renderer/src/lib/group-name.ts'

test('the words every title shares', () => {
  assert.equal(sharedWords(['NumPy Deep Dive', 'Pandas deep dive']), 'Deep Dive')
  assert.equal(sharedWords(['Paris in spring', 'Paris at night']), 'Paris')
  assert.equal(sharedWords(['\u6771\u4eac\u30ac\u30a4\u30c9 2024', '\u6771\u4eac\u30ac\u30a4\u30c9 2025']), '\u6771\u4eac\u30ac\u30a4\u30c9')
})

test('nothing shared that says anything: no name', () => {
  assert.equal(sharedWords(['Row one', 'Row two']), null)
  assert.equal(sharedWords(['What I read', 'What I saw']), null)
  assert.equal(sharedWords(['2024 plan', '2024 list']), null)
  assert.equal(sharedWords(['Scikit Learn', 'PRIMER Ink']), null)
  assert.equal(sharedWords(['Only one title']), null)
  assert.equal(sharedWords(['Deep Dive', '']), null)
})

test('a word inside another word does not count', () => {
  assert.equal(sharedWords(['Rainbow notes', 'Rain plans']), null)
})

test('what the model says becomes a name only if it is one', () => {
  const titles = ['NumPy Basics', 'Pandas Basics']
  const taken = new Set(['reading'])
  assert.equal(cleanName('Data Tools', titles, taken), 'Data Tools')
  assert.equal(cleanName(' "Data Tools." ', titles, taken), 'Data Tools')
  assert.equal(cleanName('', titles, taken), null)
  assert.equal(cleanName(null, titles, taken), null)
  assert.equal(cleanName('123', titles, taken), null)
  assert.equal(cleanName('Reading', titles, taken), null)
  assert.equal(cleanName('numpy basics', titles, taken), null)
  assert.equal(cleanName('Here is a name for your new group', titles, taken), null)
  assert.equal(cleanName('Data\nTools', titles, taken), null)
  assert.equal(cleanName('A very very very long name that runs on', titles, taken), null)
})
