import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Editor } from '@tiptap/core'
import { AppWindowIcon, CornerDownLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Pressed, Tip } from '@/components/vigil/ui'
import { EASE, shift, still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { keysHere, usePane } from '@/lib/split'

/**
 * A note moving between the main window and a small window of its own, as
 * one page (Arc's Little Arc): ⌘O sends the open note out, and ⌘O in its
 * window ("Open in Vigil") brings it back. Going out, the window grows from
 * where the note was and the note lifts off the page, leaving a trace that
 * says where it went; coming back, the window glides onto the note's place
 * and fades into it. The caret and the place in the words go along both ways.
 * The window's glides are main/glide.ts; main/notes.ts runs the moves.
 */

type Box = { x: number; y: number; width: number; height: number }
type Carry = { from: number; to: number; top: number | null }

/** In a note's own window, the note it holds ('capture:id'); null anywhere else. */
export const noteWindowLink = (): string | null => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('note'))
const idOf = (link: string): string => link.slice(link.indexOf(':') + 1)

// --- which notes are away in a window of their own, as this window knows it

const away = new Set<string>()
const told = new Set<() => void>()
const mark = (id: string, on: boolean): void => {
  if (away.has(id) === on) return
  if (on) away.add(id)
  else away.delete(id)
  told.forEach((tell) => tell())
}
const follow = (tell: () => void): (() => void) => (told.add(tell), () => void told.delete(tell))
const useAway = (id: string): boolean => useSyncExternalStore(follow, () => away.has(id))

// The last row pressed, for a note opened from it to grow from there.
let pressed: { at: number; el: Element } | null = null
if (typeof window !== 'undefined') {
  addEventListener('pointerdown', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-row], [data-id], [role="option"], [role="row"], li, a, button') : null
    pressed = el ? { at: Date.now(), el } : null
  }, true)
  addEventListener('vigil:opened-apart', (event) => mark((event as CustomEvent<string>).detail, true))
  addEventListener('vigil:apart', (event) => {
    const { what, link } = (event as CustomEvent<{ what: string; link: string }>).detail
    if (what === 'closed') mark(idOf(link), false)
    else if (what === 'carry') void land(link)
    else if (what === 'promote' && link === noteWindowLink()) void openInVigil()
  })
}

// --- the caret and the place in the words

const editorIn = (root: Element | null): Editor | null =>
  ((root?.querySelector('.ProseMirror') as (Element & { editor?: Editor }) | null)?.editor ?? null)
/** The box that scrolls the words: the nearest one above them that can. */
const scrollerOf = (el: Element): HTMLElement | null => {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight + 1) return at
  }
  return null
}
const carryOf = (root: Element | null): Carry | null => {
  const editor = editorIn(root)
  if (!editor || editor.isDestroyed) return null
  const { from, to } = editor.state.selection
  const dom = editor.view.dom.getBoundingClientRect()
  const scroller = scrollerOf(editor.view.dom)
  const view = scroller?.getBoundingClientRect()
  const top = view && view.top > dom.top ? (editor.view.posAtCoords({ left: dom.left + Math.min(48, dom.width / 2), top: view.top + 16 })?.pos ?? null) : null
  return { from, to, top }
}
/** Put the caret and the place back in the editor under `root`, once there is one: frame by frame, a second at most. */
const putBack = (root: () => Element | null, carry: Carry): Promise<void> =>
  new Promise((done) => {
    let tries = 0
    const put = (): void => {
      const editor = editorIn(root())
      if (!editor || editor.isDestroyed) return void (++tries < 60 ? requestAnimationFrame(put) : done())
      const size = editor.state.doc.content.size
      const clamp = (n: number): number => Math.max(0, Math.min(size, n))
      try {
        editor.chain().setTextSelection({ from: clamp(carry.from), to: clamp(carry.to) }).focus(null, { scrollIntoView: false }).run()
        const scroller = scrollerOf(editor.view.dom)
        if (scroller && carry.top !== null) scroller.scrollTop += editor.view.coordsAtPos(clamp(carry.top)).top - scroller.getBoundingClientRect().top - 16
      } catch {
        // The words changed shape on the way: the note is open, just not at the same place.
      }
      done()
    }
    put()
  })

// --- the two moves

