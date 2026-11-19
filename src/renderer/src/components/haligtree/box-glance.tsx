import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'

import { Search, Sun } from '@/components/ui/icons'
import { useMinute } from '@/lib/clock'
import { useEvents, useLayers } from '@/lib/events'
import { CARD } from '@/lib/float'
import { haligtree, unloaded, useLive, type Task } from '@/lib/haligtree'
import { keepTyped } from '@/lib/keep-typed'
import { byKeys } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { dayKey, dayjs } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'
import { CaptureList, type CaptureMeta } from '../capture-list'
import { EventLine, allDayOn, colorFor, macShown, span, type Shown } from './calendar-events'
import { Orb } from './orb'
import { ReadsIn } from '@/lib/reads-in'
import { useThumbsRead, warmThumb } from '@/lib/notes'
import { readCovers } from './grain'
import { TabShape } from './tab-row'
import { TaskInput, keptIn, useKept, type Kept } from './task-input'
import { TodayPanel, addTyped, pasteTasks } from './today-panel'
import { Kbd, Tip, useListKeys } from './ui'

/**
 * Glance tabs on quick capture's one line (Settings: “One line to start” with “Glance tabs”): a row of small tabs
 * standing on the pill, and under the pill what the chosen tab holds, to look at and act on without opening the main
 * window. Write is the pill as it always was. Notes finds a note by name, or names a new one. Today shows today's
 * events and tasks, and its line adds a task for today.
 *
 * Each list is the one the side panel and the main window draw (CaptureList, TodayPanel, the Calendar's EventLine),
 * read through the same readers: never a second copy. The pill itself never moves or changes size: the tabs stand in
 * the room the window keeps above it, and the glance hangs in the room it keeps below for the box a new line grows
 * it into (main's hint-room.ts), as the / and # lists do, so nothing of the window changes when a tab is chosen.
 */
export type Glance = 'write' | 'notes' | 'today'

/**
 * The tabs in the app's order: writing first, notes before tasks. Calendar and Review come next; the row, the keys
 * (⌃⌥4 and ⌃⌥5) and the code keep room for them.
 */
export const GLANCES: { id: Glance; label: string; /** What it is for, in its tip. */ does: string; keys: string; /** What its empty line says. */ line: string; icon?: ComponentType<{ className?: string }> }[] = [
  { id: 'write', label: 'Write', does: 'Catch a thought', keys: '⌃⌥1', line: '' },
  { id: 'notes', label: 'Notes', does: 'Find a note, or start one', keys: '⌃⌥2', line: 'Find a note, or name a new one…', icon: Search },
  { id: 'today', label: 'Today', does: 'Today’s events and tasks', keys: '⌃⌥3', line: 'Add a task for today…', icon: Sun }
]

/** How many notes the glance draws: the panel is a glance, and the line finds the rest. */
const NOTES = 30

/** What ↵ and ⌘↵ on the line do in the tab in front, said by its panel as it draws. */
type Acts = { enter?: () => void; make?: () => void }

