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

// 17 Nov: "youtube hooks:", a list of video hook ideas, was offered "#bug-report" because 3 of its 5 nearest notes carry
// it, alike only by everyday words; a note whose own rare words run through the tag's notes still gets it.
test('a tag is offered only when the note\'s own words support it', async () => {
  const { tagsNear } = await import('../src/main/roots.ts')
  // "app" and "video" are everyday in this book (in five notes and more): two filler notes hold them too.
  const filler = Array.from({ length: 40 }, (_, i) => ({ key: `f${i}`, title: `Walk ${i}`, text: i < 2 ? `an app video of the walk ${i}` : `rain on the hills ${i}` }))
  const bugs = [
    { key: 'b1', title: 'Export crashes', text: 'the app video export crashes when the timeline holds a stack trace overflow' },
    { key: 'b2', title: 'Sync loses edits', text: 'the app video sync loses edits after a stack trace overflow in the worker' },
    { key: 'b3', title: 'Login loop', text: 'the app video login loops on a stack trace overflow at the redirect' }
  ]
  const index = new RootIndex([...bugs, ...filler])
  const tags = (key: string): string[] => (key.startsWith('b') ? ['bug-report'] : [])
  const near = { of: 5, score: 0.05, carry: 3, share: 0.6 }
  // Alike only by everyday words of the book: nothing offered.
  assert.deepEqual(tagsNear(index, 'youtube hooks: app video app video', undefined, 'me', tags, new Set(), null, near), [])
  // Its own rare words (stack, trace, overflow) run through the tag's notes: offered.
  assert.deepEqual(tagsNear(index, 'the app video player hits a stack trace overflow on save', undefined, 'me', tags, new Set(), null, near).map((one) => one.tag), ['bug-report'])
})
