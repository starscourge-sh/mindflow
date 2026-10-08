// Run with: node --test test/kind-of.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kindOf } from '../src/main/import.ts'

test('something to do reads as a todo', () => {
  for (const line of ['build fc chatbot', 'make a budget', 'learn how to trade', 'deploy the site friday', 'buy oat milk'])
    assert.equal(kindOf(line), 'todo', line)
})

test('a question, a label or a quote is not a todo', () => {
  assert.notEqual(kindOf('build what, exactly?'), 'todo')
  assert.notEqual(kindOf('Book: Thinking, Fast and Slow'), 'todo')
  assert.equal(kindOf('"The obstacle is the way"'), 'quote')
})
