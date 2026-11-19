import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Extension, type Editor } from '@tiptap/core'
import { emojis, shortcodeToEmoji } from '@tiptap/extension-emoji'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TAGS, tokensInText } from '@/extensions/tokens'
import { findCaptures } from '@/lib/capture-links'
import { readTask } from '../../../../main/task-words'
import { HaligtreeEditor } from './haligtree-editor'
import { TINT, tintOf } from './task-input'
import { vimPluginKey } from '@/extensions/vim-mode'
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
      const name = String(node.attrs.label || 'New note')
      if (!link) link = { id: String(node.attrs.id), plain: [{ from: text.length, to: text.length + name.length }] }
      for (let n = 0; n < name.length; n++) at.push(-1)
      text += name
    } else if (node.type.name === 'emoji') {
      // A typed or pasted emoji is its own node in the editor: read back as itself, never dropped.
      const emoji = shortcodeToEmoji(String(node.attrs.name), emojis)?.emoji ?? `:${node.attrs.name}:`
      for (let n = 0; n < emoji.length; n++) at.push(-1)
      text += emoji
    } else if (node.type.name === 'hardBreak') {
      at.push(-1)
      text += ' '
    }
    return true
  })
  return { text, link, at }
}

/** How a task word is lit, the same in the editor and in a line drawn as text. */
const wordLook = (span: { kind: keyof typeof TINT; from: number; to: number; guess?: unknown }, text: string): React.CSSProperties & Record<string, string> => {
  const tint = tintOf(span, text)
  return {
    background: `var(--mf-chip-bg-${tint})`,
    color: `var(--mf-chip-ink-${tint})`,
    ...(span.guess ? { outline: '1px dashed currentColor', outlineOffset: '-1px' } : {})
  }
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
    const look = wordLook(span, text)
    marks.push(Decoration.inline(from, to + 1, { 'data-task-word': span.kind, class: 'rounded-sm', style: Object.entries(look).map(([name, said]) => `${name.replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`)}: ${said}`).join('; ') }))
  }
  return DecorationSet.create(doc, marks)
}
const TaskWords = Extension.create({
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
  /** Its words gone, the caret kept in it: a new line made into a task, ready for the next. */
  clear: () => void
}

/** Notes only, as a task is made from a note. */
const findNotes = async (query: string): ReturnType<typeof findCaptures> => (await findCaptures(query)).filter((row) => !row.id.includes(':')).slice(0, 8)

const contentOf = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })

/**
 * A line's words drawn as the editor draws them, in the editor's own
 * elements and classes, with its #tags and task words painted the same way:
 * every line but the one being written is this, so a long list opens at once,
 * and nothing moves when a line becomes an editor under the pointer or caret.
 */
function Drawn({ text, placeholder }: { text: string; placeholder: string }): React.JSX.Element {
  const parts = useMemo(() => {
    if (!text) return null
    const words = text.trim() ? readTask(text, new Date()).spans : []
    const tokens = tokensInText(text, TAGS)
    const cuts = [...new Set([0, text.length, ...words.flatMap((one) => [one.from, one.to]), ...tokens.flatMap((one) => [one.from, one.to])])]
      .filter((at) => at >= 0 && at <= text.length).sort((a, b) => a - b)
    return cuts.slice(0, -1).map((from, n) => {
      const to = cuts[n + 1]
      const word = words.find((one) => one.from <= from && to <= one.to)
      const token = tokens.find((one) => one.from <= from && to <= one.to)
      let part: React.ReactNode = text.slice(from, to)
      if (token) part = (
        <span className="tiptap-token" data-token={token.name} data-token-color={token.color}
          {...(token.name === 'tag' ? { 'data-note-hover': '', 'data-note': `tag:${token.value.replace(/^#/, '').toLowerCase()}` } : {})}>{part}</span>
      )
      if (word) part = <span data-task-word={word.kind} className="rounded-sm" style={wordLook(word, text)}>{part}</span>
      return <Fragment key={from}>{part}</Fragment>
    })
  }, [text])
  return (
    <div className="relative haligtree-editor-wrapper is-line" style={{ '--mf-padding': '0' } as React.CSSProperties}>
      <div role="presentation" className="haligtree-editor-content relative p-3 overflow-auto tags-inert">
        <div data-line-drawn className="tiptap ProseMirror haligtree-editor is-line" translate="no">
          {parts ? <p>{parts}</p> : <p className="is-empty is-editor-empty" data-placeholder={placeholder}><br className="ProseMirror-trailingBreak" /></p>}
        </div>
      </div>
    </div>
  )
}

/** Where the caret goes as the editor arrives: a place in the words, or the point clicked. */
type Wake = 'start' | 'end' | number | { x: number; y: number }

