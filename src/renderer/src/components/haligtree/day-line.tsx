import { useEffect, useRef } from 'react'
import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TAGS } from '@/extensions/tokens'
import { findCaptures } from '@/lib/capture-links'
import { readTask } from '../../../../main/task-words'
import { HaligtreeEditor } from './haligtree-editor'
import { TINT } from './task-input'
import type { AtLink } from './at-notes'

/**
 * One line of a written list (Today, the Journal's list, the box for
 * tomorrow) as a one-line editor of the app's own: the note editor's @ menu,
 * #tags lit, and a task's words (a day, a time, `!!!`) lit as quick capture
 * lights them. What it holds is read back as plain words, as a task's title
 * is kept: a note picked with @ is its name in the words and the task's link.
 */

/** A line's words as plain text, a note picked with @ as its name, and where that name stands. */
export function lineOf(doc: PMNode): { text: string; link?: AtLink; at: number[] } {
  let text = ''
  let link: AtLink | undefined
  // Each place in the line's words, by where it is in the document: for the lit words.
  const at: number[] = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let n = 0; n < node.text!.length; n++) at.push(pos + n)
      text += node.text
    } else if (node.type.name === 'noteLink') {
      const name = String(node.attrs.label || 'Untitled')
      if (!link) link = { id: String(node.attrs.id), plain: [{ from: text.length, to: text.length + name.length }] }
      for (let n = 0; n < name.length; n++) at.push(-1)
      text += name
    } else if (node.type.name === 'hardBreak') {
      at.push(-1)
      text += ' '
    }
    return true
  })
  return { text, link, at }
}

/** A task's words lit where they stand: the day, the deadline, how much it matters. */
const KEY = new PluginKey<DecorationSet>('taskWords')
const lit = (doc: PMNode): DecorationSet => {
  const { text, link, at } = lineOf(doc)
  if (!text.trim()) return DecorationSet.empty
  const marks: Decoration[] = []
  for (const span of readTask(text, new Date(), link?.plain ?? []).spans) {
    const from = at[span.from]
    const to = at[span.to - 1]
    if (from === undefined || to === undefined || from < 0 || to < 0) continue
    const tint = TINT[span.kind]
    marks.push(Decoration.inline(from, to + 1, {
      'data-task-word': span.kind,
      class: 'rounded-sm',
      style: `background: var(--tt-color-highlight-${tint}); color: var(--tt-color-text-${tint})${span.guess ? '; outline: 1px dashed currentColor; outline-offset: -1px' : ''}`
    }))
  }
  return DecorationSet.create(doc, marks)
}
export const TaskWords = Extension.create({
  name: 'taskWords',
  addProseMirrorPlugins: () => [new Plugin({
    key: KEY,
    state: { init: (_, state) => lit(state.doc), apply: (tr, was) => (tr.docChanged ? lit(tr.doc) : was) },
    props: { decorations: (state) => KEY.getState(state) }
  })]
})

/** What a list asks of one of its lines. */
export type LineHandle = {
  /** The caret in it: at its start, its end, or a place in its words. */
  focus: (at: 'start' | 'end' | number) => void
  /** Its words, read back plain, with the note picked with @. */
  read: () => { text: string; link?: AtLink }
  /** Where the caret is in its words, and whether it is at the start or the end. */
  caret: () => { at: number; start: boolean; end: boolean }
  /** Whether the caret is on the line's first (up) or last (down) row as drawn. */
  edge: (way: 'up' | 'down') => boolean
  /** Whether the caret is in it. */
  focused: () => boolean
  blur: () => void
}

/** Notes only, as a task is made from a note. */
const findNotes = async (query: string): ReturnType<typeof findCaptures> => (await findCaptures(query)).filter((row) => !row.id.includes(':')).slice(0, 8)

const contentOf = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })

export function DayLine({ lineKey, value, register, onKey, onLeave, onPaste, placeholder = '', label, className = '' }: {
  /** Its name among the list's lines: on its element, for stepping between them. */
  lineKey: string
  value: string
  register: (handle: LineHandle | null) => void
  /** A key, before the line's own: true when it was taken. */
  onKey: (event: KeyboardEvent, line: LineHandle) => boolean
  /** The caret left the line (not into its own menu): its words as they stand. */
  onLeave?: (read: { text: string; link?: AtLink }) => void
  /** Several lines pasted: true when the list took them. */
  onPaste?: (text: string) => boolean
  placeholder?: string
  label: string
  className?: string
}): React.JSX.Element {
  const editor = useRef<Editor | null>(null)
  const handle = useRef<LineHandle>({
    focus: (at) => {
      const one = editor.current
      if (!one || one.isDestroyed) return
      const size = one.state.doc.content.size
      one.commands.focus(at === 'start' ? 'start' : at === 'end' ? 'end' : Math.min(1 + at, size - 1))
    },
    read: () => (editor.current ? lineOf(editor.current.state.doc) : { text: value }),
    caret: () => {
      const one = editor.current
      if (!one) return { at: 0, start: true, end: true }
      const { from, to } = one.state.selection
      const end = one.state.doc.content.size - 1
      return { at: from - 1, start: from === to && from <= 1, end: to >= end }
    },
    edge: (way) => !!editor.current?.view.endOfTextblock(way),
    focused: () => !!editor.current?.isFocused,
    blur: () => void editor.current?.commands.blur()
  })
  // The words from the task, when they change anywhere else, unless the line is being written in.
  useEffect(() => {
    const one = editor.current
    if (!one || one.isDestroyed || one.isFocused || lineOf(one.state.doc).text === value) return
    one.commands.setContent(contentOf(value), { emitUpdate: false })
  }, [value])
  useEffect(() => () => register(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useRef(onKey)
  keys.current = onKey
  const leave = useRef(onLeave)
  leave.current = onLeave
  const pasted = useRef(onPaste)
  pasted.current = onPaste
  return (
    <div data-line data-line-key={lineKey} aria-label={label} className={`relative min-w-0 ${className}`}
      onPasteCapture={(event) => {
        const text = event.clipboardData.getData('text/plain')
        if (pasted.current?.(text)) (event.preventDefault(), event.stopPropagation())
      }}
      onBlur={(event) => {
        // Into its own @ menu, or the selection bar, or a right-click menu: still being written.
        const into = event.relatedTarget as Element | null
        if (into && (event.currentTarget.contains(into) || into.closest('[role=menu], .tiptap-suggestion-popup'))) return
        if (editor.current) leave.current?.(lineOf(editor.current.state.doc))
      }}>
      <HaligtreeEditor
        shape="line"
        handles={false}
        slash={false}
        outline={false}
        search={false}
        vim={false}
        math={false}
        smoothScroll={false}
        marks={[]}
        toolbar={false}
        tokens={TAGS}
        extensions={[TaskWords]}
        findNotes={findNotes}
        defaultContent={contentOf(value)}
        placeholder={placeholder}
        style={{ '--mf-padding': '0' } as React.CSSProperties}
        onKeyDown={(event) => keys.current(event, handle.current)}
        onReady={(one) => {
          editor.current = one
          register(handle.current)
        }}
      />
    </div>
  )
}
