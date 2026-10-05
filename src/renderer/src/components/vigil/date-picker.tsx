import { chime } from '@/lib/sound'
import { useState, type ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

/**
 * A date, picked from shadcn's calendar in a popover rather than the
 * system's own picker, which ignores the theme. With `time`, a time under
 * it. The value goes in and out as an ISO string, or null for none.
 */
export function DatePicker({ value, onChange, time = false, placeholder = 'Pick a date', children, className = '' }: {
  value: string | null
  onChange: (iso: string | null) => void
  time?: boolean
  placeholder?: string
  /** What the button shows in place of the date, if anything. */
  children?: ReactNode
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const date = value ? new Date(value) : undefined
  const clock = date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '09:00'
  const at = (day: Date, hhmm = clock): string => {
    const [hours, minutes] = hhmm.split(':').map(Number)
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time ? hours : 12, time ? minutes : 0).toISOString()
  }
  const shown = date
    ? date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) })
    : placeholder
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control hover:bg-accent hover:text-foreground ${date ? '' : 'text-muted-foreground'} ${className}`}>
          {children ?? (
            <>
              <CalendarDays className="size-4 shrink-0" />
              <span className="truncate">{shown}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(day) => {
            if (!day) return
            chime('tap')
            onChange(at(day))
            if (!time) setOpen(false)
          }}
        />
        <div className="flex items-center gap-2 border-t p-2">
          {time && (
            <Input type="time" className="h-8 w-28" value={clock} onChange={(event) => date && event.target.value && onChange(at(date, event.target.value))} />
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => (chime('tap'), onChange(at(new Date())))}>
            Today
          </Button>
          {value && (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => { chime('off'); onChange(null); setOpen(false) }}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
