// Run with: node --test test/tag-words.test.ts
// A tag is a tag in any language, and an emoji can be one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTagWord, nameWithoutTags, tagWritten, tagsIn, withoutTags } from '../src/main/tag-words.ts'

test('tags in any letters, and emoji', () => {
  assert.deepEqual(tagsIn('Notes #français #日本語38 #عربي39 #📚34 #Work'), ['français', '日本語38', 'عربي39', '📚34', 'work'])
  assert.deepEqual(tagsIn('#👩🏽‍🎓 thesis'), ['👩🏽‍🎓'])
  // A number, a heading and a hash inside a word are not tags.
  assert.deepEqual(tagsIn('# Heading, item #1, C#sharp, a#b'), [])
  assert.ok(isTagWord('naïve-café_2'))
  assert.ok(!isTagWord('2nd'))
  assert.ok(!isTagWord('two words'))
})

test('the files that spell the pattern out for themselves say the same', async () => {
  const { TAG, TAG_PART } = await import('../src/main/tag-words.ts')
  assert.equal((await import('../src/main/task-words.ts')).TAG_HERE, TAG)
  assert.equal((await import('../src/main/import.ts')).TAG_HERE, TAG)
  assert.equal((await import('../src/main/kinds.ts')).TAG_PART_HERE, TAG_PART)
  assert.ok((await import('../src/main/kinds.ts')).tagged('{"text":"so #français"}', 'français'))
})

test('a tag is found, renamed and taken out whole', () => {
  assert.equal('see #français and #françaises'.replace(tagWritten('français'), '$1#fr'), 'see #fr and #françaises')
  assert.equal(withoutTags('Read #📚 the essay #français').trim(), 'Read the essay')
})

test('a name as the @ list, a link chip and every list show it: its words without #tags', () => {
  assert.equal(nameWithoutTags('#idea Create a dashboard for the garden #work'), 'Create a dashboard for the garden')
  assert.equal(nameWithoutTags('Book Star Wars tickets #todo'), 'Book Star Wars tickets')
  // Only tags: nothing, so the caller falls back to the tags themselves.
  assert.equal(nameWithoutTags('#bit #joke'), '')
})
