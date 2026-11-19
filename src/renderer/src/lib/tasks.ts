import { chime, tear, type Cue } from './sound'
import { unquoted } from '../../../main/clip'
import { binned, seeTheBin } from './to-bin'
import { binFlight } from './fly-home'
import { expectBack } from './room'
import { splitTags, taskSaid, haligtree, type Made, type Task } from './haligtree'
import { flying } from './capture-links'
import { ask, refuse, toast } from '@/components/haligtree/ui'
import { PRIORITY_NAMES, bucketOf, monthKey, readTask, readySaid } from '../../../main/task-words'
import { ago, dated, dayjs, dayKey, daysSince, num, startOfDay, whenInLine, plural } from '../../../main/dates'
import { tasksSaid, type ListTask } from '../../../main/day-lines'
import { openSort } from './sort-out'
import { quoted } from '../../../main/clip'

/**
 * Each priority its own colour from the theme, as Todoist's: Urgent red, High orange, Medium blue, Low grey (they were
 * all one orange in the box, its chip and the marks). The marks' shapes still tell them apart without colour: a
 * square with "!", then three, two and one bars. The one table for every list, chip, Calendar tick and lit word.
 */
export const PRIORITY_TINT: Record<number, 'red' | 'orange' | 'blue' | 'gray'> = { 1: 'red', 2: 'orange', 3: 'blue', 4: 'gray' }
/** The level a priority's words say: "!!!" or "p1" is Urgent, "!" or "p3" Medium (main/task-words.ts reads them so). */
export const levelSaid = (words: string): number => (words.trim().startsWith('!') ? 4 - words.trim().length : Number(words.trim()[1]))

/**
 * Everything that becomes a task: words typed, a capture, several captures,
 * a nugget to study, a line picked out of a note.
 */
type TaskSource =
  | { text: string; today?: boolean; origin?: string; /** Words read as a date or a priority kept as plain words (task-input.tsx, the chip's × or ⌫). */ plain?: { from: number; to: number }[] }
  | { capture: string; /** Words in its first line kept as plain text, not read as a date or a priority. */ plain?: { from: number; to: number; text: string }[]
      /** One task however many lines it has; otherwise a list makes a task a line. */ whole?: boolean }
  | { captures: string[]; text: string }
  | { item: string; text: string; /** Where the note's own name sits in the words, read as words and never as a date. */ plain?: { from: number; to: number } }

/**
 * The one way anything is made a task: the same sound, the same words when
 * it joined one already there, and the same undo, from every place that
 * offers it. `said` is what the notice says, worked out from the new task
 * when it depends on where it landed. Gives back what was made, or null.
 */
