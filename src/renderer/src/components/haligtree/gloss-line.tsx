import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift } from '@/lib/motion'

import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, when, type Gloss } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { cn } from '@/lib/cn'
import { Island, Kbd, Rolling, Tip, toast, typing, Pressed } from './ui'
import { Term } from './term'
import { GhostText } from './ghost'
import { ago } from '../../../../main/dates'
import { useHere } from '@/lib/split'
import { useComposed } from './thought-bar'
import { ShowMore, useShowMore } from './show-more'
import { ArrowUp, Quote as MessageSquareText } from '@/components/ui/icons'

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
export const openGloss = (id: string): void => void window.dispatchEvent(new CustomEvent('haligtree:gloss', { detail: id }))

/**
 * ; on the item in front of you (⌘; while a field has the keys): the one key
 * that starts a gloss on every surface that is driven by keys.
 */
export function useGlossKey(id: string | null | undefined, enabled = true): void {
  const latest = useRef(id)
  latest.current = id
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
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
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
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
        className={cn('absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100', className)}>
        <MessageSquareText className="size-3.5" />
      </button>
    </Tip>
  )
}

/**
 * Keep a gloss, with its sound and a way back. Taken back, `onUndo` is given
 * the words, for the field they were typed in to have them again.
 */
export async function keepGloss(id: string, text: string, onUndo?: (words: string) => void): Promise<void> {
  const words = text.trim()
  if (!words) return
  const gloss = await haligtree.gloss(id, words)
  chime('noted')
  toast('Your thought is kept, dated today', () => (void haligtree.dropGloss(gloss), onUndo?.(words)))
}

/**
 * Words taken back into the field they were sent from (an undone thought or
 * clue): ahead of anything typed there since, the caret at their end, ready
 * to change and send again.
 */
export function putBack(field: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>, setWords: (next: (now: string) => string) => void, words: string): void {
  setWords((now) => (now.trim() ? `${words}\n${now}` : words))
  requestAnimationFrame(() => {
    const box = field.current
    if (!box) return
    box.focus()
    box.setSelectionRange(words.length, words.length)
  })
}

/**
 * The line itself: "Add a thought…", or the latest gloss faintly, until it
 * is clicked (or ; is pressed), when it opens into a field right where it
 * sits. Enter keeps it, Shift-Enter starts a second line, Escape lets it go.
 */
/** Words cut at a word, with one ellipsis, only when they run long. */
const cutWords = (text: string, size: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > size ? `${flat.slice(0, size).replace(/\s+\S*$/, '').replace(/[\s,;:·–-]+$/, '')}…` : flat
}

