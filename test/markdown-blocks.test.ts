// Run with: node --test test/markdown-blocks.test.ts
// The Markdown shapes that left pictures and rules inside a line of words in the user's imported notes, read by the
// same reader the import uses (TipTap's), then put right as markdownToDocument does (lib/lift-blocks.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Markdown } from '@tiptap/markdown'
import { liftBlocks } from '../src/renderer/src/lib/lift-blocks.ts'

type Json = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Json[] }
// No page: the reader and the schema only (an empty document given as one, since words given as HTML need a page).
const editor = new Editor({ element: null, extensions: [StarterKit, Image, Markdown], content: { type: 'doc', content: [{ type: 'paragraph' }] } })
const parse = (markdown: string): Json => (editor as unknown as { markdown: { parse: (md: string) => Json } }).markdown.parse(markdown)
const read = (markdown: string): Json => liftBlocks(parse(markdown), editor.schema) as Json
/** Blocks left inside a line of words: what the editor throws on at the first edit beside them. */
const stuck = (node: Json): string[] => [
  ...(['paragraph', 'heading'].includes(node.type ?? '') ? (node.content ?? []).filter((one) => editor.schema.nodes[one.type ?? '']?.isBlock).map((one) => one.type!) : []),
  ...(node.content ?? []).flatMap(stuck),
]
const tops = (doc: Json): string[] => (doc.content ?? []).map((one) => (one.type === 'image' ? `[${one.attrs?.src}]` : `${one.type}:${(one.content ?? []).map((part) => part.text ?? '').join('')}`))
const valid = (doc: Json) => editor.schema.nodeFromJSON(doc).check()

test('a picture after a line break in a paragraph comes out on a line of its own', () => {
  const markdown = 'Words before it\n![](haligtree://assets/a.png)'
  assert.deepEqual(stuck(parse(markdown)), ['image'], 'the reader alone leaves it inside the line')
  const doc = read(markdown)
  assert.deepEqual(stuck(doc), [])
  assert.deepEqual(tops(doc), ['paragraph:Words before it', '[haligtree://assets/a.png]'])
  valid(doc)
})

test('an Obsidian ![[file.png]] on its own line, as the import writes it, is a picture block', () => {
  const doc = read('Above\n\n![](haligtree://assets/file.png)\n\nBelow')
  assert.deepEqual(stuck(doc), [])
  assert.deepEqual(tops(doc), ['paragraph:Above', '[haligtree://assets/file.png]', 'paragraph:Below'])
  valid(doc)
})

test('a picture between two lines parts them, and the words stay as written', () => {
  const markdown = 'Line **one**\n![](haligtree://assets/b.png)\nLine two'
  assert.deepEqual(stuck(parse(markdown)), ['image'])
  const doc = read(markdown)
  assert.deepEqual(stuck(doc), [])
  assert.deepEqual(tops(doc), ['paragraph:Line one', '[haligtree://assets/b.png]', 'paragraph:Line two'])
  assert.deepEqual(doc.content?.[0].content?.find((one) => one.text === 'one'), { type: 'text', text: 'one', marks: [{ type: 'bold' }] })
  valid(doc)
})

test('a rule over a picture: the rule, then the picture', () => {
  const doc = read('---\n![](haligtree://assets/c.png)')
  assert.deepEqual(stuck(doc), [])
  assert.deepEqual(tops(doc), ['horizontalRule:', '[haligtree://assets/c.png]'])
  valid(doc)
})

test('two pictures on one line each stand alone', () => {
  const doc = read('![](haligtree://assets/d.png) ![](haligtree://assets/e.png)')
  assert.deepEqual(stuck(doc), [])
  assert.deepEqual(tops(doc), ['[haligtree://assets/d.png]', '[haligtree://assets/e.png]'])
  valid(doc)
})