export function BoxGlance({ on, pick, captures, onOpen }: {
  on: Glance
  pick: (to: Glance) => void
  captures: CaptureMeta[]
  /** A row opened: a note or an event in the main window, a task here in quick capture. */
  onOpen: (type: string, id: string) => void
}): React.JSX.Element {
  const [words, setWords] = useState('')
  // Words the Today line keeps as words (its chips' ×, ⌫ just after them), as Tasks' own line does.
  const kept = useKept()
  const line = useRef<HTMLInputElement>(null)
  const acts = useRef<Acts>({})
  // Today's tasks and events are read while the tabs stand, the same reads the Today glance makes, so it is drawn
  // whole in its first frame (useLive starts on what the same read last said): read only once Today was chosen, its
  // first frame was an empty card that then grew.
  useLive(haligtree.tasks, [] as Task[])
  const day = today(useMinute())
  useEvents(day.from.toISOString(), day.to.toISOString())
  // So too the pictures of the notes Notes opens on: which have one read, each made small and decoded, and the paper
  // drawings decoded, while the tabs stand. Asked only once Notes was chosen, they came frames after their rows.
  const pictured = useThumbsRead()
  useEffect(() => readCovers(), [])
  useEffect(() => {
    if (pictured) for (const one of latestNotes(captures).slice(0, NOTES)) warmThumb(one.id)
  }, [pictured, captures])
  // Each tab starts on an empty line, with the caret in it.
  useEffect(() => {
    setWords('')
    if (on !== 'write') line.current?.focus()
  }, [on])
  // ⇧⌘] and ⇧⌘[: the next tab and the one before, the Mac's own keys for it (⌘] and ⌘[ stay Forward and Back).
  // ⌃⌥1 to ⌃⌥3: a tab by its place in the row. Heard before the writing, which would take them as words.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // By the key's place or its sign: a key you moved in Settings is pressed again as its default by its sign alone (lib/keys.ts).
      const step = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey ? (event.code === 'BracketRight' || event.key === ']' || event.key === '}' ? 1 : event.code === 'BracketLeft' || event.key === '[' || event.key === '{' ? -1 : 0) : 0
      const place = event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && /^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(5)) - 1 : -1
      const to = step ? GLANCES[(GLANCES.findIndex((one) => one.id === on) + step + GLANCES.length) % GLANCES.length] : GLANCES[place]
      if (!to) return
      event.preventDefault()
      event.stopPropagation()
      pick(to.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [on, pick])

  // The pill's own hairline and shadow, drawn here while the tabs stand on it (App.tsx takes them off the card), with
  // a gap where the chosen tab stands: its fill is the pill's, see-through on glass, so laid over the pill's edge it
  // let that edge show through as a seam. Measured as the tab changes and as the row's size does (a text size).
  const edge = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const row = document.querySelector('[data-glance-tabs]')
    const place = (): void => {
      const chosen = document.querySelector(`[data-glance-tab="${on}"]`)?.getBoundingClientRect()
      const card = document.querySelector('.app-container')?.getBoundingClientRect()
      if (!chosen?.width || !card?.width || !edge.current) return
      // Its feet reach 7px past either side of it, where they meet the pill (tab-row.tsx, Foot).
      edge.current.style.setProperty('--glance-from', `${chosen.left - card.left - 7}px`)
      edge.current.style.setProperty('--glance-to', `${chosen.right - card.left + 7}px`)
    }
    place()
    const watch = new ResizeObserver(place)
    if (row) watch.observe(row)
    return () => watch.disconnect()
  }, [on])

  const tab = GLANCES.find((one) => one.id === on) ?? GLANCES[0]
  const Icon = tab.icon
  const above = useHangsAbove()
  // ↵ acts on the line (a note opened, a task added); ⌘↵ in Notes starts a note with the name typed. ↓ and ↑ are the
  // list's (useListKeys, by data-list-line), and Esc goes back to Write (App's foldPill), then puts the box away.
  const onLineKey = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    // ⌘↵ is never the draft's here (it waits behind the line): in Notes it starts the note named, in Today it adds as ↵ does.
    const act = event.metaKey && on === 'notes' ? acts.current.make : acts.current.enter
    if (event.metaKey) event.preventDefault()
    if (!act) return
    event.preventDefault()
    act()
  }
  return (
    <>
      <span ref={edge} data-glance-edge aria-hidden />
      {/* A press keeps the caret where it is (the writing, or the tab's line): a tab is chosen, never focused. */}
      <div data-glance-tabs role="tablist" aria-label="Glance tabs" className="flex items-end gap-1.5 text-control font-medium">
        {GLANCES.map((one) => {
          const chosen = one.id === on
          return (
            <Tip key={one.id} label={`${one.does}  ${one.keys}`}>
              <button type="button" role="tab" tabIndex={-1} data-glance-tab={one.id} aria-selected={chosen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(one.id)}
                // Pressed from its foot, so the chosen one never lifts off the pill as it answers.
                className={`relative flex shrink-0 origin-bottom cursor-pointer items-center px-3 whitespace-nowrap transition-[scale] duration-[120ms] outline-none active:scale-[0.97] mb-[7px] h-6 ${chosen ? 'text-foreground' : 'rounded-full text-muted-foreground hover:text-foreground'}`}>
                {/* The chosen one stands on the pill in the pill's own material, the app's tab shape: tab and line are
                    one surface. Its glass (windows/box.tsx) runs a little way into the pill, so the two join. The
                    others are a round of the same material (main.css, data-glance-round). Each look is a shape of its
                    own, made new as a tab gains or loses the choice, so it is whole in the first frame: worn by the
                    button itself, the round's fill came in by every button's 120ms fade while its hairline came at
                    once, and a bare ring showed for a few frames at every change. */}
                {/* Every tab's word stands in the same 24px box, 7px over the pill, so the three words share one line
                    and one top (the user, 13 Nov: "aligned?": the chosen one, as tall as the row, sat its word lower).
                    Only its shape reaches on down those 7px to stand on the pill. */}
                {chosen
                  ? <><span data-glance-glass aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -bottom-[19px] rounded-[9px]" /><span data-glance-shape aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -bottom-[7px]"><TabShape /></span></>
                  : <span data-glance-glass data-glance-round aria-hidden className="pointer-events-none absolute inset-0 rounded-full" />}
                <span className="relative">{one.label}</span>
              </button>
            </Tip>
          )
        })}
      </div>
      {on !== 'write' && (
        <>
          {/* The tab's own line, where the writing's is: its icon in the kind icon's place, its words where the
              writing's start, the key that acts where ⌘↵ sits. The two ends still move the window (main.css). */}
          <div data-glance-line={on} data-list-line data-glance-above={above ? '' : undefined} className="absolute inset-x-0 top-0 z-20 flex h-[var(--mf-pill-h)] items-center"
            onPasteCapture={on === 'today' ? (event) => pasteTasks(event, 'today') : undefined}>
            <span data-pill-drag="start" className="flex h-full w-[4.75rem] shrink-0 items-center justify-end pr-1.5">
              <span className="flex size-8 items-center justify-center text-muted-foreground [&_svg]:size-5">{Icon && <Icon />}</span>
            </span>
            {on === 'today' ? (
              <TaskInput inputRef={line} value={words} onChange={setWords} placeholder={tab.line} label={tab.line} onKeyDown={onLineKey} className="mf-glance-words" kept={kept} />
            ) : (
              <input ref={line} data-glance-input value={words} onChange={(event) => setWords(event.target.value)} onKeyDown={onLineKey}
                placeholder={tab.line} aria-label={tab.line} spellCheck={false} autoComplete="off"
                className="mf-glance-words min-w-0 flex-1 bg-transparent text-foreground caret-foreground outline-none placeholder-shown:text-ellipsis" />
            )}
            <span data-pill-drag="end" className="flex h-full w-[4.5rem] shrink-0 items-center justify-end pr-5">
              <kbd className="font-sans text-key text-muted-foreground">↵</kbd>
            </span>
          </div>
          {/* Drawn whole, its rows' pictures with them: at each open the glance waits for pictures not yet decoded in
              this window (150 ms at most, lib/decoded.ts), where its rows came first and their pictures frames later. */}
          <ReadsIn className="contents">
            <Panel on={on} above={above}>
              {on === 'notes'
                ? <NotesGlance words={words} captures={captures} acts={acts} onOpen={onOpen} onMade={() => setWords('')} onBack={setWords} />
                : <TodayGlance words={words} kept={kept} acts={acts} onOpen={onOpen} onAdded={() => setWords('')} onBack={(text) => (setWords((now) => (now.trim() ? `${text} ${now}` : text)), line.current?.focus())} />}
            </Panel>
          </ReadsIn>
        </>
      )}
    </>
  )
}

