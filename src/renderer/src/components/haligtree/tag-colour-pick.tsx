import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { TagIcon } from './tag-icon'
import { quietly } from './ui'

export const TAG_COLOURS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

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
          className="-m-0.5 grid shrink-0 place-items-center rounded-sm p-0.5 transition-colors hover:bg-foreground/10"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => (event.stopPropagation(), event.preventDefault(), setOpen(!open))}>
          <TagIcon tag={tag} color={color} className={className} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" onClick={(event) => event.stopPropagation()}>
        <div role="radiogroup" aria-label={`#${tag}'s colour`} className="flex items-center gap-1.5">
          {TAG_COLOURS.map((one) => (
            <button key={one} type="button" role="radio" aria-checked={color === one} aria-label={one} data-tag-swatch={one} onClick={() => pick(one)}
              className={`size-5 rounded-full transition-[scale] duration-150 ease-out active:scale-95 motion-reduce:transition-none ${color === one ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background' : ''}`}
              style={{ background: `var(--tt-color-text-${one})` }} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
