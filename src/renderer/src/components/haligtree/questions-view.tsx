import { useEffect, useRef, useState } from 'react'
import { ReadsIn, useReading } from '@/lib/reads-in'
import { binItem } from '@/lib/to-bin'
import type { JSONContent } from '@tiptap/core'
import { Archive, Calendar, Plus, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'

import { HaligtreeEditor, TAGS } from '../haligtree'
import { chime, pageTurn } from '@/lib/sound'
import { unloaded, useLastAsked, useLive, haligtree, when, type Item, type ItemFull } from '@/lib/haligtree'
import { exampleQuestions } from '@/lib/examples'
import { Example } from './example'
import { findCaptures, findHeadings, flying, follow, noteLinkText } from '@/lib/capture-links'
import { archive, saveAttachments, useOpenNote } from '@/lib/notes'
import { openApart } from '@/lib/apart'
import { asideItem } from '@/lib/split'
import { queueItems } from '@/lib/reading-queue'
import { useKept, useOpened } from '@/lib/nav'
import { readAhead, readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { NoteComing } from './note-coming'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chips, Display, useView } from './display'
import { ListSearch, NoteList, NoteRail, PaneButtons, Peek, matches, type Entry } from './note-list'
import { Lineage } from './lineage'
import { pinQuestion } from './pinned-questions'
import { Mentions } from './mentions'
import { Aliases, LocalGraph, NoteHeader } from './note-extras'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { PICKED_MARK } from './pick-mixed'
import { usePickLines } from '@/lib/pick-lines'
import { Empty, Island, Page, Prop, Props, Rolling, Stepper, Tip, Typed, ask, refuse, showTopTitle, toast, useListKeys, quietly } from './ui'
import { Term } from './term'
import { openGloss, useRowGloss } from './gloss-line'
import { ThoughtDock } from './thought-bar'
import { ago, dayMonth, dayName, heldFor, num } from '../../../../main/dates'
import { ReadThrough } from './read-through'
import { CollectionHeader, Cover, MenuButton, PlayButton, QuietAction, pictureIn, useTint } from './collection-header'
import BulbSvg from '@/components/ui/bulb-svg'
import { Apart } from '@/lib/apart'
import { usePickNotes } from './pick-notes'
import { useHere } from '@/lib/split'
import { clipMiddle, quoted } from '../../../../main/clip'
import { ArchiveRestore, Download, Eye, EyeOff, Orbit, Bookmark as Pin, Bookmark as PinOff, ArchiveRestore as RotateCcw } from '@/components/ui/icons'

/**
 * Questions: what you keep circling and cannot name yet. The tier between a
 * capture and a nugget that the promotion gate ("would it make sense cold?")
 * has no room for, because half-formed thinking never passes it. A question
 * is held, not tracked: it never rots, is never reviewed and never asks for an
 * exit. It collects clues, dated, until one day you have got it and write the
 * article, or let it go. Some stay open for years, and that is the point.
 */

/** How long it has been held, in plain words and a calm colour: "held 2 years". */
export { heldFor }
export const cluesSaid = (n: number): string => (n ? `${num(n)} ${n === 1 ? 'clue' : 'clues'}` : 'no clues yet')

/** A new question, asked for in your own words, then opened to write in. Undoable. */
export async function startQuestion(open: (type: string, id: string) => void): Promise<void> {
  const title = await ask('What do you keep circling? Say it as a question, in your own words.', 'e.g. Why does Sunday evening feel heavy?')
  if (!title) return
  const id = await haligtree.newQuestion(title)
  chime('hold')
  toast('Saved as a question: add clues as they come', () => void haligtree.dropQuestion(id))
  open('question', id)
}

/**
 * "+Sunday evening: felt it again after the call" in the box: a first line
 * starting with + names a question you are holding, and what follows (after a
 * colon, or on the lines below) is a clue for it rather than a capture. The
 * name matches the question it is part of, or the one sharing most words.
 * Written "+name", no space: "+ " makes a bulleted list as you type.
 */
export function clueTarget(line: string | null | undefined, held: Item[]): { name: string; rest: string; question: Item | null } | null {
  const said = /^\+(?!\s)(.+)$/.exec(line?.trim() ?? '')
  if (!said) return null
  const at = said[1].indexOf(':')
  const name = (at >= 0 ? said[1].slice(0, at) : said[1]).trim()
  const rest = at >= 0 ? said[1].slice(at + 1).trim() : ''
  const lower = name.toLowerCase()
  const words = lower.split(/\W+/).filter((word) => word.length > 2)
  // Whole words, or the start of one ("relat" for "related"): "here" is not in "elsewhere".
  const score = (one: Item): number => {
    const said = one.title.toLowerCase().split(/\W+/)
    return words.filter((word) => said.some((part) => part.startsWith(word))).length
  }
  const best = [...held].sort((a, b) => score(b) - score(a))[0]
  const question = (lower && held.find((one) => one.title.toLowerCase().includes(lower))) || (best && score(best) >= Math.max(1, Math.ceil(words.length / 2)) ? best : null)
  return { name, rest, question }
}

type Picked = { id: string; title: string } | { title: string; id?: undefined }
/** Ask which question, from the open ones; words that match none can start one. */
export const pickQuestion = (): Promise<Picked | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('haligtree:pick-question', { detail: { answer } })))

