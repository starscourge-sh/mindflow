// Run with: node --test test/free-sites.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freeSiteOf, prefixed } from '../src/renderer/src/lib/free-sites.ts'

// ⌘K: a site's prefix and a space before the words searches that site alone; anything else is words like any other.
test('a free site’s prefix and a space before the words search that site alone', () => {
  assert.deepEqual(prefixed('w roman empire') && { site: prefixed('w roman empire')!.site.id, words: prefixed('w roman empire')!.words }, { site: 'wikipedia', words: 'roman empire' })
  assert.equal(prefixed('W  Byzantium ')?.site.id, 'wikipedia')
  assert.equal(prefixed('wikt serendipity')?.site.id, 'wiktionary')
  assert.equal(prefixed('pg frankenstein')?.site.id, 'gutenberg')
  assert.equal(prefixed('sep kant')?.site.id, 'sep')
  // A word that starts the same, a prefix alone, or no words after it: not a site.
  assert.equal(prefixed('war and peace'), null)
  assert.equal(prefixed('w'), null)
  assert.equal(prefixed('w '), null)
  assert.equal(prefixed('wikipedia roman'), null)
})

// The reader: a link to another of a site's own pages is followed in place; its files, help and talk pages are not pages to read.
test('a site’s own pages are told from its files, help, talk and special pages, and from other sites', () => {
  assert.equal(freeSiteOf('https://en.wikipedia.org/wiki/Roman_Empire')?.id, 'wikipedia')
  assert.equal(freeSiteOf('https://en.wikipedia.org/wiki/Star_Wars:_Episode_IV_%E2%80%93_A_New_Hope')?.id, 'wikipedia')
  for (const not of ['https://en.wikipedia.org/wiki/File:Colosseum.jpg', 'https://en.wikipedia.org/wiki/Help:Contents', 'https://en.wikipedia.org/wiki/Talk:Roman_Empire', 'https://en.wikipedia.org/wiki/Special:Random', 'https://en.wikipedia.org/w/index.php?title=Roman_Empire&action=edit', 'https://fr.wikipedia.org/wiki/Empire_romain', 'https://example.org/wiki/Roman_Empire'])
    assert.equal(freeSiteOf(not), null, not)
  assert.equal(freeSiteOf('https://en.wiktionary.org/wiki/serendipity')?.id, 'wiktionary')
  assert.equal(freeSiteOf('https://www.gutenberg.org/cache/epub/84/pg84-images.html')?.id, 'gutenberg')
  assert.equal(freeSiteOf('https://plato.stanford.edu/entries/kant/')?.id, 'sep')
  assert.equal(freeSiteOf('https://plato.stanford.edu/search/searcher.py?query=kant'), null)
  assert.equal(freeSiteOf(null), null)
})
