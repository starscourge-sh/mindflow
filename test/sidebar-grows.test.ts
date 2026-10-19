// Run with: node --test test/sidebar-grows.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writingFirst } from '../src/main/sidebar-grows.ts'

const all = ['home', 'inbox', 'all', 'review', 'day', 'today', 'week', 'calendar', 'upcoming', 'matrix', 'routines', 'nuggets', 'articles', 'goals']

test('unused task pages wait, used ones and everything else stay shown', () => {
  const moved = writingFirst({ shown: all, all, order: [], used: ['routines'] })
  assert.deepEqual(moved.sidebarShown, ['home', 'inbox', 'all', 'review', 'day', 'today', 'calendar', 'routines', 'nuggets', 'articles', 'goals'])
  assert.equal(moved.sidebarGrows, true)
  assert.deepEqual(moved.sidebarOrder, [])
})

test('a hidden page stays hidden and is met, so it never waits or comes back', () => {
  const moved = writingFirst({ shown: all.filter((id) => id !== 'goals' && id !== 'matrix'), all, order: [], used: ['matrix'] })
  assert.ok(!moved.sidebarShown.includes('goals') && !moved.sidebarShown.includes('matrix'))
  assert.ok(moved.sidebarMet.includes('goals') && moved.sidebarMet.includes('matrix'))
  assert.ok(!moved.sidebarMet.includes('week'))
})

test('a saved order keeps itself, with Writing moved to the head of Notes', () => {
  const moved = writingFirst({ shown: all, all, order: ['inbox', 'home', 'day', 'all', 'review', 'nuggets', 'articles'], used: [] })
  assert.deepEqual(moved.sidebarOrder, ['inbox', 'home', 'articles', 'day', 'all', 'review', 'nuggets'])
})
