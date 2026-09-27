import { useState } from "react"
import {
  Check,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  CircleX,
  Circle,
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

/**
 * The six a note can be in, in the order they happen.
 *
 * The number beside each is its position, which is also the key that picks it
 * - so the list is the documentation for the shortcut and cannot drift from
 * it.
 */
export const STATUSES = [
  { id: "backlog", label: "Backlog", icon: CircleDashed, tint: "text-muted-foreground" },
  { id: "todo", label: "Todo", icon: Circle, tint: "text-muted-foreground" },
  { id: "started", label: "In Progress", icon: CircleDotDashed, tint: "text-yellow-500" },
  { id: "review", label: "In Review", icon: CircleDot, tint: "text-green-500" },
  { id: "done", label: "Done", icon: CircleCheck, tint: "text-indigo-500" },
  { id: "cancelled", label: "Canceled", icon: CircleX, tint: "text-muted-foreground" },
] as const

export type Status = (typeof STATUSES)[number]["id"]

/** The pill, and the list it opens. */
export function StatusPicker({
  value,
  onChange,
}: {
  value: Status
  onChange: (status: Status) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const current = STATUSES.find((status) => status.id === value) ?? STATUSES[0]
  const Icon = current.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
          <Icon className={`size-4 ${current.tint}`} />
          {current.label}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command
          // The number beside each row picks it. Taken before the input sees
          // it, or the digit is typed into the search instead - no status has
          // one in its name, so nothing is lost by claiming them.
          onKeyDown={(event) => {
            const picked = STATUSES[Number(event.key) - 1]
            if (!picked) return
            event.preventDefault()
            onChange(picked.id)
            setOpen(false)
          }}
        >
          <CommandInput placeholder="Change status..." />
          <CommandList>
            <CommandEmpty>No status</CommandEmpty>
            {STATUSES.map((status, index) => {
              const Mark = status.icon
              return (
                <CommandItem
                  key={status.id}
                  // `value` is what the search matches on: the label, not the
                  // id, because the label is what was typed.
                  value={status.label}
                  onSelect={() => {
                    onChange(status.id)
                    setOpen(false)
                  }}
                >
                  <Mark className={status.tint} />
                  <span>{status.label}</span>
                  {status.id === value && <Check className="ml-auto size-4" />}
                  <CommandShortcut className={status.id === value ? "ml-2" : ""}>
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
