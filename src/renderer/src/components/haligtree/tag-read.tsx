import { Orb } from './orb'
import { small } from '@/lib/small-picture'
import { sideTagLine } from '@/lib/side-tags'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { still } from '@/lib/motion'
import { useReading } from '@/lib/reads-in'
import { TagIcon, tagTint } from './tag-icon'
import type { JSONContent } from '@tiptap/core'
import { AlignJustify, ChevronDown } from 'lucide-react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, haligtree, type Pin as Pinned, type TagRead, type Task } from '@/lib/haligtree'
import { openApart, openSmall, smallHolds } from '@/lib/apart'
import { statusSaid } from '@/lib/capture-links'
import { rowBody } from '@/lib/row-body'
import { taggedBlocks } from '@/lib/tagged-blocks'
import { quoted } from '../../../../main/clip'
import { chime } from '@/lib/sound'
import { Decoded, Empty, ask, pin, refuse, sayNow, toast, typing, useListKeys, useReadKey, whyFailed } from './ui'
import { Button } from '@/components/ui/button'
import { RowMenu, copy, type MenuItem, type RowItem } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { DOT_IN_LINE, SessionDot, TaskSpentWords, useTaskTime } from './task-time'
import { ReadThrough, type Readable } from './read-through'
import { addToQuestion } from './questions-view'
import { PlayButton, ViewSwitch, pictureIn } from './collection-header'
import { NoteList, type Entry as NoteEntry } from './note-list'
import { age } from '../capture-list'
import type { Picking } from '@/lib/pick-range'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { glance } from './note-preview'
import { madeDeck } from './decks'
import { Tip } from './ui'
import { Display, FilterChips, arrange, useView, type Facet } from './display'
import { ListSearch } from './note-list'
import { motion } from 'motion/react'
import { ago, dayKey, dayMonth, dayName, dayjs, noon, num, plural } from '../../../../main/dates'
import { canSplit, openItems, useHere } from '@/lib/split'
import { queueItems } from '@/lib/reading-queue'
import { PICKED_MARK, usePickMixed } from './pick-mixed'
import { itemName } from '@/lib/tasks'
import { FileText, Gem, Inbox, List, ListTodo, Orbit } from '@/components/ui/icons'
import { useFullMenu } from './side-menu'

const ICON = { nugget: Gem, article: FileText, question: Orbit, task: ListTodo }
const NAME: Record<string, string> = { capture: 'Capture', nugget: 'Gem', article: 'Page', question: 'Question', task: 'Task' }

/** What a tag holds, named once: notes, tasks, or items for both. */
const heldSaid = (list: { type: string }[]): [string, string] => {
  const tasks = list.filter((one) => one.type === 'task').length
  return tasks === 0 ? ['note', 'notes'] : tasks === list.length ? ['task', 'tasks'] : ['item', 'items']
}

/** A tag's colour as CSS: its own, or one picked from its name so it is always the same. */
export const tagColour = (tag: string, color: string | null | undefined): string => tagTint(tag, color)

type View = 'stream' | 'list'
/** List or Stream, the same for every tag; a list unless Stream was picked. */
const VIEW_KEY = 'tag:look'
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'stream' ? 'stream' : 'list'
  } catch {
    return 'list'
  }
}

/**
 * Rename a tag everywhere, asked for its new name: every note, gem and task
 * has its words changed, and onto a tag already there it is a merge. One Undo
 * puts back exactly what changed, a merge included. `onNow` hears the name it
 * is now known by, and the old one again on Undo.
 */
