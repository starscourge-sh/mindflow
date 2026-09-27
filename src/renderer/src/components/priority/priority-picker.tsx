import { useEffect, useState } from "react"
import { Check, Ellipsis, SignalHigh, SignalLow, SignalMedium, TriangleAlert } from "lucide-react"

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

import type { BlockColor } from "@/extensions/block-color"

/** One of the nine the themes tune for contrast, so it survives a theme change. */
const tint = (color: BlockColor): string => `var(--tt-color-text-${color})`

/**
 * How much it matters, most urgent first.
 *
 * The number beside each is its position, counting from zero, which is also
 * the key that picks it - so the list is the documentation for the shortcut
 * and cannot drift from it. Nothing is the default, and nothing is 0.
 */
export const PRIORITIES = [
  { id: "none", label: "No priority", icon: Ellipsis, tint: tint("gray") },
  { id: "urgent", label: "Urgent", icon: TriangleAlert, tint: tint("orange") },
  { id: "high", label: "High", icon: SignalHigh, tint: tint("yellow") },
  { id: "medium", label: "Medium", icon: SignalMedium, tint: tint("blue") },
  { id: "low", label: "Low", icon: SignalLow, tint: tint("gray") },
] as const

export type Priority = (typeof PRIORITIES)[number]["id"]

/** Is the person typing somewhere a letter belongs? */
const typing = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  return (
    element?.isContentEditable === true ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName ?? "")
  )
}

/** The pill, and the list it opens. */
export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority
  onChange: (priority: Priority) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const current = PRIORITIES.find((priority) => priority.id === value) ?? PRIORITIES[0]
  const Icon = current.icon

  // `p` opens it, unless a letter is what was wanted - a note is a
  // contenteditable, and typing "priority" into one should not open a menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "p" && event.key !== "P") return
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
          <Icon className="size-4" style={{ color: current.tint }} />
          {current.label}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command
          // The number beside each row picks it, counting from zero.
          onKeyDown={(event) => {
            const picked = PRIORITIES[Number(event.key)]
            if (!picked || !/^[0-9]$/.test(event.key)) return
            event.preventDefault()
            onChange(picked.id)
            setOpen(false)
          }}
        >
          <CommandInput placeholder="Change priority to..." shortcut="P" />
          <CommandList>
            <CommandEmpty>No priority</CommandEmpty>
            {PRIORITIES.map((priority, index) => {
              const Mark = priority.icon
              return (
                <CommandItem
                  key={priority.id}
                  value={priority.label}
                  onSelect={() => {
                    onChange(priority.id)
                    setOpen(false)
                  }}
                >
                  <Mark style={{ color: priority.tint }} />
                  <span>{priority.label}</span>
                  {priority.id === value && <Check className="ml-auto size-4" />}
                  <CommandShortcut className={priority.id === value ? "ml-2" : ""}>
                    {index}
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
