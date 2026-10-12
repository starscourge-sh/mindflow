import { dropLines, keepLines } from '@/lib/clue-lines'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import XIcon from '@/components/ui/x-icon'

import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { useLive, vigil, when, whenInLine, type Gloss } from '@/lib/vigil'
import { Kbd, Pressed, Rolling, Tip, toast } from './ui'
import { keepGloss, putBack, useGlossKey } from './gloss-line'

const ArrowUp = alive(ArrowNarrowUpIcon)
const History = alive(HistoryCircleIcon)
const Cancel = alive(XIcon)

// Which items have a composer on screen, so their details panel drops its own
// add-field rather than offering the same thing twice.
const shown = new Map<string, number>()
const heard = new Set<() => void>()
const tell = (): void => heard.forEach((one) => one())
/** Whether a composer for this item is on screen. */
export const useComposed = (id: string): boolean =>
  useSyncExternalStore((one) => (heard.add(one), () => void heard.delete(one)), () => (shown.get(id) ?? 0) > 0)

/**
 * The field for a thought, pinned under the page like a chat's: Enter keeps
 * what you wrote as a dated gloss (or, on a question, a clue). Its clock, or
 * ↑ in the empty field, opens what you wrote before, newest at the foot and
 * dated; click one to put its words right. ; and ⌘; bring the caret here.
 * Opaque, since nothing in the main window can blur what is under it.
 */
