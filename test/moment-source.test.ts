// Run with: node --test test/moment-source.test.ts
// What each kind of celebration plays, from what was chosen in Settings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceOf } from '../src/main/moment-source.ts'

test('a kind never chosen plays Giphy; a task done only ticks', () => {
  assert.equal(sourceOf('inbox', {}), 'giphy')
  assert.equal(sourceOf('taskDone', {}), 'drawing')
})

test('never chosen, your files come first, then a pinned GIF', () => {
  assert.equal(sourceOf('inbox', { celebrationPicks: { inbox: ['/a.gif'] }, giphyPins: { inbox: { id: 'x' } } }), 'file')
  assert.equal(sourceOf('inbox', { celebrationPicks: { inbox: [] }, giphyPins: { inbox: { id: 'x' } } }), 'giphy')
  assert.equal(sourceOf('taskDone', { celebrationPicks: { taskDone: ['/a.gif'] } }), 'file')
})

test('a choice made wins, keeping what the others had', () => {
  assert.equal(sourceOf('inbox', { celebrationSources: { inbox: 'drawing' }, celebrationPicks: { inbox: ['/a.gif'] } }), 'drawing')
  assert.equal(sourceOf('taskDone', { celebrationSources: { taskDone: 'giphy' } }), 'giphy')
})