/**
 * The glance under the pill: the app's one floating material (lib/float.ts), as wide as the pill, as tall as what it
 * holds up to the room the window keeps there, then it scrolls. By a pointer it grows down out of the pill, the
 * shared entrance (`mf-pop`); by a key, and from one tab to the next, it is simply there.
 */
function Panel({ on, above, children }: { on: Glance; above: boolean; children: React.ReactNode }): React.JSX.Element {
  const [keyed] = useState(byKeys)
  return (
    <div data-glance-panel={on} data-state="open" data-side={above ? 'top' : 'bottom'} data-glance-above={above ? '' : undefined} data-keyed={keyed ? '' : undefined} role="region" aria-label={GLANCES.find((one) => one.id === on)?.label}
      className={`mf-pop ${CARD} flex flex-col overflow-hidden text-sm`}>
      <div data-glance-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">{children}</div>
    </div>
  )
}

/** Today, from its start to the next day's start: one place for the span, so the reads made early are the same reads. */
const today = (now: Date): { from: ReturnType<typeof dayjs>; to: ReturnType<typeof dayjs> } => {
  const from = dayjs(now).startOf('day')
  return { from, to: from.add(1, 'day') }
}

/** Less room than this under the pill (the box near the screen's foot) and the glance hangs above its tabs instead. */
const LOW = 120
/** The tabs' row, standing in the room above the pill (main.css). */
const TABS_HIGH = 30 + 8

