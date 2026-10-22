import { chime, tear } from './sound'
import { unquoted } from '../../../main/clip'
import { seeTheBin } from './to-bin'
import { shred } from './fly-home'
import { splitTags, taskSaid, vigil, type Made, type Task } from './vigil'
import { flying } from './capture-links'
import { ask, refuse, toast } from '@/components/vigil/ui'
import { bucketOf, monthKey, readySaid } from '../../../main/task-words'
import { dayjs, dayKey, num, startOfDay } from '../../../main/dates'
import { tasksSaid, type ListTask } from '../../../main/day-lines'
import { openSort } from './sort-out'

/**
 * Everything that becomes a task: words typed, a capture, several captures,
 * a nugget to study, a line picked out of a note.
 */
export type TaskSource =
  | { text: string; today?: boolean; origin?: string }
  | { capture: string; /** Words in its first line kept as plain text, not read as a date or a priority. */ plain?: { from: number; to: number; text: string }[]
      /** One task however many lines it has; otherwise a list makes a task a line. */ whole?: boolean }
  | { captures: string[]; text: string }
  | { item: string; text: string }

/**
 * The one way anything is made a task: the same sound, the same words when
 * it joined one already there, and the same undo, from every place that
 * offers it. `said` is what the notice says, worked out from the new task
 * when it depends on where it landed. Gives back what was made, or null.
 */
export async function makeTask(
  from: TaskSource,
  said: string | ((made: Made) => string | Promise<string>) = 'Now a task',
  { onUndo, quiet = false }: { onUndo?: () => void; /** Made without a word: something else on screen already shows it. */ quiet?: boolean } = {}
): Promise<Made | null> {
  const [got, links] =
    'capture' in from ? [await flying(from.capture, 'task', () => vigil.toTask(from.capture, from.plain, from.whole)), [from.capture]]
    : 'captures' in from ? [await vigil.taskFrom(from.captures, from.text), from.captures]
    : 'item' in from ? [await vigil.study(from.item, from.text), [from.item]]
    : [await vigil.addTask(from.text, from.origin, from.today), from.origin ? [from.origin] : []]
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
  chime(made.also?.length ? 'promote' : made.existed ? 'nope' : 'noted')
  const words = made.said ? `Made ${made.said}${joinedSaid(joined)}` : taskSaid(made, typeof said === 'function' ? await said(made) : said)
  toast(words, () => void Promise.all(all.map((one) => vigil.unmakeTask(one.id, one.existed, links, reopen))).then(() => onUndo?.()), 'success',
    made.also?.length ? undefined : { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made.id) })
  return made
}
/** ". 2 were already on your list, so they joined those tasks", or nothing. */
const joinedSaid = (joined: number): string =>
  joined ? `. ${num(joined)} ${joined === 1 ? 'was already on your list, so it joined that task' : 'were already on your list, so they joined those tasks'}` : ''

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
    const one = await vigil.addTask(line.text, undefined, today, kept)
    made.push(one)
    if (one.existed) continue
    if (line.steps.length) await vigil.saveTask(one.id, { subtasks: line.steps })
    if (line.done) await vigil.saveTask(one.id, { status: 'done' })
  }
  const joined = made.filter((one) => one.existed).length
  const fresh = new Set(made.filter((one) => !one.existed).map((one) => one.id))
  const undated = (await vigil.tasks()).filter((task) => fresh.has(task.id) && task.status === 'open' && !task.waitingOn && !task.recurrence && placed(task) === null && !bucket(task)).length
  chime(made.length === 1 ? 'noted' : 'promote')
  const said: Said = { text: `Made ${tasksSaid(list)}${joinedSaid(joined)}${undatedSaid(undated, fresh.size)}`, undo: made.map((one) => ({ id: one.id, existed: one.existed })), open: undated ? 'upcoming' : made.length === 1 ? made[0].id : null }
  // Said in the box too, where its Undo also puts the list back in the box.
  if (away) window.api.sayInHome(said)
  say(said, onUndo)
  return made
}
/** ". 13 with no date are in Upcoming, under “No date”", or nothing. */
const undatedSaid = (undated: number, of: number): string =>
  !undated ? '' : undated === of ? (of === 1 ? '. It has no date, so it is in Upcoming, under “No date”' : '. None has a date, so all are in Upcoming, under “No date”')
    : `. ${num(undated)} with no date ${undated === 1 ? 'is' : 'are'} in Upcoming, under “No date”`

