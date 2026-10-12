// Run with: node --test test/day-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isList, readLines, sortOut, tasksOf, worthSorting } from '../src/main/day-lines.ts'

test('reads list marks, ticks and indents', () => {
  const lines = readLines('- [ ] Call the bank\n  - [x] Find the form\n* Water plants\n\n1. Book the dentist\n[x] Pay rent')
  assert.deepEqual(lines, [
    { text: 'Call the bank', depth: 0, done: false },
    { text: 'Find the form', depth: 1, done: true },
    { text: 'Water plants', depth: 0, done: false },
    { text: 'Book the dentist', depth: 0, done: false },
    { text: 'Pay rent', depth: 0, done: true }
  ])
  assert.equal(isList('one thing'), false)
  assert.equal(isList('one\ntwo'), true)
})

test('a list copied from halfway in starts at the top', () => {
  assert.deepEqual(readLines('    - a\n      - b').map((one) => one.depth), [0, 1])
})

test('indented lines become steps of the line above', () => {
  const tasks = tasksOf(readLines('Move flat\n  Pack books\n  [x] Book van\nCall Sam'))
  assert.equal(tasks.length, 2)
  assert.deepEqual(tasks[0].steps, [{ text: 'Pack books', done: false }, { text: 'Book van', done: true }])
})

test('a leading [word] is only a suggested tag', () => {
  const [one] = sortOut('Now:\n- [ ] [Harbour Co] Catch up')
  assert.equal(one.text, '[Harbour Co] Catch up')
  assert.equal(one.suggest, 'harbour-co')
  assert.equal(sortOut('Now:\n- [x] Done thing')[0].suggest, null)
})

test('sorts a mixed running page', () => {
  const page = [
    'Now:',
    '- [ ] [atlas] Send the draft',
    '- [x] Reply to Jo',
    'Fix the export:',
    '  - [x] Test on Windows',
    '  - [ ] Ship it',
    'Next:',
    '- Plan the offsite',
    'Bits:',
    '"Slow is smooth, smooth is fast."',
    'Words:',
    'petrichor',
    'https://example.com/long-read',
    'Ideas:',
    'A map of every bench in town'
  ].join('\n')
  const sorted = sortOut(page)
  const by = (text: string) => sorted.find((one) => one.text === text)!
  assert.equal(by('[atlas] Send the draft').kind, 'task')
  assert.equal(by('Reply to Jo').done, true)
  assert.equal(by('Fix the export').kind, 'task')
  assert.equal(by('Fix the export').steps.length, 2)
  assert.equal(by('Plan the offsite').kind, 'task')
  assert.equal(by('"Slow is smooth, smooth is fast."').kind, 'saying')
  assert.equal(by('petrichor').kind, 'word')
  assert.equal(by('https://example.com/long-read').kind, 'link')
  assert.equal(by('A map of every bench in town').kind, 'note')
  assert.equal(by('A map of every bench in town').tag, 'ideas')
  assert.equal(sorted.some((one) => one.text === 'Now' || one.text === 'Bits'), false)
  assert.equal(worthSorting(page), true)
  assert.equal(worthSorting('milk\neggs\nbread'), false)
})