/**
 * A capture's words become a dated clue in a question, and the capture takes
 * its exit, kept there. Undone, the clue goes and the capture is open again.
 */
export async function addToQuestion(captureId: string, onUndo?: () => void): Promise<void> {
  const picked = await pickQuestion()
  if (!picked) return
  if (!picked.id) {
    const id = await flying(captureId, 'question', () => haligtree.newQuestion(picked.title, captureId))
    // A capture that already took another exit keeps it.
    if (!id) return refuse('That capture was already dealt with. Put it back in the Inbox first')
    chime('hold')
    return toast('Added to a new question, as its first clue', () => void haligtree.dropQuestion(id).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('question', id) })
  }
  const clue = await flying(captureId, 'question', () => haligtree.addClue(picked.id, '', captureId))
  if (!clue) return
  chime('clue')
  toast(`A clue in ${quoted(picked.title, 40)}`, () => void haligtree.dropClue(clue).then(() => onUndo?.()))
}

/** The question picker over the page: type to narrow, Enter to choose. */
export function QuestionAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (picked: Picked | null) => void } | null>(null)
  const [typed, setTyped] = useState('')
  const open = useLive(() => (asked ? haligtree.items('question') : Promise.resolve([] as Item[])), [] as Item[], [!!asked], ['item'])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setTyped('')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('haligtree:pick-question', onAsk)
    return () => window.removeEventListener('haligtree:pick-question', onAsk)
  }, [])
  if (!asked) return null
  const done = (picked: Picked | null): void => {
    asked.answer(picked)
    setAsked(null)
  }
  const held = open.filter((one) => !one.closedAt && !one.archivedAt)
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="Add to a question" className="w-[min(28rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <Command onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') done(null)
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder="Add it to which question…" />
          <CommandList className="max-h-[min(22rem,50vh)]">
            <CommandEmpty>No question holds that yet.</CommandEmpty>
            {held.map((one) => (
              <CommandItem key={one.id} value={`${one.title} ${one.id}`} onSelect={() => done({ id: one.id, title: one.title })}>
                <Orbit className="text-muted-foreground" />
                <span className="private-text min-w-0 flex-1 truncate">{clipMiddle(one.title, 44)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{cluesSaid(one.clues)}</span>
              </CommandItem>
            ))}
            {/* Words that are not one of them yet can be the start of one. */}
            {typed.trim() && (
              <CommandItem value={`new ${typed}`} forceMount onSelect={() => done({ title: typed.trim() })}>
                <Plus className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Hold as a new question: “{typed.trim()}”</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

/**
 * Holding, in the main window: the questions you are carrying, each with how
 * long and how many clues. The ones you have settled wait, quietly, under
 * Answered, still readable.
 */
export function QuestionsView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => haligtree.items('question'), [] as Item[], [], ['item'], 'questions')
  const pinned = useLive(haligtree.pinnedQuestions, [] as Awaited<ReturnType<typeof haligtree.pinnedQuestions>>)
  const inView = new Set(pinned.map((one) => one.id))
  const [show, setShow] = useState<'open' | 'answered'>('open')
  const [view, setView] = useView('questions', { sort: 'newest', group: 'none' })
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<ItemFull | null>(() => (focus ? readNow<ItemFull>('question', focus) ?? null : null))
  const spread = pane === 'wide' && !open
  const sorts: Record<string, (a: Item, b: Item) => number> = {
    // Settled ones, newest settled first.
    newest: (a, b) => (show === 'open' ? b.createdAt.localeCompare(a.createdAt) : (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    changed: (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    untouched: (a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title)
  }
  const items = all
    .filter((one) => !one.archivedAt && (show === 'open' ? !one.closedAt : !!one.closedAt) && (!spread || matches(one.title, query)))
    .sort(sorts[view.sort] ?? sorts.newest)
  const wide = pane === 'wide'
  const density = (wide ? view.wideDensity ?? 'grid' : view.density) ?? 'list'
  const [peek, setPeek] = useState<string | null>(null)
  // Only the last pick lands: a late answer for the question before is dropped.
  const asked = useLastAsked()
  // The one asked for while it is read: its pane and name at once (note-coming.tsx).
  const [coming, setComing] = useState<string | null>(() => (focus && !open ? focus : null))
  const pick = (id: string): void => {
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    const ready = readNow<ItemFull>('question', id)
    if (ready) return (asked(), setComing(null), setOpen(ready), setShow(ready.closedAt ? 'answered' : 'open'))
    if (id !== open?.id) setComing(id)
    asked(readFresh('question', id, haligtree.item), (found) => {
      setComing(null)
      setOpen(found)
      // One sent here that is already settled is found under Answered.
      if (found) setShow(found.closedAt ? 'answered' : 'open')
    })
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? items[Math.max(0, cursor)]?.id ?? null)
      asked()
      setComing(null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) pick(peek)
    setView({ ...view, pane: next })
  }
  // Opening one is a step Back returns from; Holding or Answered is kept in it.
  const hush = useOpened(open?.id, focus, pick, () => (asked(), setComing(null), setOpen(null)), { shown: items.map((one) => one.id), kind: 'item' })
  // The ones either side, read ahead for the stepper's ↓ and ↑.
  useEffect(() => {
    const at = items.findIndex((one) => one.id === open?.id)
    if (at >= 0) readAhead('question', [items[at - 1]?.id, items[at + 1]?.id])
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A note opened: a page turned, as a book is (a quick run down the list turns only one).
  useEffect(() => void (open?.id && pageTurn(false, open.id)), [open?.id])
  useKept('tab', show, setShow, 'open')
  // Read again when anything changes, so a clue added elsewhere shows.
  useEffect(() => {
    // A reload for the one you left, landing after you switch, is dropped.
    let gone = false
    const off = window.api.captures.onChange(() => open && void haligtree.item(open.id).then((found) => void (gone || setOpen(found))))
    return () => void ((gone = true), off())
  }, [open?.id])
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? (hush(), null) : was))
    window.addEventListener('haligtree:opened-apart', onApart)
    return () => window.removeEventListener('haligtree:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(items.length, {
    onOpen: (index) => pick(items[index].id),
    opened: items.findIndex((one) => one.id === (coming ?? open?.id)),
    onExtend: (from, to) => several.picking.extend(items[from]?.id, items[to].id),
    onEscape: () => spread && query && setQuery('')
  })
  useEffect(() => void (spread && items[cursor] && setPeek(items[cursor].id)), [cursor, spread]) // eslint-disable-line react-hooks/exhaustive-deps
  // A search cleared: the keyboard back on the one looked at, and it in view, wherever it is in the whole list.
  useEffect(() => void (!query && spread && peek && setCursor(items.findIndex((one) => one.id === peek))), [query]) // eslint-disable-line react-hooks/exhaustive-deps
  // ; on the row under the cursor, with nothing open: a clue written under it.
  const glossAfter = useRowGloss(items[cursor]?.id, !open, 'A clue, in your own words')
  const go = (type: string, id: string): void => (type === 'question' ? pick(id) : onOpen?.(type, id))
  // x, ⇧-click and ⌘A pick several, for the queue or the archive together.
  const several = usePickNotes(items.map((one) => one.id), cursor, { here: useHere(), noun: ['question', 'questions'], tier: 'question', titleOf: (id) => items.find((one) => one.id === id)?.title })
  const menuFor = (item: Item): MenuItem[] => several.menu(item.id) ?? [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    ...questionMenu(item, inView.has(item.id)),
    ...several.rowItems(item.id)
  ]
  // Sent here for one question: it is drawn first and the list beside it
  // the frame after, whole (Page's `apart`), so its words never wait behind the list.
  const sent = !!focus && (coming ?? open?.id) === focus
  const [listFirst] = useState(!focus)
  const listLater = useAfterFirstPaint()
  const listShown = listFirst || listLater || (!!open && pane === 'rail')
  const entries = !listShown ? [] : items.map((one) => questionEntry(one, inView.has(one.id), menuFor(one)))
  const listUnread = unloaded(all) || unloaded(pinned)
  const peeked = spread ? all.find((one) => one.id === peek) : undefined
  return (
    // The list and the one open beside it come in together, once both are read (lib/reads-in.tsx).
    <ReadsIn className="contents">
      {open && pane === 'rail' ? (
        <NoteRail entries={entries} cursor={cursor} selected={open.id} onPick={pick} onShow={() => setPane('list')} />
      ) : (
      <Page aside={!!open || !!coming} waiting={listUnread || !listShown} apart={sent} title="Questions" count={several.chosen.length || items.length} unit={several.chosen.length ? ['selected', 'selected'] : ['question', 'questions']}
        actions={several.bar ??
          <span className="flex items-center gap-2">
            {spread && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder="Search in Questions" />}
            <Chips className="shrink-0" options={[{ id: 'open', label: 'Open' }, { id: 'answered', label: 'Answered' }]} on={(id) => id === show} pick={(id) => setShow(id as 'open' | 'answered')} />
            {/* With none open, the empty page's own button is the one "New question". */}
            {!spread && (items.length > 0 || show !== 'open' || !all.length) && <Button variant="ghost" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>}
            <Display view={view} onChange={setView} facets={[]} count={all.length} sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Longest unchanged' }, { id: 'name', label: 'A to Z' }]}
              density={density} onDensity={(next) => setView({ ...view, [wide ? 'wideDensity' : 'density']: next })} />
            <PaneButtons pane={spread ? 'wide' : 'list'} onPane={setPane} fold={!!open} />
          </span>
        }
      >
        {!listShown ? null : items.length ? (
          <NoteList groups={[['', entries]]} density={density} table="nuggets" selected={spread ? peek ?? undefined : coming ?? open?.id} cursor={cursor} onCursor={setCursor}
            onPick={spread ? (id) => (setPeek(id), setCursor(items.findIndex((one) => one.id === id))) : pick} onOpen={spread ? pick : undefined} after={glossAfter}
            chosen={several.chosen} picking={several.picking} className={spread ? 'mx-5 my-3' : 'mx-3 my-2'} />
        ) : unloaded(all) ? null : spread && query.trim() ? (
          <Empty title="Nothing matches">No question here has those words. Escape clears the search.</Empty>
        ) : !all.length ? (
          // None held yet: the page as it will look, with a few made-up ones.
          <Example tryIt={<><strong>press H on a note in your Inbox, or <button type="button" onClick={() => void startQuestion(go)} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">ask a new question</button>.</strong> Then add clues to it as they turn up.</>}>
            <NoteList groups={[['', exampleQuestions().filter((one) => (show === 'open') === !one.closedAt).map((one) => questionEntry(one))]]} density={density} table="nuggets" cursor={-1} onPick={() => undefined} className="mx-3 my-2" />
          </Example>
        ) : show === 'open' ? (
          <Empty title="No questions yet" action={<Button variant="secondary" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>}>
            A question is for something you keep thinking about and cannot answer yet. It is never tested: it just collects clues, for as long as it takes. Press H on a note in your Inbox to make it one.
          </Empty>
        ) : (
          <Empty title="Nothing answered yet">
            When a question comes clear, “I've got it” starts an article from its clues, and the question rests here, still readable.
          </Empty>
        )}
      </Page>
      )}
      {peeked && <Peek entry={questionEntry(peeked, inView.has(peeked.id))} table="nuggets" onOpen={() => pick(peeked.id)} />}
      {coming && coming !== open?.id ? <NoteComing id={coming} title={all.find((one) => one.id === coming)?.title} /> : open && <Apart type="question" id={open.id} title={open.title} hidden={!!open.private} onBack={() => haligtree.item(open.id).then((fresh) => fresh && setOpen(fresh))}><QuestionDetail key={open.id} item={open} onOpen={go}
        top={<ReadsIn apart reading={listUnread} className="contents" data-apart="stepper"><Stepper turns at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} /></ReadsIn>} /></Apart>}
    </ReadsIn>
  )
}

/**
 * A question's tile, warmer the more clues it has: grey with none, a little
 * blue with one or two, full blue from three, so the ones coming clear stand out.
 */
const clueTint = (n: number): string | undefined =>
  !n ? undefined : n < 3 ? 'color-mix(in srgb, var(--tt-color-text-blue) 55%, var(--muted-foreground))' : 'var(--tt-color-text-blue)'

/** A question as any list draws it: its words, then how long it has been held and its clues. */
export const questionEntry = (item: Item, inView = false, menu?: MenuItem[]): Entry => ({
  id: item.id,
  type: 'question',
  title: item.title,
  tags: [],
  icon: Orbit,
  tint: clueTint(item.clues),
  sub: item.closedAt ? `${item.closedHow === 'let go' ? 'Stopped asking' : 'Answered'} ${whenLower(item.closedAt)} · ${cluesSaid(item.clues)}` : `${heldFor(item.createdAt)[0].toUpperCase()}${heldFor(item.createdAt).slice(1)} · ${cluesSaid(item.clues)}`,
  marks: (
    <>
      {inView ? <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Showing in quick capture" /> : null}
      {item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
    </>
  ),
  dim: !!item.closedAt,
  private: !!item.private,
  wrap: true,
  menu
})

/** What Show in quick capture does, said where it is offered. */
const QUICK_TIP = 'Shows this question in quick capture, so you can add a clue the moment one comes to you.'

/** What a question offers besides opening it: its row menu and its note's dots share it. */
const questionMenu = (item: Item, shown: boolean): MenuItem[] => [
  { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openApart('question', item.id) },
  asideItem('question', item.id),
  ...queueItems(item.id),
  'separator',
  ...(item.closedAt ? [] : [{ label: shown ? 'Hide from quick capture' : 'Show in quick capture', run: () => void pinQuestion(item.id, item.title, !shown) }]),
  { label: item.private ? 'Not private' : 'Private', run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', hint: item.archivedAt ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  binItem([{ type: 'question', id: item.id }]),
  'separator',
  { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(`question:${item.id}`, item.title), 'Copied a link: paste it into any note') },
  { label: 'Copy the question', run: () => copy(item.title) }
]

/**
 * An open question: the question in your words, the page under it to write in
 * however it asks to be written, and its clues, newest first. Down the right,
 * how long it has been held and the two ways it can end.
 */
export function QuestionDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  useOpenNote({ table: 'nuggets', type: 'question', id: item.id, kind: item.kind, archived: !!item.archivedAt })
  const seen = useRef<string | null>(null)
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  const inView = useLive(haligtree.pinnedQuestions, [] as Awaited<ReturnType<typeof haligtree.pinnedQuestions>>).some((one) => one.id === item.id)
  const settled = item.closedAt ? `${item.closedHow === 'let go' ? 'Stopped asking' : 'Answered'} ${whenLower(item.closedAt)}` : null
  const gotIt = (): void => void haligtree.closeQuestion(item.id, 'answered').then((done) => {
    if (!done?.article) return
    const article = done.article
    chime('answered')
    // Undone, the article goes and the question is open in its place, not a page on nothing.
    toast('Got it: an article, started from your clues', () => void haligtree.reopenQuestion(item.id, article).then(() => onOpen?.('question', item.id)))
    onOpen?.('article', article)
  })
  const letGo = (): void => void haligtree.closeQuestion(item.id, 'let go').then(() => {
    chime('release')
    toast('Stopped asking: it waits under “Answered”, still readable', () => void haligtree.reopenQuestion(item.id))
  })
  const holdAgain = (): void => {
    const how = item.closedHow ?? 'let go'
    void haligtree.reopenQuestion(item.id).then(() => {
      chime('hold')
      toast('Open again', () => void haligtree.closeQuestion(item.id, how as 'answered' | 'let go', true, item.closedAt))
    })
  }
  // Its clues read one at a time, newest first as they are listed; null while not reading.
  const [reading, setReading] = useState<number | null>(null)
  const clues = [...item.glosses].reverse()
  const readClues = (from = 0): void => (clues.length ? setReading(from) : refuse('No clues yet: add one first', 'info'))
  // The composer under the page takes it.
  const addClue = (): void => openGloss(item.id)
  const cover = pictureIn(item.body)
  const tint = useTint(cover, 'var(--primary)')
  const lastClue = clues[0]?.createdAt
  return (
    <div data-open={item.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[max(22rem,100%)] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <NoteHeader className="-mt-3 mb-1" left={top} type={item.tier} table="nuggets" id={item.id} copyKey={noteLinkText(`question:${item.id}`, item.title)} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
          onRestored={() => void haligtree.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))}
          edited={item.updatedAt} captured={item.createdAt} made="Asked" menu={questionMenu(item, inView)} />
        {reading !== null && (
          <ReadThrough items={clues.map((clue) => ({ type: 'clue', id: clue.id, body: clue.body, title: dayName(clue.createdAt) }))} start={reading} onClose={() => setReading(null)} clueTo={item.id} />
        )}
        <CollectionHeader
          tint={tint}
          cover={<Cover src={cover} colour="var(--primary)" seed={item.id}><Orbit className="size-[42cqi]" strokeWidth={1.6} /></Cover>}
          label="Question"
          length={item.title.length}
          meta={[
            cluesSaid(clues.length).replace(/^n/, 'N'),
            settled ?? heldFor(item.createdAt),
            ...(lastClue ? [`last clue ${ago(lastClue)}`] : [])
          ]}
          actions={<>
            {/* One clear thing to do: with nothing to read yet, it is adding the first clue. */}
            {clues.length > 0 ? <>
              <PlayButton label="Read the clues" onClick={() => readClues()} />
              <QuietAction label="Add a clue" onClick={addClue}><Plus /></QuietAction>
            </> : <PlayButton label="Add a clue" icon={Plus} onClick={addClue} />}
            <MenuButton items={[
              ...(item.closedAt ? [{ label: 'Open it again', run: holdAgain }] : [{ label: "I've got it", hint: 'Start the article', run: gotIt }, { label: 'Stop asking', hint: 'Kept under “Answered”', run: letGo }]),
              'separator',
              ...questionMenu(item, inView)
            ]} />
          </>}
          title={
          /* The question itself, in your words: it can take a few lines. */
          <textarea
            rows={1}
            className="block w-full resize-none overflow-hidden bg-transparent pb-[0.12em] text-balance outline-none [field-sizing:content] placeholder:text-foreground/70"
            defaultValue={item.title === 'Untitled' ? '' : item.title}
            autoFocus={!item.title || item.title === 'Untitled'}
            placeholder="What do you keep circling?"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              event.currentTarget.blur()
            }}
            onBlur={(event) => {
              const title = event.target.value.trim()
              if (title && title !== item.title) void haligtree.saveItem(item.id, { title }).then(() => chime('noted'))
            }}
          />}
        />
        {past ? (
          <HaligtreeEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
          <HaligtreeEditor
            key={restored?.rev ?? 0}
            host={window.api}
            tokens={TAGS}
            onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
            toolbar={{ fixed: false }}
            documentId={`item-${item.id}`}
            onTitleOut={showTopTitle}
            placeholder="Write around it, however it asks to be written…"
            defaultContent={((restored ? restored.body : item.body) as JSONContent | string | null) ?? ''}
            findNotes={findCaptures}
            findHeadings={findHeadings}
            onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
            autofocus={false}
            after={<><Clues item={item} onRead={readClues} /><Mentions id={item.id} onOpen={onOpen} /></>}
            onReady={(instance) => void (seen.current = JSON.stringify(instance.getJSON()))}
            onChange={(body) => {
              // The editor tidying a document as it opens is not an edit.
              const now = JSON.stringify(body)
              if (now === seen.current) return
              seen.current = now
              void haligtree.saveItem(item.id, { body })
            }}
          />
        )}
        {/* A clue the moment it comes, pinned under the page; the ones so far a click away. */}
        <ThoughtDock id={item.id} clue />
      </div>

      <Props fold>
        <Island compact title="Open question">
          <Prop icon={Orbit} active>{settled ?? <Rolling by="word" text={heldFor(item.createdAt).replace(/^o/, 'O')} />}</Prop>
          {!item.closedAt && (
            <Tip label={QUICK_TIP}>
              <div>
                <Prop icon={inView ? Pin : PinOff} active={inView} onClick={() => void pinQuestion(item.id, item.title, !inView)}>
                  {inView ? 'Showing in quick capture' : 'Show in quick capture'}
                </Prop>
              </div>
            </Tip>
          )}
          <Prop icon={Calendar}>Asked {dayMonth(item.createdAt)}</Prop>
        </Island>
        <Island compact title={item.closedAt ? 'Closed' : 'When it comes clear'}>
          {item.closedAt ? (
            <Prop icon={RotateCcw} onClick={holdAgain}>Open it again</Prop>
          ) : (
            <>
              <Prop alive={BulbSvg} onClick={gotIt} tip="Start the article">I've got it</Prop>
              <Prop icon={Wind} onClick={letGo} tip="Kept under “Answered”">Stop asking</Prop>
            </>
          )}
        </Island>
        <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void haligtree.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: never comes back unasked' : 'Can come back to you'}
          </Prop>
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)} tip={item.archivedAt ? 'Bring it back' : 'Kept, out of sight'}>
            {item.archivedAt ? 'Unarchive' : 'Archive'}
          </Prop>
        </Island>
        <Aliases table="nuggets" id={item.id} />
        <Lineage id={item.id} onOpen={onOpen} />
        <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />
        <Island compact title="Details">
          <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'nuggets', id: item.id }])}>Save its pictures and files…</Prop>
        </Island>
      </Props>
    </div>
  )
}

