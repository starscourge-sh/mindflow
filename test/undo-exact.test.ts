// Run with: node --test test/undo-exact.test.ts
// Undo and Redo give back exactly the note that was there, whatever a plugin that tidies after every change does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, type Node } from '@tiptap/pm/model'
import { EditorState, Plugin, TextSelection, type Transaction } from '@tiptap/pm/state'
import { history, redo, undo } from '@tiptap/pm/history'
import { UndoExact } from '../src/renderer/src/lib/undo-exact.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
  },
})
const doc = (...lines: string[]): Node => schema.node('doc', null, lines.map((words) => schema.node('paragraph', null, words ? [schema.text(words)] : [])))
const lines = (state: EditorState): string[] => {
  const out: string[] = []
  state.doc.forEach((one) => void out.push(one.textContent))
  return out
}

/** A plugin that tidies the note after any change, as join-lists does: here, empty lines are taken out. */
const tidy = (): Plugin =>
  new Plugin({
    appendTransaction: (transactions, _before, after) => {
      if (!transactions.some((one) => one.docChanged)) return null
      const tr = after.tr
      after.doc.forEach((one, at) => void (one.childCount === 0 && after.doc.childCount > 1 && tr.delete(tr.mapping.map(at), tr.mapping.map(at + one.nodeSize))))
      return tr.docChanged ? tr : null
    },
  })

/** A plugin that only moves the caret after a change: what it adds to an Undo still goes in. */
const caretToStart = (): Plugin =>
  new Plugin({ appendTransaction: (transactions, _before, after) => (transactions.some((one) => one.docChanged) && after.selection.from !== 1 ? after.tr.setSelection(TextSelection.create(after.doc, 1)) : null) })

/** The editor's state with the plugins, and UndoExact's own guard laid on them as its view lays it. */
const editor = (exact: boolean, ...plugins: Plugin[]): EditorState => {
  const own = exact ? (UndoExact.config.addProseMirrorPlugins as () => Plugin[]).call({}) : []
  const state = EditorState.create({ doc: doc('one', '', 'two'), plugins: [history(), ...plugins, ...own] })
  for (const one of own) one.spec.view?.({ state } as never)
  return state
}
const run = (state: EditorState, command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean): EditorState => {
  let next = state
  command(state, (tr) => void (next = state.apply(tr)))
  return next
}
/** Deletes from inside "one" to inside "two": the empty line between goes with it. */
const cut = (state: EditorState): EditorState => state.apply(state.tr.delete(3, 8))

test('without the guard, a plugin that tidies after every change rewrites what Undo puts back', () => {
  const was = editor(false, tidy())
  const back = run(cut(was), undo)
  assert.deepEqual(lines(back), ['one', 'two'])
})

test('with it, Undo puts back every line as it was, the empty one too', () => {
  const was = editor(true, tidy())
  const back = run(cut(was), undo)
  assert.ok(back.doc.eq(was.doc), JSON.stringify(lines(back)))
})

test('and Redo makes the change again exactly, and Undo after it puts it back again', () => {
  const was = editor(true, tidy())
  const after = cut(was)
  const again = run(run(after, undo), redo)
  assert.ok(again.doc.eq(after.doc), JSON.stringify(lines(again)))
  assert.ok(run(again, undo).doc.eq(was.doc))
})

test('the plugin still tidies an ordinary change', () => {
  const was = editor(true, tidy())
  const typed = was.apply(was.tr.insertText('!', 2))
  assert.deepEqual(lines(typed), ['o!ne', 'two'])
})

test('what a plugin adds to an Undo that only moves the caret still goes in', () => {
  const was = editor(true, caretToStart())
  const back = run(cut(was.apply(was.tr.setSelection(TextSelection.create(was.doc, 3)))), undo)
  assert.ok(back.doc.eq(was.doc))
  assert.equal(back.selection.from, 1)
})
