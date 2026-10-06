import { chime } from '@/lib/sound'
import { useState, type ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Island, IslandRow } from './ui'
import { dayMonth, dayjs } from '../../../../main/dates'

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
  const clock = date ? dayjs(date).format('HH:mm') : '09:00'
  const at = (day: Date, hhmm = clock): string => {
    const [hours, minutes] = hhmm.split(':').map(Number)
    return dayjs(day).startOf('day').hour(time ? hours : 12).minute(time ? minutes : 0).toISOString()
  }
  const shown = date ? `${dayMonth(date)}${time ? `, ${dayjs(date).format('H:mm')}` : ''}` : placeholder
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
      {/* The day and the time each an island, the way Settings groups its rows. */}
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        <Island compact title="Day">
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
        </Island>
        {time && (
          <Island compact title="Time">
            <IslandRow label="At" className="px-2.5 py-1">
              <Input type="time" className="h-7 w-28" value={clock} onChange={(event) => date && event.target.value && onChange(at(date, event.target.value))} />
            </IslandRow>
          </Island>
        )}
        <div className="mt-2 flex items-center gap-2">
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
