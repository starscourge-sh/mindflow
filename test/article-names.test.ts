// Run with: node --test test/article-names.test.ts
// An article kept by the reader is named as people name it: the title without the site's name it trails, and the
// site by its own name, not its publisher's legal one. The pages are the real ones (14 Nov 2026): Wikipedia states no
// og:site_name and its JSON-LD publisher is "Wikimedia Foundation, Inc.". A page's names are asked in turn (its
// og:title, Readability's title, its first heading): a front page calling itself only "Home" is named by the next.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { articleNames } from '../src/main/article-names.ts'

test('a Wikipedia article: "Roman Empire", from Wikipedia', () => {
  assert.deepEqual(articleNames({ titles: ['Roman Empire - Wikipedia'], siteName: '', publisher: 'Wikimedia Foundation, Inc.', hostname: 'en.wikipedia.org' }), { title: 'Roman Empire', site: 'Wikipedia' })
})

test("a page stating its site's name keeps it, its title cut where the name trails", () => {
  assert.deepEqual(articleNames({ titles: ['The Garden Essay | Probe Times'], siteName: 'Probe Times', publisher: 'Probe Times', hostname: '93.184.216.34' }), { title: 'The Garden Essay', site: 'Probe Times' })
  assert.deepEqual(articleNames({ titles: ['Frankenstein'], siteName: 'TV Tropes', publisher: 'TV Tropes', hostname: 'tvtropes.org' }), { title: 'Frankenstein', site: 'TV Tropes' })
  // Its <title> where it has no og:title: the site's name, spelt as the address spells it, still comes off.
  assert.deepEqual(articleNames({ titles: ['', 'Frankenstein (Literature) - TV Tropes'], siteName: '', publisher: '', hostname: 'tvtropes.org' }), { title: 'Frankenstein (Literature)', site: 'TV Tropes' })
  // Joined on with no room either side, as before.
  assert.deepEqual(articleNames({ titles: ['Essay|Probe Times'], siteName: 'Probe Times', publisher: '', hostname: 'probe.example' }), { title: 'Essay', site: 'Probe Times' })
})

test("a title's own last part stays whole: only the site's name comes off", () => {
  assert.deepEqual(articleNames({ titles: ['Chapter 1: The Beginning'], siteName: '', publisher: '', hostname: 'stories.example.org' }), { title: 'Chapter 1: The Beginning', site: 'stories.example.org' })
  assert.deepEqual(articleNames({ titles: ['Mary Shelley - A Life'], siteName: 'The Book Review', publisher: '', hostname: 'bookreview.example' }), { title: 'Mary Shelley - A Life', site: 'The Book Review' })
})

test('with nothing stated, the address names it', () => {
  assert.deepEqual(articleNames({ titles: ['A plain page'], siteName: '', publisher: '', hostname: 'www.plain.example' }), { title: 'A plain page', site: 'plain.example' })
  assert.deepEqual(articleNames({ titles: [], siteName: '', publisher: '', hostname: 'www.plain.example' }), { title: 'plain.example', site: 'plain.example' })
})

test('a front page that calls itself only "Home" is named by its next name: Readability\'s title, then its first heading', () => {
  // og:title "Home", as many sites' front pages say; its <title> says what it is.
  assert.deepEqual(articleNames({ titles: ['Home', 'Notability: Notes and Handwriting', 'Write, think and learn'], siteName: 'Notability', publisher: '', hostname: 'notability.com' }), { title: 'Notability: Notes and Handwriting', site: 'Notability' })
  // Every title "Home", trailed by the site's name or not: the first heading names it.
  assert.deepEqual(articleNames({ titles: ['Home | Notability', 'Home', 'Write, think and learn'], siteName: '', publisher: '', hostname: 'notability.com' }), { title: 'Write, think and learn', site: 'Notability' })
  for (const word of ['Homepage', 'Home page', 'HOME', 'Index', 'Welcome', 'Welcome!', 'Untitled'])
    assert.deepEqual(articleNames({ titles: [word, 'The Garden Essay'], siteName: 'Probe Times', publisher: '', hostname: 'probetimes.example' }), { title: 'The Garden Essay', site: 'Probe Times' }, word)
})

test("a title that is only the site's own name is passed over too", () => {
  assert.deepEqual(articleNames({ titles: ['Probe Times', 'Probe Times', 'The Garden Essay'], siteName: 'Probe Times', publisher: '', hostname: 'probetimes.example' }), { title: 'The Garden Essay', site: 'Probe Times' })
  // Spelt as the address spells it ("notability" in notability.com), with no site name stated.
  assert.deepEqual(articleNames({ titles: ['notability', 'Notes for learning'], siteName: '', publisher: '', hostname: 'notability.com' }), { title: 'Notes for learning', site: 'notability.com' })
})

test('when every name is only "Home" or the site\'s, the address names the page', () => {
  assert.deepEqual(articleNames({ titles: ['Home', 'Probe Times', ''], siteName: 'Probe Times', publisher: '', hostname: 'www.probetimes.example' }), { title: 'probetimes.example', site: 'Probe Times' })
})

test('a title that only begins with "Home" or "Welcome" is a name, and stays whole', () => {
  assert.deepEqual(articleNames({ titles: ['Home Cooking for Beginners', 'Home'], siteName: 'Probe Times', publisher: '', hostname: 'probetimes.example' }), { title: 'Home Cooking for Beginners', site: 'Probe Times' })
  assert.deepEqual(articleNames({ titles: ['Welcome to the Monster', 'Home'], siteName: '', publisher: '', hostname: 'shelley.example' }), { title: 'Welcome to the Monster', site: 'shelley.example' })
})
