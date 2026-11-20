import { useCallback, useEffect, useState } from "react"
import { chime, step } from "@/lib/sound"
import { CalendarClock, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useShortcut } from "@/lib/use-shortcut"

import type { BlockColor } from "@/extensions/block-color"
import { Tip } from '@/components/haligtree/ui'
import { Bookmark, Check, Link, ListTodo, NotebookText, Quote } from '@/components/ui/icons'

/**
 * One of the nine the themes already tune for contrast, rather than a Tailwind
 * hue: a colour picked here has to stay readable when the palette changes
 * underneath it, and `text-orange-500` does not.
 *
 * A style rather than a class, because Tailwind only emits classes it can read
 * in the source - one built from a variable is never generated at all.
 */
const tint = (color: BlockColor): string => `var(--tt-color-text-${color})`

/**
 * What a capture can be, and in a line what each does.
 *
 * The number beside each is its place here, which is also the key that picks
 * it - so the list is the documentation for the shortcut and cannot drift from
 * it. Order implies purpose, and Haligtree is writing first: Note, then Task,
 * then the rest, here and everywhere kinds are listed (kindRank). A joke and a book are tags now (#bit, #book), a long paste a quote.
 */
export const CAPTURE_TYPES = [
  { id: "note", label: "Note", many: "Notes", icon: NotebookText, tint: tint("gray"), does: "Anything else" },
  { id: "todo", label: "Task", many: "Tasks", icon: ListTodo, tint: tint("orange"), does: "Goes to your tasks" },
  { id: "quote", label: "Quote", many: "Quotes", icon: Quote, tint: tint("purple"), does: "Someone's words" },
  { id: "word", label: "Term", many: "Terms", icon: Bookmark, tint: tint("green"), does: "To look up" },
  { id: "link", label: "Link", many: "Links", icon: Link, tint: tint("blue"), does: "Kept as a card" },
  // A date, then a question back to you: what a decision and an experiment both were.
  { id: "checkback", label: "Check back", many: "Check backs", icon: CalendarClock, tint: tint("red"), does: "Asks you again on a date" },
] as const
/** A kind by its id; an unknown one reads as a Note. */
export const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

export type CaptureType = (typeof CAPTURE_TYPES)[number]["id"]

/**
 * A kind's place in every list of kinds (chips, groups, menus): the order of
 * CAPTURE_TYPES, by id or by name. A list's own tasks ('task', "Tasks") sit
 * where Task does; anything else after them all.
 */
export function kindRank(kind: string): number {
  const at = CAPTURE_TYPES.findIndex((type) => type.id === kind || type.label === kind || type.many === kind || (type.id === "todo" && (kind === "task" || kind === "Tasks")))
  return at < 0 ? CAPTURE_TYPES.length : at
}
/** Two kinds in that order, for a sort. */
export const byKind = (a: string, b: string): number => kindRank(a) - kindRank(b)

/** The pill, and the list it opens. */
/** Quick capture's one-line pill: its kind mark, where ⌃L's list hangs from while the footer's chip is out of sight. */
const PILL_MARK = { current: { getBoundingClientRect: (): DOMRect => document.querySelector('[data-pill-kind]')?.getBoundingClientRect() ?? new DOMRect() } }

