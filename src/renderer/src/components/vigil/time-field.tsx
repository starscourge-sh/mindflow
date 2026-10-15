import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'

/** "9", "930", "9:30", "21.30", "9pm", "9:30 am" as "09:30" or "21:30"; null when it is not a time. */
export function readTime(words: string): string | null {
  const found = words.trim().toLowerCase().match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!found) return null
  let hours = Number(found[1])
  const minutes = Number(found[2] ?? 0)
  const half = found[3]?.[0]
  if (half) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (half === 'p' ? 12 : 0)
  }
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const minutesOf = (hhmm: string): number => {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}
const asTime = (total: number): string => {
  const day = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`
}
/** Every half hour of the day, for the list under the field. */
const HALVES = Array.from({ length: 48 }, (_, n) => asTime(n * 30))

/**
 * A time of day in Vigil's own look, never the system's clock field: type it
 * any way ("9pm", "2130", "9:30"), step it with ↑ ↓ (a quarter hour, ⇧ an
 * hour), or pick from the half hours listed under it. Enter or leaving keeps
 * it; Esc puts back what it was. The value goes in and out as "HH:MM".
 */
export function TimeField({ value, onChange, label, className }: { value: string; onChange: (hhmm: string) => void; label: string; className?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => setDraft(value), [value])
  const typed = readTime(draft)
  const keep = (hhmm: string | null): void => {
    if (hhmm && hhmm !== value) onChange(hhmm)
    setDraft(hhmm ?? value)
  }
  // The nearest half hour in view, as the list opens or the time changes.
  useEffect(() => {
    if (!open) return
    const near = asTime(Math.round(minutesOf(typed ?? value) / 30) * 30)
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-time="${near}"]`)?.scrollIntoView({ block: 'center' }))
  }, [open, typed, value])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          data-time-field={label}
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-invalid={draft.trim() !== '' && !typed ? true : undefined}
          inputMode="numeric"
          className={cn('h-8 w-24 tabular-nums', className)}
          value={draft}
          onFocus={(event) => (event.currentTarget.select(), setOpen(true))}
          onClick={() => setOpen(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => (keep(typed), setOpen(false))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              keep(typed)
              setOpen(false)
            } else if (event.key === 'Escape') {
              // Answered here, so a sheet around it stays open.
              event.stopPropagation()
              setDraft(value)
              setOpen(false)
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              const step = (event.shiftKey ? 60 : 15) * (event.key === 'ArrowUp' ? 1 : -1)
              const next = asTime(minutesOf(typed ?? value) + step)
              setDraft(next)
              onChange(next)
            }
          }}
        />
      </PopoverAnchor>
      <PopoverContent align="start" className="w-28 gap-0 p-1" onOpenAutoFocus={(event) => event.preventDefault()}
        // A click on the field itself is not "outside": it keeps the list open.
        onInteractOutside={(event) => (event.target as HTMLElement | null)?.closest?.('[data-time-field]') && event.preventDefault()}>
        <div ref={list} role="listbox" aria-label={label} className="flex max-h-56 flex-col overflow-y-auto">
          {HALVES.map((one) => (
            <button key={one} type="button" role="option" aria-selected={one === value} data-time={one} tabIndex={-1}
              // Picked before the field's blur, so the field keeps the pick, not its draft.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (chime('tap'), keep(one), setOpen(false))}
              className={`rounded-md px-2.5 py-1 text-left text-control tabular-nums transition-colors hover:bg-accent ${one === value ? 'bg-accent font-semibold text-foreground' : 'text-foreground'}`}>
              {one}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
