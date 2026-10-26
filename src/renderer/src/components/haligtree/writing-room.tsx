import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { useCounts } from '@/components/count/word-count'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { WriterTools, useFocus, useFocusBand, type Focus } from './writer-tools'

/**
 * The writing room: the page you are writing on, over the whole window, with
 * only its words and their caption or title, and a quiet foot saying what it
 * is, how many words and how long you have been at it. ⇧⌘↵ or the "Writing
 * room" button goes in, Esc or ⇧⌘↵ comes out. Nothing is remounted: the page's
 * own editor is laid over the window (main.css, `[data-room]`), so the caret,
 * the undo history and the words stay as they are. Read through reads a list;
 * this writes one page.
 */
export function useWritingRoom(editor: Editor | null): { on: boolean; toggle: () => void; room: { 'data-room'?: '' }; focus: Focus } {
  const [on, setOn] = useState(false)
  // The focus band, if chosen, on this page in the room or out of it.
  useFocusBand(editor)
  const focus = useFocus()
  const toggle = (): void => setOn((was) => (chime(was ? 'fold' : 'open'), !was))
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mine = editor && !editor.isDestroyed && (editor.isFocused || on)
      if (!mine) return
      if (event.key === 'Enter' && event.metaKey && event.shiftKey) return void (event.preventDefault(), event.stopPropagation(), toggle())
      // Esc leaves, unless something over the page (a menu, the format bar's popover) is the one it closes.
      if (on && event.key === 'Escape' && !document.querySelector('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper], [data-proofing]')) {
        event.preventDefault()
        event.stopPropagation()
        toggle()
        editor?.commands.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // In, the caret goes back into the words; and the page scrolls to it.
  useEffect(() => {
    if (!on || !editor || editor.isDestroyed) return
    const frame = requestAnimationFrame(() => editor.commands.focus(undefined, { scrollIntoView: true }))
    document.documentElement.setAttribute('data-in-room', '')
    return () => (cancelAnimationFrame(frame), document.documentElement.removeAttribute('data-in-room'))
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
  return (
    <div data-room-foot className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
      <WriterTools editor={editor} proof={proof} live={live} />
      <span className="flex items-center justify-center gap-3">
      <span className="max-w-[24rem] truncate">{title}</span>
      <span aria-hidden>·</span>
      <span>{num(words)} {words === 1 ? 'word' : 'words'}</span>
      <span aria-hidden>·</span>
      <span>{minutes ? `${num(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}` : 'under a minute'}</span>
      <span aria-hidden>·</span>
      <span>Esc to leave</span>
      </span>
    </div>
  )
}
