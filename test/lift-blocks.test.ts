// Run with: node --test test/lift-blocks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from 'prosemirror-model'
import { liftBlocks } from '../src/renderer/src/lib/lift-blocks.ts'

// The editor's shapes that matter here: a picture and a rule are blocks, a list item starts with a line, a callout
// holds blocks, a mention sits in a line.
const lineAttrs = { blockId: { default: null }, textAlign: { default: null } }
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', attrs: lineAttrs },
    heading: { group: 'block', content: 'inline*', attrs: { ...lineAttrs, level: { default: 1 } } },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true },
    mention: { group: 'inline', inline: true, atom: true, attrs: { id: { default: null } } },
    image: { group: 'block', atom: true, attrs: { src: { default: null }, alt: { default: null } } },
    horizontalRule: { group: 'block', attrs: { variant: { default: null } } },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: '(paragraph|bulletList) block*' },
    callout: { group: 'block', content: 'block+', attrs: { title: { default: '' } } },
  },
  marks: { bold: {}, italic: {}, code: {}, link: { attrs: { href: {} } } },
})
const line = new Schema({ nodes: schema.spec.nodes.update('doc', { content: 'paragraph' }), marks: schema.spec.marks })

const pic = (src = 'haligtree://assets/a.png') => ({ type: 'image', attrs: { src, alt: '' } })
const rule = { type: 'horizontalRule', attrs: { variant: null } }
const text = (words: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text: words, ...(marks ? { marks } : {}) })
const p = (...content: object[]) => ({ type: 'paragraph', attrs: { blockId: null, textAlign: null }, content })
const doc = (...content: object[]) => ({ type: 'doc', content })
/** Valid in the editor's schema: what the editor would have thrown on is gone. */
const valid = (json: object, within = schema) => within.nodeFromJSON(json).check()

test('THE BONFIRE: a rule, a line break and a picture in one line become the rule and the picture', () => {
  const stored = doc({ type: 'heading', attrs: { blockId: null, textAlign: null, level: 1 }, content: [text('THE BONFIRE')] }, p(rule, text('\n'), pic()))
  assert.throws(() => valid(stored))
  const lifted = liftBlocks(stored, schema)
  assert.deepEqual(lifted.content?.slice(1), [rule, pic()])
  valid(lifted)
})

test('a picture first, last, alone, and between words', () => {
  assert.deepEqual(liftBlocks(doc(p(pic(), text('after'))), schema), doc(pic(), p(text('after'))))
  assert.deepEqual(liftBlocks(doc(p(text('before'), pic())), schema), doc(p(text('before')), pic()))
  assert.deepEqual(liftBlocks(doc(p(pic())), schema), doc(pic()))
  assert.deepEqual(liftBlocks(doc(p(text('one'), pic(), text('two'))), schema), doc(p(text('one')), pic(), p(text('two'))))
  // The line breaks that put the picture on its own line go with the cut; the words stay as they were.
  assert.deepEqual(liftBlocks(doc(p(text('one\n'), pic(), text('\ntwo  '))), schema), doc(p(text('one')), pic(), p(text('two  '))))
  assert.deepEqual(liftBlocks(doc(p(text('one'), { type: 'hardBreak' }, pic(), { type: 'hardBreak' }, text('two'))), schema), doc(p(text('one')), pic(), p(text('two'))))
})

test('two pictures in one line, with only spaces between them, stand one under the other', () => {
  assert.deepEqual(liftBlocks(doc(p(text('a'), pic('x'), pic('y'), text('b'))), schema), doc(p(text('a')), pic('x'), pic('y'), p(text('b'))))
  assert.deepEqual(liftBlocks(doc(p(pic('x'), text(' \n '), pic('y'))), schema), doc(pic('x'), pic('y')))
})

test('the words round it keep their marks, links and mentions exactly', () => {
  const before = [text('bold ', [{ type: 'bold' }]), { type: 'mention', attrs: { id: 'n1' } }, text(' a link\n', [{ type: 'link', attrs: { href: 'https://example.org' } }])]
  const after = [text('\ncode', [{ type: 'code' }]), text(' and ', [{ type: 'italic' }])]
  const lifted = liftBlocks(doc(p(...before, pic(), ...after)), schema)
  assert.deepEqual(lifted, doc(
    p(text('bold ', [{ type: 'bold' }]), { type: 'mention', attrs: { id: 'n1' } }, text(' a link', [{ type: 'link', attrs: { href: 'https://example.org' } }])),
    pic(),
    p(text('code', [{ type: 'code' }]), text(' and ', [{ type: 'italic' }])),
  ))
  valid(lifted)
})

