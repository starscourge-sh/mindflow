import { useEffect, useRef } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'

import { toast } from '@/components/haligtree/ui'
import { notes, type NoteTable } from '@/lib/notes'
import { forget } from '@/lib/early-read'
import { retryIn, saveFailed, saveLanded } from '@/lib/save-trouble'

/** What a save answers when the words changed elsewhere first. */
type Answer = { conflict?: boolean; body?: unknown } | unknown

/** Where `b` parts from `a`: the shared start, how much of `a` it cut, and what it put in. */
const edit = (a: string, b: string): { at: number; cut: number; put: string } => {
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at++
  let end = 0
  while (end < a.length - at && end < b.length - at && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  return { at, cut: a.length - at - end, put: b.slice(at, b.length - end) }
}

/**
 * Your words folded into a note that changed elsewhere, or null when that
 * cannot be done safely. Only an addition is replayed (words typed, a line
 * added), and only where the other change did not touch: anything you cut or
 * rewrote is kept whole instead, by the caller.
 */
export function foldIn(base: unknown, mine: unknown, theirs: unknown): unknown | null {
  const [was, yours, now] = [base, mine, theirs].map((doc) => JSON.stringify(doc ?? null))
  const own = edit(was, yours)
  if (own.cut) return null
  if (!own.put) return theirs
  const other = edit(was, now)
  const at = own.at <= other.at ? own.at : own.at >= other.at + other.cut ? own.at - other.cut + other.put.length : -1
  if (at < 0) return null
  try {
    return JSON.parse(now.slice(0, at) + own.put + now.slice(at))
  } catch {
    return null
  }
}

/**
 * An open editor shows `doc` now, as written elsewhere. Only the part that
 * differs is replaced, so the caret stays with the words around it. Not an
 * undo step: ⌘Z takes back your typing, not the other window's. Markdown (an
 * import never opened) is read whole.
 */
export function showIn(ed: Editor, doc: unknown): void {
  if (ed.isDestroyed) return
  try {
    if (typeof doc === 'string') throw new Error('markdown')
    const next = ed.schema.nodeFromJSON(doc ?? { type: 'doc', content: [] })
    const now = ed.state.doc
    const start = now.content.findDiffStart(next.content)
    if (start !== null) {
      let { a, b } = now.content.findDiffEnd(next.content) ?? { a: now.content.size, b: next.content.size }
      const overlap = start - Math.min(a, b)
      if (overlap > 0) {
        a += overlap
        b += overlap
      }
      ed.view.dispatch(ed.state.tr.replace(start, a, next.slice(start, b)).setMeta('addToHistory', false).setMeta('preventUpdate', true))
    }
  } catch {
    ed.chain().setMeta('addToHistory', false)
      .setContent((doc ?? '') as JSONContent | string, { emitUpdate: false, ...(typeof doc === 'string' ? { contentType: 'markdown' as const } : {}) })
      .run()
  }
}

/**
 * One note's editor saving without ever writing over someone else's words.
 *
 * Each save says which body it was made from; the main process writes it
 * only if that is still what is stored. When it is not (the note open in the
 * other window too, a capture merged into it, a tag renamed), your addition
 * is folded into what is there now, or, when it cannot be, your version is
 * kept in the note's history and the editor shows what is there now, with a
 * Restore. And a note open with nothing waiting to save follows changes made
 * elsewhere, so the next keystroke builds on them rather than on old words.
 */
export function useSameWords(table: NoteTable, id: string | undefined, loaded: unknown, send: (id: string, body: JSONContent, base: unknown, editor?: Editor) => Promise<Answer>): {
  ready: (editor: Editor) => void
  save: (body: JSONContent, editor?: Editor) => void
} {
  // The note each editor was built on, one at a time: a change that arrives
  // late from one already closed still goes to that note, from its own base.
  // `sent` is its words as last saved or shown; anything else is typing still to save.
  type Note = { id: string; base: unknown; sent: string; editor: Editor }
  const open = useRef<Note | null>(null)
  const seen = useRef<Note[]>([])
  const queue = useRef<{ note: Note; body: JSONContent }[]>([])
  const running = useRef(false)
  const latest = useRef(send)
  latest.current = send
  const read = useRef({ id, loaded })
  read.current = { id, loaded }

  // The editor shows `doc` from now on, which its saves then start from.
  const show = (note: Note, doc: unknown): void => {
    note.base = doc
    if (note.editor.isDestroyed) return
    showIn(note.editor, doc)
    note.sent = JSON.stringify(note.editor.getJSON())
  }

  const once = async (note: Note, body: JSONContent): Promise<void> => {
    const live = !note.editor.isDestroyed
    const answer = (await latest.current(note.id, body, note.base, live ? note.editor : undefined)) as { conflict?: boolean; body?: unknown } | undefined
    if (!answer?.conflict) {
      note.base = body
      note.sent = JSON.stringify(body)
      return
    }
    // Changed elsewhere first. Read the editor now: it holds any typing since.
    const mine = note.editor.isDestroyed ? body : note.editor.getJSON()
    const theirs = answer.body
    const merged = foldIn(note.base, mine, theirs)
    queue.current = queue.current.filter((one) => one.note !== note)
    if (merged) {
      // Shown at once, and saved over what is there now.
      show(note, merged)
      note.base = theirs
      queue.current.unshift({ note, body: merged as JSONContent })
      return
    }
    // Shown at once, before anything more is typed over the old words.
    show(note, theirs)
    const version = await notes.keep(note.id, mine)
    toast('This note changed elsewhere; your words are saved in its history', undefined, 'warning', {
      label: 'Restore',
      key: 'R',
      run: () => void notes.restore(table, note.id, version)
    })
  }

  // A save that fails keeps its words here and tries again, sooner at first,
  // while one line for the whole window says so (save-trouble.tsx). Nothing
  // typed is ever dropped because the database said no once.
  const who = useRef(Symbol('editor'))
  const tries = useRef(0)
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pump = async (): Promise<void> => {
    if (running.current) return
    running.current = true
    clearTimeout(retry.current)
    try {
      for (let next = queue.current.shift(); next; next = queue.current.shift()) {
        try {
          await once(next.note, next.body)
        } catch (error) {
          // Back at the front, unless newer words of the same note are already waiting.
          if (!queue.current.some((one) => one.note === next?.note)) queue.current.unshift(next)
          tries.current++
          saveFailed(who.current, error)
          retry.current = setTimeout(() => void pump(), retryIn(tries.current))
          return
        }
        if (tries.current && !queue.current.length) {
          tries.current = 0
          saveLanded(who.current)
        }
      }
    } finally {
      running.current = false
    }
  }
  // Back online or back to the window: words still waiting try again at once.
  useEffect(() => {
    const now = (): void => void (tries.current && queue.current.length && pump())
    window.addEventListener('online', now)
    window.addEventListener('focus', now)
    return () => {
      window.removeEventListener('online', now)
      window.removeEventListener('focus', now)
    }
  })

  // Something else wrote: with nothing of yours waiting, show what is there now.
  useEffect(() => {
    if (!id) return
    return window.api.captures.onChange(async () => {
      const note = open.current
      const idle = (): boolean => !!note && note === open.current && !note.editor.isDestroyed && !running.current && !queue.current.length && JSON.stringify(note.editor.getJSON()) === note.sent
      if (!note || !idle()) return
      const now = await notes.body(table, note.id)
      if (!idle() || JSON.stringify(now ?? null) === JSON.stringify(note.base ?? null)) return
      show(note, now)
    })
  }, [id, table])

  return {
    // The editor is built from what was read, so that is what its saves start from.
    ready: (editor) => {
      const { id: at, loaded: body } = read.current
      open.current = at ? { id: at, base: body, sent: JSON.stringify(editor.getJSON()), editor } : null
      if (open.current) seen.current = [open.current, ...seen.current.slice(0, 4)]
    },
    save: (body, editor) => {
      const note = editor ? seen.current.find((one) => one.editor === editor) : open.current
      if (!note) return
      // The words it already holds, with nothing else on the way: nothing to
      // save. An editor reports a note it has only opened (its own spelling of
      // the same words), and that is not an edit.
      if (!running.current && !queue.current.some((one) => one.note === note) && JSON.stringify(body) === note.sent) return
      // Only the newest words of a note need sending: older ones waiting are dropped.
      queue.current = [...queue.current.filter((one) => one.note !== note), { note, body }]
      // What this window read of it before is old now: Back reads it again.
      forget(note.id)
      void pump()
    }
  }
}
