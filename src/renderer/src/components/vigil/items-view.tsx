import { chime } from '@/lib/sound'
import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Archive, ArrowLeft, Calendar, Pause, Plus, SquareDashed } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import EyeIcon from '@/components/ui/eye-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import LayersIcon from '@/components/ui/layers-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import PlayerIcon from '@/components/ui/player-icon'
import MessageCircleIcon from '@/components/ui/message-circle-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'
import XIcon from '@/components/ui/x-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import DownloadIcon from '@/components/ui/download-icon'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, TAGS } from '../mindflow'
import { textOf } from '../rot-cards'
import { firstLineOf } from '@/extensions/tokens'
import { selectionActions } from './selection-actions'
import { ReadThrough } from './read-through'
import { CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { age } from '../capture-list'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'
import { interval, splitTags, unloaded, useLive, vigil, when, whenInLine, type Item, type ItemFull } from '@/lib/vigil'
import { exampleIdeas, exampleWriting } from '@/lib/examples'
import { Example } from './example'
import { makeTask } from '@/lib/tasks'
import { useSameWords } from '@/lib/same-words'
import { Empty, Island, Page, Prop, Props, refuse, toast, useListKeys, useReadKey, typing, pin, Stepper, startAt, Rolling, Typed, showTopTitle, Pressed } from './ui'
import { Term } from './term'
import { AGES, Display, FilterChips, arrange, period, useView, type Density, type Facet, type View } from './display'
import { copy, type MenuItem, type RowItem } from './row-menu'
import { stickOnDesktop } from './sticky-note'
import { Lineage } from './lineage'
import { ReviewHistory } from './review-view'
import { Mentions } from './mentions'
import * as chrono from 'chrono-node'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Does, GHOST } from './ghost'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import { Aliases, KindFields, LocalGraph, NoteHeader } from './note-extras'
import { ListSearch, NoteList, NoteRail, PaneButtons, Peek, matches, type Entry } from './note-list'
import { archive, changeKind, openWindow, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { copyToBookItem } from '@/lib/books'
import { useOpened } from '@/lib/nav'
import { QuestionDetail } from './questions-view'
import { GlossTimeline, useRowGloss } from './gloss-line'
import { dayjs, moment, num } from '../../../../main/dates'
import { Signed } from './signature'
import { groups as noteGroupsApi, tintOf, useGroups, type NoteGroup } from '@/lib/groups'
import { dropMany, flatten, gather, groupId, groupOf, isGroup, KEY, layoutOf, moveTo, step as stepLayout, tidy, type Layout } from '@/lib/group-layout'
import type { Cue } from '@/lib/sound'
import { GroupIcon, type Bundle, type Folds } from './kept-groups'
import { asideItem, useHere } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const BookOpen = alive(BookIcon)
const Brain = alive(BrainCircuitIcon)
const Eye = alive(EyeIcon)
const EyeOff = alive(EyeOffIcon)
const FileText = alive(FileDescriptionIcon)
const History = alive(HistoryCircleIcon)
const Layers = alive(LayersIcon)
const Pin = alive(BookmarkIcon)
const Play = alive(PlayerIcon)
const Quote = alive(MessageCircleIcon)
const RefreshCw = alive(RefreshIcon)
const TriangleAlert = alive(TriangleAlertIcon)
const X = alive(XIcon)
const ArchiveRestore = alive(ArrowBackUpIcon)
const Download = alive(DownloadIcon)

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

/**
 * A nugget or an article as any list draws it. A nugget reads as its own
 * words, with how it comes back under them; an article as a titled document.
 */
export const itemEntry = (item: Item, menu?: RowItem[]): Entry => {
  const kind = kindOf(item.kind)
  const { text, tags } = splitTags(item.title)
  const recall = !!item.prompt
  const article = item.tier === 'article'
  const comes = recall ? (item.dueAt ? `Recall · ${new Date(item.dueAt) <= new Date() ? 'due' : `in ${interval(item.dueAt)}`}` : 'Recall · new') : item.mode === 'pushed' ? 'On rotation' : 'Now and then'
  return {
    id: item.id,
    type: item.tier,
    title: text,
    tags,
    icon: article ? FileText : kind.icon,
    tint: article ? undefined : kind.tint,
    age: age(item.createdAt),
    sub: article ? item.attribution ?? undefined : (
      <span className="flex min-w-0 items-center gap-1.5">
        {recall ? <Brain className="size-3 shrink-0" /> : item.mode === 'pushed' ? <RefreshCw className="size-3 shrink-0" /> : <Eye className="size-3 shrink-0" />}
        <span className="truncate">{[comes, item.attribution].filter(Boolean).join(' · ')}</span>
      </span>
    ),
    marks: (
      <>
        {item.supersededBy && <span className="shrink-0 text-xs text-[var(--tt-color-text-orange)]">Superseded</span>}
        {item.lapses >= 4 && <Tip label="Forgotten often"><TriangleAlert className="size-3 shrink-0 text-[var(--tt-color-text-orange)]" /></Tip>}
        {item.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
        {item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
      </>
    ),
    dim: !!item.suspended,
    private: !!item.private,
    wrap: item.tier === 'nugget',
    menu
  }
}

/**
 * Nuggets and articles: the kept tiers. A nugget reads as its own words, two
 * lines of them, with a line saying how it comes back; an article as a titled
 * document. Same row underneath, so one view, drawn two ways.
 */
export function ItemsView({ tier, focus, onOpen }: { tier: 'nugget' | 'article'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items(tier), [] as Item[], [tier], ['item'])
  const { groups: arranged, display, chips, density, view, setView, move, moveBy, ownOrder } = useItemDisplay(tier, all)
  // The list's width: beside the note, over the whole page, or a rail of pictures.
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ItemFull | null>(null)
  const spread = pane === 'wide' && !open
  const groups = spread && query.trim() ? arranged.map(([name, list]) => [name, list.filter((one) => matches(one.title, query))] as [string, Item[]]).filter(([, list]) => list.length) : arranged
  // x, ⌘-click and ⇧-click pick rows: several nuggets make one article, and any rows make a group.
  const [chosen, setChosen] = useState<string[]>([])
  // Groups show as groups in every sort, as rows (not tiles, and not when Display groups the list by kind or date).
  const folding = useFolding(tier, all, ownOrder, view.group === 'none' && (density === 'list' || density === 'compact') && !(spread && query.trim()) ? groups.flatMap(([, list]) => list) : null,
    view.sort === 'manual', () => setChosen([]), chosen)
  // As tiles, each group is one folder card; opened, the grid shows only its notes, under a chip back.
  const noteGroups = useGroups(tier)
  const tiled = (density === 'grid' || density === 'small') && view.group === 'none' && !(spread && query.trim())
  const [inGroup, setInGroup] = useState<string | null>(null)
  const folder = tiled && inGroup ? noteGroups.find((one) => one.id === inGroup) : undefined
  const flat = groups.flatMap(([, list]) => list)
  const tiles = tiled && !folder ? folding.tiles(flat) : null
  const folders = new Map(tiles?.flatMap((one) => ('group' in one ? [[KEY + one.group.id, one] as const] : [])))
  const items = folding.rows
    ?? (folder ? flat.filter((one) => folder.members.includes(one.id))
      : tiles ? tiles.map((one) => ('group' in one ? ({ ...one.items[0], id: KEY + one.group.id, title: one.group.name } as Item) : one.item))
      : flat)
  const onMove = (id: string, target: string, after: boolean): void => move(all.map((one) => one.id), id, target, after)
  // Spread out, a click looks at a note beside the list; Enter opens it.
  const [peek, setPeek] = useState<string | null>(null)
  const pick = (id: string): void => {
    // A folder card opens its group in place.
    if (isGroup(id)) return (chime('untuck'), setInGroup(groupId(id)), setCursor(0))
    // Opening a note brings the list back beside it.
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    void vigil.item(id).then(setOpen)
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? items[Math.max(0, cursor)]?.id ?? null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) void vigil.item(peek).then(setOpen)
    setView({ ...view, pane: next })
  }
  // Opened in a window of its own: closed here, so only one editor saves it.
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? (hush(), null) : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(items.length, {
    onOpen: (index) => pick(items[index].id),
    // Spread out, Escape empties the search, and that is all: it never puts
    // the note away or changes the layout. ⌘[ is the way back.
    onEscape: () => (folder ? (chime('tuck'), setInGroup(null)) : spread && query && setQuery(''))
  })
  useEffect(() => void (spread && items[cursor] && setPeek(items[cursor].id)), [cursor, spread]) // eslint-disable-line react-hooks/exhaustive-deps
  // ; on the row under the cursor, with nothing open: a thought written under it.
  const glossAfter = useRowGloss(items[cursor]?.id, !open)
  const peeked = spread ? all.find((one) => one.id === peek) : undefined
  // ⌥↑ and ⌥↓ (or ⌥K and ⌥J) move the row under the cursor in your own order.
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (!event.altKey || event.metaKey || event.ctrlKey || typing()) return
      const by = event.key === 'ArrowUp' || event.code === 'KeyK' ? -1 : event.key === 'ArrowDown' || event.code === 'KeyJ' ? 1 : 0
      const row = items[cursor]
      if (!by || !row) return
      event.preventDefault()
      // Sorted some other way, moving a row would change the sort under you: ask instead.
      if (view.sort !== 'manual')
        return toast('Moving rows needs Custom order. Switch?', undefined, 'info', { label: 'Switch', key: 'S', run: () => (chime('shift'), setView({ ...view, sort: 'manual' })) })
      // Among groups, a step can go into one or out of it: the row is followed wherever it lands.
      if (folding.rows) {
        const to = folding.step(row.id, by)
        if (to !== null && to >= 0) setCursor(to)
        return
      }
      if (moveBy(items.map((one) => one.id), row.id, by)) setCursor(cursor + by)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Reading through what is shown, one at a time with nothing else on screen.
  const [readFrom, setReadFrom] = useState<number | null>(null)
  useReadKey(() => setReadFrom(startAt(items, open?.id, cursor)), items.length)
  // The Luhmann move: two unrelated nuggets side by side, for the connection
  // nobody would have gone looking for.
  const [pair, setPair] = useState<Awaited<ReturnType<typeof vigil.random>>>([])
  // Where ⇧-click picks from: the last row picked.
  const from = useRef<string | null>(null)
  const toggle = (id: string): void => {
    // A folder is not a note to pick.
    if (isGroup(id)) return
    from.current = id
    setChosen((ids) => (chime(ids.includes(id) ? 'off' : 'on'), ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))
  }
  const range = (id: string): void => {
    const a = items.findIndex((one) => one.id === from.current)
    const b = items.findIndex((one) => one.id === id)
    if (a < 0 || b < 0) return toggle(id)
    chime('on')
    const run = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((one) => one.id)
    setChosen((ids) => [...new Set([...ids, ...run])])
  }
  const at = useRef(cursor)
  at.current = cursor
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing()) return
      // ⌃⌘N: a new group of the rows picked, or of the one under the cursor.
      if (event.ctrlKey && event.metaKey && event.code === 'KeyN') {
        event.preventDefault()
        event.stopPropagation()
        return folding.gatherNew(chosen.length ? chosen : items[at.current] ? [items[at.current].id] : [])
      }
      // Escape lets the selection go, and only that: taken first, so the
      // list does not also close what is open.
      // An open menu takes its own Escape: closing it keeps what is picked.
      if (event.key === 'Escape' && chosen.length && !document.querySelector('[role="menu"]')) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      if (event.key !== 'x' || event.metaKey || event.ctrlKey || event.altKey) return
      const item = items[at.current]
      if (item) toggle(item.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // Opening one, or putting it away, is a step Back returns from.
  const hush = useOpened(open?.id, focus, pick, () => setOpen(null))
  // Writing opened: a page turned, as a book is.
  useEffect(() => void (tier === 'article' && open?.id && pageTurn()), [tier, open?.id])
  // Re-read the open one when anything changes, so a gloss or a prompt shows.
  useEffect(() => window.api.captures.onChange(() => open && pick(open.id)), [open?.id])
  // The right-click menu: the same on a row and on a card.
  const menuFor = (item: Item): RowItem[] => chosen.includes(item.id) && chosen.length > 1 ? [
    // Right-clicked among several picked: the menu speaks for all of them.
    ...folding.menu(chosen),
    'separator',
    { label: 'Clear the selection', run: () => (chime('off'), setChosen([])) }
  ] : [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    'separator',
    { label: item.pinnedAt ? 'Unpin' : 'Pin to the box', run: () => pin('nuggets', item.id, !item.pinnedAt) },
    ...itemMenu(item),
    { label: chosen.includes(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(item.id) },
    'separator',
    ...folding.menu([item.id]),
    'separator',
    { label: 'Copy title', run: () => copy(item.title) }
  ]

  const entries: [string, Entry[]][] = tiles || folder
    ? [['', items.map((one) => {
        const card = folders.get(one.id)
        if (!card) return itemEntry(one, menuFor(one))
        // A folder: the group's own colour and icon, and its first notes small inside it.
        return { ...itemEntry(card.items[0]), id: one.id, title: card.group.name, tags: [], menu: undefined, sub: `${num(card.items.length)} notes`, marks: undefined, private: false, wrap: false,
          folder: { icon: card.group.icon, color: card.group.color, count: card.items.length, members: card.items.slice(0, 4).map((item) => itemEntry(item)) } }
      })]]
    : groups.map(([name, list]) => [name, list.map((one) => itemEntry(one, menuFor(one)))] as [string, Entry[]])
  return (
    <>
      {open && pane === 'rail' ? (
        <NoteRail entries={entries.flatMap(([, list]) => list)} cursor={cursor} selected={open.id} onPick={pick} onShow={() => setPane('list')} />
      ) : (
      <Page aside={!!open}
        title={tier === 'nugget' ? 'Ideas' : 'Writing'}
        // Every note on show, a folded group's too.
        count={groups.reduce((sum, [, list]) => sum + list.length, 0)}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Rolling text={chosen.length} /> selected
              <Tip label="Group them  ⌃⌘N">
                <Button variant="ghost" size="sm" onClick={() => folding.gatherNew(chosen)}>New group</Button>
              </Tip>
              {tier === 'nugget' && <Button variant="secondary" size="sm"
 
 onClick={() => void vigil.article(chosen).then((id) => {
 // The same words and the same landing as the prompt's: the article opens.
 chime('promote')
 toast(chosen.length > 1 ? `An article, from ${num(chosen.length)} ideas` : 'An article, from this idea')
 setChosen([])
 pick(id)
 })}
>
                Start an article
              </Button>}
              <Tip label="Clear">
              <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])}>
                <X className="size-3.5" />
              </Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs">
              {spread && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder={`Search in ${tier === 'nugget' ? 'Ideas' : 'Writing'}`} />}
              {tier === 'nugget' && items.length > 1 && !spread && !open && (
                <>
                  <span className="hidden whitespace-nowrap @[48rem]/page:inline"><Pressed keys="X" /> to select</span>
                  <Button variant="ghost" size="sm" onClick={() => void vigil.random().then(setPair)}>
                    Two at random
                  </Button>
                </>
              )}
              {tier === 'article' && (
                <Button variant="ghost" size="sm" onClick={() => void vigil.newArticle().then((id) => (chime('promote'), pick(id)))}>
                  <Plus className="size-3.5" /> New article
                </Button>
              )}
              <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R">
                <Button variant="ghost" size={open ? 'icon-sm' : 'sm'} aria-label="Read through" onClick={() => setReadFrom(startAt(items, open?.id, cursor))} disabled={!items.length}><AliveIcon icon={BookIcon} size={14} />{!open && ' Read through'}</Button>
              </Tip>
              {display}
              <PaneButtons pane={spread ? 'wide' : 'list'} onPane={setPane} fold={!!open} />
            </span>
          )
        }
      >
        <AnimatePresence>
          {pair.length === 2 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b"
            >
              <div className="grid grid-cols-2 gap-6 px-5 py-4">
                {pair.map((one) => (
                  <button key={one.id} type="button" onClick={() => pick(one.id)} className="line-clamp-5 self-start text-left whitespace-pre-line hover:text-foreground">
                    {textOf(one.body)}
                  </button>
                ))}
              </div>
              <p className="px-5 pb-3 text-xs text-muted-foreground">
                What connects these? <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPair([])}>Close</button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="px-5 pt-2.5 pb-2 empty:hidden">
          {folder && (
            <button type="button" data-folder-back="" onClick={() => (chime('tuck'), setInGroup(null))}
              className="mb-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" />
              <span className="font-medium text-foreground">{folder.name}</span>
            </button>
          )}
          {chips}
          {/* Grouped by kind or date, the list is already sorted into sections: the groups wait in the plain list. */}
          {view.group !== 'none' && noteGroups.length > 0 && <p data-groups-note="" className="mt-1.5 text-xs text-muted-foreground/70">Your groups show in the list view</p>}
        </div>
        {items.length ? (
          <NoteList groups={entries} density={density} table="nuggets" selected={spread ? peek ?? undefined : open?.id} cursor={cursor} onCursor={setCursor} chosen={chosen}
            onPick={spread ? (id) => (isGroup(id) ? pick(id) : (setPeek(id), setCursor(items.findIndex((one) => one.id === id)))) : pick} onOpen={spread ? pick : undefined}
            onChoose={toggle} onRange={range} pickWithCommand onMove={view.sort === 'manual' ? onMove : undefined} after={glossAfter} className={spread ? 'mx-5 my-3' : 'mx-3 my-2'}
            folds={folding.rows ? { ...folding.folds(menuFor), onNewNote: pick } : undefined} />
        ) : all.length && query.trim() ? (
          <Empty shape={['ellipse', 3]} title="Nothing matches">No title here has those words. Escape clears the search.</Empty>
        ) : unloaded(all) ? null : !all.length ? (
          // Nothing kept yet: the page as it will look, with a few made-up ones.
          <Example tryIt={tier === 'nugget' ? 'open a note in your Inbox and press P. It lands here in your own words, ready to come back to you.' : 'press New article above, or pick a few ideas with X and choose Start an article.'}>
            <NoteList groups={[['', (tier === 'nugget' ? exampleIdeas() : exampleWriting()).map((one) => itemEntry(one))]]} density={density} table="nuggets" cursor={-1} onPick={() => undefined} className="mx-3 my-2" />
          </Example>
        ) : tier === 'nugget' ? (
          <Empty shape={['star', 3]} title="No ideas yet">
            An idea is a note worth keeping, in your own words. Pick one in your Inbox and press P, and it lands here, ready to come back to you.
          </Empty>
        ) : (
          <Empty shape={['rectangle', 2]} title="No writing yet">
            Your own words on one idea: notes on a subject, an essay, a guide. Start one from nothing with New article, or from your ideas with “Start an article”.
          </Empty>
        )}
      </Page>
      )}
      {peeked && <Peek entry={itemEntry(peeked)} table="nuggets" onOpen={() => pick(peeked.id)} />}
      {readFrom !== null && (
        <ReadThrough
          items={items.filter((one) => !isGroup(one.id)).map((one) => ({ type: tier, id: one.id }))}
          start={readFrom}
          onClose={() => setReadFrom(null)}
          onEdit={(_, id) => {
            setReadFrom(null)
            pick(id)
          }}
        />
      )}
      {open && <ItemDetail top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} key={open.id} item={open} onOpen={(type, id) => (type === tier ? pick(id) : onOpen?.(type, id))} />}
    </>
  )
}