export async function makeTask(
  from: TaskSource,
  said: string | ((made: Made) => string | Promise<string>) = 'Now a task',
  { onUndo, quiet = false, box }: { onUndo?: () => void; /** Made without a word: something else on screen already shows it. */ quiet?: boolean
    /** Sent from quick capture, whose send sound answered it: one sound, not two. 'away': the box went as it sent, so the
     * main window says it as well, with its own Undo, as a list made from the box is. */
    box?: 'here' | 'away' } = {}
): Promise<Made | null> {
  const [got, links] =
    'capture' in from ? [await flying(from.capture, 'task', () => haligtree.toTask(from.capture, from.plain, from.whole)), [from.capture]]
    : 'captures' in from ? [await haligtree.taskFrom(from.captures, from.text), from.captures]
    : 'item' in from ? [await haligtree.study(from.item, from.text, from.plain), [from.item]]
    : [await haligtree.addTask(from.text, from.origin, from.today, from.plain), from.origin ? [from.origin] : []]
  // A capture that already took an exit (promoted, resolved, let go) keeps it.
  if (got === 'not-open' || (!got && 'captures' in from)) {
    refuse(got === 'not-open' ? 'Only a capture still in the Inbox can become a task' : 'None of those is still in the Inbox, so there is nothing to make a task from')
    return null
  }
  // A page of mixed lines (links, sayings among the to-dos): nothing made,
  // the page opened in "Sort this out" so each line is picked, never one task of it all.
  if (got && 'mixed' in got) {
    openSort(got.mixed, 'capture' in from ? from.capture : null)
    return null
  }
  const made = got
  if (!made) {
    if ('capture' in from) refuse('That capture no longer exists, so it cannot become a task')
    return null
  }
  // Only what this took out of the Inbox goes back there on undo.
  const reopen = made.resolved ?? []
  if (quiet) return made
  // A list: a task a line, one notice and one Undo for every one.
  const all = [made, ...(made.also ?? [])]
  const joined = all.filter((one) => one.existed).length
  if (!box) chime(madeCue(all))
  const words = made.said ? `Made ${made.said}${joinedSaid(joined)}` : taskSaid(made, typeof said === 'function' ? await said(made) : said)
  toast(words, () => void Promise.all(all.map((one) => haligtree.unmakeTask(one.id, one.existed, links, reopen))).then(() => onUndo?.()), 'success',
    made.also?.length ? undefined : { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made.id) }, made.also?.length ? undefined : { type: 'task', id: made.id })
  if (box === 'away') window.api.sayInHome({ text: words, undo: all.map((one) => ({ id: one.id, existed: one.existed, links, reopen })), open: made.also?.length ? null : made.id } satisfies Said)
  return made
}
/** The one sound for tasks made, from every place: many ring; one knocks, or says no when it joined one already there. */
const madeCue = (all: { existed: boolean }[]): Cue => (all.length > 1 ? 'promote' : all[0]?.existed ? 'nope' : 'noted')
/** ". 2 were already on your list, so they joined those tasks", or nothing. */
const joinedSaid = (joined: number): string =>
  joined ? `. ${plural(joined, 'was already on your list, so it joined that task', 'were already on your list, so they joined those tasks')}` : ''

/**
 * A written list made tasks: each top line a task, the lines indented under
 * it its steps, a ticked line done, a #tag in a line that line's own. A line
 * named like an open task joins it rather than making it twice. One notice
 * for the lot, and its Undo takes every one back. Gives back what was made.
 *
 * The notice says where they went: a list of fourteen with one dated shows
 * one in Today, so it says the rest have no date and wait in Upcoming's
 * backlog, with “Show them”. `away`: the box is going as it makes them, so
 * the main window says it as well, with its own Undo.
 */
export async function makeListTasks(list: ListTask[], { today = false, onUndo, away = false, plain }: { today?: boolean; onUndo?: () => void; away?: boolean; plain?: { text: string; plain: { from: number; to: number }[] }[] } = {}): Promise<Made[]> {
  const made: Made[] = []
  for (const [index, line] of list.entries()) {
    // The words the box kept plain in this line, if the box read it as this line ("camping:" made "camping").
    const kept = plain?.[index] && plain[index].text.startsWith(line.text) ? plain[index].plain.filter((one) => one.to <= line.text.length) : undefined
    const one = await haligtree.addTask(line.text, undefined, today, kept)
    made.push(one)
    if (one.existed) continue
    if (line.steps.length) await haligtree.saveTask(one.id, { subtasks: line.steps })
    if (line.done) await haligtree.saveTask(one.id, { status: 'done' })
  }
  const joined = made.filter((one) => one.existed).length
  const fresh = new Set(made.filter((one) => !one.existed).map((one) => one.id))
  const undated = (await haligtree.tasks()).filter((task) => fresh.has(task.id) && task.status === 'open' && !task.waitingOn && !task.recurrence && placed(task) === null && !bucket(task)).length
  chime(madeCue(made))
  const said: Said = { text: `Made ${tasksSaid(list)}${joinedSaid(joined)}${undatedSaid(undated, fresh.size)}`, undo: made.map((one) => ({ id: one.id, existed: one.existed })), open: undated ? 'later' : made.length === 1 ? made[0].id : null }
  // Said in the box too, where its Undo also puts the list back in the box.
  if (away) window.api.sayInHome(said)
  say(said, onUndo)
  return made
}
/** ". 13 with no date are in Later", or nothing: Upcoming holds only tasks with a day to come since 8 Nov (37cf1e769). */
const undatedSaid = (undated: number, of: number): string =>
  !undated ? '' : undated === of ? (of === 1 ? '. It has no date, so it is in Later' : '. None has a date, so all are in Later')
    : `. ${num(undated)} with no date ${undated === 1 ? 'is' : 'are'} in Later`

