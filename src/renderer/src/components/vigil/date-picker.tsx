import { chime } from '@/lib/sound'
import { useState, type ReactNode } from 'react'
import * as chrono from 'chrono-node'
import { CalendarDays } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Island, IslandRow } from './ui'
import { dayMonth, dayjs } from '../../../../main/dates'

/** A day said in words, "in 3 months" or "next friday", or null; "3 months" alone means from now. */
const said = (words: string): Date | null =>
  words.trim() ? chrono.parseDate(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words, new Date(), { forwardDate: true }) : null

/**
 * A date, picked from shadcn's calendar in a popover rather than the
 * system's own picker, which ignores the theme. With `time`, a time under
 * it. The value goes in and out as an ISO string, or null for none. With
 * `suggest`, it can be said in words too, and those ways are offered first.
 */
export function DatePicker({ value, onChange, time = false, placeholder = 'Pick a date', suggest, children, lead, className = '' }: {
  value: string | null
  onChange: (iso: string | null) => void
  time?: boolean
  placeholder?: string
  /** Ways to say a day, each shown with the date it lands on: "in 3 months". */
  suggest?: string[]
  /** What the button shows in place of the date, if anything. */
  children?: ReactNode
  /** A quiet word before the date saying what it is ("Caught"). */
  lead?: string
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState('')
  const typed = said(words)
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
              <span className="truncate">{lead && <span className="mr-1.5 text-muted-foreground/80">{lead}</span>}{shown}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      {/* The day and the time each an island, the way Settings groups its rows. */}
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        {suggest && (
          // Linear's way: say when, or take one of a few, each with the day it lands on.
          <Island compact title="Say when">
            <input
              autoFocus
              value={words}
              onChange={(event) => setWords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !typed) return
                chime('tap')
                onChange(at(typed))
                setWords('')
                setOpen(false)
              }}
              placeholder="Try: in 3 months, next friday…"
              aria-label="When, in words"
              className="w-full bg-transparent px-2.5 py-1.5 text-control outline-none placeholder:text-foreground/70"
            />
            {(words.trim() ? (typed ? [[words.trim(), typed] as const] : []) : suggest.flatMap((one) => { const day = said(one); return day ? [[one, day] as const] : [] })).map(([label, day]) => (
              <button key={label} type="button" onClick={() => { chime('tap'); onChange(at(day)); setWords(''); setOpen(false) }}
                className="flex w-full items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-control hover:bg-accent">
                <span className="first-letter:uppercase">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{dayMonth(day)}</span>
              </button>
            ))}
            {words.trim() && !typed && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No day in that yet</p>}
          </Island>
        )}
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
