import { useCallback, useEffect, useState } from "react"
import { chime, step } from "@/lib/sound"
import { FlaskConical, ScrollText, Split, Sticker } from "lucide-react"
import { alive } from "@/components/ui/alive-icon"
import BookIcon from "@/components/ui/book-icon"
import SimpleCheckedIcon from "@/components/ui/simple-checked-icon"
import CheckedIcon from "@/components/ui/checked-icon"
import NoteIcon from "@/components/ui/note-icon"
import MessageCircleIcon from "@/components/ui/message-circle-icon"
import BookmarkIcon from "@/components/ui/bookmark-icon"
import LinkIcon from "@/components/ui/link-icon"

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

import type { BlockColor } from "@/extensions/block-color"
import { Tip } from '@/components/vigil/ui'

// itshover drawings in lucide's place, moving when their control is pointed at.
const BookOpen = alive(BookIcon)
const Check = alive(SimpleCheckedIcon)
const ListTodo = alive(CheckedIcon)
const NotebookText = alive(NoteIcon)
const Quote = alive(MessageCircleIcon)
const Bookmark = alive(BookmarkIcon)
const Link = alive(LinkIcon)

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
 * What a capture can be.
 *
 * The number beside each is its position, which is also the key that picks it
 * - so the list is the documentation for the shortcut and cannot drift from
 * it.
 */
export const CAPTURE_TYPES = [
  { id: "note", label: "Note", icon: NotebookText, tint: tint("gray") },
  { id: "todo", label: "Todo", icon: ListTodo, tint: tint("orange") },
  { id: "quote", label: "Quote", icon: Quote, tint: tint("purple") },
  { id: "word", label: "Word", icon: Bookmark, tint: tint("green") },
  { id: "link", label: "Link", icon: Link, tint: tint("blue") },
  { id: "excerpt", label: "Excerpt", icon: ScrollText, tint: tint("yellow") },
  { id: "decision", label: "Decision", icon: Split, tint: tint("red") },
  { id: "bit", label: "Bit", icon: Sticker, tint: tint("pink") },
  { id: "book", label: "Book", icon: BookOpen, tint: tint("brown") },
  { id: "experiment", label: "Experiment", icon: FlaskConical, tint: tint("green") },
] as const


// type CaptureKind =
//   | 'note'      // ✍️ - default — anything that isn't one of the others
//   | 'quote'     // 💬 - someone else's words
//   | 'word'      // 🗨️ - a term you looked up
//   | 'link'      // 🔗 - a URL — parser sets this from paste detection
//   | 'excerpt'   // 📑 - a long pasted block; the container, not the extract
//   | 'decision'  // ⚖️ - a choice made, with its why
//   | 'bit'       // 🃏 - a joke or one-liner
//   | 'todo'      // 🎯 - an obligation

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

  // ⌃L, for label; ⌃T is a tag in the editor. Opened by the key, it is simply there.
  const [keyed, setKeyed] = useState(false)
  const byKey = useCallback((next: boolean) => void (setKeyed(true), setOpen(next)), [])
  useShortcut('l', byKey, open)
  // Opened by click or ⌃L, the cursor starts on the type it is now.
  useEffect(() => void (open && setRow(current.label)), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = current.icon

  return (
    <Popover open={open} onOpenChange={(next) => void (setKeyed(false), setOpen(next))}>
      <Tip label={suggested ? 'Suggested from what you typed. ⌃L or ⌘1-9 to choose' : undefined}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-kind-chip={flat ? undefined : ''} className={`gap-1.5 rounded-full cursor-pointer ${suggested ? 'border-dashed' : ''} ${flat ? 'h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent px-2 py-1.5 font-normal shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent' : ''}`}>
          <Icon className="size-4" style={{ color: current.tint }} />
          {current.label}
        </Button>
        </PopoverTrigger>
      </Tip>

      <PopoverContent className="w-64 gap-0 p-0" style={keyed ? { animation: 'none' } : undefined} align="start">
        <Command
          // Each type its own note as you move through them, as the themes
          // have: a scale under the list. Picking one lands with a chord.
          value={row}
          onValueChange={(label) => {
            const at = CAPTURE_TYPES.findIndex((type) => type.label === label)
            if (at >= 0 && label !== row) step(at)
            setRow(label)
          }}
          // The number beside each row picks it, 0 the tenth. Taken before the
          // input sees it, or the digit is typed into the search instead - no
          // type has one in its name, so nothing is lost by claiming them.
          onKeyDown={(event) => {
            const picked = /^[0-9]$/.test(event.key) ? CAPTURE_TYPES[(Number(event.key) + 9) % 10] : undefined
            if (!picked) return
            event.preventDefault()
            chime('settled')
            onChange(picked.id)
            setOpen(false)
          }}
        >
          <CommandInput placeholder="Change type…" shortcut="⌃L" />
          {/* A soft fade at the foot while there are more types below: excerpt,
              decision and the rest are a scroll away, and this says so. */}
          <CommandList
            ref={watchList}
            onScroll={(event) => fade(event.currentTarget)}
            className={more ? '[mask-image:linear-gradient(to_bottom,black_75%,transparent)]' : ''}
          >
            <CommandEmpty>No type</CommandEmpty>
            {CAPTURE_TYPES.map((type, index) => {
              const Mark = type.icon
              return (
                <CommandItem
                  key={type.id}
                  // `value` is what the search matches on: the label, not the
                  // id, because the label is what was typed.
                  value={type.label}
                  onSelect={() => {
                    chime('settled')
                    onChange(type.id)
                    setOpen(false)
                  }}
                >
                  <Mark style={{ color: type.tint }} />
                  <span className="text-xs">{type.label}</span>
                  {type.id === value && <Check className="ml-auto size-4" />}
                  <CommandShortcut className={type.id === value ? "ml-2" : ""}>
                    {(index + 1) % 10}
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
 * kind would say it. A kind without one does not ask; a todo asks for neither.
 * A decision and a link also ask why: the reason is what makes either worth
 * keeping, and it is the first thing forgotten. Asked, never required.
 */
export const ASKS: Record<CaptureType, { who?: string; where?: string; why?: string }> = {
  note: { where: 'Where from' },
  todo: {},
  quote: { who: 'Who said it', where: 'Where from' },
  word: { where: 'Where you met it' },
  link: { who: 'Who made it', where: 'Site', why: 'Why is it worth reading? Say it on the next line.' },
  excerpt: { who: 'Who wrote it', where: 'Where from' },
  decision: { who: 'Decided with', why: 'Why this, and not the others? Say it on the next line.' },
  bit: { who: 'Whose bit', where: 'Where you heard it' },
  book: { who: 'Who wrote it', where: 'Where you heard of it' },
  experiment: { who: 'Tried with' }
}