/** A list's notice, sent as data so another window can say it: its words, what Undo takes back, and what “Show them” or “Open” opens. */
export type Said = { text: string; undo: { id: string; existed: boolean; /** The notes it came from: unlinked, and back in the Inbox. */ links?: string[]; reopen?: string[] }[]; open: 'later' | string | null }
function say(said: Said, onUndo?: () => void): void {
  toast(said.text,
    () => void Promise.all(said.undo.map((one) => haligtree.unmakeTask(one.id, one.existed, one.links ?? [], one.reopen ?? []))).then(() => onUndo?.()),
    'success',
    said.open === 'later' ? { label: 'Show them', key: 'S', run: () => window.api.openInHome('view', 'later') }
      : said.open ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', said.open!) } : undefined)
}
// Said here when quick capture made them as it went.
if (new URLSearchParams(location.search).get('view') === 'home') window.api.onSay?.((said) => say(said as Said))

/**
 * Several captures made one task: its name asked, offered the first one's
 * title to start from. Each capture is linked from it and leaves the inbox.
 */
export async function oneTask(ids: string[], first = ''): Promise<Made | null> {
  const text = await ask(`One task from these ${num(ids.length)}. What is it?`, 'e.g. sort out the freight rules by Thursday', { initial: first, action: 'Make the task' })
  if (!text) return null
  return makeTask({ captures: ids, text }, `One task, from ${num(ids.length)} captures`)
}

/** A note picked in a list, for "Make tasks": a capture, or a gem or piece of writing. */
export type TaskNote = { id: string; title: string; private?: boolean } & ({ capture: true; open: boolean } | { capture?: false })

/**
 * Several picked notes, a task each, made the way one is ("Make it a task" on
 * a capture, "Study this" on a gem) and linked to its note the same way. A
 * note that is a task already, or a capture already out of the Inbox, is left
 * as it is and the notice says so. One undo takes back every task this made.
 * Gives back how many were made.
 */
export async function makeTasks(notes: TaskNote[]): Promise<number> {
  if (!notes.length) return 0
  // A task already open for a note, made from it before: that note is skipped.
  const tasked = new Set((await haligtree.tasks()).filter((task) => task.status === 'open' && task.fromId).map((task) => task.fromId!))
  const already = notes.filter((note) => tasked.has(note.id))
  const closed = notes.filter((note) => !tasked.has(note.id) && note.capture && !note.open)
  const todo = notes.filter((note) => !already.includes(note) && !closed.includes(note))
  // Why some were left: "Skipped 2, already tasks", or both reasons counted.
  const reason = (n: number, why: 'task' | 'out'): string => (why === 'task' ? `already ${n === 1 ? 'a task' : 'tasks'}` : 'out of the Inbox')
  const left = already.length + closed.length
  const skipped = !left ? '' : already.length && closed.length
    ? `Skipped ${num(left)}: ${num(already.length)} ${reason(already.length, 'task')}, ${num(closed.length)} ${reason(closed.length, 'out')}`
    : `Skipped ${num(left)}, ${reason(left, already.length ? 'task' : 'out')}`
  if (!todo.length) {
    refuse(notes.length === 1 ? (already.length ? 'That one is a task already' : 'Only a capture still in the Inbox can become a task')
      : already.length && closed.length ? `Nothing to make. ${skipped}` : `Nothing to make: all ${num(left)} are ${already.length ? 'tasks already' : 'out of the Inbox'}`)
    return 0
  }
  // The first few fly to Today, as one does on its own; a long run just lands.
  // A page of mixed lines is not made one task: it is left, and the notice offers to sort it.
  const mixed: { id: string; text: string }[] = []
  const made = (await Promise.all(todo.map(async (note, at) => {
    const work = (): Promise<Made | null | 'not-open' | { mixed: string }> => (note.capture ? haligtree.toTask(note.id) : haligtree.study(note.id, `Study ${quoted(unquoted(note.title), 80)}`, { from: 7, to: 7 + unquoted(note.title).length }))
    const got = note.capture && at < 6 ? await flying(note.id, 'task', work) : await work()
    if (got && got !== 'not-open' && 'mixed' in got) return void mixed.push({ id: note.id, text: got.mixed })
    return got && got !== 'not-open' ? { made: got, note: note.id } : null
  }))).filter((one): one is { made: Made; note: string } => !!one)
  // Just one, a page of mixed lines: opened to sort, as "Make it a task" does with it alone.
  if (!made.length && mixed.length === 1 && notes.length === 1) return void openSort(mixed[0].text, mixed[0].id), 0
  const sort = mixed.length ? { label: 'Sort this out', key: 'S', run: () => openSort(mixed[0].text, mixed[0].id) } : undefined
  const unsorted = mixed.length ? `${plural(mixed.length, 'is a page of mixed lines, left to sort', 'are pages of mixed lines, left to sort')}` : ''
  if (!made.length) {
    refuse(unsorted ? `None of those could become a task: ${unsorted}` : 'None of those could become a task')
    return 0
  }
  // A note written as a list made a task a line: every task counted, and one Undo for all.
  const all = made.flatMap(({ made, note }) => [made, ...(made.also ?? [])].map((one) => ({ one, note, reopen: made.resolved ?? [] })))
  // Only counts in the notice, never a note's words, so a private one stays private.
  const joined = all.filter(({ one }) => one.existed).length
  const steps = made.reduce((sum, { made }) => sum + (made.steps ?? 0), 0)
  const lead = made.length === 1 && made[0].made.said ? `Made ${made[0].made.said}${joinedSaid(joined)}`
    : all.length === 1 ? taskSaid(made[0].made, 'Now a task')
    : `${num(all.length)} tasks made${steps ? `, ${plural(steps, 'step')}` : ''}${joined ? ` (${num(joined)} joined ${joined === 1 ? 'one' : 'ones'} with the same name)` : ''}`
  chime(madeCue(all.map(({ one }) => one)))
  const tail = [skipped, unsorted && unsorted[0].toUpperCase() + unsorted.slice(1)].filter(Boolean).join('. ')
  toast(tail ? `${lead}. ${tail}` : lead,
    () => void Promise.all(all.map(({ one, note, reopen }) => haligtree.unmakeTask(one.id, one.existed, [note], reopen))),
    'success',
    sort ?? (all.length === 1 ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made[0].made.id) } : undefined))
  return all.length
}