/** The note's place in this window: the page it is drawn on, not the trace. */
const holderOf = (id: string): HTMLElement | null => {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-apart-note="${CSS.escape(id)}"] > :not([data-apart-trace])`)].filter((one) => one.offsetParent)
  const front = document.querySelector('[data-pane-front]')
  return all.find((one) => front?.contains(one)) ?? all[0] ?? null
}

/**
 * Out to a window of its own (⌘-click on a row, ⌘O on an open note): its
 * words saved first, the window grown from the note (or the row it was
 * opened from), and the note lifting off the page here before its trace
 * takes the place.
 */
export function openApart(type: string, id: string): void {
  const page = holderOf(id)
  const row = pressed && Date.now() - pressed.at < 2000 && pressed.el.isConnected ? pressed.el : null
  const from = (page ?? row)?.getBoundingClientRect()
  window.dispatchEvent(new Event('mindflow:flush'))
  const carry = carryOf(page)
  chime('window')
  void window.api.vigil('notes:window', type === 'capture' ? 'capture' : type, id, from ? { x: from.x, y: from.y, width: from.width, height: from.height } : null, carry)
  const gone = (): void => void window.dispatchEvent(new CustomEvent('vigil:opened-apart', { detail: id }))
  if (!page || still()) return gone()
  page.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97) translateY(-6px)' }], { duration: 150, easing: `cubic-bezier(${EASE.join(',')})`, fill: 'forwards' })
    .finished.then(gone, gone)
}

/** ⌘O in a note's own window: back into the main window, the same page, caret and all. */
export async function openInVigil(): Promise<void> {
  window.dispatchEvent(new Event('mindflow:flush'))
  const carry = carryOf(document.querySelector('.note-pane'))
  chime('homeward')
  await window.api.vigil('notes:promote', carry)
}

/** The main window, sent a note that came back: says where it sits, for its window to glide onto, then takes the caret. */
async function land(link: string): Promise<void> {
  const id = idOf(link)
  let box: Box | null = null
  for (let tries = 0; tries < 50 && !box; tries++) {
    await new Promise((next) => requestAnimationFrame(next))
    const page = holderOf(id)
    const rect = page?.getBoundingClientRect()
    if (rect && rect.width > 40) box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
  void window.api.vigil('notes:landed', link, box)
  const carry = await window.api.vigil<Carry | null>('notes:carried', link)
  if (carry) await putBack(() => holderOf(id), carry)
}

/** A note's own window, just opened: the caret and the place it was carried with. */
export function useCarriedHere(link: string): void {
  useEffect(() => {
    void window.api.vigil<Carry | null>('notes:carried', link).then((carry) => carry && putBack(() => document.querySelector('.note-pane'), carry))
  }, [link])
  // ⌘O: back into the main window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.code !== 'KeyO') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      void openInVigil()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

// --- where the note was

/**
 * Around an open note's page, in the main window: while the note is in a
 * window of its own, its place says so, with a way to that window and a way
 * back; once that window closes the note is here again, read afresh first
 * (`onBack`) so it shows the words written over there. ⌘O moves it either
 * way. In the note's own window it is only the page.
 */
export function Apart({ type, id, title, hidden = false, onBack, children }: {
  type: string
  id: string
  title?: string | null
  /** A private note: its name is blurred with the rest. */
  hidden?: boolean
  /** Read the note again, for when it comes back. */
  onBack?: () => Promise<unknown> | void
  children: ReactNode
}): React.JSX.Element {
  const inWindow = noteWindowLink() !== null
  const gone = useAway(id) && !inWindow
  const pane = usePane()
  // Coming back, the trace holds the place until the note has been read again.
  const [returning, setReturning] = useState(false)
  const was = useRef(gone)
  const back = useRef(onBack)
  back.current = onBack
  useLayoutEffect(() => {
    if (was.current && !gone && back.current) {
      setReturning(true)
      void Promise.resolve(back.current()).catch(() => undefined).finally(() => setReturning(false))
    }
    was.current = gone
  }, [gone])
  const out = gone || returning
  useEffect(() => {
    if (inWindow) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.code !== 'KeyO' || event.repeat) return
      if (!keysHere(pane) || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const here = document.querySelector<HTMLElement>(`[data-apart-note="${CSS.escape(id)}"] > *`)
      if (!here?.offsetParent) return
      event.preventDefault()
      event.stopPropagation()
      if (out) bringBack(type, id)
      else openApart(type, id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [inWindow, out, pane, type, id])
  if (inWindow) return <>{children}</>
  return (
    <div className="contents" data-apart-note={id}>
      {out ? <Trace type={type} id={id} title={title ?? null} hidden={hidden} /> : children}
    </div>
  )
}

const bringBack = (type: string, id: string): void =>
  void window.api.vigil<boolean>('notes:bring-back', `${type === 'capture' ? 'capture' : type}:${id}`).then((sent) => sent || mark(id, false))

function Trace({ type, id, title, hidden }: { type: string; id: string; title: string | null; hidden: boolean }): React.JSX.Element {
  return (
    <motion.div data-apart-trace
      initial={{ opacity: 0, transform: shift('translateY(6px)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      transition={{ duration: 0.22, ease: EASE, delay: 0.04 }}
      className="flex min-h-[22rem] min-w-0 flex-[1.4] flex-col items-center justify-center gap-5 px-8 text-center @[56rem]/page:border-l">
      <span className="flex size-11 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
        <AppWindowIcon className="size-5" strokeWidth={1.6} />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-[15px] leading-snug font-semibold text-foreground">
          {title ? <><span data-private={hidden ? '' : undefined} className="private-text">“{title}”</span> is open in its own window</> : 'This note is open in its own window'}
        </p>
        <p className="text-sm leading-relaxed text-foreground/75">Write there, or bring it back here with the caret where you left it.</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Tip label="Bring its window to the front">
          <Button variant="outline" size="lg" data-apart-show onClick={() => (chime('tap'), void window.api.vigil('notes:window', type === 'capture' ? 'capture' : type, id))}>
            <AppWindowIcon />Show its window
          </Button>
        </Tip>
        <Button size="lg" data-apart-back onClick={() => bringBack(type, id)} className="gap-1.5">
          <CornerDownLeftIcon />Bring it back
          <Pressed keys="⌘O" className="ml-1 h-[18px] min-w-[18px] rounded-[5px] border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground" />
        </Button>
      </div>
    </motion.div>
  )
}