/** The open nugget, article or question, wherever it is opened: a question is drawn its own way. */
/** What a nugget or an article offers besides opening and pinning: its row menu and its note's dots share it. */
const itemMenu = (item: Item): MenuItem[] => [
  { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('nugget', item.id) },
  { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openWindow(item.tier, item.id) },
  asideItem(item.tier, item.id),
  'separator',
  item.tier === 'nugget' && { label: 'Change kind…', run: () => void changeKind('nuggets', item.id, item.kind) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  { label: 'Save its pictures and files…', run: () => void saveAttachments([{ table: 'nuggets', id: item.id }]) },
  copyToBookItem([{ table: 'nuggets', id: item.id }])
]

export function ItemDetail(props: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  return props.item.tier === 'question' ? <QuestionDetail {...props} /> : <NuggetDetail {...props} />
}

/** The open nugget or article: its words, its glosses, and down the right how it comes back. */
function NuggetDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  const [prompt, setPrompt] = useState(item.prompt ?? '')
  const glossWords = item.glosses.filter((one) => one.author === 'user').reduce((sum, one) => sum + one.body.split(/\s+/).filter(Boolean).length, 0)
  const editor = useRef<Editor | null>(null)
  // The words as opened or last saved, to tell a real edit from the editor settling.
  const seen = useRef<{ body: string; line: string } | null>(null)
  // An earlier version, shown in place of the editor while you look back; and
  // the words read again after one is restored, with a new key so the editor
  // opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('nuggets', item.id, restored ? restored.body : item.body, (id, body, base) => vigil.saveItem(id, { body, base }))
  useOpenNote({ table: 'nuggets', type: item.tier, id: item.id, kind: item.kind, archived: !!item.archivedAt })
  // A cloze: the words you selected, blanked. Two keystrokes and no writing,
  // the cheapest way to make something testable, and right for a name or a
  // number; anything with a "because" in it is better as a question.
  const cloze = (): void => {
    const view = editor.current
    const { from, to } = view?.state.selection ?? { from: 0, to: 0 }
    const words = view?.state.doc.textBetween(from, to).trim()
    if (!view || !words) return refuse('Select the words to blank out first')
    const text = view.getText().replace(words, '_____')
    setPrompt(text)
    void vigil.saveItem(item.id, { prompt: text }).then(() => toast('Cloze made: it joins the review queue'))
  }
  const savePrompt = (): void => {
    if ((item.prompt ?? '') === prompt.trim()) return
    void vigil.saveItem(item.id, { prompt: prompt.trim() || null }).then(() =>
      toast(prompt.trim() ? 'Now tested: it will come up in review' : 'Back to coming up on its own')
    )
  }

  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <NoteHeader className="-mt-3 mb-1" left={top} type={item.tier} table="nuggets" id={item.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
          onRestored={() => void vigil.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))}
          edited={item.updatedAt} captured={item.createdAt} made={item.tier === 'article' ? 'Started' : 'Saved'}
          pinned={!!item.pinnedAt} onPin={() => pin('nuggets', item.id, !item.pinnedAt)}
          menu={[...itemMenu(item), 'separator', { label: 'Copy title', run: () => copy(item.title) }]} />
        {item.tier === 'article' && (
          // Wraps as a heading does, so a long title is never cut off at the edge; Enter ends it.
          <textarea
            rows={1}
            className="page-narrow mx-auto mb-2 block w-full shrink-0 resize-none overflow-hidden bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none [field-sizing:content] placeholder:text-foreground/70"
            defaultValue={item.title}
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
            // A new article starts in its title, the stand-in name selected
            // so typing replaces it, and the button that made it does not
            // keep the keys.
            autoFocus={!item.title || item.title === 'Untitled'}
            onFocus={(event) => void (event.target.value === 'Untitled' && event.target.select())}
            placeholder="Untitled"
            onBlur={(event) => void vigil.saveItem(item.id, { title: event.target.value.replace(/\s*\n\s*/g, ' ') })}
          />
        )}
        {past ? (
          <MindflowEditor
            key={`past-${past.key}`}
            defaultContent={(past.body as JSONContent | string | null) ?? ''}
            readOnly
            toolbar={false}
            handles={false}
            slash={false}
            outline={false}
            search={false}
            autofocus={false}
          />
        ) : (
        <MindflowEditor
          key={restored?.rev ?? 0}
          host={window.api}
          tokens={TAGS}
          // A tag opens its page: everything carrying it.
          onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
          toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: item.captureId ?? undefined, attribution: item.attribution, from: item.id }) }}
          documentId={`item-${item.id}`}
          onTitleOut={showTopTitle}
          defaultContent={((restored ? restored.body : item.body) as JSONContent | string | null) ?? ''}
          findNotes={findCaptures}
          findHeadings={findHeadings}
          onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
          after={<>
            {/* A quote signed at its foot: who said it, in a pen's hand. */}
            {item.kind === 'quote' && item.attribution && <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem] text-control text-muted-foreground"><Signed who={item.attribution} className="private-text" /></div>}
            <Mentions id={item.id} onOpen={onOpen} />
          </>}
          onReady={(instance) => {
            seen.current = { body: JSON.stringify(instance.getJSON()), line: firstLineOf(instance.state.doc)?.text ?? '' }
            words.ready(instance)
          }}
          onChange={(body, instance) => {
            editor.current = instance
            // The editor can tidy a document as it opens (a list first, say);
            // that is not an edit, and saving it once wiped a nugget's title.
            const now = { body: JSON.stringify(body), line: firstLineOf(instance.state.doc)?.text ?? '' }
            if (now.body === seen.current?.body) return
            // Named for its first line with words, and only when that line
            // changed: a blank one, or one the title never came from, keeps it.
            const title = item.tier === 'nugget' && now.line && now.line !== seen.current?.line ? now.line : undefined
            seen.current = now
            words.save(body, instance)
            if (title) void vigil.saveItem(item.id, { title })
          }}
        />
        )}

      </div>

      <Props fold>
        {item.tier === 'nugget' && (
          <>
            <Island compact title="Kind">
              <CaptureKindPicker flat value={item.kind as CaptureType} onChange={(kind) => void changeKind('nuggets', item.id, item.kind, kind)} />
            </Island>
            <KindFields table="nuggets" id={item.id} kind={item.kind} onOpen={onOpen} />
          </>
        )}
        <Aliases table="nuggets" id={item.id} />

        <Island compact title={<Term>Review</Term>}>
          <Prop icon={item.prompt ? Brain : item.mode === 'pushed' ? RefreshCw : Eye} active>
            <Rolling by="word" text={item.prompt ? 'Tested, on a schedule' : item.mode === 'pushed' ? 'On rotation, always' : 'Now and then, as a hint'} />
          </Prop>
          {!item.prompt && (
            // Pushed: a standing principle that should keep coming round, the
            // note-to-self's way, rather than turning up by chance.
            <Prop
              icon={item.mode === 'pushed' ? Eye : RefreshCw}
              onClick={() => void vigil.saveItem(item.id, { mode: item.mode === 'pushed' ? 'encounter' : 'pushed' }).then(() =>
                (chime(item.mode === 'pushed' ? 'off' : 'on'), toast(item.mode === 'pushed' ? 'Back to turning up by chance' : 'On rotation: it will keep coming back')))}
            >
              {item.mode === 'pushed' ? 'Only now and then' : 'Keep showing me this'}
            </Prop>
          )}
          <Does does="A question this idea answers. Filled in, it is tested in Review on a schedule; empty, it comes back on its own now and then" set={!!prompt}>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={savePrompt}
            rows={3}
            placeholder="e.g. Who wrote Frankenstein, and how old was she?"
            data-ghost-field={prompt ? undefined : ""}
            aria-label="A question this answers"
            className={`resize-none text-control ${GHOST}`}
          />
          </Does>
          <Tip label="Select a few words in the note first. They become a blank you fill in when it comes up in Review">
            <div><Prop icon={SquareDashed} onClick={cloze}>Blank the selected words</Prop></div>
          </Tip>
          {item.dueAt && <Prop icon={Calendar}>Next review {when(item.dueAt, false)}</Prop>}
          {!!item.reviewed && <div className="px-2 py-1.5 text-muted-foreground"><ReviewHistory id={item.id} /></div>}
          {item.lapses >= 4 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-orange)]">
              <Typed text={`Forgotten ${item.lapses} times. That is usually the question, not you: try rewriting it.`} step={28} />
            </p>
          )}
          <Prop
            icon={item.suspended ? Play : Pause}
            onClick={() => void vigil.saveItem(item.id, { suspended: !item.suspended }).then(() => (chime(item.suspended ? 'on' : 'off'), toast(item.suspended ? 'Back in rotation' : 'Suspended until you bring it back')))}
          >
            {item.suspended ? 'Bring back into rotation' : 'Suspend'}
          </Prop>
        </Island>

        <Island compact title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private' : 'Can surface any time'}
          </Prop>
          <Prop icon={Pin} active={!!item.pinnedAt} onClick={() => pin('nuggets', item.id, !item.pinnedAt)}>
            {item.pinnedAt ? 'Pinned' : 'Pin to the box'}
          </Prop>
          <RemindMe table="nuggets" id={item.id} at={item.remindAt} />
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)}>
            {item.archivedAt ? 'Archived: bring it back' : 'Archive'}
          </Prop>
        </Island>

        {item.tier === 'nugget' ? (
          <>
            <Island compact title="Context">
              <Does does="What makes the answer make sense. Shown after the answer in Review" set={!!item.context}>
              <Textarea
                defaultValue={item.context ?? ''}
                onBlur={(event) => void vigil.saveItem(item.id, { context: event.target.value.trim() || null })}
                rows={2}
                placeholder="e.g. Written in a wet summer by Lake Geneva, for a ghost story contest"
                data-ghost-field={item.context ? undefined : ""}
                aria-label="Context"
                className={`resize-none text-control ${GHOST}`}
              />
              </Does>
            </Island>
            <Island compact title="Why">
              <Does does="Why the answer is so, in a line. Shown under it in Review" set={!!item.why}>
              <Textarea
                defaultValue={item.why ?? ''}
                onBlur={(event) => void vigil.saveItem(item.id, { why: event.target.value.trim() || null })}
                rows={1}
                placeholder="e.g. Mary Shelley was eighteen when she began it"
                data-ghost-field={item.why ? undefined : ""}
                aria-label="Why"
                className={`resize-none text-control ${GHOST}`}
              />
              </Does>
            </Island>
            <Island compact title="Grow it">
              {/* Two hundred words of your own beside it is an article written
                  without noticing: said, never automated. */}
              {glossWords >= 200 && (
                <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-purple)]">
                  Your glosses here run to {num(glossWords)} words: that is an article already. Start one and they come with it.
                </p>
              )}
              <Prop icon={Plus} onClick={() => void vigil.article([item.id]).then((id) => { chime('promote'); toast('An article, from this idea'); onOpen?.('article', id) })}>
                Start an article
              </Prop>
              <StudyThis item={item} />
            </Island>
          </>
        ) : (
          <Island compact title="Made from">
            <Prop icon={Layers}>{item.origins.length ? `${num(item.origins.length)} idea${item.origins.length === 1 ? '' : 's'}` : 'Written from scratch'}</Prop>
          </Island>
        )}
        <Lineage id={item.id} onOpen={onOpen} />
        <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />
        <Island compact title="Wrong?">
          {item.supersededBy ? (
            <Prop icon={TriangleAlert}>Superseded: out of review, kept beside its correction</Prop>
          ) : (
            <Supersede item={item} />
          )}
        </Island>
        <Island compact title="Where it came from">
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <Quote className="size-4 shrink-0" />
            <input
              defaultValue={item.attribution ?? ''}
              placeholder="Who, or where from"
              onBlur={(event) => void vigil.saveItem(item.id, { attribution: event.target.value.trim() || null })}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
            />
          </label>
        </Island>
        <Island compact title="Details">
          <Prop icon={Calendar}>Saved {when(item.createdAt)}</Prop>
          {item.revisions > 0 && <Prop icon={History}>Rewritten {item.revisions === 1 ? 'once' : `${item.revisions} times`}</Prop>}
          <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'nuggets', id: item.id }])}>Save its pictures and files…</Prop>
        </Island>

        {/* Glosses: present-you beside the material, one row each and never an
            edit, so the history of your thinking about it stays readable. */}
        <GlossTimeline id={item.id} />
      </Props>
    </div>
  )
}

