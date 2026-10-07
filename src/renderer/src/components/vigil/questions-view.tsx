import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Calendar, Plus, Wind } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import Stack3Icon from '@/components/ui/stack-3-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import DownloadIcon from '@/components/ui/download-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import EyeIcon from '@/components/ui/eye-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import PlayerIcon from '@/components/ui/player-icon'
import { AnimatePresence, motion } from 'motion/react'
import { EASE } from '@/lib/motion'

import { MindflowEditor, TAGS } from '../mindflow'
import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Item, type ItemFull } from '@/lib/vigil'
import { findCaptures, findHeadings, flying, follow } from '@/lib/capture-links'
import { archive, openWindow, saveAttachments, useOpenNote } from '@/lib/notes'
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
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, Typed, ask, refuse, showTopTitle, toast, useListKeys } from './ui'
import { ago, dayMonth, dayName, dayjs, heldFor, num } from '../../../../main/dates'
import { ReadThrough } from './read-through'
import { CollectionHeader, Cover, MenuButton, PlayButton, QuietAction, pictureIn, useTint } from './collection-header'
import BulbSvg from '@/components/ui/bulb-svg'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Archive = alive(Stack3Icon)
const ArchiveRestore = alive(ArrowBackUpIcon)
const Download = alive(DownloadIcon)
const EyeOff = alive(EyeOffIcon)
const Eye = alive(EyeIcon)
const Orbit = alive(QuestionMarkIcon)
const Pin = alive(BookmarkIcon)
const PinOff = alive(BookmarkIcon)
const Play = alive(PlayerIcon)
const RotateCcw = alive(ArrowBackUpIcon)

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
  const id = await vigil.newQuestion(title)
  chime('hold')
  toast('Holding it: add clues as they come', () => void vigil.dropQuestion(id))
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
  const score = (one: Item): number => words.filter((word) => one.title.toLowerCase().includes(word)).length
  const best = [...held].sort((a, b) => score(b) - score(a))[0]
  const question = (lower && held.find((one) => one.title.toLowerCase().includes(lower))) || (best && score(best) >= Math.max(1, Math.ceil(words.length / 2)) ? best : null)
  return { name, rest, question }
}

type Picked = { id: string; title: string } | { title: string; id?: undefined }
/** Ask which question, from the open ones; words that match none can start one. */
export const pickQuestion = (): Promise<Picked | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:pick-question', { detail: { answer } })))

/**
 * A capture's words become a dated clue in a question, and the capture takes
 * its exit, kept there. Undone, the clue goes and the capture is open again.
 */
export async function addToQuestion(captureId: string, onUndo?: () => void): Promise<void> {
  const picked = await pickQuestion()
  if (!picked) return
  if (!picked.id) {
    const id = await flying(captureId, 'question', () => vigil.newQuestion(picked.title, captureId))
    // A capture that already took another exit keeps it.
    if (!id) return refuse('That capture already took an exit. Put it back in the inbox first')
    chime('hold')
    return toast('Kept in a new question, as its first clue', () => void vigil.dropQuestion(id).then(() => onUndo?.()))
  }
  const clue = await flying(captureId, 'question', () => vigil.addClue(picked.id, '', captureId))
  if (!clue) return
  chime('clue')
  toast(`A clue in “${picked.title.length > 40 ? `${picked.title.slice(0, 40)}…` : picked.title}”`, () => void vigil.dropClue(clue).then(() => onUndo?.()))
}

