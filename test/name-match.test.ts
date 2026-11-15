import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NameBook, linkableLines, nameFrom, tooCommon, type Name } from '../src/main/name-match.ts'
import { RootIndex, linksIn } from '../src/main/roots.ts'

// 11 Nov: on the user's book 105 "names another note" offers in 60 notes, about 5 in 6 of them false: "Protocol"
// in "each piece of hardware has its own protocol", "today", "Prose", a note's own name, names inside code and
// links, notes already linked under another id. Each class below failed on the bare regex the lists used.
const everyday = (word: string): boolean => ['protocol', 'glossary', 'queue', 'reading', 'empire', 'today', 'prose', 'scroll', 'elder', 'note', 'work', 'language', 'server', 'emperor', 'substrate', 'tier', 'cliff', 'exam'].includes(word)
const titles = ['Protocol', 'Byzantine Empire', 'Reading queue', 'today', 'Untitled', '2026-11-08', '8 Nov 2026', 'Recording, 8 Nov at 15:28', 'abc', 'JavaScript', 'The Scroll', 'The Picture of Dorian Gray', 'Exam Cliff Notes', 'Substrate', 'Board 2']
const names = titles.map((title, i) => nameFrom(`n${i}`, title)).filter((one): one is Name => !!one)
const book = new NameBook(names, everyday)
const found = (text: string, own = ''): string[] => book.find(text.split('\n'), new Set(), true, own).map((hit) => `${hit.title}=${hit.words}`)

test('names that can name nothing: Untitled, dates, numbers, under four letters', () => {
  assert.deepEqual(names.map((one) => one.title).filter((title) => ['Untitled', '2026-11-08', '8 Nov 2026', 'abc'].includes(title)), [])
  assert.ok(names.some((one) => one.title === 'Board 2'), 'a word and a number is a name, not a date')
})

test('an everyday one-word title in a sentence is not a mention', () => {
  assert.deepEqual(found('Each piece of hardware has its own protocol, different commands.'), [])
  assert.deepEqual(found('the protocol was followed'), [])
  assert.deepEqual(found('What we know today as the USA'), [])
})

test('an everyday word with a capital only because of where it stands is not a mention', () => {
  assert.deepEqual(found('Protocol was followed to the letter.'), [])
  assert.deepEqual(found('It failed. Protocol was ignored.'), [])
  assert.deepEqual(found('- Protocol first'), [])
  assert.deepEqual(found('Tier 1 — Substrate'), [])
  assert.deepEqual(found('NETWORK PROTOCOL BASICS FOR EVERYONE'), [])
  assert.deepEqual(found('Network Protocol Basics Explained'), [])
})

test('an everyday word inside a longer name is not that note', () => {
  assert.deepEqual(found('the Language Server Protocol is a JSON-RPC protocol'), [])
  assert.deepEqual(found('In 1996 The Elder Scrolls II shipped'), [])
})

test('an everyday word written as a name, mid-sentence, is a mention', () => {
  assert.deepEqual(found('as I wrote in Protocol, the steps matter'), ['Protocol=Protocol'])
  assert.deepEqual(found('see my Reading Queue for more'), ['Reading queue=Reading Queue'])
  assert.deepEqual(found('my reading queue is long'), [])
})

test('a name that is no everyday word is a mention however it is written, plural too', () => {
  assert.deepEqual(found('the Byzantine Empire fell'), ['Byzantine Empire=Byzantine Empire'])
  assert.deepEqual(found('Executes Python, JavaScript, TypeScript'), ['JavaScript=JavaScript'])
  assert.deepEqual(found('pinned to board 2 today'), ['Board 2=board 2'])
})

test('three everyday words of substance read as a phrase of their own', () => {
  assert.deepEqual(found('my exam cliff notes are long'), ['Exam Cliff Notes=exam cliff notes'])
})

