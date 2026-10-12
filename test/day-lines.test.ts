// Run with: node --test test/day-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docList, isList, readLines, sortOut, tasksOf, tasksSaid, worthSorting } from '../src/main/day-lines.ts'

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
  // A list whose steps are single words is still one list, not a mixed page.
  assert.equal(worthSorting('- water the plants\n- read chapter 4\n- essay:\n  - outline\n  - draft'), false)
})

test('a nested list is its top lines as tasks, the indented ones their steps, a heading line named without its colon', () => {
  const text = 'buy milk\nconfirm hotel booking\n  ring them\n  pay deposit\ncamping:\n  - pack\n  - [x] book train\n  - print map\nwater plants\nemail Jo\nfix bike'
  const tasks = tasksOf(readLines(text))
  assert.equal(tasks.length, 6)
  assert.equal(tasks[2].text, 'camping')
  assert.deepEqual(tasks[2].steps.map((one) => one.done), [false, true, false])
  assert.equal(tasksSaid(tasks), '6 tasks, 5 steps')
  assert.equal(tasksSaid(tasks.slice(1, 2)), 'a task with 2 steps')
  assert.equal(tasksSaid(tasks.slice(0, 1)), 'a task')
  // A colon with nothing under it is the line's own words.
  assert.equal(tasksOf(readLines('ask about:\nthen this'))[0].text, 'ask about:')
})

test('a note read as a list, as "Make it a task" and quick capture read it', () => {
  const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const doc = (...content: unknown[]) => ({ type: 'doc', content })
  const checks = { type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: true }, content: [para('book the ferry')] },
    { type: 'taskItem', attrs: { checked: false }, content: [para('pack the tent'), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para('pegs')] }] }] }
  ] }
  const list = docList(doc(checks), false)!
  assert.deepEqual(list.list, [
    { text: 'book the ferry', done: true, steps: [] },
    { text: 'pack the tent', done: false, steps: [{ text: 'pegs', done: true }] }
  ])
  assert.equal(list.mixed, false)
  // Plain paragraphs: a list only in a Todo; any other note is one task.
  assert.equal(docList(doc(para('Fix the gate'), para('It squeaks on cold mornings.')), false), null)
  assert.equal(docList(doc(para('sweep the porch'), para('oil the hinges')), true)?.list.length, 2)
  // One line is never a list.
  assert.equal(docList(doc(para('ring the plumber')), true), null)
  // Links and sayings among the lines: a page to sort, not a task a line.
  const mixed = docList(doc(...['wash the car', 'https://example.com/garden-ideas', '“Well begun is half done.” - an old saying', 'post the parcel', 'water the herbs'].map(para)), true)!
  assert.equal(mixed.mixed, true)
})