/**
 * Where the glance hangs: under the pill, in the room main keeps there for the box a new line grows it into; or,
 * with the pill near the screen's foot and so little room under it, above the tabs, in the room main keeps there
 * instead (hint-room.ts): never squeezed to a sliver. Read again as main changes the room (windows/box.tsx says so
 * with a resize), never as the glance draws.
 */
function useHangsAbove(): boolean {
  const read = (): boolean => {
    const style = getComputedStyle(document.documentElement)
    const under = parseFloat(style.getPropertyValue('--mf-room')) || 0
    const over = (parseFloat(style.getPropertyValue('--mf-room-top')) || 0) - TABS_HIGH
    return under < LOW && over > under
  }
  const [above, setAbove] = useState(read)
  useEffect(() => {
    const again = (): void => setAbove(read())
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [])
  return above
}

/** The notes Notes opens on: those in use, changed most recently first. */
const latestNotes = (captures: CaptureMeta[]): CaptureMeta[] =>
  captures.filter((one) => one.status !== 'discarded' && !one.archivedAt).sort((a, b) => (b.editedAt ?? b.capturedAt).localeCompare(a.editedAt ?? a.capturedAt))

/**
 * Notes: the ones changed most recently, and typing narrows them by name with ⌘K's own matcher (main/book-find.ts).
 * ↵ opens the lit one in the main window; ⌘↵ starts a note with the name typed (lib/keep-typed.ts, as ⌘K's
 * "Keep … as a note" does: kept in the Inbox, said with Undo).
 */
function NotesGlance({ words, captures, acts, onOpen, onMade, onBack }: {
  words: string
  captures: CaptureMeta[]
  acts: React.RefObject<Acts>
  onOpen: (type: string, id: string) => void
  onMade: () => void
  /** The note taken back: its name is on the line again. */
  onBack: (text: string) => void
}): React.JSX.Element {
  const asker = useId()
  const typed = words.trim()
  // Asked at every letter: a reply for words since changed is dropped, so an older one never lands over a newer.
  const [found, setFound] = useState<{ words: string; ids: string[] } | null>(null)
  useEffect(() => {
    if (!typed) return
    let old = false
    void window.api.captures.find(typed, ['capture'], asker).then((list) => void (old || setFound({ words: typed, ids: list.filter((one) => one.type === 'capture').map((one) => one.id) })))
    return () => void (old = true)
  }, [typed, asker])
  const shown = useMemo(() => {
    const live = captures.filter((one) => one.status !== 'discarded' && !one.archivedAt)
    const latest = latestNotes(captures)
    if (!typed) return latest.slice(0, NOTES)
    // By name, as ⌘K's "Names only" narrows: every word typed is in the note's name. Until the first answer is in,
    // the latest ones narrowed the same way stand in, so the list never blinks empty at the first letter.
    const parts = typed.toLowerCase().split(/\s+/)
    const byId = new Map(live.map((one) => [one.id, one]))
    const pool = found ? found.ids.flatMap((id) => byId.get(id) ?? []) : latest
    return pool.filter((one) => parts.every((part) => one.label.toLowerCase().includes(part))).slice(0, NOTES)
  }, [captures, typed, found])
  const open = (index: number): void => void (shown[index] && onOpen('capture', shown[index].id))
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: open })
  // The first one is lit from the start, as in every picker, so ↵ works at once, and again at each letter typed:
  // the light on the list's own first row, so the first ↓ takes it to the second.
  useEffect(() => setCursor(0), [typed, setCursor])
  const at = shown.length ? Math.max(0, Math.min(cursor, shown.length - 1)) : -1
  const make = typed ? (): void => (onMade(), void keepTyped('note', typed, (type, id) => window.api.openInHome(type, id), onBack)) : undefined
  acts.current = { enter: shown.length ? () => open(at) : make, make }
  if (unloaded(captures)) return <div className="mf-after-a-beat px-2 py-1.5"><Orb label="Reading your notes" /></div>
  return (
    <div data-glance-notes className="flex flex-col">
      {shown.length > 0 && <CaptureList groups={[['', shown]]} cursor={at} onPick={(id) => onOpen('capture', id)} />}
      {!shown.length && !typed && (
        <p data-glance-empty className="px-2 py-1.5 text-body text-foreground/85"><span className="font-semibold text-foreground">No notes yet.</span> Name one on the line above and <Kbd>⌘↵</Kbd> starts it.</p>
      )}
      {!shown.length && typed && found?.words === typed && (
        <p data-glance-empty className="px-2 pt-1.5 text-body text-foreground/85"><span className="font-semibold text-foreground">No note has that name.</span></p>
      )}
      {/* Never a dead end: the words typed start a note, from a real button with its key on it. */}
      {make && (
        <button type="button" data-glance-make tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={make}
          className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body text-foreground transition-[background-color,scale] duration-[120ms] hover:bg-accent/60 active:scale-[0.97]">
          <span className="min-w-0 flex-1 truncate">Start a note called {quoted(typed, 60)}</span>
          <Kbd>{shown.length ? '⌘↵' : '↵'}</Kbd>
        </button>
      )}
    </div>
  )
}

