import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { AlignJustify, Plus, Shuffle } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import UnorderedListIcon from '@/components/ui/unordered-list-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import BookmarkIcon from '@/components/ui/bookmark-icon'

import { MindflowEditor, TAGS } from '../mindflow'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Pin as Pinned, type TagRead, type Task } from '@/lib/vigil'
import { openWindow } from '@/lib/notes'
import { statusSaid } from '@/lib/capture-links'
import { chime } from '@/lib/sound'
import { Empty, Tags, ask, pin, refuse, toast, typing, useReadKey } from './ui'
import { RowMenu, copy, type MenuItem, type RowItem } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { ReadThrough, type Readable } from './read-through'
import { addToQuestion } from './questions-view'
import { CollectionHeader, Cover, MenuButton, PlayButton, QuietAction, TrackList, ViewSwitch, pictureIn, useTint, wordsIn, type Track } from './collection-header'
import { Display, FilterChips, arrange, useView, type Facet } from './display'
import { ListSearch } from './note-list'
import { motion } from 'motion/react'
import { ago, dayKey, dayMonth, dayName, dayjs, noon, num } from '../../../../main/dates'
import { asideItem, useHere } from '@/lib/split'
import { queueItems } from '@/lib/reading-queue'
import { PICKED_MARK, usePickMixed } from './pick-mixed'

// itshover drawings in lucide's place, moving when their control is pointed at.
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const List = alive(UnorderedListIcon)
const Orbit = alive(QuestionMarkIcon)
const Pin = alive(BookmarkIcon)
const PinOff = alive(BookmarkIcon)

const ICON = { nugget: Gem, article: FileText, question: Orbit }
const NAME: Record<string, string> = { capture: 'Capture', nugget: 'Gem', article: 'Article', question: 'Question' }
const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

/** A tag's colour as CSS: its own, or one picked from its name so it is always the same. */
export const tagColour = (tag: string, color: string | null | undefined): string => {
  const hash = [...tag].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)
  return `var(--tt-color-text-${color ?? COLORS[1 + (hash % (COLORS.length - 1))]})`
}

/** Tags kept at the top of the sidebar, in this window. */
const PINNED = 'tags:pinned'
const readPinned = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(PINNED) ?? '[]') as string[]
  } catch {
    return []
  }
}
export function usePinnedTags(): [string[], (tag: string, on: boolean) => void] {
  const [pinned, setPinned] = useState(readPinned)
  useEffect(() => {
    const again = (): void => setPinned(readPinned())
    window.addEventListener('vigil:tag-pins', again)
    return () => window.removeEventListener('vigil:tag-pins', again)
  }, [])
  return [pinned, (tag, on) => {
    const next = on ? [tag, ...readPinned().filter((one) => one !== tag)] : readPinned().filter((one) => one !== tag)
    try {
      localStorage.setItem(PINNED, JSON.stringify(next))
    } catch {
      // Applied, not kept.
    }
    chime(on ? 'pin' : 'unpin')
    window.dispatchEvent(new Event('vigil:tag-pins'))
  }]
}

