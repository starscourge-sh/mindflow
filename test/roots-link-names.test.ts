import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RootIndex, linksIn } from '../src/main/roots.ts'

// 11 Nov: the note "Board 1" (item 1, item 2, Board 2, item 3, item 4) was offered a link to "Board 1 1":
// a name's numbers were dropped before matching, so "Board 1 1" read as "board" and any "Board" named it.
const filler = Array.from({ length: 30 }, (_, i) => ({ key: `n${i}`, title: `Walk ${i}`, text: `rain on the hills ${i}` }))
const board = 'Board 1\nitem 1\nitem 2\nBoard 2\nitem 3\nitem 4'

test('a name with numbers is matched with its numbers, never as its bare word', () => {
  const index = new RootIndex([{ key: 'b11', title: 'Board 1 1', text: 'a copy' }, ...filler])
  assert.deepEqual(linksIn(index, board, undefined, 'me'), [])
  assert.deepEqual(linksIn(index, 'Pinned to Board 1 1 today', undefined, 'me').map((one) => [one.key, one.title, one.words]), [['b11', 'Board 1 1', 'Board 1 1']])
})

test('a name never runs across two lines', () => {
  const index = new RootIndex([{ key: 'b11', title: 'Board 1 1', text: 'a copy' }, { key: 'ms', title: 'Marcus Aurelius', text: 'the emperor' }, ...filler])
  assert.deepEqual(linksIn(index, 'Board 1\n1 more', undefined, 'me'), [])
  assert.deepEqual(linksIn(index, 'I read Marcus\nAurelius later', undefined, 'me'), [])
  assert.deepEqual(linksIn(index, 'I read Marcus Aurelius later', undefined, 'me').map((one) => one.words), ['Marcus Aurelius'])
})

test('a note that is truly named is offered, quoted as its title and shown as written', () => {
  const index = new RootIndex([{ key: 'b2', title: 'Board 2', text: 'the second' }, { key: 'b11', title: 'Board 1 1', text: 'a copy' }, ...filler])
  assert.deepEqual(linksIn(index, board, undefined, 'b1').map((one) => [one.key, one.title, one.words]), [['b2', 'Board 2', 'Board 2']])
})

test('words between a name\'s words break it, and a leading "the" may be left out', () => {
  const index = new RootIndex([{ key: 'p', title: 'The Picture of Dorian Gray', text: 'Wilde' }, ...filler])
  assert.deepEqual(linksIn(index, 'Reading Picture of Dorian Gray again', undefined, 'me').map((one) => one.words), ['Picture of Dorian Gray'])
  assert.deepEqual(linksIn(index, 'A picture by Dorian Gray', undefined, 'me'), [])
})
