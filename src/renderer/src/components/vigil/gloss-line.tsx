import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import MessageCircleIcon from '@/components/ui/message-circle-icon'
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon'

import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, when, type Gloss } from '@/lib/vigil'
import { cn } from '@/lib/cn'
import { Island, Kbd, Rolling, Tip, toast, typing, Pressed } from './ui'
import { Term } from './term'
import { GhostText } from './ghost'
import { ago } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const MessageSquareText = alive(MessageCircleIcon)
const ArrowUp = alive(ArrowNarrowUpIcon)

/**
 * A gloss: what an item means to you, written the moment you bump into it.
 * The body is what the thing is; a gloss is your reaction to it, dated, one
 * row each, so past-you stays readable beside present-you. This one quiet
 * line goes wherever an item shows (hint cards, rot cards, search, Read,
 * Review, Today, Kept), because a thought that costs a trip to the detail
 * view is a thought lost.
 */

export { ago }

const said = (one: Gloss): string => `${one.author === 'ai' ? 'AI note' : 'Your note'}, ${ago(one.createdAt)}:`

/** Open the gloss line for this item, wherever it is on screen: what the ; key does. */
export const openGloss = (id: string): void => void window.dispatchEvent(new CustomEvent('vigil:gloss', { detail: id }))

/**
 * ; on the item in front of you (⌘; while a field has the keys): the one key
 * that starts a gloss on every surface that is driven by keys.
 */
