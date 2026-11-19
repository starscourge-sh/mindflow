// Run with: node --test test/tags-off-name.test.ts
// A #tag typed in a note's first line (its name) goes to a line of its own at the end, still the note's tag.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tagsOffName } from '../src/main/tags-off-name.ts'
import { tagsIn } from '../src/main/tag-words.ts'

const doc = (...lines: string[]) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const lines = (body: unknown): string[] => (body as ReturnType<typeof doc>).content.map((block) => block.content?.map((one) => one.text).join('') ?? '')

test('the user’s two notes: the tag leaves the name and stays the note’s tag', () => {
  const one = tagsOffName(doc('credit note, purchase order, invoice :order type #work ', 'if im using stock'))
  assert.deepEqual(lines(one), ['credit note, purchase order, invoice :order type', 'if im using stock', '#work'])
  assert.deepEqual(lines(tagsOffName(doc('#app-idea video editor for youtube + shortform: using local a.i '))), ['video editor for youtube + shortform: using local a.i', '#app-idea'])
  assert.deepEqual(lines(tagsOffName(doc('#app-idea: a clock'))), ['a clock', '#app-idea'])
})

test('joins a line of tags at the end, and never writes a tag twice', () => {
  assert.deepEqual(lines(tagsOffName(doc('Soccer #project #idea', 'words', '#later'))), ['Soccer', 'words', '#later #project #idea'])
  assert.deepEqual(lines(tagsOffName(doc('Soccer #project', 'it is a #project'))), ['Soccer', 'it is a #project'])
})

test('nothing moves when there is nothing to move, or the name would be empty', () => {
  assert.equal(tagsOffName(doc('no tags here', '#below')), null)
  assert.equal(tagsOffName(doc('#project', 'words')), null)
  assert.equal(tagsOffName(doc('A joke #bit'), ['bit']), null)
  const once = tagsOffName(doc('Postman #project'))
  assert.equal(tagsOffName(once), null)
})

test('words kept as Markdown move the same way', () => {
  assert.equal(tagsOffName('Mathtype #project\nsome notes'), 'Mathtype\nsome notes\n\n#project')
  assert.equal(tagsOffName('# Heading #work'), '# Heading\n\n#work')
  assert.equal(tagsOffName('```\n#!/bin/sh\n```'), null)
})

test('the tags read from the words are the same before and after', () => {
  for (const body of [doc('a #b c #d', 'e'), doc('#x: y')]) {
    const text = (value: unknown) => lines(value).join('\n')
    assert.deepEqual(tagsIn(text(tagsOffName(body))).sort(), tagsIn(text(body)).sort())
  }
})

test('a row reads the tags off the last line, kept either way', async () => {
  const { tagLine } = await import('../src/main/tags-off-name.ts')
  assert.equal(tagLine(JSON.stringify(tagsOffName(doc('Soccer #project #idea', 'words')))), 'project idea')
  assert.equal(tagLine(JSON.stringify(tagsOffName('Mathtype #project\nsome notes'))), 'project')
  assert.equal(tagLine(JSON.stringify(doc('no tags', 'it is a #project'))), '')
  assert.equal(tagLine(JSON.stringify(tagsOffName(doc('A #b', 'c', '#d')))), 'd b')
})