export function DayLine({ lineKey, value, register, onKey, onLeave, onPaste, onText, placeholder = '', label, className = '', attrs }: {
  /** Its name among the list's lines: on its element, for stepping between them. */
  lineKey: string
  value: string
  /** Told of the line as it is drawn, and of its going (null, with the handle that goes). */
  register: (handle: LineHandle | null, was?: LineHandle) => void
  /** A key, before the line's own: true when it was taken. */
  onKey: (event: KeyboardEvent, line: LineHandle) => boolean
  /** The caret left the line (not into its own menu): its words as they stand. */
  onLeave?: (read: { text: string; link?: AtLink }) => void
  /** Several lines pasted: true when the list took them. */
  onPaste?: (text: string) => boolean
  /** Its words, as each change is typed. */
  onText?: (text: string) => void
  placeholder?: string
  label: string
  className?: string
  /** Names of its own on its element (data-new, data-draft), for the list and its probes to find it by. */
  attrs?: Record<`data-${string}`, string | boolean | undefined>
}): React.JSX.Element {
  const editor = useRef<Editor | null>(null)
  // An editor only while the line is written in: drawn as text the rest of the time.
  const [live, setLive] = useState(false)
  const wake = useRef<Wake | null>(null)
  // The words as they were left, shown until the task's own words come back changed (a save on its way).
  const [left, setLeft] = useState<string | null>(null)
  const shown = left ?? value
  const words = useRef(shown)
  words.current = shown
  const caretAt = (one: Editor, at: Wake): void => {
    if (typeof at === 'object') {
      const found = one.view.posAtCoords({ left: at.x, top: at.y })
      one.commands.focus(found ? found.pos : 'end')
      return
    }
    const size = one.state.doc.content.size
    one.commands.focus(at === 'start' ? 'start' : at === 'end' ? 'end' : Math.min(1 + at, size - 1))
  }
  // Emptied while being left (a new line made a task): drawn empty after, not with the words it had.
  const cleared = useRef(false)
  const wakeAt = (at: Wake): void => {
    const one = editor.current
    if (one && !one.isDestroyed) return caretAt(one, at)
    wake.current = at
    setLive(true)
  }
  const handle = useRef<LineHandle>({
    focus: (at) => wakeAt(at),
    read: () => (editor.current && !editor.current.isDestroyed ? lineOf(editor.current.state.doc) : { text: words.current }),
    caret: () => {
      const one = editor.current
      if (!one || one.isDestroyed) return { at: 0, start: true, end: true }
      const { from, to } = one.state.selection
      const end = one.state.doc.content.size - 1
      return { at: from - 1, start: from === to && from <= 1, end: to >= end }
    },
    edge: (way) => !editor.current || editor.current.isDestroyed || editor.current.view.endOfTextblock(way),
    focused: () => !!editor.current && !editor.current.isDestroyed && editor.current.isFocused,
    blur: () => void editor.current?.commands.blur(),
    clear: () => {
      words.current = ''
      cleared.current = true
      editor.current?.commands.setContent(contentOf(''), { emitUpdate: false })
    }
  })
  // The task's words changed: those are shown, and put in the editor unless it is being written in.
  useEffect(() => {
    setLeft(null)
    const one = editor.current
    if (!one || one.isDestroyed || one.isFocused || lineOf(one.state.doc).text === value) return
    one.commands.setContent(contentOf(value), { emitUpdate: false })
  }, [value])
  // Told of as it is drawn, editor or not, and again when an effect runs twice (a development build's StrictMode).
  useEffect(() => {
    register(handle.current)
    return () => register(null, handle.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useRef(onKey)
  keys.current = onKey
  const leave = useRef(onLeave)
  leave.current = onLeave
  const pasted = useRef(onPaste)
  pasted.current = onPaste
  const typed = useRef(onText)
  typed.current = onText
  return (
    <div {...attrs} data-line data-line-key={lineKey} aria-label={label} className={`relative min-w-0 ${className}`}
      onPasteCapture={(event) => {
        const text = event.clipboardData.getData('text/plain')
        if (pasted.current?.(text)) (event.preventDefault(), event.stopPropagation())
      }}
      onBlur={(event) => {
        // Into its own @ menu, or the selection bar, or a right-click menu: still being written.
        const into = event.relatedTarget as Element | null
        if (into && (event.currentTarget.contains(into) || into.closest('[role=menu], .tiptap-suggestion-popup'))) return
        const one = editor.current
        if (!one || one.isDestroyed) return
        const read = lineOf(one.state.doc)
        cleared.current = false
        leave.current?.(read)
        // Drawn as text again, with the words as left until the task's come back.
        setLeft(cleared.current ? '' : read.text)
        editor.current = null
        setLive(false)
      }}>
      {live ? (
        <HaligtreeEditor
          shape="line"
          handles={false}
          slash={false}
          outline={false}
          search={false}
          // Vim as the page's switch says, only while the row's words are being written (an editor only then), opening
          // ready to type; the row's own keys come first, except Escape while typing, which is Vim's (to normal mode).
          vimStart="insert"
          math={false}
          smoothScroll={false}
          marks={[]}
          toolbar={false}
          tokens={TAGS}
          extensions={[TaskWords]}
          findNotes={findNotes}
          defaultContent={contentOf(shown)}
          placeholder={placeholder}
          style={{ '--mf-padding': '0' } as React.CSSProperties}
          onKeyDown={(event) => {
            const vim = editor.current && vimPluginKey.getState(editor.current.state)
            if (vim?.enabled && vim.mode === 'insert' && event.key === 'Escape') return false
            return keys.current(event, handle.current)
          }}
          onReady={(one) => {
            editor.current = one
            one.on('update', () => typed.current?.(lineOf(one.state.doc).text))
            const at = wake.current
            wake.current = null
            if (at !== null) caretAt(one, at)
          }}
        />
      ) : (
        // Pressed (either button, so a right-click finds the words to act on), it becomes the editor, the caret where it was pressed.
        <div onMouseDown={(event) => {
          if (event.button !== 0 && event.button !== 2) return
          if (event.button === 0) event.preventDefault()
          wakeAt({ x: event.clientX, y: event.clientY })
        }}>
          <Drawn text={shown} placeholder={placeholder} />
        </div>
      )}
    </div>
  )
}
