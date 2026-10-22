// Run with: node --test test/notes-html.test.ts
// A note from Apple Notes, as the Notes app hands it over, read as Markdown.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataPictures, notesMarkdown } from '../src/main/notes-html.ts'

test('lines, headings, marks and links', () => {
  const html = '<div><h1>Trip plan</h1></div><div>Pack the <b>tent</b> and <i>stove</i></div><div><br></div><div><h2>Links</h2></div><div><a href="https://example.com/map">The map</a> &amp; more</div>'
  const { markdown } = notesMarkdown(html, 'Trip plan')
  assert.equal(markdown, 'Pack the **tent** and *stove*\n\n## Links\n\n[The map](https://example.com/map) & more')
})

test('lists, nested lists and checklists', () => {
  const html = '<div>Shopping</div><ul><li>Eggs</li><li>Milk<ul><li>Oat</li></ul></li></ul><ol><li>One</li><li>Two</li></ol>' +
    '<ul class="checklist"><li class="checked">Tent</li><li class="unchecked">Stove</li></ul>'
  const { markdown } = notesMarkdown(html, 'Packing')
  assert.equal(markdown, 'Shopping\n\n- Eggs\n- Milk\n  - Oat\n\n1. One\n2. Two\n\n- [x] Tent\n- [ ] Stove')
})

test('pictures stored, unknown ones counted', () => {
  const a = 'data:image/png;base64,AAAA'
  const html = `<div>Look</div><div><img src="${a}"></div><div><img src="data:image/png;base64,BBBB"></div>`
  assert.deepEqual(dataPictures(html), [a, 'data:image/png;base64,BBBB'])
  const { markdown, missing } = notesMarkdown(html, 'x', new Map([[a, 'haligtree://assets/a.png']]))
  assert.equal(markdown, 'Look\n\n![](haligtree://assets/a.png)')
  assert.equal(missing, 1)
})

test('a table, and a link that is not a web address dropped to its words', () => {
  const html = '<table><tr><td>Day</td><td>Miles</td></tr><tr><td>Mon</td><td>12</td></tr></table><div><a href="applenotes:note/1">Other note</a></div>'
  assert.equal(notesMarkdown(html, 'Log').markdown, '| Day | Miles |\n| --- | --- |\n| Mon | 12 |\n\nOther note')
})
