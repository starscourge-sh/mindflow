import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RootIndex, linksIn } from '../src/main/roots.ts'

// 10 Nov: "Frankenstein book club" offered a link to the note "Frankenstein #book", named with its tag.
test('a name\'s tags are not matched or shown in a link offer', () => {
  const filler = Array.from({ length: 30 }, (_, i) => ({ key: `n${i}`, title: `Walk ${i}`, text: `rain on the hills ${i}` }))
  const index = new RootIndex([{ key: 'book', title: 'Frankenstein #book', text: 'Lines kept from the novel' }, ...filler])
  const offers = linksIn(index, 'Frankenstein book club: my three questions', undefined, 'me')
  assert.deepEqual(offers.map((one) => [one.key, one.title, one.words]), [['book', 'Frankenstein', 'Frankenstein']])
  assert.deepEqual(linksIn(index, 'A book club on Friday', undefined, 'me'), [])
})
