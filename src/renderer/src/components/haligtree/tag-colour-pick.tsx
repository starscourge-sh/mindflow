import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { TagIcon } from './tag-icon'
import { Swatch } from './row-menu'
import { Island, POP_ISLANDS, Tip, quietly } from './ui'

const TAG_COLOURS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

/**
 * A tag's icon that changes its colour on a click, as a group's icon opens its
 * picker: the swatches in a small popover, the one in use ringed; picked again,
 * the colour comes off. A span, not a button: it sits inside rows that are
 * buttons, and a press never reaches the row or starts its drag.
 */
export function TagColourPick({ tag, color, className }: { tag: string; color?: string | null; className?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const pick = (one: string): void => {
    const was = color ?? null
    const next = was === one ? null : one
    setOpen(false)
    void haligtree.setTag(tag, { color: next }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, { color: was }))))
  }
  return (
    <Popover open={open} onOpenChange={(next) => (next && chime('open'), setOpen(next))}>
      <PopoverTrigger asChild>
        <span role="button" tabIndex={-1} data-tag-colour={tag} aria-label={`Change the colour of #${tag}`} title="Change colour"
          className="mf-hit relative -m-0.5 grid shrink-0 place-items-center rounded-md p-0.5 transition-colors hover:bg-foreground/10"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => (event.stopPropagation(), event.preventDefault(), setOpen(!open))}>
          <TagIcon tag={tag} color={color} className={className} />
        </span>
      </PopoverTrigger>
      {/* The islanded popover's anatomy (the marked-day popover's Colour row, milestones.tsx): a small heading over an
          island holding the nine as one line of squares, the one worn ticked. */}
      <PopoverContent align="start" className={`w-auto gap-0 p-3 ${POP_ISLANDS}`} onClick={(event) => event.stopPropagation()}>
        <Island compact title="Colour">
          <div role="radiogroup" aria-label={`#${tag}'s colour`} className="flex flex-nowrap items-center gap-0.5 px-1.5 py-1">
            {TAG_COLOURS.map((one) => (
              <Tip key={one} label={one[0].toUpperCase() + one.slice(1)}>
                <button type="button" role="radio" aria-checked={color === one} aria-label={one} data-tag-swatch={one} onClick={() => pick(one)}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-150 hover:bg-accent motion-reduce:transition-none">
                  <Swatch color={`var(--tt-color-text-${one})`} on={color === one} />
                </button>
              </Tip>
            ))}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  )
}
