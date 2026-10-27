import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'
import { NoteList } from '@/components/note-link/note-link-menu'
import type { SuggestionListHandle } from '@/components/suggestion/suggestion-renderer'
import type { NoteSuggestion } from '@/extensions/note-link'
import { findCaptures } from '@/lib/capture-links'
import { listDirection } from '@/lib/menu-keys'
import { chime, click } from '@/lib/sound'
import type { Task } from '@/lib/haligtree'
import { FileText } from 'lucide-react'
import { hoverNote } from './note-preview'

/** An @ and what is typed after it, up to the caret: from the line's start or after a space, on one line. */
const ASKED = /(?:^|\s)@([^@\n]{0,40})$/

/** The note a line was linked to with @, and the words it was put in as, to read back as plain words. */
export type AtLink = { id: string; plain: { from: number; to: number }[] }

/**
 * @ in a plain line, as in a note: Today's new lines and the box for
 * tomorrow. The note editor's own @ menu, its rows and its keys, with notes
 * only. Picked, the note's name takes the place of the @ and what was typed,
 * and the line, once it is a task, is made from that note: the task carries
 * its name and opens it, as a task made from a note does.
 *
 * `input` reads the field after each change, `keys` gives the menu the keys
 * it uses (true when it took one), `linkOf` says what a line's words are
 * linked to as it becomes a task, and `menu` is the menu, drawn over the page.
 */
export function useAtNotes(): {
  input: (field: HTMLTextAreaElement) => void
  keys: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  close: () => void
  linkOf: (field: HTMLTextAreaElement | null, words: string) => AtLink | undefined
  menu: React.ReactNode
} {
  const [asked, setAsked] = useState<{ field: HTMLTextAreaElement; from: number; to: number; query: string } | null>(null)
  const [items, setItems] = useState<NoteSuggestion[]>([])
  const list = useRef<SuggestionListHandle>(null)
  // The note each field's words were linked to, until the line is made.
  const picked = useRef(new WeakMap<HTMLTextAreaElement, NoteSuggestion>())

  // The notes for what is typed, as the editor's @ finds them: notes only, since a task is made from a note.
  const query = asked?.query
  useEffect(() => {
    if (query === undefined) return setItems([])
    let current = true
    void findCaptures(query).then((rows) => current && setItems(rows.filter((row) => !row.id.includes(':')).slice(0, 8)))
    return () => void (current = false)
  }, [query])

  const close = (): void => setAsked(null)
  // Scrolled, the menu would point at nothing: it goes, as the editor's does. Typing brings it back.
  useEffect(() => {
    if (!asked) return
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [asked])

  const input = (field: HTMLTextAreaElement): void => {
    const caret = field.selectionStart
    const found = field.selectionEnd === caret ? ASKED.exec(field.value.slice(0, caret)) : null
    if (!found) return close()
    if (!asked) chime('open')
    setAsked({ field, from: caret - found[1].length - 1, to: caret, query: found[1] })
  }

  const pick = (note: NoteSuggestion): void => {
    if (!asked) return
    const { field, from, to } = asked
    const name = note.label || 'Untitled'
    field.focus()
    field.setSelectionRange(from, to)
    // Typed in as if by hand: heard by the field (a held line hears its change) and taken back by ⌘Z.
    document.execCommand('insertText', false, `${name} `)
    picked.current.set(field, { ...note, label: name })
    chime('settled')
    close()
  }

  const keys = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!asked || !items.length) return false
    if (event.key === 'Escape') return (close(), true)
    // The editor's menu reads only the key from what it is handed.
    const taken = list.current?.onKeyDown({ event: event.nativeEvent } as SuggestionKeyDownProps) ?? false
    if (taken && listDirection(event.nativeEvent)) click('soft')
    return taken
  }

  const linkOf = (field: HTMLTextAreaElement | null, words: string): AtLink | undefined => {
    const note = field ? picked.current.get(field) : undefined
    if (!field || !note) return undefined
    picked.current.delete(field)
    const at = words.indexOf(note.label)
    // The name taken back out of the words: the line is no longer about that note.
    return at < 0 ? undefined : { id: note.id, plain: [{ from: at, to: at + note.label.length }] }
  }

  const box = asked?.field.isConnected ? asked.field.getBoundingClientRect() : null
  const menu = asked && box && items.length > 0 ? createPortal(
    // Pressed, the line keeps the caret: a click picks rather than leaving the line, which would make it a task.
    <div data-at-notes className="tiptap-suggestion-popup fixed" style={{ left: box.left, top: box.bottom + 4 }} onMouseDown={(event) => event.preventDefault()}>
      <NoteList ref={list} items={items} command={pick} />
    </div>,
    document.body
  ) : null

  return { input, keys, close, linkOf, menu }
}

/** The note a line was made from, by name, a click away: a line linked with @, or made from a note. */
export function FromNote({ task }: { task: Task }): React.JSX.Element | null {
  if (!task.captureId || task.fromId !== task.captureId || !task.fromTitle) return null
  return (
    <button type="button" data-from-note={task.captureId} onClick={() => (chime('open'), window.api.openInHome('capture', task.captureId!))}
      {...hoverNote('capture', task.captureId)}
      className="mf-hit relative mt-0.5 flex max-w-full items-center gap-1 text-control font-medium text-muted-foreground hover:text-foreground">
      <FileText aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate underline decoration-foreground/20 underline-offset-2">{task.fromTitle}</span>
    </button>
  )
}
