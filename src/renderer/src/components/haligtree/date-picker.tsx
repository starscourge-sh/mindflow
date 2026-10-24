import { chime } from '@/lib/sound'
import { clock } from '@/lib/clock'
import { useState, type ReactNode } from 'react'
import { datesIn } from '../../../../main/task-words'
import { CalendarDays } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Island, IslandRow, Tip } from './ui'
import { Chips } from './display'
import { TimeField } from './time-field'
import { dayMonth, dayjs } from '../../../../main/dates'

/** What it holds, worked out only when it is drawn: inside a closed popover, never. */
function Later({ children }: { children: () => ReactNode }): ReactNode {
  return children()
}

/** A day said in words, "in 3 months" or "next friday", or null; "3 months" alone means from now. */
const said = (words: string): Date | null =>
  words.trim() ? (datesIn(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words)[0]?.date ?? null) : null

/**
 * A date, picked from shadcn's calendar in a popover rather than the
 * system's own picker, which ignores the theme. With `time`, a time under
 * it. The value goes in and out as an ISO string, or null for none. With
 * `suggest`, it can be said in words too, and those ways are offered first.
 */
export function DatePicker({ value, onChange, time = false, placeholder = 'Pick a date', suggest, children, lead, className = '', startOpen = false, chip = false, quick = false, tip }: {
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
  /** Open as it first shows: "Pick a date…" from a menu lands here with the calendar up. */
  startOpen?: boolean
  /**
   * The children are a date shown inside something else (a task row, a card
   * you drag): pressable in place, with only `className` for its look, and a
   * press never reaches what it sits in.
   */
  chip?: boolean
  /** Today, Tomorrow, Next week and No date on top, one press each. */
  quick?: boolean
  /** Said on hover, over the date. */
  tip?: ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(startOpen)
  const [words, setWords] = useState('')
  // With words to say when, they and the month are two tabs of one small panel: side by side they took twice the room.
  const [pane, setPane] = useState<'say' | 'day'>('say')
  const typed = said(words)
  const date = value ? new Date(value) : undefined
  const hhmm24 = date ? dayjs(date).format('HH:mm') : '09:00'
  const at = (day: Date, hhmm = hhmm24): string => {
    const [hours, minutes] = hhmm.split(':').map(Number)
    return dayjs(day).startOf('day').hour(time ? hours : 12).minute(time ? minutes : 0).toISOString()
  }
  const shown = date ? `${dayMonth(date)}${time ? `, ${clock(date)}` : ''}` : placeholder
  return (
    <Popover open={open} onOpenChange={(next) => (chip && next && chime('open'), setOpen(next))}>
      {chip ? (
        <Tip label={open ? '' : tip ?? ''}>
          <PopoverTrigger asChild>
            {/* A span, not a button: it sits inside rows that are buttons. Held to itself, so the row never opens or starts a drag under it. */}
            <span role="button" tabIndex={0} aria-label={typeof tip === 'string' ? tip : 'Change the date'} data-date-chip
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                if (!open) chime('open')
                setOpen(!open)
              }}
              className={`-mx-1 -my-1 cursor-pointer rounded px-1 py-1 transition-colors hover:bg-accent/70 data-[state=open]:bg-accent ${className}`}>
              {children}
            </span>
          </PopoverTrigger>
        </Tip>
      ) : (
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
      )}
      {/* The day and the time each an island, the way Settings groups its rows. */}
      <PopoverContent align="start" collisionPadding={8} onOpenAutoFocus={(event) => { if (!suggest) return; event.preventDefault(); (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>('input[aria-label="When, in words"]')?.focus() }} className="w-auto max-h-[var(--radix-popover-content-available-height)] gap-0 overflow-y-auto overscroll-contain p-2" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        {quick && (
          // The usual moves first, one press each, the way Todoist puts them over its calendar.
          <Island compact title="Move to">
            {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => {
              const day = dayjs().add(days, 'day').toDate()
              return (
                <button key={label} type="button" data-quick={label} onClick={() => { chime('tap'); onChange(at(day)); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-control hover:bg-accent focus-visible:bg-accent">
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{label === 'Next week' ? dayjs(day).format('ddd D MMM') : dayjs(day).format('ddd')}</span>
                </button>
              )
            })}
            {value && (
              <button type="button" data-quick="No date" onClick={() => { chime('off'); onChange(null); setOpen(false) }}
                className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-control hover:bg-accent focus-visible:bg-accent">
                No date
              </button>
            )}
          </Island>
        )}
        {suggest && <Chips className="mb-2" options={[{ id: 'say', label: 'Say when' }, { id: 'day', label: 'Pick a day' }]} on={(id) => id === pane} pick={(id) => (chime('tap'), setPane(id as 'say' | 'day'))} />}
        {/* Both drawn in one cell, the other one hidden: the panel keeps the taller one's height, so the tabs never move under the pointer. */}
        <div data-when-panes className={suggest ? 'grid w-56 [&>*]:col-start-1 [&>*]:row-start-1' : 'contents'}>
        {suggest && (
          // Linear's way: say when, or take one of a few, each with the day it lands on.
          <Island compact className={pane === 'say' ? undefined : 'invisible'}>
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
            {/* Worked out only once it is open: read from the words on every draw of a closed picker, they held up the page it is on. */}
            <Later>{() => (words.trim() ? (typed ? [[words.trim(), typed] as const] : []) : suggest.flatMap((one) => { const day = said(one); return day ? [[one, day] as const] : [] })).map(([label, day]) => (
              <button key={label} type="button" onClick={() => { chime('tap'); onChange(at(day)); setWords(''); setOpen(false) }}
                className="flex w-full items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-control hover:bg-accent">
                <span className="first-letter:uppercase">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{dayMonth(day)}</span>
              </button>
            ))}</Later>
            {words.trim() && !typed && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No day in that yet</p>}
          </Island>
        )}
        <Island compact title={suggest ? undefined : 'Day'} className={suggest ? `!mt-0 [&>div]:flex [&>div]:justify-center ${pane === 'day' ? '' : 'invisible'}` : undefined}>
        <Calendar
          // In the tabbed panel the month fills its pane, its padding a step tighter, so neither tab sits in empty room.
          className={suggest ? 'p-1 [--cell-size:1.75rem]' : undefined}
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
        </div>
        {time && (
          <Island compact title="Time">
            <IslandRow label="At" className="px-2.5 py-1">
              <TimeField label="Time" className="h-7" value={hhmm24} onChange={(hhmm) => date && onChange(at(date, hhmm))} />
            </IslandRow>
          </Island>
        )}
        {/* With the quick moves on top, Today and No date are there already. */}
        {/* With words to say when, Today is not offered here (it sat under an empty half of the words' tab); Clear stays while there is a day to clear. */}
        {!quick && (!suggest || value) && (
        <div className="mt-2 flex items-center gap-2">
          {!suggest && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => (chime('tap'), onChange(at(new Date())))}>
              Today
            </Button>
          )}
          {value && (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => { chime('off'); onChange(null); setOpen(false) }}>
              Clear
            </Button>
          )}
        </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
