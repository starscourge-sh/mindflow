import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { checkingLive, findings, type Finding } from '@/lib/grammar'
import { chime } from '@/lib/sound'

/**
 * Proofread, for a page of Writing only (never the Journal, the Inbox, gems or
 * notes): Harper's findings one at a time, the words marked on the page and a
 * plain reason under them. Tab takes the fix, Esc skips it, and it ends with
 * "Clean." With "Check as I write" on, what it finds is underlined in its own
 * hue, after a pause in the typing, never while the words are coming.
 */
const key = new PluginKey<{ live: DecorationSet; current: DecorationSet }>('grammar')
const marks = (doc: Parameters<typeof DecorationSet.create>[0], list: Finding[], className: string): DecorationSet =>
  DecorationSet.create(doc, list.filter((one) => one.to > one.from && one.to <= doc.content.size).map((one) => Decoration.inline(one.from, one.to, { class: className, 'data-grammar': one.reason })))
const plugin = (): Plugin => new Plugin({
  key,
  state: {
    init: () => ({ live: DecorationSet.empty, current: DecorationSet.empty }),
    apply: (tr, was) => {
      const said = tr.getMeta(key) as { live?: Finding[]; current?: Finding | null } | undefined
      let { live, current } = was
      // Typing clears the underlines near it at once; the rest move with the words.
      live = tr.docChanged ? DecorationSet.empty : live.map(tr.mapping, tr.doc)
      current = current.map(tr.mapping, tr.doc)
      if (said?.live) live = marks(tr.doc, said.live, 'mf-grammar')
      if (said && 'current' in said) current = said.current ? marks(tr.doc, [said.current], 'mf-proofing') : DecorationSet.empty
      return { live, current }
    }
  },
  props: { decorations: (state) => { const one = key.getState(state); return one ? DecorationSet.create(state.doc, [...one.live.find(), ...one.current.find()]) : null } }
})

export function Proofread({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [state, setState] = useState<{ list: Finding[]; at: number } | 'loading' | 'clean' | null>(null)
  const live = useRef(checkingLive())
  const [, redraw] = useState(0)
  const mark = (current: Finding | null): void => void (editor && !editor.isDestroyed && editor.view.dispatch(editor.state.tr.setMeta(key, { current })))
  // The marks, on this editor while it is a page of Writing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.registerPlugin(plugin())
    return () => void (!editor.isDestroyed && editor.unregisterPlugin(key))
  }, [editor])
  const show = (list: Finding[], at: number): void => {
    const one = list[at]
    if (!one) return void (mark(null), setState('clean'), chime('done'))
    mark(one)
    setState({ list, at })
    editor?.commands.setTextSelection({ from: one.from, to: one.from })
    editor?.commands.scrollIntoView()
  }
  // Started from the writing room's tools or the page's menu.
  useEffect(() => {
    if (!editor) return
    const start = (): void => {
      setState('loading')
      void findings(editor.state.doc).then((list) => show(list, 0), () => setState(null))
    }
    window.addEventListener('haligtree:proofread', start)
    return () => window.removeEventListener('haligtree:proofread', start)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Clean." stays a moment, then goes.
  useEffect(() => {
    if (state !== 'clean') return
    const gone = setTimeout(() => setState(null), 1800)
    return () => clearTimeout(gone)
  }, [state])
  // Tab takes the fix, Esc skips; before anything else hears them (the writing room's Esc, the editor's Tab).
  useEffect(() => {
    if (!editor || !state || typeof state === 'string') return
    const onKey = (event: KeyboardEvent): void => {
      const one = state.list[state.at]
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation()
        chime('tick')
        return show(state.list, state.at + 1)
      }
      if (event.key !== 'Tab' || event.shiftKey) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (one.replacement === null) return show(state.list, state.at + 1)
      editor.chain().insertContentAt({ from: one.from, to: one.to }, one.replacement).run()
      chime('tap')
      const past = one.from + one.replacement.length
      void findings(editor.state.doc).then((list) => { const next = list.findIndex((later) => later.from >= past); show(list, next < 0 ? list.length : next) })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editor, state]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Check as I write": a pause of a second and a half, then the page is read through.
  useEffect(() => {
    const changed = (): void => (live.current = checkingLive(), redraw((n) => n + 1))
    window.addEventListener('haligtree:grammar-live', changed)
    return () => window.removeEventListener('haligtree:grammar-live', changed)
  }, [])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (): void => void (live.current ? findings(editor.state.doc).then((list) => !editor.isDestroyed && editor.view.dispatch(editor.state.tr.setMeta(key, { live: list }))) : editor.view.dispatch(editor.state.tr.setMeta(key, { live: [] })))
    const typed = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (!transaction.docChanged) return
      clearTimeout(timer)
      if (live.current) timer = setTimeout(check, 1500)
    }
    editor.on('transaction', typed)
    if (live.current) timer = setTimeout(check, 400)
    else check()
    return () => (clearTimeout(timer), void editor.off('transaction', typed))
  }, [editor, live.current]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null
  const run = typeof state === 'string' ? null : state
  const one = run?.list[run.at]
  return createPortal(
    <div data-proofing={typeof state === 'string' ? state : 'one'} role="status" className="fixed inset-x-0 bottom-28 z-[70] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex max-w-[40rem] items-center gap-3 rounded-xl bg-popover px-4 py-2.5 text-body text-popover-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.3)] ring-1 ring-foreground/10">
        {state === 'loading' && <span className="text-muted-foreground">Reading it through…</span>}
        {state === 'clean' && <span data-proof-clean>Clean.</span>}
        {one && (
          <>
            <span className="min-w-0">
              <span className="text-muted-foreground line-through decoration-foreground/30">{one.text.trim() || '·'}</span>
              {one.replacement !== null && <> <span aria-hidden className="text-muted-foreground">→</span> <span data-proof-fix className="font-medium">{one.replacement || 'remove it'}</span></>}
              <span data-proof-reason className="ml-2 text-muted-foreground">{one.reason}</span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
              <span className="tabular-nums">{run!.at + 1} of {run!.list.length}</span>
              {one.replacement !== null && <><kbd className="rounded border border-foreground/15 px-1">Tab</kbd> takes it</>}
              <kbd className="rounded border border-foreground/15 px-1">Esc</kbd> skips
            </span>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
