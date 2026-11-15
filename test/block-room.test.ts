// Run with: node --test test/block-room.test.ts
// The editor marks a paragraph after a paragraph or a heading (extensions/block-room.ts) for the room over it, and
// after each change asks again only the blocks around it: after any run of edits the marks are the ones a fresh look
// at the whole note gives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, type Node } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { DecorationSet } from '@tiptap/pm/view'
import { BlockRoom } from '../src/renderer/src/extensions/block-room.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*' },
    rule: { group: 'block' },
    text: {},
  },
})
const plugin = (BlockRoom.config.addProseMirrorPlugins as () => import('@tiptap/pm/state').Plugin[]).call({})[0]

/** The marks as a fresh look at the whole note gives them. */
const fresh = (doc: Node): string[] => {
  const out: string[] = []
  let pos = 0
  doc.forEach((node, _offset, index) => {
    const before = index ? doc.child(index - 1).type.name : ''
    if (node.type.name === 'paragraph' && (before === 'paragraph' || before === 'heading')) out.push(`${pos}-${pos + node.nodeSize} ${before === 'paragraph' ? 'mf-after-p' : 'mf-after-h'}`)
    pos += node.nodeSize
  })
  return out
}
const kept = (state: EditorState): string[] =>
  (plugin.getState(state) as DecorationSet).find().map((one) => `${one.from}-${one.to} ${(one as unknown as { type: { attrs: { class: string } } }).type.attrs.class}`).sort((a, b) => parseInt(a) - parseInt(b))

const block = (kind: string, words = 'words'): Node => (kind === 'rule' ? schema.nodes.rule.create() : schema.node(kind, null, words ? schema.text(words) : undefined))

test('the marks after every kind of change are the ones a fresh look gives', () => {
  let seed = 7
  const random = (n: number): number => ((seed = (seed * 16807) % 2147483647), seed % n)
  const kinds = ['paragraph', 'paragraph', 'paragraph', 'heading', 'rule']
  let state = EditorState.create({ schema, doc: schema.node('doc', null, Array.from({ length: 40 }, () => block(kinds[random(kinds.length)]))), plugins: [plugin] })
  assert.deepEqual(kept(state), fresh(state.doc))
  for (let i = 0; i < 400; i++) {
    const { doc } = state
    const tr = state.tr
    const at = random(doc.content.size + 1)
    const $at = doc.resolve(at)
    const what = random(6)
    if (what === 0) tr.insert($at.depth ? $at.after(1) : at, block(kinds[random(kinds.length)])) // a block put in
    else if (what === 1 && $at.parent.isTextblock) tr.split(at) // Enter
    else if (what === 2 && $at.parent.isTextblock) tr.insertText('x', at) // a letter
    else if (what === 3 && doc.childCount > 2) tr.delete(at, Math.min(doc.content.size, at + 1 + random(30))) // a stretch taken out
    else if (what === 4 && $at.parent.isTextblock) tr.setBlockType(at, at, random(2) ? schema.nodes.heading : schema.nodes.paragraph) // a line made a heading
    else if (what === 5) tr.replaceWith(0, doc.content.size, Array.from({ length: 1 + random(5) }, () => block(kinds[random(kinds.length)]))) // the whole note pasted over
    if (!tr.docChanged) continue
    tr.setSelection(TextSelection.atStart(tr.doc))
    state = state.apply(tr)
    assert.deepEqual(kept(state), fresh(state.doc), `after change ${i} (kind ${what} at ${at})`)
  }
})
