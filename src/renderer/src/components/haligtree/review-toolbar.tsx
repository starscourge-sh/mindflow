import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, Sparkles, StickyNote } from 'lucide-react'
import { Tip } from './ui'
import { chime } from '@/lib/sound'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'

/** Where a tab puts its own controls (Stacks or List, the search, Display): the toolbar's right end. */
export const ToolbarSlot = createContext<HTMLElement | null>(null)
/** True when the row is too narrow for the tab's controls in words: they show as icons (a + for New deck, an icon switch), never clipped. */
export const ToolbarCompact = createContext(false)
export const useToolbarCompact = (): boolean => useContext(ToolbarCompact)

/** A tab's own controls, drawn in the toolbar's right end; nothing while the toolbar is not there. */
export function TabControls({ children }: { children: ReactNode }): React.JSX.Element | null {
  const slot = useContext(ToolbarSlot)
  return slot ? createPortal(children, slot) : null
}

export type Finish = 'satin' | 'paper'
const FINISHES: { id: Finish; label: string }[] = [{ id: 'satin', label: 'Satin' }, { id: 'paper', label: 'Paper' }]

/** Review's finish, worn at once by every deck, panel and card: the attribute on the page's root that main.css reads. */
export function wearFinish(finish: Finish): void {
  document.documentElement.dataset.reviewFinish = finish
}

/**
 * "Satin · Paper": Review's two finishes, in the same two-part control as
 * "Stacks · List". Pressed, the whole of Review changes at once, and the
 * choice is kept (Settings › Review has it too).
 */
export function FinishPick(): React.JSX.Element {
  const compact = useToolbarCompact()
  const settings = useLive(haligtree.settings, null as Settings | null)
  // The finish in use is pressed from the first frame: never Satin a beat before a kept Paper.
  useReading(!settings)
  const [picked, setPicked] = useState<Finish | null>(null)
  // Pressed, it shows at once; the saved choice takes over as it comes back (or as Settings changes it).
  useEffect(() => setPicked(null), [settings?.reviewFinish])
  const finish: Finish = picked ?? settings?.reviewFinish ?? 'satin'
  const pick = (to: Finish): void => {
    if (to === finish) return
    chime('tap')
    setPicked(to)
    wearFinish(to)
    void haligtree.setSettings({ reviewFinish: to })
  }
  return (
    <span role="radiogroup" aria-label="Finish" data-review-finish-pick className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
      {FINISHES.map((one) => {
        const Icon = one.id === 'satin' ? Sparkles : StickyNote
        const button = (
          <button key={one.id} type="button" role="radio" aria-checked={finish === one.id} aria-label={one.label} data-review-finish-to={one.id} onClick={() => pick(one.id)}
            className={`h-7 cursor-pointer rounded-md border ${compact ? 'px-2' : 'px-2.5'} transition-colors ${finish === one.id ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{compact ? <Icon className="size-3.5" /> : one.label}</button>
        )
        // Narrow, in icons as "Stacks · List" goes, each named on hover.
        return compact ? <Tip key={one.id} label={one.label}>{button}</Tip> : button
      })}
    </span>
  )
}

type Way = { id: 'make' | 'many' | 'picture' | 'import'; label: ReactNode; words: string; mark: Record<string, string>; run: () => void }

/**
 * Review's one toolbar, drawn once above Decks, All cards and Stats and
 * kept whatever is open: the four ways cards come in on the left, the one
 * whose form is open pressed; the tab's own controls on the right of the
 * same row, never hidden. When the row is too narrow for all four, the
 * last ones fold, in order, into a "More" menu at the end of the row.
 */
export function ReviewToolbar({ onMake, onMany, onPicture, open, onSlot, onCompact }: {
  onMake: () => void; onMany: () => void; onPicture: () => void
  /** The form that is out under it, if any. */ open: 'make' | 'many' | 'picture' | null
  onSlot: (slot: HTMLElement | null) => void
  /** Told when the tab's controls must go compact to fit. */ onCompact: (compact: boolean) => void
}): React.JSX.Element {
  const ways: Way[] = [
    { id: 'make', label: 'Make a card', words: 'Make a card', mark: { 'data-deck-make': '', 'data-make-open': '' }, run: () => (chime(open === 'make' ? 'fold' : 'open'), onMake()) },
    { id: 'many', label: 'Add many at once', words: 'Add many at once', mark: { 'data-deck-paste': '', 'data-paste-open': '' }, run: () => (chime(open === 'many' ? 'fold' : 'open'), onMany()) },
    { id: 'picture', label: 'From a picture', words: 'From a picture', mark: { 'data-deck-picture': '' }, run: onPicture },
    { id: 'import', label: <>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></>, words: 'Import from Anki or CSV', mark: { 'data-deck-import': '' }, run: () => (chime('open'), void window.api.importFrom('files')) }
  ]
  const row = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLSpanElement | null>(null)
  const right = useRef<HTMLSpanElement>(null)
  const widths = useRef<number[]>([])
  const [fits, setFits] = useState(ways.length)
  // The tab's controls' width in words, kept while they are compact, so the row knows when there is room for words again.
  const wide = useRef(0)
  const compact = useRef(false)
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
      // The right-hand group: the tab's own controls and the finish beside them.
      const own = right.current?.offsetWidth ?? 0
      if (!compact.current) wide.current = own
      // "Make a card" never folds: with it and More, is there room for the tab's controls in words? If not, they go compact.
      const least = (widths.current[0] ?? 0) + MORE + GAP * 2
      const goCompact = bar.clientWidth - Math.max(wide.current, 0) - GAP * 2 < least
      if (goCompact !== compact.current) { compact.current = goCompact; onCompact(goCompact) }
      const room = bar.clientWidth - Math.max(own, goCompact ? 0 : 24 * rem + own - (slot.current?.offsetWidth ?? 0)) - GAP * 2
      const all = widths.current.reduce((sum, w) => sum + w + GAP, 0)
      if (all <= room) return setFits(ways.length)
      let used = MORE
      let count = 0
      for (const w of widths.current) { if (used + w + GAP > room) break; used += w + GAP; count += 1 }
      // Import folds first, then From a picture, then Add many; Make a card stays.
      setFits(Math.max(1, count))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(bar)
    if (right.current) watch.observe(right.current)
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
      <span ref={right} data-review-right className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        <span ref={(el) => { slot.current = el; onSlot(el) }} data-review-tab-controls className="flex shrink-0 items-center gap-2 [&>*]:shrink-0" />
        <FinishPick />
      </span>
    </div>
  )
}
