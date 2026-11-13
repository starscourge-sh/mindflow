import { notePowers } from './note-powers'
import { madeByLink } from '@/extensions/note-link'
import { PropertyStrip } from './property-strip'
import { SimilarNotes } from './similar-notes'
import { SameBook, pdfIn } from '@/components/pdf/same-book'
import { propertySorts } from '@/lib/property-sorts'
import { ReadsIn } from '@/lib/reads-in'
import { Fragment, cloneElement, startTransition, useEffect, useRef, useState } from 'react'
import { menuIcon } from '@/components/ui/menu-icon-rules'
import { useGroups } from '@/lib/groups'
import { SECTIONS } from './places'
import { spring, still } from '@/lib/motion'
import type { Editor, JSONContent } from '@tiptap/core'
import { Archive, Tag } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import { motion } from 'motion/react'

import { HaligtreeEditor } from '../haligtree'
import { ASKS, CAPTURE_TYPES, CaptureKindPicker, byKind, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { SourceFoot } from './source-page'
import { openSource, voiceOf } from '@/lib/sources'
import { Proofread } from './proofread'
import { RecentIsland } from './recent-island'
import { askProofread } from '@/lib/grammar'
import { CaptureList, fieldOf, captureEntry, captureMenu, captureWays, inInboxWindow, selectionWays, tagCaptures, useCaptures, whereFrom, type CaptureMeta } from '../capture-list'
import { tagTint } from './tag-icon'
import { AGES, Display, FilterChips, arrange, islandsOn, period, useView, type Choice, type Density, type Facet, type View } from './display'
import { useIslands, useShowOpen, type IslandState } from './islands'
import { GraphChip, InboxGraph, useGraphShown } from './inbox-graph'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { EventSource } from './calendar-events'
import { Mentions } from './mentions'
import { DEALT_TOO, EXITS, STATUS_ICON, captureKey, statusSaid, noteLinkText, exit, exitMany, toWriting, follow } from '@/lib/capture-links'
import { hoursSaid } from '@/lib/day-plan'
import { useKept, useNav as useNavNow } from '@/lib/nav'
import { Switch } from '@/components/ui/switch'
import { splitTags, unloaded, useInboxDays, useLastAsked, useLive, haligtree, type Settings, type Task, type TaskFull } from '@/lib/haligtree'
import { makeTasks, oneTask, picked, taskName } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { manyTaskItems } from './late-tasks'
import { binItem, moveToBin, useCameBack } from '@/lib/to-bin'
import { ShowInListContext, useShowInList } from '@/lib/show-in-list'
import { useSameWords } from '@/lib/same-words'
import { Apart } from '@/lib/apart'
import { chime, pageShown, pageTurn } from '@/lib/sound'
import { Empty, focusField, Island, Page, Prop, Props, Remembered, Rolling, refuse, toast, useListKeys, useReadKey, typing, pin, Stepper, startAt, showTopTitle, Pressed, quietly, askClearWho } from './ui'
import { Term } from './term'
import { GlossTimeline, PageThoughts, useRowGloss } from './gloss-line'
import { ThoughtDock } from './thought-bar'
import { RemindMe, SourceRow, sourceField } from './items-view'
import { openPdf } from '@/components/pdf/pdf-reader'
import { bookOf } from '@/lib/pdf-in'
import { BookOpen, Quote } from 'lucide-react'
import { keepAsking } from './questions-view'
import { ReadThrough } from './read-through'
import { enqueue, readQueue } from '@/lib/reading-queue'
import { showDetails } from '@/lib/reading'
import { MergeInto, MergePicker } from './merge-picker'
import { decideDay, openPass } from './pass'
import { InboxLines } from './inbox-lines'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { keyFor } from '@/lib/keys'
import { Tip } from '@/components/haligtree/ui'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import TrashIcon from '@/components/ui/trash-icon'
import { Aliases, KindFields, LocalGraph, NoteHeader, PlaceChip, TopicName, WritingSpent } from './note-extras'
import { ListSearch, NoteRail, PaneButtons, Peek, matches } from './note-list'
import { archive, changeKind, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { askBook } from '@/lib/books'
import { useOpened } from '@/lib/nav'
import { readAhead, readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { NoteComing } from './note-coming'
import { Rest } from './scenery'
import { InboxBinned, InboxZero, useJustCleared } from './inbox-zero'
import { PutAwayLine } from './put-away'
import { Example } from './example'
import { LIFECYCLE } from './page-hint'
import { exampleArchived, exampleDiscarded, exampleInbox, exampleLookups } from '@/lib/examples'
import { headword, letterOf } from '@/lib/headword'
import { flat as flatMenu, type MenuItem, type RowItem } from './row-menu'
import { PinnedQuestions, clueInto } from './pinned-questions'
import { Board, useBoard } from './board-view'
import { dayjs, num } from '../../../../main/dates'
import { Signed } from './signature'
import { SessionFooter } from './session-footer'
import { NoteSize } from '@/components/count/note-size'
import { keepTitle, useHere, usePane } from '@/lib/split'
import { ShowAgain, TaskDetail, completeTask, useTaskNow } from './tasks-view'
import { useTaskTime } from './task-time'
import { MadeChip, MadeCue, SnoozedChip, TASK_KIND, TaskStateMenu, becameSaid, doneTasks, emptyFor, fromSaid, showsTask, taskEntry, taskGroups, taskRow, useMadeShown, useSources, useTaskState, type Row } from './everything'
import { ArchiveRestore, CloudSun, Download, Eye, EyeOff, FileText, Tag as Hash, Laptop, Orbit, Bookmark as Pin, Timer, Trash2, X } from '@/components/ui/icons'
import { menuOpen } from '@/lib/menu-keys'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/**
 * Captures: the raw tier. A list in the middle and the open one on the right,
 * with its properties and its exits. `focus` opens one straight away, for when
 * search or a tag sent you here.
 */
/** What waits in the Inbox: what has no exit yet; archived is kept, out of sight, so not waiting here. */
export const keepInbox = (capture: CaptureMeta): boolean => capture.status === 'open' && !capture.archivedAt
/** With "Show dealt with too": every note kept and every task, the Bin aside. */
const keepEverything = (capture: CaptureMeta): boolean => capture.status !== 'discarded'

export function CapturesView({ title, keep: given, focus, onOpen, archived = false, inbox: inboxPage = false, lookups: lookupsPage = false, lead: given_lead, said }: {
  title: string
  /** Questions › Looked up: the words and quick questions you looked up, kept under their own name and filed A to Z. */
  lookups?: boolean
  /** A line on top of the list saying where you are: Questions' own, on its Looked up list. */
  said?: React.ReactNode
  /** Shown at the line's left, as the Inbox's switch is: Questions' filters on the Looked up list. */
  lead?: React.ReactNode
  keep: (capture: CaptureMeta) => boolean
  focus?: string
  /** The Archived view: what is out of sight, and only that. */
  archived?: boolean
  /** The Inbox: with "Show dealt with too" on, everything (once G L), the tasks too, its kind chips filtering all of it. */
  inbox?: boolean
  /** Go to another thing: a nugget it became, a page that links to it. */
  onOpen?: (type: string, id: string) => void
}): React.JSX.Element {
  const all = useCaptures(true)
  // "Show dealt with too", kept in the step: off each time the Inbox is opened, on for a link to
  // something sorted (home.tsx sends Everything's links here with tab 'sorted'); Back finds it as it was.
  const nav = useNavNow()
  const [sortedToo, setSortedToo] = useState(nav?.here.tab === 'sorted')
  useKept('tab', sortedToo ? 'sorted' : 'waiting', (tab) => setSortedToo(tab === 'sorted'), 'waiting')
  // The older captures, listed alone: on top, with the list's start in sight. Esc, the line's own
  // “Back to the last … days” and Back all return to the recent ones.
  // Which of the two lists is on show is the step's own, never this page's: two tabs on the Inbox share one page
  // (home.tsx), and kept here, a note older than the Inbox's days opened in one tab turned the other tab's list into
  // the older ones, so back on that tab the list it was scrolled in was gone (the replay's long note is one of the
  // older ones: its first tab came back on 87 older captures, not the 6 recent ones it was scrolled in).
  const showOlder = (on: boolean): void => {
    chime(on ? 'open' : 'fold')
    setChosen([])
    turned.current = on
    if (!nav) return setOlderAsked(on)
    if (on) nav.step({ tab: OLDER })
    // Over an older note sent here, the recent ones asked for are said in the step, or the note would bring its own back.
    else if (nav.here.tab === OLDER || focusOlder) nav.step({ tab: focusOlder ? RECENT : undefined })
  }
  const everything = inboxPage && sortedToo
  const keep = everything ? keepEverything : given
  // The Inbox lists the last few days (Settings' “Inbox shows”); the older open
  // ones wait behind one line at the list's end, which lists them alone.
  const days = useInboxDays()
  const windowed = inboxPage && !everything && days > 0
  const older = windowed ? all.filter((one) => keep(one) && !inInboxWindow(one, days)) : []
  // Going through the older ones is a step of its own (Back and Forward, the mouse's side buttons), kept as the step's
  // tab. Sent to one (a link, a tag's page, ⌘K, Pinned), the list it is in is the one shown, older or newer, so its row
  // is there beside it. Away from the panes (no steps to keep it in), the page's own.
  const [olderAsked, setOlderAsked] = useState(false)
  const focusOlder = !!focus && older.some((one) => one.id === focus)
  const olderShown = older.length > 0 && (nav ? nav.here.tab === OLDER || (focusOlder && nav.here.tab !== RECENT) : olderAsked)
  const inView = (one: CaptureMeta): boolean => !windowed || inInboxWindow(one, days) !== olderShown
  // Pressed at the list's end, the older ones are read from their start: the line saying what they are, at the top.
  // Only when pressed: a tab or a step shown again on them keeps the place it was left at (panes.tsx).
  const turned = useRef(false)
  useEffect(() => {
    if (olderShown && turned.current) document.querySelector(inPane ? `[data-pane="${inPane}"] [data-inbox-older="shown"]` : '[data-inbox-older="shown"]')?.scrollIntoView({ block: 'nearest' })
    turned.current = false
  }, [olderShown]) // eslint-disable-line react-hooks/exhaustive-deps
  // Esc with nothing open and nothing picked: back to the recent ones.
  useEffect(() => {
    if (!olderShown) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || open || task || chosen.length || (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], [role="menu"], [role="dialog"]')) return
      event.preventDefault()
      showOlder(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Everything: every task too, as a row of its own kind; to do, done or both, as chosen.
  const tasks = useLive(() => (everything ? haligtree.tasks() : Promise.resolve([] as Task[])), [] as Task[], [everything], undefined, 'everything-tasks')
  const [taskState, setTaskState] = useTaskState()
  const taskOf = (id: string | null | undefined): Task | undefined => (everything && id ? tasks.find((one) => one.id === id) : undefined)
  // A task caught in the box goes by the same Open, Done or Both as a task: one
  // still in the inbox is to do, one dealt with (resolved, made a gem) is done.
  const todoShows = (one: CaptureMeta): boolean => !everything || one.kind !== 'todo' || taskState === 'all' || (taskState === 'open') === (one.status === 'open')
  // A note made into a task that is now in the Bin went there with it: it lives on only as that task.
  const sources = useSources(everything)
  const binnedWith = (one: CaptureMeta): boolean => everything && one.status === 'resolved' && sources.binned.has(one.id)
  // Asked for by the chip, a note made into a live task shows whatever the task's state.
  const [madeShown, setMadeShown] = useMadeShown()
  const kept: Row[] = [...all.filter(keep).filter(inView).filter((one) => (todoShows(one) || (madeShown && sources.became.has(one.id))) && !binnedWith(one)), ...(everything ? tasks.filter(showsTask(taskState)).map(taskRow) : [])]
  // Nothing of yours here yet: the page as it will look, with a few made-up notes.
  // Lookups and Archived: whenever the list is empty, whatever has been asked or archived before (words in the Bin say nothing here).
  const lookups = lookupsPage
  const examples = unloaded(all) || kept.length || (all.length && !archived && !lookups) || (everything && (unloaded(tasks) || tasks.length)) ? [] : archived ? exampleArchived() : lookups ? exampleLookups() : [...exampleInbox(), ...exampleDiscarded()].filter(keep)
  // Its own Display is kept under the name it had as All captures, so how you set it stays.
  const { groups: every, display, chips, density, view, setView, move, moveBy, island, ownUnread } = useCaptureDisplay(everything ? 'captures:All captures' : lookups ? LOOKED_UP : `captures:${title}`, kept, undefined, archived,
    // Open, Done or Both, on the Task chip itself: a choice about tasks, worn by them.
    everything ? <TaskStateMenu state={taskState} onState={(next) => (setTaskState(next), setChosen([]))} /> : undefined)
  // A note made into a task lives on as the task: hidden for it, unless asked
  // for by the chip, or by choosing Resolved under Status in Display.
  const madeInto = (one: Row): boolean => everything && !one.task && one.status === 'resolved' && !!sources.became.get(one.id)?.length
  const showMade = madeShown || !!view.filter.status?.includes('resolved')
  const madeHidden = showMade ? 0 : every.reduce((sum, [, list]) => sum + list.filter(madeInto).length, 0)
  const sorted: [string, Row[]][] = madeHidden ? every.map(([name, list]) => [name, list.filter((one) => !madeInto(one))] as [string, Row[]]).filter(([, list]) => list.length) : every
  const madeAny = everything && kept.some(madeInto)
  // Tasks alone (the filter, or nothing else to show) are grouped as Today and Upcoming group them.
  const listed = sorted.flatMap(([, list]) => list) as Row[]
  const kinds = view.filter.kind ?? []
  const arranged: [string, Row[]][] = everything && listed.length > 0 && listed.some((one) => one.task) && listed.every((one) => one.task || one.kind === 'todo') && view.sort !== 'manual' ? taskGroups(listed) : sorted
  const now = useTaskNow()
  // The time on the tasks among these and the session running on one (task-time.tsx).
  const taskTime = useTaskTime()
  // The list's width: beside the note, over the whole page, or a rail of pictures.
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  // Opened from elsewhere with its words already read (pressed a moment ago): on them from the first frame.
  const [open, setOpen] = useState<Capture | null>(() => (focus ? readNow<Capture>('capture', focus) ?? null : null))
  // The one asked for while its words are read (note-coming.tsx).
  const [coming, setComing] = useState<string | null>(() => (focus && !open ? focus : null))
  // A task open in Everything, in the pane Upcoming opens it in.
  const [task, setTask] = useState<TaskFull | null>(null)
  const spread = pane === 'wide' && !open && !task
  const narrowed = spread && query.trim() ? arranged.map(([name, list]) => [name, list.filter((one) => matches(one.label, query, one.fields))] as [string, Row[]]).filter(([, list]) => list.length) : arranged
  // The older ones fold and show more on their own: an older note open in another tab, shown past "Show more" among
  // them, opened the recent ones' island of the same kind as well ("Show 1 more" was "Show fewer" back on that tab).
  const olderIsland = useIslands(`captures:${title}:older`, islandsOn(view) && (density === 'list' || density === 'compact'))
  const { groups, islands } = (olderShown ? olderIsland : island)(narrowed)
  // Counted whole, islands or not: a folded island still holds its notes.
  const counted = narrowed.reduce((sum, [, list]) => sum + list.length, 0)
  // Graph, beside the Inbox's kinds: what you have been capturing, as a map.
  const [graphOn, setGraphed] = useGraphShown('inbox')
  const graphed = title === 'Inbox' && graphOn && counted > 0
  const shown: Row[] = groups.flatMap(([, list]) => list)
  // The whole list, rows behind "Show N more" and in a folded island too: what ⌘A,
  // "Select all" and the open note's "6 / 147" count. A step past a group's first few shows more of it.
  const whole: Row[] = narrowed.flatMap(([, list]) => list)
  const stepTo = (to: number): void => void (whole[to] && pick(whole[to].id))
  // The Inbox emptied in front of you: its moment, not the quiet empty page.
  // Not watched while "Show dealt with too" is on: the waiting list is then not on screen, and its
  // going out of sight is not it emptying (that once played the Inbox-cleared chord).
  // Every open one, older ones too: one growing older than the Inbox's days has not been dealt with.
  const cleared = useJustCleared(title === 'Inbox' && !everything ? all.filter(keep) : [], all, !unloaded(all) && !everything)
  // Spread out, a click looks at a note beside the list; Enter opens it.
  const [peek, setPeek] = useState<string | null>(null)
  // However it was opened, the open one's row shows: its island unfolded, past "Show more".
  useShowOpen(spread ? peek : coming ?? open?.id ?? task?.id, narrowed, shown, islands)
  // An earlier version, shown in place of the editor while you look back.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  // Bumped when the words change under the editor (a version restored), so it
  // opens again on what is there now.
  const [rev, setRev] = useState(0)
  // The capture as first written, shown in place of the editor, or null.
  const [first, setFirst] = useState<unknown>(null)
  useEffect(() => setFirst(null), [open?.id])
  // Only the last pick lands: a late answer for the row before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void => {
    // Opening a note brings the list back beside it.
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    // In Everything an id may be a task's: it opens where Upcoming opens one.
    // Read already (the press started it): opened now, not a round trip later.
    const ready = readNow<Capture>('capture', id)
    // Not read yet: its pane and name at once, never the note before under its name.
    const note = (): void => (ready ? (asked(), setComing(null), setTask(null), setOpen(ready)) : (id !== open?.id && setComing(id), asked(readFresh('capture', id, window.api.captures.get), (one) => (setComing(null), setTask(null), setOpen(one)))))
    const known = everything && taskOf(id) ? readNow<TaskFull>('task', id) : undefined
    if (known) return (asked(), setComing(null), setOpen(null), setTask(known))
    if (everything && (taskOf(id) || !all.some((one) => one.id === id)))
      return asked(readFresh('task', id, haligtree.task), (found) => (found ? (setComing(null), setOpen(null), setTask(found)) : note()))
    note()
  }
  // A row pressed: the page turns on the press, as every list's does, not once
  // the note has been read. A turn that waited for the read came after the
  // row's own click: two sounds for one open, and a click alone for a task.
  const pickRow = (id: string): void => (pageTurn(false, id), pick(id))
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? shown[Math.max(0, cursor)]?.id ?? null)
      asked()
      setComing(null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) asked(window.api.captures.get(peek), setOpen)
    setView({ ...view, pane: next })
  }
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('captures', open?.id, open?.body, (id, words, wordsBase, markdown) => window.api.captures.save(id, { words, wordsBase, markdown }))
  // The open note's editor, which its board, when shown, edits in its place.
  const [editor, setEditor] = useState<Editor | null>(null)
  // Opened onto one note, the note is drawn first and the list beside it the
  // moment after, so its words are not kept waiting behind every row.
  const [listShown, setListShown] = useState(!focus)
  useEffect(() => {
    if (listShown) return
    // After the frame the note is drawn in: a frame, then the task after it.
    let frame = 0
    let after = 0
    const show = (): void => void (frame = requestAnimationFrame(() => void (after = window.setTimeout(() => startTransition(() => setListShown(true)), 0))))
    const late = editor || task ? 0 : window.setTimeout(show, 400)
    if (editor || task) show()
    return () => (clearTimeout(late), clearTimeout(after), cancelAnimationFrame(frame))
  }, [editor, task, listShown])
  const board = useBoard('captures', open?.id, editor, open?.fields)
  const boardShown = board.on && !past && first === null && !!editor && !editor.isDestroyed
  // A board needs the room: the list and the properties step aside while it
  // shows, each a click away, and come back with the note.
  const [listOut, setListOut] = useState(false)
  const [propsOut, setPropsOut] = useState(false)
  const [tools, setTools] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setListOut(false)
    setPropsOut(false)
  }, [boardShown])
  // Split, each pane keeps its own note's name; the top bar shows the front one's.
  const inPane = usePane()
  const sayTitle = (title: string | null): void => void (keepTitle(inPane, title) && showTopTitle(title))
  // The note's name over the page, not its first heading, which the hidden note reports.
  const onBoard = useRef(false)
  onBoard.current = boardShown
  // Never a private note's: titles show in a screen share.
  const opened = all.find((one) => one.id === open?.id)
  const label = opened && !opened.private ? opened.label : null
  useEffect(() => {
    if (!boardShown) return
    sayTitle(label)
    return () => sayTitle(null)
  }, [boardShown, label])
  const [cursor, setCursor] = useListKeys(shown.length, {
    onOpen: (index) => pick(shown[index].id),
    opened: shown.findIndex((one) => one.id === (coming ?? open?.id ?? task?.id)),
    onExtend: (from, to) => picking.extend(shown[from]?.id, shown[to].id),
    // Spread out, Escape empties the search, and that is all: it never puts
    // the note away or changes the layout. ⌘[ is the way back.
    onEscape: () => spread && query && setQuery('')
  })
  useEffect(() => void (spread && shown[cursor] && setPeek(shown[cursor].id)), [cursor, spread]) // eslint-disable-line react-hooks/exhaustive-deps
  // A search cleared: the keyboard back on the one looked at, and it in view, wherever it is in the whole list.
  useEffect(() => void (!query && spread && peek && setCursor(shown.findIndex((one) => one.id === peek))), [query]) // eslint-disable-line react-hooks/exhaustive-deps
  // An exit undone: the capture open again, and the cursor on its row once the list has it back.
  const backTo = useRef<string | null>(null)
  const comeBack = (id: string): void => void ((backTo.current = id), pick(id))
  useEffect(() => {
    const at = backTo.current ? shown.findIndex((one) => one.id === backTo.current) : -1
    if (at >= 0) (setCursor(at), (backTo.current = null))
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps
  // Back from the Bin by Undo: open again if a note was open, else the keyboard on its row.
  useCameBack(whole.map((one) => one.id), (id) => (open || task ? pick(id) : setCursor(shown.findIndex((one) => one.id === id))))
  // “Show in list” (⌥⌘L): the list brought out, a filter or search that hides the open one cleared (Undo puts it back),
  // its island opened past “Show more”, then its row scrolled to the middle and lit once.
  const showOpen = useShowInList(open?.id ?? task?.id, () => {
    const id = open?.id ?? task?.id
    const hidden = !whole.some((one) => one.id === id) && Object.values(view.filter).some((list) => list?.length)
    const was = view
    if (hidden || view.pane !== 'list') setView({ ...view, pane: 'list', ...(hidden ? { filter: {} } : {}) })
    setListOut(false)
    if (query) setQuery('')
    if (hidden) toast('Filters cleared to show it in the list', () => setView(was))
    for (const [name, list] of narrowed) {
      const at = list.findIndex((one) => one.id === id)
      if (at >= 0 && islands?.[name]) islands[name].onShow(at)
    }
  })
  // ; on the row under the cursor, with nothing open: a thought written under it.
  const glossAfter = useRowGloss(shown[cursor]?.id, !open && !task && !shown[cursor]?.task)
  const peeked = spread ? all.find((one) => one.id === peek) : undefined
  // Reading through what is shown, one at a time with nothing else on screen.
  const [readFrom, setReadFrom] = useState<number | null>(null)
  // Notes only: a task is not read through.
  const readable = everything ? shown.filter((one) => !one.task) : shown
  const readStart = (): number => startAt(readable, open?.id, Math.max(0, readable.indexOf(shown[cursor])))
  useReadKey(() => setReadFrom(readStart()), readable.length)
  // x selects, as in Linear, for an exit on many at once.
  const [chosen, setChosen] = useState<string[]>([])
  // ⌥↑ and ⌥↓ (or ⌥K and ⌥J) move the row under the cursor in your own order.
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (!event.altKey || event.metaKey || event.ctrlKey || typing()) return
      const by = event.key === 'ArrowUp' || event.code === 'KeyK' ? -1 : event.key === 'ArrowDown' || event.code === 'KeyJ' ? 1 : 0
      const row = shown[cursor]
      if (!by || !row) return
      event.preventDefault()
      if (moveBy(shown.map((one) => one.id), row.id, by)) setCursor(cursor + by)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const lastKey = useRef('')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      // Not a chord, nor the letter after G: G R is "go to Review", not
      // "resolve this". This listener runs before the window's G handler, so
      // it tracks the G itself.
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Shift') return
      // The key after G finishes the pair, so G G does not also eat the next key.
      const afterG = lastKey.current === 'g'
      lastKey.current = afterG ? '' : event.key.toLowerCase()
      if (afterG) return
      // Escape lets a selection go, the way Linear's does.
      // Taken first, so the list does not also close what is open.
      // An open menu takes its own Escape: closing it keeps what is picked.
      if (event.key === 'Escape' && chosen.length && !menuOpen()) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      // A menu that is open takes the keys its own lines show (row-menu.tsx), on what it was opened for: the list
      // under it stands down, or one press took the way out twice, once here and once there, and the second said no.
      if (menuOpen()) return
      // P, W, R, D and H take that way out on the row under the cursor, as the menu says.
      // Shift alone is not an exit: Shift+R is half of G R typed in capitals.
      const one = !event.shiftKey && EXITS.find((e) => e.key === event.key)
      // With rows picked, the key is the selection's, never the cursor's row: every picked capture still in the Inbox
      // takes it, as from the selection's menu, with one notice that counts them and one Undo. D is ⌫: whatever is picked.
      if (one && chosen.length) {
        // Tasks alone are picked: the key is theirs (W, a week on), not this list's.
        if (!inbox.length) return
        event.preventDefault()
        return one.status === 'discarded' ? toBin(chosen) : exitPicked(one.status)
      }
      if (one && shown[cursor]?.status === 'open' && !shown[cursor].task) return void exit(shown[cursor].id, one.status)
      // E marks the task under the cursor done, as it does in Today.
      const doing = shown[cursor]?.task ?? (cursor < 0 ? taskOf(task?.id) : undefined)
      if (event.key === 'e' && !event.shiftKey && doing) return void (doing.status === 'open' ? completeTask(doing) : chime('nope'))
      if (event.key !== 'x') return
      const capture = shown[cursor]
      if (capture) picking.toggle(capture.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // Several made one task, from the bar or ⌘K: its name starts as the first one's title.
  const makeOne = (): void => {
    const ids = chosen.filter((id) => !taskOf(id))
    void oneTask(ids, all.find((capture) => capture.id === ids[0])?.label ?? '').then((made) => made && setChosen([]))
  }
  // ⌘A picks every row in the list, as Finder does, even those an island keeps out of sight; Escape lets them go.
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string; status?: string }[] =>
    ids.map((id) => (taskOf(id) ? { type: 'task', id, status: taskOf(id)!.status } : { type: 'capture', id, status: all.find((one) => one.id === id)?.status }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => whole.map((one) => one.id), chosen, setChosen, { here, onDelete: toBin, current: () => shown[cursor]?.id, titleOf: (id) => all.find((one) => one.id === id)?.label ?? taskOf(id)?.title })
  const allPicked = whole.length > 0 && whole.every((one) => chosen.includes(one.id))
  // What is picked, apart: the notes, which take a note's actions, and the tasks.
  const notes = chosen.filter((id) => !taskOf(id))
  const inbox = notes.filter((id) => all.find((one) => one.id === id)?.status === 'open')
  const picks = chosen.flatMap((id) => taskOf(id) ?? [])
  const manyWays = selectionWays(inbox, () => setChosen([]))
  const doneEach = (): void => void doneTasks(picks.filter((one) => one.status === 'open')).then(() => setChosen([]))
  // ⌘-click, ⇧-click, ⇧↑ and ⇧↓ pick as Finder does; x is a ⌘-click on the row under the cursor.
  const picking = usePicking(shown.map((one) => one.id), chosen, setChosen)
  // A task for each one picked, made as "Make it a task" makes one.
  const makeEach = (): void => {
    const notes = chosen.flatMap((id) => {
      const capture = all.find((one) => one.id === id)
      return capture ? [{ id, title: capture.label, private: !!capture.private, capture: true as const, open: capture.status === 'open' }] : []
    })
    void makeTasks(notes).then((made) => made && setChosen([]))
  }
  // Tagged all at once, asked by name; one undo takes the tag off them again.
  const tagEach = (): void => {
    const ids = notes
    void tagCaptures(ids)
  }
  // Every picked capture still in the Inbox takes a way out together (a key, the selection's menu, ⌘K): one function.
  const exitPicked = (status: string): void => {
    if (!inbox.length) return refuse('Nothing changed: none of the picked captures is still in the Inbox')
    void exitMany(inbox, status).then((went) => went && setChosen([]))
  }
  useEffect(() => {
    picked.ids = chosen
    picked.inbox = inbox
    // The capture the keys are on, with none open: ⌘K offers its ways out too.
    const lit = here() && !open && !task ? shown[cursor] : undefined
    picked.lit = lit && !lit.task ? { id: lit.id, kind: lit.kind, status: lit.status } : null
    const onAsk = (): void => void (chosen.length > 1 && makeOne())
    const onExit = (event: Event): void => exitPicked((event as CustomEvent<string>).detail)
    window.addEventListener('haligtree:one-task', onAsk)
    window.addEventListener('haligtree:exit-picked', onExit)
    return () => {
      window.removeEventListener('haligtree:one-task', onAsk)
      window.removeEventListener('haligtree:exit-picked', onExit)
      picked.ids = []
      picked.inbox = []
      picked.lit = null
    }
  })
  // A capture (or every picked one, it among them) carried onto Writing or one of its folders in the sidebar (split-drop.tsx).
  useEffect(() => {
    const onDrop = (event: Event): void => {
      const { ids, folder } = (event as CustomEvent<{ ids: string[]; folder: string | null }>).detail
      const many = ids.length === 1 && chosen.includes(ids[0]) && chosen.length > 1
      void toWriting(many ? inbox : ids, folder).then((went) => went && many && setChosen([]))
    }
    window.addEventListener('haligtree:to-writing', onDrop)
    return () => window.removeEventListener('haligtree:to-writing', onDrop)
  }, [chosen, all]) // eslint-disable-line react-hooks/exhaustive-deps
  // A task's row: its tick, its day, its steps, and the task's own menu.
  // Where it came from, or what it became, said quietly in its line: a click opens it.
  const titleOf = (id: string): string => {
    const capture = all.find((one) => one.id === id)
    if (capture) return capture.private ? 'Private note' : capture.label || 'New note'
    const made = tasks.find((one) => one.id === id)
    return (made && (taskName(made.title).text || made.title)) || 'New note'
  }
  const withCue = (cue: React.ReactNode, rest: React.ReactNode): React.ReactNode => <>{cue}{rest ? <> · {rest}</> : null}</>
  const entryOf = everything ? (one: Row): ReturnType<typeof taskEntry> | undefined => {
    if (one.task) {
      const entry = taskEntry(one.task, { open: () => pick(one.id), now, time: taskTime })
      const from = (sources.from.get(one.id) ?? []).filter((id) => all.some((capture) => capture.id === id))
      return from.length ? { ...entry, sub: withCue(<MadeCue way="from" said={fromSaid(from.length)} kin={from.map((id) => ({ id, title: titleOf(id) }))} onOpen={pick} />, entry.sub) } : entry
    }
    const became = one.status === 'resolved' ? (sources.became.get(one.id) ?? []).filter((id) => tasks.some((made) => made.id === id)) : []
    if (!became.length) return undefined
    // In place of a plain "Resolved": what it became, then who said it and where it came from, as usual.
    const rest = [one.attribution, whereFrom(one.source, one.label)].filter(Boolean).join(' · ')
    return { ...captureEntry(one, pick), sub: withCue(<MadeCue way="became" said={becameSaid(became.length)} kin={became.map((id) => ({ id, title: titleOf(id) }))} onOpen={pick} />, rest) }
  } : undefined
  // Opening one, or putting it away, is a step Back returns from.
  useOpened(open?.id ?? task?.id, focus, pick, () => (asked(), setComing(null), setOpen(null), setTask(null)), { shown: shown.map((one) => one.id), kind: task ? 'task' : 'capture' })
  // The ones either side, read ahead for the stepper's ↓ and ↑.
  useEffect(() => {
    const at = whole.findIndex((one) => one.id === open?.id)
    if (at >= 0) readAhead('capture', [whole[at - 1], whole[at + 1]].filter((one) => one && !one.task).map((one) => one.id))
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A note opened: a page turned, as a book is (a quick run down the list turns only one).
  useEffect(() => void (open?.id && pageShown(open.id)), [open?.id])
  // The open capture as the list last saw it, so its status follows an exit.
  // Until the list is read, the note's own read stands in: sent here for one note, it never waits for the list.
  const listedOpen = all.find((capture) => capture.id === open?.id)
  // One hidden until a later day (a letter to future you, "@1y") is out of the list: read on its own, live,
  // so it still opens from the Calendar or a link, and its details show the day it comes back.
  const hiddenOpen = useLive(() => (open && !listedOpen && !unloaded(all) ? window.api.captures.get(open.id) : Promise.resolve(null)), null as Capture | null, [open?.id, !listedOpen && !unloaded(all)])
  const meta = listedOpen ?? (unloaded(all) ? open ?? undefined : hiddenOpen?.id === open?.id && hiddenOpen?.snoozedUntil ? hiddenOpen : undefined)
  // Sent here for one note: the list comes in whole beside it once drawn (Page's `apart`).
  const sent = !!focus && (coming ?? open?.id) === focus
  // Your own order too: drawn before it is read, a list in Custom order showed newest first for a frame.
  const listUnread = unloaded(all) || ownUnread || (everything && (unloaded(tasks) || !sources.ready))
  // What is around a note's words (who links to it, a thought on it) comes the frame after them.
  const later = useAfterFirstPaint()

  // The open capture dealt with (from its details or the chip over it): on to the next one, as mail does, rather than left on what is gone.
  const afterExit = (): void => {
    const at = shown.findIndex((one) => one.id === open?.id)
    const next = shown[at + 1] ?? shown[at - 1]
    if (next && next.id !== open?.id) pick(next.id)
    else setOpen(null)
  }

  return (
    // The list and the note open beside it come in together, once both are read (lib/reads-in.tsx): never the note, then the list.
    <ReadsIn className="contents">
      {/* Folded to a rail: by you, or by a board that needs the room. */}
      {open && (boardShown ? !listOut : pane === 'rail') ? (
        <NoteRail entries={shown.map((one) => entryOf?.(one) ?? captureEntry(one, pick))} cursor={cursor} selected={open.id} onPick={pickRow} onShow={() => (boardShown ? setListOut(true) : setPane('list'))} />
      ) : (
      <Page aside={!!open || !!task || !!coming}
        // The graph takes the page's height, as the Map does: a box of 290 pixels sat over as much empty page.
        fit={graphed}
        // Its count and Display come with the list: for Everything, with its tasks and which captures became them too.
        waiting={listUnread || !listShown}
        apart={sent}
        title={title}
        // What the Inbox holds, waiting only or dealt with too: a filter, so at the line's left, always in the same place, away from Go through and the views on the right.
        lead={inboxPage && !chosen.length ? (
          <Tip label={everything ? 'Every note and task, dealt with or not. Off: only what waits' : 'What you have dealt with too (resolved, saved as a gem, moved to Writing), and every task'}>
            <label data-sorted-too className="-ml-2 flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-control whitespace-nowrap text-foreground/85 hover:bg-accent/60">
              <Switch checked={everything} onCheckedChange={(on) => (setChosen([]), setSortedToo(on))} aria-label={DEALT_TOO} />
              {/* Its words only while the list has the page's width: beside a note (or one looked at, spread out) the switch alone. */}
              {!open && !task && !(spread && peek) ? DEALT_TOO : <span className="sr-only">{DEALT_TOO}</span>}
            </label>
          </Tip>
        ) : chosen.length ? undefined : given_lead}
        // The Inbox is a place to set things down, never a queue with a number on it.
        // What is picked always shows: the buttons may fold into ⋯ in a narrow window, the count never does.
        count={chosen.length || (title === 'Inbox' ? undefined : counted)}
        search={spread && !chosen.length && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder={`Search in ${title}`} />}
        unit={chosen.length ? ['selected', 'selected'] : undefined}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-1">
              {/* What is done most stays in the line; the rest wait under “More”, so the line fits beside an open note. */}
              {/* Tasks picked: done together, with one Undo. */}
              {picks.some((one) => one.status === 'open') && (
                <Tip label="Every picked task, done  E">
                  <Button variant="secondary" size="default" onClick={doneEach}>{picks.length === 1 ? 'Mark it done' : `Mark ${num(picks.filter((one) => one.status === 'open').length)} done`}</Button>
                </Tip>
              )}
              {notes.length > 0 && (
                <Tip label="A task for each, linked to its note">
                  <Button variant={picks.length ? 'ghost' : 'secondary'} size="default" onClick={makeEach}>{notes.length === 1 ? 'Make it a task' : `Make ${num(notes.length)} tasks`}</Button>
                </Tip>
              )}
              {notes.length > 0 && <Tip label="Done with them, and out of the Inbox  R"><Button variant="ghost" size="default" onClick={() => exitPicked('resolved')}>Resolve</Button></Tip>}
              <Tip label={`Into the Bin, where ${chosen.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
                <Button variant="ghost" size="default" onClick={() => toBin(chosen)}><Trash2 className="size-3.5" /> Move to the Bin</Button>
              </Tip>
              {/* A note's actions take the notes picked; the tasks among them are left as they are. */}
              {notes.length > 0 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="default">More…</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {notes.length > 1 && <DropdownMenuItem onSelect={makeOne}>Make one task</DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => void archive('captures', notes, !archived).then(() => setChosen([]))}>{archived ? 'Unarchive' : 'Archive'}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={tagEach}>Add a tag…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void enqueue(notes, false)}>Add to the queue</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void enqueue(notes, true)}>Read them next</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => askBook('copy', { refs: notes.map((id) => ({ table: 'captures' as const, id })) })}>Copy to book…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              {notes.length > 0 && <DatePicker value={null} placeholder="Date…" className="text-xs" onChange={(at) => at && void bulkUndoable(notes, { capturedAt: at }, `Dated ${num(notes.length)}`, 'noted')} />}
              {!allPicked && (
                <Tip label={everything ? 'Everything on show  ⌘A' : 'Every note on show  ⌘A'}>
                  <Button variant="ghost" size="default" onClick={selectAll}>Select all</Button>
                </Tip>
              )}
              <Tip label="Clear the selection  Esc">
              <Button variant="ghost" size="icon" aria-label="Clear the selection" onClick={() => (chime('off'), setChosen([]))}><X className="size-3.5" /></Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {shown.length > 1 && !spread && !open && <span className="hidden text-xs whitespace-nowrap @[48rem]/page:inline"><Pressed keys="X" /> to select</span>}
              {title === 'Inbox' ? (
                <GoThrough compact={!!open} canRead={shown.length > 0} onRead={() => setReadFrom(readStart())} />
              ) : (
                <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R">
                  <Button variant="ghost" size={open || task ? 'icon' : 'default'} aria-label="Read through" onClick={() => setReadFrom(readStart())} disabled={!readable.length}><AliveIcon icon={BookIcon} size={14} />{!open && !task && ' Read through'}</Button>
                </Tip>
              )}
              {display}
              <PaneButtons pane={spread ? 'wide' : 'list'} onPane={setPane} fold={(!!open && !boardShown) || !!task} />
            </span>
          )
        }
      >
        {/* Old captures put away on their own this morning: said here, with Undo. */}
        {title === 'Inbox' && <PutAwayLine onSee={() => window.api.openInHome('view', 'archived')} />}
        {/* Old captures to tidy and deciding day: quick capture only catches, so they wait here. */}
        {title === 'Inbox' && <InboxLines held={kept.length} />}
        {/* Going through the older ones: said on top, with the way back. */}
        {olderShown && <OlderLine days={days} older={older.length} shown onFlip={() => showOlder(false)} />}
        {everything ? (
          // What to see: tasks, notes, quotes… (several at once), and for tasks, to do or done.
          <div data-everything-filter className="list-words flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2.5 pb-2">
            {/* The kinds on their own line (wrapping when they must), which tasks show on the Task chip itself: nothing cut in half. */}
            <div className="w-full empty:hidden">{chips}</div>
            {/* Under them, what it does to the captures among them, as a box to tick: never one more kind. */}
            {madeAny && !(kinds.length === 1 && kinds[0] === 'task') && <MadeChip on={showMade} hidden={madeHidden} onChange={(on) => (setMadeShown(on), setChosen([]))} />}
            <SnoozedChip />
          </div>
        ) : (
          <div data-kind-chips className="list-words pt-4 pb-2 empty:hidden">{said}{title === 'Inbox' && kept.length > 0 ? cloneElement(chips ?? <span />, { extra: <GraphChip on={graphOn} onChange={setGraphed} /> }) : chips}</div>
        )}
        {/* Everything waits for its tasks and for which captures became them: drawn before, the made ones show, then hide, and the box above pops in. */}
        {everything && (unloaded(tasks) || !sources.ready) ? null : graphed ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4"><InboxGraph captures={narrowed.flatMap(([, list]) => list)} onOpen={onOpen ?? (() => undefined)} /></div>
        ) : (islands ? groups.length : shown.length) ? (!listShown ? null :
          <CaptureList groups={groups} islands={islands} density={density} selected={spread ? peek ?? undefined : coming ?? open?.id ?? task?.id} cursor={cursor} onCursor={setCursor} chosen={chosen}
            onPick={spread ? (id) => (taskOf(id) ? pickRow(id) : (setPeek(id), setCursor(shown.findIndex((one) => one.id === id)))) : pickRow} onOpen={spread ? pickRow : undefined}
            picking={picking} entryOf={entryOf}
            // Right-clicked among several picked, the menu speaks for all of them.
            menu={(capture, usual) => chosen.includes(capture.id) && chosen.length > 1 ? [
              // Tasks among them: done together. Notes: a note's actions, on the notes only.
              picks.some((one) => one.status === 'open') && { label: picks.length === 1 ? 'Mark the task done' : `Mark ${num(picks.filter((one) => one.status === 'open').length)} tasks done`, keys: 'E', run: doneEach },
              // Their day, priority and tags, as one task's menu has them; said as the tasks' only when notes are picked too.
              ...manyTaskItems(picks.map((one) => one.id), { mixed: notes.length > 0, after: () => setChosen([]) }),
              picks.length > 0 && 'separator',
              // Only those still in the inbox take a way out: the rest have taken theirs. What they can become first, each
              // with the key that does it on the selection, then being done with them (one list, capture-list.tsx).
              ...manyWays.filter((way) => way.id === 'promoted' || way.id === 'writing'),
              inbox.length > 0 && { label: inbox.length === 1 ? 'Make it a task' : `Make ${num(inbox.length)} tasks`, run: makeEach },
              inbox.length > 1 && { label: 'Make one task', hint: 'From all of them', run: makeOne },
              ...manyWays.filter((way) => way.id === 'question'),
              inbox.length > 0 && 'separator',
              ...manyWays.filter((way) => way.id === 'resolved'),
              notes.length > 0 && { label: `Add a tag to ${num(notes.length)}…`, run: tagEach },
              notes.length > 0 && { label: archived ? `Unarchive ${num(notes.length)}` : `Archive ${num(notes.length)}`, hint: archived ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('captures', notes, !archived).then(() => setChosen([])) },
              'separator',
              binItem(binRefs(chosen), () => setChosen([])),
              'separator',
              !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
              { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
            ] : [...usual, 'separator', { label: chosen.includes(capture.id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => picking.toggle(capture.id) }, !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll }]}
            onMove={(id, target, after) => move(kept.map((one) => one.id), id, target, after)} after={glossAfter} className={spread ? 'list-edge my-3' : 'list-edge my-2'} />
        ) : unloaded(all) ? null : examples.length ? (
          <Example tryIt={archived ? 'right-click any note and choose “Archive”. It is kept here, out of sight, never in the Bin.' : lookups ? 'press ⌘. and pick Word, or look a word up as you type it. It waits here, asked, until you write what it means.' : `press ⌘. in any app, write a thought, and send it with ⌘↵. It waits here until you come back to it. ${LIFECYCLE}`}>
            <CaptureList groups={[['', examples]]} density={density} cursor={-1} onPick={() => undefined} className="list-edge my-2" />
          </Example>
        ) : everything && (unloaded(tasks) || !shown.length) && !(spread && query.trim()) ? (unloaded(tasks) ? null : (() => {
          // Each filter's own empty page: what it would hold, and how to get some.
          const other = Object.entries(view.filter).some(([key, list]) => key !== 'kind' && list?.length)
          const said = emptyFor(kinds, taskState, other, madeHidden)
          return <Rest seed="inbox"><Empty title={said.title}>{said.body}</Empty></Rest>
        })()) : kept.length ? (
          <Empty title="Nothing matches">
            {spread && query.trim() ? 'No title here has those words. Escape clears the search.' : "The filters hide everything here. Clear them with the × above, or press F to change them."}
          </Empty>
        ) : archived ? (
          <Empty title="Nothing archived">
            {'Archive keeps a note out of sight, not in the Bin. Right-click any note, or ⌘K, to archive it; it waits here.'}
          </Empty>
        ) : (
          <Rest seed="inbox">
            {/* A new install has nothing that could have left yet. */}
            {title === 'Inbox' && cleared?.how === 'binned' ? (
              <InboxBinned left={cleared.left} />
            ) : title === 'Inbox' && cleared ? (
              <InboxZero onReview={() => window.api.openInHome('view', 'review', ':today')} onRead={() => readQueue(0)} />
            ) : title === 'Inbox' ? (
              older.length ? (
              <Empty title={`Nothing from the last ${days === 1 ? 'day' : `${days} days`}`}>
                {'Every newer capture has been dealt with. The older ones wait below, for when you want them.'}
              </Empty>
              ) :
              <Empty title={all.length ? 'Nothing waiting' : 'Your Inbox'}>
                {all.length ? <><strong>Written down, a thought can leave your head.</strong> Every capture has been dealt with. ⌘. catches the next one, from anywhere.</> : 'Press ⌘. in any app, write the thought, and send it with ⌘↵. It waits here until you come back to it.'}
              </Empty>
            ) : lookups ? (
              <Empty title="No word waiting for a meaning">
                {'A word or phrase saved as a Term waits here, asked, until you write what it means. Press ⌘. and type it, or ask “What is …?”. A question to carry for weeks belongs in Questions.'}
              </Empty>
            ) : (
              <Empty title="Nothing here yet">
                {'Press ⌘. in any app to catch a thought. It shows here once it is sent.'}
              </Empty>
            )}
          </Rest>
        )}
        {/* The older open captures, out of the list but never out of reach: one line at its end. */}
        {windowed && !olderShown && older.length > 0 && !graphed && <OlderLine days={days} older={older.length} onFlip={() => showOlder(true)} />}
      </Page>
      )}
      {readFrom !== null && (
        <ReadThrough
          items={readable.map((one) => ({ type: 'capture', id: one.id }))}
          start={readFrom}
          onClose={() => setReadFrom(null)}
          onEdit={(_, id) => {
            setReadFrom(null)
            pick(id)
          }}
        />
      )}
      {task && <ShowInListContext.Provider value={showOpen}><TaskDetail key={task.id} task={task} onClose={() => setTask(null)} onOpen={onOpen}
        top={<Stepper at={whole.findIndex((one) => one.id === task.id)} total={whole.length} onStep={stepTo} />} /></ShowInListContext.Provider>}
      {peeked && (
        <Peek entry={captureEntry(peeked, pick)} table="captures" onOpen={() => pick(peeked.id)}>
          <CaptureProps capture={peeked} onOpen={onOpen} className="border-t pt-3 @[40rem]/page:w-full @[40rem]/page:border-t @[40rem]/page:border-l-0" />
        </Peek>
      )}
      {coming && coming !== open?.id ? <NoteComing id={coming} title={all.find((one) => one.id === coming)?.label} /> : open && meta ? (
        // Opened in a window of its own, its place says so (lib/apart.tsx),
        // and only that window's editor saves it; back, it is read afresh.
        <ShowInListContext.Provider value={showOpen}><Apart type="capture" id={open.id} title={meta.label} hidden={!!meta.private}
          onBack={() => window.api.captures.get(open.id).then((found) => found && (setOpen(found), setRev((n) => n + 1)))}>
        {/* Slides to where the list leaves it room, when the list folds or comes back. */}
        <motion.div layout={still() ? false : 'position'} transition={spring.slow} data-open={open.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[16rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
          {/* A board stands as tall as the window, even above the properties in a narrow one. */}
          <div data-voice={meta.kind === 'todo' ? undefined : voiceOf({ type: 'capture', kind: meta.kind, attribution: meta.attribution, medium: meta.medium, label: meta.label, location: fieldOf(meta.fields, 'location') })} data-voice-edge className={`flex min-h-0 min-w-0 flex-1 flex-col pt-6 ${boardShown ? '!min-h-full' : ''}`}>
            {/* What you first caught, kept from the first edit on: read it
                beside what it has become, never lost to an edit. One click
                into the dots, so the row stays quiet. */}
            <NoteHeader table="captures" id={open.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
              board={board} details={!boardShown} size={past ? undefined : <NoteSize editor={editor} />}
              onRestored={() => void window.api.captures.get(open.id).then((found) => {
                setOpen(found)
                setRev((n) => n + 1)
              })}
              left={<ReadsIn apart reading={listUnread} className="contents" data-apart="stepper"><Stepper turns at={whole.findIndex((one) => one.id === open.id)} total={whole.length} onStep={stepTo} /></ReadsIn>}
              place={<CapturePlace capture={meta} onExit={afterExit} onBack={comeBack} />}
              edited={meta.editedAt} captured={meta.capturedAt}
              pinned={!!meta.pinnedAt} onPin={() => pin('captures', meta.id, !meta.pinnedAt)} copyKey={noteLinkText(meta.id, meta.label)}
              menu={[
                open.original ? { label: 'See the original', hint: 'As it was first written', run: () => (chime('rewind'), setFirst(open.original)) } : null,
                { label: 'Proofread', hint: 'Spelling, grammar and style, one at a time', run: askProofread },
                ...(boardShown ? [
                  'separator' as const,
                  { label: listOut ? 'Hide the list' : 'Show the list', run: () => (chime(listOut ? 'fold' : 'slide'), setListOut(!listOut)) },
                  { label: propsOut ? 'Hide properties' : 'Show properties', run: () => (chime(propsOut ? 'fold' : 'slide'), setPropsOut(!propsOut)) },
                  'separator' as const
                ] : []),
                ...captureDots(meta)
              ]}
              tools={boardShown ? <span ref={setTools} className="contents" /> : undefined}
              looking={first !== null ? (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  As first written
                  {/* Put back, not just looked at: the words now kept for the undo. */}
                  <Tip label="Make these the note's words again; Undo brings back how it reads now">
                    <Button data-restore-first variant="ghost" size="sm" className="text-foreground" onClick={() => void window.api.captures.get(open.id).then(async (now) => {
                      if (!now) return
                      const reload = (): Promise<void> => window.api.captures.get(open.id).then((found) => void (found && (setOpen(found), setRev((n) => n + 1))))
                      await window.api.captures.save(open.id, { body: first })
                      chime('rewind')
                      setFirst(null)
                      await reload()
                      quietly(() => void window.api.captures.save(open.id, { body: now.body }).then(() => (chime('undo'), reload())))
                    })}>Restore this version</Button>
                  </Tip>
                  <Tip label="Back to how it reads now">
                    {/* Read again, so the editor opens on its words now and never saves older ones over them. */}
                    <Button variant="ghost" size="icon-sm" aria-label="Back to now" onClick={() => void window.api.captures.get(open.id).then((found) => {
                      chime('fold')
                      setOpen(found)
                      setFirst(null)
                    })}><X className="size-3.5" /></Button>
                  </Tip>
                </span>
              ) : undefined} />
            {/* A meeting note says which event it is for, on its own line over its words. */}
            <EventSource id={open.id} onOpen={onOpen} />
            {/* A lookup that did not satisfy: said on the page itself, not only in the folded details. */}
            {meta.kind === 'word' && meta.status === 'open' && (
              <p data-chrome data-keep-asking-line className="note-column mb-1 flex flex-wrap items-center gap-1 text-control text-muted-foreground">
                <Orbit className="size-3.5 shrink-0" />
                Not what you were after?
                <Tip label="An open question, with what you looked up as its first clue">
                  <button type="button" data-keep-asking onClick={() => void keepAsking(open.id)}
                    className="rounded-md px-1 py-0.5 font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-foreground">Keep asking</button>
                </Tip>
              </p>
            )}
            {/* Made just now by a link to a name found nowhere: why it is empty, said over its words while it is new. */}
            {madeByLink(open.id) && (
              <p data-chrome data-made-by-link className="note-column mt-3 mb-1 text-body text-foreground">
                <strong className="font-semibold">A new note:</strong> {madeByLink(open.id)}
              </p>
            )}
            {past ? (
              <HaligtreeEditor
                key={`past-${open.id}-${past.key}`}
                defaultContent={(past.body as JSONContent | string | null) ?? ''}
                readOnly
                toolbar={false}
                handles={false}
                slash={false}
                outline={false}
                search={false}
                autofocus={false}
              />
            ) : first !== null ? (
              <HaligtreeEditor
                key={`first-${open.id}`}
                defaultContent={(first as JSONContent | string | null) ?? ''}
                readOnly
                toolbar={false}
                handles={false}
                slash={false}
                outline={false}
                search={false}
                autofocus={false}
              />
            ) : (
            <div className={boardShown ? 'hidden' : 'contents'}>
            <HaligtreeEditor
              key={`${open.id}-${rev}`}
              typewriter
              {...notePowers({ table: 'captures', id: open.id, kind: meta.kind, fields: meta.fields, text: meta.label, created: meta.capturedAt, updated: meta.editedAt, origin: { captureId: open.id, from: open.id }, cites: { who: meta.attribution, where: meta.medium }, onOpen: (type, id) => onOpen?.(type, id) })}
              // The bar names the note as its tab does (its own title, a vault note's, before its first line).
              onTitleOut={(line) => !onBoard.current && sayTitle(line && (label || line))}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              onOpenNote={(link, heading) => follow(link, (type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id)), heading)}
              after={<ReadsIn apart reading={!later}>
                {/* What sits under the words (its source, what links here) comes in whole, once its reads are in: a part arriving a beat late moved the foot from the page's bottom up under the words. */}
                {/* A quote signed at its foot: who said it, in a pen's hand. */}
                {meta.kind === 'quote' && meta.attribution && (
                  <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem] text-control text-muted-foreground">
                    {/* Shown, so it can be put right: a click opens the details on who said it. */}
                    <Tip label="Change who said it">
                      <button type="button" data-signed className="-mx-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-accent" onClick={(event) => {
                        const page = event.currentTarget.closest('.note-pane')
                        showDetails(true, inPane)
                        // Opened, and its group unfolded if folded shut, then the caret in it.
                        // Shown as a link to their page while it is filled: turned into its field first.
                        focusField(() => sourceField(page, 'source', '[data-note-source]'))
                      }}>
                        <Signed who={meta.attribution} where={meta.medium} year={fieldOf(meta.fields, 'year')} className="private-text" />
                      </button>
                    </Tip>
                  </div>
                )}
                {meta.kind !== 'todo' && <SourceFoot who={meta.attribution} where={meta.medium} quote={meta.kind === 'quote'} cite={{ table: 'captures', id: open.id, fields: meta.fields }} body={open.body} />}
                {/* Named after its page: offered, in place, to be named after its topic. */}
                <PageThoughts id={open.id} />
                {meta.kind === 'link' && <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem]"><TopicName id={open.id} /></div>}
                {later && <Mentions id={open.id} editor={editor} onOpen={(type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id))} />}
              </ReadsIn>}
              onReady={(ready) => (words.ready(ready), setEditor(ready))}
              onChange={words.save}
              foot={(editor) => <SessionFooter editor={editor} note={`capture-${open.id}`} whole={false} />}
            />
            {/* Proofread when asked from the note's menu, never checking as you write. */}
            <Proofread editor={editor} ask />
            </div>
            )}
            {boardShown && <Board key={`${open.id}-${rev}`} editor={editor} id={open.id} tools={tools} />}
            {/* A thought on it, pinned under the page, its earlier ones a click away. */}
            {/* From the first frame: its height is the same whatever it holds, and coming a frame late it pushed the page up. */}
            <ThoughtDock id={open.id} hidden={boardShown} />
          </div>
          {(!boardShown || propsOut) && <CaptureProps capture={meta} onOpen={onOpen} fold={!boardShown} onExit={afterExit} onBack={comeBack} />}
        </motion.div>
        </Apart></ShowInListContext.Provider>
      ) : null}
    </ReadsIn>
  )
}

/**
 * The Inbox's line for its older open captures: at the list's end, how many
 * and since when, with “Go through them” to list those alone; while they are
 * listed, on top, with the way back to the recent ones.
 */
/** The step's tab while the Inbox lists its older captures alone. */
const OLDER = 'older'
/** The recent ones asked for over an older note sent here ("Back to the last … days" with it open). */
const RECENT = 'recent'

function OlderLine({ days, older, shown = false, onFlip }: { days: number; older: number; shown?: boolean; onFlip: () => void }): React.JSX.Element {
  const since = dayjs().subtract(days, 'day').format('D MMMM')
  const link = 'font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60'
  return (
    <p data-inbox-older={shown ? 'shown' : 'line'} className={`mx-5 flex min-h-8 items-center text-body text-(--mf-muted-strong) ${shown ? 'mt-2' : 'mt-1 mb-6'}`}>
      <span className="min-w-0">
        {shown
          ? <><strong className="font-semibold text-foreground">{older === 1 ? '1 older capture' : `${num(older)} older captures`}</strong>, from before {since}.{' '}</>
          : <>{older === 1 ? '1 older capture' : `${num(older)} older captures`}, from before {since}{' · '}</>}
        <button type="button" className={link} onClick={onFlip}>{shown ? `Back to the last ${days === 1 ? 'day' : `${days} days`}` : 'Go through them'}</button>
      </span>
    </p>
  )
}

/**
 * The Inbox's ways through it, in one button: Tidy and Decide when there is
 * something for them (never with a count of what is left), and Read through.
 * The same button on the Inbox page and in quick capture's Inbox tab.
 */
export function GoThrough({ compact, canRead, onRead, className = '' }: { compact: boolean; canRead: boolean; onRead: () => void; className?: string }): React.JSX.Element {
  const waiting = useLive(haligtree.passWaiting, { tidy: 0, decide: 0 })
  const settings = useLive(haligtree.settings, null as Settings | null)
  const today = settings?.weeklyReview !== false && dayjs().day() === settings?.weeklyDay
  return (
    <DropdownMenu modal={false}>
      <Tip label={today && waiting.decide ? 'Today is deciding day' : 'Go through them: tag them so they are easy to find (Tidy), choose what to keep (Decide), or read them one at a time'}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={compact ? 'icon' : 'default'} aria-label="Go through…" className={`${today && waiting.decide ? 'text-[var(--tt-color-text-purple)]' : ''} ${className}`}>
            <AliveIcon icon={BookIcon} size={14} />{!compact && ' Go through…'}
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-64">
        {waiting.tidy > 0 && <DropdownMenuItem onSelect={() => openPass('tidy')}>Tidy recent captures</DropdownMenuItem>}
        {waiting.decide > 0 && <DropdownMenuItem onSelect={() => openPass('decide')}>{today ? 'Decide what to keep: today is deciding day' : `Decide what to keep (its day is ${decideDay(settings)})`}</DropdownMenuItem>}
        <DropdownMenuItem disabled={!canRead} onSelect={onRead}>Read through<DropdownMenuShortcut>{keyFor('⇧⌘R')}</DropdownMenuShortcut></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A capture's row menu in its note's dots, less what the row over it already shows: opening, the star, the link; and hiding it, which its details have. */
// The row's menu, the same lines (Hide until… opening beside it): only Open
// is left out, the note being open already. The header says Pin and Copy link itself.
export const captureDots = (capture: CaptureMeta): (MenuItem | { label: string; items: RowItem[] })[] =>
  captureMenu(capture).flatMap((item): (MenuItem | { label: string; items: RowItem[] })[] => (item && item !== 'separator' && 'items' in item ? [item] : flatMenu([item]))).filter((item) => !item || item === 'separator' || item.label !== 'Open')

/** The Inbox as the sidebar lists it: its mark and its colour. */
const INBOX = SECTIONS.find((one) => one.id === 'inbox')!

/**
 * Where an open capture is, and where it can go, on the capture itself: “Inbox” beside its place in the list, which
 * opens the same ways out its details list under “Where it goes” (one list, capture-list.tsx), Writing's folders
 * beside “Move to Writing”. One that has left the Inbox says where it went, with the way back.
 */
export function CapturePlace({ capture, onExit, onBack }: { capture: Pick<CaptureMeta, 'id' | 'kind' | 'status' | 'keptIn'>; onExit?: () => void; onBack?: (id: string) => void }): React.JSX.Element {
  const folders = useGroups('article')
  const [merging, setMerging] = useState(false)
  // ⌘K's “Merge into another note…” opens the picker here, on the capture it is about.
  useEffect(() => {
    const onAsk = (event: Event): void => void ((event as CustomEvent<string>).detail === capture.id && setMerging(true))
    window.addEventListener('haligtree:merge', onAsk)
    return () => window.removeEventListener('haligtree:merge', onAsk)
  }, [capture.id])
  const inInbox = capture.status === 'open'
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  const ways = captureWays(capture, { onExit, onBack, folders, merge: () => (chime('open'), setMerging(true)) })
  // What it can become, a rule, then the ways to be done with it; the menu puts the Bin last itself.
  const done = ways.findIndex((way) => way.id === 'resolved')
  return (
    <>
      <PlaceChip
        label={inInbox ? 'Inbox' : statusSaid(capture.status, capture.keptIn)}
        // The Inbox's own mark and colour, as the sidebar draws its row.
        icon={inInbox ? <INBOX.icon aria-hidden className="size-3.5 shrink-0" style={{ color: `var(--mf-icon-tint, var(--tt-color-text-${INBOX.tint}))` }} /> : <Status aria-hidden className="size-3.5 shrink-0" />}
        tip={inInbox ? 'Where it goes' : 'Where it went'}
        items={[{ heading: inInbox ? 'Where it goes' : 'Where it went' }, ...(done > 0 ? [...ways.slice(0, done), 'separator' as const, ...ways.slice(done)] : ways)]} />
      {merging && <MergePicker capture={capture} onClose={() => setMerging(false)} />}
    </>
  )
}

/** Status and the exits, then what the capture is, then where it came from. */
export function CaptureProps({ capture, onOpen, className, fold, onExit, onBack }: { capture: CaptureMeta; onOpen?: (type: string, id: string) => void; className?: string; /** Beside the open note: put away until asked for. */ fold?: boolean; /** Once it has taken a way out: on to the next one. */ onExit?: () => void; /** That way out undone: back on it. */ onBack?: (id: string) => void }): React.JSX.Element {
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  // Whichever window shows these, ⌘K there acts on this capture.
  useOpenNote({ table: 'captures', type: 'capture', id: capture.id, kind: capture.kind, archived: !!capture.archivedAt, status: capture.status })
  // Its lineage, its map and the notes like it come the frame after the note's words.
  const later = useAfterFirstPaint()
  // A PDF its words link into: its book's map, with this note lit among the others from it. Asked for by
  // itself: the whole note was read back for it after every save (33 ms of main's thread for a long one).
  const pdfOfNote = useLive(() => window.api.haligtree<ReturnType<typeof pdfIn>>('notes:pdf', capture.id), null as ReturnType<typeof pdfIn>, [capture.id])
  const [who, setWho] = useState(capture.attribution ?? '')
  const [where, setWhere] = useState(capture.medium ?? '')
  // Saved as typed, as before: a quote's who, emptied, waits for the blur to ask, never saved blank by a retype.
  const saveWho = (value: string): void => {
    setWho(value)
    if (capture.kind === 'quote' && !value.trim() && capture.attribution?.trim()) return
    void haligtree.setCapture(capture.id, 'attribution', value.trim() || null)
  }
  const saveWhere = (value: string): void => {
    setWhere(value)
    void haligtree.setCapture(capture.id, 'medium', value.trim() || null)
  }
  // Each source row is a link until its pencil turns it into its field; Enter leaves it, Esc puts back what it held.
  const [editWho, setEditWho] = useState(false)
  const [editWhere, setEditWhere] = useState(false)
  const before = useRef('')
  const leaveOnKeys = (revert: () => void) => (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') return void event.currentTarget.blur()
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    revert()
    event.currentTarget.blur()
  }
  useEffect(() => {
    setWho(capture.attribution ?? '')
    setWhere(capture.medium ?? '')
  }, [capture.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Its ways out, from the one list every surface draws them from (capture-list.tsx).
  const ways = captureWays(capture, { onExit, onBack })
  const inInbox = capture.status === 'open'

  return (
    <Props className={className} fold={fold}>
      {/* Beside its page, the note's properties head its details, as Linear's issues have them. */}
      {fold && <PropertyStrip panel table="captures" id={capture.id} kind={capture.kind} fields={capture.fields} text={capture.label} created={capture.capturedAt} updated={capture.editedAt} cited={!!capture.medium?.trim()} />}
      {/* Where it can go, open to see; where it is now is the island's own state, at its heading's end, never a row
          among the things to press. Folded by hand, it stays folded. */}
      <Island compact name="Status" filled title="Where it goes"
        actions={<span data-where-now className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground"><Status aria-hidden className="size-3.5 shrink-0" /><Rolling text={inInbox ? 'In the Inbox' : statusSaid(capture.status, capture.keptIn)} /></span>}>
        {ways.map((way) => (
          <Fragment key={way.id}>
            {/* The same thought caught twice: found by its words, not a number. Before the Bin, which is last. */}
            {way.id === 'discarded' && inInbox && <MergeInto capture={capture} />}
            <Prop icon={menuIcon(way.label)} alive={way.id === 'discarded' ? TrashIcon : undefined} tint={way.tint} tip={way.hint} named={way.label} onClick={way.run}>
              <span data-way={way.id} data-to-writing-prop={way.id === 'writing' ? '' : undefined} data-keep-asking-prop={way.id === 'keep' ? '' : undefined}>{way.label}</span>
            </Prop>
            {/* The questions kept in view, one click each, while you tidy. */}
            {way.id === 'clue' && <PinnedQuestions className="px-2 py-1.5" onPick={(question) => void clueInto(question, { captureId: capture.id })} />}
          </Fragment>
        ))}
      </Island>

      <Island compact title="Kind">
        <CaptureKindPicker flat value={capture.kind as CaptureType} onChange={(kind) => void changeKind('captures', capture.id, capture.kind, kind)} />
      </Island>
      <KindFields table="captures" id={capture.id} kind={capture.kind} onOpen={onOpen} />
      <Aliases table="captures" id={capture.id} />

      {capture.status !== 'discarded' && <ShowAgain kind="capture" one={capture} />}
      <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
        <Prop icon={capture.private ? EyeOff : Eye} active={!!capture.private} onClick={() => void haligtree.setPrivate('captures', capture.id, !capture.private)}>
          {capture.private ? 'Private' : 'Not private'}
        </Prop>
        <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => pin('captures', capture.id, !capture.pinnedAt)}>
          {capture.pinnedAt ? 'Pinned to the sidebar' : 'Pin to the sidebar'}
        </Prop>
        <RemindMe table="captures" id={capture.id} at={capture.remindAt} />
        {/* Out of sight, apart from the exits: whatever became of it, it can be put away. */}
        <Prop icon={capture.archivedAt ? ArchiveRestore : Archive} active={!!capture.archivedAt} onClick={() => void archive('captures', [capture.id], !capture.archivedAt)} tip={capture.archivedAt ? 'Bring it back' : 'Kept, out of sight'}>
          {capture.archivedAt ? 'Unarchive' : 'Archive'}
        </Prop>
      </Island>

      {/* Who and where as links, each opening its page (a PDF at its page, ⌥ beside); the pencil on hover turns one into its field. */}
      <Island compact title="Where it came from" filled={!!(capture.attribution?.trim() || capture.medium?.trim() || pdfOfNote)}>
        <SourceRow icon={Quote} name="source" editing={editWho} setEditing={(on) => ((before.current = who), setEditWho(on))}
          label={capture.attribution?.trim() ?? ''} tip="Open their page in Sources"
          open={() => (chime('page'), openSource('attribution', capture.attribution ?? ''))}>
          <Remembered key={`a${capture.id}`} field="attribution" value={who} data-note-source autoFocus={editWho} placeholder={ASKS[capture.kind as CaptureType]?.who ?? 'Who'}
            className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
            onKeyDown={leaveOnKeys(() => saveWho(before.current))}
            onChange={saveWho} onBlur={() => {
            setEditWho(false)
            if (capture.kind === 'quote' && !who.trim() && capture.attribution?.trim()) askClearWho(capture.attribution.trim(), () => haligtree.setCapture(capture.id, 'attribution', null), () => setWho(capture.attribution ?? ''))
          }} />
        </SourceRow>
        <SourceRow icon={BookOpen} name="where" editing={editWhere} setEditing={(on) => ((before.current = where), setEditWhere(on))}
          label={pdfOfNote ? `${bookOf(capture.medium) || pdfOfNote.name.replace(/\.pdf$/i, '')}, p. ${pdfOfNote.page}` : capture.medium?.trim() ?? ''}
          tip={pdfOfNote ? `Open it at p. ${pdfOfNote.page}. ⌥-click opens it beside this` : 'Open its page in Sources'}
          peek={pdfOfNote ?? undefined}
          open={(aside) => (chime('page'), pdfOfNote ? openPdf(pdfOfNote.src, pdfOfNote.name, pdfOfNote.page, pdfOfNote.mark, aside) : openSource('medium', capture.medium ?? ''))}>
          <Remembered key={`m${capture.id}`} field="medium" value={where} data-note-where autoFocus={editWhere} placeholder={ASKS[capture.kind as CaptureType]?.where ?? 'Where'}
            className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
            onKeyDown={leaveOnKeys(() => saveWhere(before.current))}
            onChange={saveWhere} onBlur={() => setEditWhere(false)} />
        </SourceRow>
      </Island>
      {/* What it means to you, dated: a capture takes glosses as a nugget does. */}
      <GlossTimeline id={capture.id} />
      {later && <Lineage id={capture.id} onOpen={onOpen} />}
      {later && <LocalGraph id={capture.id} title={capture.label} onOpen={onOpen} />}
      {later && pdfOfNote && <SameBook pdf={pdfOfNote} here={capture.id} title={capture.medium?.trim() || undefined} />}
      {later && <SimilarNotes id={capture.id} onOpen={onOpen} />}
      {later && <RecentIsland id={capture.id} onOpen={onOpen} />}
      <Island compact title="Details">
        {/* Each value with a quiet word for what it is: a bare "Mac" or "7 Oct" left you guessing. */}
        <Prop icon={Hash}><Lead>Its number</Lead>{captureKey(capture.number)}</Prop>
        {capture.device && <Prop icon={Laptop}><Lead>Caught on</Lead>{capture.device}</Prop>}
        {capture.weather && <Prop icon={CloudSun}><Lead>Weather then</Lead>{capture.weather}</Prop>}
        {/* Time to write it: here and in the quick capture, one line; a note written in one go keeps its "Took". */}
        <WritingSpent id={capture.id} took={capture.elapsedMs ?? 0} fallback={capture.elapsedMs ? <Prop icon={Timer}><Lead>Took</Lead>{capture.elapsedMs < 60000 ? `${Math.round(capture.elapsedMs / 1000)} sec` : hoursSaid(capture.elapsedMs / 60000)} to write</Prop> : null} />
        {capture.source && <Prop icon={FileText}><Lead>Came from</Lead>{capture.source.replace(/\.md$/, '')}</Prop>}
        {/* Editable, because a system you can catch up on beats one you
            cannot fall behind in: a note from last Tuesday can say so. */}
        <DatePicker key={capture.id} value={capture.capturedAt} lead="Caught" className="w-full" onChange={(at) => at && void haligtree.setCapture(capture.id, 'capturedAt', at)} />
        <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'captures', id: capture.id }])}>Save its pictures and files…</Prop>
      </Island>
    </Props>
  )
}

/** When a capture was last touched, the way rot counts it: an import is new here for thirty days. */
const touched = (one: CaptureMeta): string => {
  const at = one.editedAt ?? one.capturedAt
  const imported = one.importedAt ? dayjs(one.importedAt).add(30, 'day').toISOString() : ''
  return imported > at ? imported : at
}

/**
 * Filter, sort and group for a list of captures, with the Display menu that
 * sets them: the same in the main window and the prompt. `name` keeps each
 * list's choice apart.
 */
export function useCaptureDisplay(name: string, all: CaptureMeta[], filter?: View['filter'], archived = false, taskChoice?: React.ReactNode): {
  groups: [string, CaptureMeta[]][]
  display: React.JSX.Element
  /** The filters set, as chips over the list, and the kinds a click away. */
  chips: React.JSX.Element | null
  density: Density
  view: View
  setView: (view: View) => void
  /** Drop a row before or after another, in your own order. */
  move: (ids: string[], id: string, target: string, after: boolean) => void
  /** One step up or down in your own order, from the keyboard; false at an end. */
  moveBy: (shown: string[], id: string, by: number) => boolean
  /** The groups as the list draws them: as islands, only the rows that show (islands.tsx). Applied last, after any other narrowing. */
  island: <T>(groups: [string, T[]][]) => { groups: [string, T[]][]; islands?: Record<string, IslandState> }
  /** Your own order not read yet: the list waits for it. */
  ownUnread: boolean
} {
  // Archived opens in its folders: each "Put away everything before" run is one, by its day.
  // The Inbox by kind to start (notes, then tasks, quotes, words), newest first: what each capture is, at a glance.
  // Every other list by date, the way Pages lists: Today, This week, This month, This year. Either is a choice in Display.
  // Looked up is a word list: A to Z under their letters, as a dictionary is, so 159 of them can be scanned by eye.
  const [view, setView] = useView(name, name === LOOKED_UP ? { sort: 'name', group: 'letter', filter } : { sort: 'newest', group: archived ? 'folder' : name === 'captures:Inbox' ? 'kind' : 'date', filter })
  // Archived ones only in the Archived view, or when Display asks for them.
  const showArchived = archived || !!view.filter.flags?.includes('archived')
  const kept = all.filter((one) => !!one.archivedAt === showArchived)
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
    own.move(kept.map((one) => one.id), id, target, by > 0, true, view.sort !== 'manual' ? shown : undefined, unsort)
    return true
  }
  // Everything holds tasks too: each facet speaks for its own sort of row, and lets the other through.
  const isTask = (one: CaptureMeta): boolean => one.kind === 'task'
  const statuses = [...new Set(kept.filter((one) => !isTask(one)).map((one) => one.status))]
  // With a choice of which tasks show, the Task chip stays even when none is on show: it is where you choose others.
  // A list no task ever reaches (the Inbox: a task leaves it for Tasks) has no Task chip, whatever was picked before.
  // The other chips are built from what the status picked lets through: the Inbox keeps the captures that left it
  // (for its Status chip), and a chip built from those (Task, a tag only they carry) always showed "0 shown".
  const picked = view.filter.status?.filter((one) => statuses.includes(one)) ?? []
  const reach = picked.length ? kept.filter((one) => isTask(one) || picked.includes(one.status)) : kept
  const withTasks = !!taskChoice || reach.some(isTask) || reach.some((one) => one.kind === 'todo')
  const progress = [...new Set(reach.flatMap((one) => [fieldOf(one.fields, 'status') ?? fieldOf(one.fields, 'state')].filter((v): v is string => !!v)))].sort()
  const stars = [...new Set(reach.map((one) => Number(fieldOf(one.fields, 'rating'))).filter((n) => n >= 1 && n <= 5))].sort((a, b) => b - a)
  const facets: Facet<CaptureMeta>[] = [
    // Whether it has taken an exit: offered when the list holds more than one,
    // so handled and discarded captures can be reached where it is all held.
    // Always, where the list starts filtered by status (quick capture's Inbox):
    // with every capture handled, a missing facet showed them all again.
    ...(statuses.length > 1 || filter?.status ? [{ key: 'status', label: 'Status', options: ['open', 'promoted', 'resolved', 'discarded'].filter((one) => statuses.includes(one) || filter?.status?.includes(one)).map((id) => ({ id, label: statusSaid(id), icon: STATUS_ICON[id as keyof typeof STATUS_ICON] })), test: (one: CaptureMeta, status: string) => isTask(one) || one.status === status }] : []),
    // Tasks and the tasks caught in quick capture are one chip, "Task": two chips of one name would be a riddle.
    // In the one order, Note first (kindRank): with tasks among them, the tasks' chip stands where Task does.
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.flatMap((type) => (withTasks && type.id === 'todo' ? [TASK_KIND] : reach.some((one) => one.kind === type.id) ? [{ id: type.id, label: type.label, icon: type.icon, tint: type.tint }] : [])) as Choice[], test: (one, kind) => one.kind === kind || (withTasks && kind === 'task' && one.kind === 'todo') },
    // A Word is a lookup: asked until its answer is written. Offered once there is one.
    ...(reach.some((one) => one.lookup) ? [{ key: 'lookup', label: 'Meaning', options: [{ id: 'asked', label: 'No meaning yet' }, { id: 'answered', label: 'Written' }], test: (one: CaptureMeta, state: string) => one.lookup === state }] : []),
    { key: 'when', label: 'Captured', options: AGES, test: (one, when) => period(one.capturedAt) === when },
    { key: 'tag', label: 'Tag', options: [...new Set(reach.flatMap((one) => splitTags(one.label).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}`, icon: Tag, tint: tagTint(tag) })), test: (one, tag) => splitTags(one.label).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'typed', label: 'Typed here' }, { id: 'imported', label: 'Imported' }], test: (one, from) => (one.source ? 'imported' : 'typed') === from },
    { key: 'who', label: 'Who said it', options: [{ id: 'mine', label: 'My words' }, { id: 'theirs', label: 'Someone else' }], test: (one, who) => (one.attribution ? 'theirs' : 'mine') === who },
    // Properties a kind or a tag asks for: where you are with it, and its stars.
    ...(progress.length ? [{ key: 'progress', label: 'Progress', options: progress.map((id) => ({ id, label: id })), test: (one: CaptureMeta, value: string) => (fieldOf(one.fields, 'status') ?? fieldOf(one.fields, 'state')) === value }] : []),
    ...(stars.length ? [{ key: 'rating', label: 'Rating', options: stars.map((n) => ({ id: String(n), label: '★'.repeat(n) })), test: (one: CaptureMeta, value: string) => fieldOf(one.fields, 'rating') === value }] : []),
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }, ...(archived ? [] : [{ id: 'archived', label: 'Archived' }])], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'archived' ? !!one.archivedAt : !!one.private) }
  ]
  const kindsHere = new Set(kept.map((one) => one.kind)).size
  // Words read by their headword (a "Word: meaning" title files under its word).
  const word = (one: CaptureMeta): string => (one.kind === 'word' ? headword(splitTags(one.label).text).word : one.label)
  const books = new Set(kept.map((one) => one.kind === 'word' && one.medium).filter(Boolean)).size
  const rated = kept.some((one) => fieldOf(one.fields, 'rating'))
  const sources = new Set(kept.map((one) => !!one.source)).size
  // A page of Words reads best as tiles: short names, each on its own sketch.
  const wordsOnly = kept.length > 0 && kept.every((one) => one.kind === 'word')
  // Any property in use is a way to sort (lib/property-sorts.ts).
  const byProp = propertySorts(kept, (a, b) => b.capturedAt.localeCompare(a.capturedAt))
  const groups = arrange(kept, view, facets, {
    ...byProp.compare,
    newest: (a, b) => b.capturedAt.localeCompare(a.capturedAt),
    changed: (a, b) => (b.editedAt ?? b.capturedAt).localeCompare(a.editedAt ?? a.capturedAt),
    untouched: (a, b) => touched(a).localeCompare(touched(b)),
    name: (a, b) => word(a).localeCompare(word(b), undefined, { sensitivity: 'base' }),
    kind: (a, b) => byKind(a.kind, b.kind) || b.capturedAt.localeCompare(a.capturedAt),
    rating: (a, b) => Number(fieldOf(b.fields, 'rating') ?? 0) - Number(fieldOf(a.fields, 'rating') ?? 0) || b.capturedAt.localeCompare(a.capturedAt),
    manual: (a, b) => own.compare(a.id, b.id) || b.capturedAt.localeCompare(a.capturedAt)
  }, {
    kind: (one) => (isTask(one) || one.kind === 'todo' ? 'Tasks' : CAPTURE_TYPES.find((type) => type.id === one.kind)?.many ?? 'Notes'),
    date: (one) => period(one.capturedAt),
    source: (one) => (isTask(one) ? 'Tasks' : one.source ? whereFrom(one.source) || 'Vault' : 'Typed here'),
    folder: (one) => one.folder ?? 'Archived',
    letter: (one) => letterOf(word(one)),
    book: (one) => (one.kind === 'word' && one.medium) || 'Not from a book'
  })
  // Spread over the page, the list keeps a size of its own: a grid, unless you chose another.
  const wide = view.pane === 'wide'
  const density = (wide ? view.wideDensity ?? 'grid' : view.density) ?? (wordsOnly || name === LOOKED_UP ? 'small' : 'list')
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      items={kept}
      defaults={filter ?? {}}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Longest unchanged' }, { id: 'name', label: 'A to Z' }, ...(kindsHere > 1 ? [{ id: 'kind', label: 'Kind' }] : []), ...(rated ? [{ id: 'rating', label: 'Rating' }] : []), ...byProp.choices, { id: 'manual', label: 'Custom order' }]}
      groups={[...(kindsHere > 1 ? [{ id: 'kind', label: 'Kind' }] : []), { id: 'none', label: 'None' }, { id: 'date', label: 'Date' }, ...(wordsOnly ? [{ id: 'letter', label: 'First letter' }] : []), ...(books ? [{ id: 'book', label: 'Where looked up' }] : []), ...(sources > 1 ? [{ id: 'source', label: 'Where from' }] : []), ...(showArchived ? [{ id: 'folder', label: 'Folder' }] : [])]}
      density={density}
      onDensity={(next) => setView({ ...view, [wide ? 'wideDensity' : 'density']: next })}
    />
  )
  // Which tasks show rides on the Task chip. While tasks are not among what shows (another kind picked
  // without Task) it stays in its place, greyed, so the chips after it never shift under the pointer.
  const kinds = view.filter.kind ?? []
  const tasksOut = kinds.length > 0 && !kinds.includes('task')
  const addons = taskChoice ? { task: <span data-task-choice-off={tasksOut || undefined} inert={tasksOut || undefined} className={`flex transition-opacity duration-80 ${tasksOut ? 'opacity-40' : ''}`}>{taskChoice}</span> } : undefined
  const chips = <FilterChips view={view} onChange={setView} facets={facets} defaults={filter ?? {}} addons={addons} wrap />
  // Rows only: tiles keep their plain headings.
  const island = useIslands(name, islandsOn(view) && (density === 'list' || density === 'compact'))
  return { groups, display, chips, density, view, setView, move, moveBy, island, ownUnread: unloaded(own.order) }
}

/** Questions › Looked up's Display, kept apart from the other lists'. */
const LOOKED_UP = 'captures:Looked up'

/** A quiet lead-in naming what a detail is, before the detail itself. */
const Lead = ({ children }: { children: React.ReactNode }): React.JSX.Element => <span className="mr-1.5 text-muted-foreground">{children}</span>

/**
 * A tag or a date put on many captures at once, with an undo that puts each
 * back as it was: its words before the tag, its own date, its privacy.
 */
async function bulkUndoable(ids: string[], change: { tag?: string; capturedAt?: string }, said: string, cue: 'tag' | 'noted'): Promise<void> {
  const before = (await Promise.all(ids.map((id) => window.api.captures.get(id)))).flatMap((one) => (one ? [one] : []))
  await haligtree.bulk(ids, change)
  chime(cue)
  toast(said, () => void Promise.all(before.map((one) => Promise.all([
    change.tag ? window.api.captures.save(one.id, { body: one.body, fetched: true }) : undefined,
    change.capturedAt ? haligtree.bulk([one.id], { capturedAt: one.capturedAt }) : undefined,
    change.tag && !one.private ? haligtree.setPrivate('captures', one.id, false, true) : undefined
  ]))))
}
