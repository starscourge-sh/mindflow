import { PlainField } from './presets'
import { QuestionTabs, QuestionsSaid, type Asked } from './questions-view'
import { askFolder, keepIn, useFolderOf, useFolders, type Folder, type FolderKind } from '@/lib/folders'
import { newFolderHere } from './side-folder-section'
import { BlankPanel, cardPerNumber } from './blank-panel'
import { BLANK, addBlank, clozeNumbers, listItemCount, typedAsGaps } from '@/lib/blanks'
import { ContextField } from './context-field'
import { behindOf } from '@/lib/answer-picture'
import { notePowers } from './note-powers'
import { hoverNote } from './note-preview'
import { PropertyStrip } from './property-strip'
import { FadedLine } from './feed-view'
import { openRead } from './read-through'
import { propertySorts } from '@/lib/property-sorts'
import { ReadsIn } from '@/lib/reads-in'
import { quoted } from '../../../../main/clip'
import { UNATTRIBUTED, openSource, voiceOf, type SourceField } from '@/lib/sources'
import { Avatar } from './avatar'
import { personKey } from '../../../../main/names'
import { openPdf } from '@/components/pdf/pdf-reader'
import { SameBook } from '@/components/pdf/same-book'
import { bookOf, pdfIn } from '@/lib/pdf-in'
import { SourceFoot } from './source-page'
import { SimilarNotes } from './similar-notes'
import { chime, pageShown, pageTurn } from '@/lib/sound'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Archive, ArrowLeft, ArrowUpRight, Calendar, Check, ChevronRight, FilePlus, FolderInput, Group, Inbox, Library, ListChecks, ListPlus, ListStart, ListTodo, Plus, Shuffle, SquareDashed, Trash2 } from 'lucide-react'

import { Unfold } from './glide'

import { HaligtreeEditor } from '../haligtree'
import { keptDoc } from './haligtree-editor'
import { Board, useBoard } from './board-view'
import { textOf } from '../rot-cards'
import { firstLineOf } from '@/extensions/tokens'
import { ReadThrough } from './read-through'
import { enqueue } from '@/lib/reading-queue'
import { CAPTURE_TYPES, CaptureKindPicker, kindOf, asksFor, byKind, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { age, fieldOf } from '../capture-list'
import { headword, letterOf } from '@/lib/headword'
import { follow, noteLinkText, recallOffered } from '@/lib/capture-links'
import { call, splitTags, unloaded, unread, useLastAsked, useLive, haligtree, whenInLine, type Item, type ItemFull, type Settings } from '@/lib/haligtree'
import { exampleIdeas, exampleWords, exampleQuestions, exampleWriting } from '@/lib/examples'
import { Example } from './example'
import { LIFECYCLE } from './page-hint'
import { makeTask, makeTasks } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { binItem, moveToBin, useCameBack } from '@/lib/to-bin'
import { ShowInListContext, useShowInList } from '@/lib/show-in-list'
import { readAgain, useSameWords } from '@/lib/same-words'
import { canMoveTier, moveTier } from './gem-or-card'
import { openLine } from './study'
import { AskKey, Empty, focusField, Grows, Island, POP_ISLANDS, Page, Prop, Props, Remembered, refuse, quietly, sayNow, toast, useListKeys, useReadKey, typing, pin, Stepper, startAt, Typed, showTopTitle, Pressed, askClearWho, Rolling, namedByApp } from './ui'
import { Term } from './term'
import { AGES, COLUMNS_OR_LIST, Chips, Display, columnsOrList, everySort, FilterChips, arrange, inAge, period, useView, type Choice, type Density, type Facet, type View } from './display'
import { RowMenu, copy, copyLinkItem, type MenuItem, type RowItem } from './row-menu'
import { stickOnDesktop } from './sticky-note'
import { Lineage } from './lineage'
import { ReviewHistory } from './review-view'
import { Mentions } from './mentions'
import { FolderMargin, Marginalia, namesIn } from './marginalia'
import { datesIn } from '../../../../main/task-words'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { backIn } from '@/lib/back-in'
import { Textarea } from '@/components/ui/textarea'
import { Act, FoldItem, MenuRows, Tip } from '@/components/haligtree/ui'
import { Does, GHOST } from './ghost'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import { Aliases, KindFields, LocalGraph, NoteHeader, PlaceChip, WritingSpent } from './note-extras'
import { NoteSize } from '@/components/count/note-size'
import { WordCount } from '@/components/count/word-count'
import { RoomFoot, useWritingRoom } from './writing-room'
import { useWritingSound } from './writing-sound'
import { writerMenu } from './writer-tools'
import { Proofread } from './proofread'
import { RecentIsland } from './recent-island'
import { askProofread } from '@/lib/grammar'
import { ListSearch, NoteList, NoteRail, PaneButtons, Peek, matches, type Entry } from './note-list'
import { archive, changeKind, publishSite, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { openApart, openSmall, smallHolds } from '@/lib/apart'
import { moveToBookItem } from '@/lib/books'
import { useOpened } from '@/lib/nav'
import { readAhead, readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { NoteComing, NoteWaiting } from './note-coming'
import { QuestionDetail, questionEntry, questionMenu, startQuestion } from './questions-view'
import { GlossTimeline, PageThoughts, useRowGloss } from './gloss-line'
import { ThoughtDock } from './thought-bar'
import { dayjs, num, plural } from '../../../../main/dates'
import { moment, when } from '@/lib/clock'
import { Signed } from './signature'
import { groups as noteGroupsApi, isFolder, useGroups, type NoteGroup } from '@/lib/groups'
import { useReveal } from './islands'
import { cleanName, sharedWords } from '@/lib/group-name'
import { DEPTH, dropMany, flatten, gather, groupId, groupOf, isGroup, KEY, layoutOf, moveMany, reorderAs, sameLayout, step as stepLayout, tidy, type Layout } from '@/lib/group-layout'
import type { Cue } from '@/lib/sound'
import { SECTIONS } from './places'
import { GroupIcon, SectionHeads, type Bundle, type Folds, type GroupView, type Part as KeptPart } from './kept-groups'
import { openItems, useHere } from '@/lib/split'
import { queueMenu } from '@/lib/reading-queue'
import { Apart } from '@/lib/apart'
import { loud } from '@/lib/loud'
import { pictureItems } from '@/lib/note-picture'
import { cardItem } from '@/lib/share-card'
import { ArchiveRestore, BookOpen, Brain, Download, Eye, EyeOff, FileText, Gem, History, Layers, Pencil, Bookmark as Pin, Quote, Repeat as RefreshCw, TriangleAlert, X } from '@/components/ui/icons'
import { menuOpen } from '@/lib/menu-keys'


/**
 * A nugget or an article as any list draws it. A nugget reads as its own
 * words, with how it comes back under them; an article as a titled document.
 */
// Each item's row, worked out once a minute (its age is said to the minute): picking
// all 10,000 gems otherwise worked out every row again for each key.
const ROWS = new WeakMap<Item, { minute: number; entry: Entry }>()
export const itemEntry = (item: Item, menu?: RowItem[] | (() => RowItem[])): Entry => {
  const minute = Math.floor(Date.now() / 60_000)
  let kept = ROWS.get(item)
  if (!kept || kept.minute !== minute) ROWS.set(item, (kept = { minute, entry: rowOf(item) }))
  if (typeof menu !== 'function') return menu ? { ...kept.entry, menu } : kept.entry
  // Made the first time it is read, by a row drawn: 2,500 rows each building a menu on every draw took 50 ms.
  let made: RowItem[] | undefined
  return Object.defineProperty({ ...kept.entry }, 'menu', { get: () => (made ??= menu()), enumerable: true })
}
/** What an empty folder's card is drawn from in a grid: a folder emptied stays, with no note of its own to show. */
const NO_GROUPS: NoteGroup[] = []

/**
 * The folder a page, gem or question lives in, quietly, on its row in Writing, Gems or Questions: these are views by
 * kind, listing filed and unfiled alike, so the row says where it is kept. A click on it is a click on the row.
 */
export function FolderCue({ home }: { home: Folder }): React.JSX.Element {
  return (
    <span data-row-folder={home.id} className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
      <GroupIcon icon={home.icon} color={home.color} className="size-3 shrink-0" /><span className="truncate">{home.name}</span>
    </span>
  )
}
const EMPTY = (tier: string): Item => ({ tier, kind: 'note', title: '', createdAt: new Date().toISOString() }) as Item
const rowOf = (item: Item): Entry => {
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
  // A fill-in-the-blank card's question is its own sentence with a gap: the row has the sentence, the gap is Review's.
  const asks = recall && item.prompt && !same(item.prompt, text) && !item.prompt.includes(BLANK) && !clozeNumbers(item.prompt).length ? `Asks “${typedAsGaps(item.prompt).replace(/[?.\s]+$/, '')}?”` : null
  // One paused says so first: it is dimmed for that reason, and comes back only when you choose. The usual way
  // (now and then) is not said on every row: only what differs from it is.
  const comes = item.suspended ? 'Paused: not coming back until you choose' : recall ? (item.dueAt ? (due ? null : `Back in Review ${backIn(item.dueAt)}`) : null) : item.mode === 'pushed' ? 'Comes back often' : null
  // With nothing else to say, the hollow dot is named, so it never stands alone.
  const line = [comes, asks, item.attribution].filter(Boolean).join(' · ') || (recall && !item.dueAt ? 'New card' : '')
  return {
    id: item.id,
    type: item.tier,
    // Still “Untitled”: its first line stands in, in muted ink (note-list's Named).
    ...(text.trim() === 'Untitled' && item.line?.trim() ? { title: '', line: splitTags(item.line).text || item.line } : { title: text }),
    tags,
    // A plain gem wears the gem's own sign, as Gems' row in the sidebar and Recent draw it: the note sign read as a page.
    icon: article ? FileText : kind.id === 'note' ? Gem : kind.icon,
    tint: article ? undefined : kind.tint,
    age: age(item.createdAt),
    sub: article ? item.attribution ?? undefined : (
      <span data-gem-meta className="flex min-w-0 items-center gap-1.5">
        {recall && !item.dueAt ? (
          <Tip label="A new card: it joins Review soon">
            <span data-new-card role="img" aria-label="Not reviewed yet" className="size-2 shrink-0 rounded-full border-[1.5px] border-current opacity-70" />
          </Tip>
        ) : recall ? <Brain className="size-3 shrink-0" /> : item.mode === 'pushed' ? <RefreshCw className="size-3 shrink-0" /> : null}
        {/* A card due now says so in bold orange: the one word in the row that asks for something. */}
        {due ? <span {...loud('today', 'shrink-0 font-semibold')}>Due for review</span> : null}
        {line && <span className="truncate">{due ? `· ${line}` : line}</span>}
      </span>
    ),
    marks: (
      <>
        {item.supersededBy && <Tip label="Replaced by a corrected gem: out of Review, kept beside what is true"><span className="shrink-0 text-xs text-[var(--tt-color-text-orange)]">Replaced</span></Tip>}
        {/* Said in words, as "Replaced" is: a bare orange triangle gave no reason (its tip never showed on the icon). */}
        {item.lapses >= 4 && <Tip label={`Forgotten ${num(item.lapses)} times in Review: rewording it, or splitting it in two, often helps`}><span data-often-forgotten="" className="shrink-0 text-xs text-[var(--tt-color-text-orange)]">Often forgotten</span></Tip>}
        {item.pinnedAt && <Tip label="In Favorites: in the sidebar and in quick capture"><Pin className="size-3 shrink-0 text-muted-foreground" aria-label="In Favorites" /></Tip>}
        {item.private ? <Tip label="Private: never comes up unasked in quiet hours or safe mode"><EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /></Tip> : null}
      </>
    ),
    dim: !!item.suspended,
    voice: item.kind === 'word' ? undefined : voiceOf({ type: item.tier, kind: item.kind, attribution: item.attribution, medium: item.medium, label: item.title }),
    private: !!item.private,
    // A word kept: the word, then its meaning, as Lookups sets it (lib/headword.ts). Its row is a word's, on one line.
    ...(item.kind === 'word' ? { head: { ...headword(text, fieldOf(item.fields, 'definition')), where: item.medium || undefined }, wrap: false } : { wrap: item.tier === 'nugget' })
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

/**
 * Groups already named for their notes once (or named by you), kept between launches: none is renamed twice. A new
 * key since the model's answers were read right (group-name.ts cleanName, 19 Nov): every group tried before was
 * refused, so each "Group N" is tried once more.
 */
const AUTO_TRIED = 'groups:auto-named-2'
const autoTried = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(AUTO_TRIED) ?? '[]') as string[] } catch { return [] } })())
const triedNaming = (id: string): void => {
  autoTried.add(id)
  try { localStorage.setItem(AUTO_TRIED, JSON.stringify([...autoTried].slice(-2000))) } catch { /* kept for this run only */ }
}