const whenLower = (at: string): string => {
  const said = when(at)
  return /^(Today|Tomorrow|Yesterday)$/.test(said) ? said.toLowerCase() : `on ${said}`
}

/**
 * A clue's or a log's words put right, a typo or a better way to say it: the
 * same row, the same day and source, so the order of your thinking stays as
 * it was. Undo puts the old words back.
 */
export async function reword(id: string, body: string, what: 'clue' | 'log'): Promise<void> {
  const next = (await ask(`The ${what}, in better words`, body, undefined, body))?.trim()
  if (!next || next === body) return
  const was = await haligtree.cutClue(id)
  if (!was) return refuse(`That ${what} is gone, so there is nothing to change`)
  await haligtree.putClue({ ...was, body: next })
  chime('noted')
  quietly(() => void haligtree.cutClue(id).then((now) => now && haligtree.putClue({ ...now, body: was.body })))
}

/**
 * The clues: dated, newest first, one row each and never an edit, so the way
 * your thinking moved stays readable. A line at the top takes the next one.
 */
function Clues({ item, onRead }: { item: ItemFull; onRead: (from: number) => void }): React.JSX.Element {
  const clues = [...item.glosses].reverse()
  // Several clues at once: ⇧- or ⌘-click, x, ⌘A, ⌫ removes them with one Undo, Esc lets go.
  const list = useRef<HTMLOListElement>(null)
  const lines = usePickLines(clues.map((clue) => clue.id), list, { one: 'clue', many: 'clues' })
  return (
    <section data-chrome className="page-narrow mx-auto mt-6 w-full border-t px-10 pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
        <Term>Clues</Term> {clues.length > 0 && <Rolling text={clues.length} className="tabular-nums" />}
      </h3>
      {clues.length ? (
        <ol ref={list} className="flex flex-col">
          <AnimatePresence initial={false}>
            {clues.map((clue, index) => {
              const menu: MenuItem[] = lines.picked(clue.id) && lines.count > 1 ? [
                { label: `Copy ${num(lines.count)} clues`, run: () => copy(clues.filter((one) => lines.picked(one.id)).map((one) => one.body).join('\n')) },
                'separator',
                { label: `Remove ${num(lines.count)} clues`, keys: '⌫', danger: true, run: () => lines.remove(clues.filter((one) => lines.picked(one.id)).map((one) => one.id)) },
                'separator',
                lines.count < clues.length && { label: 'Select all', keys: '⌘A', run: lines.all },
                { label: 'Clear the selection', keys: 'esc', run: lines.clear }
              ] : [
                { label: 'Read from here', run: () => onRead(index) },
                { label: 'Change the words…', run: () => void reword(clue.id, clue.body, 'clue') },
                { label: 'Copy the clue', run: () => copy(clue.body) },
                'separator',
                { label: 'Remove the clue', keys: '⌫', danger: true, run: () => lines.remove([clue.id]) },
                'separator',
                { label: lines.picked(clue.id) ? 'Unselect' : 'Select', keys: 'X', run: () => lines.toggle(clue.id) },
                lines.count < clues.length && { label: 'Select all', keys: '⌘A', run: lines.all }
              ]
              return (
                <RowMenu key={clue.id} items={menu}>
                  <motion.li
                    layout="position"
                    initial={{ opacity: 0, transform: shift('translateY(-4px)') }}
                    animate={{ opacity: 1, transform: shift('translateY(0px)') }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: EASE }}
                    data-line-id={clue.id}
                    data-picked={lines.picked(clue.id) || undefined}
                    tabIndex={-1}
                    onClickCapture={(event) => lines.click(event, clue.id) && event.stopPropagation()}
                    // Pointed at, its ··· shows (Read from here is in it), as in the tag's list. Its number stays a number.
                    className={`group/track relative grid grid-cols-[1.25rem_4.25rem_1fr] items-start gap-2.5 rounded-md px-2 py-1.5 pr-9 outline-none hover:bg-foreground/[0.055] has-[[data-state=open]]:bg-foreground/[0.055] ${PICKED_MARK}`}
                  >
                    <span className="pt-px text-right text-xs text-muted-foreground tabular-nums">{clues.length - index}</span>
                    <span className="pt-px text-xs text-muted-foreground tabular-nums">{clueDate(clue.createdAt)}</span>
                    <span className="min-w-0">
                      <span className="private-text block whitespace-pre-line">{clue.body}</span>
                      {clue.sourceKey && <span className="text-xs text-muted-foreground">from {clue.sourceKey}</span>}
                    </span>
                    <span className="absolute top-0.5 right-1 opacity-0 group-focus-within/track:opacity-100 group-hover/track:opacity-100 has-[[data-state=open]]:opacity-100"><MenuButton small items={menu} /></span>
                  </motion.li>
                </RowMenu>
              )
            })}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="px-2 pb-2 text-control text-muted-foreground">
          <Typed text="No clues yet. Add one whenever it crosses your mind: in the field at the foot of the page, in quick capture with + and the question's name, or from any capture with H." step={28} />
        </p>
      )}
    </section>
  )
}