type View = 'stream' | 'list'
const readView = (): View => {
  try {
    return localStorage.getItem('tag:view') === 'list' ? 'list' : 'stream'
  } catch {
    return 'stream'
  }
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
  const read = vigil.tagRead(tag).then((list) => (kept.set(tag, list), list)).finally(() => reading.delete(tag))
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
export function useLiveFor<T>(key: string, read: () => Promise<T>, first: () => T | null = () => null): T | null {
  const [got, setGot] = useState<{ key: string; value: T | null }>(() => ({ key, value: first() }))
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
    void read().then(take)
    const off = window.api.captures.onChange(() => void read().then(take))
    return () => {
      live = false
      off()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return got.key === key ? got.value : first()
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
export function TagStream({ tag, color, onOpen, onTag, onManage }: {
  tag: string
  color?: string | null
  onOpen: (type: string, id: string) => void
  /** Another tag's page, or this one renamed. */
  onTag: (tag: string) => void
  /** Colour, alias and exam date, on the other tab. */
  onManage: () => void
}): React.JSX.Element {
  // Shown at once from what was read before (a tag gone back to, or pointed
  // at in the sidebar), then read again; never another tag's notes.
  const items = useLiveFor(tag, () => readTag(tag), () => kept.get(tag) ?? null)
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const pins = useLive(vigil.pins, [] as Pinned[])
  // A task tagged here gets the menu it has on Today: a focus session, done, when.
  const tasks = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  const [pinnedTags, pinTag] = usePinnedTags()
  const [view, setView] = useState(readView)
  const [reading, setReading] = useState<{ list: Readable[]; start: number } | null>(null)
  // Sort and filter, kept for each tag on its own; the words looked for are not kept.
  const [display, setDisplay] = useView(`tag:${tag}`, { sort: 'newest', group: 'none' })
  const [query, setQuery] = useState('')
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
  // The cover is the newest picture among them; the words counted once per load.
  const facts = useMemo(() => {
    const list = items ?? []
    const cover = list.filter((item) => !item.private).map((item) => pictureIn(item.body)).find(Boolean) ?? null
    const together = new Map<string, number>()
    for (const item of list) for (const other of item.tags) together.set(other, (together.get(other) ?? 0) + 1)
    return {
      cover,
      words: new Map(list.map((item) => [item.id, wordsIn(item.body)])),
      often: [...together].sort((a, b) => b[1] - a[1]).slice(0, 6)
    }
  }, [items])
  // The words of each, for the filter, only once something is looked for.
  const texts = useMemo(() => (query.trim() && items ? new Map(items.map((item) => [item.id, `${item.title} ${item.label} ${textIn(item.body)}`.toLowerCase()])) : null), [items, query.trim() !== ''])
  const colour = tagColour(tag, color)
  const tint = useTint(items ? facts.cover : null, colour)
  // By kind, as every list is filtered, and by what it is: a capture, an idea, an article.
  const all = items ?? []
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
  const read = (list: TagRead[], start = 0): void => setReading({ list: list.map(({ type, id }) => ({ type, id })), start })
  const shuffled = (): void => {
    if (!shown.length) return
    chime('slide')
    read([...shown].sort(() => Math.random() - 0.5))
  }
  useReadKey(() => shown.length && read(shown), shown.length, !reading)
  // R on its own reads it through, as the button says.
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    if (!shown.length || reading) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing()) return
      event.preventDefault()
      read(shown)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, reading]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⇧-click, x and ⌘A pick several of what is shown, to make tasks of or queue together.
  const several = usePickMixed(shown, { here })

  if (!items) return <Waiting tag={tag} colour={colour} />
  if (!items.length)
    return <Empty title={`Nothing carries #${tag} now`}>Whatever had it was moved to the Bin or archived, or the tag was taken off. Write it into anything and it reads here.</Empty>
  // The first and the last carried, whatever the order shown.
  const first = items.reduce((at, item) => (item.at < at ? item.at : at), items[0].at)
  const last = items.reduce((at, item) => (item.at > at ? item.at : at), items[0].at)
  const isPinned = pinnedTags.includes(tag)
  const pinnedNote = (item: TagRead): boolean => pins.some((one) => one.id === item.id)
  const table = (item: TagRead): 'captures' | 'nuggets' => (item.type === 'capture' ? 'captures' : 'nuggets')
  const open = (item: TagRead, event?: React.MouseEvent | React.KeyboardEvent): void => (event?.metaKey ? openWindow(item.type, item.id) : onOpen(item.type, item.id))
  const rename = async (): Promise<void> => {
    const to = await ask(`Rename #${tag} everywhere. A tag that exists already takes these in.`, 'new name', 'tag', tag)
    if (!to || to.replace(/^#/, '') === tag) return
    // Onto a tag already there it is a merge, which cannot be pulled apart: only a plain rename has an Undo.
    const merging = (await vigil.tags()).some((one) => one.tag === to.replace(/^#/, '').toLowerCase())
    const done = await vigil.renameTag(tag, to)
    if (!done) return refuse('Not renamed: a tag starts with a letter and uses only letters, numbers, dashes and underscores')
    chime('retag')
    toast(merging ? `#${tag} is merged into #${done} everywhere` : `#${tag} is now #${done} everywhere`, merging ? undefined : () => void vigil.renameTag(done, tag).then(() => onTag(tag)))
    onTag(done)
  }
  const rowMenu = (item: TagRead, index: number): RowItem[] => {
    const task = item.type === 'task' ? tasks.find((one) => one.id === item.id) : null
    return task ? taskMenu(task, { open: () => open(item), now: taskNow }) : noteMenu(item, index)
  }
  const noteMenu = (item: TagRead, index: number): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => open(item) },
    { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow(item.type, item.id) },
    asideItem(item.type, item.id),
    ...queueItems(item.id),
    { label: 'Read from here', run: () => read(shown, index) },
    'separator',
    { label: pinnedNote(item) ? 'Unpin' : 'Pin', run: () => pin(table(item), item.id, !pinnedNote(item)) },
    item.type === 'capture' && item.status === 'open' && { label: 'Add to a question…', run: () => void addToQuestion(item.id) },
    'separator',
    { label: 'Copy its title', run: () => copy(item.title || item.label) }
  ]
  const tracks: Track[] = shown.map((item, index) => {
    const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
    const Icon = item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem
    const words = facts.words.get(item.id) ?? 0
    const asks = item.type === 'capture' && item.status === 'open'
    return {
      key: `${item.type}-${item.id}`,
      title: item.title || item.label,
      icon: <Icon className="size-4 shrink-0 text-muted-foreground" style={kind && item.type === 'capture' ? { color: kind.tint } : undefined} />,
      cells: [dayMonth(item.at), `${num(words)} ${words === 1 ? 'word' : 'words'}`],
      private: item.private,
      onOpen: (event) => (event.shiftKey ? several.toggle(item) : open(item, event)),
      pick: `${item.type}:${item.id}`,
      picked: several.picked(item),
      onPlay: () => read(shown, index),
      // A capture still open can go into a question; a kept note can be pinned.
      // A task is not pinned: its menu has what it can do.
      add: item.type === 'task' ? undefined : asks
        ? { label: 'Add to a question', icon: <Plus />, run: () => void addToQuestion(item.id) }
        : { label: pinnedNote(item) ? 'Unpin' : 'Pin', icon: pinnedNote(item) ? <PinOff /> : <Pin />, on: pinnedNote(item), run: () => pin(table(item), item.id, !pinnedNote(item)) },
      menu: several.menu(item) ?? [...rowMenu(item, index), ...several.rowItems(item)]
    }
  })
  // Under the day each was written, or changed; in A to Z, one run without days.
  const days: [string, TagRead[]][] = []
  for (const item of shown.slice(0, count)) {
    const day = display.sort === 'name' ? '' : dayKey(display.sort === 'changed' ? item.changed ?? item.at : item.at)
    const last = days[days.length - 1]
    if (last?.[0] === day) last[1].push(item)
    else days.push([day, [item]])
  }
  return (
    <div className="flex w-full flex-col pb-16">
      {reading && <ReadThrough items={reading.list} start={reading.start} onClose={() => setReading(null)} />}
      <CollectionHeader
        tint={tint}
        cover={<Cover src={facts.cover} colour={colour} seed={`tag:${tag}`}>#{tag}</Cover>}
        label="Tag"
        title={<span>#{tag}</span>}
        meta={[`${num(items.length)} ${items.length === 1 ? 'note' : 'notes'}`, `since ${dayjs(first).format('MMM YYYY')}`, `last added ${ago(last)}`]}
        actions={<>
          <PlayButton label="Read through  R" onClick={() => read(shown)} />
          <QuietAction label="Read in a random order" onClick={shuffled}><Shuffle /></QuietAction>
          <QuietAction label={isPinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'} pressed={isPinned} onClick={() => pinTag(tag, !isPinned)}>{isPinned ? <PinOff /> : <Pin />}</QuietAction>
          <MenuButton items={[
            { label: 'Rename or merge…', run: () => void rename() },
            { label: 'Edit tag…', hint: 'Colour, alias and exam date', run: onManage },
            'separator',
            { label: `Copy #${tag}`, run: () => copy(`#${tag}`, `Copied #${tag}`) }
          ]} />
          <ViewSwitch<View> value={view} onChange={(to) => {
            setView(to)
            try {
              localStorage.setItem('tag:view', to)
            } catch {
              // Applied, not kept.
            }
          }} options={[{ id: 'stream', label: 'Stream', icon: <AlignJustify /> }, { id: 'list', label: 'List', icon: <List /> }]} />
        </>}
      />
      {/* Sort and filter, as every list has them: the kinds as chips, the words and the order on the right. */}
      <div className="page-column flex items-center gap-2 px-5 pb-1 @[44rem]/page:px-8">
        <FilterChips view={display} onChange={setDisplay} facets={facets} className="flex-1" />
        <span className="ml-auto flex shrink-0 items-center gap-1 [&>label]:w-44">
          <ListSearch value={query} onChange={setQuery} onDone={() => undefined} placeholder={`Filter #${tag}`} />
          <Display view={display} onChange={setDisplay} facets={facets}
            sorts={[{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'changed', label: 'Recently changed' }, { id: 'name', label: 'A to Z' }]} />
        </span>
      </div>
      {narrowed && (
        <p className="page-column px-5 pt-1 text-xs text-muted-foreground @[44rem]/page:px-8">{shown.length ? `${num(shown.length)} of ${num(items.length)} shown` : null}</p>
      )}
      {/* What is picked, and what can be done with it all: held at the top while you scroll, opaque. */}
      {several.bar && (
        <div data-pick-bar className="sticky top-0 z-20 mt-1 w-full border-y bg-background">
          <div className="page-column flex min-h-11 items-center px-5 py-1.5 @[44rem]/page:px-8">{several.bar}</div>
        </div>
      )}
      {!shown.length ? (
        <Empty title="Nothing matches" action={<button type="button" onClick={() => (chime('undo'), setQuery(''), setDisplay({ ...display, filter: {} }))} className="text-control font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Clear the filter</button>}>
          {`No note with #${tag} is of that kind${words.length ? ' or has those words' : ''}.`}
        </Empty>
      ) : view === 'list' ? <TrackList columns={[{ label: 'Date', size: '6.5rem', wide: true }, { label: 'Words', size: '5.5rem' }]} tracks={tracks} /> : (
        <div className="page-narrow mx-auto w-full px-5 [--mf-padding:0]">
          {days.map(([day, list]) => (
            <section key={day || 'all'}>
              {/* The day stays in view while its notes scroll under it. */}
              {day && <h2 className="sticky top-0 z-10 -mx-1 bg-background px-1 pt-4 pb-1.5 text-meta font-semibold text-muted-foreground">{named(day)}</h2>}
              {/* The same menu, picking and picked look as the List view: what ⌘A picks is seen picked here too. */}
              {list.map((item) => <Entry key={`${item.type}-${item.id}`} item={item} onOpen={onOpen} picked={several.picked(item)} onPick={() => several.toggle(item)}
                menu={several.menu(item) ?? [...rowMenu(item, shown.indexOf(item)), ...several.rowItems(item)]} />)}
            </section>
          ))}
          <div ref={end} className="h-px" />
        </div>
      )}
      {(view === 'list' || count >= shown.length) && (
        <footer className="page-column mt-6 px-5 text-xs text-muted-foreground @[44rem]/page:px-8">
          <p>First carried {dayName(first)}</p>
          {dayKey(first) !== dayKey(last) && <p>Last added {dayName(last)}</p>}
        </footer>
      )}
      {facts.often.length > 0 && (
        <section className="page-column mt-10 px-5 @[44rem]/page:px-8">
          <h2 className="mb-3 font-heading text-lg font-bold tracking-[-0.01em]">Often with #{tag}</h2>
          <div className="grid grid-cols-3 gap-2 @[40rem]/page:grid-cols-4 @[56rem]/page:grid-cols-6">
            {facts.often.map(([other, n]) => {
              const shade = tagColour(other, tags.find((one) => one.tag === other)?.color)
              return (
                <button
                  key={other}
                  type="button"
                  onClick={() => (chime('open'), onTag(other))}
                  className="group/card flex min-w-0 flex-col gap-2 rounded-lg p-2 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-foreground/[0.05] active:scale-[0.98]"
                >
                  <span className="relative aspect-square w-full overflow-hidden rounded-md shadow-(--mf-shadow-lift) [container-type:inline-size]" style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${shade} 78%, white), color-mix(in oklab, ${shade} 72%, black))` }}>
                    <span className="absolute inset-0 flex items-end p-[9cqi] font-heading text-[clamp(0.7rem,15cqi,2rem)] leading-none font-bold tracking-[-0.03em] break-all text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.25)]">#{other}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-control font-medium">#{other}</span>
                    <span className="block truncate text-xs text-muted-foreground">{num(n)} together</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * A tag not read yet: its name and its colour at once, and where its notes
 * will be, faint. Only after a moment, so a quick read never flickers.
 */
function Waiting({ tag, colour }: { tag: string; colour: string }): React.JSX.Element {
  return (
    <motion.div aria-busy className="flex w-full flex-col pb-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.25 }}>
      <CollectionHeader tint={null} cover={<Cover colour={colour} seed={`tag:${tag}`}>#{tag}</Cover>} label="Tag" title={<span>#{tag}</span>} meta={['\u00a0']}
        actions={<span className="h-9" />} />
      <div className="page-narrow mx-auto w-full px-5">
        {[0.62, 0.48, 0.7, 0.4].map((width, index) => (
          <div key={index} className="border-b border-border/50 py-4 last:border-b-0">
            <div className="h-3 rounded-full bg-foreground/[0.06]" style={{ width: `${width * 100}%` }} />
            <div className="mt-2.5 h-3 rounded-full bg-foreground/[0.04]" style={{ width: `${(width - 0.15) * 100}%` }} />
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function Entry({ item, onOpen, picked, onPick, menu }: { item: TagRead; onOpen: (type: string, id: string) => void; picked: boolean; onPick: () => void; menu: RowItem[] }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
  const Icon = item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem
  // ⌘-click: in a window of its own, as in every list; ⇧-click picks it.
  const open = (event: React.MouseEvent | React.KeyboardEvent): void => (event.shiftKey ? onPick() : event.metaKey ? openWindow(item.type, item.id) : onOpen(item.type, item.id))
  return (
    <RowMenu items={menu}>
    <article data-private={item.private ? '' : undefined} data-picked={picked || undefined} className={`group/entry -mx-2 flex flex-col gap-1.5 border-b border-border/50 px-2 py-3 last:border-b-0 @[44rem]/page:flex-row @[44rem]/page:gap-4 ${PICKED_MARK}`}>
      <div
        data-pick={`${item.type}:${item.id}`}
        role="link"
        tabIndex={0}
        aria-label={`Open ${item.label || 'it'}`}
        // A toggle or a link inside the words does its own thing; anywhere else opens it.
        onClick={(event) => !(event.target as HTMLElement).closest('a, button, input, summary') && open(event)}
        onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && open(event)}
        className="private-text min-w-0 flex-1 cursor-pointer rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 [&_.tiptap.ProseMirror]:cursor-pointer [&_.mindflow-editor-content]:p-0 [&_.ProseMirror>p:last-child:has(>br:only-child)]:hidden"
      >
        {item.title && item.type !== 'capture' && <h3 className="mb-1 font-semibold">{item.title}</h3>}
        <MindflowEditor
          host={window.api}
          tokens={TAGS}
          readOnly
          defaultContent={(item.body as JSONContent | string | null) ?? ''}
          toolbar={false}
          handles={false}
          slash={false}
          outline={false}
          search={false}
          vim={false}
          autofocus={false}
        />
      </div>
      {/* Its other routes back, then what it is: on the right, out of the words' way. */}
      <aside className="flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1.5 text-xs whitespace-nowrap text-muted-foreground @[44rem]/page:max-w-[38%] @[44rem]/page:flex-col @[44rem]/page:items-end @[44rem]/page:pt-1">
        <Tags tags={item.tags} alone />
        <span className="flex items-center gap-1 opacity-70 transition-opacity group-hover/entry:opacity-100">
          <Icon className="size-3.5" style={kind && item.type === 'capture' ? { color: kind.tint } : undefined} />
          {item.type === 'capture' ? kind?.label ?? NAME.capture : NAME[item.type] ?? item.type}
          {item.status !== 'open' && item.type === 'capture' && <span>· {statusSaid(item.status, item.keptIn).replace(/^./, (c) => c.toLowerCase())}</span>}
        </span>
      </aside>
    </article>
    </RowMenu>
  )
}
