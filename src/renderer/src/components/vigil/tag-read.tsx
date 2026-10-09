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
import { useLive, vigil, type Pin as Pinned, type TagRead } from '@/lib/vigil'
import { openWindow } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { Empty, Tags, ask, pin, refuse, toast, typing, useReadKey } from './ui'
import { copy, type MenuItem } from './row-menu'
import { ReadThrough, type Readable } from './read-through'
import { addToQuestion } from './questions-view'
import { CollectionHeader, Cover, MenuButton, PlayButton, QuietAction, TrackList, ViewSwitch, pictureIn, useTint, wordsIn, type Track } from './collection-header'
import { ago, dayKey, dayMonth, dayName, dayjs, noon, num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const List = alive(UnorderedListIcon)
const Orbit = alive(QuestionMarkIcon)
const Pin = alive(BookmarkIcon)
const PinOff = alive(BookmarkIcon)

const ICON = { nugget: Gem, article: FileText, question: Orbit }
const NAME: Record<string, string> = { capture: 'Capture', nugget: 'Idea', article: 'Article', question: 'Question' }
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
  const items = useLive(() => vigil.tagRead(tag), null as TagRead[] | null, [tag])
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const pins = useLive(vigil.pins, [] as Pinned[])
  const [pinnedTags, pinTag] = usePinnedTags()
  const [view, setView] = useState(readView)
  const [reading, setReading] = useState<{ list: Readable[]; start: number } | null>(null)
  const [count, setCount] = useState(BATCH)
  useEffect(() => setCount(BATCH), [tag])
  // More come in as the end comes into view.
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mark = end.current
    if (!mark) return
    const watch = new IntersectionObserver((seen) => seen.some((one) => one.isIntersecting) && setCount((n) => n + BATCH), { rootMargin: '600px' })
    watch.observe(mark)
    return () => watch.disconnect()
  }, [items === null, view])
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
  const colour = tagColour(tag, color)
  const tint = useTint(facts.cover, colour)
  const read = (list: TagRead[], start = 0): void => setReading({ list: list.map(({ type, id }) => ({ type, id })), start })
  const shuffled = (): void => {
    if (!items?.length) return
    chime('slide')
    read([...items].sort(() => Math.random() - 0.5))
  }
  useReadKey(() => items && read(items), items?.length ?? 0, !reading)
  // R on its own reads it through, as the button says.
  useEffect(() => {
    if (!items?.length || reading) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing()) return
      event.preventDefault()
      read(items)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, reading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!items) return <div className="flex-1" />
  if (!items.length)
    return <Empty shape={['polygon', 3]} title={`Nothing carries #${tag} now`}>Whatever had it was let go or archived, or the tag was taken off. Write it into anything and it reads here.</Empty>
  const first = items[items.length - 1].at
  const last = items[0].at
  const isPinned = pinnedTags.includes(tag)
  const pinnedNote = (item: TagRead): boolean => pins.some((one) => one.id === item.id)
  const table = (item: TagRead): 'captures' | 'nuggets' => (item.type === 'capture' ? 'captures' : 'nuggets')
  const open = (item: TagRead, event?: React.MouseEvent | React.KeyboardEvent): void => (event?.metaKey ? openWindow(item.type, item.id) : onOpen(item.type, item.id))
  const rename = async (): Promise<void> => {
    const to = await ask(`Rename #${tag} everywhere. A tag that exists already takes these in.`, 'New name', undefined, tag)
    if (!to || to.replace(/^#/, '') === tag) return
    const done = await vigil.renameTag(tag, to)
    if (!done) return refuse('Not renamed: a tag starts with a letter and uses only letters, numbers, dashes and underscores')
    chime('retag')
    toast(`#${tag} is now #${done} everywhere`)
    onTag(done)
  }
  const rowMenu = (item: TagRead, index: number): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => open(item) },
    { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow(item.type, item.id) },
    { label: 'Read from here', run: () => read(items, index) },
    'separator',
    { label: pinnedNote(item) ? 'Unpin' : 'Pin', run: () => pin(table(item), item.id, !pinnedNote(item)) },
    item.type === 'capture' && item.status === 'open' && { label: 'Add to a question…', run: () => void addToQuestion(item.id) },
    'separator',
    { label: 'Copy its title', run: () => copy(item.title || item.label) }
  ]
  const tracks: Track[] = items.map((item, index) => {
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
      onOpen: (event) => open(item, event),
      onPlay: () => read(items, index),
      // A capture still open can go into a question; a kept note can be pinned.
      add: asks
        ? { label: 'Add to a question', icon: <Plus />, run: () => void addToQuestion(item.id) }
        : { label: pinnedNote(item) ? 'Unpin' : 'Pin', icon: pinnedNote(item) ? <PinOff /> : <Pin />, on: pinnedNote(item), run: () => pin(table(item), item.id, !pinnedNote(item)) },
      menu: rowMenu(item, index)
    }
  })
  const days: [string, TagRead[]][] = []
  for (const item of items.slice(0, count)) {
    const day = dayKey(item.at)
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
          <PlayButton label="Read through  R" onClick={() => read(items)} />
          <QuietAction label="Read in a random order" onClick={shuffled}><Shuffle /></QuietAction>
          <QuietAction label={isPinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'} pressed={isPinned} onClick={() => pinTag(tag, !isPinned)}>{isPinned ? <PinOff /> : <Pin />}</QuietAction>
          <MenuButton items={[
            { label: 'Rename or merge…', run: () => void rename() },
            { label: 'Colour, alias and exam date…', run: onManage },
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
      {view === 'list' ? <TrackList columns={[{ label: 'Date', size: '6.5rem', wide: true }, { label: 'Words', size: '5.5rem' }]} tracks={tracks} /> : (
        <div className="page-narrow mx-auto w-full px-5 [--mf-padding:0]">
          {days.map(([day, list]) => (
            <section key={day}>
              {/* The day stays in view while its notes scroll under it. */}
              <h2 className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 pt-4 pb-1.5 text-meta font-semibold text-muted-foreground backdrop-blur-sm">{named(day)}</h2>
              {list.map((item) => <Entry key={`${item.type}-${item.id}`} item={item} onOpen={onOpen} />)}
            </section>
          ))}
          <div ref={end} className="h-px" />
        </div>
      )}
      {(view === 'list' || count >= items.length) && (
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
                  <span className="relative aspect-square w-full overflow-hidden rounded-md shadow-[0_6px_18px_-8px_rgb(0_0_0/0.4)] [container-type:inline-size]" style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${shade} 78%, white), color-mix(in oklab, ${shade} 72%, black))` }}>
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

function Entry({ item, onOpen }: { item: TagRead; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((one) => one.id === item.kind)
  const Icon = item.type === 'capture' ? kind?.icon ?? Inbox : ICON[item.type as keyof typeof ICON] ?? Gem
  // ⌘-click: in a window of its own, as in every list.
  const open = (event: React.MouseEvent | React.KeyboardEvent): void => (event.metaKey ? openWindow(item.type, item.id) : onOpen(item.type, item.id))
  return (
    <article data-private={item.private ? '' : undefined} className="group/entry flex flex-col gap-1.5 border-b border-border/50 py-3 last:border-b-0 @[44rem]/page:flex-row @[44rem]/page:gap-4">
      <div
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
        <Tags tags={item.tags} />
        <span className="flex items-center gap-1 opacity-70 transition-opacity group-hover/entry:opacity-100">
          <Icon className="size-3.5" style={kind && item.type === 'capture' ? { color: kind.tint } : undefined} />
          {item.type === 'capture' ? kind?.label ?? NAME.capture : NAME[item.type] ?? item.type}
          {item.status !== 'open' && item.type === 'capture' && <span>· {item.status}</span>}
        </span>
      </aside>
    </article>
  )
}