/** A clue's date: the day, and the year once it is not this one. */
const clueDate = (at: string): string => dayMonth(at)

/**
 * A question still open, come back as a hint: things come back to you. Open
 * it, or drop a clue into it right here, or let it pass.
 */
export function QuestionBack({ back, onOpen, onDone, again = '', onUndone }: {
  back: { id: string; title: string; createdAt: string; clues: number }
  onOpen: (type: string, id: string) => void
  onDone: () => void
  /** A clue taken back: its words, in the field again. */
  again?: string
  /** The clue kept here was undone: the card is wanted back, with these words. */
  onUndone?: (words: string) => void
}): React.JSX.Element {
  const [adding, setAdding] = useState(!!again)
  return (
    <>
      <p className="text-sm">
        <Typed text={`Still open: ${back.title}`} step={28} delay={120} />
      </p>
      {adding ? (
        <Input
          autoFocus
          placeholder="A clue: what you have noticed since. Enter keeps it"
          defaultValue={again}
          onFocus={(event) => event.currentTarget.setSelectionRange(again.length, again.length)}
          onBlur={() => setAdding(false)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return setAdding(false)
            const text = event.currentTarget.value.trim()
            if (event.key !== 'Enter' || !text) return
            void haligtree.addClue(back.id, text).then((clue) => {
              chime('clue')
              quietly(clue ? () => (void haligtree.dropClue(clue), onUndone?.(text)) : undefined)
              onDone()
            })
          }}
          className="mt-2 h-8 w-full"
        />
      ) : (
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          <span className="mr-auto flex items-center gap-1.5 text-xs">
            <Orbit className="size-3.5" />
            <Rolling by="word" text={`${heldFor(back.createdAt)} · ${cluesSaid(back.clues)}`} />
          </span>
          <Button variant="ghost" size="sm" onClick={() => (chime('open'), onOpen('question', back.id), onDone())}>Open</Button>
          <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setAdding(true))}>Add a clue</Button>
          <Button variant="ghost" size="sm" onClick={() => (chime('fold'), onDone())}>Not now</Button>
        </div>
      )}
    </>
  )
}