/**
 * A reminder is a pin with a date: pick a time and the item pins itself to the
 * prompt when it comes round. The only kind of nudge that runs on your clock.
 */
export function RemindMe({ table, id, at }: { table: 'captures' | 'nuggets'; id: string; at: string | null }): React.JSX.Element {
  // Linear's picker: say when in words, or take one of four, each showing the
  // date it lands on.
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState('')
  const nine = (days: number): Date => dayjs().add(days, 'day').hour(9).startOf('hour').toDate()
  const presets: [string, Date][] = [
    ['An hour from now', dayjs().add(1, 'hour').toDate()],
    ['Tomorrow', nine(1)],
    ['Next week', nine(7)],
    ['A month from now', nine(30)]
  ]
  const typed = words.trim() ? chrono.parseDate(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words, new Date(), { forwardDate: true }) : null
  const set = (date: Date | null): void => {
    setOpen(false)
    setWords('')
    void vigil.remind(table, id, date ? date.toISOString() : null).then(() =>
      (chime(date ? 'pin' : 'off'), toast(date ? `Pins itself in the box's Inbox ${whenInLine(date.toISOString(), false)}, with a "waiting" chip at the top of the box` : 'Reminder cleared')))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-foreground">
          <AliveIcon icon={AlarmClockPlusIcon} size={16} />
          <span className="text-control">{at ? `Reminds ${whenInLine(at, false)}` : 'Remind me…'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-1 text-sm">
        <input
          autoFocus
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && typed && set(typed)}
          placeholder="Try: 4 pm, 2 days, in 5 weeks…"
          className="w-full border-b bg-transparent px-2 py-2 outline-none placeholder:text-foreground/70"
        />
        {(typed ? [[words, typed] as [string, Date]] : presets).map(([label, date]) => (
          <button key={label} type="button" onClick={() => set(date)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{moment(date)}</span>
          </button>
        ))}
        {at && <button type="button" onClick={() => set(null)} className="w-full rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent">Clear the reminder</button>}
      </PopoverContent>
    </Popover>
  )
}

/** Study this: a task to read it by a date, linked, so it is waiting when the task opens. */
function StudyThis({ item }: { item: ItemFull }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  if (!asking) return <Prop icon={BookOpen} onClick={() => setAsking(true)}>Study this…</Prop>
  return (
    <Input
      autoFocus
      placeholder="When will you study it? e.g. thursday 9am"
      onBlur={() => setAsking(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setAsking(false)
        if (event.key !== 'Enter') return
        // One wording with the prompt's: the title, the toast, the sound.
        void makeTask({ item: item.id, text: `Study “${item.title}” ${event.currentTarget.value}` }, 'A task, with this linked').then(() => setAsking(false))
      }}
      className="h-8 w-auto text-control"
    />
  )
}

/**
 * This turned out to be wrong: write what is true, and the correction becomes a
 * nugget of its own while this one leaves review. A falsehood recalled with
 * confidence is worse than one forgotten, and meetings are not textbooks.
 */
function Supersede({ item }: { item: ItemFull }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (!open) return <Prop icon={TriangleAlert} onClick={() => setOpen(true)}>This turned out wrong…</Prop>
  return (
    <Textarea
      autoFocus
      rows={2}
      placeholder="What is actually true? Enter to save"
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key !== 'Enter' || event.shiftKey || !event.currentTarget.value.trim()) return
        event.preventDefault()
        void vigil.supersede(item.id, event.currentTarget.value.trim()).then(() => toast('Corrected: the new version is an idea, this one is out of review'))
      }}
      className="resize-none text-control"
    />
  )
}