/** A list's notice, sent as data so another window can say it: its words, what Undo takes back, and what “Show them” or “Open” opens. */
export type Said = { text: string; undo: { id: string; existed: boolean }[]; open: 'upcoming' | string | null }
function say(said: Said, onUndo?: () => void): void {
  toast(said.text,
    () => void Promise.all(said.undo.map((one) => vigil.unmakeTask(one.id, one.existed, [], []))).then(() => onUndo?.()),
    'success',
    said.open === 'upcoming' ? { label: 'Show them', key: 'S', run: () => window.api.openInHome('view', 'upcoming', 'No date') }
      : said.open ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', said.open!) } : undefined)
}
// Said here when quick capture made them as it went.
if (new URLSearchParams(location.search).get('view') === 'home') window.api.onSay?.((said) => say(said as Said))

/**
 * Several captures made one task: its name asked, offered the first one's
 * title to start from. Each capture is linked from it and leaves the inbox.
 */
export async function oneTask(ids: string[], first = ''): Promise<Made | null> {
  const text = await ask(`One task from these ${num(ids.length)}. What is it?`, 'e.g. sort out the freight rules by Thursday', undefined, first)
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
  const tasked = new Set((await vigil.tasks()).filter((task) => task.status === 'open' && task.fromId).map((task) => task.fromId!))
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
    const work = (): Promise<Made | null | 'not-open' | { mixed: string }> => (note.capture ? vigil.toTask(note.id) : vigil.study(note.id, `Study “${unquoted(note.title)}”`, { from: 7, to: 7 + unquoted(note.title).length }))
    const got = note.capture && at < 6 ? await flying(note.id, 'task', work) : await work()
    if (got && got !== 'not-open' && 'mixed' in got) return void mixed.push({ id: note.id, text: got.mixed })
    return got && got !== 'not-open' ? { made: got, note: note.id } : null
  }))).filter((one): one is { made: Made; note: string } => !!one)
  // Just one, a page of mixed lines: opened to sort, as "Make it a task" does with it alone.
  if (!made.length && mixed.length === 1 && notes.length === 1) return void openSort(mixed[0].text, mixed[0].id), 0
  const sort = mixed.length ? { label: 'Sort this out', key: 'S', run: () => openSort(mixed[0].text, mixed[0].id) } : undefined
  const unsorted = mixed.length ? `${num(mixed.length)} ${mixed.length === 1 ? 'is a page of mixed lines, left to sort' : 'are pages of mixed lines, left to sort'}` : ''
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
    : `${num(all.length)} tasks made${steps ? `, ${num(steps)} ${steps === 1 ? 'step' : 'steps'}` : ''}${joined ? ` (${num(joined)} joined ${joined === 1 ? 'one' : 'ones'} with the same name)` : ''}`
  // Bigger runs sound bigger: two knocks for one, the ringing "kept" for many.
  chime(all.length === 1 ? 'noted' : 'promote')
  const tail = [skipped, unsorted && unsorted[0].toUpperCase() + unsorted.slice(1)].filter(Boolean).join('. ')
  toast(tail ? `${lead}. ${tail}` : lead,
    () => void Promise.all(all.map(({ one, note, reopen }) => vigil.unmakeTask(one.id, one.existed, [note], reopen))),
    'success',
    sort ?? (all.length === 1 ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made[0].made.id) } : undefined))
  return all.length
}

/**
 * The captures selected in the list on screen now, for ⌘K's "Make one task":
 * the palette asks with `vigil:one-task`, and the list with them answers.
 */
export const picked = { ids: [] as string[] }

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
 * On Today: open, not waiting on someone, and set or due by today or before
 * (late ones count). The one rule the sidebar, the Today list, the desktop
 * Today sticky, Today's brief and Close the day all count by.
 */
export const onToday = (task: Pick<Task, 'status' | 'waitingOn' | 'dueAt' | 'deadline'> & Later): boolean =>
  task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < startOfDay(1)

/**
 * Done today, from Today: what "N done" counts beside it. Lines cleared from
 * Today's written page (`cleared`) are out, in every place that counts.
 */