export function ThoughtBar({ id, clue = false, className }: {
  id: string
  /** A question's: what it keeps is a clue. */
  clue?: boolean
  className?: string
}): React.JSX.Element {
  const glosses = useLive(() => vigil.glosses(id), [] as Gloss[], [id])
  const past = [...glosses].reverse()
  const [words, setWords] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Gloss | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const name = clue ? 'clue' : 'thought'

  useGlossKey(id)
  useEffect(() => {
    shown.set(id, (shown.get(id) ?? 0) + 1)
    tell()
    return () => {
      shown.set(id, (shown.get(id) ?? 1) - 1)
      tell()
    }
  }, [id])
  useEffect(() => (setWords(''), setEditing(null), setOpen(false)), [id])
  // ; or ⌘;: the caret here, unless something held over the page (Read) has the keys.
  useEffect(() => {
    const onOpen = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== id) return
      const over = [...document.querySelectorAll('[role="dialog"]')].at(-1)
      if (over && !over.contains(root.current)) return
      if (document.activeElement !== field.current) chime('tap')
      field.current?.focus()
    }
    window.addEventListener('vigil:gloss', onOpen)
    return () => window.removeEventListener('vigil:gloss', onOpen)
  }, [id])
  // Opened, the newest is in view at the foot, as a chat opens.
  useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [open, past.length])

  const ready = words.trim().length > 0
  const stopEditing = (): void => (setEditing(null), setWords(''))
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    if (editing) {
      const was = editing
      setEditing(null)
      if (text === was.body) return
      void vigil.editGloss(was.id, text).then((done) => {
        if (!done) return
        chime('noted')
        toast(`Your ${name} is reworded`, () => void vigil.editGloss(was.id, was.body))
      })
      return
    }
    const back = (): void => putBack(field, setWords, text)
    if (!clue) return void keepGloss(id, text, back)
    // Written as a list: a clue a line, with one Undo.
    void keepLines(id, text).then((many) => {
      if (many) return (chime('clue'), toast(`${many.length} clues, a line each`, () => (void dropLines(many), back())))
      void vigil.addClue(id, text).then((made) => {
        chime('clue')
        toast('A clue, kept', made ? () => (void vigil.dropClue(made), back()) : undefined)
      })
    })
  }
  const toggle = (): void => {
    if (!past.length) return chime('nope')
    chime(open ? 'fold' : 'slide')
    setOpen(!open)
  }
  const edit = (one: Gloss): void => {
    chime('tap')
    setEditing(one)
    setWords(one.body)
    requestAnimationFrame(() => {
      const box = field.current
      if (!box) return
      box.focus()
      box.setSelectionRange(box.value.length, box.value.length)
    })
  }

  return (
    <div
      ref={root}
      data-gloss
      data-composer
      onClick={(event) => event.stopPropagation()}
      className={cn('mf-composer relative z-10 mx-auto w-full max-w-[40rem] text-control', className)}
    >
      <div className="group/composer overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-10px_rgb(0_0_0/0.25)] transition-[border-color] duration-150 focus-within:border-foreground/25">
        {open && past.length > 0 && (
          <ol ref={list} aria-label={clue ? 'Clues so far' : 'Thoughts so far'} className="max-h-[min(18rem,40vh)] overflow-y-auto border-b px-2 py-2">
            {past.map((one) => (
              <li key={one.id}>
                <button
                  type="button"
                  onClick={() => edit(one)}
                  className={cn('flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-accent', editing?.id === one.id && 'bg-accent')}
                >
                  <span className="private-text w-full whitespace-pre-line wrap-break-word text-foreground">{one.body}</span>
                  <span className="text-meta text-muted-foreground tabular-nums">{when(one.createdAt)}{one.author === 'ai' ? ' · written by AI' : ''}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {editing && (
          <div className="flex items-center gap-2 px-3.5 pt-2 text-meta text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">Rewording your {name} from {whenInLine(editing.createdAt)}</span>
            <Tip label={<span className="flex items-center gap-2">Leave it as it was<Kbd>Esc</Kbd></span>}>
              <button type="button" aria-label="Stop rewording" onClick={() => (chime('fold'), stopEditing())} className="flex size-5 items-center justify-center rounded-md hover:bg-accent hover:text-foreground">
                <Cancel className="size-3" />
              </button>
            </Tip>
          </div>
        )}
        <div onClick={() => field.current?.focus()} className="flex cursor-text items-end gap-1.5 py-2 pr-2 pl-2">
          <Tip label={past.length ? (open ? `Hide your ${name}s` : `Your ${name}s so far`) : `No ${name}s yet`}>
            <button
              type="button"
              aria-label={clue ? 'Clues so far' : 'Thoughts so far'}
              aria-expanded={open}
              onClick={(event) => (event.stopPropagation(), toggle())}
              className={cn('mb-0.5 flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-meta text-muted-foreground hover:bg-accent hover:text-foreground', open && 'bg-accent text-foreground', !past.length && 'opacity-50')}
            >
              <History className="size-3.5" />
              {past.length > 0 && <Rolling text={past.length} className="tabular-nums" />}
            </button>
          </Tip>
          <textarea
            ref={field}
            rows={1}
            value={words}
            placeholder={editing ? `Reword your ${name}` : clue ? 'Add a clue…' : 'Add a thought…'}
            aria-label={clue ? 'Add a clue' : 'Add a thought'}
            onChange={(event) => setWords(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                keep()
              }
              // ↑ in an empty field: what you wrote before.
              else if (event.key === 'ArrowUp' && !words && !open && past.length) {
                event.preventDefault()
                chime('slide')
                setOpen(true)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                chime('fold')
                if (editing) return stopEditing()
                if (open) return setOpen(false)
                setWords('')
                field.current?.blur()
              }
            }}
            className={cn(ready && 'private-text', 'max-h-40 min-h-7 min-w-0 flex-1 resize-none self-center bg-transparent py-1 pl-1 text-control text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground')}
          />
          {!ready && <span className="mb-1.5 flex shrink-0 group-focus-within/composer:hidden"><Pressed keys=";" /></span>}
          <Tip label={<span className="flex items-center gap-2">{editing ? 'Keep the new words' : clue ? 'Keep the clue' : 'Keep it'}<Kbd>↵</Kbd></span>}>
            <button
              type="button"
              aria-label={clue ? 'Keep clue' : 'Keep thought'}
              disabled={!ready}
              onClick={(event) => (event.stopPropagation(), keep())}
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150 active:scale-95',
                ready ? 'bg-foreground text-background hover:bg-foreground/85' : 'bg-muted text-muted-foreground/60'
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  )
}

/**
 * Where the composer sits under an open note: at the foot of its column,
 * outside the words' own scrolling, so it never covers a line. In a narrow
 * pane, where the whole pane scrolls, it holds to the bottom of the view.
 */
export function ThoughtDock({ id, clue, hidden }: { id: string; clue?: boolean; hidden?: boolean }): React.JSX.Element | null {
  if (hidden) return null
  return (
    <div className="sticky bottom-0 z-10 shrink-0 bg-background px-4 pt-2 pb-3">
      <ThoughtBar id={id} clue={clue} />
    </div>
  )
}