export function useGlossKey(id: string | null | undefined, enabled = true): void {
  const latest = useRef(id)
  latest.current = id
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ';' || event.altKey || event.ctrlKey || event.defaultPrevented || !latest.current) return
      if (!event.metaKey && typing()) return
      event.preventDefault()
      openGloss(latest.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/**
 * ; on a list's row, with nothing open: a thought on the row under the cursor,
 * written under it in place, as Kept does. Hands back what the list draws
 * under each row. Off while a note is open, whose own page takes the key.
 */
export function useRowGloss(id: string | undefined, enabled = true, placeholder?: string): (entry: { id: string }) => ReactNode {
  const [glossing, setGlossing] = useState<string | null>(null)
  const latest = useRef(id)
  latest.current = id
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ';' || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || typing() || !latest.current) return
      event.preventDefault()
      chime('tap')
      setGlossing(latest.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
  return (entry) => (glossing === entry.id ? <GlossLine id={entry.id} open placeholder={placeholder} onDone={() => setGlossing(null)} className="px-2 pt-0.5 pb-1" /> : null)
}

/**
 * For a row with no room for the line: a small button on hover (inside a
 * `group/item`), top right, that opens the line under the row.
 */
export function GlossButton({ onClick, className }: { onClick: () => void; className?: string }): React.JSX.Element {
  return (
    <Tip label={<span className="flex items-center gap-2">Add a thought<Pressed keys=";" /></span>}>
      <button type="button" aria-label="Add a thought" onClick={(event) => (event.stopPropagation(), chime('tap'), onClick())}
        className={cn('absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100', className)}>
        <MessageSquareText className="size-3.5" />
      </button>
    </Tip>
  )
}

/** Keep a gloss, with its sound and a way back. */
export async function keepGloss(id: string, text: string): Promise<void> {
  const words = text.trim()
  if (!words) return
  const gloss = await vigil.gloss(id, words)
  chime('noted')
  toast('Your thought is kept, dated today', () => void vigil.dropGloss(gloss))
}

/**
 * The line itself: "Add a thought…", or the latest gloss faintly, until it
 * is clicked (or ; is pressed), when it opens into a field right where it
 * sits. Enter keeps it, Shift-Enter starts a second line, Escape lets it go.
 */
export function GlossLine({ id, className, placeholder = 'A thought on it, in your own words', latest = true, quiet = false, open = false, onDone, keys = ';' }: {
  id: string
  /** Takes no room until there is something to show: a gloss, or the field once ; or the row's menu opens it. */
  quiet?: boolean
  className?: string
  placeholder?: string
  /** Show the newest gloss when closed; off where the timeline is already in view. */
  latest?: boolean
  /** Opened already, as when its key was pressed before it was shown. */
  open?: boolean
  /** After it is kept or let go: hand the keys back to where they were. */
  onDone?: () => void
  /** The key that opens it here: ⌘; where a field has the keys. */
  keys?: string
}): React.JSX.Element {
  const glosses = useLive(() => vigil.glosses(id), [] as Gloss[], [id])
  const last = latest ? glosses[0] : undefined
  const [writing, setWriting] = useState(open)
  const [words, setWords] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => (setWriting(open), setWords('')), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onOpen = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== id) return
      // Something held over the page (Read, a drawer) has the keys: only a
      // line inside it answers, not the same item's line underneath.
      const over = [...document.querySelectorAll('[role="dialog"]')].at(-1)
      if (over && !over.contains(root.current)) return
      chime('tap')
      setWriting(true)
      requestAnimationFrame(() => field.current?.focus())
    }
    window.addEventListener('vigil:gloss', onOpen)
    return () => window.removeEventListener('vigil:gloss', onOpen)
  }, [id])

  const close = (): void => (setWriting(false), setWords(''), onDone?.())
  const keep = (): void => {
    const text = words.trim()
    if (!text) return close()
    close()
    void keepGloss(id, text)
  }

  return (
    // Keys typed here are the field's, never the list's or the window's.
    // Quiet and empty: no line at all, not an invisible one holding a gap open.
    <div ref={root} data-gloss className={cn('min-w-0 text-xs', quiet && !last && !writing && 'hidden', className)} onKeyDown={(event) => writing && event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {/* ; opens the field and you type straight away, so the line gives way
          at once: waiting on its fade made the field turn up late and the
          first letters went missing. */}
      <AnimatePresence mode="wait" initial={false}>
        {writing ? (
          <motion.label
            key="writing"
            initial={{ opacity: 0, transform: shift('translateY(-2px)') }}
            animate={{ opacity: 1, transform: shift('translateY(0px)') }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.16, ease: EASE }}
            className="flex items-start gap-2 rounded-lg border bg-accent/30 px-2.5 py-1.5 focus-within:border-foreground/25"
          >
            <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <textarea
              ref={field}
              autoFocus
              rows={1}
              value={words}
              placeholder={placeholder}
              aria-label="Add a thought"
              onChange={(event) => setWords(event.target.value)}
              onBlur={() => !words.trim() && close()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  keep()
                }
                // Closes the field only, never the window or the card behind it.
                if (event.key === 'Escape') {
                  event.preventDefault()
                  chime('fold')
                  close()
                }
              }}
              className="max-h-24 min-w-0 flex-1 resize-none bg-transparent text-control text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground"
            />
            {words.trim() && <Kbd className="mt-px shrink-0">↵</Kbd>}
          </motion.label>
        ) : (
          <motion.button
            key="closed"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0.12 }}
            onClick={() => (chime('tap'), setWriting(true))}
            title={last ? `${said(last)} ${last.body}` : undefined}
            className="group/gloss flex w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <MessageSquareText className="size-3.5 shrink-0" />
            {last ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground/70">{said(last)} </span>
                <span className="private-text">{last.body}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate">Add a thought…</span>
            )}
            {last && <span className="shrink-0 opacity-0 transition-opacity group-hover/gloss:opacity-100 group-focus-visible/gloss:opacity-100">Add a thought</span>}
            <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/gloss:opacity-100 group-focus-visible/gloss:opacity-100"><Pressed keys={keys} each /></span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Every gloss on it, newest first and dated: the history of your thinking
 * about one item, in a detail panel. One written by AI says so, so it never
 * passes for your own words.
 */
