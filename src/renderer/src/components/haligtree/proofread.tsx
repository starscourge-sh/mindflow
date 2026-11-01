import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { checkingLive, findings, type Finding } from '@/lib/grammar'
import { chime } from '@/lib/sound'
import { Kbd } from './ui'
import { num } from '../../../../main/dates'

/**
 * Proofread, for a page of Writing, a Journal day, a capture or a gem (when asked): Harper's findings one at a time,
 * misspellings among them, the words marked on the page and the reason and fix right under them. Tab takes the fix,
 * ↓ skips, Esc stops; its button says how many ("Proofread · 7"), and a page with none says "Nothing to fix" until
 * dismissed. With "Check as I write" on, what it finds is underlined in its own hue, after a pause in the typing.
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

export function Proofread({ editor, ask = false }: { editor: Editor | null; /** Only when asked (the Journal): never checking as you write, never marking the page meanwhile. */ ask?: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<{ list: Finding[]; at: number } | 'loading' | 'clean' | null>(null)
  const live = useRef(!ask && checkingLive())
  const [, redraw] = useState(0)
  const mark = (current: Finding | null): void => void (editor && !editor.isDestroyed && editor.view.dispatch(editor.state.tr.setMeta(key, { current })))
  // The marks, on this editor while it is a page of Writing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.registerPlugin(plugin())
    return () => void (!editor.isDestroyed && editor.unregisterPlugin(key))
  }, [editor])
  // How many it found, for the "Proofread · 7" on its button (writer-tools.tsx); null when it is not running.
  const count = (n: number | null): void => void window.dispatchEvent(new CustomEvent('haligtree:proofread-count', { detail: n }))
  const show = (list: Finding[], at: number): void => {
    const one = list[at]
    count(list.length)
    if (!one) return void (mark(null), setState('clean'), chime('done'))
    mark(one)
    setState({ list, at })
    editor?.commands.setTextSelection({ from: one.from, to: one.from })
    editor?.commands.scrollIntoView()
  }
  // Which reading is still wanted: Esc while it reads, or a second ask, leaves an earlier one unshown. (Showing it from
  // inside a state updater lost the result, so it stayed "Reading it through…" for good.)
  const asked = useRef(0)
  // Started from the writing room's tools or the page's menu.
  useEffect(() => {
    if (!editor) return
    const start = (): void => {
      const one = ++asked.current
      setState('loading')
      void findings(editor.state.doc, true).then((list) => one === asked.current && show(list, 0), () => one === asked.current && (setState(null), count(null)))
    }
    window.addEventListener('haligtree:proofread', start)
    return () => (window.removeEventListener('haligtree:proofread', start), count(null))
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  // Where the finding is on the page, so its reason and fix sit right under the marked words, following them as the page scrolls.
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null)
  const current = state && typeof state !== 'string' ? state.list[state.at] : null
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || !current) return void setSpot(null)
    const place = (): void => {
      try {
        const at = editor.view.coordsAtPos(Math.min(current.from, editor.state.doc.content.size))
        setSpot({ left: Math.max(16, Math.min(at.left - 12, window.innerWidth - 16 - 640)), top: at.bottom + 10 })
      } catch { setSpot(null) }
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => (window.removeEventListener('scroll', place, true), window.removeEventListener('resize', place))
  }, [editor, current])
  // Tab takes the fix, ↓ skips to the next, Esc stops proofreading (still reading it through, too); before anything
  // else hears them (the writing room's Esc, the editor's Tab). Esc used to skip, so on a long page with hundreds of
  // findings it could not get you out of Proofread, nor out of the writing room behind it.
  useEffect(() => {
    if (!editor || !state) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation()
        chime('fold')
        asked.current++
        return void (mark(null), setState(null), count(null))
      }
      if (typeof state === 'string') return
      const one = state.list[state.at]
      if (event.key === 'ArrowDown' && !event.metaKey && !event.altKey && !event.shiftKey) {
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
      void findings(editor.state.doc, true).then((list) => { const next = list.findIndex((later) => later.from >= past); show(list, next < 0 ? list.length : next) })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editor, state]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Check as I write": a pause of a second and a half, then the page is read through.
  useEffect(() => {
    const changed = (): void => (live.current = !ask && checkingLive(), redraw((n) => n + 1))
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
  const cap = (label: string): React.JSX.Element => <Kbd>{label}</Kbd>
  const card = 'pointer-events-auto flex max-w-[40rem] flex-col gap-1.5 rounded-xl bg-popover px-4 py-3 text-body text-popover-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--mf-shadow-ink)_30%,transparent)] ring-1 ring-foreground/10'
  return createPortal(
    one && spot ? (
      <div data-proofing="one" role="status" style={{ left: spot.left, top: spot.top }} className={`fixed z-[70] ${card}`}>
        <span className="min-w-0">
          <span className="text-muted-foreground line-through decoration-foreground/30">{one.text.trim() || '·'}</span>
          {one.replacement !== null && <> <span aria-hidden className="text-muted-foreground">→</span> <span data-proof-fix className="font-medium">{one.replacement || 'remove it'}</span></>}
          <span data-proof-reason className="ml-2 text-foreground/70">{one.reason}</span>
        </span>
        <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <span className="mr-1.5 tabular-nums">{num(run!.at + 1)} of {num(run!.list.length)}</span>
          {one.replacement !== null && <>{cap('Tab')} takes it<span className="w-1.5" /></>}
          {cap('↓')} skips<span className="w-1.5" />
          {cap('Esc')} stops
        </span>
      </div>
    ) : (
      <div data-proofing={typeof state === 'string' ? state : 'one'} role="status" className="fixed inset-x-0 bottom-28 z-[70] flex justify-center px-4 pointer-events-none">
        <div className={card}>
          {state === 'loading' && <span className="flex items-center gap-1.5 text-muted-foreground">Reading it through for spelling, grammar and style… {cap('Esc')} stops</span>}
          {state === 'clean' && <span data-proof-clean className="flex items-center gap-1.5">Nothing to fix: no spelling, grammar or style slips found. <span className="ml-1.5 flex items-center gap-1.5 text-meta text-muted-foreground">{cap('Esc')} closes</span></span>}
        </div>
      </div>
    ),
    document.body
  )
}
