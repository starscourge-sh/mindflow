// Run with: node --test test/article-names.test.ts
// An article kept by the reader is named as people name it: the title without the site's name it trails, and the
// site by its own name, not its publisher's legal one. The pages are the real ones (14 Nov 2026): Wikipedia states no
// og:site_name and its JSON-LD publisher is "Wikimedia Foundation, Inc.".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { articleNames } from '../src/main/article-names.ts'

test('a Wikipedia article: "Roman Empire", from Wikipedia', () => {
  assert.deepEqual(articleNames({ title: 'Roman Empire - Wikipedia', siteName: '', publisher: 'Wikimedia Foundation, Inc.', hostname: 'en.wikipedia.org' }), { title: 'Roman Empire', site: 'Wikipedia' })
})

test("a page stating its site's name keeps it, its title cut where the name trails", () => {
  assert.deepEqual(articleNames({ title: 'The Garden Essay | Probe Times', siteName: 'Probe Times', publisher: 'Probe Times', hostname: '93.184.216.34' }), { title: 'The Garden Essay', site: 'Probe Times' })
  assert.deepEqual(articleNames({ title: 'Frankenstein', siteName: 'TV Tropes', publisher: 'TV Tropes', hostname: 'tvtropes.org' }), { title: 'Frankenstein', site: 'TV Tropes' })
  // Its <title> where it has no og:title: the site's name, spelt as the address spells it, still comes off.
  assert.deepEqual(articleNames({ title: 'Frankenstein (Literature) - TV Tropes', siteName: '', publisher: '', hostname: 'tvtropes.org' }), { title: 'Frankenstein (Literature)', site: 'TV Tropes' })
  // Joined on with no room either side, as before.
  assert.deepEqual(articleNames({ title: 'Essay|Probe Times', siteName: 'Probe Times', publisher: '', hostname: 'probe.example' }), { title: 'Essay', site: 'Probe Times' })
})

test("a title's own last part stays whole: only the site's name comes off", () => {
  assert.deepEqual(articleNames({ title: 'Chapter 1: The Beginning', siteName: '', publisher: '', hostname: 'stories.example.org' }), { title: 'Chapter 1: The Beginning', site: 'stories.example.org' })
  assert.deepEqual(articleNames({ title: 'Mary Shelley - A Life', siteName: 'The Book Review', publisher: '', hostname: 'bookreview.example' }), { title: 'Mary Shelley - A Life', site: 'The Book Review' })
})

test('with nothing stated, the address names it, and a title that was all site name keeps the address', () => {
  assert.deepEqual(articleNames({ title: 'A plain page', siteName: '', publisher: '', hostname: 'www.plain.example' }), { title: 'A plain page', site: 'plain.example' })
  assert.deepEqual(articleNames({ title: 'Probe Times', siteName: 'Probe Times', publisher: '', hostname: 'probetimes.example' }), { title: 'Probe Times', site: 'Probe Times' })
})
