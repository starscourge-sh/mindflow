import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chapterRange, chapterText, pageWords, cutWords, hintedTimes, meaningGrade } from '../src/main/study-ai.ts'

test('a hint brings each grade back sooner, Again as it is, the four kept four and in order', () => {
  const now = Date.parse('2026-11-06T10:00:00Z')
  const iso = (ms: number): string => new Date(now + ms).toISOString()
  const fresh = { 1: iso(60e3), 2: iso(6 * 60e3), 3: iso(10 * 60e3), 4: iso(2 * 864e5) }
  const seen24 = { 1: iso(864e5), 2: iso(1.6 * 864e5), 3: iso(2.6 * 864e5), 4: iso(4 * 864e5) }
  const seen = { 1: iso(864e5), 2: iso(1.7 * 864e5), 3: iso(3.2 * 864e5), 4: iso(5 * 864e5) }
  for (const times of [fresh, seen, seen24]) for (const hints of [1, 2]) {
    const out = hintedTimes(times, now, hints)
    assert.equal(out[1], times[1])
    const ms = [1, 2, 3, 4].map((g) => Date.parse(out[g]))
    assert.ok(ms[0] < ms[1] && ms[1] < ms[2] && ms[2] < ms[3], `${hints}: ${Object.values(out)}`)
    assert.ok(Date.parse(out[4]) <= Date.parse(times[4]))
    if (times !== seen24) assert.ok(Date.parse(out[4]) < Date.parse(times[4]), "spaced enough, Easy comes back sooner")
  }
})

test('a verdict by meaning suggests a grade', () => {
  assert.deepEqual((['same', 'close', 'partly', 'off'] as const).map(meaningGrade), [3, 3, 2, 1])
  assert.equal(cutWords('a feeling of unease that will not go away however long you wait', 30), 'a feeling of unease that will…')
})

const outline = [
  { title: 'One', depth: 0, page: 1 },
  { title: 'Two', depth: 0, page: 20 },
  { title: 'Two, part a', depth: 1, page: 24 },
  { title: 'Three', depth: 0, page: 100 }
]

test('cards come from the section being read, its own sections as headings; no outline, the pages on screen', () => {
  assert.deepEqual(chapterRange(outline, 30, 120, [30, 31]), { from: 24, to: 99, title: 'Two, part a', headings: [] })
  assert.deepEqual(chapterRange(outline, 22, 120, [22, 23]), { from: 20, to: 99, title: 'Two', headings: [outline[2]] })
  assert.deepEqual(chapterRange(outline, 110, 120, [110, 111]).to, 120)
  assert.deepEqual(chapterRange([], 7, 120, [7, 8]), { from: 7, to: 8, title: null, headings: [] })
})

// 17 Nov: reading "Planning AI Applications" (page 52 of 535), the cards came from "Table of Contents", pages v to x.
test('a book whose outline puts its contents page and its parts on top reads the section you are in', () => {
  const book = [
    { title: 'Table of Contents', depth: 0, page: 5 },
    { title: 'Part I: Foundations', depth: 0, page: 11 },
    { title: 'Workflow Automation', depth: 1, page: 47 },
    { title: 'Planning AI Applications', depth: 1, page: 52 },
    { title: 'Use Case Evaluation', depth: 2, page: 53 },
    { title: 'Setting Expectations', depth: 2, page: 56 },
    { title: 'The AI Engineering Stack', depth: 1, page: 59 },
    { title: 'Part II', depth: 0, page: 200 }
  ]
  assert.deepEqual(chapterRange(book, 52, 535, [52, 53]), { from: 52, to: 58, title: 'Planning AI Applications', headings: [book[4], book[5]] })
  assert.equal(chapterRange(book, 54, 535, [54, 55]).title, 'Use Case Evaluation')
  // A section of one page is read with the one it is in.
  assert.equal(chapterRange([...book, { title: 'A one-page aside', depth: 2, page: 58 }], 58, 535, [58, 59]).title, 'Planning AI Applications')
})

test('an 80-page chapter is read across, highlights and headings first, within the budget', () => {
  const pages = Array.from({ length: 80 }, (_, n) => ({ page: 20 + n, text: `Page ${20 + n} opens with a sentence about the subject. `.repeat(20) }))
  const text = chapterText({ pages, highlights: [{ page: 61, text: 'The thing I underlined' }], headings: [{ page: 24, title: 'Two, part a' }] }, 9000)
  assert.ok(text.length <= 9000, String(text.length))
  const lines = text.split('\n')
  assert.equal(lines[0], '[p. 61] Highlighted: The thing I underlined')
  assert.equal(lines[1], '[p. 24] Heading: Two, part a')
  assert.ok(text.includes('[p. 99]') || text.includes('[p. 98]') || text.includes('[p. 97]'), 'the last pages are read too')
})

// The native program itself, on a fixture, in the stand-in a probe uses on a Mac without Apple Intelligence.
test('native: judge, hint and cards answer in their shapes, and a hint never gives the answer', { skip: process.platform !== 'darwin' }, () => {
  const ask = [
    { id: 1, op: 'judge', question: 'A word for a feeling of unease', answer: 'disquiet', said: 'disquiet' },
    { id: 2, op: 'judge', question: 'A word for a feeling of unease', answer: 'disquiet', said: 'no idea' },
    { id: 3, op: 'hint', question: 'A word for a feeling of unease', answer: 'disquiet', level: 1 },
    { id: 4, op: 'hint', question: 'A word for a feeling of unease', answer: 'disquiet', level: 2 },
    { id: 5, op: 'cards', title: 'Cells', text: '[p. 3] The mitochondrion is where the cell makes most of its energy.\n[p. 4] Ribosomes build proteins from the instructions in messenger RNA.', count: 5 }
  ]
  const run = spawnSync('resources/understand', [], { input: ask.map((one) => JSON.stringify(one)).join('\n') + '\n', env: { ...process.env, HALIGTREE_QA_CAPS: 'ai' }, encoding: 'utf8' })
  const got = Object.fromEntries(run.stdout.trim().split('\n').map((line) => JSON.parse(line)).map((one) => [one.id, one]))
  assert.equal(got[1].verdict, 'same')
  assert.equal(got[2].verdict, 'off')
  for (const id of [3, 4]) assert.ok(!/disquiet/i.test(got[id].text), got[id].text)
  assert.notEqual(got[3].text, got[4].text)
  assert.deepEqual(got[5].cards.map((one: { page: number }) => one.page), [3, 4])
  // Without the stand-in on this Mac (Apple Intelligence off), it says so plainly, never an empty answer.
  const off = spawnSync('resources/understand', [], { input: JSON.stringify(ask[2]) + '\n', env: { ...process.env, HALIGTREE_QA_CAPS: '' }, encoding: 'utf8' })
  const said = JSON.parse(off.stdout.trim())
  assert.ok(said.error || said.text, off.stdout)
})

test('a page’s heading ends with a full stop, never run into its first sentence', () => {
  assert.equal(pageWords('Page 7\nThe idea on page 7 is that cells turn food into\nusable energy, which the cell keeps as ATP for later.\n'), 'Page 7. The idea on page 7 is that cells turn food into usable energy, which the cell keeps as ATP for later.')
})

// Apple Intelligence's real answer on Fluent Python's "Private and “Protected” Attributes" (20 Nov): read one line at a
// time, all five were dropped and the reader said it "wrote no card" on two dense pages.