export function GlossLine({ id, className, placeholder = 'A thought on it, in your own words', latest = true, quiet = false, open = false, onDone, keys = ';', onRead }: {
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
  /** The line opens where every thought on it is read (the Feed's thread), its words cut at a word; writing is the row's own Reply. */
  onRead?: () => void
}): React.JSX.Element {
  const glosses = useLive(() => haligtree.glosses(id), [] as Gloss[], [id])
  // The page it is on waits for its thoughts, so a line never comes in under what was drawn.
  useReading(unloaded(glosses))
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
    window.addEventListener('haligtree:gloss', onOpen)
    return () => window.removeEventListener('haligtree:gloss', onOpen)
  }, [id])

  const close = (): void => (setWriting(false), setWords(''), onDone?.())
  const keep = (): void => {
    const text = words.trim()
    if (!text) return close()
    close()
    void keepGloss(id, text, (back) => (setWriting(true), putBack(field, setWords, back)))
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
            initial={byKeys() ? false : { opacity: 0, transform: shift('translateY(-2px)') }}
            animate={{ opacity: 1, transform: shift('translateY(0px)') }}
            exit={{ opacity: 0, transition: { duration: byKeys() ? 0 : 0.08 } }}
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
            onClick={() => (onRead && last ? onRead() : (chime('tap'), setWriting(true)))}
            data-gloss-read={onRead && last ? '' : undefined}
            title={last ? `${said(last)} ${last.body}` : undefined}
            className="group/gloss flex w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <MessageSquareText className="size-3.5 shrink-0" />
            {last ? (
              <span className={cn('min-w-0 flex-1', onRead ? 'line-clamp-2' : 'truncate')}>
                <span className="text-muted-foreground">{said(last)} </span>
                <span className={cn('private-text', onRead && 'group-hover/gloss:underline')}>{onRead ? cutWords(last.body, 140) : last.body}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate">Add a thought…</span>
            )}
            {last && !onRead && <span className="shrink-0 opacity-0 transition-opacity group-hover/gloss:opacity-100 group-focus-visible/gloss:opacity-100">Add a thought</span>}
            {!onRead && <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/gloss:opacity-100 group-focus-visible/gloss:opacity-100"><Pressed keys={keys} each /></span>}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/** How many thoughts on a note show before "Show more". */
const GLOSS_FEW = 20

/**
 * Every gloss on it, newest first and dated: the history of your thinking
 * about one item, in a detail panel. One written by AI says so, so it never
 * passes for your own words.
 */
export function GlossTimeline({ id }: { id: string }): React.JSX.Element {
  const glosses = useLive(() => haligtree.glosses(id), [] as Gloss[], [id])
  // A note thought about for years opens on its newest few; the rest wait under "Show more".
  const few = useShowMore(glosses, GLOSS_FEW, id)
  // The composer under the page takes new ones, and the ; key, when it is there.
  const composed = useComposed(id)
  useGlossKey(id, !composed)
  return (
    <Island compact name="Thoughts on this note" title={<span className="flex items-baseline gap-1.5"><Term>Thoughts on this note</Term> {glosses.length > 0 && <Rolling text={glosses.length} className="font-normal text-muted-foreground tabular-nums" />}</span>}>
      {!composed && (
        <div className="px-2 py-1.5">
          <GlossLine id={id} latest={false} placeholder="Why you kept it, or where you disagree" />
        </div>
      )}
      {/* None yet: what one looks like, faint and plainly an example, never kept. */}
      {!glosses.length && !unloaded(glosses) && (
        <Tip label="A thought is a dated line on this note. They pile up, newest first, so you can see your mind change">
          <p className="px-2 pb-1.5 pl-[1.85rem] text-xs leading-relaxed"><GhostText>e.g. Less sure of this now than when I kept it</GhostText></p>
        </Tip>
      )}
      <AnimatePresence initial={false}>
        {few.shown.map((one) => (
          <motion.div
            key={one.id}
            layout="position"
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
      <ShowMore total={glosses.length} shown={few.shown.length} few={GLOSS_FEW} onMore={few.onMore} onFewer={few.onFewer} className="mx-1 mb-1" />
    </Island>
  )
}

/**
 * Thoughts on one page, the way a comment box sits under an issue: the ones
 * kept so far, oldest first and dated, then a real field to write the next.
 * Clicking anywhere in the field puts the caret in it; ; does too. Enter
 * keeps it, Shift-Enter starts a new line, Escape lets go of the keys.
 */
export function GlossComposer({ id, keys = ';', className, field: withField = true }: { id: string; keys?: string; className?: string; /** Off where a composer under the page takes new ones: only the kept ones show. */ field?: boolean }): React.JSX.Element {
  const glosses = useLive(() => haligtree.glosses(id), [] as Gloss[], [id])
  // The newest few, oldest of them first; earlier ones a press away above them.
  const few = useShowMore(glosses, GLOSS_FEW, id)
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
    window.addEventListener('haligtree:gloss', onOpen)
    return () => window.removeEventListener('haligtree:gloss', onOpen)
  }, [id])
  const ready = words.trim().length > 0
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    void keepGloss(id, text, (back) => putBack(field, setWords, back))
  }

  return (
    <div ref={root} data-gloss className={cn('flex flex-col gap-4', className)} onClick={(event) => event.stopPropagation()}>
      <ShowMore total={glosses.length} shown={few.shown.length} few={GLOSS_FEW} onMore={few.onMore} onFewer={few.onFewer} className="-mx-2 -mb-2 self-start" />
      {glosses.length > 0 && (
        <ol className="flex flex-col gap-3.5">
          <AnimatePresence initial={false}>
            {[...few.shown].reverse().map((one) => (
              <motion.li
                key={one.id}
                layout="position"
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
      {withField && <div
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
      </div>}
    </div>
  )
}
