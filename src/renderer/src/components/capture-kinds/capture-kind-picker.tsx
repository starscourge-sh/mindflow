import { useState } from "react"
import {
  Check,
  ListTodo,
  NotebookText,
  Quote,
  Bookmark,
  Link,
  ScrollText,
  Split,
  Sticker,
} from "lucide-react"

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
export function CaptureKindPicker({ value, onChange }: {
  value: CaptureType
  onChange: (kind: CaptureType) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const current = CAPTURE_TYPES.find((Ctype) => Ctype.id === value) ?? CAPTURE_TYPES[0]

  useShortcut('l', setOpen, open)
  const Icon = current.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full cursor-pointer">
          <Icon className="size-4" style={{ color: current.tint }} />
          {current.label}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command
          // The number beside each row picks it. Taken before the input sees
          // it, or the digit is typed into the search instead - no type has
          // one in its name, so nothing is lost by claiming them.
          onKeyDown={(event) => {
            const picked = CAPTURE_TYPES[Number(event.key) - 1]
            if (!picked) return
            event.preventDefault()
            onChange(picked.id)
            setOpen(false)
          }}
        >
          <CommandInput placeholder="Change type..." shortcut="⌃L" />
          <CommandList>
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
                    onChange(type.id)
                    setOpen(false)
                  }}
                >
                  <Mark style={{ color: type.tint }} />
                  <span>{type.label}</span>
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