/**
 * Filter, sort and group for nuggets or articles, with the Display menu that
 * sets them: the same in the main window and the prompt's Kept tab.
 */
export function useItemDisplay(name: string, every: Item[]): {
  groups: [string, Item[]][]
  display: React.JSX.Element
  /** The filters set, as chips over the list, and the kinds a click away. */
  chips: React.JSX.Element
  density: Density
  view: View
  setView: (view: View) => void
  /** Drop a row before or after another, in your own order. */
  move: (ids: string[], id: string, target: string, after: boolean) => void
  /** One step up or down in your own order, from the keyboard; false at an end. */
  moveBy: (shown: string[], id: string, by: number) => boolean
  /** Your own order, as a sort: what groups are laid out by. */
  ownOrder: (a: Item, b: Item) => number
} {
  const [view, setView] = useView(name, { sort: 'newest', group: 'none' })
  // Archived ones are out of sight until Display's Marked asks for them.
  const all = every.filter((one) => !!one.archivedAt === !!view.filter.flags?.includes('archived'))
  const own = useOwnOrder(name)
  // Moving a row is choosing your own order: the list switches to it.
  // Gives back the way to undo that, when it did switch.
  const mine = (): (() => void) | undefined => {
    if (view.sort === 'manual') return undefined
    const was = view
    setView({ ...view, sort: 'manual' })
    return () => setView(was)
  }
  const move = (ids: string[], id: string, target: string, after: boolean): void => {
    const unsort = mine()
    // From another sort, the order you see is the one the move starts from.
    own.move(ids, id, target, after, false, view.sort !== 'manual' ? groups.flatMap(([, list]) => list.map((one) => one.id)) : undefined, unsort)
  }
  const moveBy = (shown: string[], id: string, by: number): boolean => {
    const target = shown[shown.indexOf(id) + by]
    if (!target) return false
    const unsort = mine()
    own.move(every.map((one) => one.id), id, target, by > 0, true, view.sort !== 'manual' ? shown : undefined, unsort)
    return true
  }
  const facets: Facet<Item>[] = [
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => all.some((one) => one.kind === type.id)).map(({ id, label, icon, tint }) => ({ id, label, icon, tint })), test: (one, kind) => one.kind === kind },
    { key: 'when', label: 'Saved', options: AGES, test: (one, when) => period(one.createdAt) === when },
    { key: 'tested', label: 'Review', options: [{ id: 'tested', label: 'Tested' }, { id: 'not', label: 'Not tested' }, { id: 'leech', label: 'Forgotten often' }], test: (one, how) => (how === 'leech' ? one.lapses >= 4 : !!one.prompt === (how === 'tested')) },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }, { id: 'pushed', label: 'Note to self' }, { id: 'archived', label: 'Archived' }], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'private' ? !!one.private : flag === 'archived' ? !!one.archivedAt : one.mode === 'pushed') }
  ]
  const ownOrder = (a: Item, b: Item): number => own.compare(a.id, b.id) || b.createdAt.localeCompare(a.createdAt)
  const groups = arrange(all, view, facets, {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    changed: (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    untouched: (a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title),
    kind: (a, b) => a.kind.localeCompare(b.kind) || b.createdAt.localeCompare(a.createdAt),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    manual: ownOrder
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note',
    date: (one) => period(one.createdAt)
  })
  // Spread over the page, the list keeps a size of its own: a grid, unless you chose another.
  const wide = view.pane === 'wide'
  const density = (wide ? view.wideDensity ?? 'grid' : view.density) ?? 'list'
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Oldest untouched' }, { id: 'name', label: 'A to Z' }, { id: 'kind', label: 'Kind' }, { id: 'due', label: 'Next review' }, { id: 'manual', label: 'Custom order' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }]}
      density={density}
      onDensity={(next) => setView({ ...view, [wide ? 'wideDensity' : 'density']: next })}
    />
  )
  const chips = <FilterChips view={view} onChange={setView} facets={facets} />
  return { groups, display, chips, density, view, setView, move, moveBy, ownOrder }
}