/**
 * The captures selected in the list on screen now, for ⌘K's "Make one task":
 * the palette asks with `haligtree:one-task`, and the list with them answers.
 * `inbox`: those of them still in the Inbox, which a way out takes (⌘K asks with `haligtree:exit-picked` and the
 * exit's status). `lit`: the capture the keys are on with none open, whose ways out ⌘K offers as for an open one.
 */
export const picked = { ids: [] as string[], inbox: [] as string[], lit: null as { id: string; kind: string; status: string } | null }

/**
 * A task's name as every list and card shows it: the words without their
 * #tags, and the tags apart, drawn after it as the chips Upcoming has (ui.tsx
 * Tags). A title that is only a tag keeps it as its words.
 */
export function taskName(title: string): { text: string; tags: string[] } {
  const { text, tags } = splitTags(title)
  return text ? { text, tags } : { text: title, tags: [] }
}

/**
 * Any row's name, as every list shows it: its words without their #tags, the
 * tags apart, whatever its kind (a question titled "what is BC #work" reads
 * "what is BC", as its page does). A name that is only a tag keeps it.
 */
export const itemName = (_type: string, title: string): { text: string; tags: string[] } => taskName(title)

/**
 * On Today: open, not waiting on someone, and set or due by today or before
 * (late ones count). The one rule the sidebar, the Today list, the desktop
 * Today sticky, Today's brief and Close the day all count by.
 */
