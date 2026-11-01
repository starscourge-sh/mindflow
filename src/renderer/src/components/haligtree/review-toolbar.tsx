import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { chime } from '@/lib/sound'

/** Where a tab puts its own controls (Pockets or List, the search, Display): the toolbar's right end. */
export const ToolbarSlot = createContext<HTMLElement | null>(null)

/** A tab's own controls, drawn in the toolbar's right end; nothing while the toolbar is not there. */
export function TabControls({ children }: { children: ReactNode }): React.JSX.Element | null {
  const slot = useContext(ToolbarSlot)
  return slot ? createPortal(children, slot) : null
}

type Way = { id: 'make' | 'many' | 'picture' | 'import'; label: ReactNode; words: string; mark: Record<string, string>; run: () => void }

/**
 * Review's one toolbar, drawn once above Decks, All cards and Stats and
 * kept whatever is open: the four ways cards come in on the left, the one
 * whose form is open pressed; the tab's own controls on the right of the
 * same row, never hidden. When the row is too narrow for all four, the
 * last ones fold, in order, into a "More" menu at the end of the row.
 */
export function ReviewToolbar({ onMake, onMany, onPicture, open, onSlot }: {
  onMake: () => void; onMany: () => void; onPicture: () => void
  /** The form that is out under it, if any. */ open: 'make' | 'many' | 'picture' | null
  onSlot: (slot: HTMLElement | null) => void
}): React.JSX.Element {
  const ways: Way[] = [
    { id: 'make', label: 'Make a card', words: 'Make a card', mark: { 'data-deck-make': '', 'data-make-open': '' }, run: () => (chime(open === 'make' ? 'fold' : 'open'), onMake()) },
    { id: 'many', label: 'Add many at once', words: 'Add many at once', mark: { 'data-deck-paste': '', 'data-paste-open': '' }, run: () => (chime(open === 'many' ? 'fold' : 'open'), onMany()) },
    { id: 'picture', label: 'From a picture', words: 'From a picture', mark: { 'data-deck-picture': '' }, run: onPicture },
    { id: 'import', label: <>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></>, words: 'Import from Anki or CSV', mark: { 'data-deck-import': '' }, run: () => (chime('open'), void window.api.importFrom('files')) }
  ]
  const row = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLSpanElement | null>(null)
  const widths = useRef<number[]>([])
  const [fits, setFits] = useState(ways.length)
  // How many of the four fit beside the tab's own controls; the rest fold into More. Measured on every resize of the row or the slot.
  useLayoutEffect(() => {
    const bar = row.current
    if (!bar) return
    const GAP = 8
    const MORE = 88
    const measure = (): void => {
      const buttons = [...bar.querySelectorAll<HTMLElement>('[data-way]')]
      buttons.forEach((one, at) => { if (one.offsetWidth) widths.current[at] = one.offsetWidth })
      // The right end is given the room of the widest tab's controls (All cards' search and Display), so the same ways fold on every tab and nothing shifts when switching.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const room = bar.clientWidth - Math.max(slot.current?.offsetWidth ?? 0, 24 * rem) - GAP * 2
      const all = widths.current.reduce((sum, w) => sum + w + GAP, 0)
      if (all <= room) return setFits(ways.length)
      let used = MORE
      let count = 0
      for (const w of widths.current) { if (used + w + GAP > room) break; used += w + GAP; count += 1 }
      setFits(count)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(bar)
    if (slot.current) watch.observe(slot.current)
    return () => watch.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const button = 'h-8 shrink-0 cursor-pointer px-3 max-sm:h-9 aria-pressed:border-foreground/25 aria-pressed:bg-accent aria-pressed:text-foreground'
  const folded = ways.slice(fits)
  return (
    <div ref={row} data-review-toolbar data-deck-top className="flex min-h-9 flex-nowrap items-center gap-2">
      {ways.map((way, at) => (
        <Button key={way.id} variant="outline" size="sm" data-way={way.id} {...way.mark} aria-pressed={way.id !== 'import' ? open === way.id : undefined}
          className={`${button} ${at >= fits ? 'hidden' : ''}`} onClick={way.run}>{way.label}</Button>
      ))}
      {folded.length > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-toolbar-more className={button} aria-pressed={folded.some((way) => way.id === open)}>More<ChevronDown className="size-3.5 text-muted-foreground" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 text-control">
            {folded.map((way) => <DropdownMenuItem key={way.id} data-toolbar-more-item={way.id} className="cursor-pointer" onSelect={way.run}>{way.words}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <span ref={(el) => { slot.current = el; onSlot(el) }} data-review-tab-controls className="ml-auto flex shrink-0 items-center gap-2 pl-2 [&>*]:shrink-0" />
    </div>
  )
}