test('whole words only, inside one line, the whole name', () => {
  assert.deepEqual(found('a JavaScripty thing and prejavascript'), [])
  assert.deepEqual(found('the Byzantine\nEmpire fell'), [])
  assert.deepEqual(found('the Byzantine and Roman Empire'), [])
  assert.deepEqual(found('Reading Picture of Dorian Gray again'), ['The Picture of Dorian Gray=Picture of Dorian Gray'])
})

test('never inside a web address, a mail address or a file name', () => {
  assert.deepEqual(found('see https://example.com/javascript/intro and javascript.lua and mcr.io/devcontainers/javascript-node:20'), [])
})

test('the note itself, its twin of the same name, and a name said twice', () => {
  assert.deepEqual(found('JavaScript\nis a language', 'JavaScript'), [])
  const twins = new NameBook([nameFrom('a', 'JavaScript')!, nameFrom('b', '**JavaScript**')!], everyday)
  assert.equal(twins.find(['I like JavaScript']).length, 1)
})

test('code, links and note links hold no names; what is left keeps its lines', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'the ' }, { type: 'text', text: 'Byzantine Empire', marks: [{ type: 'code' }] }, { type: 'text', text: ' fell' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'read ' }, { type: 'text', text: 'Byzantine Empire', marks: [{ type: 'link' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'the Byzantine ' }, { type: 'noteLink', attrs: { id: 'x', label: 'Rome' } }, { type: 'text', text: ' Empire' }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const x = "Byzantine Empire"' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the Byzantine Empire fell' }] }] }] }
  ] }
  const lines = linkableLines(doc)
  const hits = book.find(lines)
  assert.deepEqual(hits.map((hit) => [hit.title, hit.line, hit.words]), [['Byzantine Empire', 3, 'Byzantine Empire']])
  assert.deepEqual(book.find(linkableLines('see `Byzantine Empire` and [[@x|Byzantine Empire]] and [Byzantine Empire](https://x.y)\n```\nByzantine Empire\n```')), [])
})

test('a name many notes hold names nothing', () => {
  assert.equal(tooCommon(4, 40), true)
  assert.equal(tooCommon(3, 40), false)
  assert.equal(tooCommon(80, 1600), false)
  assert.equal(tooCommon(81, 1600), true)
})

test('the offer under a note keeps the same rules (roots.ts linksIn)', () => {
  const filler = Array.from({ length: 30 }, (_, i) => ({ key: `f${i}`, title: `Walk ${i}`, text: `rain on the hills ${i}` }))
  const index = new RootIndex([{ key: 'p', title: 'Protocol', text: 'steps' }, { key: 'b', title: 'Byzantine Empire', text: 'history' }, { key: 'b2', title: 'Byzantine Empire', text: 'its twin' }, { key: 'me', title: 'Rome', text: '' }, ...filler])
  const offers = (text: string): string[] => linksIn(index, text, undefined, 'me', new Set(), everyday).map((one) => `${one.key}=${one.words}`)
  assert.deepEqual(offers('the protocol was followed and the Byzantine Empire fell'), ['b=Byzantine Empire'])
  assert.deepEqual(offers('as I wrote in Protocol, steps matter'), ['p=Protocol'])
  assert.deepEqual(offers('see https://example.com/byzantine/empire'), [])
})

test('reading a 900,000 character note stays quick', () => {
  const line = 'The old world: there was one thing called Amazon SageMaker, notebooks, training, deployment, the protocol and more. '
  const lines = Array.from({ length: 8000 }, () => line)
  const many = new NameBook([...names, ...Array.from({ length: 1600 }, (_, i) => nameFrom(`m${i}`, `Topic ${i} of the book`)!)], everyday)
  // The CPU time this test itself used, not the wall clock: on a machine busy with other work the clock counted the
  // waits for a core too, and the line failed at 1.5 to 4.5 s while the reading itself had not changed (16 Nov 2026).
  const started = process.cpuUsage()
  many.find(lines)
  const used = process.cpuUsage(started)
  const took = (used.user + used.system) / 1000
  assert.ok(lines.join('').length > 900_000)
  assert.ok(took < 1500, `took ${Math.round(took)}ms`)
})