export const onToday = (task: Pick<Task, 'status' | 'waitingOn' | 'dueAt' | 'deadline'> & Later): boolean =>
  task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < startOfDay(1)

/**
 * Done today, from Today: what "N done" counts beside it.
 */
export const doneOnToday = (task: Pick<Task, 'id' | 'status' | 'completedAt' | 'dueAt' | 'deadline'>): boolean =>
  task.status === 'done' && !!task.completedAt && dayKey(task.completedAt) === dayKey() && (placed(task) ?? Infinity) < startOfDay(1)

/**
 * The day a task shows on: when it is scheduled, or the day it is due by if
 * that is sooner, so a deadline never hides behind a later plan.
 */
export function placed(task: Pick<Task, 'dueAt' | 'deadline'> & Later): number | null {
  const days = [task.dueAt, task.deadline].filter((one): one is string => !!one).map((one) => new Date(one).getTime())
  // Back from hiding: on the day it comes back, whatever its dates say.
  if (task.snoozedUntil === dayKey()) days.push(startOfDay())
  // Getting ready: from that day on, unless it has a day of its own to be done on.
  const ready = readyDay(task)
  if (ready !== null && !task.dueAt) days.push(ready)
  return days.length ? Math.min(...days) : null
}

/** Set for today, whatever deadline has passed: moved to today, it is on today's list. */
export const dueToday = (task: Pick<Task, 'dueAt'>): boolean => {
  const at = task.dueAt ? new Date(task.dueAt).getTime() : NaN
  return at >= startOfDay() && at < startOfDay(1)
}
/** Left behind on an earlier day: not set for today, and on a day or past a deadline before it. */
export const fromBefore = (task: Pick<Task, 'dueAt' | 'deadline'> & Later): boolean => !dueToday(task) && (placed(task) ?? Infinity) < startOfDay()

/** What hiding a task and getting ready for it add to where it shows. */
type Later = Partial<Pick<Task, 'snoozedUntil' | 'getReady'>>

export { readySaid }
/** The leads a task can be given, in days. */
export const READY_LEADS = [3, 7, 14]

/** The day getting ready starts, as a number to compare: its due-by day less the lead; null without both. */
const readyDay = (task: Pick<Task, 'deadline'> & Later): number | null =>
  task.deadline && task.getReady ? dayjs(task.deadline).startOf('day').subtract(task.getReady, 'day').valueOf() : null
/** Getting ready now: past the day it starts, before the day it is due by, and still open. */
export const gettingReady = (task: Pick<Task, 'deadline' | 'status'> & Later): boolean =>
  task.status === 'open' && (readyDay(task) ?? Infinity) <= Date.now() && new Date(task.deadline!).getTime() >= startOfDay()

/** A get-ready lead set or taken off, said with an Undo (⌘Z). */
export const setReady = (task: Pick<Task, 'id' | 'getReady'>, days: number | null): void => {
  if ((task.getReady ?? null) === days) return chime('nope')
  const was = task.getReady ?? null
  void haligtree.saveTask(task.id, { getReady: days }).then(() => {
    chime(days ? 'tap' : 'off')
    toast(days ? `Get ready ${readySaid(days)} it is due` : 'No get-ready day', () => void haligtree.saveTask(task.id, { getReady: was }))
  })
}

