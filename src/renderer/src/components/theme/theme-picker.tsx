import { useRef, useState } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { THEMES, applyTheme, currentTheme, themeName, type Theme } from "@/lib/theme"

const byName = (label: string): Theme | undefined =>
  THEMES.find((name) => themeName(name) === label)

/** Three of a theme's colours, overlapping. The stylesheet paints them. */
const Swatch = ({ theme }: { theme: Theme }): React.JSX.Element => (
  <span className={`mf-swatch mf-swatch-${theme}`}>
    <i />
    <i />
    <i />
  </span>
)

/**
 * The pill, and the list it opens.
 *
 * The same shape as the kind picker beside it: a pill saying what is on, a
 * command list, and typing to narrow it - which is what a dozen schemes need,
 * since reading a list that long is slower than typing "drac". Each row wears
 * its own accent as a dot, and the dot is a class rather than an inline colour
 * because only the stylesheet knows what a theme that is not on looks like.
 *
 * Moving through the list wears each one as you pass it, with the keys or the
 * mouse - a palette can only really be judged against your own note, and the
 * alternative is choosing a dozen times to see a dozen themes. Leaving without
 * picking puts back the one that was on, so a look around costs nothing.
 *
 * It lives here and not in the editor because the theme is the page's, not any
 * one editor's - the same reason `applyTheme` is the host's to call.
 */
export function ThemePicker({ className }: { className?: string }): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const [open, setOpen] = useState(false)
  // Which row is under the cursor, so the list opens on the theme in use
  // rather than previewing the first one the moment it appears.
  const [row, setRow] = useState(() => themeName(theme))
  // The last theme actually chosen. A ref, not the state above: the close
  // handler runs in the same tick as the choice and would read the old one.
  const chosen = useRef<Theme>(theme)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setRow(themeName(chosen.current))
        // Everything tried on the way out was a preview.
        else applyTheme(chosen.current)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Change theme" className={className}>
          <Swatch theme={theme} />
          {themeName(theme)}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0 [--mf-swatch-ring:var(--popover)]" align="end">
        <Command
          value={row}
          onValueChange={(label) => {
            setRow(label)
            const found = byName(label)
            if (found) applyTheme(found)
          }}
        >
          <CommandInput placeholder="Change theme..." />
          <CommandList>
            <CommandEmpty>No theme</CommandEmpty>
            {THEMES.map((name) => (
              <CommandItem
                key={name}
                value={themeName(name)}
                onSelect={() => {
                  chosen.current = name
                  setTheme(name)
                  applyTheme(name)
                  setOpen(false)
                }}
              >
                <Swatch theme={name} />
                <span>{themeName(name)}</span>
                {name === theme && <Check className="ml-auto size-4" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