/**
 * Groups in a kept list. In your own order, as rows, they are drawn: `rows`
 * is what is on show (a folded group's notes left out, which is what the
 * keyboard walks), and `folds` the lines to draw. In any other sort the list
 * is flat, but grouping still works from the menu and ⌃⌘N: it puts the list
 * back in your own order (`toOwn`) to show what it did.
 *
 * What was just done is drawn at once and held until the saved order comes
 * back the same, so nothing jumps back while the save is on its way. Every
 * change says so with a way back.
 */
function useFolding(tier: string, every: Item[], ownOrder: (a: Item, b: Item) => number, shown: Item[] | null, ordered: boolean, done: () => void, chosen: string[]): {
  rows: Item[] | null
  /** The list as tiles: each group as one folder, at the top, then the loose notes. */
  tiles: (list: Item[]) => ({ group: NoteGroup; items: Item[] } | { item: Item })[]
  step: (id: string, by: number) => number | null
  /** The group lines of a row's menu: for that row, or every row picked. */
  menu: (ids: string[]) => RowItem[]
  /** A new group of these, named at once. */
  gatherNew: (ids: string[]) => void
  folds: (menuFor: (item: Item) => RowItem[]) => Omit<Folds, 'onNewNote'>
} {
  const list = useGroups(tier)
  const [held, setHeld] = useState<Layout | null>(null)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [born, setBorn] = useState<string | null>(null)
  // A group is two notes or more that are not archived: one with fewer is drawn as its note, where it was.
  const live = new Set(every.filter((one) => !one.archivedAt).map((one) => one.id))
  const saved = layoutOf([...every].sort(ownOrder).map((one) => one.id), list, live)
  // Groups coming apart, drawn going (the Separate fade and slide) before the list closes over them.
  const [parting, setParting] = useState<string[]>([])
  // Every group seen, so one coming apart keeps its name and colour while it goes, and Undo can bring it back as it was.
  const known = useRef(new Map<string, NoteGroup>())
  for (const one of list) known.current.set(one.id, one)
  const savedOrder = flatten(saved).join('\n')
  useEffect(() => void (held && flatten(held).join('\n') === savedOrder && setHeld(null)), [savedOrder, held])
  // Never held for long: a save that came back otherwise is the truth.
  useEffect(() => {
    if (!held) return
    const late = setTimeout(() => setHeld(null), 1500)
    return () => clearTimeout(late)
  }, [held])
  useEffect(() => {
    if (!born) return
    const grown = setTimeout(() => setBorn(null), 900)
    return () => clearTimeout(grown)
  }, [born])
  const folded = list.map((one) => `${one.id}:${one.folded}`).join()
  useEffect(() => setOpened({}), [folded])
  const layout = held ?? saved
  const info = new Map([...known.current].filter(([id]) => list.some((one) => one.id === id) || parting.includes(id)))
  const isOpen = (id: string): boolean => opened[id] ?? !info.get(id)?.folded
  const shut = new Set(list.filter((one) => !isOpen(one.id)).map((one) => one.id))
  // In your own order, as you laid it out. In any other sort, the groups stay
  // together at the top in your own order, and the sort orders the notes in
  // each and the loose rows under them.
  const blocks = (from: Layout, list = shown ?? every): { group?: string; items: Item[] }[] => {
    const visible = new Map(list.map((one) => [one.id, one]))
    const rank = new Map(list.map((one, at) => [one.id, at]))
    const bySort = (a: Item, b: Item): number => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
    const laid = from.top.flatMap((key): { group?: string; items: Item[] }[] => {
      if (!isGroup(key)) return visible.has(key) ? [{ items: [visible.get(key)!] }] : []
      const items = (from.groups[groupId(key)] ?? []).flatMap((id) => (visible.has(id) ? [visible.get(id)!] : []))
      return items.length ? [{ group: groupId(key), items }] : []
    })
    if (ordered) return laid
    return [
      ...laid.filter((one) => one.group).map((one) => ({ ...one, items: [...one.items].sort(bySort) })),
      ...laid.filter((one) => !one.group).sort((a, b) => bySort(a.items[0], b.items[0]))
    ]
  }
  const rowsOf = (from: Layout): Item[] => blocks(from).flatMap((one) => (one.group && !isOpen(one.group) ? [] : one.items))
  const now = blocks(layout)
  const keys = now.flatMap((one) => (one.group ? [KEY + one.group, ...(isOpen(one.group) ? one.items.map((item) => item.id) : [])] : [one.items[0].id]))
  // A group left unnamed is named for what its notes share: a tag on all of
  // them, or their kind, or else the next free "Group 2", so no two read the same.
  const byId = new Map(every.map((one) => [one.id, one]))
  const naming = (ids: string[]): string => {
    const notes = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    const taken = new Set(list.map((one) => one.name.toLowerCase()))
    const tags = notes.map((one) => splitTags(one.title).tags)
    const tag = tags[0]?.find((one) => tags.every((them) => them.includes(one)))
    const kind = notes.length && notes.every((one) => one.kind === notes[0].kind) && notes[0].kind !== 'note' ? CAPTURE_TYPES.find((one) => one.id === notes[0].kind)?.label : undefined
    const said = tag ? tag[0].toUpperCase() + tag.slice(1) : kind ? `${kind}s` : null
    if (said && !taken.has(said.toLowerCase())) return said
    let n = list.length + 1
    while (taken.has(`group ${n}`)) n++
    return `Group ${n}`
  }
  const make = (ids: string[] = []) => (): { id: string; name: string } => ({ id: crypto.randomUUID(), name: naming(ids) })
  const commit = (raw: Layout, cue: Cue, said?: string): void => {
    const was = layout
    // A group left with one note comes apart, in the same step, and the same Undo.
    const { layout: next, dissolved } = tidy(raw)
    chime(dissolved.length ? 'separate' : cue)
    if (dissolved.length && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion !== 'off') {
      setHeld(raw)
      setParting(dissolved)
      setTimeout(() => (setHeld(next), setParting([])), 240)
    } else setHeld(next)
    if (next.make) (setRenaming(next.make.id), setBorn(next.make.id))
    done()
    const gone = Object.keys(was.groups).filter((id) => !next.groups[id])
    const revive = gone.flatMap((id) => (known.current.has(id) ? [(({ name, icon, color, folded }) => ({ id, name, icon, color, folded }))(known.current.get(id)!)] : []))
    const apart = dissolved.map((id) => known.current.get(id)?.name).filter(Boolean)
    void noteGroupsApi.arrange(tier, next).then(() => said && toast(apart.length ? `${said}: ${apart.join(', ')} came apart` : said, () => {
      // Drawn back at once, as the change itself was.
      setHeld({ top: was.top, groups: was.groups })
      void noteGroupsApi.arrange(tier, { top: was.top, groups: was.groups, revive })
    }))
  }
  const step = (id: string, by: number): number | null => {
    // Sorted some other way, there is no own place to step to.
    if (!ordered) return null
    const next = stepLayout(layout, keys, id, by, shut)
    if (!next) return null
    commit(next, 'shift')
    return rowsOf(next).findIndex((one) => one.id === id)
  }
  const inOrder = (ids: string[]): string[] => {
    const at = new Map(flatten(layout).map((one, index) => [one, index]))
    return [...ids].sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0))
  }
  const notes = (n: number): string => (n === 1 ? 'note' : `${n} notes`)
  const gatherNew = (ids: string[]): void => {
    const these = inOrder(ids)
    // A group is two notes or more.
    if (these.length < 2) return refuse('Pick two or more rows to make a group')
    commit(gather(layout, these[0], these, make(these)()), 'gather', these.length > 1 ? `Grouped ${these.length} notes` : 'Grouped')
  }
  const menu = (ids: string[]): RowItem[] => {
    const these = inOrder(ids)
    const n = these.length
    const theirs = new Set(these.map((one) => groupOf(layout, one)).filter(Boolean))
    const into = (group: string): Layout => these.reduce((next, one) => moveTo(next, one, { group, after: next.groups[group]?.[next.groups[group].length - 1] ?? null }), layout)
    const others = list.filter((one) => layout.groups[one.id] && !(theirs.size === 1 && theirs.has(one.id)))
    return [
      n > 1 && { label: `New group with ${n} notes`, keys: '⌃⌘N', run: () => gatherNew(these) },
      {
        label: 'Move to group',
        items: [
          ...others.map((one) => ({
            label: one.name,
            icon: <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />,
            trail: <span className="ml-auto size-2 rounded-full" style={{ background: tintOf(one.color) ?? 'color-mix(in srgb, var(--foreground) 25%, transparent)' }} />,
            run: () => commit(into(one.id), 'gather', `Moved ${notes(n)} to ${one.name}`)
          })),
          others.length && n > 1 ? 'separator' : null,
          n > 1 && { label: 'New group…', run: () => gatherNew(these) }
        ]
      },
      theirs.size > 0 && {
        label: 'Remove from group',
        run: () => commit(these.reduce((next, one) => {
          const own = groupOf(next, one)
          return own ? moveTo(next, one, { group: null, after: KEY + own }) : next
        }, layout), 'separate', `Removed ${notes(n)} from ${theirs.size === 1 ? info.get([...theirs][0]!)?.name ?? 'the group' : 'their groups'}`)
      },
      'separator',
      {
        label: n > 1 ? `Duplicate ${n} notes` : 'Duplicate',
        run: () => void noteGroupsApi.clone(tier, these).then((made) => (chime('copy'), done(), toast(n > 1 ? `Duplicated ${n} notes` : 'Duplicated', () => void noteGroupsApi.unclone(made))))
      },
      {
        label: n > 1 ? `Copy ${n} links` : 'Copy link',
        run: () => void noteGroupsApi.links(these).then((links) => (links.length ? copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${links.length} links`}`) : refuse(n > 1 ? 'No web links in these notes' : 'No web link in this note')))
      },
      n > 1 && copyToBookItem(these.map((id) => ({ table: 'nuggets' as const, id }))),
      n > 1 && 'separator',
      n > 1 && { label: `Archive ${n} notes`, run: () => (done(), void archive('nuggets', these, true)) }
    ]
  }
  const folds = (menuFor: (item: Item) => RowItem[]): Omit<Folds, 'onNewNote'> => ({
    bundles: now.map((one): Bundle => {
      const group = one.group ? info.get(one.group) : undefined
      return {
        group: one.group
          ? { id: one.group, name: group?.name ?? layout.make?.name ?? 'Group', icon: group?.icon ?? null, color: group?.color ?? null, open: isOpen(one.group), members: one.items.map((item) => item.id), parting: parting.includes(one.group) }
          : undefined,
        entries: one.items.map((item) => itemEntry(item, menuFor(item)))
      }
    }),
    onDrop: (ids, target, how) => {
      const next = dropMany(layout, ids, target, how, shut, make([target, ...ids]))
      if (!next) return chime('stay')
      const active = ids[0]
      const was = isGroup(active) ? undefined : groupOf(layout, active)
      const lands = isGroup(active) ? undefined : groupOf(next, active)
      const name = (id?: string): string => (id && (info.get(id)?.name ?? next.make?.name)) || 'the group'
      const n = ids.length > 1 ? ` ${ids.length}` : ''
      commit(next, next.make || (lands && lands !== was) ? 'gather' : was && !lands ? 'separate' : 'shift',
        next.make ? 'Grouped' : lands && lands !== was ? `Added${n} to ${name(lands)}` : was && !lands ? `Removed${n} from ${name(was)}` : `Moved${n}`)
    },
    picked: chosen,
    onLetGo: () => done(),
    ordered,
    onFold: (group, open) => {
      setOpened((was) => ({ ...was, [group.id]: open }))
      void noteGroupsApi.set(group.id, { folded: !open })
    },
    renaming,
    onRenaming: setRenaming,
    born
  })
  const tiles = (list: Item[]): ({ group: NoteGroup; items: Item[] } | { item: Item })[] =>
    blocks(layout, list).flatMap((one): ({ group: NoteGroup; items: Item[] } | { item: Item })[] => (one.group && info.get(one.group) ? [{ group: info.get(one.group)!, items: one.items }] : one.items.map((item) => ({ item }))))
  return { rows: shown ? rowsOf(layout) : null, tiles, step, menu, gatherNew, folds }
}
