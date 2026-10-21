import { useCallback, useEffect, useState } from "react"
import { chime, step } from "@/lib/sound"
import { Flag, FlaskConical, Hourglass, Split } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useShortcut } from "@/lib/use-shortcut"
import { byFrecency } from "@/lib/frecency"
import { call } from "@/lib/vigil"

import type { BlockColor } from "@/extensions/block-color"
import { Tip } from '@/components/vigil/ui'
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
 * it. The open list is ordered by use, each row keeping its number. A joke and a book are tags now (#bit, #book), a long paste a quote.
 */
export const CAPTURE_TYPES = [
  { id: "note", label: "Note", icon: NotebookText, tint: tint("gray"), does: "Anything else" },
  { id: "todo", label: "Task", icon: ListTodo, tint: tint("orange"), does: "Goes to your tasks" },
  { id: "quote", label: "Quote", icon: Quote, tint: tint("purple"), does: "Someone's words" },
  { id: "word", label: "Word", icon: Bookmark, tint: tint("green"), does: "To look up" },
  { id: "link", label: "Link", icon: Link, tint: tint("blue"), does: "Kept as a card" },
  { id: "decision", label: "Decision", icon: Split, tint: tint("red"), does: "Checked again later" },
  { id: "experiment", label: "Experiment", icon: FlaskConical, tint: tint("pink"), does: "Tried, then reviewed" },
  { id: "goal", label: "Goal", icon: Flag, tint: tint("orange"), does: "On your Goals page" },
  // Not kept as a note: what is typed becomes a practice (main/practices.ts), offered at its time.
  { id: "practice", label: "Practice", icon: Hourglass, tint: tint("yellow"), does: "Repeats with no end: offered at its time, 5 minutes to start" },
] as const

export type CaptureType = (typeof CAPTURE_TYPES)[number]["id"]

/** The pill, and the list it opens. */
export function CaptureKindPicker({ value, onChange, suggested = false, flat = false }: {
  value: CaptureType
  onChange: (kind: CaptureType) => void
  /** A row of a panel's island: flat and filling the row, no box inside the box. */
  flat?: boolean
  /** Guessed from the wording, not chosen: drawn dashed until you pick. */
  suggested?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // The row under the cursor, kept here so moving through the list can be heard.
  const [row, setRow] = useState('')
  const [more, setMore] = useState(false)
  // Faded only while rows are really out of sight: measured as the list opens,
  // as a search shrinks it and as it scrolls.
  const fade = (list: HTMLElement): void => setMore(list.scrollTop + list.clientHeight < list.scrollHeight - 4)
  const watchList = useCallback((list: HTMLDivElement | null) => {
    if (!list) return
    const watch = new ResizeObserver(() => fade(list))
    watch.observe(list)
    if (list.firstElementChild) watch.observe(list.firstElementChild)
    return () => watch.disconnect()
  }, [])
  const current = CAPTURE_TYPES.find((Ctype) => Ctype.id === value) ?? CAPTURE_TYPES[0]
  // The kinds you use most, and most lately, first. Each keeps its own number,
  // so ⌘1-9 and the digits pick the same kind whatever the order.
  const [order, setOrder] = useState<CaptureType[]>(() => CAPTURE_TYPES.map((type) => type.id))
  useEffect(() => {
    if (!open) return
    void call<Record<string, number>>('notes:kind-uses').then((scores) => setOrder(byFrecency(CAPTURE_TYPES.map((type) => type.id), scores ?? {})), () => undefined)
  }, [open])

  // ⌃L, for label; ⌃T is a tag in the editor. Opened by the key, it is simply there.
  const [keyed, setKeyed] = useState(false)
  const byKey = useCallback((next: boolean) => void (setKeyed(true), setOpen(next)), [])
  useShortcut('l', byKey, open)
  // Opened by click or ⌃L, the cursor starts on the type it is now.
  useEffect(() => void (open && setRow(current.label)), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = current.icon

  return (
    <Popover open={open} onOpenChange={(next) => void (setKeyed(false), setOpen(next))}>
      <Tip label={suggested ? `${current.does}. Suggested from what you typed: ⌃L or ⌘1-${CAPTURE_TYPES.length} to choose` : current.does}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-kind-chip={flat ? undefined : ''} className={`gap-1.5 rounded-full cursor-pointer ${suggested ? 'border-dashed' : ''} ${flat ? 'h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent px-2 py-1.5 font-normal shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent' : ''}`}>
          <Icon className="size-4" style={{ color: current.tint }} />
          {current.label}
        </Button>
        </PopoverTrigger>
      </Tip>

      {/* Opens over the box at the size it is, scrolling inside itself when short (lib/fit-box.ts KEEPS). */}
      <PopoverContent data-keeps-size className="w-64 gap-0 p-0" style={keyed ? { animation: 'none' } : undefined} align="start">
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
          <CommandInput placeholder="Change type…" shortcut="⌃L" />
          {/* A soft fade at the foot while there are more types below, should
              the window be short enough to hide some. */}
          <CommandList
            ref={watchList}
            onScroll={(event) => fade(event.currentTarget)}
            className={more ? '[mask-image:linear-gradient(to_bottom,black_75%,transparent)]' : ''}
          >
            <CommandEmpty>No type</CommandEmpty>
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
                  keywords={type.id === "todo" ? ["todo", "to-do", "to do"] : undefined}
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
 * A decision and a link also ask why: the reason is what makes either worth
 * keeping, and it is the first thing forgotten. Asked, never required.
 */
export const ASKS: Record<CaptureType, { who?: string; where?: string; why?: string }> = {
  // A plain note asks for nothing: where it came from is in the gear menu.
  note: {},
  todo: {},
  quote: { who: 'Who said it', where: 'Where from' },
  word: { where: 'Where you met it' },
  link: { who: 'Who made it', where: 'Site', why: 'Why is it worth reading? Say it on the next line.' },
  decision: { who: 'Decided with', why: 'Why this, and not the others? Say it on the next line.' },
  experiment: { who: 'Tried with' },
  goal: { why: 'Why does it matter to you? Say it on the next line.' },
  practice: {}
}

/** What the box asks, by kind and by the words: tagged #book, any kind asks who wrote it. */
export const asksFor = (kind: CaptureType, text: string): (typeof ASKS)[CaptureType] =>
  /(?:^|\s)#book(?![\w-])/i.test(text) ? { ...ASKS[kind], who: 'Who wrote it', where: ASKS[kind]?.where ?? 'Where you heard of it' } : ASKS[kind] ?? {}