/** The question picker over the page: type to narrow, Enter to choose. */
export function QuestionAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (picked: Picked | null) => void } | null>(null)
  const [typed, setTyped] = useState('')
  const open = useLive(() => (asked ? vigil.items('question') : Promise.resolve([] as Item[])), [] as Item[], [!!asked], ['item'])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setTyped('')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('vigil:pick-question', onAsk)
    return () => window.removeEventListener('vigil:pick-question', onAsk)
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
          <CommandList>
            <CommandEmpty>No question holds that yet.</CommandEmpty>
            {held.map((one) => (
              <CommandItem key={one.id} value={`${one.title} ${one.id}`} onSelect={() => done({ id: one.id, title: one.title })}>
                <Orbit className="text-muted-foreground" />
                <span className="private-text min-w-0 flex-1 truncate">{one.title}</span>
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
  const all = useLive(() => vigil.items('question'), [] as Item[], [], ['item'])
  const inView = new Set(useLive(vigil.pinnedQuestions, [] as Awaited<ReturnType<typeof vigil.pinnedQuestions>>).map((one) => one.id))
  const [show, setShow] = useState<'open' | 'answered'>('open')
  const [view, setView] = useView('questions', { sort: 'newest', group: 'none' })
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ItemFull | null>(null)
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
  const pick = (id: string): void => {
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    void vigil.item(id).then((found) => {
      setOpen(found)
      // One sent here that is already settled is found under Answered.
      if (found) setShow(found.closedAt ? 'answered' : 'open')
    })
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? items[Math.max(0, cursor)]?.id ?? null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) pick(peek)
    setView({ ...view, pane: next })
  }
  useEffect(() => void (focus && pick(focus)), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Read again when anything changes, so a clue added elsewhere shows.
  useEffect(() => window.api.captures.onChange(() => open && void vigil.item(open.id).then(setOpen)), [open?.id])
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? null : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(items.length, {
    onOpen: (index) => pick(items[index].id),
    onBack: () => (spread ? (query ? setQuery('') : setPane('list')) : setOpen(null))
  })
  useEffect(() => void (spread && items[cursor] && setPeek(items[cursor].id)), [cursor, spread]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (type: string, id: string): void => (type === 'question' ? pick(id) : onOpen?.(type, id))
  const menuFor = (item: Item): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    ...questionMenu(item, inView.has(item.id))
  ]
  const entries = items.map((one) => questionEntry(one, inView.has(one.id), menuFor(one)))
  const peeked = spread ? all.find((one) => one.id === peek) : undefined
  return (
    <>
      {open && pane === 'rail' ? (
        <NoteRail entries={entries} cursor={cursor} selected={open.id} onPick={pick} onShow={() => setPane('list')} />
      ) : (
      <Page aside={!!open} title="Holding" count={items.length} unit={['question', 'questions']}
        actions={
          <span className="flex items-center gap-2">
            {spread && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder="Search in Holding" />}
            <Chips className="shrink-0" options={[{ id: 'open', label: 'Holding' }, { id: 'answered', label: 'Answered' }]} on={(id) => id === show} pick={(id) => setShow(id as 'open' | 'answered')} />
            {!spread && <Button variant="ghost" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>}
            <Display view={view} onChange={setView} facets={[]} sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Oldest untouched' }, { id: 'name', label: 'A to Z' }]}
              density={density} onDensity={(next) => setView({ ...view, [wide ? 'wideDensity' : 'density']: next })} />
            <PaneButtons pane={spread ? 'wide' : 'list'} onPane={setPane} fold={!!open} />
          </span>
        }
      >
        {items.length ? (
          <NoteList groups={[['', entries]]} density={density} table="nuggets" selected={spread ? peek ?? undefined : open?.id} cursor={cursor} onCursor={setCursor}
            onPick={spread ? (id) => (setPeek(id), setCursor(items.findIndex((one) => one.id === id))) : pick} onOpen={spread ? pick : undefined} className={spread ? 'mx-5 my-3' : 'mx-3 my-2'} />
        ) : spread && query.trim() ? (
          <Empty shape={['ellipse', 3]} title="Nothing matches">No question here has those words. Escape clears the search.</Empty>
        ) : show === 'open' ? (
          <Empty shape={['ellipse', 3]} title="Nothing held yet" action={<Button variant="secondary" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>}>
            A question is for what you keep circling and cannot name yet. It never rots and is never tested: it just holds the clues, for as long as it takes. Press H on a capture to hold it as one.
          </Empty>
        ) : (
          <Empty shape={['moon', 1]} title="Nothing answered yet">
            When a question comes clear, “I've got it” starts an article from its clues, and the question rests here, still readable.
          </Empty>
        )}
      </Page>
      )}
      {peeked && <Peek entry={questionEntry(peeked, inView.has(peeked.id))} table="nuggets" onOpen={() => pick(peeked.id)} />}
      {open && <QuestionDetail key={open.id} item={open} onOpen={go}
        top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} />}
    </>
  )
}

/** A question as any list draws it: its words, then how long it has been held and its clues. */
export const questionEntry = (item: Item, inView = false, menu?: MenuItem[]): Entry => ({
  id: item.id,
  type: 'question',
  title: item.title,
  tags: [],
  icon: Orbit,
  sub: item.closedAt ? `${item.closedHow === 'let go' ? 'Let go' : 'Answered'} ${when(item.closedAt).toLowerCase()} · ${cluesSaid(item.clues)}` : `${heldFor(item.createdAt)[0].toUpperCase()}${heldFor(item.createdAt).slice(1)} · ${cluesSaid(item.clues)}`,
  marks: (
    <>
      {inView ? <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Kept in view" /> : null}
      {item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
    </>
  ),
  dim: !!item.closedAt,
  private: !!item.private,
  wrap: true,
  menu
})

/**
 * An open question: the question in your words, the page under it to write in
 * however it asks to be written, and its clues, newest first. Down the right,
 * how long it has been held and the two ways it can end.
 */
/** What a question offers besides opening it: its row menu and its note's dots share it. */
const questionMenu = (item: Item, shown: boolean): MenuItem[] => [
  { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow('question', item.id) },
  'separator',
  ...(item.closedAt ? [] : [{ label: shown ? 'Out of view' : 'Keep in view while capturing', run: () => void pinQuestion(item.id, item.title, !shown) }]),
  { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  'separator',
  { label: 'Copy the question', run: () => copy(item.title) }
]

export function QuestionDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  useOpenNote({ table: 'nuggets', type: 'question', id: item.id, kind: item.kind, archived: !!item.archivedAt })
  const seen = useRef<string | null>(null)
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  const inView = useLive(vigil.pinnedQuestions, [] as Awaited<ReturnType<typeof vigil.pinnedQuestions>>).some((one) => one.id === item.id)
  const settled = item.closedAt ? `${item.closedHow === 'let go' ? 'Let go' : 'Answered'} ${whenLower(item.closedAt)}` : null
  const gotIt = (): void => void vigil.closeQuestion(item.id, 'answered').then((done) => {
    if (!done?.article) return
    const article = done.article
    chime('answered')
    toast('Got it: an article, started from your clues', () => void vigil.reopenQuestion(item.id, article))
    onOpen?.('article', article)
  })
  const letGo = (): void => void vigil.closeQuestion(item.id, 'let go').then(() => {
    chime('release')
    toast('Let go: it rests under Answered, still readable', () => void vigil.reopenQuestion(item.id))
  })
  const holdAgain = (): void => {
    const how = item.closedHow ?? 'let go'
    void vigil.reopenQuestion(item.id).then(() => {
      chime('hold')
      toast('Held again', () => void vigil.closeQuestion(item.id, how as 'answered' | 'let go', true))
    })
  }
  // Its clues read one at a time, newest first as they are listed; null while not reading.
  const [reading, setReading] = useState<number | null>(null)
  const clues = [...item.glosses].reverse()
  const readClues = (from = 0): void => (clues.length ? setReading(from) : refuse('No clues yet: add one first', 'info'))
  const addClue = (): void => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-clue-field]')
    field?.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'off' ? 'instant' : 'smooth' })
    field?.focus({ preventScroll: true })
  }
  const cover = pictureIn(item.body)
  const tint = useTint(cover, 'var(--primary)')
  const lastClue = clues[0]?.createdAt
  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <NoteHeader className="-mt-3 mb-1" left={top} type={item.tier} table="nuggets" id={item.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
          onRestored={() => void vigil.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))}
          edited={item.updatedAt} captured={item.createdAt} made="Asked" menu={questionMenu(item, inView)} />
        {reading !== null && (
          <ReadThrough items={clues.map((clue) => ({ type: 'clue', id: clue.id, body: clue.body, title: dayName(clue.createdAt) }))} start={reading} onClose={() => setReading(null)} />
        )}
        <CollectionHeader
          tint={tint}
          cover={<Cover src={cover} colour="var(--primary)" seed={item.id}><Orbit className="size-[42cqi]" strokeWidth={1.6} /></Cover>}
          label="Question"
          length={item.title.length}
          meta={[
            cluesSaid(clues.length).replace(/^n/, 'N'),
            settled ?? `held since ${dayMonth(item.createdAt)}`,
            ...(lastClue ? [`last clue ${ago(lastClue)}`] : [])
          ]}
          actions={<>
            <PlayButton label="Read the clues" onClick={() => readClues()} />
            <QuietAction label="Add a clue" onClick={addClue}><Plus /></QuietAction>
            <MenuButton items={[
              ...(item.closedAt ? [{ label: 'Hold it again', run: holdAgain }] : [{ label: "I've got it: start the article", run: gotIt }, { label: 'Let it go', run: letGo }]),
              'separator',
              ...questionMenu(item, inView)
            ]} />
          </>}
          title={
          /* The question itself, in your words: it can take a few lines. */
          <textarea
            rows={1}
            className="block w-full resize-none bg-transparent text-balance outline-none [field-sizing:content] placeholder:text-foreground/50"
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
              if (title && title !== item.title) void vigil.saveItem(item.id, { title }).then(() => chime('noted'))
            }}
          />}
        />
        {past ? (
          <MindflowEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
          <MindflowEditor
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
              void vigil.saveItem(item.id, { body })
            }}
          />
        )}
      </div>

      <Props>
        <Island compact title="Holding">
          <Prop icon={Orbit} active>{settled ?? <Rolling by="word" text={heldFor(item.createdAt).replace(/^h/, 'H')} />}</Prop>
          {!item.closedAt && (
            <Prop icon={inView ? Pin : PinOff} active={inView} onClick={() => void pinQuestion(item.id, item.title, !inView)}>
              {inView ? 'In view: shows while you capture' : 'Keep in view while capturing'}
            </Prop>
          )}
          <Prop icon={Calendar}>Since {when(item.createdAt)}{dayjs(item.createdAt).year() !== dayjs().year() ? ` ${dayjs(item.createdAt).year()}` : ''}</Prop>
        </Island>
        <Island compact title={item.closedAt ? 'Settled' : 'When it comes clear'}>
          {item.closedAt ? (
            <Prop icon={RotateCcw} onClick={holdAgain}>Hold it again</Prop>
          ) : (
            <>
              <Prop alive={BulbSvg} onClick={gotIt}>I've got it: start the article</Prop>
              <Prop icon={Wind} onClick={letGo}>Let it go</Prop>
            </>
          )}
        </Island>
        <Island compact title="Surfacing">
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: never comes back unasked' : 'Can come back to you'}
          </Prop>
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)}>
            {item.archivedAt ? 'Archived: bring it back' : 'Archive'}
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
 * The clues: dated, newest first, one row each and never an edit, so the way
 * your thinking moved stays readable. A line at the top takes the next one.
 */
