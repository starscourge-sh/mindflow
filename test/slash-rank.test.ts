// Run with: node --test test/slash-rank.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findItems } from '../src/renderer/src/lib/slash-rank.ts'

// A few of the `/` menu's own items, in the menu's order.
const items = [
  { title: 'Heading 1', group: 'Basic blocks', hint: '#', keywords: ['h1', 'heading one', 'title'] },
  { title: 'Heading 2', group: 'Basic blocks', hint: '##', keywords: ['h2', 'heading two', 'title'] },
  { title: 'Bulleted list', group: 'Basic blocks', hint: '-', keywords: ['bullets', 'ul', 'list'] },
  { title: 'To-do list', group: 'Basic blocks', hint: '[]', keywords: ['todo', 'task', 'check', 'checkbox'] },
  { title: 'Math', group: 'Basic blocks', keywords: ['equation', 'latex'] },
  { title: 'Divider', group: 'Basic blocks', hint: '---', keywords: ['hr', 'rule', 'line'] },
  { title: 'Three columns', group: 'Basic blocks', hint: 'side by side', keywords: ['columns', 'layout'] },
  { title: 'Table of contents', group: 'Basic blocks', hint: '[TOC]', keywords: ['toc', 'contents'] },
  { title: 'Table', group: 'Media', keywords: ['grid'] },
  { title: 'Insert row above', group: 'Table' },
  { title: 'Insert row below', group: 'Table' }
]
const find = (query: string): string[] => findItems(items, query).map((item) => item.title)

test('the exact title comes first, ahead of one it starts', () => {
  assert.equal(find('table')[0], 'Table')
  assert.equal(find('table')[1], 'Table of contents')
})

test('spaces are part of the search', () => {
  assert.deepEqual(find('heading 2'), ['Heading 2'])
  assert.deepEqual(find('insert row above'), ['Insert row above'])
  assert.deepEqual(find('row above'), ['Insert row above'])
})

test('common words find their block', () => {
  assert.deepEqual(find('h1'), ['Heading 1'])
  assert.equal(find('todo')[0], 'To-do list')
  assert.equal(find('check')[0], 'To-do list')
  assert.equal(find('math')[0], 'Math')
})

test('the middle of a word finds nothing', () => {
  assert.deepEqual(find('hr'), ['Divider'])
  assert.deepEqual(find('able'), [])
})

test('nothing typed keeps the menu as it is', () => {
  assert.deepEqual(find(''), items.map((item) => item.title))
})