export function ItemsView({ tier, focus, folder: sideFolder, onFolder, onOpen, only , ask = 'open', onAsk, inFolder, lead: givenLead, said }: {
  tier: 'nugget' | 'article'
  /** A folder of Folders: this same list, its rows, groups, keys and the note beside it, holding only what the folder
   *  keeps (folder-view.tsx). A folder's page is Writing's (or Gems', or Questions') list, never a list of its own. */
  inFolder?: { id: string; name: string }
  /** At the line's left, before the count: a folder's kinds. */
  lead?: React.ReactNode
  /** Over the list: a folder's fact line and the folders inside it. */
  said?: React.ReactNode
  focus?: string
  /** The folder opened from the sidebar: the list narrowed to what it holds, a chip back out through `onFolder`. */
  folder?: string
  /** `reveal`: gone into to show the note open there, not asked for: the place you are at, never a step of its own. */
  onFolder?: (id: string | null, reveal?: boolean) => void
  onOpen?: (type: string, id: string) => void
  only?: 'questions'
  /** In Questions: which ones, open or answered (Looked up is the lookups' own list, home.tsx). */
  ask?: Asked
  onAsk?: (one: Asked) => void
}): React.JSX.Element {
  const own = useLive(() => haligtree.items(tier), [] as Item[], [tier], ['item'], 'items')
  useArrivals(tier, own)
  // Questions are a page of their own (a row under Writing in the sidebar): Writing holds your pages alone, and
  // Questions, drawn by this same list, holds the questions, open first, each with its answer or none yet.
  const writing = tier === 'article'
  const questionsOnly = writing && only === 'questions'
  // Read on Questions only: Writing lists pages alone, so its count is the sidebar's (a question lives in Questions).
  const held = useLive(() => (questionsOnly ? haligtree.items('question') : Promise.resolve([] as Item[])), [] as Item[], [questionsOnly], ['item'], 'writing-questions')
  const filed = useGroups(tier)
  // Where each row lives, for its quiet folder label (`placed`).
  const everyFolder = useFolders()
  const folderById = useMemo(() => new Map(everyFolder.map((one) => [one.id, one])), [everyFolder])
  const folderOfItem = useFolderOf()
  const pinnedQuestions = useLive(haligtree.pinnedQuestions, [] as Awaited<ReturnType<typeof haligtree.pinnedQuestions>>)
  const inView = new Set(pinnedQuestions.map((one) => one.id))
  // Whether open questions come back at all, so each row's "can come back" line is true (question:back).
  const backSettings = useLive(haligtree.settings, null as Settings | null)
  const backOn = backSettings?.questionsBack !== false && backSettings?.hintRate !== 0
  // Questions' Words: the word gems you are learning, read only while that filter is on.
  const learning = useLive(() => (writing && only === 'questions' && ask === 'words' ? haligtree.items('nugget') : Promise.resolve([] as Item[])), [] as Item[], [writing, only, ask], ['item'], 'questions-words')
  const all = useMemo(() => (unloaded(own) || unloaded(held) ? unread([] as Item[]) : !writing ? own : questionsOnly && onAsk && ask === 'words' ? (unloaded(learning) ? unread([] as Item[]) : learning.filter((one) => one.kind === 'word')) : questionsOnly ? (onAsk ? held.filter((one) => (ask === 'answered' ? !!one.closedAt : !one.closedAt)) : held) : own),
    [own, held, writing, questionsOnly, ask, onAsk, learning])
  // A folder opened from the sidebar: the list as ever, with only what the folder holds (its subfolders' too).
  // Only what is shown narrows: the layout is still read from every note, so a move inside keeps the rest in place.
  const shelf = useGroups(tier)
  const opened = sideFolder ? shelf.find((one) => one.id === sideFolder) : undefined
  const listed = useMemo(() => {
    if (inFolder) return all.filter((one) => (inFolder.id === 'unfiled' ? !folderOfItem[one.id] : folderOfItem[one.id] === inFolder.id))
    if (!opened) return all
    const under = new Set([opened.id])
    for (let grew = true; grew; ) {
      grew = false
      for (const one of shelf) if (one.parent && under.has(one.parent) && !under.has(one.id)) (under.add(one.id), (grew = true))
    }
    const held = new Set(shelf.filter((one) => under.has(one.id)).flatMap((one) => one.members))
    return all.filter((one) => held.has(one.id))
  }, [all, shelf, opened, inFolder, folderOfItem])
  const { groups: arranged, display, sorts, chips, density, view, setView, move, moveBy, ownOrder, order, mine, heads: sourceHeads, sourceSaid } = useItemDisplay(questionsOnly ? (onAsk && ask === 'words' ? WORDS : 'question') : tier, listed, !questionsOnly)
  // The list's width: beside the note, over the whole page, or a rail of pictures.
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<ItemFull | null>(() => (focus ? readNow<ItemFull>(only === 'questions' ? 'question' : tier, focus) ?? readNow<ItemFull>(tier, focus) ?? null : null))
  const spread = pane === 'wide' && !open
  // A page shown as a board folds the list to a rail, a click from coming back.
  const [boarded, setBoarded] = useState(false)
  const [listOut, setListOut] = useState(false)
  useEffect(() => setListOut(false), [boarded])
  // Not grouped, or grouped by kind with only one kind: a plain list, with no sections.
  const plain = arranged.length <= 1 && !arranged[0]?.[0]
  const groups = spread && query.trim() ? arranged.map(([name, list]) => [name, list.filter((one) => matches(one.title, query, one.fields))] as [string, Item[]]).filter(([, list]) => list.length) : arranged
  // x, ⌘-click and ⇧-click pick rows: several nuggets make one article, and any rows make a group.
  const [chosen, setChosen] = useState<string[]>([])
  // Groups show as groups in every sort and every grouping, as Finder's folders do. Grouped by kind or date, they come
  // first in your own order, then the loose notes in their sections; inside a group its notes go by kind (or date) too.
  // Order: folders, then your own groups with their notes, then the rest in Display's grouping (kind, date) or none.
  const heads = plain ? undefined : new Map(groups.flatMap(([name, list]) => list.map((one) => [one.id, name] as const)))
  const everyShown = groups.flatMap(([, list]) => list)
  // A note in a folder lives there alone (memory: folders-isolate): the list's top level is its folders, then the loose
  // notes, in every order; a folder's notes show only once it is opened. Groups are the one way a note shows twice.
  // Questions is a view by kind, not a place: every question is a plain row there, and a folder (Writing's or Gems')
  // shows only in the section that owns it. A question in one says so on its row (`inFolder`, qa/questions-no-folders.mjs).
  const folding = useFolding(tier, all, ownOrder, order, !questionsOnly && (density === 'list' || density === 'compact') && !(spread && query.trim()) ? everyShown : null,
    view.sort === 'manual' && plain, () => setChosen([]), chosen, mine, heads, opened?.id, undefined, heads ? (id) => heads.get(id) : undefined, !!inFolder && inFolder.id !== 'unfiled')
  // Under headings (by kind, by date) the list's own rule says which heading a row stands under: carried over another
  // heading's rows it is refused in words, as Tasks' rows are (carry.tsx's useTargets), never offered a place it would not keep.
  const underHeads = heads ? {
    of: (id: string) => heads.get(id),
    take: (_id: string, part: string) => ({ refused: `Grouped by ${view.group === 'letter' ? 'first letter' : view.group}: that puts a ${tier === 'nugget' ? 'gem' : 'page'} under “${part}”, not where it is dropped` }),
    drop: () => undefined
  } : undefined
  // As tiles, each group is one folder card; opened, the grid shows only its notes, under a chip back.
  const noteGroups = questionsOnly ? NO_GROUPS : filed
  const tiled = (density === 'grid' || density === 'small') && !(spread && query.trim())
  const [inGroup, setInGroup] = useState<string | null>(null)
  const folder = tiled && inGroup ? noteGroups.find((one) => one.id === inGroup) : undefined
  const flat = groups.flatMap(([, list]) => list)
  const tiles = tiled && !folder && !questionsOnly ? folding.tiles(flat) : null
  const folders = new Map(tiles?.flatMap((one) => ('group' in one ? [[KEY + one.group.id, one] as const] : [])))
  const items = folding.rows
    ?? (folder ? flat.filter((one) => folder.members.includes(one.id))
      : tiles ? tiles.map((one) => ('group' in one ? ({ ...(one.items[0] ?? EMPTY(tier)), id: KEY + one.group.id, title: one.group.name } as Item) : one.item))
      : flat)
  const onMove = (id: string, target: string, after: boolean): void => move(all.map((one) => one.id), id, target, after)
  // Spread out, a click looks at a note beside the list; Enter opens it.
  const [peek, setPeek] = useState<string | null>(null)
  // The one asked for while its words are read: its pane and name shown at once, never the one before.
  const [coming, setComing] = useState<string | null>(() => (focus && !open ? focus : null))
  // However it was opened, the open one's row shows: its group opened, or its folder card gone into, quietly.
  const showing = spread ? peek : coming ?? open?.id
  // A note in a folder shows only inside it (folders isolate): opened from anywhere (a link in another note, search,
  // Recent), the list goes into its folder, where the sidebar already shows it. Left at the top, the list had no row
  // for it while the sidebar named it under its folder (the user, 14 Nov: "notice the sidebar loses its way").
  const intoItsFolder = (id: string): boolean => {
    const home = onFolder && !questionsOnly ? folding.home(id) : null
    if (!home || home.id === sideFolder) return false
    onFolder?.(home.id, true)
    return true
  }
  useReveal(showing, items.some((one) => one.id === showing), () => {
    if (!showing) return false
    if (intoItsFolder(showing)) return true
    if (folding.rows) return folding.reveal(showing)
    if (!tiled || questionsOnly) return false
    const card = folding.tiles(flat).find((one) => 'group' in one && one.items.some((item) => item.id === showing))
    if (card && 'group' in card) return (setInGroup(card.group.id), true)
    // In another group's folder: out of it, and looked for again among the cards.
    if (folder) setInGroup(null)
    return false
  })
  // Only the last pick lands: a late answer for the gem before is dropped.
  const asked = useLastAsked()
  // A row's own tier, so a question in Pages is read as a question.
  const typeOfRef = useRef<(id: string) => string>(() => tier)
  const typeOf = (id: string): string => typeOfRef.current(id)
  // Sent here for one note: the note is drawn first and the list beside it
  // the frame after, whole (Page's `apart`), so the words never wait behind
  // every row of a big book.
  const sent = !!focus && (coming ?? open?.id) === focus
  const [listFirst] = useState(!focus)
  const listLater = useAfterFirstPaint()
  const listShown = listFirst || listLater
  // A row pressed: the page turns on the press, not once the note has been
  // read, so the row's own click never sounds first (two sounds for one open).
  const pickRow = (id: string): void => (isGroup(id) ? undefined : pageTurn(false, id), pick(id))
  const pick = (id: string): void => {
    // A folder card opens the folder, as a row's click does (only its contents, under the path bar); in place where there is no path.
    if (isGroup(id)) return onFolder ? (chime('untuck'), onFolder(groupId(id)), setCursor(0)) : (chime('untuck'), setInGroup(groupId(id)), setCursor(0))
    // Opening a note brings the list back beside it.
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    const type = typeOf(id)
    const ready = readNow<ItemFull>(type, id)
    if (ready) return (asked(), setComing(null), setOpen(ready))
    if (id !== open?.id) setComing(id)
    asked(readFresh(type, id, haligtree.item), (got) => (setComing(null), setOpen(got)))
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? items[Math.max(0, cursor)]?.id ?? null)
      asked()
      setComing(null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) asked(haligtree.item(peek), setOpen)
    setView({ ...view, pane: next })
  }
  // Opened in a window of its own: closed here, so only one editor saves it.
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? (hush(), null) : was))
    window.addEventListener('haligtree:opened-apart', onApart)
    return () => window.removeEventListener('haligtree:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(items.length, {
    onOpen: (index) => pick(items[index].id),
    opened: items.findIndex((one) => one.id === (coming ?? open?.id)),
    onExtend: (from, to) => picking.extend(items[from]?.id, items[to].id),
    // Escape empties the search, and that is all: it never puts the note away,
    // changes the layout or leaves a group's folder. ⌘[ or the back button is the way back.
    onEscape: () => void ((spread || folder) && query && setQuery(''))
  })
  // A search cleared: the keyboard back on the one looked at, and it in view, wherever it is in the whole list.
  useEffect(() => void (!query && spread && peek && setCursor(items.findIndex((one) => one.id === peek))), [query]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // The open folder's path, as Finder's path bar shows it: the list itself, then each folder down to this one.
  const path: NoteGroup[] = []
  for (let at = opened; at && !path.includes(at); at = shelf.find((one) => one.id === at!.parent)) path.unshift(at)
  // ⌘↑ goes to the folder that holds this one, as in Finder. Writing and Gems make no folders (Folders does).
  const keysRef = useRef({ up: (): void => undefined })
  keysRef.current = {
    up: () => opened && (chime('tuck'), onFolder?.(opened.parent && shelf.some((one) => one.id === opened.parent) ? opened.parent : null))
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || event.ctrlKey || typing()) return
      const which = event.key === 'ArrowUp' && !event.shiftKey ? 'up' : null
      if (!which) return
      event.preventDefault()
      event.stopPropagation()
      keysRef.current[which]()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // An open folder with nothing in it: no notes and no folders.
  const folderEmpty = !!opened && !listed.length && !shelf.some((one) => one.parent === opened.id)
  // ; on the row under the cursor, with nothing open: a thought written under it.
  const glossAfter = useRowGloss(items[cursor]?.id, !open)
  // Back from the Bin by Undo: open again if a note was open, else the keyboard on its row.
  useCameBack(all.map((one) => one.id), (id) => (open ? pick(id) : setCursor(items.findIndex((one) => one.id === id))))
  // “Show in list” (⌥⌘L): the list brought out, a filter or search hiding it cleared (Undo puts it back), its group or folder opened.
  const showOpen = useShowInList(open?.id, () => {
    const id = open?.id
    if (!id) return
    const hidden = !flat.some((one) => one.id === id) && Object.entries(view.filter).some(([key, list]) => key !== 'flags' && list?.length)
    const was = view
    if (hidden || view.pane !== 'list') setView({ ...view, pane: 'list', ...(hidden ? { filter: { flags: view.filter.flags ?? [] } } : {}) })
    setListOut(false)
    if (query) setQuery('')
    if (hidden) toast('Filters cleared to show it in the list', () => setView(was))
    if (intoItsFolder(id)) return
    if (folding.rows) folding.reveal(id)
    else if (folder && !folder.members.includes(id)) setInGroup(null)
  })
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
  // Every imported note left to sort, those inside folders too: since folders hold their notes, the list's rows are
  // the folders and loose notes alone, and read from them the count missed every note an import filed.
  const unsorted = listed.filter((one) => one.unsorted && !one.archivedAt && !isGroup(one.id)).map((one) => one.id)
  const markSorted = (ids: string[], sorted: boolean): void =>
    void haligtree.sorted(ids, sorted).then(() => {
      chime(sorted ? 'done' : 'undo')
      if (sorted) toast(ids.length === 1 ? 'Sorted' : `${num(ids.length)} sorted`, () => void haligtree.sorted(ids, false).then(() => chime('undo')))
    })
  useReadKey(() => setReadFrom(startAt(items, open?.id, cursor)), items.length)
  // The Luhmann move: two unrelated nuggets side by side, for the connection
  // nobody would have gone looking for.
  const [pair, setPair] = useState<Awaited<ReturnType<typeof haligtree.random>>>([])
  // ⌘-click, ⇧-click, ⇧↑ and ⇧↓ pick as Finder does; a folder is not a note to pick.
  const picking = usePicking(items.map((one) => one.id), chosen, setChosen, { can: (id) => !isGroup(id) })
  const toggle = picking.toggle
  const at = useRef(cursor)
  at.current = cursor
  // ⌘A picks every note in the list (never a folder card), those in a folded group or a folder card too; Escape lets them go.
  // Inside a folder, the list is that folder's notes.
  const pickable = folder ? flat.filter((one) => folder.members.includes(one.id)) : flat
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  // Each one by its id at once: a find through every item for each of 10,000 picked took most of a second.
  const byId = useMemo(() => new Map(all.map((one) => [one.id, one])), [all])
  typeOfRef.current = (id) => byId.get(id)?.tier ?? (questionsOnly ? 'question' : tier)
  const binRefs = (ids: string[]): { type: string; id: string }[] => ids.filter((id) => !isGroup(id)).map((id) => ({ type: byId.get(id)?.tier ?? tier, id }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => pickable.map((one) => one.id), chosen, setChosen, { here, onDelete: toBin, current: () => items[at.current]?.id, titleOf: (id) => byId.get(id)?.title })
  // A Set, read once a row: with thousands picked, a list's includes on every row froze the window for minutes.
  const chosenSet = new Set(chosen)
  const allPicked = pickable.length > 0 && pickable.every((one) => chosenSet.has(one.id))
  // The picked ones into a folder, asked by the button that was pressed (or in the middle, from the folded menu).
  const keepInFolder = (at: Element | null): void => askFolder(chosen.map((id) => ({ type: items.find((one) => one.id === id)?.tier === 'question' ? 'question' as const : tier === 'article' ? 'article' as const : 'nugget' as const, id })), at)
  const startPage = (): void => void haligtree.article(chosen).then((id) => {
    // The same words and the same landing as the prompt's: the article opens.
    chime('promote')
    toast(chosen.length > 1 ? `A page, from ${num(chosen.length)} gems` : 'A page, from this gem')
    setChosen([])
    // Opened in Writing, where pages live: opened here, beside the gems, it read as nothing having happened, and a second press made a second page.
    onOpen ? onOpen('article', id) : pick(id)
  })
  // A study task for each one picked, linked to it, as "Study this" makes one.
  const makeEach = (): void => {
    const notes = chosen.flatMap((id) => {
      const item = byId.get(id)
      return item ? [{ id, title: item.title, private: !!item.private }] : []
    })
    void makeTasks(notes).then((made) => made && setChosen([]))
  }
  // ⌘K's "Group the picked notes" and "Ungroup": the same as ⌘G and ⇧⌘G.
  const groupKeys = useRef<(ungroup: boolean) => void>(() => undefined)
  groupKeys.current = (ungroup) => {
    const these = chosen.length ? chosen : items[at.current] ? [items[at.current].id] : []
    if (ungroup) folding.ungroup(these)
    else folding.groupNew(these)
  }
  useEffect(() => {
    const onGroup = (event: Event): void => void (here() && groupKeys.current(!!(event as CustomEvent<boolean>).detail))
    window.addEventListener('haligtree:group', onGroup)
    return () => window.removeEventListener('haligtree:group', onGroup)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing()) return
      // ⇧⌘M: "Keep in folder…" for the rows picked, or the one under the cursor.
      if (event.shiftKey && event.metaKey && !event.ctrlKey && !event.altKey && event.code === 'KeyM') {
        const these = chosen.length ? chosen : items[at.current] ? [items[at.current].id] : []
        if (!these.length) return
        event.preventDefault()
        event.stopPropagation()
        return folding.gatherNew(these)
      }
      // ⌃⌘N: a new folder for the rows picked, or the one under the cursor.
      if (event.ctrlKey && event.metaKey && event.code === 'KeyN') {
        const these = chosen.length ? chosen : items[at.current] ? [items[at.current].id] : []
        // No row here: an empty folder, as anywhere else (side-folder-section.tsx).
        if (!these.length) return
        event.preventDefault()
        event.stopPropagation()
        return folding.gatherNew(these)
      }
      // ⌘G groups the picked rows where they are, as Figma does (⌘K's "Group the picked notes" too); ⇧⌘G takes apart the group they (or the row under the cursor) are in.
      if (event.metaKey && !event.ctrlKey && !event.altKey && event.code === 'KeyG' && folding.rows) {
        event.preventDefault()
        event.stopPropagation()
        const these = chosen.length ? chosen : items[at.current] ? [items[at.current].id] : []
        return event.shiftKey ? folding.ungroup(these) : folding.groupNew(these)
      }
      // Escape lets the selection go, and only that: taken first, so the
      // list does not also close what is open.
      // An open menu takes its own Escape: closing it keeps what is picked.
      if (event.key === 'Escape' && chosen.length && !menuOpen()) {
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
  const hush = useOpened(open?.id, focus, pick, () => (asked(), setComing(null), setOpen(null)), { shown: items.map((one) => one.id), kind: 'item' })
  // The ones either side, read ahead for the stepper's ↓ and ↑.
  useEffect(() => {
    const at = items.findIndex((one) => one.id === open?.id)
    if (at >= 0) for (const one of [items[at - 1], items[at + 1]]) if (one && !isGroup(one.id)) readAhead(one.tier, [one.id])
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A gem or a piece of writing opened: a page turned, as a book is. Stepped to
  // with ↓ and ↑ (the Stepper over the page), a lighter page; a quick run turns only one.
  const stepped = useRef(false)
  useEffect(() => {
    if (open?.id) pageShown(open.id, stepped.current)
    stepped.current = false
  }, [tier, open?.id])
  // Re-read the open one when anything changes, so a gloss or a prompt shows.
  useEffect(() => window.api.captures.onChange(() => open && pick(open.id)), [open?.id])
  // The right-click menu: the same on a row and on a card.
  // Right-clicked among several picked: the menu speaks for all of them. Made once, not once a row.
  // A new page, in the folder you are in (the sidebar's, or a folder tile opened), as the sidebar's "+" makes it: the
  // header's "New page" and the list's own right-click both make it here.
  const newPage = (): void => void haligtree.newArticle().then(async (id) => {
    const here = folder?.id ?? opened?.id
    if (here) await noteGroupsApi.place([{ id, group: here }])
    chime('promote')
    pick(id)
  })
  const newWriting = (): void => (questionsOnly ? void startQuestion((type, id) => (type === 'question' ? pick(id) : onOpen?.(type, id))) : newPage())
  // The list's own menu, on its empty space (a row's own menu answers on a row): a page or a folder made here, and the
  // list's order, the same orders as its "Sort".
  const listMenu: RowItem[] = [
    writing && !questionsOnly && { label: 'New page', run: newPage },
    // A folder made here too, in the folder this list is (Writing's own place), named as it is made: Finder's right-click.
    writing && !questionsOnly && { label: 'New folder', keys: '⌃⌘N', run: () => newFolderHere(folder?.id ?? null) },
    sorts.length > 1 && { label: 'Sort', items: everySort(sorts).map((one) => ({ label: one.label, trail: view.sort === one.id ? <Check className="size-3.5" /> : undefined, run: () => (chime('tap'), setView({ ...view, sort: one.id })) })) },
  ]
  const manyMenu: RowItem[] | null = chosen.length > 1 ? [
    { label: `Make ${num(chosen.length)} tasks`, run: makeEach },
    'separator',
    ...folding.menu(chosen),
    'separator',
    binItem(binRefs(chosen), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
  ] : null
  const menuFor = (item: Item): RowItem[] => manyMenu && chosenSet.has(item.id) ? manyMenu : item.tier === 'question' ? [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    ...questionMenu(item, inView.has(item.id)),
    { label: chosenSet.has(item.id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => toggle(item.id) },
    !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
    'separator',
    binItem(binRefs([item.id]))
  ] : [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    'separator',
    { label: item.pinnedAt ? 'Remove from Favorites' : 'Add to Favorites', run: () => pin('nuggets', item.id, !item.pinnedAt) },
    ...itemMenu(item),
    item.unsorted ? { label: 'Mark as sorted', hint: 'Kept where it is', run: () => markSorted([item.id], true) } : null,
    { label: chosenSet.has(item.id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => toggle(item.id) },
    !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
    'separator',
    ...folding.menu([item.id]),
    'separator',
    copyLinkItem(`${item.tier}:${item.id}`, item.title),
    { label: 'Copy title', run: () => copy(item.title) },
    'separator',
    binItem(binRefs([item.id]))
  ]

  // Where the open page lives, said over it: its folder in Folders, or the list's own name, with the lines its row's
  // menu has ("Keep in folder…", "Take out of …"), so the move, its notice and its Undo are the one way (lib/folders.ts).
  const placeOf = (one: Item): React.ReactNode => {
    const section = SECTIONS.find((each) => each.id === (one.tier === 'question' ? 'questions' : tier === 'article' ? 'articles' : 'nuggets'))
    if (!section) return null
    const folder = folderById.get(folderOfItem[one.id] ?? '')
    const thing = { type: (one.tier === 'question' ? 'question' : tier === 'article' ? 'article' : 'nugget') as FolderKind, id: one.id }
    return (
      // The chip names the list ↓ ↑ step through: the folder on its own page, else Writing or Gems; where it is kept is said
      // in its menu (one chip naming a folder while stepping through all of Writing read as a contradiction, 20 Nov).
      <PlaceChip label={inFolder && folder ? folder.name : section.label} tip={folder ? `In ${folder.name}` : 'Keep in folder'}
        icon={inFolder && folder ? <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /> : <section.icon aria-hidden className="size-3.5 shrink-0" style={{ color: `var(--mf-icon-tint, var(--tt-color-text-${section.tint}))` }} />}
        items={[
          folder && !inFolder && { heading: `Kept in ${folder.name}` },
          { label: folder ? 'Move to another folder…' : 'Keep in folder…', run: () => askFolder([thing]) },
          folder && { label: `Take out of ${folder.name}`, hint: tier === 'article' ? 'Stays in Writing' : 'Stays in Gems', run: () => void keepIn([thing], null) }
        ]} />
    )
  }
  // A picked row carried onto a folder of Folders: every picked row goes with it, one notice and one Undo (split-drop.tsx).
  useEffect(() => {
    const onKeep = (event: Event): void => {
      const { folder, thing } = (event as CustomEvent<{ folder: { id: string; name: string }; thing: { type: FolderKind; id: string } }>).detail
      if (chosen.length < 2 || !chosen.includes(thing.id)) return
      event.preventDefault()
      void keepIn(chosen.map((id) => ({ type: thing.type, id })), folder).then(() => setChosen([]))
    }
    window.addEventListener('haligtree:keep-drop', onKeep)
    return () => window.removeEventListener('haligtree:keep-drop', onKeep)
  }, [chosen])
  // A row (or every picked row, it among them) carried onto one of this list's folders in the sidebar (split-drop.tsx).
  const moveIntoRef = useRef(folding.moveInto)
  moveIntoRef.current = folding.moveInto
  useEffect(() => {
    const onDrop = (event: Event): void => {
      const { group, ids } = (event as CustomEvent<{ group: string; ids: string[] }>).detail
      const many = ids.length === 1 && chosen.includes(ids[0]) ? chosen : ids
      if (moveIntoRef.current(group, many)) setChosen([])
    }
    window.addEventListener('haligtree:folder-drop', onDrop)
    return () => window.removeEventListener('haligtree:folder-drop', onDrop)
  }, [chosen])
  // A question is drawn as one, with its "?" mark, how long it has been held and its clues.
  // Writing, Gems and Questions list every one of their kind, filed or not (the user, 19 Nov: Gems is "a kind of
  // premium list of things already in my folders"): one in a folder says which, quietly, at the row's right edge,
  // unless Display's "Show folder" is off for this list.
  const placed = (entry: Entry, one: Item): Entry => {
    // On the folder's own page every row is in it: saying so on each row only repeats the page's name.
    const home = inFolder || view.folders === false ? undefined : folderById.get(folderOfItem[one.id] ?? '')
    return home ? { ...entry, end: <FolderCue home={home} /> } : entry
  }
  const sourced = (entry: Entry, one: Item): Entry => {
    const from = sourceSaid(one)
    return from ? { ...entry, sub: <span className="flex min-w-0 items-center gap-1.5"><span data-row-source className="min-w-0 max-w-[50%] shrink truncate">{from}</span>{entry.sub ? <><span aria-hidden>·</span><span className="min-w-0 truncate">{entry.sub}</span></> : null}</span> } : entry
  }
  const entryOf = (one: Item): Entry => placed(one.tier === 'question' ? questionEntry(one, inView.has(one.id), menuFor(one) as MenuItem[], backOn, questionsOnly && density === 'compact') : sourced(itemEntry(one, () => menuFor(one)), one), one)
  const entries: [string, Entry[]][] = !listShown && !(open && (pane === 'rail' || boarded)) ? [] : tiles || folder
    ? items.reduce<[string, Entry[]][]>((sections, one) => {
        const card = folders.get(one.id)
        // A folder: the group's own colour and icon, and its first notes small inside it.
        const entry = !card ? entryOf(one) : { ...itemEntry(card.items[0] ?? one), id: one.id, title: card.group.name, tags: [], menu: undefined, sub: plural(card.items.length, tier === 'nugget' ? 'gem' : 'page'), marks: undefined, private: false, wrap: false,
          folder: { icon: card.group.icon, color: card.group.color, count: card.items.length, members: card.items.slice(0, 4).map((item) => itemEntry(item)) } }
        // Grouped by kind or date, the folders first, then the loose tiles in their sections.
        const name = (!card && !folder && heads?.get(one.id)) || ''
        if (sections.at(-1)?.[0] === name) sections.at(-1)![1].push(entry)
        else sections.push([name, [entry]])
        return sections
      }, [])
    : groups.map(([name, list]) => [name, list.map(entryOf)] as [string, Entry[]])
  // Until the notes, your groups and your own order are read, the list and where a note sits in it are not known.
  const listUnread = unloaded(all) || unloaded(noteGroups) || unloaded(order) || (writing && unloaded(pinnedQuestions))
  return (
    // The list and the note open beside it come in together, once both are read (lib/reads-in.tsx); sent here for a note, the note never waits for the list.
    <ReadsIn className="contents">
      {/* Folded to a rail: by you, or by a board that needs the room. */}
      {open && (boarded ? !listOut : pane === 'rail') ? (
        <NoteRail entries={entries.flatMap(([, list]) => list)} cursor={cursor} selected={open.id} onPick={pickRow} onShow={() => (boarded ? setListOut(true) : setPane('list'))} />
      ) : (
      <Page aside={!!open || !!coming}
        // The count, Display's sort and the list come with the notes and your groups, together.
        waiting={listUnread || !listShown}
        // Sent here for one note: the note is on show at once, and the list comes in whole beside it once read.
        apart={sent}
        title={inFolder?.name ?? (tier === 'nugget' ? 'Gems' : questionsOnly ? 'Questions' : 'Writing')}
        // Questions' lists at the line's left before the count, the pill on the list's box edge and its words on the ink edge as Tasks' tabs (qa/list-edges.mjs).
        // Kept while rows are picked, so picking never moves the line.
        lead={givenLead ?? (questionsOnly && onAsk ? <div data-list-tabs className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}><QuestionTabs on={ask ?? 'open'} pick={(one) => (onAsk(one), setCursor(-1))} /></div> : undefined)}
        // Every note on show, a folded group's too.
        count={chosen.length || groups.reduce((sum, [, list]) => sum + list.length, 0)}
        search={spread && !chosen.length && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder={`Search in ${inFolder?.name ?? (tier === 'nugget' ? 'Gems' : 'Writing')}`} />}
        // What is picked always shows: the buttons may fold into ⋯ in a narrow window, the count never does.
        unit={chosen.length ? ['selected', 'selected'] : tier === 'nugget' ? ['gem', 'gems'] : questionsOnly ? (onAsk && ask === 'words' ? ['word', 'words'] : ['question', 'questions']) : ['page', 'pages']}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Act icon={ListTodo} label={chosen.length === 1 ? 'Make it a task' : `Make ${num(chosen.length)} tasks`} tip="A study task for each, linked to its note" onSelect={makeEach}>
                {chosen.length === 1 ? 'Make it a task' : `Make ${num(chosen.length)} tasks`}
              </Act>
              {/* The bar's ⌥-click reads them next; the folded menu says both. */}
              <Tip label="At the end of your reading queue; ⌥-click to read them next">
                <Button variant="ghost" size="default" onClick={(event) => void enqueue(chosen, event.altKey)}>Add to queue</Button>
              </Tip>
              <MenuRows><FoldItem icon={ListPlus} label="Add to the queue" onSelect={() => void enqueue(chosen, false)} /><FoldItem icon={ListStart} label="Read them next" onSelect={() => void enqueue(chosen, true)} /></MenuRows>
              <Act icon={Group} label="Group" tip="Group them here" keys="⌘G" onSelect={() => folding.groupNew(chosen)}>Group</Act>
              <Tip label="Keep them in a folder you pick or make  ⇧⌘M">
                <Button variant="ghost" size="default" onClick={(event) => keepInFolder(event.currentTarget)}>Keep in folder…</Button>
              </Tip>
              <MenuRows><FoldItem icon={FolderInput} label="Keep in folder…" keys="⇧⌘M" onSelect={() => keepInFolder(null)} /></MenuRows>
              {tier === 'nugget' && <Act variant="secondary" icon={FilePlus} label="Start a page" onSelect={startPage}>Start a page</Act>}
              <Act icon={Trash2} label="Move to the Bin" tip={`Into the Bin, where ${chosen.length === 1 ? 'it' : 'they'} can come back`} keys="⌫" onSelect={() => toBin(chosen)}>Move to the Bin</Act>
              {!allPicked && <Act group="select" icon={ListChecks} label="Select all" tip="Every note on show" keys="⌘A" onSelect={selectAll}>Select all</Act>}
              <Act group="select" icon={X} words={false} label="Clear the selection" keys="Esc" onSelect={() => (chime('off'), setChosen([]))} />
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs">
              {tier === 'nugget' && items.length > 1 && !spread && !open && (
                <>
                  <span className="hidden whitespace-nowrap @[48rem]/page:inline"><Pressed keys="X" /> to select</span>
                  <Act icon={Shuffle} label="Two at random" onSelect={() => void haligtree.random().then(setPair)}>Two at random</Act>
                </>
              )}
              {/* Imported notes left to sort, every group's: the pass through all of them. */}
              {tier === 'article' && unsorted.length > 0 && !open && (
                <Act variant="outline" icon={Inbox} label={`${num(unsorted.length)} to sort`} tip="Go through every imported note not yet sorted: keep, tag, move or bin each" data-sort-all={unsorted.length} onSelect={() => setSorting(unsorted)}>
                  <span aria-hidden className="size-1.5 rounded-full shrink-0 bg-[var(--tt-color-text-orange)]" /><span><Rolling text={unsorted.length} /> to sort</span>
                </Act>
              )}
              {/* One button, as wide for either word, so nothing beside it moves when the chip changes. */}
              {writing && (
                <>
                <MenuRows><FoldItem icon={Plus} label={questionsOnly ? 'New question' : 'New page'} onSelect={newWriting} /></MenuRows>
                <Button variant="ghost" size="default" data-new-writing={questionsOnly ? 'question' : 'article'} onClick={newWriting}>
                  <Plus className="size-3.5" />
                  <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
                    <span className={questionsOnly ? 'invisible' : undefined}>New page</span>
                    <span className={questionsOnly ? undefined : 'invisible'} aria-hidden={!questionsOnly}>New question</span>
                  </span>
                </Button>
                </>
              )}
              <Act group="go" icon={BookOpen} label="Read through" tip="One note at a time, full screen, from the highlighted one" keys="⇧⌘R" words={!open} onSelect={() => setReadFrom(startAt(items, open?.id, cursor))} disabled={!items.length}>
                <AliveIcon icon={BookIcon} size={14} />{!open && ' Read through'}
              </Act>
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
        <div data-kind-chips className="list-words pt-4 pb-2 empty:hidden">
          {said}
          {questionsOnly && onAsk && <QuestionsSaid on={ask} />}
          {opened && !folder && (
            // Finder's path bar: each part a way up to it (and a place to drop notes into), the last one where you are.
            <nav data-path-bar="" data-folder-open={opened.id} aria-label="Folder path" className="mb-2 flex min-w-0 items-center gap-0.5 text-body">
              {[null, ...path].map((one, at) => {
                const here = at === path.length
                return (
                  <Fragment key={one?.id ?? 'all'}>
                    {at > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />}
                    <Tip label={here ? '' : at === 0 ? 'Back to everything  ⌘[' : at === path.length - 1 ? `Up to ${one!.name}  ⌘↑` : `Up to ${one!.name}`}>
                    <button type="button" data-path-part={one?.id ?? ''} data-folder-back={at === 0 ? '' : undefined} aria-current={here ? 'page' : undefined} disabled={here}
                      // A note carried onto a part goes up to it (split-drop.tsx), lit while it is over it, as a sidebar folder is.
                      data-folder-drop={here ? undefined : one?.id ?? TOP} data-folder-list={tier}
                      onClick={() => (chime('tuck'), onFolder?.(one?.id ?? null))}
                      // The way back to everything is never cut short ("Wr…"): the places under it give way first.
                      className={`flex ${at === 0 ? 'shrink-0' : 'min-w-0'} items-center gap-1.5 rounded-md px-1.5 py-0.5 ${here ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}>
                      {one && <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />}
                      <span className="truncate">{one ? one.name : tier === 'nugget' ? 'Gems' : 'Writing'}</span>
                    </button>
                    </Tip>
                  </Fragment>
                )
              })}
            </nav>
          )}
          {/* What a folder is, said as a group's rule is: the two told apart by their first line. */}
          {opened && !folder && <p data-folder-said className="-mt-1 mb-2 text-body text-foreground/90"><strong className="font-semibold">A folder:</strong> the one place these notes live. Drag a note in to move it here.</p>}
          {folder && (
            <Tip label="Back out of the folder  ⌘[">
            <button type="button" data-folder-back="" onClick={() => (chime('tuck'), setInGroup(null))}
              className="mb-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" />
              <span className="font-medium text-foreground">{folder.name}</span>
            </button>
            </Tip>
          )}
          {chips}
        </div>
        {/* A folded group shows as its heading even when nothing loose is left, so the list is not empty then.
            Until your groups are read too, nothing: the notes alone would flash as a plain list first. */}
        {unloaded(noteGroups) || !listShown ? null : folderEmpty && !query.trim() ? (
          // An empty folder, opened: the page's own quiet state under its path bar, on the same left edge as it
          // and as every other page's empty block; the folder's own icon for its picture, the button named as the toolbar's.
          <Empty title={`Nothing in ${opened!.name} yet`} arrow={false}
              art={<div data-empty-art="" aria-hidden className="mb-3 flex size-14 items-center">{opened!.icon && !opened!.icon.startsWith('kind:') ? <span className="text-[3.25rem] leading-none">{opened!.icon}</span> : <GroupIcon icon={opened!.icon} color={opened!.color} className="size-14" />}</div>}
              action={<Button variant="secondary" size="sm" data-folder-new-note="" onClick={() => void noteGroupsApi.note(opened!.id).then((id) => id && (chime('promote'), pick(id)))}><Plus className="size-3.5" />{tier === 'nugget' ? 'New gem' : 'New page'}</Button>}>
              Drag notes here, or start one.
            </Empty>
        ) : items.length || (folding.rows && noteGroups.some((one) => one.members.some((id) => all.some((item) => item.id === id && !item.archivedAt)))) ? (
          <SectionHeads.Provider value={sourceHeads}>
          {/* The menu's trigger is the list's own space: round the context's provider, which draws nothing, a right
              click on the empty space found nothing to open on. */}
          <RowMenu list items={listMenu}>
          <div data-list-space="" className="min-h-full pb-24">
          <NoteList groups={entries} density={density} table="nuggets" selected={spread ? peek ?? undefined : coming ?? open?.id} cursor={cursor} onCursor={setCursor} chosen={chosen}
            onPick={spread ? (id) => (isGroup(id) ? pick(id) : (setPeek(id), setCursor(items.findIndex((one) => one.id === id)))) : pickRow} onOpen={spread ? pickRow : undefined}
            picking={picking} onMove={view.sort === 'manual' ? onMove : undefined} after={glossAfter} columns={questionsOnly && density === 'compact'} className={spread ? 'list-edge my-3' : 'list-edge my-2'}
            folds={folding.rows ? { ...folding.folds(menuFor, entryOf), onNewNote: pick, onSort: setSorting, onSorted: markSorted, onOpenFolder: onFolder ?? undefined, parts: underHeads,
              // Already in your own order, under headings: a row moves among the rows under its own.
              ...(view.sort === 'manual' && heads ? { hint: { name: 'grouped-drag', said: 'Drag a row to move it among the rows under its heading. Hold it on another row to make a group.' } } : {}) } : undefined} />
          </div>
          </RowMenu>
          </SectionHeads.Provider>
        ) : questionsOnly && !unloaded(all) && !all.length ? (
          // No questions yet: the page as it will look, as every other list shows itself.
          // Words has its own: a word with its meaning, kept from Looked up, not a question.
          <Example tryIt={ask === 'words' ? 'open “Looked up”, right-click a word with its meaning and choose “Turn it into”, then “Save as a gem”. It is kept here and comes back in Review.' : 'press H on a note in your Inbox, or “New question” above. It is held here, gathering dated clues until you know.'}>
            <NoteList groups={[['', ask === 'words' ? exampleWords().map((one) => itemEntry(one)) : exampleQuestions().filter((one) => (ask === 'answered' ? !!one.closedAt : !one.closedAt)).map((one) => questionEntry(one, false, undefined, true, density === 'compact'))]]} density={density} table="nuggets" cursor={-1} onPick={() => undefined} columns={density === 'compact'} className="list-edge my-2" />
          </Example>
        ) : all.length && query.trim() ? (
          <Empty title="Nothing matches">No title here has those words. Escape clears the search.</Empty>
        ) : unloaded(all) ? null : inFolder && inFolder.id !== 'unfiled' ? (
          // A folder of your own shows only what is yours: never made-up pages in a real folder (the user, 24 Nov: "where
          // are the things?"). What Start fresh put away here is said, with the way back.
          <PutAwayHere folder={inFolder.id} />
        ) : (
          // Nothing on show (none kept yet, or only archived ones): the page as it will look, with a few made-up ones.
          // One empty page either way: a second one, laid out apart, showed for a moment before this one.
          <Example tryIt={`${tier === 'nugget' ? 'pick a note in your Inbox list and press P. It lands here, ready to come back to you.' : 'press “New page” above, or pick a few gems with X and choose “Start a page”.'} ${LIFECYCLE}`}>
            <NoteList groups={[['', (tier === 'nugget' ? exampleIdeas() : exampleWriting()).map((one) => itemEntry(one))]]} density={density} table="nuggets" cursor={-1} onPick={() => undefined} className="list-edge my-2" />
          </Example>
        )}
      </Page>
      )}
      {peeked && <Peek entry={itemEntry(peeked)} table="nuggets" onOpen={() => pick(peeked.id)} />}
      {sorting && (
        <ReadThrough items={sorting.map((id) => ({ type: typeOf(id), id }))} sorting onClose={() => setSorting(null)} />
      )}
      {readFrom !== null && (
        <ReadThrough
          items={items.filter((one) => !isGroup(one.id)).map((one) => ({ type: one.tier, id: one.id }))}
          start={readFrom}
          onClose={() => setReadFrom(null)}
          onEdit={(_, id) => {
            setReadFrom(null)
            pick(id)
          }}
        />
      )}
      {coming && coming !== open?.id ? <NoteComing id={coming} title={all.find((one) => one.id === coming)?.title} /> : open && <ShowInListContext.Provider value={showOpen}><Apart type={open.tier} id={open.id} title={open.title} hidden={!!open.private} onBack={() => haligtree.item(open.id).then((fresh) => fresh && setOpen(fresh))}><ItemDetail top={<div data-head-left className="flex min-w-0 items-center gap-2">{placeOf(open)}<ReadsIn apart reading={listUnread} className="contents" data-apart="stepper"><Stepper turns at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => ((stepped.current = true), pick(items[to].id))} /></ReadsIn></div>} key={open.id} item={open} board={{ onShown: setBoarded, list: listOut, onList: setListOut }} onOpen={(type, id) => ((questionsOnly ? type === 'question' : type === tier) ? pick(id) : onOpen?.(type, id))} /></Apart></ShowInListContext.Provider>}
    </ReadsIn>
  )
}

/** The open nugget, article or question, wherever it is opened: a question is drawn its own way. */
/** What a nugget or an article offers besides opening and pinning: its row menu and its note's dots share it. */
const itemMenu = (item: Item): (MenuItem | { label: string; items: RowItem[] })[] => [
  { label: item.private ? 'Make it not private' : 'Make it private', run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('nugget', item.id) },
  { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openApart(item.tier, item.id) },
  ...(smallHolds(item.tier) ? [{ label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall(item.tier, item.id) }] : []),
  // A Word kept as a gem is one word and its meaning, as in the Inbox: nothing to read through or queue up.
  item.kind !== 'word' && { label: 'Read', hint: 'Read it through, its links open in place', run: () => openRead(`${item.tier}:${item.id}`) },
  ...openItems(item.tier, item.id),
  item.kind !== 'word' && queueMenu(item.id),
  'separator',
  item.tier === 'nugget' && { label: 'Change kind…', run: () => void changeKind('nuggets', item.id, item.kind) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', hint: item.archivedAt ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  // Taking it elsewhere, together, so the menu stays short.
  { label: 'Export', items: [
    { label: 'Save attachments…', hint: 'Its pictures and files, to a folder', run: () => void saveAttachments([{ table: 'nuggets', id: item.id }]) },
    { label: 'Publish as a website…', hint: 'With the notes it links to, as web pages', run: () => void publishSite(item.id) },
    { label: 'Copy title', run: () => copy(item.title) },
    ...pictureItems(`item-${item.id}`, item.title),
    // A gem as a card to post: its words, who said them and where.
    ...(item.tier === 'nugget' ? [cardItem({ ...item, body: () => haligtree.item(item.id).then((one) => one?.body) })] : [])
  ] }
]

/** A gem's or a piece of writing's own row menu, for a list that is not its page (a tag page): the same lines its page gives one row. */
export const gemMenu = (item: Item, open: () => void): RowItem[] => [
  { label: 'Open', keys: '↵', run: open },
  'separator',
  { label: item.pinnedAt ? 'Remove from Favorites' : 'Add to Favorites', run: () => pin('nuggets', item.id, !item.pinnedAt) },
  { label: 'Keep in folder…', run: () => askFolder([{ type: item.tier === 'question' ? 'question' : item.tier === 'article' ? 'article' : 'nugget', id: item.id }]) },
  moveToBookItem([{ table: 'nuggets', id: item.id }], [{ type: item.tier === 'question' ? 'question' : item.tier === 'article' ? 'article' : 'nugget', id: item.id }]),
  ...itemMenu(item),
  'separator',
  copyLinkItem(`${item.tier}:${item.id}`, item.title),
  { label: 'Copy title', run: () => copy(item.title) },
  'separator',
  binItem([{ type: item.tier, id: item.id }])
]

/** Where a page shown as a board is: told whether it shows, and whether the list beside it is out. */
type BoardPlace = { onShown: (shown: boolean) => void; list: boolean; onList: (out: boolean) => void }

export function ItemDetail(props: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode; back?: React.ReactNode; board?: BoardPlace }): React.JSX.Element {
  return props.item.tier === 'question' ? <QuestionDetail {...props} /> : <NuggetDetail {...props} />
}

/** The open nugget or article: its words, its glosses, and down the right how it comes back. */
function NuggetDetail({ item, onOpen, top, back, board: place }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode; back?: React.ReactNode; board?: BoardPlace }): React.JSX.Element {
  // What is around its words (who links to it, its map, the notes like it) comes the frame after them.
  const later = useAfterFirstPaint()
  // A card whose words start with its who (a deck's "Artist?" card answers "Max Ernst") does not say the name again in the margin; "Open Max Ernst's page" stays under it.
  const leadIsWho = typeof item.body === 'string' && !!item.attribution?.trim() && item.body.split('\n').find((line) => line.trim())?.trim() === item.attribution.trim()
  const [prompt, setPrompt] = useState(item.prompt ?? '')
  // Who said it, as typed: saved as the field is left.
  const [source, setSource] = useState(item.attribution ?? '')
  useEffect(() => setSource(item.attribution ?? ''), [item.id, item.attribution])
  const [where, setWhere] = useState(item.medium ?? '')
  useEffect(() => setWhere(item.medium ?? ''), [item.id, item.medium])
  // Each source row is a link until its pencil turns it into its field.
  const [editingWho, setEditingWho] = useState(false)
  const [editingWhere, setEditingWhere] = useState(false)
  useEffect(() => (setEditingWho(false), setEditingWhere(false)), [item.id])
  // Esc leaves a source field as it was: its blur then saves nothing.
  const escaped = useRef(false)
  const leaveOnKeys = (revert: () => void) => (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') return void event.currentTarget.blur()
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    escaped.current = true
    revert()
    event.currentTarget.blur()
  }
  // The page of a PDF its words were kept from: the link in its body is the one truth of which page.
  const pdf = useMemo(() => pdfIn(item.body), [item.body])
  const glossWords = item.glosses.filter((one) => one.author === 'user').reduce((sum, one) => sum + one.body.split(/\s+/).filter(Boolean).length, 0)
  const editor = useRef<Editor | null>(null)
  // A page's margin: who it names, read again a moment after the typing stops, and only when that changed.
  const [named, setNamed] = useState<string[]>([])
  const naming = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(naming.current), [])
  const readNames = (instance: Editor, wait = 600): void => {
    if (item.tier !== 'article') return
    clearTimeout(naming.current)
    naming.current = setTimeout(() => setNamed((was) => {
      const next = namesIn(instance.state.doc, item.attribution)
      return next.join('\n') === was.join('\n') ? was : next
    }), wait)
  }
  // The words as opened or last saved, to tell a real edit from the editor settling.
  const seen = useRef<{ body: string; line: string } | null>(null)
  // An earlier version, shown in place of the editor while you look back; and
  // the words read again after one is restored, with a new key so the editor
  // opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  // Its words put in whole by the book (two notes joined, and that taken back): read again with a new key, its name
  // and the one loader in their place meanwhile (note-coming.tsx).
  const [rereading, setRereading] = useState(false)
  const reread = (id: string): void => {
    setRereading(true)
    void readAgain(haligtree.item(id), (fresh) => (setRestored((was) => ({ body: fresh ? fresh.body : (was ? was.body : item.body), rev: (was?.rev ?? 0) + 1 })), setRereading(false)))
  }
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('nuggets', item.id, restored ? restored.body : item.body, (id, words, wordsBase) => haligtree.saveItem(id, { words, wordsBase }), reread)
  useOpenNote({ table: 'nuggets', type: item.tier, id: item.id, kind: item.kind, archived: !!item.archivedAt })
  // Its words seen as a board, in their place, as an Inbox note can be (board-view.tsx).
  const [ready, setReady] = useState<Editor | null>(null)
  // A note opens at its top, not at the last note's scroll: the scroller outlives the note in it. Its own kept place, or Back's, is put back after this.
  useLayoutEffect(() => {
    const box = ready?.view.dom.parentElement
    if (box) box.scrollTop = 0
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const board = useBoard('nuggets', item.id, ready, item.fields)
  // A piece of Writing can be written in the writing room: only its title and words, over the whole window.
  const room = useWritingRoom(item.tier === 'article' ? ready : null)
  useWritingSound(ready, room.on)
  const settings = useLive(haligtree.settings, null as Settings | null)
  const boardShown = board.on && !past && !!ready && !ready.isDestroyed
  // The board needs the room: the details step aside while it shows, a click away.
  const [propsOut, setPropsOut] = useState(false)
  // Named by its first line until given a title of its own (`line` is set only then).
  const titled = item.line === null || (item.line === undefined && !!item.title && item.title.trim() !== 'Untitled')
  // What it is called: its title, or with none its first line, or "New note" while empty.
  const name = titled ? item.title : item.line || 'New note'
  const [titling, setTitling] = useState(false)
  const [tools, setTools] = useState<HTMLElement | null>(null)
  useEffect(() => setPropsOut(false), [boardShown])
  // The page's name over the board, not its first heading, which the hidden page reports.
  const onBoard = useRef(false)
  onBoard.current = boardShown
  useEffect(() => {
    if (!boardShown || item.private) return
    showTopTitle(name)
    return () => showTopTitle(null)
  }, [boardShown, name, item.private])
  const onShown = place?.onShown
  useEffect(() => {
    onShown?.(boardShown)
    return () => onShown?.(false)
  }, [boardShown, onShown])
  // A cloze: the words you selected, blanked. Two keystrokes and no writing,
  // the cheapest way to make something testable, and right for a name or a
  // number; anything with a "because" in it is better as a question.
  // Picked again with a blank already there, it is one more blank on the same
  // card; a number keeps its unit outside, an "a" or "an" goes in, and an
  // item of a list says what blanking it teaches (lib/blanks.ts).
  const [blankNotes, setBlankNotes] = useState<string[]>([])
  const cloze = (): void => {
    const view = editor.current
    const { from, to } = view?.state.selection ?? { from: 0, to: 0 }
    const words = view?.state.doc.textBetween(from, to).trim()
    if (!view || !words) return refuse('Select the words to blank out first')
    const body = view.getText()
    const had = prompt.includes(BLANK) ? prompt : null
    const made = addBlank(had ?? body, words)
    if (!made) return refuse(had ? 'Those words are already blanked, or the question no longer has them' : 'Select the words to blank out first')
    // The question it had before, back with Undo: a blank never costs the old one.
    const before = item.prompt ?? null
    const list = listItemCount(body, words)
    // One line per blank, naming it, so a second blank's note never hides the first's.
    const said = [
      made.unit ? `the number is blanked and ${quoted(made.unit, 80)} stays showing as the cue` : '',
      made.article ? `${quoted(made.article, 80)} went inside the blank, as it would give the answer away` : '',
      list ? `it is one item of a list of ${list}: blanked one at a time, items teach their place in the list, not the idea, so ask for the whole list, or why each belongs` : ''
    ].filter(Boolean)
    const note = said.length ? `${quoted(made.blanked, 80)}: ${said.join('; ')}.` : ''
    const notesBefore = blankNotes
    setBlankNotes((was) => [...(had ? was : []), ...(note ? [note] : [])])
    setPrompt(made.prompt)
    sayNow(haligtree.saveItem(item.id, { prompt: made.prompt }), had ? 'One more blank on this card' : 'A fill-in-the-blank card: Review will ask it', () => (setPrompt(before ?? ''), setBlankNotes(notesBefore), void haligtree.saveItem(item.id, { prompt: before })))
  }
  const savePrompt = (): void => {
    if ((item.prompt ?? '') === prompt.trim()) return
    const before = item.prompt ?? null
    // Anki's blanks typed with two or more numbers: a card for each number, as Anki makes them.
    const numbers = clozeNumbers(prompt)
    if (numbers.length > 1 && editor.current) {
      const typed = prompt.trim()
      void cardPerNumber(item.id, typed, editor.current.getText(), editor.current.getJSON()).then((split) => {
        if (!split) return
        setPrompt(split.prompt)
        sayNow(haligtree.saveItem(item.id, { prompt: split.prompt }), `${numbers.map((n) => `c${n}`).join(', ')}: ${num(numbers.length)} cards, one for each number`, () => {
          for (const one of split.made) void haligtree.unlift('nugget', one)
          setPrompt(before ?? '')
          void haligtree.saveItem(item.id, { prompt: before })
        })
      })
      return
    }
    void haligtree.saveItem(item.id, { prompt: prompt.trim() || null }).then(() =>
      toast(prompt.trim() ? 'Now tested: it will come up in review' : 'Back to coming up on its own', () => (setPrompt(before ?? ''), void haligtree.saveItem(item.id, { prompt: before })))
    )
  }

  return (
    <div data-open={item.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[16rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div data-voice={voiceOf({ type: item.tier, kind: item.kind, attribution: item.attribution, medium: item.medium, label: name })} data-voice-edge {...room.room} className={`flex min-h-0 min-w-0 flex-1 flex-col pt-6 ${boardShown ? '!min-h-full' : ''}`}>
        <NoteHeader className="-mt-3 mb-1" left={top} back={back} type={item.tier} table="nuggets" id={item.id} copyKey={noteLinkText(`${item.tier}:${item.id}`, name)} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
          onRestored={() => void haligtree.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))}
          edited={item.updatedAt} captured={item.createdAt} made={item.tier === 'article' ? 'Started' : 'Saved'}
          pinned={!!item.pinnedAt} onPin={() => pin('nuggets', item.id, !item.pinnedAt)}
          board={board} details={!boardShown} tools={boardShown ? <span ref={setTools} className="contents" /> : undefined} size={past ? undefined : <NoteSize editor={ready} />}
          menu={[
            ...(boardShown ? [
              ...(place ? [{ label: place.list ? 'Hide the list' : 'Show the list', run: () => (chime('tap'), place.onList(!place.list)) }] : []),
              { label: propsOut ? 'Hide details' : 'Show details', run: () => (chime('tap'), setPropsOut(!propsOut)) },
              'separator' as const
            ] : []),
            ...(item.tier === 'article' && !titled && !titling ? [{ label: 'Give it a title', run: () => setTitling(true) }] : []),
            ...(item.tier === 'article' && !boardShown ? [{ label: room.on ? 'Leave the writing room' : 'Writing room', keys: '⇧⌘↵', run: room.toggle }, { label: 'Writing tools', items: writerMenu(ready, (text) => toast(text, undefined, 'info')) }, 'separator' as const] : []),
            // Proofread when asked, on any page; a piece of Writing has it in its writer's lines above.
            ...(item.tier !== 'article' ? [{ label: 'Proofread', hint: 'Spelling, grammar and style, one at a time', run: askProofread }] : []),
            // Where it lives: the one folder picker, beside this menu's button.
            { label: 'Keep in folder…', run: () => askFolder([{ type: item.tier === 'question' ? 'question' : item.tier === 'article' ? 'article' : 'nugget', id: item.id }]) },
            moveToBookItem([{ table: 'nuggets', id: item.id }], [{ type: item.tier === 'question' ? 'question' : item.tier === 'article' ? 'article' : 'nugget', id: item.id }]),
            ...itemMenu(item),
            // Housekeeping last, as on every card's menu.
            'separator', binItem([{ type: item.tier, id: item.id }])
          ]} />
        {room.on && <RoomFoot editor={ready} title={name} proof={item.tier === 'article'} />}
        {/* Any page can be proofread when asked; only Writing offers checking as you write. */}
        <Proofread editor={ready} ask={item.tier !== 'article'} />
        {item.tier === 'article' && (titled || titling) && (
          // As in Apple Notes, a page is named by its first line; a title of its own is shown
          // only once given ("Give it a title" in the page's menu). Cleared, the first line names it again.
          // Wraps as a heading does, so a long title is never cut off at the edge; Enter ends it.
          // Over a board, on the board's own left edge (board-view.tsx's lists and its head), not the reading column's.
          <div className={`${boardShown ? 'px-3 @[40rem]/page:px-6' : 'note-column'} mb-2 shrink-0`}>
          <PlainField
            line
            data-page-title
            label="Title"
            className="block w-full font-heading text-title font-semibold tracking-[-0.018em] text-balance"
            value={titled ? item.title : ''}
            onKey={(event) => event.key === 'Escape' && (event.preventDefault(), (event.target as HTMLElement).blur())}
            autoFocus={titling}
            placeholder={item.line || 'New note'}
            onLeave={() => setTitling(false)}
            onSave={(title) => void (title !== (titled ? item.title : '') && haligtree.saveItem(item.id, { title }))}
          />
          </div>
        )}
        {/* A shared deck's card opened from its gallery or Media: its question first, as Review asks it (the painting, "Artist?"), then its answer. */}
        {item.tier === 'deck' && /!\[[^\]]*\]\([^)]+\)/.test(item.prompt ?? '') && (
          <div data-deck-question className="note-column mb-4 grid shrink-0 justify-items-start gap-2">
            <p className="text-body font-medium text-foreground">{(item.prompt ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()}</p>
            {[...(item.prompt ?? '').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((one) => (
              <img key={one[1]} src={one[1]} alt="" className="max-h-[55vh] w-auto max-w-full rounded-lg" />
            ))}
          </div>
        )}
        {past ? (
          <HaligtreeEditor
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
        ) : rereading ? <NoteWaiting title={name} /> : (
        <div className={boardShown ? 'hidden' : 'contents'} spellCheck={item.tier === 'article' && settings?.spellWriting === false ? false : undefined}>
        <HaligtreeEditor
          key={restored?.rev ?? 0}
          backToTop
          // A new page with no name starts in its words: its first line is its name.
          {...(item.tier === 'article' && !titled && !item.line ? { autofocus: 'start' as const } : {})}
          // A tag opens its page: everything carrying it.
          {...notePowers({ table: 'nuggets', id: item.id, kind: item.kind, fields: item.fields, text: name, titled: item.tier === 'article', created: item.createdAt, updated: item.updatedAt, origin: { captureId: item.captureId ?? undefined, attribution: item.attribution, from: item.id }, cites: leadIsWho ? undefined : { who: item.attribution, where: item.medium }, onOpen: (type, id) => onOpen?.(type, id) })}
          // Its first line gone under the bar, the bar names the page as its tab does: by its own title when it has one
          // (an imported page's file name), never by a first heading that says something else.
          onTitleOut={(line) => !onBoard.current && showTopTitle(line && (titled ? item.title : line))}
          defaultContent={((restored ? restored.body : item.body) as JSONContent | string | null) ?? ''}
          onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
          after={<ReadsIn apart reading={!later} data-apart="foot">
            {/* What sits under the words (its source, what links here) comes in whole, once its reads are in: a part arriving a beat late moved the foot from the page's bottom up under the words. */}
            {/* A quote signed at its foot: who said it, in a pen's hand. */}
            {item.kind === 'quote' && item.attribution && (
              <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem] text-control text-muted-foreground">
                {/* Signed, and changed from the signature: a click goes to “Who said it” beside the page. */}
                <Tip label="Change who said it">
                  <button type="button" data-signed-edit className="rounded hover:bg-accent" onClick={() => focusField(() => sourceField(document, 'source', '[data-gem-source]'))}>
                    <span {...hoverNote('person', item.attribution)}><Signed who={item.attribution} where={item.medium} year={fieldOf(item.fields, 'year')} className="private-text" /></span>
                  </button>
                </Tip>
              </div>
            )}
            {/* Its source's facts (who said it, the page) in one quiet place, under the quote; the links to their pages
                wait in the foot with what links here (17 Nov: "footer information placed where the body should be"). */}
            <SourceFoot part="facts" who={item.attribution} where={item.medium} quote={item.kind === 'quote'} gem={item.tier === 'nugget'} cite={{ table: 'nuggets', id: item.id, fields: item.fields }} />
            {/* Where your own words go: with nothing under the quote yet, a line ready to type in, in the note's own type. */}
            {item.tier === 'nugget' && <WriteOn editor={ready} />}
            {/* No question yet: the way into Review, said once under the words. */}
            {/* Offered on the day it was kept only: after that, it is not asked again. */}
            {item.tier === 'nugget' && !prompt && !item.supersededBy && recallOffered(item.createdAt) && (
              <AskLine onAsk={(question) => {
                setPrompt(question)
                chime('promote')
                void haligtree.saveItem(item.id, { prompt: question }).then(() =>
                  toast('In Review now: it comes back as a new card', () => (setPrompt(''), void haligtree.saveItem(item.id, { prompt: null }))))
              }} />
            )}
            {/* A card written as a line of a note: the way back to that line, as Review's "Open it at the line" (R). */}
            {item.lineOf && (
              <div data-card-line-from className="note-column mt-3 flex items-center gap-2 text-body text-muted-foreground">
                <span className="whitespace-nowrap text-foreground">A line of a note, written as a card</span>
                <button type="button" data-card-line-open onClick={() => openLine(item.lineOf!, item.prompt)}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-control font-medium text-(--mf-muted-strong) transition-colors duration-80 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]">
                  Open it at the line
                </button>
              </div>
            )}
            {/* A gem that is also tested says so, under its words; a study card (made while reading) is in Review only. One click either way. */}
            {item.prompt && canMoveTier(item) && (
              <div data-gem-or-card={item.tier} className="note-column mt-3 flex items-center gap-2 text-body text-muted-foreground">
                <span className="whitespace-nowrap text-foreground">{item.tier === 'card' ? 'A study card: in Review only' : 'Also in Review'}</span>
                {/* A small button, sized to its words: never a field-wide bar, which reads as something to type in. */}
                <Tip label={item.tier === 'card' ? 'In Gems, the Feed and Home too, and still in Review' : 'In Review only: out of Gems, the Feed and Home'}>
                  <button type="button" data-gem-or-card-switch onClick={() => moveTier(item.id, item.tier === 'card' ? 'nugget' : 'card')}
                    className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-control font-medium text-(--mf-muted-strong) transition-colors duration-80 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]">
                    {item.tier === 'card' ? 'Keep as a gem' : 'Study only'}
                  </button>
                </Tip>
              </div>
            )}
            <PageThoughts id={item.id} />
            {later && <Mentions id={item.id} editor={ready} onOpen={onOpen} />}
            {/* The foot: everything by them and from that work, after what links here (one rule over both). */}
            <div data-chrome data-source-foot className="page-narrow mx-auto mt-10 mb-6 w-full border-t px-[4rem] pt-2 empty:hidden [[data-mentions]+&]:-mt-4 [[data-mentions]+&]:border-t-0 [[data-mentions]+&]:pt-0">
              <SourceFoot part="links" who={item.attribution} where={item.medium} />
            </div>
          </ReadsIn>}
          foot={(instance) => <WordCount editor={instance} whole={false} />}
          onReady={(instance) => {
            editor.current = instance
            setReady(instance)
            readNames(instance, 0)
            seen.current = { body: JSON.stringify(instance.getJSON()), line: firstLineOf(instance.state.doc)?.text ?? '' }
            words.ready(instance)
          }}
          onChange={(body, instance) => {
            editor.current = instance
            readNames(instance)
            // The editor can tidy a document as it opens (a list first, say);
            // that is not an edit, and saving it once wiped a nugget's title.
            // Its first line as kept: an open "/" search on it is not yet words of the note (keptDoc).
            const now = { body: JSON.stringify(body), line: firstLineOf(keptDoc(instance.state))?.text ?? '' }
            if (now.body === seen.current?.body) return
            // Named for its first line with words, and only when that line
            // changed: a blank one, or one the title never came from, keeps it.
            const title = item.tier === 'nugget' && now.line && now.line !== seen.current?.line ? now.line : undefined
            seen.current = now
            words.save(body, instance)
            if (title) void haligtree.saveItem(item.id, { title })
          }}
        />
        </div>
        )}
        {boardShown && <Board key={`${item.id}-${restored?.rev ?? 0}`} editor={ready} id={item.id} tools={tools} />}
        {/* A thought on it, pinned under the page, its earlier ones a click away. */}
        {/* From the first frame: its height is the same whatever it holds, and coming a frame late it pushed the page up. */}
        <ThoughtDock id={item.id} hidden={boardShown} />
      </div>

      {/* Written from a folder: what it keeps beside the page to quote from, while its details are put away. */}
      {item.tier === 'article' && !boardShown && <FolderMargin beside id={item.id} editor={() => editor.current} />}
      {(!boardShown || propsOut) && <Props fold={!boardShown}>
        {/* The note's properties head its details, as Linear's issues have them. */}
        <PropertyStrip panel table="nuggets" id={item.id} kind={item.kind} fields={item.fields} text={item.title} created={item.createdAt} updated={item.updatedAt} sourced={!!(item.attribution?.trim() || item.medium?.trim())} cited={!!item.medium?.trim()} />
        {item.tier === 'article' && <Marginalia id={item.id} names={named} editor={() => editor.current} />}
        {/* Written from a folder: what it keeps, to quote from (main/folder-gems.ts). */}
        {item.tier === 'article' && <FolderMargin id={item.id} editor={() => editor.current} />}
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
              void haligtree.saveItem(item.id, id === 'off' ? { suspended: true } : { suspended: false, ...(id === 'tested' ? {} : { mode: id }) })
                .then(() => (chime(id === 'off' ? 'off' : 'on'), toast(said[id], () => void haligtree.saveItem(item.id, back))))
            }} />
          {/* "Less of this" (the Feed's, or a hint's thumbs down) said in words, with the way back. */}
          <FadedLine type="nugget" id={item.id} className="px-2 pb-1" />
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
            <div><Prop icon={SquareDashed} onClick={cloze}>{prompt.includes(BLANK) ? 'Blank more of the selected words' : 'Blank the selected words'}</Prop></div>
          </Tip>
          {prompt.includes(BLANK) && editor.current && (
            <BlankPanel key={prompt} id={item.id} prompt={prompt} text={editor.current.getText()} body={editor.current.getJSON()} notes={blankNotes}
              onPrompt={(next) => (setPrompt(next), void haligtree.saveItem(item.id, { prompt: next }))} />
          )}
          {item.dueAt && <Prop icon={Calendar}>Next review {whenInLine(item.dueAt, false)}</Prop>}
          {!!item.reviewed && <div className="px-2 py-1.5 text-muted-foreground"><ReviewHistory id={item.id} /></div>}
          {item.lapses >= 4 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-orange)]">
              <Typed text={`Forgotten ${item.lapses} times. That is usually the question, not you: try rewriting it.`} step={28} />
            </p>
          )}
        </Island>

        <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void haligtree.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private' : 'Not private'}
          </Prop>
          <Prop icon={Pin} active={!!item.pinnedAt} onClick={() => pin('nuggets', item.id, !item.pinnedAt)}>
            {item.pinnedAt ? 'In Favorites, in the sidebar and quick capture' : 'Add to Favorites, in the sidebar and quick capture'}
          </Prop>
          <RemindMe table="nuggets" id={item.id} at={item.remindAt} />
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)} tip={item.archivedAt ? 'Bring it back' : 'Kept, out of sight'}>
            {item.archivedAt ? 'Unarchive' : 'Archive'}
          </Prop>
        </Island>

        {item.tier === 'nugget' ? (
          <>
            {/* One field for what used to be Context and Why: people could not tell them apart. */}
            <Island compact title="Behind the answer" filled={!!behindOf(item)}>
              <Does does="The picture, the bigger story, why it is so. Shown after the answer in Review" set={!!behindOf(item)}>
              <ContextField id={item.id} value={behindOf(item) || null} className={`resize-none text-control ${GHOST}`} />
              </Does>
            </Island>
            <Island compact title="Grow it">
              {/* Two hundred words of your own beside it is an article written
                  without noticing: said, never automated. */}
              {glossWords >= 200 && (
                <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-purple)]">
                  Your thoughts on this gem run to {num(glossWords)} words: that is a page already. Start one and they come with it.
                </p>
              )}
              <Prop icon={Plus} onClick={() => void haligtree.article([item.id]).then((id) => { chime('promote'); toast('A page, from this gem'); onOpen?.('article', id) })}>
                Start a page
              </Prop>
              <StudyThis item={item} />
            </Island>
          </>
        ) : null}
        {later && <Lineage id={item.id} onOpen={onOpen} />}
        {later && <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />}
        {later && pdf && <SameBook pdf={pdf} here={item.id} title={bookOf(item.medium)} />}
        {later && <SimilarNotes id={item.id} onOpen={onOpen} />}
        {later && <RecentIsland id={item.id} onOpen={onOpen} />}
        <Island compact title="Wrong?">
          {item.supersededBy ? (
            <Prop icon={TriangleAlert}>Replaced: out of Review, kept beside what is true</Prop>
          ) : (
            <Supersede item={item} />
          )}
        </Island>
        <Island compact title="Where it came from" filled={!!(item.attribution?.trim() || item.medium?.trim() || pdf)}>
          {/* Who said it opens their page in Sources; the pencil turns it into its field. */}
          <SourceRow icon={Quote} name="source" editing={editingWho} setEditing={setEditingWho}
            label={item.attribution?.trim() ?? ''} tip="Open their page in Sources"
            open={() => (chime('page'), openSource('attribution', item.attribution ?? ''))}>
            {/* Asked the way its kind asks it (Who said it, Who made it), with the names used before offered. */}
            <Remembered key={`w${item.id}`} field="attribution" value={source} data-gem-source autoFocus={editingWho}
              placeholder={asksFor(item.kind as CaptureType, item.title).who ?? 'Who, or where from'}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
              onChange={setSource}
              onKeyDown={leaveOnKeys(() => setSource(item.attribution ?? ''))}
              onBlur={() => {
                setEditingWho(false)
                if (escaped.current) return void (escaped.current = false)
                const next = source.trim() || null
                if (!next && item.kind === 'quote' && item.attribution?.trim()) return askClearWho(item.attribution.trim(), () => haligtree.saveItem(item.id, { attribution: null }), () => setSource(item.attribution ?? ''))
                if (next !== (item.attribution ?? null)) void haligtree.saveItem(item.id, { attribution: next }).then(() => chime('noted')) }} />
          </SourceRow>
          {/* Where it came from (a book, a site): a PDF opens at its page (⌥ beside this one), with its pages previewed on hover; any other source opens its page in Sources. */}
          <SourceRow icon={BookOpen} name="where" editing={editingWhere} setEditing={setEditingWhere}
            label={pdf ? `${bookOf(item.medium) || pdf.name.replace(/\.pdf$/i, '')}, p. ${pdf.page}` : item.medium?.trim() ?? ''}
            tip={pdf ? `Open it at p. ${pdf.page}. ⌥-click opens it beside this` : 'Open its page in Sources'}
            peek={pdf ?? undefined}
            open={(aside) => (pdf ? (chime('page'), openPdf(pdf.src, pdf.name, pdf.page, pdf.mark, aside)) : (chime('page'), openSource('medium', item.medium ?? '')))}>
            <Remembered key={`m${item.id}`} field="medium" value={where} data-gem-where autoFocus={editingWhere}
              placeholder={asksFor(item.kind as CaptureType, item.title).where ?? 'Where from'}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
              onChange={setWhere}
              onKeyDown={leaveOnKeys(() => setWhere(item.medium ?? ''))}
              onBlur={() => { setEditingWhere(false); if (escaped.current) return void (escaped.current = false); const next = where.trim() || null; if (next !== (item.medium ?? null)) void haligtree.saveItem(item.id, { medium: next }).then(() => chime('noted')) }} />
          </SourceRow>
        </Island>
        <Island compact title="Details">
          <Prop icon={Calendar}>Saved {whenInLine(item.createdAt)}</Prop>
          {/* An article made from ideas says so here, with the rest of what it is; one written from scratch needs no line. */}
          {item.tier === 'article' && item.origins.length > 0 && <Prop icon={Layers}>Made from {num(item.origins.length)} gem{item.origins.length === 1 ? '' : 's'}</Prop>}
          <WritingSpent id={item.id} />
          {item.revisions > 0 && <Prop icon={History}>Rewritten {item.revisions === 1 ? 'once' : `${item.revisions} times`}</Prop>}
          <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'nuggets', id: item.id }])}>Save its pictures and files…</Prop>
        </Island>

        {/* Glosses: present-you beside the material, one row each and never an
            edit, so the history of your thinking about it stays readable. */}
        <GlossTimeline id={item.id} />
      </Props>}
    </div>
  )
}


/**
 * A source of a gem, as a link: a click opens it (⌥ beside the page, where it
 * can), and the pencil that shows on hover turns the row into its field,
 * where Enter keeps what is typed and Esc leaves it as it was. Empty, the row
 * is the field, waiting to be filled.
 */
/**
 * The field for who or where beside the page. While it shows as a link it has
 * no field: the row is turned into its field first (quietly, as the click that
 * asked for it already sounded), and it is there to find a moment later.
 * Meant for `focusField`, which asks again until it is.
 */
export function sourceField(scope: ParentNode | null | undefined, name: 'source' | 'where', field: string): HTMLInputElement | null {
  const input = scope?.querySelector<HTMLInputElement>(field)
  if (input) return input
  scope?.querySelector(`[data-source-row="${name}"]`)?.dispatchEvent(new CustomEvent('mf-source-edit'))
  return null
}

export function SourceRow({ icon: Icon, name, label, tip, open, peek, editing, setEditing, children }: {
  icon: React.ComponentType<{ className?: string }>
  name: 'source' | 'where'
  label: string
  tip: string
  open: (aside: boolean) => void
  peek?: { src: string; name: string; page: number }
  editing: boolean
  setEditing: (on: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  // Asked for from elsewhere (a quote's signature): turned into its field (`sourceField`).
  const row = useRef<HTMLDivElement>(null)
  const edit = useRef(setEditing)
  edit.current = setEditing
  const shown = !(editing || !label)
  useEffect(() => {
    const at = row.current
    if (!shown || !at) return
    const asked = (): void => edit.current(true)
    at.addEventListener('mf-source-edit', asked)
    return () => at.removeEventListener('mf-source-edit', asked)
  }, [shown])
  if (editing || !label) {
    return (
      <label className="flex cursor-text items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
        <Icon className="size-4 shrink-0" />
        {children}
      </label>
    )
  }
  return (
    <div ref={row} data-source-row={name} className="group/source flex items-center hover:bg-accent">
      <Tip label={tip}>
        <button type="button" data-source-link={name}
          data-pdf-peek={peek?.src} data-pdf-peek-name={peek?.name} data-pdf-peek-page={peek?.page}
          onClick={(event) => open(event.altKey)}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-control text-foreground">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate underline decoration-foreground/25 underline-offset-[3px] group-hover/source:decoration-foreground/60">{label}</span>
        </button>
      </Tip>
      <Tip label="Edit">
        <button type="button" data-source-edit={name} aria-label={name === 'source' ? 'Edit who it came from' : 'Edit where it came from'}
          onClick={() => (chime('tap'), setEditing(true))}
          className="mr-1 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/source:opacity-100 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100">
          <Pencil className="size-3.5" />
        </button>
      </Tip>
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
    void haligtree.remind(table, id, date ? date.toISOString() : null).then(() =>
      (chime(date ? 'pin' : 'off'), toast(date ? `Joins your Favorites ${whenInLine(date.toISOString(), false)}, with a “waiting” chip at the top of quick capture` : 'Reminder cleared', () => void haligtree.remind(table, id, was))))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-foreground">
          <AliveIcon icon={AlarmClockPlusIcon} size={16} />
          <span className="text-control">{at ? `Reminds ${whenInLine(at, false)}` : 'Remind me…'}</span>
        </button>
      </PopoverTrigger>
      {/* The list's Sort / View popover's anatomy (display.tsx), as the marked day's popover has it: the field on top,
          then a small heading over the choices in an island, the way to take it off quietly on the left of the foot. */}
      <PopoverContent align="start" className={`w-72 gap-0 p-2 text-control ${POP_ISLANDS}`}>
        <input
          autoFocus
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && typed && set(typed)}
          placeholder="Try: 4 pm, 2 days, in 5 weeks…"
          aria-label="When to remind you"
          className="mb-3 h-9 w-full rounded-lg border bg-transparent px-3 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25"
        />
        {/* What it is set to now beside the heading, as the Calendar's Reminder island says it (calendar-events.tsx RemindPicker). */}
        <Island compact title={typed ? 'Reads as' : 'Remind me'} actions={at && !typed ? <span className="text-control font-medium text-foreground">{when(at, false)}</span> : undefined}>
          {/* Typing turns four choices into the one it reads: the island's height glides, as the marked day's found notes do. */}
          <Grows inner="flex flex-col p-1">
            {(typed ? [[words, typed] as [string, Date]] : presets).map(([label, date]) => (
              <button key={label} type="button" onClick={() => set(date)} className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-foreground hover:bg-accent">
                <span className="min-w-0 truncate">{label}</span>
                <span className="shrink-0 text-(--mf-muted-strong) tabular-nums">{moment(date)}{typed && <AskKey label="Return">↵</AskKey>}</span>
              </button>
            ))}
          </Grows>
        </Island>
        {at && (
          <div className="mt-3 flex items-center">
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => set(null)}>Clear the reminder</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Study this: a task to read it by a date, linked, so it is waiting when the task opens. */
/** Whether a gem's page holds nothing of your own under its first line (its quote, its idea): only empty lines, if any. */
const onlyItsLine = (editor: Editor): boolean => {
  const { doc } = editor.state
  for (let at = 1; at < doc.childCount; at++) if (doc.child(at).textContent.trim() || !doc.child(at).isTextblock) return false
  return true
}

/**
 * Under a gem's quote with nothing written yet: where your own words go, in the note's own type, ready to type. A
 * click puts the caret on a fresh line under the quote (a page's first line is its name, so a gem's words start on
 * the next). It goes once anything is written there.
 */
function WriteOn({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [lone, setLone] = useState(() => !!editor && onlyItsLine(editor))
  useEffect(() => {
    if (!editor) return
    const read = (): void => setLone(onlyItsLine(editor))
    read()
    editor.on('update', read)
    return () => void editor.off('update', read)
  }, [editor])
  if (!editor || !lone) return null
  const write = (): void => {
    const { doc } = editor.state
    const last = doc.lastChild
    const chain = editor.chain()
    if (doc.childCount < 2 || !(last?.type.name === 'paragraph' && !last.textContent)) chain.insertContentAt(doc.content.size, { type: 'paragraph' })
    chain.focus('end').run()
  }
  return (
    <div data-chrome className="page-narrow mx-auto mt-4 w-full px-[4.5rem]">
      <button type="button" data-write-on onClick={write}
        className="tiptap ProseMirror haligtree-editor w-full cursor-text rounded-md !p-0 text-left text-muted-foreground transition-colors hover:text-foreground">
        <p className="!m-0">What you make of it, in your own words</p>
      </button>
    </div>
  )
}

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
        void haligtree.supersede(item.id, event.currentTarget.value.trim()).then((fixed) => toast('Corrected: the new version is a gem, this one is out of review', () => void haligtree.unsupersede(item.id, fixed, suspended)))
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

/** Questions › Words' Display, kept apart from Open's and Answered's. */
const WORDS = 'question:words'

export function useItemDisplay(name: string, every: Item[], withGroups = false): {
  groups: [string, Item[]][]
  display: React.JSX.Element
  /** The orders the list can take, as Display's "Sort" offers them: the list's own right-click offers the same. */
  sorts: Choice[]
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
  /** Every row and group placed in your own order: where an empty group stands. */
  order: string[]
  /** Switch to your own order, as moving a row does: the way back, when it did switch. */
  mine: () => (() => void) | undefined
  /** Grouped by source: each section's own head (its face, its person, its count, the way to its page). */
  heads: ((name: string, count: number, first: boolean) => React.ReactNode) | null
  /** Grouped by source, a row in "One gem each" names its book or site quietly. */
  sourceSaid: (one: Item) => string | undefined
} {
  // Newest first under date headings to start, as Notebook Navigator's list (Today, Previous 7 days, Previous 30 days,
  // then each year): a sort or grouping the person chose is kept as theirs (useView).
  // Words, as Looked up: A to Z under their letters (a list of its own, so Open and Answered keep theirs).
  const [view, setView] = useView(name, name === WORDS ? { sort: 'name', group: 'letter' } : { sort: 'newest', group: 'date' })
  // Archived ones are out of sight until Display's Marked asks for them.
  const all = every.filter((one) => !!one.archivedAt === !!view.filter.flags?.includes('archived'))
  const folderOf = useFolderOf()
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
    { key: 'when', label: 'Saved', options: AGES, test: (one, when) => inAge(one.createdAt, when) },
    { key: 'tested', label: 'Review', options: [{ id: 'tested', label: 'Tested' }, { id: 'not', label: 'Not tested' }, { id: 'leech', label: 'Forgotten often' }], test: (one, how) => (how === 'leech' ? one.lapses >= 4 : !!one.prompt === (how === 'tested')) },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Favorites' }, { id: 'private', label: 'Private' }, { id: 'pushed', label: 'Note to self' }, { id: 'archived', label: 'Archived' }], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'private' ? !!one.private : flag === 'archived' ? !!one.archivedAt : one.mode === 'pushed') },
    // The view before 19 Nov, for anyone who wants it: only what has no folder yet.
    { key: 'folder', label: 'Folder', options: [{ id: 'unfiled', label: 'Only ones not in a folder' }], test: (one) => !folderOf[one.id] }
  ]
  // Status and rating, the properties a kind asks for: filtered and sorted by once any gem has them.
  const statuses = [...new Set(all.map((one) => propOf(one).status).filter((one): one is string => !!one))].sort()
  const rated = all.some((one) => propOf(one).rating)
  if (statuses.length) facets.push({ key: 'status', label: 'Status', options: statuses.map((id) => ({ id, label: id })), test: (one, status) => propOf(one).status === status })
  if (rated) facets.push({ key: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ id: String(n), label: '★'.repeat(n) })), test: (one, n) => propOf(one).rating === Number(n) })
  const ownOrder = (a: Item, b: Item): number => own.compare(a.id, b.id) || b.createdAt.localeCompare(a.createdAt)
  const kinds = facets[0].options.length > 1
  // A word files under its headword ("Petrichor: the smell of rain" under P); anything else under its title.
  const word = (one: Item): string => (one.kind === 'word' ? headword(splitTags(one.title).text).word : one.title)
  // Any property in use is a way to sort (lib/property-sorts.ts).
  const byProp = propertySorts(all, (a, b) => b.createdAt.localeCompare(a.createdAt))
  // Gems by where they came from: its book or site, else its person. Sources with one gem gather in one section,
  // so dozens of one-off websites never bury the books; gems with no source come last.
  const sourced = name === 'nugget' && all.some((one) => !!sourceOf(one))
  // Each source once, however it is spelt (its first spelling names it), as Sources counts it; by the name shown, too.
  const tally = new Map<string, { field: SourceField; name: string; count: number; people: Map<string, number> }>()
  if (sourced && view.group === 'source')
    for (const one of all) {
      const from = sourceOf(one)
      if (!from) continue
      const had = tally.get(from.key) ?? { field: from.field, name: from.name, count: 0, people: new Map<string, number>() }
      had.count++
      const who = one.attribution?.trim()
      if (from.field === 'medium' && who && who !== UNATTRIBUTED) had.people.set(who, (had.people.get(who) ?? 0) + 1)
      tally.set(from.key, had)
    }
  const named = new Map([...tally.values()].map((one) => [one.name, one]))
  const sectionOf = (one: Item): string => {
    const from = sourceOf(one)
    const source = from && tally.get(from.key)
    return !source ? NO_SOURCE : source.count > 1 ? source.name : ONE_EACH
  }
  const arranged = arrange(all, view, facets, {
    ...byProp.compare,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    // Newest turned round ('first': a kept 'oldest' is read as Longest unchanged, display.tsx useView).
    first: (a, b) => a.createdAt.localeCompare(b.createdAt),
    changed: (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    untouched: (a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt),
    name: (a, b) => word(a).localeCompare(word(b), undefined, { sensitivity: 'base' }),
    kind: (a, b) => byKind(a.kind, b.kind) || b.createdAt.localeCompare(a.createdAt),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    rating: (a, b) => (propOf(b).rating ?? 0) - (propOf(a).rating ?? 0) || b.createdAt.localeCompare(a.createdAt),
    manual: ownOrder
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.many ?? 'Notes',
    date: (one) => period(one.createdAt),
    letter: (one) => letterOf(word(one)),
    ...(sourced ? { source: sectionOf } : {})
  })
  // Sources by their newest gem (the sort's own order inside each); "One gem each", then "No source", last.
  const newest = (list: Item[]): string => list.reduce((most, one) => (one.createdAt > most ? one.createdAt : most), '')
  const rank = (key: string): number => (key === ONE_EACH ? 1 : key === NO_SOURCE ? 2 : 0)
  const bySource = view.group === 'source' && sourced
  const groups: [string, Item[]][] = !bySource ? arranged
    : arranged.length === 1 && arranged[0][0] === NO_SOURCE ? [['', arranged[0][1]]]
      : [...arranged].sort(([a, one], [b, two]) => rank(a) - rank(b) || newest(two).localeCompare(newest(one)))
  const heads = !bySource ? null : (key: string, count: number, first: boolean): React.ReactNode => {
    const source = named.get(key)
    const room = first ? 'mt-1' : 'mt-5'
    const gems = <span className="shrink-0 font-normal text-muted-foreground tabular-nums">· {plural(count, 'gem')}</span>
    if (!source || rank(key))
      return <div data-group-head={key} data-group-count={count} className={`flex min-h-8 items-center gap-2 px-2 pb-1 text-control font-semibold text-foreground ${room}`}>{key}{gems}</div>
    // The person most of a book's gems name, said after it, quietly.
    const person = [...source.people].sort((a, b) => b[1] - a[1])[0]?.[0]
    return (
      <Tip label={`Open ${key}’s page in Sources`}>
        <button type="button" data-group-head={key} data-group-count={count} data-source-head={source.field} onClick={() => (chime('page'), openSource(source.field, key))}
          className={`group/head mb-1 flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-control transition-colors hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none ${room}`}>
          {source.field === 'attribution' ? <Avatar name={key} size={20} /> : <span className="flex size-5 shrink-0 items-center justify-center"><Library aria-hidden className="size-4 text-muted-foreground" /></span>}
          <span className="min-w-0 truncate font-semibold text-foreground">{key}</span>
          {person && <span className="min-w-0 shrink truncate text-muted-foreground">{person}</span>}
          {gems}
          <ArrowUpRight aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 group-focus-visible/head:opacity-100" />
        </button>
      </Tip>
    )
  }
  const sourceSaid = (one: Item): string | undefined => {
    if (!bySource || sectionOf(one) !== ONE_EACH) return undefined
    const from = sourceOf(one)
    // A person is already said on the row; a book or site is not.
    return from?.field === 'medium' ? from.name : undefined
  }
  // Spread over the page, the list keeps a size of its own: a grid, unless you chose another.
  const wide = view.pane === 'wide'
  // Questions are one-line rows in newspaper columns, or the List with each row's picture boxed at its left, and no
  // grid (the user, 20 Nov: "Remove the grid views", then the List back); every other list starts on rows, and a
  // choice made in Display is kept.
  const columned = name === 'question' || name === WORDS
  const density = columned ? columnsOrList(view) : (wide ? view.wideDensity ?? 'grid' : view.density) ?? 'list'
  // By kind only where there is more than one kind; by next review only where something is due for one (pieces of writing never are).
  // Named once: Display's "Sort" and the list's own right-click "Sort" offer the same orders.
  // Recently changed turns round to Longest unchanged on its own row's arrow; Custom order says, while chosen, where folders go.
  const sorts: Choice[] = [{ id: 'newest', label: 'Newest', reverse: { id: 'first', label: 'Oldest' } }, { id: 'changed', label: 'Recently changed', reverse: { id: 'untouched', label: 'Longest unchanged' } }, { id: 'name', label: 'A to Z' }, ...(kinds ? [{ id: 'kind', label: 'Kind' }] : []), ...(all.some((one) => one.dueAt) ? [{ id: 'due', label: 'Next review' }] : []), ...(rated ? [{ id: 'rating', label: 'Highest rated' }] : []), ...byProp.choices, { id: 'manual', label: 'Custom order', hint: withGroups ? 'Folders on top, in your order; then the loose pages, where you put them' : undefined }]
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      // Archived ones too, so Marked can still ask for them.
      items={every}
      count={all.length}
      sorts={sorts}
      // Grouping cuts the loose notes into sections (by kind or date) under the folders: a group is never a folder (qa/list-grouping.mjs).
      groups={[...(kinds ? [{ id: 'kind', label: 'Kind' }] : []), { id: 'none', label: 'None' }, { id: 'date', label: 'Date' }, ...(sourced ? [{ id: 'source', label: 'Source' }] : []), ...(all.length && all.every((one) => one.kind === 'word') ? [{ id: 'letter', label: 'First letter' }] : [])]}
      density={density}
      onDensity={(next) => setView({ ...view, [wide && !columned ? 'wideDensity' : 'density']: next })}
      {...(columned ? COLUMNS_OR_LIST : {})}
      folders
    />
  )
  const chips = <FilterChips view={view} onChange={setView} facets={facets} />
  return { groups, display, sorts, chips, density, view, setView, move, moveBy, ownOrder, order: own.order, mine, heads, sourceSaid }
}

/** Where a gem came from, as Sources files it (main/sources.ts): its book or site, else its person; `key` as Sources keys a page, whatever the case. */
const sourceOf = (one: Item): { field: SourceField; name: string; key: string } | null => {
  const where = one.medium?.trim()
  if (where) return { field: 'medium', name: where, key: `medium:${personKey(where)}` }
  const who = one.attribution?.trim()
  return who && who !== UNATTRIBUTED ? { field: 'attribution', name: who, key: `attribution:${personKey(who)}` } : null
}
const ONE_EACH = 'One gem each'
const NO_SOURCE = 'No source'

/** Each layout's reading order, kept while that layout is the one drawn. */
const ORDER = new WeakMap<Layout, Map<string, number>>()

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
/** The list itself, as a drop place in the path bar: no folder. */
const TOP = ':top'

export function useFolding(tier: string, every: Item[], ownOrder: (a: Item, b: Item) => number, order: string[], shown: Item[] | null, ordered: boolean, done: () => void, chosen: string[], toOwn: () => (() => void) | undefined, heads?: Map<string, string>, within?: string,
  /** Another kind of list using these groups (Goals): what its rows are called, its menu only the group lines, and its rows kept in the list's own sort (a drag joins or leaves a group, or orders the rows of one part among themselves). */
  kind?: { noun: [string, string] },
  /**
   * The part of the list each row stands in, where a rule of the list's own says so (a goal's day, a page's kind
   * under its heading): a drop never puts a row among another part's rows. In a list of another kind, the rows of
   * one part stand in your own order.
   */
  part?: (id: string) => string | undefined,
  /** A folder's page: only groups holding something of the folder's stand (Writing's empty ones are Writing's). */
  onlyFilled = false): {
  rows: Item[] | null
  /** The list as tiles: each group as one folder, at the top, then the loose notes. */
  tiles: (list: Item[]) => ({ group: NoteGroup; items: Item[] } | { item: Item })[]
  step: (id: string, by: number) => number | null
  /** The group lines of a row's menu: for that row, or every row picked. */
  menu: (ids: string[]) => RowItem[]
  /** A new group of these, named at once. */
  gatherNew: (ids: string[]) => void
  /** The rows drawn by `entryOf` where given (a question as a question), else as a note. */
  folds: (menuFor: (item: Item) => RowItem[], entryOf?: (item: Item) => Entry) => Omit<Folds, 'onNewNote'>
  reveal: (id: string) => boolean
  /** These notes carried onto a folder in the sidebar: into that group, at its end. */
  moveInto: (group: string, ids: string[]) => boolean
  /** A new, empty folder in the one open (or the list itself), its name open for typing. */
  newFolder: () => void
  /** The folder a note lives in (through any group it is in there), or null for one loose in the list. */
  home: (id: string) => NoteGroup | null
  /** The picked notes (or one) gathered into a new group in place, Figma's ⌘G. */
  groupNew: (ids: string[]) => void
  /** The groups these notes (or groups) are in taken apart, their notes staying where they are: Figma's ⇧⌘G. */
  ungroup: (ids: string[]) => void
} {
  const list = useGroups(tier)
  const folderOf = useFolderOf()
  const everyFolder = useFolders()
  // What a row is, as Folders files it: a question kept in Writing's list is still a question.
  const thingOf = (id: string): FolderKind => (every.find((one) => one.id === id)?.tier === 'question' ? 'question' : tier === 'article' ? 'article' : 'nugget')
  const [held, setHeld] = useState<Layout | null>(null)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [born, setBorn] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null)
  // The groups' keys go in too, where they were put: an empty one stands there, as in the sidebar.
  // Sorted once for the notes, their order and the groups, never on every draw: 2,500 notes took 14 ms a draw.
  const saved = useMemo(() => {
    const rank = new Map(order.map((id, at) => [id, at]))
    return layoutOf([...[...every].sort(ownOrder).map((one) => one.id), ...order.filter(isGroup)].sort((a, b) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1)), list)
  }, [every, order, list]) // eslint-disable-line react-hooks/exhaustive-deps
  // Groups coming apart, drawn going (the Separate fade and slide) before the list closes over them.
  const [parting, setParting] = useState<string[]>([])
  // Every group seen, so one coming apart keeps its name and colour while it goes, and Undo can bring it back as it was.
  const known = useRef(new Map<string, NoteGroup>())
  for (const one of list) known.current.set(one.id, one)
  // What is in each group as well as the order: a group emptied in place reads the same row for row, and was let go
  // before its save came back, so the rows went back into it until then (2,500 "Remove from group" showed late).
  const shape = (one: Layout): string => [flatten(one).join(), ...Object.keys(one.groups).sort().map((id) => `${id}:${one.groups[id].join()}`)].join('\n')
  const savedOrder = shape(saved)
  useEffect(() => void (held && shape(held) === savedOrder && setHeld(null)), [savedOrder, held]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const layout = held ?? saved
  // The folders in the sidebar's order (side-folders.tsx), so the list and the sidebar never disagree: the list's own
  // layout put a folder where its newest note stood, and 30 folders read upside down beside the sidebar's.
  const sideRank = useMemo(() => {
    const ranked = new Set(order)
    // A drop's layout, held until its save comes back, ranks them as it was let go: ranked by the saved order alone, a
    // group carried to the top was drawn back in its old place until the save came back, then jumped (58).
    const side = held ?? layoutOf([...order, ...list.flatMap((one) => one.members.filter((id) => !ranked.has(id)))], list)
    const rank = new Map<string, number>()
    const walk = (keys: string[]): void => keys.forEach((key) => isGroup(key) && (rank.set(groupId(key), rank.size), walk(side.groups[groupId(key)] ?? [])))
    walk(side.top)
    return rank
  }, [order, list, held])
  // Folders first, then groups, each in the sidebar's order; one just made (not saved yet) after the rest of its kind, so
  // it never shows above the folders for a frame and then jumps down.
  const bySide = (a?: string, b?: string): number => {
    const kind = Number(isFolder(info.get(b ?? '') ?? (list.find((one) => one.id === b)))) - Number(isFolder(info.get(a ?? '') ?? (list.find((one) => one.id === a))))
    return kind || (sideRank.get(a ?? '') ?? Number.MAX_SAFE_INTEGER) - (sideRank.get(b ?? '') ?? Number.MAX_SAFE_INTEGER)
  }
  const info = new Map([...known.current].filter(([id]) => list.some((one) => one.id === id) || parting.includes(id)))
  // A folder is a place: it never unfolds in the list, and what it holds shows only on its own page (folders isolate).
  // A group is a panel in the list, open unless you folded it, as it always was.
  const folders = new Set(list.filter(isFolder).map((one) => one.id))
  const isOpen = (id: string): boolean => !folders.has(id) && (opened[id] ?? !info.get(id)?.folded)
  const shut = new Set(list.filter((one) => !isOpen(one.id)).map((one) => one.id))
  // In your own order, as you laid it out. In any other sort, the groups stay
  // together at the top in your own order, and the sort orders the notes in
  // each and the loose rows under them.
  // A group's `parts` are its notes and its subgroups in order; `items` every note in it, subgroups' too.
  // A subgroup's `items` are every note in it, its own subgroups' too; `parts` how they show.
  type Part = { item: Item } | { sub: string; items: Item[]; parts: Part[] }
  type Block = { group?: string; items: Item[]; parts?: Part[] }
  // A folder opened from the sidebar shows what it holds: its subfolders as the groups, its own notes loose.
  // `own`: drawn in your own order, as it will be once a drop in a sorted list has switched it to “Custom order”.
  const blocks = (from: Layout, list = shown ?? every, root: string | null | undefined = within, own = ordered): Block[] => {
    const visible = new Map(list.map((one) => [one.id, one]))
    const rank = new Map(list.map((one, at) => [one.id, at]))
    // A list of another kind with parts (Goals, by day): the rows of one part stand in your own order, as the layout
    // has them (a drop just made is read off the layout held, so the row is at once where it was put); the list's own
    // sort decides between parts. Rows never placed stand first in their part, as `ownOrder` has them.
    const spot = kind && part ? new Map(flatten(from).map((key, at) => [key, at])) : null
    const bySort = (a: Item, b: Item): number => (spot && part!(a.id) !== undefined && part!(a.id) === part!(b.id) ? (spot.get(a.id) ?? -1) - (spot.get(b.id) ?? -1) : 0) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
    // A group's parts, its subgroups' within them, three levels deep; an empty group stands, as a folder does.
    const partsIn = (group: string, depth: number): Part[] => {
      const parts = (from.groups[group] ?? []).flatMap((id): Part[] => {
        if (!isGroup(id)) return visible.has(id) ? [{ item: visible.get(id)! }] : []
        if (depth >= DEPTH) return []
        const inner = partsIn(groupId(id), depth + 1)
        const items = inner.flatMap((one) => ('item' in one ? [one.item] : one.items))
        return kind && !items.length ? [] : [{ sub: groupId(id), items, parts: inner }]
      })
      return own ? parts : [...parts.filter((one): one is Extract<Part, { sub: string }> => 'sub' in one).sort((a, b) => bySide(a.sub, b.sub)), ...parts.filter((one): one is { item: Item } => 'item' in one).sort((a, b) => bySort(a.item, b.item))]
    }
    const laid = (root ? from.groups[root] ?? [] : from.top).flatMap((key): Block[] => {
      if (!isGroup(key)) return visible.has(key) ? [{ items: [visible.get(key)!] }] : []
      const sorted = partsIn(groupId(key), 1)
      const items = sorted.flatMap((one) => ('item' in one ? [one.item] : one.items))
      return [{ group: groupId(key), items, parts: sorted }]
    })
    // Folders first, in your order, as Finder keeps them on top. In your own order a group is a panel among the notes,
    // where you put it (a drop's line showed it there, and the list drew every group above the loose notes: 58); sorted
    // some other way the groups stay together under the folders, and the sort orders the loose notes under them.
    const first = laid.filter((one) => one.group && (!own || folders.has(one.group)))
    const rest = laid.filter((one) => !first.includes(one))
    return [...first.sort((a, b) => bySide(a.group, b.group)), ...(own ? rest : rest.sort((a, b) => bySort(a.items[0], b.items[0])))]
  }
  // What a group shows open: its notes, and each subgroup's while that is open too.
  const onShow = (one: { parts?: Part[] }): Item[] => (one.parts ?? []).flatMap((part) => ('item' in part ? [part.item] : isOpen(part.sub) ? onShow(part) : []))
  // A hand-made group folded shows its heading alone: its notes are not rows until it is unfolded.
  // A list of another kind (Goals' tabs) shows a group only where it holds some of what is on show.
  const level = (from: Layout, own = ordered): Block[] => blocks(from, undefined, undefined, own).filter((one) => (one.group ? (!kind && !onlyFilled) || one.items.length : true))
  const rowsOf = (from: Layout): Item[] => level(from).flatMap((one) => (!one.group ? one.items : isOpen(one.group) ? onShow(one) : []))
  // The rows on show, in order, groups' own rows too: what the list draws, and what a drop's preview says it will draw.
  const keysOf = (from: Block[]): string[] => from.flatMap((one) => (one.group
    ? [KEY + one.group, ...(isOpen(one.group) ? (one.parts ?? []).flatMap((part) => ('item' in part ? [part.item.id] : [KEY + part.sub, ...(isOpen(part.sub) ? part.items.map((item) => item.id) : [])])) : [])]
    : [one.items[0].id]))
  const now = level(layout)
  const keys = keysOf(now)
  // Sorted some other way, a drop starts from the order you see, and switches the list to your own order to keep it, as moving a plain row does.
  const base = ordered ? layout : reorderAs(layout, now.flatMap((one) => (one.group ? [KEY + one.group, ...(one.parts ?? []).flatMap((part) => ('item' in part ? [part.item.id] : [KEY + part.sub, ...part.items.map((item) => item.id)]))] : [one.items[0].id])))
  // A group left unnamed is named for what its notes share: a tag on all of
  // them, or their kind, or else the next free "Group 2", so no two read the same.
  const byId = new Map(every.map((one) => [one.id, one]))
  const titleOf = (one: Item): string => splitTags(one.title).text
  // A name that only counts (Group 3) gets a better one: from what its notes share, else the Mac's Apple Intelligence,
  // if it has it. Asked from its open name field (`loud`), it is offered there, as before. Groups still called "Group 3"
  // when the list opens are named for good, quietly: before, a group clicked away from, or made earlier, stayed
  // "Group 1" (10 Nov).
  const AUTO = /^(Group|Folder) \d+$/
  const live = useRef({ list, renaming })
  live.current = { list, renaming }
  const offerName = (group: { id: string; name: string; folder?: boolean }, members: string[], loud = true): void => {
    if (!AUTO.test(group.name)) return
    const apply = (name: string): void => {
      const now = live.current.list.find((one) => one.id === group.id)
      if (!now || !AUTO.test(now.name) || name.toLowerCase() === now.name.toLowerCase()) return
      // Asked from its name field (a new group, "Rename…"): put in the field, picked, while it is open; left before the
      // answer with the counting name kept, the group takes it all the same (before, it stayed "Group 3" for good).
      if (loud && live.current.renaming === group.id) return void setSuggested({ id: group.id, name })
      // Written only if the group still has the counting name seen here (main/groups.ts `ifName`): a name you typed and
      // kept while the answer was on its way reaches main first, and this one is then dropped (22 Nov, qa/groups.mjs).
      namedByApp(group.id, name)
      void noteGroupsApi.set(group.id, { name, ifName: now.name })
    }
    const local = naming(members, !!group.folder)
    if (!AUTO.test(local)) return apply(local)
    const titles = members.flatMap((id) => (byId.has(id) ? [titleOf(byId.get(id)!)] : [])).filter((one) => one.trim() && one !== 'Untitled')
    if (titles.length < 2) return
    void window.api.haligtree<string | null>('ai:group-name', titles).then((said) => {
      const name = cleanName(said, titles, new Set(live.current.list.map((one) => one.name.toLowerCase())))
      if (name) apply(name)
    }, () => {
      // Only ever a better name: no answer of any kind leaves the one it has.
    })
  }
  // Groups still called "Group 3" when the list opens are named quietly, each once ever: a name you give it, even
  // "Group 4", is yours and left alone.
  useEffect(() => {
    for (const group of list) {
      if (!AUTO.test(group.name) || autoTried.has(group.id) || !(layout.groups[group.id]?.length)) continue
      triedNaming(group.id)
      offerName({ id: group.id, name: group.name, folder: isFolder(group) }, layout.groups[group.id] ?? [], false)
    }
  }, [list, layout]) // eslint-disable-line react-hooks/exhaustive-deps
  const naming = (ids: string[], folder = false): string => {
    const notes = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    const taken = new Set(list.map((one) => one.name.toLowerCase()))
    const tags = notes.map((one) => splitTags(one.title).tags)
    const tag = tags[0]?.find((one) => tags.every((them) => them.includes(one)))
    const kind = notes.length && notes.every((one) => one.kind === notes[0].kind) && notes[0].kind !== 'note' ? CAPTURE_TYPES.find((one) => one.id === notes[0].kind)?.label : undefined
    const said = tag ? tag[0].toUpperCase() + tag.slice(1) : kind ? `${kind}s` : null
    if (said && !taken.has(said.toLowerCase())) return said
    const shared = sharedWords(notes.map(titleOf))
    if (shared && !taken.has(shared.toLowerCase())) return shared
    const word = folder ? 'Folder' : 'Group'
    let n = list.filter((one) => isFolder(one) === folder).length + 1
    while (taken.has(`${word.toLowerCase()} ${n}`)) n++
    return `${word} ${n}`
  }
  // A drop on a note's middle, or ⌘G, makes a group; ⌃⌘N and "New folder" make a folder.
  const make = (ids: string[] = [], folder = false) => (): { id: string; name: string; folder: boolean } => { const id = crypto.randomUUID(); triedNaming(id); return { id, name: naming(ids, folder), folder } }
  const commit = (raw: Layout, cue: Cue, said?: string, unsort?: () => void, loud = false): void => {
    const was = layout
    // A group this change leaves with one note comes apart, in the same step, and the same Undo. One that already stood
    // with one or none stays: taken apart by a drop somewhere else, the rows under it jumped up as the drop landed.
    const short = Object.keys(was.groups).filter((id) => was.groups[id].length < 2)
    const { layout: next, dissolved } = tidy(raw, new Set([...folders, ...short, ...(raw.make?.folder ? [raw.make.id] : [])]))
    chime(dissolved.length ? 'separate' : cue)
    if (dissolved.length && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion !== 'off') {
      setHeld(raw)
      setParting(dissolved)
      setTimeout(() => (setHeld(next), setParting([])), 240)
    } else setHeld(next)
    if (next.make) (setRenaming(next.make.id), setBorn(next.make.id), setSuggested(null), offerName(next.make, next.groups[next.make.id] ?? []))
    done()
    const gone = Object.keys(was.groups).filter((id) => !next.groups[id])
    const revive = gone.flatMap((id) => (known.current.has(id) ? [(({ name, icon, color, folded, folder }) => ({ id, name, icon, color, folded, folder }))(known.current.get(id)!)] : []))
    const apart = dissolved.map((id) => known.current.get(id)?.name).filter(Boolean)
    const back = (): void => {
      // Drawn back at once, as the change itself was.
      setHeld({ top: was.top, groups: was.groups })
      unsort?.()
      // A group this made goes again: emptied, it would stay, as a folder does.
      const made = Object.keys(next.groups).filter((id) => !(id in was.groups))
      void noteGroupsApi.arrange(tier, { top: was.top, groups: was.groups, revive }).then(() => made.forEach((id) => void noteGroupsApi.separate(id)))
    }
    // A new group is drawn in front of you with its name open for typing: no toast, ⌘Z still takes it back. One a drop
    // made (`loud`) says so, with its Undo: a drag can make one you did not mean to.
    // A group gone from the list's shape (taken apart, or left with one note) goes from the book too; a folder stays, as a place.
    // Undo brings it back as it was (`revive`).
    const ended = gone.filter((id) => !folders.has(id))
    void noteGroupsApi.arrange(tier, next).then(() => Promise.all(ended.map((id) => noteGroupsApi.remove(id)))).then(() => said && (next.make && !apart.length && !loud ? quietly(back) : toast(apart.length ? `${said}: ${apart.join(', ')} came apart` : said, back)))
  }
  // A folder never goes inside a group: a group is a panel in a list, a folder a place.
  const folderInGroup = (from: Layout): boolean => Object.entries(from.groups).some(([group, keys]) => !folders.has(group) && keys.some((key) => isGroup(key) && folders.has(groupId(key))))
  // In an open folder, every move keeps what it moves inside that folder.
  const inside = (from: Layout, key: string): boolean => {
    if (!within) return true
    for (let group = groupOf(from, key); group; group = groupOf(from, KEY + group)) if (group === within) return true
    return false
  }
  const step = (id: string, by: number): number | null => {
    // Sorted some other way, there is no own place to step to.
    if (!ordered) return null
    const next = stepLayout(layout, keys, id, by, shut)
    if (!next || !inside(next, id)) return null
    commit(next, 'shift')
    return rowsOf(next).findIndex((one) => one.id === id)
  }
  // Every row's menu asks, so one row needs no sorting, and the order is read
  // once per layout: worked out afresh for each of 2,500 rows, a big list took
  // seconds to open.
  const inOrder = (ids: string[]): string[] => {
    if (ids.length < 2) return ids
    let at = ORDER.get(layout)
    if (!at) ORDER.set(layout, (at = new Map(flatten(layout).map((one, index) => [one, index]))))
    return [...ids].sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0))
  }
  const notes = (n: number): string => (kind ? (n === 1 ? kind.noun[0] : `${num(n)} ${kind.noun[1]}`) : n === 1 ? 'note' : `${num(n)} notes`)
  // Kept in a folder of Folders, picked or made in the one picker (folder-picker.tsx).
  // Beside the first of them, where the keys or the right click left it.
  const gatherNew = (ids: string[]): void => askFolder(inOrder(ids).map((id) => ({ type: thingOf(id), id })), ids[0] ? document.querySelector(`[data-row][data-id="${CSS.escape(ids[0])}"]`) : null)
  // Figma's ⌘G: the picked notes gathered into a group where the first of them is, in the list or folder you are in.
  const groupNew = (ids: string[]): void => {
    const these = inOrder(ids.filter((id) => !isGroup(id)))
    if (these.length < 2) return refuse(`Pick two or more ${kind?.noun[1] ?? 'notes'} to group them`)
    const own = groupOf(layout, these[0])
    // Inside a group already, they make a group inside it (three levels at most); else one where the first note is.
    const next = gather(layout, these[0], these, make(these)(), own ?? null)
    if (!inside(next, these[0])) return refuse(`Pick ${kind?.noun[1] ?? 'notes'} in this folder to group them`)
    commit(next, 'gather', `Grouped ${notes(these.length)}`)
  }
  // Figma's ⇧⌘G: each group the picks are in (or a group's own row) comes apart; its notes stay where it was. One Undo.
  const ungroup = (ids: string[]): void => {
    const apart = new Set<string>()
    for (const id of ids) {
      if (isGroup(id) && !folders.has(groupId(id))) { apart.add(groupId(id)); continue }
      for (let at = groupOf(layout, id); at; at = groupOf(layout, KEY + at)) if (!folders.has(at)) { apart.add(at); break }
    }
    if (!apart.size) return refuse(ids.length > 1 ? 'None of these is in a group' : 'Not in a group')
    const open = (key: string): string[] => (isGroup(key) && apart.has(groupId(key)) ? (layout.groups[groupId(key)] ?? []).flatMap(open) : [key])
    const groups: Record<string, string[]> = {}
    for (const [group, keys] of Object.entries(layout.groups)) if (!apart.has(group)) groups[group] = keys.flatMap(open)
    const names = [...apart].map((id) => info.get(id)?.name).filter(Boolean)
    commit({ top: layout.top.flatMap(open), groups }, 'separate', apart.size === 1 ? `Ungrouped ${names[0] ?? 'the group'}` : `Ungrouped ${num(apart.size)} groups`)
  }
  const menu = (ids: string[]): RowItem[] => {
    const these = inOrder(ids)
    const n = these.length
    // The folders they are kept in (Folders, folders.ts), for "Take out of …".
    const kept = [...new Set(these.map((id) => folderOf[id]).filter(Boolean))]
    const keptName = everyFolder.find((one) => one.id === kept[0])?.name ?? 'its folder'
    const inGroups = these.some((one) => { const at = groupOf(layout, one); return !!at && !folders.has(at) })
    // All in one pass, at the group's end: one at a time went over the whole list for each, and 2,500 took seconds.
    const picked = new Set(these)
    // Groups on show where these notes are (the list, or the open folder), not the one they are all in already.
    const here = groupOf(layout, these[0]) ?? null
    const groupsHere = list.filter((one) => !isFolder(one) && layout.groups[one.id] && inside(layout, KEY + one.id) && !these.every((id) => groupOf(layout, id) === one.id) && (groupOf(layout, KEY + one.id) ?? null) === (here && !folders.has(here) ? groupOf(layout, KEY + here) ?? null : here))
    const groupLines: RowItem[] = [
      n > 1 && { label: `Group ${notes(n)}`, keys: '⌘G', run: () => groupNew(these) },
      // The groups in this list (or folder) to put them in, as the old "Move to group" did.
      groupsHere.length > 0 && {
        label: 'Move to group',
        items: groupsHere.map((one) => ({
          label: one.name,
          icon: <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />,
          run: () => commit(moveMany(layout, these, { group: one.id, after: (layout.groups[one.id] ?? []).filter((id) => !picked.has(id)).at(-1) ?? null }), 'gather', `Moved ${notes(n)} to ${one.name}`)
        }))
      },
      inGroups && {
        label: 'Remove from group',
        // Out of each group, just after it, in whatever holds it, in their order: the group stays if two are left.
        run: () => {
          const groupsOf = new Set(these.map((one) => groupOf(layout, one)).filter((one): one is string => !!one && !folders.has(one)))
          commit([...groupsOf].reduce<Layout>((next, own) => moveMany(next, these.filter((one) => groupOf(layout, one) === own), { group: groupOf(next, KEY + own) ?? null, after: KEY + own }), layout), 'separate', `Removed ${notes(n)} from ${groupsOf.size === 1 ? info.get([...groupsOf][0])?.name ?? 'the group' : 'their groups'}`)
        }
      },
      inGroups && { label: 'Ungroup', keys: '⇧⌘G', run: () => ungroup(these) }
    ]
    if (kind) return groupLines
    return [
      ...groupLines,
      { label: n > 1 ? `Keep ${num(n)} in folder…` : 'Keep in folder…', keys: '⇧⌘M', run: () => gatherNew(these) },
      kept.length > 0 && {
        label: kept.length === 1 ? `Take out of ${keptName}` : 'Take out of their folders',
        hint: tier === 'article' ? 'Stays in Writing' : 'Stays in Gems',
        run: () => void keepIn(these.filter((id) => folderOf[id]).map((id) => ({ type: thingOf(id), id })), null)
      },
      'separator',
      {
        label: n > 1 ? `Duplicate ${num(n)} notes` : 'Duplicate',
        run: () => void noteGroupsApi.clone(tier, these).then((made) => (chime('copy'), done(), toast(n > 1 ? `Duplicated ${num(n)} notes` : 'Duplicated', () => void noteGroupsApi.unclone(made))))
      },
      {
        label: n > 1 ? `Copy ${num(n)} links` : 'Copy link',
        run: () => void noteGroupsApi.links(these).then((links) => (links.length ? copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${num(links.length)} links`}`) : refuse(n > 1 ? 'No web links in these notes' : 'No web link in this note')))
      },
      n > 1 && moveToBookItem(these.map((id) => ({ table: 'nuggets' as const, id })), these.map((id) => ({ type: tier === 'question' ? 'question' : tier === 'article' ? 'article' : 'nugget', id }))),
      n > 1 && 'separator',
      n > 1 && { label: `Archive ${num(n)} notes`, hint: 'Kept, out of sight', run: () => (done(), void archive('nuggets', these, true)) }
    ]
  }
  // Between rows, a list with parts (or of another kind) takes one move only: a row among the rows of its own part.
  // Anywhere else its own rule would put the row straight back, so nothing is offered there (the list says why: kept-groups).
  const amongOwn = (ids: string[], target: string): boolean => (part ? !isGroup(target) && ids.every((id) => part(id) !== undefined && part(id) === part(target)) : !kind)
  // Grouped by kind or date, each section of loose notes under its name, with how many are loose in it.
  const sectionOf = (one: Block): string | undefined => (one.group ? undefined : heads?.get(one.items[0].id))
  const loose = new Map<string, number>()
  for (const one of now) if (sectionOf(one)) loose.set(sectionOf(one)!, (loose.get(sectionOf(one)!) ?? 0) + 1)
  const headOf = (one: Block, at: number): [string, number] | undefined => {
    const name = sectionOf(one)
    return name && (at === 0 || sectionOf(now[at - 1]) !== name) ? [name, loose.get(name)!] : undefined
  }
  // Only a move within where it already is needs your own order, laid out as you saw it: sorted, letting go there
  // switches the list to “Custom order”, so what the drop shows is drawn that way (a list of another kind, Goals, keeps
  // its own sort and is drawn so). Joining or leaving a group keeps the sort.
  const reorders = (next: Layout, ids: string[]): boolean => !next.make && groupOf(base, ids[0]) === groupOf(next, ids[0])
  const folds = (menuFor: (item: Item) => RowItem[], entryOf: (item: Item) => Entry = (item) => itemEntry(item, () => menuFor(item))): Omit<Folds, 'onNewNote'> => ({
    bundles: now.map((one, at): Bundle => {
      const view = (id: string, items: Item[]): GroupView => {
        const group = info.get(id)
        const folder = group ? isFolder(group) : !!layout.make?.folder
        return { id, name: group?.name ?? layout.make?.name ?? (folder ? 'Folder' : 'Group'), folder, icon: group?.icon ?? null, color: group?.color ?? null, open: isOpen(id), members: items.map((item) => item.id), parting: parting.includes(id), unsorted: items.filter((item) => item.unsorted && !item.archivedAt).map((item) => item.id) }
      }
      return {
        head: headOf(one, at),
        group: one.group ? view(one.group, one.items) : undefined,
        entries: one.items.map((item) => entryOf(item)),
        parts: one.parts?.map(function shape(part: Part): KeptPart {
          return 'item' in part ? { entry: entryOf(part.item) } : { group: view(part.sub, part.items), entries: part.items.map((item) => entryOf(item)), parts: part.parts.map(shape) }
        })
      }
    }),
    preview: (ids, target, how) => {
      const next = dropMany(base, ids, target, how, shut, () => ({ id: 'new', name: '' }))
      // Where the list's own rule places a row, a drop joins, leaves or makes a group, or moves it among the rows of its own part.
      if (next && !next.make && ids.every((id) => groupOf(base, id) === groupOf(next, id)) && !amongOwn(ids, target)) return null
      return next && !sameLayout(next, base) && ids.every((id) => inside(next, id)) && !folderInGroup(next) ? { before: base, after: next, shown: keysOf(level(next, ordered || (!kind && reorders(next, ids)))), root: within ?? null, folders: new Set([...info].filter(([, one]) => isFolder(one)).map(([id]) => id)) } : null
    },
    onDrop: (ids, target, how) => {
      const seen = dropMany(base, ids, target, how, shut, make([target, ...ids]))
      if (!seen || sameLayout(seen, base) || !ids.every((id) => inside(seen, id)) || folderInGroup(seen) || (!seen.make && ids.every((id) => groupOf(base, id) === groupOf(seen, id)) && !amongOwn(ids, target))) return chime('stay')
      // Only a move within where it already is needs your own order, laid out as you saw it. Joining or leaving a
      // group keeps the sort, and your own order as it was: the row takes its sorted place in its new group.
      const reorder = !ordered && reorders(seen, ids)
      const next = ordered || reorder ? seen : dropMany(layout, ids, target, how, shut, make([target, ...ids])) ?? seen
      const unsort = reorder ? toOwn() : undefined
      const active = ids[0]
      const was = isGroup(active) ? undefined : groupOf(layout, active)
      const lands = isGroup(active) ? undefined : groupOf(next, active)
      const name = (id?: string): string => (id && (info.get(id)?.name ?? next.make?.name)) || 'the group'
      const n = ids.length > 1 ? ` ${num(ids.length)}` : ''
      // A group made by a drop shows in front of you with its name open for typing, as it always did: no toast, ⌘Z takes it back.
      // Into a folder they leave the list for its page, as the card said: moved, not added, in the words its menu's
      // “Move to” and a drop on the sidebar's folder say it.
      const away = !!lands && isFolder(info.get(lands))
      commit(next, next.make || (lands && lands !== was) ? 'gather' : was && !lands ? 'separate' : 'shift',
        next.make ? 'Grouped' : lands && lands !== was ? (away ? `Moved ${notes(ids.length)} to ${name(lands)}` : `Added${n} to ${name(lands)}`) : was && !lands ? `Removed${n} from ${name(was)}` : `Moved${n}`, unsort)
    },
    picked: chosen,
    onLetGo: () => done(),
    ordered,
    own: !!kind,
    // Sorted some other way, a row still carries: what that does is said once over the list, so the grip promises nothing else.
    hint: ordered || kind ? undefined : { name: 'sorted-drag', said: 'Drag a row to move it: that puts this list in “Custom order”. Hold it on another row to make a group.' },
    onFold: (group, open) => {
      if (group.folder) return
      setOpened((was) => ({ ...was, [group.id]: open }))
      void noteGroupsApi.set(group.id, { folded: !open })
    },
    renaming,
    suggested,
    // "Rename…" or F2 on a group still called "Group 3" asks for a better name
    // as a new group does, so one made before, or named while Apple
    // Intelligence was slow, can still get one.
    onRenaming: (id) => {
      // Renamed by you: never named for its notes again.
      if (id) triedNaming(id)
      setRenaming(id)
      setSuggested(null)
      const group = id ? info.get(id) : undefined
      if (id && group) offerName({ id, name: group.name }, layout.groups[id] ?? [])
    },
    born,
    noun: kind ? kind.noun[0] : tier === 'nugget' ? 'gem' : 'page',
    list: tier,
  })
  const tiles = (list: Item[]): ({ group: NoteGroup; items: Item[] } | { item: Item })[] =>
    blocks(layout, list).flatMap((one): ({ group: NoteGroup; items: Item[] } | { item: Item })[] => (one.group && info.get(one.group) ? [{ group: info.get(one.group)!, items: one.items }] : one.items.map((item) => ({ item }))))
  // The open note's group (and subgroup) opened for now, quietly, when it is shut: its row is never out of sight.
  const reveal = (id: string): boolean => {
    const one = blocks(layout).find((block) => block.group && block.items.some((item) => item.id === id))
    if (!one?.group) return false
    // Every subgroup on the way to it, outermost first.
    const path: string[] = []
    for (let parts = one.parts; parts; ) {
      const sub = parts.find((part): part is Extract<Part, { sub: string }> => 'sub' in part && part.items.some((item) => item.id === id))
      if (!sub) break
      path.push(sub.sub)
      parts = sub.parts
    }
    const shutOnes = [one.group, ...path].filter((group): group is string => !!group && !isOpen(group))
    if (shutOnes.length) setOpened((was) => ({ ...was, ...Object.fromEntries(shutOnes.map((group) => [group, true])) }))
    return true
  }
  const moveInto = (group: string, ids: string[]): boolean => {
    // Onto the list's own name in the path bar: out of every folder, to the list itself.
    if (group === TOP) {
      const these = inOrder(ids.filter((id) => groupOf(layout, id)))
      if (!these.length) return (refuse('Already in no folder'), true)
      commit(moveMany(layout, these, { group: null, after: layout.top.filter((one) => !these.includes(one)).at(-1) ?? null }), 'separate', `Moved ${notes(these.length)} out of its folder`)
      return true
    }
    const target = list.find((one) => one.id === group)
    const these = inOrder(ids.filter((id) => groupOf(layout, id) !== group))
    if (!target || !layout.groups[group]) return false
    if (!these.length) return (refuse(`Already in ${target.name}`), true)
    const picked = new Set(these)
    commit(moveMany(layout, these, { group, after: (layout.groups[group] ?? []).filter((one) => !picked.has(one)).at(-1) ?? null }), 'gather', `Moved ${notes(these.length)} to ${target.name}`)
    return true
  }
  const newFolder = (): void => newFolderHere(null)
  const home = (id: string): NoteGroup | null => {
    for (let at = groupOf(layout, id), up = 0; at && up < 8; at = groupOf(layout, KEY + at), up++) if (folders.has(at)) return info.get(at) ?? null
    return null
  }
  return { rows: shown ? rowsOf(layout) : null, tiles, step, menu, gatherNew, groupNew, ungroup, folds, reveal, moveInto, newFolder, home }
}

/** What Start fresh put away in a folder, said where the folder's things would be, with "Bring them back" (Undo, ⌘Z). */
function PutAwayHere({ folder }: { folder: string }): React.JSX.Element | null {
  const [away, setAway] = useState<{ pages: number; gems: number; notes: number } | null>(null)
  const read = (): void => void call<{ pages: number; gems: number; notes: number }>('fresh:away-in', folder).then(setAway, () => setAway(null))
  useEffect(read, [folder]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!away) return null
  const parts = [away.pages && plural(away.pages, 'page'), away.gems && plural(away.gems, 'gem'), away.notes && plural(away.notes, 'note')].filter(Boolean)
  if (!parts.length) return null
  const back = (): void => void call<number>('fresh:back', 'contents', folder).then(() => {
    chime('unshelve')
    read()
    toast(`Brought back ${parts.join(', ')}`, () => void call('fresh:unback', 'contents', folder).then(() => (chime('away'), read())))
  })
  return (
    <div data-folder-away className="list-edge my-6 flex items-center gap-4 rounded-[0.875rem] border bg-foreground/[0.03] px-4 py-3">
      <p className="min-w-0 flex-1 text-body text-foreground"><strong className="font-semibold">{parts.join(', ')} put away here</strong> <span className="text-(--mf-muted-strong)">by Start fresh: out of the Feed, Home and Review until you bring them back.</span></p>
      <Button size="sm" className="shrink-0 cursor-pointer" onClick={back}>Bring them back</Button>
    </div>
  )
}
