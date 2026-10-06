import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageSquareText } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Gloss } from '@/lib/vigil'
import { cn } from '@/lib/cn'
import { Island, Kbd, Rolling, Tip, toast, Typed, typing, Pressed } from './ui'
import { ago } from '../../../../main/dates'

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
  // Typed only for a gloss kept here and now: a list of rows typing out every
  // old note at once would be noise.
  const [fresh, setFresh] = useState<string | null>(null)
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
    setFresh(text)
    void keepGloss(id, text)
  }

  return (
    // Keys typed here are the field's, never the list's or the window's.
    // Quiet and empty: no line at all, not an invisible one holding a gap open.
    <div ref={root} data-gloss className={cn('min-w-0 text-xs', quiet && !last && !writing && 'hidden', className)} onKeyDown={(event) => writing && event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <AnimatePresence mode="wait" initial={false}>
        {writing ? (
          <motion.label
            key="writing"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
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
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => (chime('tap'), setWriting(true))}
            title={last ? `${said(last)} ${last.body}` : undefined}
            className="group/gloss flex w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <MessageSquareText className="size-3.5 shrink-0" />
            {last ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground/70">{said(last)} </span>
                <span className="private-text">{fresh === last.body ? <Typed text={last.body} step={28} delay={60} /> : last.body}</span>
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
    <Island compact title={<span className="flex items-baseline gap-1.5">Glosses {glosses.length > 0 && <Rolling text={glosses.length} className="font-normal text-muted-foreground tabular-nums" />}</span>}>
      <div className="px-2 py-1.5">
        <GlossLine id={id} latest={false} placeholder="Why you kept it, or where you disagree" />
      </div>
      <AnimatePresence initial={false}>
        {glosses.map((one) => (
          <motion.div
            key={one.id}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