/** Which question Home showed as still wondered about, and on which day. */
const WONDER = 'stillWondering'
const today = (): string => new Date().toLocaleDateString('en-CA')
const WEEK_MS = 7 * 86_400_000

/**
 * Once a week, on Home, the oldest question you are still holding comes back:
 * "Still wondering: Is Hamlet mad, or acting? 3 clues so far." An old
 * question should not look like a new one. It stays that whole day, until Not
 * now; then a week passes before the next. Never a private one, and never one
 * asked this week.
 */
export function StillWondering({ onOpen, className = '' }: { onOpen: (type: string, id: string) => void; className?: string }): React.JSX.Element | null {
  const questions = useLive(() => haligtree.items('question'), null as Item[] | null, [], ['item'])
  useReading(!questions)
  const [gone, setGone] = useState(false)
  const [adding, setAdding] = useState(false)
  // A clue taken back with Undo: its words, in the field again.
  const [again, setAgain] = useState('')
  if (!questions || gone) return null
  let record: { id: string; day: string; gone?: boolean } | null = null
  try {
    record = JSON.parse(localStorage.getItem(WONDER) ?? 'null')
  } catch {
    record = null
  }
  const open = questions.filter((one) => !one.closedAt && !one.archivedAt && !one.private && Date.now() - new Date(one.createdAt).getTime() >= WEEK_MS)
  const oldest = open.reduce<Item | null>((first, one) => (!first || one.createdAt < first.createdAt ? one : first), null)
  // Today's, still: the same one all day. A week on from the last: the oldest now.
  const shownToday = record?.day === today() ? open.find((one) => one.id === record!.id) : undefined
  const due = !record || Date.now() - new Date(`${record.day}T00:00`).getTime() >= WEEK_MS
  const back = shownToday ?? (due ? oldest : null)
  if (!back || (shownToday && record?.gone)) return null
  if (!shownToday) {
    try {
      localStorage.setItem(WONDER, JSON.stringify({ id: back.id, day: today() }))
    } catch {
      // Shown again on the next visit, which does no harm.
    }
  }
  const away = (): void => {
    try {
      localStorage.setItem(WONDER, JSON.stringify({ id: back.id, day: today(), gone: true }))
    } catch {
      // As above.
    }
    chime('fold')
    setGone(true)
  }
  const ask = back.title.trim().replace(/[?.\s]+$/, '')
  return (
    <section data-still-wondering aria-label="A question you are still holding" className={`flex flex-col gap-1.5 rounded-xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] px-3.5 py-2.5 ${className}`}>
      <p className="flex items-start gap-2 text-body">
        <Orbit className="mt-1 size-4 shrink-0 text-[var(--tt-color-text-blue)]" />
        <span><strong className="font-semibold">Still wondering:</strong> <button type="button" onClick={() => (chime('open'), onOpen('question', back.id))} className="text-left text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60">{ask}?</button> <span className="text-muted-foreground">{back.clues ? `${cluesSaid(back.clues)} so far.` : 'No clues yet.'}</span></span>
      </p>
      {adding ? (
        <Input autoFocus placeholder="A clue: what you have noticed since. Enter keeps it" defaultValue={again}
          onFocus={(event) => event.currentTarget.setSelectionRange(again.length, again.length)}
          onBlur={() => (setAdding(false), setAgain(''))}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return setAdding(false)
            const text = event.currentTarget.value.trim()
            if (event.key !== 'Enter' || !text) return
            void haligtree.addClue(back.id, text).then((clue) => {
              chime('clue')
              quietly(clue ? () => (void haligtree.dropClue(clue), setAgain(text), setAdding(true)) : undefined)
              setAdding(false)
            })
          }}
          className="ml-6 h-8 w-auto" />
      ) : (
        <div className="ml-6 flex flex-wrap items-center gap-1 text-control text-muted-foreground">
          <span className="mr-2">{heldFor(back.createdAt)[0].toUpperCase()}{heldFor(back.createdAt).slice(1)}</span>
          <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setAdding(true))}>Add a clue</Button>
          <Button variant="ghost" size="sm" onClick={away}>Not now</Button>
        </div>
      )}
    </section>
  )
}
