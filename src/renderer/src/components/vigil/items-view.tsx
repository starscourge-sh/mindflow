import { openExpanded } from '../note-link/expanded-note'
import { quoted } from '../../../../main/clip'
import { voiceOf } from '@/lib/sources'
import { SourceFoot } from './source-page'
import { SimilarNotes } from './similar-notes'
import { chime, pageTurn } from '@/lib/sound'
import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Archive, ArrowLeft, Calendar, Plus, SquareDashed } from 'lucide-react'

import { Unfold } from './glide'

import { MindflowEditor, TAGS } from '../mindflow'
import { textOf } from '../rot-cards'
import { firstLineOf } from '@/extensions/tokens'
import { selectionActions } from './selection-actions'
import { ReadThrough } from './read-through'
import { enqueue } from '@/lib/reading-queue'
import { CAPTURE_TYPES, CaptureKindPicker, asksFor, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { age } from '../capture-list'
import { findCaptures, findHeadings, follow, noteLinkText, recallOffered } from '@/lib/capture-links'
import { glideWay } from '@/lib/motion'
import { splitTags, unloaded, useLastAsked, useLive, vigil, whenInLine, type Item, type ItemFull } from '@/lib/vigil'
import { exampleIdeas, exampleWriting } from '@/lib/examples'
import { Example } from './example'
import { makeTask, makeTasks } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { binItem, moveToBin } from '@/lib/to-bin'
import { useSameWords } from '@/lib/same-words'
import { Empty, Island, Page, Prop, Props, Remembered, refuse, quietly, toast, useListKeys, useReadKey, typing, pin, Stepper, startAt, Typed, showTopTitle, Pressed, askClearWho, Rolling } from './ui'
import { Term } from './term'
import { AGES, Chips, Display, FilterChips, arrange, period, useView, type Density, type Facet, type View } from './display'
import { copy, type MenuItem, type RowItem } from './row-menu'
import { stickOnDesktop } from './sticky-note'
import { Lineage } from './lineage'
import { ReviewHistory } from './review-view'
import { Mentions } from './mentions'
import { datesIn } from '../../../../main/task-words'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { backIn } from '@/lib/back-in'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Does, GHOST } from './ghost'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import { Aliases, KindFields, LocalGraph, NoteHeader } from './note-extras'
import { ListSearch, NoteList, NoteRail, PaneButtons, Peek, matches, type Entry } from './note-list'
import { archive, changeKind, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { openApart } from '@/lib/apart'
import { copyToBookItem } from '@/lib/books'
import { useOpened } from '@/lib/nav'
import { readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { QuestionDetail } from './questions-view'
import { GlossTimeline, useRowGloss } from './gloss-line'
import { ThoughtDock } from './thought-bar'
import { dayjs, num } from '../../../../main/dates'
import { moment } from '@/lib/clock'
import { Signed } from './signature'
import { groups as noteGroupsApi, tintOf, useGroups, type NoteGroup } from '@/lib/groups'
import { dropMany, flatten, gather, groupId, groupOf, isGroup, KEY, layoutOf, moveTo, step as stepLayout, tidy, type Layout } from '@/lib/group-layout'
import type { Cue } from '@/lib/sound'
import { GroupIcon, type Bundle, type Folds } from './kept-groups'
import { asideItem, useHere } from '@/lib/split'
import { queueItems } from '@/lib/reading-queue'
import { Apart } from '@/lib/apart'
import { loud } from '@/lib/loud'
import { ArchiveRestore, BookOpen, Brain, Download, Eye, EyeOff, FileText, History, Layers, Bookmark as Pin, Quote, Repeat as RefreshCw, TriangleAlert, X } from '@/components/ui/icons'

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

/**
 * A nugget or an article as any list draws it. A nugget reads as its own
 * words, with how it comes back under them; an article as a titled document.
 */
export const itemEntry = (item: Item, menu?: RowItem[]): Entry => {
  // A gem with no source is a note of yours: drawn as one, until it says who or where from.
  const unsourced = item.tier === 'nugget' && !item.attribution?.trim() && !item.medium?.trim()
  const kind = kindOf(unsourced && item.kind !== 'quote' ? 'note' : item.kind)
  const { text, tags } = splitTags(item.title)
  const recall = !!item.prompt
  const article = item.tier === 'article'
  const due = recall && !!item.dueAt && new Date(item.dueAt) <= new Date()
  // What is worth reading under a gem's words, not the same line on every row:
  // when it comes back, the question it asks (when that is not its own words
  // again), and who said it. A card not reviewed yet is a small hollow dot.
  const same = (a: string, b: string): boolean => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const asks = recall && item.prompt && !same(item.prompt, text) ? `Asks “${item.prompt.replace(/[?.\s]+$/, '')}?”` : null
  // One paused says so first: it is dimmed for that reason, and comes back only when you choose.
  const comes = item.suspended ? 'Paused: not coming back until you choose' : recall ? (item.dueAt ? (due ? null : `Back in Review ${backIn(item.dueAt)}`) : null) : item.mode === 'pushed' ? 'Comes back often' : 'Comes back now and then'
  // With nothing else to say, the hollow dot is named, so it never stands alone.
  const line = [comes, asks, item.attribution].filter(Boolean).join(' · ') || (recall && !item.dueAt ? 'New card' : '')
  return {
    id: item.id,
    type: item.tier,
    title: text,
    tags,
    icon: article ? FileText : kind.icon,
    tint: article ? undefined : kind.tint,
    age: age(item.createdAt),
    sub: article ? item.attribution ?? undefined : (
      <span data-gem-meta className="flex min-w-0 items-center gap-1.5">
        {recall && !item.dueAt ? (
          <Tip label="A new card: it joins Review soon">
            <span data-new-card role="img" aria-label="Not reviewed yet" className="size-2 shrink-0 rounded-full border-[1.5px] border-current opacity-70" />
          </Tip>
        ) : recall ? <Brain className="size-3 shrink-0" /> : item.mode === 'pushed' ? <RefreshCw className="size-3 shrink-0" /> : <Eye className="size-3 shrink-0" />}
        {/* A card due now says so in bold orange: the one word in the row that asks for something. */}
        {due ? <span {...loud('today', 'shrink-0 font-semibold')}>Due for review</span> : null}
        {line && <span className="truncate">{due ? `· ${line}` : line}</span>}
      </span>
    ),
    marks: (
      <>
        {item.supersededBy && <Tip label="Replaced by a corrected gem: out of Review, kept beside what is true"><span className="shrink-0 text-xs text-[var(--tt-color-text-orange)]">Replaced</span></Tip>}
        {item.lapses >= 4 && <Tip label="Forgotten often"><TriangleAlert className="size-3 shrink-0 text-[var(--tt-color-text-orange)]" /></Tip>}
        {item.pinnedAt && <Tip label="Pinned: at the top of the sidebar and in quick capture"><Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" /></Tip>}
        {item.private ? <Tip label="Private: never comes up unasked in quiet hours or safe mode"><EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /></Tip> : null}
      </>
    ),
    dim: !!item.suspended,
    voice: voiceOf({ type: item.tier, kind: item.kind, attribution: item.attribution, medium: item.medium, label: item.title }),
    private: !!item.private,
    wrap: item.tier === 'nugget',
    menu
  }
}

/**
 * What arrived since you last looked (a capture kept as a gem, say): its row
 * glows once as the list opens, a 600ms tint that fades, the landing to the
 * flight the capture took out of the Inbox. Never on a first visit, and not
 * with Motion off.
 */
function useArrivals(tier: string, all: Item[]): void {
  const looked = useRef(false)
  const glow = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const key = `arrivals:${tier}`
    const mark = (): void => {
      try {
        localStorage.setItem(key, new Date().toISOString())
      } catch {
        // Glows again next time, which does no harm.
      }
    }
    if (looked.current || unloaded(all)) return
    looked.current = true
    let seen: string | null = null
    try {
      seen = localStorage.getItem(key)
    } catch {
      seen = null
    }
    mark()
    const since = seen
    const fresh = since ? all.filter((one) => one.createdAt > since).map((one) => one.id) : []
    if (!fresh.length || document.documentElement.dataset.motion === 'off') return
    // Set apart from this effect: the list reloading a moment later must not cancel it.
    glow.current = setTimeout(() => {
      for (const id of fresh)
        document.querySelectorAll<HTMLElement>(`[data-row][data-id="${CSS.escape(id)}"]`).forEach((row) => {
          row.dataset.arrived = ''
          row.animate([{ backgroundColor: 'color-mix(in oklab, var(--tt-brand-color-400) 20%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 600, easing: 'ease-out' })
        })
    }, 220)
  }, [all, tier])
  // Leaving counts as looking too: what arrived while you were here does not glow again.
  // Written a moment after, and only if the page did not come straight back: the
  // development build's practice unmount would otherwise mark everything seen
  // before the list had even loaded, and nothing new would ever glow.
  const leaving = useRef<{ tier: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => {
    if (leaving.current?.tier === tier) clearTimeout(leaving.current.timer)
    return () => {
      clearTimeout(glow.current)
      leaving.current = { tier, timer: setTimeout(() => {
        try {
          localStorage.setItem(`arrivals:${tier}`, new Date().toISOString())
        } catch {
          // As above.
        }
      }, 0) }
    }
  }, [tier])
}

/**
 * Nuggets and articles: the kept tiers. A nugget reads as its own words, two
 * lines of them, with a line saying how it comes back; an article as a titled
 * document. Same row underneath, so one view, drawn two ways.
 */
export function ItemsView({ tier, focus, onOpen }: { tier: 'nugget' | 'article'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items(tier), [] as Item[], [tier], ['item'], 'items')
  useArrivals(tier, all)
  const { groups: arranged, display, chips, density, view, setView, move, moveBy, ownOrder } = useItemDisplay(tier, all)
  // The list's width: beside the note, over the whole page, or a rail of pictures.
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<ItemFull | null>(() => (focus ? readNow<ItemFull>(tier, focus) ?? null : null))
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
  // Only the last pick lands: a late answer for the gem before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void => {
    // A folder card opens its group in place.
    if (isGroup(id)) return (chime('untuck'), setInGroup(groupId(id)), setCursor(0))
    // Opening a note brings the list back beside it.
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    const ready = readNow<ItemFull>(tier, id)
    if (ready) return (asked(), setOpen(ready))
    asked(readFresh(tier, id, vigil.item), setOpen)
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? items[Math.max(0, cursor)]?.id ?? null)
      asked()
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) asked(vigil.item(peek), setOpen)
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
    opened: items.findIndex((one) => one.id === open?.id),
    onExtend: (from, to) => picking.extend(items[from]?.id, items[to].id),
    // Escape empties the search, and that is all: it never puts the note away,
    // changes the layout or leaves a group's folder. ⌘[ or the back button is the way back.
    onEscape: () => void ((spread || folder) && query && setQuery(''))
  })
  // ⌘[ inside a group's folder steps back out of it, before the page's own Back hears it.
  useEffect(() => {
    if (!folder) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key !== '[' || event.shiftKey || event.altKey || event.ctrlKey || typing()) return
      event.preventDefault()
      event.stopPropagation()
      chime('tuck')
      setInGroup(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [folder])
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
        return toast('Moving rows needs “Custom order”. Switch?', undefined, 'info', { label: 'Switch', key: 'S', run: () => (chime('shift'), setView({ ...view, sort: 'manual' })) })
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
  // "Sort these": a pass through imported notes not yet sorted, a group's or every one in the list.
  const [sorting, setSorting] = useState<string[] | null>(null)
  const unsorted = items.filter((one) => one.unsorted && !one.archivedAt && !isGroup(one.id)).map((one) => one.id)
  const markSorted = (ids: string[], sorted: boolean): void =>
    void vigil.sorted(ids, sorted).then(() => {
      chime(sorted ? 'done' : 'undo')
      if (sorted) toast(ids.length === 1 ? 'Sorted' : `${num(ids.length)} sorted`, () => void vigil.sorted(ids, false).then(() => chime('undo')))
    })
  useReadKey(() => setReadFrom(startAt(items, open?.id, cursor)), items.length)
  // The Luhmann move: two unrelated nuggets side by side, for the connection
  // nobody would have gone looking for.
  const [pair, setPair] = useState<Awaited<ReturnType<typeof vigil.random>>>([])
  // ⌘-click, ⇧-click, ⇧↑ and ⇧↓ pick as Finder does; a folder is not a note to pick.
  const picking = usePicking(items.map((one) => one.id), chosen, setChosen, { can: (id) => !isGroup(id) })
  const toggle = picking.toggle
  const at = useRef(cursor)
  at.current = cursor
  // ⌘A picks every note on show (never a folder card); Escape lets them go.
  const pickable = items.filter((one) => !isGroup(one.id))
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string }[] => ids.filter((id) => !isGroup(id)).map((id) => ({ type: all.find((one) => one.id === id)?.tier ?? tier, id }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => pickable.map((one) => one.id), chosen, setChosen, { here, onDelete: toBin, current: () => items[at.current]?.id, titleOf: (id) => all.find((one) => one.id === id)?.title })
  const allPicked = pickable.length > 0 && pickable.every((one) => chosen.includes(one.id))
  // A study task for each one picked, linked to it, as "Study this" makes one.
  const makeEach = (): void => {
    const notes = chosen.flatMap((id) => {
      const item = all.find((one) => one.id === id)
      return item ? [{ id, title: item.title, private: !!item.private }] : []
    })
    void makeTasks(notes).then((made) => made && setChosen([]))
  }
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
  const hush = useOpened(open?.id, focus, pick, () => (asked(), setOpen(null)), { shown: items.map((one) => one.id), kind: 'item' })
  // A gem or a piece of writing opened: a page turned, as a book is. Stepped to
  // with ↓ and ↑ (the Stepper over the page), a lighter page; a quick run turns only one.
  const stepped = useRef(false)
  useEffect(() => {
    if (open?.id) pageTurn(stepped.current)
    stepped.current = false
  }, [tier, open?.id])
  // Re-read the open one when anything changes, so a gloss or a prompt shows.
  useEffect(() => window.api.captures.onChange(() => open && pick(open.id)), [open?.id])
  // The right-click menu: the same on a row and on a card.
  const menuFor = (item: Item): RowItem[] => chosen.includes(item.id) && chosen.length > 1 ? [
    // Right-clicked among several picked: the menu speaks for all of them.
    { label: `Make ${num(chosen.length)} tasks`, run: makeEach },
    'separator',
    ...folding.menu(chosen),
    'separator',
    binItem(binRefs(chosen), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
  ] : [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    'separator',
    { label: item.pinnedAt ? 'Unpin' : 'Pin to the sidebar', run: () => pin('nuggets', item.id, !item.pinnedAt) },
    ...itemMenu(item),
    item.unsorted ? { label: 'Mark as sorted', hint: 'Kept where it is', run: () => markSorted([item.id], true) } : null,
    { label: chosen.includes(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(item.id) },
    pickable.length > 1 && !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    'separator',
    ...folding.menu([item.id]),
    'separator',
    { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(`${item.tier}:${item.id}`, item.title), 'Copied a link: paste it into any note') },
    { label: 'Copy title', run: () => copy(item.title) }
  ]

  const entries: [string, Entry[]][] = tiles || folder
    ? [['', items.map((one) => {
        const card = folders.get(one.id)
        if (!card) return itemEntry(one, menuFor(one))
        // A folder: the group's own colour and icon, and its first notes small inside it.
        return { ...itemEntry(card.items[0]), id: one.id, title: card.group.name, tags: [], menu: undefined, sub: `${num(card.items.length)} ${card.items.length === 1 ? 'note' : 'notes'}`, marks: undefined, private: false, wrap: false,
          folder: { icon: card.group.icon, color: card.group.color, count: card.items.length, members: card.items.slice(0, 4).map((item) => itemEntry(item)) } }
      })]]
    : groups.map(([name, list]) => [name, list.map((one) => itemEntry(one, menuFor(one)))] as [string, Entry[]])
  return (
    <>
      {open && pane === 'rail' ? (
        <NoteRail entries={entries.flatMap(([, list]) => list)} cursor={cursor} selected={open.id} onPick={pick} onShow={() => setPane('list')} />
      ) : (
      <Page aside={!!open}
        title={tier === 'nugget' ? 'Gems' : 'Writing'}
        // Every note on show, a folded group's too.
        count={chosen.length || groups.reduce((sum, [, list]) => sum + list.length, 0)}
        // What is picked always shows: the buttons may fold into ⋯ in a narrow window, the count never does.
        unit={chosen.length ? ['selected', 'selected'] : tier === 'nugget' ? ['gem', 'gems'] : ['article', 'articles']}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Tip label="A study task for each, linked to its note">
                <Button variant="ghost" size="sm" onClick={makeEach}>{chosen.length === 1 ? 'Make it a task' : `Make ${num(chosen.length)} tasks`}</Button>
              </Tip>
              <Tip label="At the end of your reading queue; ⌥-click to read them next">
                <Button variant="ghost" size="sm" onClick={(event) => void enqueue(chosen, event.altKey)}>Add to queue</Button>
              </Tip>
              <Tip label="Group them  ⌃⌘N">
                <Button variant="ghost" size="sm" onClick={() => folding.gatherNew(chosen)}>New group</Button>
              </Tip>
              {tier === 'nugget' && <Button variant="secondary" size="sm"
 
 onClick={() => void vigil.article(chosen).then((id) => {
 // The same words and the same landing as the prompt's: the article opens.
 chime('promote')
 toast(chosen.length > 1 ? `An article, from ${num(chosen.length)} gems` : 'An article, from this gem')
 setChosen([])
 pick(id)
 })}
>
                Start an article
              </Button>}
              <Tip label={`Into the Bin, where ${chosen.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
                <Button variant="ghost" size="sm" onClick={() => toBin(chosen)}>Move to the Bin</Button>
              </Tip>
              {!allPicked && (
                <Tip label="Every note on show  ⌘A">
                  <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
                </Tip>
              )}
              <Tip label="Clear the selection  Esc">
              <Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={() => (chime('off'), setChosen([]))}>
                <X className="size-3.5" />
              </Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs">
              {spread && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder={`Search in ${tier === 'nugget' ? 'Gems' : 'Writing'}`} />}
              {tier === 'nugget' && items.length > 1 && !spread && !open && (
                <>
                  <span className="hidden whitespace-nowrap @[48rem]/page:inline"><Pressed keys="X" /> to select</span>
                  <Button variant="ghost" size="sm" onClick={() => void vigil.random().then(setPair)}>
                    Two at random
                  </Button>
                </>
              )}
              {/* Imported notes left to sort, every group's: the pass through all of them. */}
              {tier === 'article' && unsorted.length > 0 && !open && (
                <Tip label="Go through every imported note not yet sorted: keep, tag, move or bin each">
                  <Button variant="outline" size="sm" data-sort-all={unsorted.length} onClick={() => (chime('read'), setSorting(unsorted))}>
                    <span aria-hidden className="size-1.5 rounded-full bg-[var(--tt-color-text-orange)]" /><span><Rolling text={unsorted.length} /> to sort</span>
                  </Button>
                </Tip>
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
        {/* The app's one fold (glide.tsx), so it follows Motion, Reduce motion and keys like every other. */}
        <Unfold open={pair.length === 2}>
            <div className="border-b">
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
            </div>
        </Unfold>
        <div className="px-5 pt-2.5 pb-2 empty:hidden">
          {folder && (
            <Tip label="Back out of the group  ⌘[">
            <button type="button" data-folder-back="" onClick={() => (chime('tuck'), setInGroup(null))}
              className="mb-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" />
              <span className="font-medium text-foreground">{folder.name}</span>
            </button>
            </Tip>
          )}
          {chips}
          {/* Grouped by kind or date, the list is already sorted into sections: the groups wait in the plain list. */}
          {view.group !== 'none' && noteGroups.length > 0 && <p data-groups-note="" className="mt-1.5 text-body text-muted-foreground">Your groups show in the list view</p>}
        </div>
        {items.length ? (
          <NoteList groups={entries} density={density} table="nuggets" selected={spread ? peek ?? undefined : open?.id} cursor={cursor} onCursor={setCursor} chosen={chosen}
            onPick={spread ? (id) => (isGroup(id) ? pick(id) : (setPeek(id), setCursor(items.findIndex((one) => one.id === id)))) : pick} onOpen={spread ? pick : undefined}
            picking={picking} onMove={view.sort === 'manual' ? onMove : undefined} after={glossAfter} className={spread ? 'mx-5 my-3' : 'mx-3 my-2'}
            folds={folding.rows ? { ...folding.folds(menuFor), onNewNote: pick, onSort: setSorting, onSorted: markSorted } : undefined} />
        ) : all.length && query.trim() ? (
          <Empty title="Nothing matches">No title here has those words. Escape clears the search.</Empty>
        ) : unloaded(all) ? null : !all.length ? (
          // Nothing kept yet: the page as it will look, with a few made-up ones.
          <Example tryIt={tier === 'nugget' ? 'pick a note in your Inbox list and press P. It lands here, ready to come back to you.' : 'press “New article” above, or pick a few gems with X and choose “Start an article”.'}>
            <NoteList groups={[['', (tier === 'nugget' ? exampleIdeas() : exampleWriting()).map((one) => itemEntry(one))]]} density={density} table="nuggets" cursor={-1} onPick={() => undefined} className="mx-3 my-2" />
          </Example>
        ) : tier === 'nugget' ? (
          <Empty title="No gems yet">
            <strong>Your words stick where a copied line slides off.</strong> A gem is a note worth keeping, in your own words. Pick one in your Inbox and press P, and it lands here, ready to come back to you.
          </Empty>
        ) : (
          <Empty title="No writing yet">
            Your own words on one idea: notes on a subject, an essay, a guide. Start one from nothing with “New article”, or from your gems with “Start an article”.
          </Empty>
        )}
      </Page>
      )}
      {peeked && <Peek entry={itemEntry(peeked)} table="nuggets" onOpen={() => pick(peeked.id)} />}
      {sorting && (
        <ReadThrough items={sorting.map((id) => ({ type: tier, id }))} sorting onClose={() => setSorting(null)} />
      )}
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
      {open && <Apart type={open.tier} id={open.id} title={open.title} hidden={!!open.private} onBack={() => vigil.item(open.id).then((fresh) => fresh && setOpen(fresh))}><ItemDetail top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => ((stepped.current = true), pick(items[to].id))} />} key={open.id} item={open} onOpen={(type, id) => (type === tier ? pick(id) : onOpen?.(type, id))} /></Apart>}
    </>
  )
}

/** The open nugget, article or question, wherever it is opened: a question is drawn its own way. */
/** What a nugget or an article offers besides opening and pinning: its row menu and its note's dots share it. */
const itemMenu = (item: Item): MenuItem[] => [
  { label: item.private ? 'Make it not private' : 'Make it private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('nugget', item.id) },
  { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openApart(item.tier, item.id) },
  { label: 'Expanded view', hint: 'The whole article in one scroll, its linked notes too', run: () => openExpanded(`${item.tier}:${item.id}`) },
  asideItem(item.tier, item.id),
  ...queueItems(item.id),
  'separator',
  item.tier === 'nugget' && { label: 'Change kind…', run: () => void changeKind('nuggets', item.id, item.kind) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', hint: item.archivedAt ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  { label: 'Save attachments…', hint: 'Its pictures and files, to a folder', run: () => void saveAttachments([{ table: 'nuggets', id: item.id }]) },
  copyToBookItem([{ table: 'nuggets', id: item.id }]),
  'separator',
  binItem([{ type: item.tier, id: item.id }])
]

export function ItemDetail(props: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  return props.item.tier === 'question' ? <QuestionDetail {...props} /> : <NuggetDetail {...props} />
}

/** The open nugget or article: its words, its glosses, and down the right how it comes back. */
function NuggetDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  // What is around its words (who links to it, its map, the notes like it) comes the frame after them.
  const later = useAfterFirstPaint()
  const [prompt, setPrompt] = useState(item.prompt ?? '')
  // Who said it, as typed: saved as the field is left.
  const [source, setSource] = useState(item.attribution ?? '')
  useEffect(() => setSource(item.attribution ?? ''), [item.id, item.attribution])
  const [where, setWhere] = useState(item.medium ?? '')
  useEffect(() => setWhere(item.medium ?? ''), [item.id, item.medium])
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
    // The question it had before, back with Undo: a blank never costs the old one.
    const before = item.prompt ?? null
    setPrompt(text)
    void vigil.saveItem(item.id, { prompt: text }).then(() => toast('A fill-in-the-blank card: Review will ask it', () => (setPrompt(before ?? ''), void vigil.saveItem(item.id, { prompt: before }))))
  }
  const savePrompt = (): void => {
    if ((item.prompt ?? '') === prompt.trim()) return
    const before = item.prompt ?? null
    void vigil.saveItem(item.id, { prompt: prompt.trim() || null }).then(() =>
      toast(prompt.trim() ? 'Now tested: it will come up in review' : 'Back to coming up on its own', () => (setPrompt(before ?? ''), void vigil.saveItem(item.id, { prompt: before })))
    )
  }

  return (
    <div data-open={item.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div data-voice={voiceOf({ type: item.tier, kind: item.kind, attribution: item.attribution, medium: item.medium, label: item.title })} data-voice-edge className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <NoteHeader className="-mt-3 mb-1" left={top} type={item.tier} table="nuggets" id={item.id} copyKey={noteLinkText(`${item.tier}:${item.id}`, item.title)} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
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
            {item.kind === 'quote' && item.attribution && (
              <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem] text-control text-muted-foreground">
                {/* Signed, and changed from the signature: a click goes to “Who said it” beside the page. */}
                <Tip label="Change who said it">
                  <button type="button" data-signed-edit className="rounded hover:bg-accent" onClick={() => { const field = document.querySelector<HTMLInputElement>('[data-gem-source]'); field?.scrollIntoView({ block: 'center', behavior: glideWay() }); field?.focus() }}>
                    <Signed who={item.attribution} className="private-text" />
                  </button>
                </Tip>
              </div>
            )}
            <SourceFoot who={item.attribution} where={item.medium} quote={item.kind === 'quote'} gem={item.tier === 'nugget'} />
            {/* No question yet: the way into Review, said once under the words. */}
            {/* Offered on the day it was kept only: after that, it is not asked again. */}
            {item.tier === 'nugget' && !prompt && !item.supersededBy && recallOffered(item.createdAt) && (
              <AskLine onAsk={(question) => {
                setPrompt(question)
                chime('promote')
                void vigil.saveItem(item.id, { prompt: question }).then(() =>
                  toast('In Review now: it comes back as a new card', () => (setPrompt(''), void vigil.saveItem(item.id, { prompt: null }))))
              }} />
            )}
            {later && <Mentions id={item.id} onOpen={onOpen} />}
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
        {/* A thought on it, pinned under the page, its earlier ones a click away. */}
        {later && <ThoughtDock id={item.id} />}
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

        {/* How it comes back, one choice: with a question it is tested in
            Review; without one, a hint now and then, or often (a standing
            principle, the note-to-self's way); or not at all (suspended). */}
        <Island compact title="Comes back">
          <Chips className="flex-wrap px-1 pb-1"
            options={item.prompt
              ? [{ id: 'tested', label: 'In Review, on a schedule' }, { id: 'off', label: 'Not at all' }]
              : [{ id: 'encounter', label: 'Now and then' }, { id: 'pushed', label: 'Often' }, { id: 'off', label: 'Not at all' }]}
            on={(id) => (item.suspended ? id === 'off' : item.prompt ? id === 'tested' : id === (item.mode === 'pushed' ? 'pushed' : 'encounter'))}
            pick={(id) => {
              const now = item.suspended ? 'off' : item.prompt ? 'tested' : item.mode === 'pushed' ? 'pushed' : 'encounter'
              if (id === now) return
              const said: Record<string, string> = { off: 'It will not come back until you choose again', tested: 'Back in Review', encounter: 'It comes back now and then', pushed: 'It comes back often' }
              const back = { suspended: !!item.suspended, mode: item.mode }
              void vigil.saveItem(item.id, id === 'off' ? { suspended: true } : { suspended: false, ...(id === 'tested' ? {} : { mode: id }) })
                .then(() => (chime(id === 'off' ? 'off' : 'on'), toast(said[id], () => void vigil.saveItem(item.id, back))))
            }} />
          <Does does="A question this gem answers. Filled in, it is tested in Review on a schedule; empty, it comes back on its own now and then" set={!!prompt}>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={savePrompt}
            rows={3}
            placeholder="A question this answers"
            data-ghost-field={prompt ? undefined : ""}
            aria-label="A question this answers"
            className={`resize-none text-control ${GHOST}`}
          />
          </Does>
          <Tip label="Select a few words in the note first. They become a blank you fill in when it comes up in Review">
            <div><Prop icon={SquareDashed} onClick={cloze}>Blank the selected words</Prop></div>
          </Tip>
          {item.dueAt && <Prop icon={Calendar}>Next review {whenInLine(item.dueAt, false)}</Prop>}
          {!!item.reviewed && <div className="px-2 py-1.5 text-muted-foreground"><ReviewHistory id={item.id} /></div>}
          {item.lapses >= 4 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-orange)]">
              <Typed text={`Forgotten ${item.lapses} times. That is usually the question, not you: try rewriting it.`} step={28} />
            </p>
          )}
        </Island>

        <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private' : 'Not private'}
          </Prop>
          <Prop icon={Pin} active={!!item.pinnedAt} onClick={() => pin('nuggets', item.id, !item.pinnedAt)}>
            {item.pinnedAt ? 'Pinned to the sidebar and quick capture' : 'Pin to the sidebar and quick capture'}
          </Prop>
          <RemindMe table="nuggets" id={item.id} at={item.remindAt} />
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)} tip={item.archivedAt ? 'Bring it back' : 'Kept, out of sight'}>
            {item.archivedAt ? 'Unarchive' : 'Archive'}
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
                placeholder="What makes the answer make sense"
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
                placeholder="Why it is so, in a line"
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
                  Your thoughts on this gem run to {num(glossWords)} words: that is an article already. Start one and they come with it.
                </p>
              )}
              <Prop icon={Plus} onClick={() => void vigil.article([item.id]).then((id) => { chime('promote'); toast('An article, from this gem'); onOpen?.('article', id) })}>
                Start an article
              </Prop>
              <StudyThis item={item} />
            </Island>
          </>
        ) : null}
        {later && <Lineage id={item.id} onOpen={onOpen} />}
        {later && <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />}
        {later && <SimilarNotes id={item.id} onOpen={onOpen} />}
        <Island compact title="Wrong?">
          {item.supersededBy ? (
            <Prop icon={TriangleAlert}>Replaced: out of Review, kept beside what is true</Prop>
          ) : (
            <Supersede item={item} />
          )}
        </Island>
        <Island compact title="Where it came from">
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <Quote className="size-4 shrink-0" />
            {/* Asked the way its kind asks it (Who said it, Who made it), with the names used before offered. */}
            <Remembered key={`w${item.id}`} field="attribution" value={source} data-gem-source
              placeholder={asksFor(item.kind as CaptureType, item.title).who ?? 'Who, or where from'}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
              onChange={setSource}
              onBlur={() => {
                const next = source.trim() || null
                if (!next && item.kind === 'quote' && item.attribution?.trim()) return askClearWho(item.attribution.trim(), () => vigil.saveItem(item.id, { attribution: null }), () => setSource(item.attribution ?? ''))
                if (next !== (item.attribution ?? null)) void vigil.saveItem(item.id, { attribution: next }).then(() => chime('noted')) }} />
          </label>
          {/* Where it came from (a book, a site), kept from its capture and changed here. */}
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <BookOpen className="size-4 shrink-0" />
            <Remembered key={`m${item.id}`} field="medium" value={where} data-gem-where
              placeholder={asksFor(item.kind as CaptureType, item.title).where ?? 'Where from'}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
              onChange={setWhere}
              onBlur={() => { const next = where.trim() || null; if (next !== (item.medium ?? null)) void vigil.saveItem(item.id, { medium: next }).then(() => chime('noted')) }} />
          </label>
        </Island>
        <Island compact title="Details">
          <Prop icon={Calendar}>Saved {whenInLine(item.createdAt)}</Prop>
          {/* An article made from ideas says so here, with the rest of what it is; one written from scratch needs no line. */}
          {item.tier === 'article' && item.origins.length > 0 && <Prop icon={Layers}>Made from {num(item.origins.length)} gem{item.origins.length === 1 ? '' : 's'}</Prop>}
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
 * Under a gem with no question: one line saying what a question would do,
 * and a click turns it into the field to write one. Enter keeps it, and the
 * gem joins Review; Escape leaves it as it was.
 */
function AskLine({ onAsk }: { onAsk: (question: string) => void }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  return (
    <div data-chrome data-ask-line className="page-narrow mx-auto mt-6 w-full px-[4.5rem]">
      {asking ? (
        <Input autoFocus placeholder="What question does this answer? Enter keeps it"
          onBlur={() => setAsking(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') return (event.stopPropagation(), setAsking(false))
            const question = event.currentTarget.value.trim()
            if (event.key !== 'Enter' || !question) return
            event.preventDefault()
            setAsking(false)
            onAsk(question)
          }}
          className="h-9 text-control" />
      ) : (
        <button type="button" onClick={() => (chime('tap'), setAsking(true))}
          className="group flex items-center gap-2 rounded-md py-1 text-left text-control text-muted-foreground transition-colors hover:text-foreground">
          <Brain className="size-4 shrink-0 text-[var(--tt-color-text-purple)]" />
          <span><strong className="font-semibold text-foreground/85 group-hover:text-foreground">Ask yourself something about this,</strong> and it comes back in Review.</span>
        </button>
      )}
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
  const typed = words.trim() ? (datesIn(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words)[0]?.date ?? null) : null
  const set = (date: Date | null): void => {
    setOpen(false)
    setWords('')
    // The reminder it had, back with Undo: a cleared or moved date is never lost to a slip.
    const was = at
    void vigil.remind(table, id, date ? date.toISOString() : null).then(() =>
      (chime(date ? 'pin' : 'off'), toast(date ? `Pins itself in quick capture's Inbox ${whenInLine(date.toISOString(), false)}, with a “waiting” chip at the top of quick capture` : 'Reminder cleared', () => void vigil.remind(table, id, was))))
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
        void makeTask({ item: item.id, text: `Study ${quoted(item.title, 200)} ${event.currentTarget.value}` }, 'A task, with this linked').then(() => setAsking(false))
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
        const suspended = !!item.suspended
        void vigil.supersede(item.id, event.currentTarget.value.trim()).then((fixed) => toast('Corrected: the new version is a gem, this one is out of review', () => void vigil.unsupersede(item.id, fixed, suspended)))
      }}
      className="resize-none text-control"
    />
  )
}

/** A gem's status and rating, read from its kind's fields. */
const propOf = (one: Item): { status?: string; rating?: number } => {
  try {
    const kept = one.fields ? JSON.parse(one.fields) : {}
    return { status: typeof kept.status === 'string' && kept.status.trim() ? kept.status.trim() : undefined, rating: Number(kept.rating) || undefined }
  } catch {
    return {}
  }
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
  // Status and rating, the properties a kind asks for: filtered and sorted by once any gem has them.
  const statuses = [...new Set(all.map((one) => propOf(one).status).filter((one): one is string => !!one))].sort()
  const rated = all.some((one) => propOf(one).rating)
  if (statuses.length) facets.push({ key: 'status', label: 'Status', options: statuses.map((id) => ({ id, label: id })), test: (one, status) => propOf(one).status === status })
  if (rated) facets.push({ key: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ id: String(n), label: '★'.repeat(n) })), test: (one, n) => propOf(one).rating === Number(n) })
  const ownOrder = (a: Item, b: Item): number => own.compare(a.id, b.id) || b.createdAt.localeCompare(a.createdAt)
  const kinds = facets[0].options.length > 1
  const groups = arrange(all, view, facets, {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    changed: (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    untouched: (a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title),
    kind: (a, b) => a.kind.localeCompare(b.kind) || b.createdAt.localeCompare(a.createdAt),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    rating: (a, b) => (propOf(b).rating ?? 0) - (propOf(a).rating ?? 0) || b.createdAt.localeCompare(a.createdAt),
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
      count={all.length}
      // By kind only where there is more than one kind; by next review only where something is due for one (pieces of writing never are).
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Longest unchanged' }, { id: 'name', label: 'A to Z' }, ...(kinds ? [{ id: 'kind', label: 'Kind' }] : []), ...(all.some((one) => one.dueAt) ? [{ id: 'due', label: 'Next review' }] : []), ...(rated ? [{ id: 'rating', label: 'Highest rated' }] : []), { id: 'manual', label: 'Custom order' }]}
      groups={[{ id: 'none', label: 'None' }, ...(kinds ? [{ id: 'kind', label: 'Kind' }] : []), { id: 'date', label: 'Date' }]}
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
    const back = (): void => {
      // Drawn back at once, as the change itself was.
      setHeld({ top: was.top, groups: was.groups })
      void noteGroupsApi.arrange(tier, { top: was.top, groups: was.groups, revive })
    }
    // A new group is drawn in front of you with its name open for typing: no toast, ⌘Z still takes it back.
    void noteGroupsApi.arrange(tier, next).then(() => said && (next.make && !apart.length ? quietly(back) : toast(apart.length ? `${said}: ${apart.join(', ')} came apart` : said, back)))
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
      n > 1 && { label: `Archive ${n} notes`, hint: 'Kept, out of sight', run: () => (done(), void archive('nuggets', these, true)) }
    ]
  }
  const folds = (menuFor: (item: Item) => RowItem[]): Omit<Folds, 'onNewNote'> => ({
    bundles: now.map((one): Bundle => {
      const group = one.group ? info.get(one.group) : undefined
      return {
        group: one.group
          ? { id: one.group, name: group?.name ?? layout.make?.name ?? 'Group', icon: group?.icon ?? null, color: group?.color ?? null, open: isOpen(one.group), members: one.items.map((item) => item.id), parting: parting.includes(one.group), unsorted: one.items.filter((item) => item.unsorted && !item.archivedAt).map((item) => item.id) }
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