/**
 * The days a task or note can be hidden until: tomorrow, next week (its
 * Monday), next month (its first Monday), as "2026-11-02".
 */
export function snoozeDays(): { label: string; day: string }[] {
  // Worked out once a day: every row's menu asks, on every draw of a list.
  const today = new Date().toDateString()
  if (daysFor.today === today) return daysFor.days
  const month = dayjs().add(1, 'month').startOf('month')
  daysFor = { today, key: dayKey(), days: [
    { label: 'Tomorrow', day: dayKey(dayjs().add(1, 'day')) },
    { label: 'Next week', day: dayKey(dayjs().startOf('week').add(1, 'week')) },
    { label: 'Next month', day: dayKey(month.add((8 - month.day()) % 7, 'day')) }
  ] }
  return daysFor.days
}
let daysFor = { today: '', key: '', days: [] as { label: string; day: string }[] }
/** Today as "2026-11-02", read once a day for the same reason. */
const todayKey = (): string => (snoozeDays(), daysFor.key)
/** Still hidden: a day still to come. */
export const snoozed = (one: { snoozedUntil?: string | null }): boolean => !!one.snoozedUntil && one.snoozedUntil > todayKey()
/** "Fri 22 Oct", and "Fri 22 Oct 2027" once it is another year: a letter to future you is hidden a year. */
const hiddenDay = (day: string): string => dated(dayjs(day), 'ddd D MMM')
/**
 * A note back today from hiding: "Back today", or, hidden weeks or more after it
 * was written (a letter to future you, "@1y"), when: "You wrote this a year ago".
 * Counted from the day it was written, so a letter back that morning is a year, not 11 months.
 */
export const backSaid = (one: { capturedAt: string }): string =>
  daysSince(one.capturedAt) >= 14 ? `You wrote this ${ago(dayjs(one.capturedAt).startOf('day')).replace(/^1 (\w+) ago$/, 'a $1 ago')}` : 'Back today'

/**
 * Hidden until a day, or shown now (null), for a task or a note: said with
 * an Undo (⌘Z) that puts back the day it had.
 */
export function snooze(kind: 'task' | 'capture', one: { id: string; snoozedUntil?: string | null }, day: string | null): void {
  const was = one.snoozedUntil ?? null
  const save = (to: string | null): Promise<unknown> => (kind === 'task' ? haligtree.saveTask(one.id, { snoozedUntil: to }) : haligtree.snoozeCapture(one.id, to))
  void save(day).then(() => {
    chime(day ? 'away' : 'back')
    toast(day ? `Hidden until ${hiddenDay(day)}` : 'Showing again now', () => void save(was))
  })
}

/** The lines a task's or a note's menu offers for hiding it until a day. `pick` opens it to choose any day. */
export const snoozeItems = (kind: 'task' | 'capture', one: { id: string; snoozedUntil?: string | null }, pick: () => void) => ({
  label: snoozed(one) ? `Hidden until ${hiddenDay(one.snoozedUntil!)}` : 'Hide until…',
  items: [
    ...snoozeDays().map(({ label, day }) => ({ label, run: () => snooze(kind, one, day) })),
    { label: 'Pick a day…', run: pick },
    ...(snoozed(one) ? ['separator' as const, { label: 'Show now', run: () => snooze(kind, one, null) }] : [])
  ]
})

/**
 * Which later list a task is in: This month, This year, Next year, Someday, or none once
 * it is scheduled. One with a due-by date shows on that day as well, so a
 * deadline never hides in Someday.
 */
export const bucket = (task: Pick<Task, 'planFor' | 'dueAt'>): ReturnType<typeof bucketOf> => (task.dueAt ? null : bucketOf(task.planFor))

/** The later lists, by what each is called. */
export const BUCKETS = { month: 'This month', year: 'This year', next: 'Next year', someday: 'Someday' } as const