export function CaptureKindPicker({ value, onChange, suggested = false, flat = false, pill = false }: {
  value: CaptureType
  /** Shown as quick capture's one-line pill: the footer, and this chip in it, are out of sight. */
  pill?: boolean
  onChange: (kind: CaptureType) => void
  /** A row of a panel's island: flat and filling the row, no box inside the box. */
  flat?: boolean
  /** Guessed from the wording, not chosen: a small sparkle after its name until you pick. */
  suggested?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // The row under the cursor, kept here so moving through the list can be heard.
  const [row, setRow] = useState('')
  // As tall as its rows, each whole, where the room allows; the fade at the
  // foot when it scrolls is CommandList's own (mf-more), as on every menu.
  const watchList = useCallback((list: HTMLDivElement | null) => {
    if (!list) return
    // Row to row, gaps between them included, against the room the popover has under it.
    // Measured in the list's own size: while the popover grows in, the screen sizes are scaled down.
    const size = (): void => {
      const [first, second] = [...list.querySelectorAll<HTMLElement>('[cmdk-item]')]
      if (!first || !second) return
      const box = list.getBoundingClientRect()
      const scale = box.height / (list.offsetHeight || 1) || 1
      const top = (first.getBoundingClientRect().top - box.top) / scale + list.scrollTop
      const pitch = (second.getBoundingClientRect().top - first.getBoundingClientRect().top) / scale
      const above = (box.top - (list.closest<HTMLElement>('[data-slot="popover-content"]')?.getBoundingClientRect().top ?? box.top)) / scale
      const room = (parseFloat(getComputedStyle(list).getPropertyValue('--radix-popover-content-available-height')) || innerHeight) - above
      // Every row whole where they all fit, in the pill and the grown box alike: cut at three and a half, the fourth
      // ("Word") showed faded and cut off with room to spare below it. Short of room, as many rows as fit, each whole,
      // the list scrolling for the rest with its own fade at the foot (mf-more) saying there are more.
      const rows = list.querySelectorAll('[cmdk-item]').length
      const all = top + pitch * (rows - 1) + first.offsetHeight + 4
      if (all <= room) return void (list.style.maxHeight = `${all}px`)
      const whole = Math.max(1, Math.min(rows, Math.floor((room - top - first.offsetHeight - 4) / pitch) + 1))
      list.style.maxHeight = `${top + pitch * (whole - 1) + first.offsetHeight + 4}px`
    }
    size()
    const watch = new ResizeObserver(size)
    watch.observe(list)
    if (list.firstElementChild) watch.observe(list.firstElementChild)
    // The window growing room under the list (the pill's, for its pop-ups) gives it more rows to show.
    addEventListener('resize', size)
    return () => (watch.disconnect(), removeEventListener('resize', size))
  }, [pill])
  const current = CAPTURE_TYPES.find((Ctype) => Ctype.id === value) ?? CAPTURE_TYPES[0]
  // Always the one order (kindRank), Note first: each kind keeps its own number for ⌘1-9.
  const order: CaptureType[] = CAPTURE_TYPES.map((type) => type.id)

  // ⌃L, for label; ⌃T is a tag in the editor. Opened by the key, it is simply there.
  const [keyed, setKeyed] = useState(false)
  const byKey = useCallback((next: boolean) => void (setKeyed(true), setOpen(next)), [])
  useShortcut('l', byKey, open)
  // Asked for with ⌃L while the details it lives in were put away: open as they come out.
  useEffect(() => void (flat && kindAsked && ((kindAsked = false), byKey(true))), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened by click or ⌃L, the cursor starts on the type it is now.
  useEffect(() => void (open && setRow(current.label)), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = current.icon

  return (
    <Popover open={open} onOpenChange={(next) => void (setKeyed(false), setOpen(next))}>
      <Tip label={suggested ? `${current.does}. Suggested from what you typed: ⌃L or ⌘1-${CAPTURE_TYPES.length} to choose` : current.does}>
      <PopoverTrigger asChild>
        {/* One look whether you chose it or it was read from your words: a guess only adds a small sparkle after
            its name (app-made, set apart), never a dashed border beside the solid ones. */}
        <Button variant="outline" size="sm" data-kind-chip={flat ? undefined : ''} data-guessed={suggested || undefined} className={`gap-1.5 rounded-full cursor-pointer ${flat ? 'h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent px-2 py-1.5 font-normal shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent' : ''}`}>
          <Icon className="size-4" style={{ color: current.tint }} />
          {current.label}
          {suggested && <Sparkles aria-label="guessed" data-kind-guessed className="-ml-0.5 size-3 text-muted-foreground" />}
        </Button>
        </PopoverTrigger>
      </Tip>

      {/* In the pill the chip is out of sight: the list hangs from the pill's kind mark, under it, in room the window
          makes below the pill as it does for "/" (lib/fit-box.ts). */}
      {pill && <PopoverAnchor virtualRef={PILL_MARK} />}
      {/* In the box, it opens over the box at the size it is, scrolling inside itself when short (lib/fit-box.ts KEEPS). */}
      <PopoverContent data-keeps-size={pill ? undefined : ''} side="bottom" sideOffset={6} className="w-64 gap-0 p-0" style={keyed ? { animation: 'none' } : undefined} align="start">
        <Command
          // Each type its own note as you move through them, as the themes
          // have: a scale under the list. Picking one lands with a chord.
          value={row}
          onValueChange={(label) => {
            const at = CAPTURE_TYPES.findIndex((type) => type.label === label)
            if (at >= 0 && label !== row) step(at)
            setRow(label)
          }}
          // The number beside each row picks it. Taken before the
          // input sees it, or the digit is typed into the search instead - no
          // type has one in its name, so nothing is lost by claiming them.
          onKeyDown={(event) => {
            const picked = /^[1-9]$/.test(event.key) ? CAPTURE_TYPES[Number(event.key) - 1] : undefined
            if (!picked) return
            event.preventDefault()
            chime('settled')
            onChange(picked.id)
            setOpen(false)
          }}
        >
          <CommandInput placeholder="Change kind…" shortcut="⌃L" />
          <CommandList
            ref={watchList}
          >
            <CommandEmpty>No kind</CommandEmpty>
            {order.map((id) => {
              const index = CAPTURE_TYPES.findIndex((type) => type.id === id)
              const type = CAPTURE_TYPES[index]
              const Mark = type.icon
              return (
                <CommandItem
                  key={type.id}
                  // `value` is what the search matches on: the label, not the
                  // id, because the label is what was typed.
                  value={type.label}
                  // Found by its old name too: "todo" still finds Task.
                  keywords={type.id === "todo" ? ["todo", "to-do", "to do"] : type.id === "checkback" ? ["decision", "experiment", "remind", "later"] : undefined}
                  onSelect={() => {
                    chime('settled')
                    onChange(type.id)
                    setOpen(false)
                  }}
                >
                  <Mark style={{ color: type.tint }} />
                  {/* What it does, in a few words on the same line: the difference between them, said where you choose. */}
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 text-xs">{type.label}</span>
                    <span className="truncate text-meta text-muted-foreground">{type.does}</span>
                  </span>
                  {type.id === value && <Check className="ml-auto size-4" />}
                  <CommandShortcut className={type.id === value ? "ml-2" : ""}>
                    {index + 1}
                  </CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * What each kind asks for besides its words: who and where, named the way that
 * kind would say it. A kind without one does not ask; a note or a todo asks for neither.
 * Nothing nags under the fields: the box asks only through its fields.
 */
export const ASKS: Record<CaptureType, { who?: string; where?: string }> = {
  // A plain note asks for nothing: where it came from is in the gear menu.
  note: {},
  todo: {},
  quote: { who: 'Who said it', where: 'Where from' },
  word: { where: 'Where you met it' },
  link: { who: 'Who made it', where: 'Site' },
  checkback: {}
}

/** What the box asks, by kind and by the words: tagged #book, any kind asks who wrote it. */
export const asksFor = (kind: CaptureType, text: string): (typeof ASKS)[CaptureType] =>
  /(?:^|\s)#book(?![\w-])/i.test(text) ? { ...ASKS[kind], who: 'Who wrote it', where: ASKS[kind]?.where ?? 'Where you heard of it' } : ASKS[kind] ?? {}

/** ⌃L pressed on an open capture or gem whose details (where its kind picker lives) are put away. */
let kindAsked = false
/**
 * ⌃L on an open capture or gem with its details put away: they come out with the kind list open, as with them out.
 * Before, ⌃L did nothing there, though the shortcuts say it picks a kind on an open capture or gem.
 */
export function useKindKeyBehindDetails(on: boolean, bringOut: () => void): void {
  useEffect(() => {
    if (!on) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'l' || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return
      if (document.querySelector('[cmdk-root], [role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup')) return
      event.preventDefault()
      kindAsked = true
      bringOut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, bringOut])
}