/**
 * Today: what is on today (the Calendar's own rows, events over already left out as its Upcoming leaves them), then
 * the side panel's Today list as it is: what is late on top, then today's, each ticked in place. ↵ on the line adds
 * the words as a task for today through the app's one task reader, so a day in the words still wins.
 */
function TodayGlance({ words, kept, acts, onOpen, onAdded, onBack }: {
  words: string
  kept: Kept
  acts: React.RefObject<Acts>
  onOpen: (type: string, id: string) => void
  onAdded: () => void
  /** The task taken back: its words are on the line again. */
  onBack: (text: string) => void
}): React.JSX.Element {
  const now = useMinute()
  const { from, to } = today(now)
  const layers = useLayers(from.toDate(), to.toDate())
  const own = useEvents(from.toISOString(), to.toISOString())
  const list: Shown[] = [...own.filter((one) => layers.shown(one.calendarId)).map((one) => ({ ...one, color: colorFor(one, layers.colorOf(one.calendarId)) })), ...macShown(layers.macEvents)]
  const name = (one: Shown): string => (one.readOnly ? one.calendarId.replace(/^mac:/, '') : layers.calendars.find((cal) => cal.id === one.calendarId)?.name ?? 'Calendar')
  const key = dayKey(from)
  const events = [
    ...allDayOn(list, key).map((one) => ({ one, start: -1, said: `All day · ${name(one)}` })),
    ...list.filter((one) => !one.allDay && dayKey(one.start) === key && dayjs(one.end).isAfter(now)).map((one) => ({ one, start: dayjs(one.start).valueOf(), said: `${span(one.start, one.end)} · ${name(one)}` }))
  ].sort((a, b) => a.start - b.start)
  const typed = words.trim()
  // With words on the line ↵ adds them; with none it is the list's, and opens the task ↓ reached.
  acts.current = { enter: typed ? () => (onAdded(), addTyped(words, 'today', () => onBack(words), (kept.set([]), keptIn(kept.list, words)))) : undefined }
  return (
    <div data-glance-today className="flex flex-col">
      {events.length > 0 && (
        <section data-glance-events className="mb-1 flex flex-col">
          <h3 className="px-2 py-0.5 text-control font-medium text-muted-foreground">Events</h3>
          {events.map(({ one, said }) => (
            <EventLine key={one.key} data-glance-event={one.key} tabIndex={-1} color={one.color} title={one.title || 'New event'} said={said}
              onClick={() => (chime('open'), one.readOnly ? onOpen('view', 'calendar') : onOpen('event', one.key))} />
          ))}
          <h3 className="mt-1 px-2 py-0.5 text-control font-medium text-muted-foreground">Tasks</h3>
        </section>
      )}
      <TodayPanel glance onOpen={(id) => onOpen('task', id)} />
    </div>
  )
}