/** A month or a year key for now, for putting a task in a later list. */
export function planKey(which: keyof typeof BUCKETS): string {
  const now = dayjs()
  return which === 'someday' ? 'someday' : which === 'year' ? String(now.year()) : which === 'next' ? String(now.year() + 1) : monthKey(now.toDate())
}

/** A repeat that names its own days ("every monday", "every weekday", "every last friday"): words with one keep them. */
const ownDays = (rule: string | null): boolean => !!rule && /\b(?:mon(?!th)|tue|wed|thu|fri|sat|sun)|weekday|\blast\b/i.test(rule)

/**
 * Words whose only when is a time ("call the dentist 10am", "at 3"): typed
 * on a day (a calendar day's panel, its New task box), they are for that day
 * at that time, not today. A repeat that names no day goes with them ("every
 * week 9am" typed on Friday starts on Friday at 9).
 */
export function timeAlone(words: string): boolean {
  const read = readTask(words, new Date())
  const span = read.spans.find((one) => one.kind === 'date')
  return !!span && !ownDays(read.recurrence) && /^(at\s+)?(\d{1,2}([:.]\d{2})?\s*(am|pm)?|noon|midday|midnight)$/i.test(words.slice(span.from, span.to).trim())
}

/** Words whose only when is a repeat that names no day ("water the plants every week"): typed on a day, the series starts on it, never today. */
export function repeatAlone(words: string): boolean {
  const read = readTask(words, new Date())
  return !!read.recurrence && !ownDays(read.recurrence) && !read.spans.some((one) => one.kind === 'date' || one.kind === 'deadline')
}
/** The hour and minute of `iso`, on `day`. */
export const atOn = (iso: string, day: string): string => dayjs(day).hour(dayjs(iso).hour()).minute(dayjs(iso).minute()).startOf('minute').toISOString()

/**
 * A task's new name, read as quick capture reads words: a day, a time, a
 * length, a priority or a "by friday" written into it is taken out of the
 * name and set on the task. One way for every place a name is typed (a
 * Today line, a line on tomorrow's list, the task's page). `on`: the day
 * the line is for, when it is not today. Gives back what it set, in words, and how to take it
 * back, or null when the words were only a name and are kept as typed.
 */
export async function renameTask(task: Pick<Task, 'id' | 'title' | 'priority' | 'estimate' | 'dueAt' | 'allDay' | 'deadline' | 'deadlineTimed' | 'recurrence' | 'repeatUntil' | 'planFor'>, words: string, plain: { from: number; to: number }[] = [], on?: string): Promise<{ said: string; undo: () => void } | null> {
  if (!words || words === task.title) return null
  const read = readTask(words, new Date(), plain)
  // A line for a later day (tomorrow's list): a time with no day of its own is on that day, as a line made there is, and
  // so is a repeat that names no day ("every week"): it starts there, never today.
  if (on && read.due && !ownDays(read.recurrence) && dayKey(read.due) < on) read.due = dayjs(on).hour(dayjs(read.due).hour()).minute(dayjs(read.due).minute()).startOf('minute').toISOString()
  if (!(read.priority || read.estimate || read.due || read.deadline || read.recurrence || read.plan) || !read.title.trim()) return void (await haligtree.saveTask(task.id, { title: words })), null
  const was = { title: task.title, priority: task.priority ?? 0, estimate: task.estimate ?? null, due: task.dueAt ?? null, allDay: task.allDay ?? 0, deadline: task.deadline ?? null, deadlineTimed: task.deadlineTimed ? 1 : 0, recurrence: task.recurrence ?? null, until: task.repeatUntil ?? null, plan: task.planFor ?? null }
  await haligtree.saveTask(task.id, {
    title: read.title.trim(),
    ...(read.priority ? { priority: read.priority } : {}),
    ...(read.estimate ? { estimate: read.estimate } : {}),
    ...(read.due ? { due: read.due, allDay: read.allDay ? 1 : 0 } : {}),
    ...(read.deadline ? { deadline: read.deadline, deadlineTimed: read.deadlineTimed ? 1 : 0 } : {}),
    ...(read.recurrence ? { recurrence: read.recurrence, until: read.until } : {}),
    ...(read.plan && !read.due ? { plan: read.plan } : {})
  })
  const said = [read.due && `Moved to ${whenInLine(read.due, read.allDay)}`, read.deadline && `due by ${whenInLine(read.deadline, !read.deadlineTimed)}`, read.recurrence && `repeats ${read.recurrence.replace(/^every!?\s*/i, 'every ')}`, read.plan && !read.due && `moved to ${BUCKETS[bucketOf(read.plan) ?? 'someday']}`, read.priority && `${PRIORITY_NAMES[read.priority]} priority`, read.estimate && `${read.estimate} minutes`].filter(Boolean).join(', ')
  return { said: said.charAt(0).toUpperCase() + said.slice(1), undo: () => void haligtree.saveTask(task.id, was) }
}

