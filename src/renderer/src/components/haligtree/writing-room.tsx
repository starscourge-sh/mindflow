import { useEffect, useLayoutEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { useCounts } from '@/components/count/word-count'
import { chime } from '@/lib/sound'
import { Kbd } from './ui'
import { num, plural } from '../../../../main/dates'
import { WriterTools, useFocus, useFocusBand, type Focus } from './writer-tools'
import { domOf } from '@/lib/editor-dom'
import { BlurEdge } from './blur-edge'

/**
 * The writing room: the page you are writing on, over the whole window, with
 * only its words and their caption or title, and a quiet foot saying what it
 * is, how many words and how long you have been at it. ⇧⌘↵ or the "Writing
 * room" button goes in, Esc or ⇧⌘↵ comes out. Nothing is remounted: the page's
 * own editor is laid over the window (main.css, `[data-room]`), so the caret,
 * the undo history and the words stay as they are. Read through reads a list;
 * this writes one page.
 */
/**
 * Something over the page that Esc should close first: a menu, a dialog or yes-or-no sheet, a popover or Proofread, open and on
 * screen. One left in the page but shut or hidden (a closed dialog kept mounted, an empty popper) is not one:
 * counted, it kept Esc from ever leaving the room.
 */
const overPage = (): boolean =>
  [...document.querySelectorAll<HTMLElement>('[role="menu"], [role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-proofing]')]
    .some((one) => one.getClientRects().length > 0 && one.getAttribute('data-state') !== 'closed' && getComputedStyle(one).visibility !== 'hidden' && !one.closest('[aria-hidden="true"], [hidden], [inert]'))

export function useWritingRoom(editor: Editor | null): { on: boolean; toggle: () => void; room: { 'data-room'?: '' }; focus: Focus } {
  const [on, setOn] = useState(false)
  // The focus band, if chosen: in the room only.
  const focus = useFocus()
  useFocusBand(editor, on)
  const toggle = (): void => setOn((was) => (chime(was ? 'fold' : 'open'), !was))
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mine = editor && !editor.isDestroyed && (editor.isFocused || on)
      if (!mine) return
      if (event.key === 'Enter' && event.metaKey && event.shiftKey) return void (event.preventDefault(), event.stopPropagation(), toggle())
      // Esc leaves, unless something over the page (a menu, the format bar's popover) is the one it closes, or Vim
      // is in insert or visual mode: then Esc goes back to normal mode first, as in the read-through.
      const vim = domOf(editor)?.getAttribute('data-vim-mode')
      if (on && event.key === 'Escape' && !overPage() && !(vim && !/normal/i.test(vim))) {
        event.preventDefault()
        event.stopPropagation()
        toggle()
        editor?.commands.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // In, the caret goes back into the words; and the page scrolls to it. Before the first frame, so the room is never
  // drawn inside the page's frame for a frame.
  useLayoutEffect(() => {
    if (!on || !editor || editor.isDestroyed) return
    const frame = requestAnimationFrame(() => editor.commands.focus(undefined, { scrollIntoView: true }))
    // Each box the room sits in is named (data-room-way), so main.css lets it out of their frames. Asked of the page
    // as `:has([data-room])`, going in made the browser look again at every box in the window.
    const way: Element[] = []
    for (let up = domOf(editor)?.closest('[data-room]')?.parentElement; up && up !== document.documentElement; up = up.parentElement) (up.setAttribute('data-room-way', ''), way.push(up))
    document.documentElement.setAttribute('data-in-room', '')
    return () => (cancelAnimationFrame(frame), way.forEach((one) => one.removeAttribute('data-room-way')), document.documentElement.removeAttribute('data-in-room'))
  }, [on, editor])
  return { on, toggle, room: on ? { 'data-room': '' } : {}, focus }
}

/** The room's foot: the writer's tools, then what it is, its words, and the time spent writing, in a quiet line. */
export function RoomFoot({ editor, title, spent, proof, live = proof }: { editor: Editor | null; title: string; spent?: number; /** Proofread and the grammar line: Writing and the Journal. */ proof?: boolean; /** "Check as I write": Writing only. */ live?: boolean }): React.JSX.Element {
  const counts = useCounts(editor)
  const [since] = useState(Date.now)
  const [, tick] = useState(0)
  // The minutes move on once a minute, never per frame.
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
  const minutes = Math.round((spent ?? Date.now() - since) / 60_000)
  const words = counts?.words ?? 0
  // Out of the way while you write: it fades as you type and comes back as soon as the pointer moves.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    // A real move of the pointer brings it back, never a nudge of a hand resting on the trackpad.
    let from: { x: number; y: number } | null = null
    let quiet = false
    const typed = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.key.length !== 1) return
      quiet = true
      from = null
      setTyping(true)
    }
    const moved = (event: PointerEvent): void => {
      if (!quiet) return
      from ??= { x: event.clientX, y: event.clientY }
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) < 8) return
      quiet = false
      setTyping(false)
    }
    dom.addEventListener('keydown', typed)
    window.addEventListener('pointermove', moved)
    return () => (dom.removeEventListener('keydown', typed), window.removeEventListener('pointermove', moved))
  }, [editor])
  return (
    <div data-room-foot data-typing={typing || undefined} className="text-sm text-muted-foreground tabular-nums">
      <BlurEdge bar />
      {/* One quiet bar: what it is, how far, how long on the left; "How it reads", the tools and the way out on the right. */}
      <div className="relative mx-auto flex max-w-[46rem] items-center gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span data-room-title className="min-w-0 truncate">{title}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{num(words)} {words === 1 ? 'word' : 'words'}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{minutes ? `${plural(minutes, 'minute')}` : 'under a minute'}</span>
        </span>
        <span className="flex-1" />
        <WriterTools editor={editor} proof={proof} live={live} />
        <span className="flex shrink-0 items-center gap-1.5 pl-1"><Kbd>Esc</Kbd> to leave</span>
      </div>
    </div>
  )
}