export function GlossTimeline({ id }: { id: string }): React.JSX.Element {
  const glosses = useLive(() => vigil.glosses(id), [] as Gloss[], [id])
  useGlossKey(id)
  return (
    <Island compact title={<span className="flex items-baseline gap-1.5"><Term>Glosses</Term> {glosses.length > 0 && <Rolling text={glosses.length} className="font-normal text-muted-foreground tabular-nums" />}</span>}>
      <div className="px-2 py-1.5">
        <GlossLine id={id} latest={false} placeholder="Why you kept it, or where you disagree" />
      </div>
      {/* None yet: what one looks like, faint and plainly an example, never kept. */}
      {!glosses.length && !unloaded(glosses) && (
        <Tip label="A gloss is a dated thought on this note. They pile up, newest first, so you can see your mind change">
          <p className="px-2 pb-1.5 pl-[1.85rem] text-xs leading-relaxed"><GhostText>e.g. Darcy only changes because Elizabeth tells him the truth</GhostText></p>
        </Tip>
      )}
      <AnimatePresence initial={false}>
        {glosses.map((one) => (
          <motion.div
            key={one.id}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE }}
            className="px-2 py-1.5 text-foreground"
          >
            <p className="private-text whitespace-pre-line wrap-break-word">{one.body}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">{when(one.createdAt)}</span>
              {one.author === 'ai' && <span className="rounded border border-border/80 px-1 text-[10px] leading-4 tracking-wide uppercase">AI</span>}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </Island>
  )
}

/**
 * Thoughts on one page, the way a comment box sits under an issue: the ones
 * kept so far, oldest first and dated, then a real field to write the next.
 * Clicking anywhere in the field puts the caret in it; ; does too. Enter
 * keeps it, Shift-Enter starts a new line, Escape lets go of the keys.
 */
export function GlossComposer({ id, keys = ';', className }: { id: string; keys?: string; className?: string }): React.JSX.Element {
  const glosses = useLive(() => vigil.glosses(id), [] as Gloss[], [id])
  const [words, setWords] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => setWords(''), [id])
  useEffect(() => {
    const onOpen = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== id) return
      const over = [...document.querySelectorAll('[role="dialog"]')].at(-1)
      if (over && !over.contains(root.current)) return
      chime('tap')
      field.current?.focus()
    }
    window.addEventListener('vigil:gloss', onOpen)
    return () => window.removeEventListener('vigil:gloss', onOpen)
  }, [id])
  const ready = words.trim().length > 0
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    void keepGloss(id, text)
  }

  return (
    <div ref={root} data-gloss className={cn('flex flex-col gap-4', className)} onClick={(event) => event.stopPropagation()}>
      {glosses.length > 0 && (
        <ol className="flex flex-col gap-3.5">
          <AnimatePresence initial={false}>
            {[...glosses].reverse().map((one) => (
              <motion.li
                key={one.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE }}
                className="flex gap-3"
              >
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="private-text text-control whitespace-pre-line wrap-break-word text-foreground">{one.body}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-meta text-muted-foreground">
                    <span className="tabular-nums">{when(one.createdAt)}</span>
                    {one.author === 'ai' && <span className="rounded border border-border/80 px-1 text-[10px] leading-4 tracking-wide uppercase">AI</span>}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      {/* The field: a raised, edged surface, so it reads as a place to type at a glance. */}
      <div
        onClick={() => field.current?.focus()}
        className="group/field flex cursor-text items-end gap-2 rounded-xl border bg-card py-2 pr-2 pl-3.5 shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 focus-within:border-foreground/30 focus-within:shadow-md"
      >
        <textarea
          ref={field}
          rows={1}
          value={words}
          placeholder="Add a thought…"
          aria-label="Add a thought"
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              keep()
            }
            // Lets go of the keys only: the page stays open.
            if (event.key === 'Escape') {
              event.preventDefault()
              chime('fold')
              setWords('')
              field.current?.blur()
            }
          }}
          className={cn(ready && 'private-text', 'max-h-40 min-h-7 min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-control text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground')}
        />
        {!ready && <span className="mb-1.5 flex shrink-0 group-focus-within/field:hidden"><Pressed keys={keys} /></span>}
        <Tip label={<span className="flex items-center gap-2">Keep it<Kbd>↵</Kbd></span>}>
          <button
            type="button"
            aria-label="Keep thought"
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
  )
}