/**
 * Closed without doing: it is in the Bin, so its row crumples and flies
 * to the Bin as everything moved there does, and it can be taken back. One way for every list and page, so it always reads the same.
 */
export function closeTask(id: string, then?: () => void): void {
  const land = binFlight(id)
  void haligtree.saveTask(id, { status: 'dropped' }).then(() => {
    land?.()
    // A page that had it open moves on to the next itself; otherwise, as asked.
    if (binned([id])) then?.()
    tear()
    // Said where it went: the Bin, one key away, as every move there says it.
    toast('Closed without doing: it is in the Bin', () => void (expectBack([id]), haligtree.saveTask(id, { status: 'open' })).then(() => window.dispatchEvent(new CustomEvent('haligtree:came-back', { detail: [id] }))), 'success', seeTheBin)
  })
}

/**
 * Today counted one way everywhere: the sidebar, the Today list, the sticky
 * and today's page all lead with what is left to do, and say what is done
 * beside it.
 */
export function todaySaid(left: number, done: number): string {
  if (!left) return done ? 'All done' : 'Nothing to do'
  return done ? `${num(left)} open · ${num(done)} done` : `${num(left)} open`
}

/** Tasks turned back into notes: each back in the Inbox, one notice and one Undo for the lot. */
export async function taskToNote(ids: string[], then?: () => void): Promise<void> {
  const kept = await haligtree.taskToNote(ids)
  if (!kept.length) return refuse(ids.length === 1 ? 'That task no longer exists' : 'None of those tasks exists any more')
  // Gone from the list it was open in: that page moves on to the next, as after a move to the Bin.
  if (binned(ids)) then?.()
  chime('away')
  toast(kept.length === 1 ? 'Back in your Inbox as a note' : `${num(kept.length)} back in your Inbox as notes`, () => void haligtree.unnoteTasks(kept).then(() => window.dispatchEvent(new CustomEvent('haligtree:came-back', { detail: ids }))), 'success',
    { label: 'Open the Inbox', key: 'I', run: () => window.api.openInHome('view', 'inbox') })
}

/** The right-click line for it, said for one or for several. */
export const toNoteItem = (ids: string[], then?: () => void): { label: string; hint: string; run: () => void } => ({
  label: ids.length === 1 ? 'Turn back into a note' : `Turn ${num(ids.length)} back into notes`,
  hint: 'Out of your tasks, back in your Inbox',
  run: () => void taskToNote(ids, then)
})

/** Your order, the one the list and the written-out day share: where you put it, then the order it was made in. */
export const yourOrder = (a: Pick<Task, 'sortOrder' | 'number'>, b: Pick<Task, 'sortOrder' | 'number'>): number => (a.sortOrder ?? 1e6 + a.number) - (b.sortOrder ?? 1e6 + b.number)