test('in a heading: the heading keeps its level, the picture goes under it', () => {
  const heading = { type: 'heading', attrs: { blockId: null, textAlign: 'center', level: 2 }, content: [text('Title'), pic()] }
  assert.deepEqual(liftBlocks(doc(heading), schema), doc({ ...heading, content: [text('Title')] }, pic()))
})

test('a rule under a line of words, and words under a rule', () => {
  assert.deepEqual(liftBlocks(doc(p(text('words'), text('\n'), rule)), schema), doc(p(text('words')), rule))
  const lifted = liftBlocks(doc(p(rule, text('\n'), text('💭 » words', [{ type: 'code' }]))), schema)
  assert.deepEqual(lifted, doc(rule, p(text('💭 » words', [{ type: 'code' }]))))
  valid(lifted)
})

test('in a list item: it still starts with a line, an empty one if the picture came first', () => {
  const item = (...content: object[]) => ({ type: 'listItem', content })
  const list = (...items: object[]) => ({ type: 'bulletList', content: items })
  const first = liftBlocks(doc(list(item(p(pic(), text('caption'))))), schema)
  assert.deepEqual(first, doc(list(item({ type: 'paragraph' }, pic(), p(text('caption'))))))
  valid(first)
  const last = liftBlocks(doc(list(item(p(text('point'), pic())))), schema)
  assert.deepEqual(last, doc(list(item(p(text('point')), pic()))))
  valid(last)
})

test('nested: a picture in a list in a callout is lifted where it is, and nothing else moves', () => {
  const untouched = p(text('fine'))
  const stored = doc(untouched, { type: 'callout', attrs: { title: 'Read this' }, content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p(text('see'), text('\n'), pic())] }] }] })
  const lifted = liftBlocks(stored, schema)
  assert.deepEqual(lifted, doc(untouched, { type: 'callout', attrs: { title: 'Read this' }, content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p(text('see')), pic()] }] }] }))
  assert.equal(lifted.content?.[0], untouched)
  valid(lifted)
})

test('a line keeps its name (what a link lands on) on its first part only', () => {
  const named = { type: 'paragraph', attrs: { blockId: 'b-1', textAlign: null }, content: [text('one'), pic(), text('two')] }
  const lifted = liftBlocks(doc(named), schema)
  assert.equal(lifted.content?.[0].attrs?.blockId, 'b-1')
  assert.equal(lifted.content?.[2].attrs?.blockId, null)
})

test('each block taken out of a line is told, once, and nothing else', () => {
  const told: unknown[] = []
  liftBlocks(doc(p(text('a'), pic('x')), p(rule, text('\n'), pic('y')), pic('z')), schema, (block) => told.push(block.attrs?.src ?? block.type))
  assert.deepEqual(told, ['x', 'horizontalRule', 'y'])
})

test('a document with nothing to lift comes back as the very same object', () => {
  const stored = doc(p(text('words')), pic(), { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('point'))] }] })
  assert.equal(liftBlocks(stored, schema), stored)
  assert.equal(liftBlocks(doc(), schema).type, 'doc')
})

test('a holder with no room for a block (a one-line editor) is left as it was', () => {
  const stored = doc(p(text('a'), pic()))
  assert.equal(liftBlocks(stored, line), stored)
})

// The editor's code mark takes no other (TipTap's `excludes: "_"`): Markdown read in (`**`top_k`**`) gave words bold
// and code at once, which the editor loads unchecked and then refused at its first checked insert ("Invalid collection
// of marks for node text: bold,code", "Join them" on the largest note, 16 Nov).
const coded = new Schema({ nodes: schema.spec.nodes, marks: schema.spec.marks.update('code', { excludes: '_' }) })

test('words marked bold and code, or code and italic, keep the code alone; marks that go together stay', () => {
  const stored = doc(p(text('lower top_k', [{ type: 'bold' }, { type: 'code' }]), text(' and '), text('main', [{ type: 'code' }, { type: 'italic' }])), { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('inferenceConfig', [{ type: 'bold' }, { type: 'code' }]))] }] })
  assert.throws(() => valid(stored, coded), /Invalid collection of marks for node text: bold,code/)
  const fixed = liftBlocks(stored, coded)
  valid(fixed, coded)
  assert.deepEqual(fixed.content?.[0].content?.map((one) => one.marks?.map((mark) => mark.type)), [['code'], undefined, ['code']])
  assert.deepEqual(fixed.content?.[1].content?.[0].content?.[0].content?.[0].marks?.map((mark) => mark.type), ['code'])
  const fine = doc(p(text('both', [{ type: 'bold' }, { type: 'italic' }]), text('a link', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.org' } }])))
  assert.equal(liftBlocks(fine, coded), fine)
})
