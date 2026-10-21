import { useEffect, useState, type ReactNode } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chime } from '@/lib/sound'
import { WORDS, word, wordFor } from '@/lib/words'
import { Lead } from './lead'
import { APP_NAME } from '../../../../main/name'

/** The note listing every word, from ⌘K: not a word of its own. */
export const ALL_WORDS = 'words'

type Opened = { id: string; from: DOMRect | null }
const listeners = new Set<(opened: Opened) => void>()

/**
 * Open a word's note, growing from the word clicked, or under the top of the
 * window when it was asked for in ⌘K and there is no word on screen.
 */
export function openWord(id: string, from?: Element | null): void {
  for (const listen of listeners) listen({ id, from: from?.getBoundingClientRect() ?? null })
}

/**
 * One of Vigil's own words, in a heading: a faint dotted line under it says
 * there is more. Pointed at, what it means in a line; clicked, its note.
 * Anything that is not one of the words is left as it was, so a heading that
 * changes (the top bar's) can always be wrapped.
 */
export function Term({ children }: { children: ReactNode }): React.JSX.Element {
  const found = typeof children === 'string' ? wordFor(children) : undefined
  if (!found) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          // Out of the way of Tab: ⌘K and "gloss?" are the keyboard's door.
          tabIndex={-1}
          onClick={(event) => (event.stopPropagation(), openWord(found.id, event.currentTarget))}
          // The top bar is where the window is dragged by; the word is not.
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="mf-hit relative cursor-help underline decoration-muted-foreground/45 decoration-dotted decoration-1 underline-offset-[0.22em] transition-[text-decoration-color] hover:decoration-foreground/70"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{found.line}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Where a word's note opens, once per window. One small card in the popover's
 * own look, read only; a word it names opens in its place.
 */
export function WordNotes(): React.JSX.Element {
  const [shown, setShown] = useState<Opened | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const listen = (opened: Opened): void => (setShown(opened), setOpen(true))
    listeners.add(listen)
    return () => void listeners.delete(listen)
  }, [])
  const at = shown?.from
  // Following a neighbour turns the page rather than opening a new card: back
  // to its top, with the card still holding the keys, so Esc still closes it.
  const turn = (id: string): void => {
    chime('page')
    setShown((was) => was && { ...was, id })
    const card = document.querySelector<HTMLElement>('[data-word-note]')
    card?.scrollTo({ top: 0 })
    card?.focus()
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span aria-hidden className="pointer-events-none fixed" style={at ? { left: at.left, top: at.top, width: at.width, height: at.height } : { left: '50%', top: '12vh', width: 0, height: 0 }} />
      </PopoverAnchor>
      {shown && (
        <PopoverContent
          side="bottom"
          align={at ? 'start' : 'center'}
          sideOffset={6}
          // The card itself takes focus, not its first link, so nothing is ringed as it opens.
          onOpenAutoFocus={(event) => (event.preventDefault(), (event.currentTarget as HTMLElement | null)?.focus())}
          tabIndex={-1}
          data-word-note
          // From the word, on the strong ease-out, quick: a note handed over, not a page arriving.
          className="w-[22rem] gap-0 p-4 text-body duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=open]:zoom-in-[0.96] data-[state=closed]:zoom-out-[0.96]"
        >
          <Note id={shown.id} turn={turn} />
        </PopoverContent>
      )}
    </Popover>
  )
}

function Note({ id, turn }: { id: string; turn: (id: string) => void }): React.JSX.Element | null {
  const link = 'rounded-sm text-foreground underline decoration-muted-foreground/45 decoration-dotted underline-offset-[0.22em] hover:decoration-foreground/70'
  if (id === ALL_WORDS) return (
    <>
      <p className="font-heading text-heading font-semibold text-foreground">{APP_NAME}’s words</p>
      <p className="mt-0.5 text-meta text-muted-foreground italic">Its own names, and what each means here</p>
      <ul className="mt-3 flex flex-col gap-2">
        {WORDS.map((one) => (
          <li key={one.id} className="text-meta leading-snug text-muted-foreground">
            <button type="button" className={`${link} text-body`} onClick={() => turn(one.id)}>{one.forms[0]}</button>
            <br />{one.line}
          </li>
        ))}
      </ul>
    </>
  )
  const found = word(id)
  if (!found) return null
  return (
    <>
      <p className="font-heading text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-foreground">{found.forms[0]}</p>
      <p className="mf-aside mt-1 text-muted-foreground">{found.origin}</p>
      {/* Dia's way: the bold lead-in says it; the rest is there for whoever wants it. */}
      <p className="mf-prose mt-3 text-[0.9375rem] text-foreground/80"><Lead text={found.here} /></p>
      <p className="mf-aside mt-1.5 text-[0.84375rem] text-muted-foreground">{found.try}</p>
      <p className="mf-prose mt-3 text-body text-muted-foreground">{found.history}</p>
      <p className="mt-3 border-t pt-2.5 text-meta text-muted-foreground">
        See also{' '}
        {found.see.map((id, index) => (
          <span key={id}>
            {index > 0 && (index === found.see.length - 1 ? ' and ' : ', ')}
            <button type="button" className={link} onClick={() => turn(id)}>{word(id)?.forms[0]}</button>
          </span>
        ))}
      </p>
    </>
  )
}
