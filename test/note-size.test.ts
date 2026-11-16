// Run with: node --test test/note-size.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, type Node } from 'prosemirror-model'
import { Transform } from 'prosemirror-transform'
import { minutesToRead, sizeOf, type Size } from '../src/renderer/src/lib/note-size.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    codeBlock: { group: 'block', content: 'text*', marks: '', code: true },
    blockquote: { group: 'block', content: 'block+' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph block*' },
    image: { group: 'block', atom: true, attrs: { src: { default: '' } } },
    noteLink: { group: 'inline', inline: true, atom: true, attrs: { text: { default: '' }, label: { default: '' } } },
    text: { group: 'inline' },
  },
  marks: { link: { attrs: { href: {} } }, code: {} },
})
const t = (words: string, ...marks: ReturnType<typeof schema.mark>[]): Node => schema.text(words, marks)
const p = (...parts: (string | Node)[]): Node => schema.node('paragraph', null, parts.filter((part) => part !== '').map((part) => (typeof part === 'string' ? t(part) : part)))
const h = (words: string): Node => schema.node('heading', null, words ? [t(words)] : [])
const list = (...items: Node[][]): Node => schema.node('bulletList', null, items.map((parts) => schema.node('listItem', null, parts)))
const link = (href: string) => schema.mark('link', { href })

const note = (): Node => schema.node('doc', null, [
  h('Cell biology'),
  p('Mitosis :: one cell becomes two identical cells'),
  p('Read ', t('the chapter', link('https://a.example')), t(' online', link('https://a.example')), ' and ', t('this', link('https://b.example')), '.'),
  p('See ', schema.node('noteLink', { text: 'Meiosis notes' }), ' / for the rest'),
  schema.node('image', { src: 'cell.png' }),
  list([p('one')], [p('two'), list([p('two a')], [p('two b')])], [p('three')]),
  schema.node('blockquote', null, [p('A quote'), p('in two lines')]),
  schema.node('codeBlock', null, [t('a :: b is not a card here')]),
  p(),
  h('Summary'),
])

/** The note counted whole, the way the count was read before it was kept by block. */
const whole = (doc: Node): Size => {
  const shown = (node: Node): string => (node.type.name === 'noteLink' ? String(node.attrs.text || node.attrs.label || ' ') : ' ')
  let headings = 0
  let pictures = 0
  doc.descendants((node) => void ((headings += node.type.name === 'heading' ? 1 : 0), (pictures += node.type.name === 'image' ? 1 : 0)))
  return {
    ...sizeOf(note()),
    words: doc.textBetween(0, doc.content.size, ' ', (node) => ` ${shown(node)} `).split(/\s+/).filter((word) => word && word !== '/').length,
    characters: doc.textBetween(0, doc.content.size, undefined, shown).length,
    headings,
    pictures,
  }
}

test('a note counts its lines as the margin does, and its words, pictures, links and cards', () => {
  const size = sizeOf(note())
  // 1 heading, 3 paragraphs, a picture, 5 list items, 2 quoted paragraphs, a code block, an empty line, a heading.
  assert.equal(size.lines, 15)
  assert.equal(size.headings, 2)
  assert.equal(size.pictures, 1)
  // A link to a note, and two web links: one run of words cut in two styles, then another address.
  assert.equal(size.links, 3)
  // The :: line; not the one in code.
  assert.equal(size.cards, 1)
  const counted = whole(note())
  assert.equal(size.words, counted.words)
  assert.equal(size.characters, counted.characters)
})

test('each change counts only what it touched, and comes to what counting the whole note again gives', () => {
  let doc = note()
  sizeOf(doc)
  const edits: ((tr: Transform) => Transform)[] = [
    (tr) => tr.insert(3, t('x')),
    (tr) => tr.insert(20, t(' more words here')),
    (tr) => tr.delete(5, 40),
    (tr) => tr.split(10),
    (tr) => tr.insert(0, h('A new heading')),
    (tr) => tr.insert(tr.doc.content.size, p('Photosynthesis :: light to sugar')),
    (tr) => tr.replaceWith(tr.doc.content.size - 1, tr.doc.content.size - 1, t(' (p. 4)')),
    (tr) => tr.delete(1, tr.doc.content.size - 1),
    (tr) => tr.insert(tr.doc.content.size, [p('one'), p('two'), schema.node('image')]),
  ]
  for (const edit of edits) {
    const after = edit(new Transform(doc)).doc
    const counted = sizeOf(after, doc)
    const fresh = whole(after)
    assert.equal(counted.words, fresh.words)
    assert.equal(counted.characters, fresh.characters)
    assert.equal(counted.headings, fresh.headings)
    assert.equal(counted.pictures, fresh.pictures)
    // Lines and the rest, against a count of every block from nothing (a copy of the note, so nothing kept is used).
    const copy = schema.nodeFromJSON(after.toJSON())
    assert.deepEqual(counted, sizeOf(copy))
    doc = after
  }
})

test('a change that leaves every count as it was gives the same size, so nothing showing it draws again', () => {
  const doc = note()
  const before = sizeOf(doc)
  const bold = new Transform(doc).addMark(3, 6, schema.mark('code')).doc
  assert.equal(sizeOf(bold, doc), before)
})

test('reading time: about 238 words a minute, at least a minute for any words, none for none', () => {
  assert.equal(minutesToRead(0), 0)
  assert.equal(minutesToRead(12), 1)
  assert.equal(minutesToRead(4212), 18)
  assert.equal(minutesToRead(135_753), 570)
})
