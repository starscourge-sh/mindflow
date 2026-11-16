// Run with: node --test test/block-room.test.ts
// The editor puts the room over a paragraph after a paragraph or a heading on the paragraph's own element
// (extensions/block-room.ts), and after each change asks again only the blocks the change reached and the one after
// them. ProseMirror keeps the elements of the blocks before and after what changed, in their order, and makes those
// between again, bare: after any run of edits every block must still wear what a fresh look at the note gives it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, type Node } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { reached, roomOf } from '../src/renderer/src/extensions/block-room.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*' },
    rule: { group: 'block' },
    text: {},
  },
})
const block = (kind: string, words = 'words'): Node => (kind === 'rule' ? schema.nodes.rule.create() : schema.node(kind, null, words ? schema.text(words) : undefined))

test('every block wears what a fresh look gives it after every kind of change', () => {
  let seed = 7
  const random = (n: number): number => ((seed = (seed * 16807) % 2147483647), seed % n)
  const kinds = ['paragraph', 'paragraph', 'paragraph', 'heading', 'rule']
  let state = EditorState.create({ schema, doc: schema.node('doc', null, Array.from({ length: 40 }, () => block(kinds[random(kinds.length)]))) })
  // The page: what each block's element wears, in order.
  let worn: (string | null)[] = []
  const paint = (doc: Node, first: number, last: number): void => { for (let i = first; i <= last; i++) worn[i] = roomOf(doc, i) }
  paint(state.doc, 0, state.doc.childCount - 1)
  for (let i = 0; i < 600; i++) {
    const { doc } = state
    const tr = state.tr
    const at = random(doc.content.size + 1)
    const $at = doc.resolve(at)
    const what = random(8)
    if (what === 0) tr.insert($at.depth ? $at.after(1) : at, block(kinds[random(kinds.length)])) // a block put in
    else if (what === 1 && $at.parent.isTextblock) tr.split(at) // Enter
    else if (what === 2 && $at.parent.isTextblock) tr.insertText('x', at) // a letter
    else if (what === 3 && doc.childCount > 2) tr.delete(at, Math.min(doc.content.size, at + 1 + random(30))) // a stretch taken out
    else if (what === 4 && $at.parent.isTextblock) tr.setBlockType(at, at, random(2) ? schema.nodes.heading : schema.nodes.paragraph) // a line made a heading
    else if (what === 5) tr.replaceWith(0, doc.content.size, Array.from({ length: 1 + random(5) }, () => block(kinds[random(kinds.length)]))) // the whole note pasted over
    else if (what === 6 && doc.childCount > 3) { const from = random(doc.childCount - 1); const one = doc.child(from); const pos = doc.resolve(0).posAtIndex(from, 0); tr.delete(pos, pos + one.nodeSize); tr.insert(tr.doc.content.size, one) } // a block carried to the end
    else if (what === 7 && $at.parent.isTextblock) { tr.delete($at.start(), $at.start() + Math.min(1, $at.parent.content.size)); tr.setBlockType(at - 1, at - 1, random(2) ? schema.nodes.heading : schema.nodes.paragraph) } // "# " typed at a line's start
    if (!tr.docChanged) continue
    tr.setSelection(TextSelection.atStart(tr.doc))
    const before = state.doc
    state = state.apply(tr)
    const span = reached(before, state.doc)
    if (span) {
      // Kept before the change and after it (counted from the end), made again between: bare until painted.
      const grew = state.doc.childCount - before.childCount
      worn = Array.from({ length: state.doc.childCount }, (_, at) => (at < span[0] ? worn[at] : at > span[1] ? worn[at - grew] : null))
      paint(state.doc, span[0], span[1])
    }
    state.doc.forEach((_node, _at, index) => assert.equal(worn[index], roomOf(state.doc, index), `after change ${i} (kind ${what}), block ${index}`))
  }
})

test('a change that leaves the note as it was reaches nothing', () => {
  const doc = schema.node('doc', null, [block('paragraph'), block('heading'), block('paragraph')])
  assert.equal(reached(doc, doc), null)
  assert.equal(roomOf(doc, 0), null)
  assert.equal(roomOf(doc, 2), 'mf-after-h')
})