function Clues({ item, onRead }: { item: ItemFull; onRead: (from: number) => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  const clues = [...item.glosses].reverse()
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    void vigil.addClue(item.id, text).then((clue) => {
      chime('clue')
      toast('A clue, kept', clue ? () => void vigil.dropClue(clue) : undefined)
    })
  }
  return (
    <section data-chrome className="page-narrow mx-auto mt-6 w-full border-t px-10 pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
        Clues {clues.length > 0 && <Rolling text={clues.length} className="tabular-nums" />}
      </h3>
      <div className="mx-2 mb-3 flex items-start gap-2 rounded-lg border bg-accent/30 px-3 py-2 focus-within:border-foreground/25">
        <Plus className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        <textarea
          data-clue-field
          rows={1}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              keep()
            }
            if (event.key === 'Escape') event.currentTarget.blur()
          }}
          placeholder="A clue: something you noticed, felt, or heard"
          className="min-w-0 flex-1 resize-none bg-transparent text-control outline-none [field-sizing:content] placeholder:text-foreground/60"
        />
        {words.trim() && <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd></span>}
      </div>
      {clues.length ? (
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {clues.map((clue, index) => {
              const menu: MenuItem[] = [
                { label: 'Read from here', run: () => onRead(index) },
                { label: 'Copy the clue', run: () => copy(clue.body) }
              ]
              return (
                <RowMenu key={clue.id} items={menu}>
                  <motion.li
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: EASE }}
                    // Pointed at, its number becomes a play mark (read from here) and its ··· shows, as in the tag's list.
                    className="group/track relative grid grid-cols-[1.25rem_4.25rem_1fr] items-start gap-2.5 rounded-md px-2 py-1.5 pr-9 hover:bg-foreground/[0.055] has-[[data-state=open]]:bg-foreground/[0.055]"
                  >
                    <span className="relative pt-px text-right text-xs text-muted-foreground tabular-nums">
                      <span className="group-focus-within/track:opacity-0 group-hover/track:opacity-0">{clues.length - index}</span>
                      <Tip label="Read from here">
                        <button type="button" onClick={() => onRead(index)} className="absolute inset-y-0 right-0 flex items-center text-foreground opacity-0 group-focus-within/track:opacity-100 group-hover/track:opacity-100">
                          <Play className="size-3 fill-current" />
                        </button>
                      </Tip>
                    </span>
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
          <Typed text="No clues yet. Add one whenever it crosses your mind, from here, from the box with + and the question's name, or from any capture with H." step={28} />
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
export function QuestionBack({ back, onOpen, onDone }: {
  back: { id: string; title: string; createdAt: string; clues: number }
  onOpen: (type: string, id: string) => void
  onDone: () => void
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <p className="text-sm">
        <Typed text={`Still open: ${back.title}`} step={28} delay={120} />
      </p>
      {adding ? (
        <Input
          autoFocus
          placeholder="A clue: what you have noticed since. Enter keeps it"
          onBlur={() => setAdding(false)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return setAdding(false)
            const text = event.currentTarget.value.trim()
            if (event.key !== 'Enter' || !text) return
            void vigil.addClue(back.id, text).then((clue) => {
              chime('clue')
              toast('A clue, kept', clue ? () => void vigil.dropClue(clue) : undefined)
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