export const doneOnToday = (task: Pick<Task, 'id' | 'status' | 'completedAt' | 'dueAt' | 'deadline'>, cleared: string[] = []): boolean =>
  task.status === 'done' && !!task.completedAt && dayKey(task.completedAt) === dayKey() && (placed(task) ?? Infinity) < startOfDay(1) && !cleared.includes(task.id)

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

/** What hiding a task and getting ready for it add to where it shows. */
type Later = Partial<Pick<Task, 'snoozedUntil' | 'getReady'>>

export { readySaid }
/** The leads a task can be given, in days. */
export const READY_LEADS = [3, 7, 14]

/** The day getting ready starts, as a number to compare: its due-by day less the lead; null without both. */
export const readyDay = (task: Pick<Task, 'deadline'> & Later): number | null =>
  task.deadline && task.getReady ? dayjs(task.deadline).startOf('day').subtract(task.getReady, 'day').valueOf() : null
/** Getting ready now: past the day it starts, before the day it is due by, and still open. */
export const gettingReady = (task: Pick<Task, 'deadline' | 'status'> & Later): boolean =>
  task.status === 'open' && (readyDay(task) ?? Infinity) <= Date.now() && new Date(task.deadline!).getTime() >= startOfDay()

/** A get-ready lead set or taken off, said with an Undo (⌘Z). */
export const setReady = (task: Pick<Task, 'id' | 'getReady'>, days: number | null): void => {
  if ((task.getReady ?? null) === days) return chime('nope')
  const was = task.getReady ?? null
  void vigil.saveTask(task.id, { getReady: days }).then(() => {
    chime(days ? 'tap' : 'off')
    toast(days ? `Get ready ${readySaid(days)} it is due` : 'No get-ready day', () => void vigil.saveTask(task.id, { getReady: was }))
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

/**
 * Hidden until a day, or shown now (null), for a task or a note: said with
 * an Undo (⌘Z) that puts back the day it had.
 */
export function snooze(kind: 'task' | 'capture', one: { id: string; snoozedUntil?: string | null }, day: string | null): void {
  const was = one.snoozedUntil ?? null
  const save = (to: string | null): Promise<unknown> => (kind === 'task' ? vigil.saveTask(one.id, { snoozedUntil: to }) : vigil.snoozeCapture(one.id, to))
  void save(day).then(() => {
    chime(day ? 'away' : 'back')
    toast(day ? `Hidden until ${dayjs(day).format('ddd D MMM')}` : 'Showing again now', () => void save(was))
  })
}

/** The lines a task's or a note's menu offers for hiding it until a day. `pick` opens it to choose any day. */
export const snoozeItems = (kind: 'task' | 'capture', one: { id: string; snoozedUntil?: string | null }, pick: () => void) => ({
  label: snoozed(one) ? `Hidden until ${dayjs(one.snoozedUntil!).format('ddd D MMM')}` : 'Hide until…',
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

/**
 * Closed without doing: it is in the Bin, so its row goes through the
 * shredder as everything moved there does, and it can be taken back. One way for every list and page, so it always reads the same.
 */
export function closeTask(id: string, then?: () => void): void {
  const land = shred(id)
  void vigil.saveTask(id, { status: 'dropped' }).then(() => {
    land?.()
    then?.()
    tear()
    // Said where it went: the Bin, one key away, as every move there says it.
    toast('Closed without doing: it is in the Bin', () => void vigil.saveTask(id, { status: 'open' }), 'success', seeTheBin)
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
  const kept = await vigil.taskToNote(ids)
  if (!kept.length) return refuse(ids.length === 1 ? 'That task no longer exists' : 'None of those tasks exists any more')
  then?.()
  chime('away')
  toast(kept.length === 1 ? 'Back in your Inbox as a note' : `${num(kept.length)} back in your Inbox as notes`, () => void vigil.unnoteTasks(kept), 'success',
    { label: 'Open the Inbox', key: 'I', run: () => window.api.openInHome('view', 'inbox') })
}

/** The right-click line for it, said for one or for several. */
export const toNoteItem = (ids: string[], then?: () => void): { label: string; hint: string; run: () => void } => ({
  label: ids.length === 1 ? 'Turn back into a note' : `Turn ${num(ids.length)} back into notes`,
  hint: 'Out of your tasks, back in your Inbox',
  run: () => void taskToNote(ids, then)
})
