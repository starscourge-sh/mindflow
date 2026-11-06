import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chapterRange, chapterText, cutWords, hintedGrade, meaningGrade } from '../src/main/study-ai.ts'

test('a hint schedules a card a step lower, never below Hard, Again stays Again', () => {
  assert.equal(hintedGrade(3, 0), 3)
  assert.equal(hintedGrade(3, 1), 2)
  assert.equal(hintedGrade(4, 1), 3)
  assert.equal(hintedGrade(4, 2), 2)
  assert.equal(hintedGrade(2, 2), 2)
  assert.equal(hintedGrade(1, 2), 1)
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

test('the chapter comes from the outline’s top level, its sections as headings; no outline, the pages on screen', () => {
  assert.deepEqual(chapterRange(outline, 30, 120, [30, 31]), { from: 20, to: 99, title: 'Two', headings: [outline[2]] })
  assert.deepEqual(chapterRange(outline, 110, 120, [110, 111]).to, 120)
  assert.deepEqual(chapterRange([], 7, 120, [7, 8]), { from: 7, to: 8, title: null, headings: [] })
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
