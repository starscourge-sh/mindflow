// Run with: node --test test/property-tags.test.ts
// A tag added in Properties is a tag of the note, and it is not written into the words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTag, keptWith, tagsBeside, tagsKept } from '../src/main/property-tags.ts'

test('a tag typed for Properties is one word, lower case', () => {
  assert.equal(cleanTag('  #App Idea '), 'app-idea')
  assert.equal(cleanTag('work'), 'work')
  assert.equal(cleanTag('2nd'), null)
  assert.equal(cleanTag('#'), null)
})

test('only the list Properties keeps counts, not an old tags line', () => {
  assert.deepEqual(tagsKept('{"_tags":["#Work","2nd","app idea","work"]}'), ['work', 'app-idea'])
  assert.deepEqual(tagsKept({ tags: 'work, idea' }), [])
  assert.deepEqual(tagsKept(null), [])
  assert.deepEqual(tagsKept('not json'), [])
})

test('adding a tag keeps the other properties and does not need the words', () => {
  const next = keptWith('{"rating":4}', 'Batch Tag')
  assert.equal(next.added, true)
  assert.deepEqual(JSON.parse(next.fields ?? ''), { rating: 4, _tags: ['batch-tag'] })
  assert.equal(keptWith(next.fields, 'batch-tag').added, false)
  assert.equal(keptWith('{"rating":4}', '2nd').added, false)
  assert.equal(keptWith('not json', 'work').added, false)
  assert.equal(keptWith('not json', 'work').fields, 'not json')
})

test('a note\'s tags are the ones in its words, then the ones Properties added', () => {
  const fields = '{"_tags":["seed","kept","2nd"]}'
  // "seed" is already in the words, so it is not listed twice. "2nd" is not a tag.
  assert.deepEqual(tagsBeside(['seed'], fields), ['seed', 'kept'])
  assert.deepEqual(tagsBeside([], fields), ['seed', 'kept'])
  assert.deepEqual(tagsBeside(['seed'], null), ['seed'])
})
