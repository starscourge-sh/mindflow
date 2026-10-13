// Run with: node --test test/place-order.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inOrder, isUsual, moved, stepped } from '../src/renderer/src/lib/place-order.ts'

const usual = ['home', 'inbox', 'all', 'review', 'day']
const same = (one: string): string => one

test('nothing saved keeps the usual order', () => {
  assert.deepEqual(inOrder(usual, [], same), usual)
  assert.deepEqual(inOrder(usual, undefined, same), usual)
})

test('a saved order is followed, and a place new since sits after the one it follows', () => {
  assert.deepEqual(inOrder(usual, ['review', 'home', 'inbox', 'day'], same), ['review', 'home', 'inbox', 'all', 'day'])
  assert.deepEqual(inOrder(['new', ...usual], ['day', 'home'], same), ['new', 'day', 'home', 'inbox', 'all', 'review'])
})

test('ids no longer there, or saved twice, are dropped', () => {
  assert.deepEqual(inOrder(usual, ['gone', 'day', 'day', 'home', 'inbox', 'all', 'review'], same), ['day', 'home', 'inbox', 'all', 'review'])
})

test('moving lands before the target going up, after it going down', () => {
  assert.deepEqual(moved(usual, 'day', 'inbox', false), ['home', 'day', 'inbox', 'all', 'review'])
  assert.deepEqual(moved(usual, 'inbox', 'review', true), ['home', 'all', 'review', 'inbox', 'day'])
  assert.deepEqual(moved(usual, 'inbox', 'inbox', true), usual)
})

test('a step swaps with the neighbour among the ones shown with it, never past the end', () => {
  assert.deepEqual(stepped(usual, 'review', -1, ['inbox', 'review']), ['home', 'review', 'inbox', 'all', 'day'])
  assert.deepEqual(stepped(usual, 'inbox', 1, ['inbox', 'review']), ['home', 'all', 'review', 'inbox', 'day'])
  assert.equal(stepped(usual, 'inbox', -1, ['inbox', 'review']), null)
  assert.equal(stepped(usual, 'review', 1, ['inbox', 'review']), null)
})

test('the usual order is known as such', () => {
  assert.equal(isUsual(usual, usual), true)
  assert.equal(isUsual(moved(usual, 'day', 'home', false), usual), false)
})