export async function renameTag(tag: string, onNow?: (tag: string) => void, typed?: string): Promise<void> {
  const to = typed ?? await ask(`Rename #${tag} everywhere. A tag that exists already takes these in.`, 'new name', { field: 'tag', initial: tag, action: 'Rename the tag' })
  if (!to || to.replace(/^#/, '').toLowerCase() === tag) return
  const merging = (await haligtree.tags()).some((one) => one.tag === to.replace(/^#/, '').toLowerCase())
  const done = await haligtree.renameTag(tag, to)
  if (!done) return refuse('Not renamed: a tag starts with a letter and uses only letters, numbers, dashes and underscores')
  chime('retag')
  toast(merging ? `#${tag} is merged into #${done} everywhere` : `#${tag} is now #${done} everywhere`, () => void haligtree.undoRenameTag().then((back) => back && onNow?.(tag)))
  onNow?.(done)
}

/** A day as you would say it: "Friday 4 September", with the year once it is not this one. */
const named = (day: string): string => dayName(noon(day))

/** How many are drawn at a time: each is a whole note, and the rest arrive as you scroll. */
const BATCH = 12
/** How many are drawn with the tag's name: enough to fill the screen, few enough to show at once. */
const FIRST = 3

/**
 * Each tag's notes as last read, so going back to one, or to one the pointer
 * rested on in the sidebar, shows it at once. Anything saved anywhere clears
 * them all: a tag shown is always read again, so this only says what to show
 * first, never what is true for long.
 */
const kept = new Map<string, TagRead[]>()
const reading = new Map<string, Promise<TagRead[]>>()
let watching = false
const readTag = (tag: string): Promise<TagRead[]> => {
  if (!watching) {
    watching = true
    window.api.captures.onChange(() => kept.clear())
  }
  const going = reading.get(tag)
  if (going) return going
  const read = haligtree.tagRead(tag).then((list) => (kept.set(tag, list), list)).finally(() => reading.delete(tag))
  reading.set(tag, read)
  return read
}
/** Read a tag ahead, while the pointer rests on its name. */
export const prefetchTag = (tag: string): void => void (kept.has(tag) || readTag(tag))

/**
 * What `read` gives for `key`, read again on every save. An answer always
 * carries the key it was asked for, and one that comes back after the key has
 * changed is dropped: so a slow answer for the tag before can never be shown
 * under the next tag's name, whatever order the answers arrive in.
 */
export function useLiveFor<T>(key: string, read: () => Promise<T>, first: () => T | null = () => null): { value: T | null; failed: string | null; again: () => void } {
  const [got, setGot] = useState<{ key: string; value: T | null; failed?: string }>(() => ({ key, value: first() }))
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    let last: string | undefined
    const take = (value: T): void => {
      if (!live) return
      const now = JSON.stringify(value)
      if (now === last) return
      last = now
      setGot({ key, value })
    }
    // Only the newest read's answer counts, so an older one arriving late never wins.
    let asked = 0
    // A read that fails says why where the notes would be, never a wait without end; what was shown stays shown.
    const fail = (error: unknown): void => {
      if (live) setGot((was) => (was.key === key && was.value ? was : { key, value: null, failed: whyFailed(error, true) }))
    }
    const load = (): void => {
      const mine = ++asked
      void read().then((value) => mine === asked && take(value), (error) => mine === asked && fail(error))
    }
    load()
    const off = window.api.captures.onChange(load)
    return () => {
      live = false
      off()
    }
  }, [key, tries]) // eslint-disable-line react-hooks/exhaustive-deps
  const mine = got.key === key
  return { value: mine ? got.value : first(), failed: mine ? got.failed ?? null : null, again: () => setTries((n) => n + 1) }
}

/** All the words in a note, for the filter to look through. */
const textIn = (body: unknown): string => {
  if (typeof body === 'string') return body
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const { text, content } = node as { text?: string; content?: unknown[] }
    if (text) out.push(text)
    content?.forEach(walk)
  }
  walk(body)
  return out.join(' ')
}

/**
 * A tag read as a page: the whole of everything carrying it, captures and
 * kept things together, newest first under the day each was written. It puts
 * one subject together out of things caught for other reasons. Over it, the
 * tag as a collection: its cover, its counts, and Read through; under it the
 * tags it most often comes with. Read only; a click opens the one you want
 * to change.
 */
/** The longest tag the filter box can say in full ("Filter #…" at its narrowest); a longer one is "this tag". */
const FILTER_ROOM = 14

export function TagStream({ tag, color, onOpen, onTag, onStudy }: {
  tag: string
  color?: string | null
  onOpen: (type: string, id: string) => void
  /** Another tag's page, or this one renamed. */
  onTag: (tag: string) => void
  /** Its cards: in Review, gone through without counting, or a blank page to write all you remember. */
  onStudy: (how: StudyWay) => void
}): React.JSX.Element {
  // Shown at once from what was read before (a tag gone back to, or pointed
  // at in the sidebar), then read again; never another tag's notes.
  const { value: items, failed, again } = useLiveFor(tag, () => readTag(tag), () => kept.get(tag) ?? null)
  const tags = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  const pins = useLive(haligtree.pins, [] as Pinned[])
  // A task tagged here gets the menu it has on Today: a focus session, done, when.
  const tasks = useLive(haligtree.tasks, [] as Task[])
  // Each note's full right-click menu, as its own page has it.
  const fullMenu = useFullMenu()
  const taskNow = useTaskNow()
  // The time on the tasks this tag holds and the session running on one (task-time.tsx).
  const taskTime = useTaskTime()
  const [view, setView] = useState(readView)
  const [reading, setReading] = useState<{ list: Readable[]; start: number } | null>(null)
  // Sort and filter, kept for each tag on its own; the words looked for are not kept.
  const [display, setDisplay] = useView(`tag:${tag}`, { sort: 'newest', group: 'kind' })
  const [query, setQuery] = useState('')
  // A task done, a to-do dealt with and a note made into a task wait under a
  // click, as Everything keeps them; what is counted is what shows at first.
  const [laterShown, setLaterShown] = useState(false)
  // A few notes come with the tag's name, the rest of the first screenful a
  // frame later, so a switch shows the new tag at once instead of after
  // every note on its first screen has been laid out.
  const [count, setCount] = useState(FIRST)
  const loaded = items !== null
  useEffect(() => {
    if (!loaded || count >= BATCH) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setCount((n) => Math.max(n, Math.min(BATCH, n + FIRST))))
    })
    return () => (cancelAnimationFrame(frame), clearTimeout(timer))
  }, [loaded, count])
  // More come in as the end comes into view, once the first screenful is in.
  const end = useRef<HTMLDivElement>(null)
  const filled = count >= BATCH
  useEffect(() => {
    const mark = end.current
    if (!mark || !filled) return
    const watch = new IntersectionObserver((seen) => seen.some((one) => one.isIntersecting) && setCount((n) => n + BATCH), { rootMargin: '600px' })
    watch.observe(mark)
    return () => watch.disconnect()
  }, [loaded, view, filled, display, query])
  // The tags most often written beside this one, counted once per load.
  const facts = useMemo(() => {
    const together = new Map<string, number>()
    for (const item of items ?? []) if (!item.later) for (const other of item.tags) together.set(other, (together.get(other) ?? 0) + 1)
    // Behind the head, the newest picture among them, faded into the page; none when no note has one.
    const wash = (items ?? []).filter((item) => !item.private).map((item) => pictureIn(item.body)).find(Boolean) ?? null
    return { often: [...together].sort((a, b) => b[1] - a[1]).slice(0, 8), wash }
  }, [items])
  // The words of each, for the filter, only once something is looked for.
  const texts = useMemo(() => (query.trim() && items ? new Map(items.map((item) => [item.id, `${item.title} ${item.label} ${textIn(item.body)}`.toLowerCase()])) : null), [items, query.trim() !== ''])
  const tagMeta = useLive(haligtree.tagMeta, [] as Awaited<ReturnType<typeof haligtree.tagMeta>>)
  // By kind, as every list is filtered, and by what it is: a capture, an idea, an article.
  const counted = (items ?? []).filter((item) => !item.later)
  const later = (items?.length ?? 0) - counted.length
  const all = laterShown ? items ?? [] : counted
  const unit = heldSaid(counted.length ? counted : items ?? [])
  const facets: Facet<TagRead>[] = [
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => all.some((one) => one.kind === type.id)).map(({ id, label, icon, tint }) => ({ id, label, icon, tint })), test: (one, kind) => one.kind === kind },
    { key: 'type', label: 'Is', options: Object.entries(NAME).filter(([id]) => all.some((one) => one.type === id)).map(([id, label]) => ({ id, label })), test: (one, type) => one.type === type }
  ]
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [[, sorted]] = arrange(all, display, facets, {
    newest: (a, b) => b.at.localeCompare(a.at),
    oldest: (a, b) => a.at.localeCompare(b.at),
    changed: (a, b) => (b.changed ?? b.at).localeCompare(a.changed ?? a.at),
    name: (a, b) => (a.title || a.label).localeCompare(b.title || b.label)
  })
  const shown = words.length && texts ? sorted.filter((item) => words.every((word) => texts.get(item.id)?.includes(word))) : sorted
  const narrowed = shown.length !== all.length
  // A task is not read through: its notes are a plan, and it opens on its own.
  const readable = shown.filter((item) => item.type !== 'task')
  const read = (list: TagRead[], start = 0): void => {
    const kept = list.filter((item) => item.type !== 'task')
    if (kept.length) setReading({ list: kept.map(({ type, id }) => ({ type, id })), start: Math.max(0, kept.indexOf(list[start])) })
  }
  const shuffled = (): void => {
    if (!readable.length) return
    chime('slide')
    read([...readable].sort(() => Math.random() - 0.5))
  }
  useReadKey(() => readable.length && read(readable), readable.length, !reading)
  // R on its own reads it through, as the button says.
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    if (!readable.length || reading) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing()) return
      event.preventDefault()
      read(readable)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readable.length, shown, reading]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⇧-click, x and ⌘A pick several of what is shown, to make tasks of or queue together.
  const several = usePickMixed(shown, { here })
  const kindName = (item: TagRead): string => item.type === 'task' || (item.type === 'capture' && item.kind === 'todo') ? 'Tasks'
    : item.type === 'capture' ? CAPTURE_TYPES.find((one) => one.id === item.kind)?.label ?? 'Note' : NAME[item.type] ?? 'Gem'
  // The list by kind (Display's "Group"), only where kinds are mixed: one kind alone is one run, in the order picked.
  const oneKind = new Set(shown.map(kindName)).size <= 1
  const grouped: [string, TagRead[]][] = (() => {
    if (display.group !== 'kind' || oneKind) return [['', shown]]
    const groups = new Map<string, TagRead[]>()
    for (const item of shown) groups.set(kindName(item), [...(groups.get(kindName(item)) ?? []), item])
    return [...groups]
  })()
  // The rows in the order the list draws them, for the keys: ↑ ↓ (and j k) move, ↵ opens, ⇧↑ ⇧↓ pick a run.
  const ordered = view === 'list' ? grouped.flatMap(([, list]) => list) : []
  const byId = (id: string): TagRead | undefined => ordered.find((one) => one.id === id)
  const [cursor, setCursor] = useListKeys(ordered.length, {
    enabled: !reading,
    onOpen: (index) => ordered[index] && onOpen(ordered[index].type, ordered[index].id),
    onExtend: (from, to) => ordered[to] && several.extend(ordered[from], ordered[to])
  })
  // NoteList picks by id: each row stands for itself in the page's one picking (⌘ and ⇧-click, as Finder).
  const picking: Picking = {
    click: (event, id) => { const one = byId(id); return !!one && several.click(event, one) },
    extend: (from, to) => { const a = from ? byId(from) : undefined; const b = byId(to); if (b) several.extend(a, b) },
    toggle: (id) => { const one = byId(id); if (one) several.toggle(one) }
  }
  const chosenIds = ordered.filter((one) => several.picked(one)).map((one) => one.id)

  // Its page waits for its notes (lib/reads-in.tsx), and the list of tags beside it with it: one step, not the list and then the tag.
  useReading(!items && !failed)
  if (!items && failed)
    return <Empty title={`#${tag} could not be read`} action={<Button size="sm" data-read-again onClick={() => (chime('tap'), again())}>Try again</Button>}>{failed.charAt(0).toUpperCase() + failed.slice(1)}.</Empty>
  if (!items) return <Waiting tag={tag} color={color ?? null} />
  if (!items.length)
    return <Empty title={`Nothing carries #${tag} now`}>Whatever had it was moved to the Bin or archived, or the tag was taken off. Write it into anything and it reads here.</Empty>
  // The first and the last carried, whatever the order shown.
  const first = items.reduce((at, item) => (item.at < at ? item.at : at), items[0].at)
  const last = items.reduce((at, item) => (item.at > at ? item.at : at), items[0].at)
  const pinnedNote = (item: TagRead): boolean => pins.some((one) => one.id === item.id)
  const table = (item: TagRead): 'captures' | 'nuggets' => (item.type === 'capture' ? 'captures' : 'nuggets')
  const open = (item: TagRead, event?: React.MouseEvent | React.KeyboardEvent): void => (event?.metaKey && !canSplit() ? openApart(item.type, item.id) : onOpen(item.type, item.id))
  // A note's right-click menu is the full one it has on its own page, and this page's "Read from here" after it.
  const rowMenu = (item: TagRead, index: number): RowItem[] => {
    const task = item.type === 'task' ? tasks.find((one) => one.id === item.id) : null
    if (task) return taskMenu(task, { open: () => open(item), now: taskNow })
    const here: RowItem[] = ['separator', { label: 'Read from here', run: () => read(shown, index) }]
    const full = fullMenu(item.type, item.id, () => open(item))
    return full ? [...full, ...here] : noteMenu(item, index)
  }
  const noteMenu = (item: TagRead, index: number): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => open(item) },
    { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openApart(item.type, item.id) },
    ...(smallHolds(item.type) ? [{ label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall(item.type, item.id) }] : []),
    ...openItems(item.type, item.id),
    ...queueItems(item.id),
    { label: 'Read from here', run: () => read(shown, index) },
    'separator',
    { label: pinnedNote(item) ? 'Unpin' : 'Pin', run: () => pin(table(item), item.id, !pinnedNote(item)) },
    item.type === 'capture' && item.status === 'open' && { label: 'Add as a clue to a question…', hint: 'Filed under a question you already have', run: () => void addToQuestion(item.id) },
    'separator',
    { label: 'Copy its title', run: () => copy(item.title || item.label) }
  ]
  // What every row shown shares says nothing on any of them: a tag they all carry, and the kind when there is only one.
  const shared = shown.length > 1 ? shown.slice(1).reduce((both, item) => both.filter((one) => item.tags.includes(one)), shown[0].tags) : []
  const differs = { tags: shared, kind: !oneKind }
  // A row of the list, as Gems and the Inbox draw theirs: its kind's mark, its words, then when, its kind where kinds
  // are mixed and grouped by none, its state, and the tags the others do not all carry. Its menu is built when opened.
  const entryOf = (item: TagRead, index: number): NoteEntry => {
    const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
    const task = item.type === 'task' ? tasks.find((one) => one.id === item.id) : undefined
    const status = item.type === 'capture' && item.status !== 'open' ? statusSaid(item.status, item.keptIn) : item.type === 'task' && item.status === 'done' ? 'Done' : ''
    // Tagged on a block of a longer note: that block, as the line under its name.
    const block = taggedBlocks(item.body, tag)?.lines[0]
    const sub = [block ? quoted(block, 90) : '', differs.kind && display.group !== 'kind' ? kindName(item).replace(/s$/, '') : '', status].filter(Boolean).join(' · ')
    // A task says the day it is for, as on Today; everything else when it was written. A task in a focus session wears the
    // session's dot at the head of its small line, with the day after it.
    const day = item.type === 'task' ? (task?.dueAt ? dayMonth(task.dueAt) : undefined) : age(item.at)
    const dotHere = item.type === 'task' && taskTime.running?.taskId === item.id
    const entry: NoteEntry = {
      id: item.id,
      type: item.type,
      title: itemName(item.type, item.title || item.label).text,
      tags: item.tags.filter((one) => !shared.includes(one)),
      icon: item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem,
      tint: item.type === 'capture' ? kind?.tint : undefined,
      age: dotHere ? undefined : day,
      // A task's time, last in its small line. In a focus session the dot leads that line, then the day, under the start of
      // its name, as on Today's Matrix card and quick capture's rows with no number column: a row here has a picture tile,
      // no tick and no margin, and the row's own marks stand at its far end, 700 px from the name on a wide page (13 Nov).
      sub: dotHere || (item.type === 'task' && taskTime.of(item.id)) ? <>
        {dotHere && <SessionDot id={item.id} time={taskTime} className={`${DOT_IN_LINE} mr-1.5`} />}
        {dotHere && day}
        {dotHere && day && sub ? ' · ' : ''}
        {sub}
        {taskTime.of(item.id) && <TaskSpentWords task={{ id: item.id, estimate: task?.estimate ?? null, status: task?.status ?? (item.status === 'done' ? 'done' : 'open') }} time={taskTime} lead={sub || (dotHere && day) ? ' · ' : ''} />}
      </> : sub || undefined,
      private: item.private,
      done: item.later
    }
    let made: RowItem[] | undefined
    return Object.defineProperty(entry, 'menu', { get: () => (made ??= several.menu(item) ?? [...rowMenu(item, index), ...several.rowItems(item)]), enumerable: true })
  }
  // Under the day each was written, or changed; in A to Z, one run without days.
  const days: [string, TagRead[]][] = []
  for (const item of shown.slice(0, count)) {
    const day = display.sort === 'name' ? '' : dayKey(display.sort === 'changed' ? item.changed ?? item.at : item.at)
    const last = days[days.length - 1]
    if (last?.[0] === day) last[1].push(item)
    else days.push([day, [item]])
  }
  // The list, as Gems and Writing draw theirs: one row each, by kind when kinds are mixed, drawn only as they scroll in.
  const groupsShown: [string, NoteEntry[]][] = grouped.map(([name, list]) => [name, list.map((item) => entryOf(item, shown.indexOf(item)))])
  return (
    <div data-tag-page className="flex w-full flex-col pb-16">
      {reading && <ReadThrough items={reading.list} start={reading.start} onClose={() => setReading(null)} />}
      <TagBand wash={facts.wash}>
      <TagHead tag={tag} color={color ?? null}
        meta={<>
          <span data-tag-held className="font-semibold text-foreground">{`${plural(counted.length, unit[0], unit[1])} with #${tag}`}</span>
          {later > 0 && <><Dot /><button type="button" data-later onClick={() => (chime(laterShown ? 'fold' : 'open'), setLaterShown(!laterShown))} className="cursor-pointer whitespace-nowrap text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground/60">
            {laterShown ? `hide the ${num(later)} resolved or done` : `and ${num(later)} resolved or done`}
          </button></>}
          <Dot /><span className="whitespace-nowrap">last added {ago(last)}</span>
          <Dot /><span className="whitespace-nowrap">first in {dayjs(first).format('MMMM YYYY')}</span>
        </>}
        actions={<>
          <PlayButton label="Read through  R" onClick={() => read(readable)} />
          <StudyMenu onStudy={onStudy} />
          <TagMenu tag={tag} color={color ?? null} onTag={onTag} onShuffle={readable.length > 1 ? shuffled : undefined}
            homeHidden={!!tagMeta.find((one) => one.tag === tag)?.homeHidden} />
        </>}
      />
      {/* One toolbar on the rows' own edges: the kinds as chips on the left; the words, the order and List or Stream on the right. */}
      <div data-tag-toolbar className="list-words @container/band flex flex-wrap items-center gap-2 pt-2 pb-1">
        <FilterChips view={display} onChange={setDisplay} facets={facets} className="flex-1" />
        {/* How many a filter leaves, in the toolbar's own line: a line of its own pushed every row down as you typed. */}
        {narrowed && shown.length > 0 && <span data-tag-narrowed className="text-control whitespace-nowrap text-muted-foreground tabular-nums">{`${num(shown.length)} of ${num(all.length)} shown`}</span>}
        {/* On a narrow window the field gives way first, so the order and List or Stream stay on the line. */}
        <span className="ml-auto flex min-w-0 items-center gap-1 [&>label]:w-44 [&>label]:min-w-24 [&>label]:shrink">
          {items.length > 1 && <ListSearch value={query} onChange={setQuery} onDone={() => undefined} placeholder={[...tag].length > FILTER_ROOM ? 'Filter this tag' : `Filter #${tag}`} />}
          <Display view={display} onChange={setDisplay} facets={facets} count={items.length} groups={view === 'list' ? [{ id: 'kind', label: 'Kind' }, { id: 'none', label: 'None' }] : []}
            sorts={[{ id: 'newest', label: 'Newest', reverse: { id: 'oldest', label: 'Oldest' } }, { id: 'changed', label: 'Recently changed' }, { id: 'name', label: 'A to Z' }]} />
          <ViewSwitch<View> value={view} onChange={(to) => {
            setView(to)
            try {
              localStorage.setItem(VIEW_KEY, to)
            } catch {
              // Applied, not kept.
            }
          }} options={[{ id: 'list', label: 'List', icon: <List /> }, { id: 'stream', label: 'Stream', icon: <AlignJustify /> }]} />
        </span>
      </div>
      </TagBand>
      {/* What is picked, and what can be done with it all: held at the top while you scroll, opaque. */}
      {several.bar && (
        <div data-pick-bar className="sticky top-(--tag-band) z-10 mt-1 w-full border-y bg-background">
          <div className="list-words flex min-h-11 items-center py-1.5">{several.bar}</div>
        </div>
      )}
      {!all.length ? (
        <Empty title={`Everything with #${tag} is resolved or done`} action={<button type="button" data-later onClick={() => (chime('open'), setLaterShown(true))} className="cursor-pointer text-control font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Show {later === 1 ? 'it' : `the ${num(later)}`}</button>}>
          Nothing with it is waiting on you.
        </Empty>
      ) : !shown.length ? (
        <Empty title="Nothing matches" action={<button type="button" onClick={() => (chime('undo'), setQuery(''), setDisplay({ ...display, filter: {} }))} className="cursor-pointer text-control font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Clear the filter</button>}>
          {`No note with #${tag} is of that kind${words.length ? ' or has those words' : ''}.`}
        </Empty>
      ) : view === 'list' ? (
        <div data-tag-list>
          <NoteList groups={groupsShown} density="list" table="nuggets" cursor={cursor} onCursor={setCursor} chosen={chosenIds}
            picking={picking} onPick={(id) => byId(id) && open(byId(id)!)} className="list-edge my-2" />
        </div>
      ) : (
        <div data-tag-stream className="list-edge list-ink">
          {days.map(([day, list]) => (
            <section key={day || 'all'}>
              {/* The day stays in view while its notes scroll under it. */}
              {day && <h2 className="sticky top-(--tag-band) z-10 bg-background pt-4 pb-1.5 text-control font-semibold text-foreground">{named(day)}</h2>}
              {/* The same menu, picking and picked look as the List view: what ⌘A picks is seen picked here too. */}
              {list.map((item) => <Entry key={`${item.type}-${item.id}`} tag={tag} item={item} ahead={shown.indexOf(item) < FIRST_READ} onOpen={onOpen} picked={several.picked(item)} onPick={(event) => several.click(event, item)}
                menu={several.menu(item) ?? [...rowMenu(item, shown.indexOf(item)), ...several.rowItems(item)]} differs={differs} />)}
            </section>
          ))}
          <div ref={end} className="h-px" />
        </div>
      )}
      {facts.often.length > 0 && (view === 'list' || count >= shown.length) && (
        <section data-often className="list-words mt-10">
          <h2 className="font-heading text-lead font-semibold text-foreground">Often with #{tag}</h2>
          <p className="mt-0.5 mb-3 text-control text-muted-foreground">Other tags on these notes, and how many notes carry both.</p>
          <div className="flex flex-wrap gap-2">
            {facts.often.map(([other, both]) => (
              <button
                key={other}
                type="button"
                data-often-tag={other}
                // The whole name and what the number counts, for a name cut short and for a screen reader.
                title={`#${other}: ${plural(both, 'note carries', 'notes carry')} both`}
                onClick={() => (chime('open'), onTag(other))}
                onPointerEnter={() => prefetchTag(other)}
                className="flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-control text-foreground transition-[background-color,scale] duration-150 ease-out hover:bg-foreground/[0.06] active:scale-[0.97]"
              >
                <TagIcon tag={other} color={tags.find((one) => one.tag === other)?.color} className="size-3.5" />
                <span className="min-w-0 truncate font-medium">{other}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{num(both)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** The dot between two parts of a line. */
const Dot = (): React.JSX.Element => <span aria-hidden className="mx-1.5 text-muted-foreground">·</span>

/**
 * The tag's own head, as Gems and Sources start theirs: no picture (a tag has
 * no cover), its mark in its colour and its name, a line that counts what it
 * holds, then what can be done with it, all on the rows' one left edge.
 */
function TagHead({ tag, color, meta, actions }: { tag: string; color: string | null; meta: React.ReactNode; actions?: React.ReactNode }): React.JSX.Element {
  return (
    <header data-tag-head className="list-words @container/band flex min-w-0 flex-col gap-1.5 pt-6 pb-3">
      {/* Its own box clips the name while it is drawn smaller (TagBand), so the name keeps the whole line to fit in. */}
      <div className="min-w-0 overflow-x-clip">
        <h1 data-tag-title className="flex min-w-0 origin-bottom-left items-center gap-2 font-heading text-[clamp(1.5rem,3.2vw,2.25rem)] leading-tight font-bold tracking-[-0.02em] text-foreground" title={`#${tag}`}>
          <TagIcon tag={tag} color={color} className="size-[0.75em]" />
          <span className="min-w-0 truncate pb-[0.2em] -mb-[0.2em]">{tag}</span>
        </h1>
      </div>
      {/* Over a picture's wash the grey is ink, so the line reads at 4.5:1 on any picture. */}
      <p data-tag-meta className="flex flex-wrap items-center gap-y-0.5 text-body text-muted-foreground group-data-washed/wash:text-(--mf-muted-strong)">{meta}</p>
      {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** The name's size once the head is held at the top: one line of a list's heading. */
const STUCK_TITLE = 20

/**
 * The head and its toolbar, held at the top of the page while the rows scroll
 * under it: one opaque band in the page's own colour, with the newest picture
 * among the notes faded in behind it when there is one. As the page scrolls,
 * the band rises by the room its big name takes over a one-line name and the
 * name shrinks into that line with the scroll, so nothing in the page moves
 * but the scroll itself; held, it wears a hairline and a soft edge. With
 * Reduce motion or Motion off the name is set small at the first scroll.
 * The band's held height is `--tag-band` on the page, for what sticks below it.
 */
function TagBand({ wash, children }: { wash: string | null; children: React.ReactNode }): React.JSX.Element {
  const band = useRef<HTMLDivElement>(null)
  const [broken, setBroken] = useState<string | null>(null)
  useLayoutEffect(() => {
    const box = band.current
    const title = box?.querySelector<HTMLElement>('[data-tag-title]')
    const scroller = box?.closest<HTMLElement>('.overflow-y-auto')
    const page = box?.parentElement
    if (!box || !title || !scroller || !page) return
    let rise = 0
    let small = 1
    let frame = 0
    // Drawn from where the page is scrolled: 0 at rest, 1 once held.
    const draw = (top = scroller.scrollTop): void => {
      frame = 0
      const done = rise > 0 ? Math.min(1, Math.max(0, top / rise)) : top > 0 ? 1 : 0
      const now = still() ? (top > 0 ? 1 : 0) : done
      const scale = 1 - (1 - small) * now
      title.style.transform = now ? `scale(${scale})` : ''
      title.style.width = now ? `${100 / scale}%` : ''
      box.toggleAttribute('data-stuck', top > 0 && top >= rise)
    }
    // What rises: from the band's top to the name's foot, less a one-line name and the small gap kept above it.
    // Everything read first, then everything written: a read after a write laid the whole page out again, twice more,
    // in the frame a tag opens (about 30 ms of the click, qa/open-speed-big.mjs).
    const measure = (): void => {
      const size = parseFloat(getComputedStyle(title).fontSize) || STUCK_TITLE
      small = Math.min(1, STUCK_TITLE / size)
      // Its foot stays put as it shrinks (it shrinks toward its bottom left), so it can be read at any scroll.
      const foot = title.getBoundingClientRect().bottom - box.getBoundingClientRect().top
      const height = title.offsetHeight
      const tall = box.offsetHeight
      const top = scroller.scrollTop
      rise = Math.max(0, Math.round(foot - height * small - 8))
      box.style.top = `${-rise}px`
      page.style.setProperty('--tag-band', `${tall - rise}px`)
      // A row reached with the keys stops under the band, not behind it.
      scroller.style.scrollPaddingTop = `${tall - rise}px`
      draw(top)
    }
    const onScroll = (): void => void (frame ||= requestAnimationFrame(() => draw()))
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    measure()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      watch.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      scroller.style.scrollPaddingTop = ''
    }
  }, [])
  const shown = wash && broken !== wash ? wash : null
  return (
    <div ref={band} data-tag-band data-washed={shown ? '' : undefined}
      className="group/wash sticky z-20 bg-background transition-shadow duration-200 ease-out data-stuck:shadow-[0_1px_0_var(--border),0_8px_16px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_40%,transparent)]">
      {shown && (
        <div aria-hidden data-backdrop className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(180deg,transparent_0%,black_18%,black_55%,transparent_100%)]">
          <img src={small(shown, 640)} alt="" draggable={false} onError={() => setBroken(shown)} className="size-full scale-110 object-cover opacity-90 blur-md" />
          {/* The page's colour over it, so plain and grey words still read on any picture, light theme or dark: at 78% the
              count line read 4.49:1 on the loudest picture's darkest pixel in light (qa/tag-page.mjs), at 80% over 4.5:1. */}
          <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--background)_80%,transparent)]" />
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * A tag not read yet: its name at once, and the orb where its notes will be.
 * Only after a moment, so a quick read never flickers.
 */
function Waiting({ tag, color }: { tag: string; color: string | null }): React.JSX.Element {
  return (
    <motion.div aria-busy className="flex w-full flex-col pb-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.25 }}>
      <TagHead tag={tag} color={color}meta={' '} actions={<span className="h-8" />} />
      <div className="list-words">
        {/* The app's one way to say "a real wait": the orb and its shimmering words, never grey bars. */}
        <div className="py-4"><Orb label={`Gathering #${tag}…`} /></div>
      </div>
    </motion.div>
  )
}

/** What a row says beside its words, when it differs from the rows around it: tags they do not all carry, and its kind where kinds are mixed. */
type Differs = { tags: string[]; kind: boolean }

/** How a note's words read in the stream: a few lines, clean text, never Markdown's marks or a line of only tags. */
const LINES = 5
const wordsOf = (item: TagRead): string => {
  const said = glance(rowBody((item.body as JSONContent | string | null) ?? '', item.type !== 'capture' ? item.title : ''))
  // Tags at the end of a line are the note's filing, not its words: the page already says which tag this is.
  return said.split('\n').map((line) => line.replace(/(?:^|\s+)(?:#[^\s#]+\s*)+$/u, '').trim()).filter(Boolean).join('\n')
}

/** How many of the stream's notes have their picture in its first frame: more than a window shows at once. Whole photos, so not all of a long tag's. */
const FIRST_READ = 8

/**
 * One note in the stream, read as a page of a commonplace book: its title
 * when it has one, then its own words (a few lines, clean), then its picture
 * at a reading size. Beside it, only what sets it apart from the rest.
 */
function Entry({ tag, item, ahead, onOpen, picked, onPick, menu, differs }: { /** The page's tag: a note that carries it on some of its blocks shows those blocks. */ tag: string; item: TagRead; /** One of the first few: its picture is drawn in the page's first frame; one further down loads as it nears the screen. */ ahead: boolean; onOpen: (type: string, id: string) => void; picked: boolean; /** ⌘ or ⇧ held: picked as Finder picks, and true. */ onPick: (event: React.MouseEvent | React.KeyboardEvent) => boolean; menu: RowItem[]; differs: Differs }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
  const Icon = item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem
  // ⌥⌘-click: in a window of its own, as in every list; ⌘-click and ⇧-click pick it.
  const open = (event: React.MouseEvent | React.KeyboardEvent): void => void (event.metaKey && event.altKey ? openApart(item.type, item.id) : onPick(event) || onOpen(item.type, item.id))
  const words = useMemo(() => wordsOf(item), [item])
  // Tagged on a few of its blocks, not as a whole: those blocks are what the tag holds, under the note's name.
  const blocks = useMemo(() => taggedBlocks(item.body, tag), [item.body, tag])
  const picture = useMemo(() => pictureIn(item.body), [item.body])
  // A gem whose words are its title alone reads as those words, not as a bold heading over nothing.
  const title = item.type !== 'capture' && item.title && words ? itemName(item.type, item.title).text : ''
  const lead = words || (item.type !== 'capture' ? itemName(item.type, item.title || item.label).text : item.label)
  const others = item.tags.filter((one) => !differs.tags.includes(one))
  const status = item.type === 'capture' && item.status !== 'open' ? statusSaid(item.status, item.keptIn).replace(/^./, (c) => c.toLowerCase()) : item.type === 'task' && item.status === 'done' ? 'done' : ''
  const aside = differs.kind || others.length > 0 || !!status
  return (
    <RowMenu items={menu}>
    <article data-entry data-private={item.private ? '' : undefined} data-picked={picked || undefined} className={`group/entry -mx-2 flex min-w-0 flex-col gap-1.5 border-b border-border/50 px-2 py-3.5 last:border-b-0 @[44rem]/page:flex-row @[44rem]/page:gap-6 ${PICKED_MARK}`}>
      <div
        data-pick={`${item.type}:${item.id}`}
        role="link"
        tabIndex={0}
        aria-label={`Open ${item.label || 'it'}`}
        onClick={(event) => !(event.target as HTMLElement).closest('a, button, input, summary') && open(event)}
        onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && open(event)}
        className="private-text min-w-0 flex-1 cursor-pointer rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {blocks ? (
          <>
            <p data-entry-from className="mb-1.5 truncate text-control text-muted-foreground">From {quoted(item.type !== 'capture' ? itemName(item.type, item.title || item.label).text : item.label || 'New note', 80)}</p>
            <div data-entry-blocks className="flex max-w-[68ch] flex-col gap-1.5 border-l-2 border-foreground/15 pl-3">
              {blocks.lines.map((line, at) => <p key={at} dir="auto" className="text-[0.9375rem] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>{line}</p>)}
              {blocks.more > 0 && <p className="text-control text-muted-foreground">And {plural(blocks.more, 'more line', 'more lines')} with #{tag}</p>}
            </div>
          </>
        ) : <>
        {title && <h3 data-entry-title className="mb-1 font-semibold text-foreground">{title}</h3>}
        <p data-entry-words className="max-w-[68ch] text-[0.9375rem] leading-relaxed whitespace-pre-line text-foreground/90" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: LINES, overflow: 'hidden' }}>{lead || 'New note'}</p></>}
        {picture && !blocks && <Decoded data-entry-picture="" src={picture} ahead={ahead} className="mt-2.5 max-h-60 max-w-full rounded-md object-contain" />}
      </div>
      {/* Only what sets it apart: its kind where kinds are mixed, a state, tags the others do not carry. Quiet, out of the words' way. */}
      {aside && (
        <aside data-entry-aside className="flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-3 gap-y-1 text-control whitespace-nowrap text-muted-foreground @[44rem]/page:max-w-[30%] @[44rem]/page:shrink-0 @[44rem]/page:flex-col @[44rem]/page:items-end @[44rem]/page:pt-1">
          {(differs.kind || status) && (
            <span className="flex items-center gap-1">
              {differs.kind && <><Icon className="size-3.5" style={kind && item.type === 'capture' ? { color: kind.tint } : undefined} />{item.type === 'capture' ? kind?.label ?? NAME.capture : NAME[item.type] ?? item.type}</>}
              {status && <span>{differs.kind ? '· ' : ''}{status}</span>}
            </span>
          )}
          {others.length > 0 && <span data-entry-tags className="block max-w-full min-w-0 truncate" title={others.map((one) => `#${one}`).join(' ')}>{others.map((one) => `#${one}`).join(' ')}</span>}
        </aside>
      )}
    </article>
    </RowMenu>
  )
}

export type StudyWay = 'review' | 'practise' | 'blurt'

/** Studying the tag, three ways in one button, each line saying what it does. */
function StudyMenu({ onStudy }: { onStudy: (how: StudyWay) => void }): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-study-menu className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-control font-medium text-foreground transition-[background-color,scale] duration-150 hover:bg-foreground/[0.06] active:scale-[0.97] data-[state=open]:bg-foreground/[0.06]">
          Study <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem data-study-tag onSelect={() => (chime('open'), onStudy('review'))}>Review its cards (each grade counts)</DropdownMenuItem>
        <DropdownMenuItem data-practise-open onSelect={() => (chime('open'), onStudy('practise'))}>Practise its cards (nothing counted)</DropdownMenuItem>
        <DropdownMenuItem data-blurt-open onSelect={() => (chime('open'), onStudy('blurt'))}>Blurt: write all you remember</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const COLOURS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

/**
 * Everything else the tag can do, in one menu, every line named: read it in
 * a random order, rename or merge, its colour, a deck of its cards, its row
 * on Home, a copy.
 */
function TagMenu({ tag, color, onTag, onShuffle, homeHidden }: {
  tag: string
  color: string | null
  onTag: (tag: string) => void
  onShuffle?: () => void
  homeHidden: boolean
}): React.JSX.Element {
  const all = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>).map((one) => one.tag)
  const side = sideTagLine(tag, useLive(haligtree.settings, null)?.sideTags, all)
  const decks = useLive(haligtree.madeDecks, [] as string[])
  const colourTo = (one: string): void => {
    const next = color === one ? null : one
    void haligtree.setTag(tag, { color: next }).then(() => (chime('settled'), toast(next ? `#${tag} is ${next} now` : `#${tag} has no colour now`, () => void haligtree.setTag(tag, { color }).then(() => chime('undo')))))
  }
  return (
    <DropdownMenu modal={false}>
      <Tip label="More for this tag">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More for this tag" data-tag-more className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.94] data-[state=open]:text-foreground">
            <AliveIcon icon={DotsHorizontalIcon} size={20} />
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="w-60">
        {onShuffle && <DropdownMenuItem onSelect={onShuffle}>Read in a random order</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => void renameTag(tag, onTag)}>Rename or merge…</DropdownMenuItem>
        <DropdownMenuItem data-tag-side onSelect={side.run}>{side.label}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-tag-colour-menu>Colour</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup value={color ?? ''} onValueChange={colourTo}>
              {COLOURS.map((one) => (
                <DropdownMenuRadioItem key={one} value={one} data-tag-swatch={one}>
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: `var(--tt-color-text-${one})` }} />
                  <span className="capitalize">{one}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {!decks.includes(tag) && <DropdownMenuItem data-tag-deck onSelect={() => void madeDeck(tag)}>Make a deck of its cards</DropdownMenuItem>}
        {/* The way back for a row taken off Home, and the same choice made from here. */}
        {homeHidden
          ? <DropdownMenuItem onSelect={() => void haligtree.setTag(tag, { homeHidden: false }).then(() => toast(`Home shows #${tag} again`))}>Show its row on Home</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => sayNow(haligtree.setTag(tag, { homeHidden: true }), `Home no longer shows “More from #${tag}”`, () => void haligtree.setTag(tag, { homeHidden: false }))}>Hide its row from Home</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy(`#${tag}`, `Copied #${tag}`)}>Copy #{tag}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
