// Run with: node --test test/welcome-stories.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORIES, gemOf, pickStory, story, taskPhrase } from '../src/renderer/src/lib/welcome-stories.ts'
import { readTask } from '../src/main/task-words.ts'

// A Monday morning, so "Wednesday" lands on a known day.
const at = new Date(2026, 9, 5, 10, 0)

test('each of the five stories is picked over many runs, about as often as the others', () => {
  const seen = new Map<string, number>()
  for (let n = 0; n < 2000; n++) {
    const id = pickStory().id
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }
  assert.deepEqual([...seen.keys()].sort(), STORIES.map((one) => one.id).sort())
  for (const count of seen.values()) assert.ok(count > 250, `picked ${count} times in 2000`)
})

test('a story stays the same until the next pick, and the edges of random land in range', () => {
  const picked = pickStory(() => 0.999999)
  for (let n = 0; n < 10; n++) assert.equal(story(), picked)
  assert.equal(picked.id, 'odyssey')
  assert.equal(pickStory(() => 0).id, 'sherlock')
})

test('the gem is the page\'s last sentence, and no story has an em or en dash', () => {
  for (const one of STORIES) {
    assert.ok(one.words.includes(gemOf(one)))
    assert.doesNotMatch(JSON.stringify(one), /[–—]/)
  }
})

test('each story keeps two gems: a plain one from the sentences before the last, and the last with its question', () => {
  for (const one of STORIES) {
    const at = one.words.indexOf(one.kept)
    assert.ok(at >= 0 && at < one.words.length - 1, `${one.id}: the plain gem is one of the page's earlier sentences`)
    assert.notEqual(one.kept, gemOf(one), one.id)
    assert.ok(one.question.trim().endsWith('?'), `${one.id}: the gem with a question has one`)
  }
})

test('the task written into the page is read back as its name, due on its day, its name kept as words (welcome-flow.tsx flowTask)', () => {
  for (const one of STORIES) {
    const read = readTask(taskPhrase(one, 'Wednesday'), at, [{ from: 0, to: one.task.length }])
    assert.equal(read.title.toLowerCase(), one.task.toLowerCase(), one.id)
    assert.equal(new Date(read.due!).toDateString(), new Date(2026, 9, 7).toDateString(), one.id)
  }
})
