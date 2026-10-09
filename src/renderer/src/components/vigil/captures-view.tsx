import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Archive, Merge } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import EyeIcon from '@/components/ui/eye-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import DoubleCheckIcon from '@/components/ui/double-check-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import XIcon from '@/components/ui/x-icon'
import CpuIcon from '@/components/ui/cpu-icon'
import ClockIcon from '@/components/ui/clock-icon'
import Cloud2Icon from '@/components/ui/cloud-2-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import DownloadIcon from '@/components/ui/download-icon'
import { motion } from 'motion/react'

import { MindflowEditor, TAGS } from '../mindflow'
import { ASKS, CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { CaptureList, captureEntry, captureMenu, useCaptures, whereFrom, type CaptureMeta } from '../capture-list'
import { tagColors, spread } from '@/extensions/tokens'
import { AGES, Display, FilterChips, arrange, period, useView, type Density, type Facet, type View } from './display'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { Mentions } from './mentions'
import { EXITS, NOT_OPEN, STATUS_ICON, captureKey, exit, findCaptures, findHeadings, flying, takeExit, follow, unpromote } from '@/lib/capture-links'
import type { SaveResult } from '../../../../main/captures'
import { toMarkdown } from '@/lib/export'
import { splitTags, unloaded, vigil } from '@/lib/vigil'
import { makeTask, oneTask, picked } from '@/lib/tasks'
import { useSameWords } from '@/lib/same-words'
import { chime, tear } from '@/lib/sound'
import { Empty, Island, Page, Prop, Props, Remembered, Rolling, refuse, toast, useListKeys, useReadKey, typing, pin, askQuestion, Stepper, startAt, showTopTitle, Pressed } from './ui'
import { Term } from './term'
import { GlossTimeline, useRowGloss } from './gloss-line'
import { RemindMe } from './items-view'
import { addToQuestion } from './questions-view'
import { ReadThrough } from './read-through'
import { PassLinks } from './pass'
import { selectionActions } from './selection-actions'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import TrashIcon from '@/components/ui/trash-icon'
import { Aliases, KindFields, LocalGraph, NoteHeader } from './note-extras'
import { ListSearch, NoteRail, PaneButtons, Peek, matches, still } from './note-list'
import { archive, changeKind, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { useOpened } from '@/lib/nav'
import { Rest } from './scenery'
import type { MenuItem } from './row-menu'
import { PinnedQuestions, clueInto } from './pinned-questions'
import { Board, useBoard } from './board-view'
import { dayjs, num } from '../../../../main/dates'
import { Signed } from './signature'
import { SessionFooter } from './session-footer'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowUpRight = alive(ExternalLinkIcon)
const Eye = alive(EyeIcon)
const EyeOff = alive(EyeOffIcon)
const CheckCircle2 = alive(DoubleCheckIcon)
const FileText = alive(FileDescriptionIcon)
const Hash = alive(HashtagIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)
const Orbit = alive(QuestionMarkIcon)
const Pin = alive(BookmarkIcon)
const Trash2 = alive(TrashIcon)
const X = alive(XIcon)
const Laptop = alive(CpuIcon)
const Timer = alive(ClockIcon)
const CloudSun = alive(Cloud2Icon)
const ArchiveRestore = alive(ArrowBackUpIcon)
const Download = alive(DownloadIcon)

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/**
 * Captures: the raw tier. A list in the middle and the open one on the right,
 * with its properties and its exits. `focus` opens one straight away, for when
 * search or a tag sent you here.
 */
export function CapturesView({ title, keep, focus, onOpen, archived = false }: {
  title: string
  keep: (capture: CaptureMeta) => boolean
  focus?: string
  /** The Archived view: what is out of sight, and only that. */
  archived?: boolean
  /** Go to another thing: a nugget it became, a page that links to it. */
  onOpen?: (type: string, id: string) => void
}): React.JSX.Element {
  const all = useCaptures(true)
  const kept = all.filter(keep)
  const { groups: arranged, display, chips, density, view, setView, move, moveBy } = useCaptureDisplay(`captures:${title}`, kept, undefined, archived)
  // The list's width: beside the note, over the whole page, or a rail of pictures.
  const pane = view.pane ?? 'list'
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Capture | null>(null)
  const spread = pane === 'wide' && !open
  const groups = spread && query.trim() ? arranged.map(([name, list]) => [name, list.filter((one) => matches(one.label, query))] as [string, CaptureMeta[]]).filter(([, list]) => list.length) : arranged
  const shown = groups.flatMap(([, list]) => list)
  // Spread out, a click looks at a note beside the list; Enter opens it.
  const [peek, setPeek] = useState<string | null>(null)
  // An earlier version, shown in place of the editor while you look back.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  // Bumped when the words change under the editor (a version restored), so it
  // opens again on what is there now.
  const [rev, setRev] = useState(0)
  // The capture as first written, shown in place of the editor, or null.
  const [first, setFirst] = useState<unknown>(null)
  useEffect(() => setFirst(null), [open?.id])
  const pick = (id: string): void => {
    // Opening a note brings the list back beside it.
    if (view.pane === 'wide') setView({ ...view, pane: 'list' })
    void window.api.captures.get(id).then(setOpen)
  }
  const setPane = (next: typeof pane): void => {
    if (next === 'wide') {
      setPeek(open?.id ?? shown[Math.max(0, cursor)]?.id ?? null)
      setOpen(null)
    }
    if (pane === 'wide' && next === 'list' && peek) void window.api.captures.get(peek).then(setOpen)
    setView({ ...view, pane: next })
  }
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('captures', open?.id, open?.body, (id, body, base, editor) =>
    window.api.captures.save(id, { body, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) }))
  // The open note's editor, which its board, when shown, edits in its place.
  const [editor, setEditor] = useState<Editor | null>(null)
  const board = useBoard('captures', open?.id, editor)
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
  // The note's name over the page, not its first heading, which the hidden note reports.
  const onBoard = useRef(false)
  onBoard.current = boardShown
  // Never a private note's: titles show in a screen share.
  const opened = all.find((one) => one.id === open?.id)
  const label = opened && !opened.private ? opened.label : null
  useEffect(() => {
    if (!boardShown) return
    showTopTitle(label)
    return () => showTopTitle(null)
  }, [boardShown, label])
  // Opened in a window of its own: closed here, so only one editor saves it.
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? (hush(), null) : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(shown.length, {
    onOpen: (index) => pick(shown[index].id),
    // Spread out, Escape empties the search, then brings the list back.
    onBack: () => (spread ? (query ? setQuery('') : setPane('list')) : setOpen(null))
  })
  useEffect(() => void (spread && shown[cursor] && setPeek(shown[cursor].id)), [cursor, spread]) // eslint-disable-line react-hooks/exhaustive-deps
  // ; on the row under the cursor, with nothing open: a thought written under it.
  const glossAfter = useRowGloss(shown[cursor]?.id, !open)
  const peeked = spread ? all.find((one) => one.id === peek) : undefined
  // Reading through what is shown, one at a time with nothing else on screen.
  const [readFrom, setReadFrom] = useState<number | null>(null)
  useReadKey(() => setReadFrom(startAt(shown, open?.id, cursor)), shown.length)
  // x selects, as in Linear, for an exit on many at once.
  const [chosen, setChosen] = useState<string[]>([])
  // ⌥↑ and ⌥↓ (or ⌥K and ⌥J) move the row under the cursor in your own order.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
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
      if (event.key === 'Escape' && chosen.length) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      // P, R and D take that exit on the row under the cursor, as the menu says.
      // Shift alone is not an exit: Shift+R is half of G R typed in capitals.
      const one = !event.shiftKey && EXITS.find((e) => e.key === event.key)
      if (one && shown[cursor]?.status === 'open') return void exit(shown[cursor].id, one.status)
      if (event.key !== 'x') return
      const capture = shown[cursor]
      if (capture) setChosen((ids) => (chime(ids.includes(capture.id) ? 'off' : 'on'), ids.includes(capture.id) ? ids.filter((one) => one !== capture.id) : [...ids, capture.id]))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // Several made one task, from the bar or ⌘K: its name starts as the first one's title.
  const makeOne = (): void => {
    const ids = chosen
    void oneTask(ids, all.find((capture) => capture.id === ids[0])?.label ?? '').then((made) => made && setChosen([]))
  }
  useEffect(() => {
    picked.ids = chosen
    const onAsk = (): void => void (chosen.length > 1 && makeOne())
    window.addEventListener('vigil:one-task', onAsk)
    return () => {
      window.removeEventListener('vigil:one-task', onAsk)
      picked.ids = []
    }
  })
  const bulk = (status: string): void => {
    // Only the open ones: a promoted capture resolved, or undone back to open,
    // would lose where it went.
    const ids = chosen.filter((id) => all.find((capture) => capture.id === id)?.status === 'open')
    if (!ids.length) return refuse('Nothing changed: none of the picked captures is still in the inbox')
    void Promise.all(ids.map((id) => window.api.captures.save(id, { status }))).then((results) => {
      // The undo puts back only what this changed, each to the status it had.
      const moved = ids.flatMap((id, at) => (results[at]?.refused ? [] : [{ id, was: (results[at]?.was ?? 'open') as 'open' }]))
      chime(status === 'discarded' ? 'away' : 'resolve')
      setChosen([])
      toast(`${status[0].toUpperCase()}${status.slice(1)} ${num(moved.length)}`, () => void Promise.all(moved.map((one) => window.api.captures.save(one.id, { status: one.was }))))
    })
  }
  // Opening one, or putting it away, is a step Back returns from.
  const hush = useOpened(open?.id, focus, pick, () => setOpen(null))
  // The open capture as the list last saw it, so its status follows an exit.
  const meta = all.find((capture) => capture.id === open?.id)

  return (
    <>
      {/* Folded to a rail: by you, or by a board that needs the room. */}
      {open && (boardShown ? !listOut : pane === 'rail') ? (
        <NoteRail entries={shown.map((one) => captureEntry(one, pick))} cursor={cursor} selected={open.id} onPick={pick} onShow={() => (boardShown ? setListOut(true) : setPane('list'))} />
      ) : (
      <Page aside={!!open}
        title={title}
        // The Inbox is a place to set things down, never a queue with a number on it.
        count={title === 'Inbox' ? undefined : shown.length}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-1">
              <span className="mr-1"><Rolling text={chosen.length} /> selected</span>
              <Button variant="ghost" size="sm" onClick={() => bulk('resolved')}>Resolve</Button>
              <Button variant="ghost" size="sm" onClick={() => bulk('discarded')}>Discard</Button>
              <Button variant="ghost" size="sm" onClick={() => void archive('captures', chosen, !archived).then(() => setChosen([]))}>{archived ? 'Unarchive' : 'Archive'}</Button>
              {chosen.length > 1 && (
                <Button variant="ghost" size="sm" onClick={makeOne}>Make one task</Button>
              )}
              <input
                placeholder="#tag ↵"
                onKeyDown={(event) => {
                  const tag = event.currentTarget.value.trim()
                  if (event.key !== 'Enter' || !tag) return
                  void vigil.bulk(chosen, { tag }).then((n) => (chime('tag'), toast(`Tagged ${num(n)} with #${tag.replace(/^#/, '')}`)))
                  event.currentTarget.value = ''
                }}
                className="w-20 rounded-md bg-transparent px-2 py-1 text-xs outline-none placeholder:text-foreground/70 hover:bg-accent focus:bg-accent"
              />
              <DatePicker value={null} placeholder="Date…" className="text-xs" onChange={(at) => at && void vigil.bulk(chosen, { capturedAt: at }).then((n) => (chime('noted'), toast(`Dated ${num(n)}`)))} />
              <Tip label="Clear">
              <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])}><X className="size-3.5" /></Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {spread && <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder={`Search in ${title}`} />}
              {shown.length > 1 && !spread && !open && <span className="hidden text-xs whitespace-nowrap @[48rem]/page:inline"><Pressed keys="X" /> to select</span>}
              {title === 'Inbox' && <PassLinks className="shrink-0 flex-nowrap!" />}
              <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R">
                <Button variant="ghost" size={open ? 'icon-sm' : 'sm'} aria-label="Read through" onClick={() => setReadFrom(startAt(shown, open?.id, cursor))} disabled={!shown.length}><AliveIcon icon={BookIcon} size={14} />{!open && ' Read through'}</Button>
              </Tip>
              {display}
              <PaneButtons pane={spread ? 'wide' : 'list'} onPane={setPane} fold={!!open && !boardShown} />
            </span>
          )
        }
      >
        <div className="px-5 pt-2.5 pb-2 empty:hidden">{chips}</div>
        {shown.length ? (
          <CaptureList groups={groups} density={density} selected={spread ? peek ?? undefined : open?.id} cursor={cursor} onCursor={setCursor} chosen={chosen}
            onPick={spread ? (id) => (setPeek(id), setCursor(shown.findIndex((one) => one.id === id))) : pick} onOpen={spread ? pick : undefined}
            onChoose={(id) => setChosen((ids) => (chime(ids.includes(id) ? 'off' : 'on'), ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))}
            onMove={(id, target, after) => move(kept.map((one) => one.id), id, target, after)} after={glossAfter} className={spread ? 'mx-5 my-3' : 'mx-3 my-2'} />
        ) : unloaded(all) ? null : kept.length ? (
          <Empty shape={['ellipse', 3]} title="Nothing matches">
            {spread && query.trim() ? 'No title here has those words. Escape clears the search.' : "The filters hide everything here. Clear them with the × above, or press F to change them."}
          </Empty>
        ) : archived ? (
          <Empty shape={['moon', 1]} title="Nothing archived">
            {'Archive puts a note out of sight without letting it go. Right-click any note, or ⌘K, to archive it; it waits here.'}
          </Empty>
        ) : (
          <Rest seed="inbox">
            {/* A new install has nothing that could have left yet. */}
            {title === 'Inbox' ? (
              <Empty shape={['flower', 2]} title={all.length ? 'Nothing waiting' : 'Your Inbox'}>
                {all.length ? 'Every capture has taken its exit. ⌘. catches the next thought, from anywhere.' : 'Press ⌘. in any app, write the thought, and send it with ⌘↵. It waits here until you tidy or decide.'}
              </Empty>
            ) : title === 'Discarded' ? (
              <Empty shape={['flower', 2]} title="Nothing let go">
                {'What you discard waits here, never deleted, so it can always come back.'}
              </Empty>
            ) : (
              <Empty shape={['flower', 2]} title="Nothing here yet">
                {'Press ⌘. in any app to catch a thought. It shows here once it is sent.'}
              </Empty>
            )}
          </Rest>
        )}
      </Page>
      )}
      {readFrom !== null && (
        <ReadThrough
          items={shown.map((one) => ({ type: 'capture', id: one.id }))}
          start={readFrom}
          onClose={() => setReadFrom(null)}
          onEdit={(_, id) => {
            setReadFrom(null)
            pick(id)
          }}
        />
      )}
      {peeked && (
        <Peek entry={captureEntry(peeked, pick)} table="captures" onOpen={() => pick(peeked.id)}>
          <CaptureProps capture={peeked} onOpen={onOpen} className="border-t pt-3 @[40rem]/page:w-full @[40rem]/page:border-t @[40rem]/page:border-l-0" />
        </Peek>
      )}
      {open && meta ? (
        // Slides to where the list leaves it room, when the list folds or comes back.
        <motion.div layout={still() ? false : 'position'} transition={{ type: 'spring', bounce: 0, duration: 0.32 }} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
          {/* A board stands as tall as the window, even above the properties in a narrow one. */}
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col pt-6 ${boardShown ? '!min-h-[calc(100vh-5rem)]' : ''}`}>
            {/* What you first caught, kept from the first edit on: read it
                beside what it has become, never lost to an edit. One click
                into the dots, so the row stays quiet. */}
            <NoteHeader table="captures" id={open.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
              board={board.fits || board.on ? board : undefined} details={!boardShown}
              onRestored={() => void window.api.captures.get(open.id).then((found) => {
                setOpen(found)
                setRev((n) => n + 1)
              })}
              left={<Stepper at={shown.findIndex((one) => one.id === open.id)} total={shown.length} onStep={(to) => pick(shown[to].id)} />}
              edited={meta.editedAt} captured={meta.capturedAt}
              pinned={!!meta.pinnedAt} onPin={() => pin('captures', meta.id, !meta.pinnedAt)} copyKey={captureKey(meta.number)}
              menu={[
                open.original ? { label: 'As first written', run: () => (chime('rewind'), setFirst(open.original)) } : null,
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
                  <Tip label="Back to now">
                    {/* Read again, so the editor opens on its words now and never saves older ones over them. */}
                    <Button variant="ghost" size="icon-sm" aria-label="Back to now" onClick={() => void window.api.captures.get(open.id).then((found) => {
                      chime('fold')
                      setOpen(found)
                      setFirst(null)
                    })}><X className="size-3.5" /></Button>
                  </Tip>
                </span>
              ) : undefined} />
            {past ? (
              <MindflowEditor
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
              <MindflowEditor
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
            <MindflowEditor
              key={`${open.id}-${rev}`}
              host={window.api}
              typewriter
              tokens={TAGS}
              onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
              toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: open.id, from: open.id }) }}
              documentId={`capture-${open.id}`}
              onTitleOut={(title) => !onBoard.current && showTopTitle(title)}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              findHeadings={findHeadings}
              onOpenNote={(link, heading) => follow(link, (type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id)), heading)}
              after={<>
                {/* A quote signed at its foot: who said it, in a pen's hand. */}
                {meta.kind === 'quote' && meta.attribution && <div data-chrome className="page-narrow mx-auto mt-1 w-full px-[4.5rem] text-control text-muted-foreground"><Signed who={meta.attribution} className="private-text" /></div>}
                <Mentions id={open.id} onOpen={(type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id))} />
              </>}
              onReady={(ready) => (words.ready(ready), setEditor(ready))}
              onChange={words.save}
              foot={(editor) => <SessionFooter editor={editor} note={`capture-${open.id}`} />}
            />
            </div>
            )}
            {boardShown && <Board key={`${open.id}-${rev}`} editor={editor} id={open.id} tools={tools} />}
          </div>
          {(!boardShown || propsOut) && <CaptureProps capture={meta} onOpen={onOpen} fold={!boardShown} onExit={() => {
            const at = shown.findIndex((one) => one.id === meta.id)
            const next = shown[at + 1] ?? shown[at - 1]
            if (next && next.id !== meta.id) pick(next.id)
            else setOpen(null)
          }} />}
        </motion.div>
      ) : null}
    </>
  )
}

/** A capture's row menu in its note's dots, less what the row over it already shows: opening, the star, the link. */
export const captureDots = (capture: CaptureMeta): MenuItem[] =>
  captureMenu(capture).filter((item) => !item || item === 'separator' || !['Open', 'Unpin', 'Pin to the box', `Copy ${captureKey(capture.number)}`].includes(item.label))

/** Status and the exits, then what the capture is, then where it came from. */
export function CaptureProps({ capture, onOpen, className, fold, onExit }: { capture: CaptureMeta; onOpen?: (type: string, id: string) => void; className?: string; /** Beside the open note: put away until asked for. */ fold?: boolean; /** Once it has taken a way out: on to the next one. */ onExit?: () => void }): React.JSX.Element {
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  // Whichever window shows these, ⌘K there acts on this capture.
  useOpenNote({ table: 'captures', type: 'capture', id: capture.id, kind: capture.kind, archived: !!capture.archivedAt })
  const reopen = (): void => void window.api.captures.save(capture.id, { status: 'open' }).then(() => chime('undo'))
  const [who, setWho] = useState(capture.attribution ?? '')
  const [where, setWhere] = useState(capture.medium ?? '')
  useEffect(() => {
    setWho(capture.attribution ?? '')
    setWhere(capture.medium ?? '')
  }, [capture.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const exits = [
    { icon: ArrowUpRight, tint: 'purple', label: 'Save as an idea', run: () => flying(capture.id, 'nugget', () => takeExit(capture.id, 'promoted')), said: 'Promoted' },
    { icon: ListTodo, tint: 'orange', label: 'Make it a task', run: () => makeTask({ capture: capture.id }), said: 'Now a task' },
    { icon: CheckCircle2, tint: 'green', label: 'Resolve', run: () => window.api.captures.save(capture.id, { status: 'resolved' }), said: 'Resolved' },
    { icon: Trash2, alive: TrashIcon, tint: 'red', label: 'Discard', run: () => flying(capture.id, 'away', () => window.api.captures.save(capture.id, { status: 'discarded' })), said: 'Discarded' }
  ]

  return (
    <Props className={className} fold={fold}>
      <Island compact title="Status">
        <Prop icon={Status} active>
          {/* A status that changes rolls to the new word: the change is seen. */}
          <Rolling text={capture.status[0].toUpperCase() + capture.status.slice(1)} />
        </Prop>
        {capture.status === 'open'
          ? exits.map((exit) => (
              <Prop
                key={exit.label}
                icon={exit.icon}
                alive={exit.alive}
                tint={exit.tint}
                onClick={() => {
                  void exit.run().then((result) => {
                    if (result === 'cancelled') return
                    // A task was heard, said and made undoable where it was made; only a capture gone is left to say.
                    if (exit.label === 'Make it a task') return void (result ? onExit?.() : refuse('That capture no longer exists, so it cannot become a task'))
                    if (result === 'needs-source') return refuse('A quote needs to say who said it: add a source below first')
                    // Taken elsewhere a moment ago (the other window, a read-through): it keeps that exit.
                    if (result === 'not-open' || (result as SaveResult | null)?.refused) return refuse(NOT_OPEN)
                    // The sound once it went through, so a refusal never sounds like success first.
                    if (exit.label === 'Discard') tear()
                    else chime(exit.label === 'Save as an idea' ? 'promote' : 'resolve')
                    // Dealt with: on to the next one, as mail does, rather than left on what is gone.
                    onExit?.()
                    if (exit.label === 'Save as an idea')
                      return toast(exit.said, typeof result === 'string' ? () => void unpromote(capture.id, result) : undefined, 'success', typeof result === 'string' ? { label: 'Add a question', key: 'Q', run: () => void askQuestion(result) } : undefined)
                    // Back to exactly the status it had.
                    const was = ((result as SaveResult | null)?.was ?? 'open') as 'open'
                    toast(exit.said, () => void window.api.captures.save(capture.id, { status: was }).then(() => chime('undo')))
                  })
                }}
              >
                {exit.label}
              </Prop>
            ))
          // A promoted capture stays out: its nugget is where it lives now, and
          // back in the inbox it could be promoted again, into a second one.
          : capture.status !== 'promoted' && <Prop icon={Inbox} onClick={reopen}>Back to the inbox</Prop>}
        {/* The question routes: a new one held from it, or a clue in one you are holding. */}
        {capture.status === 'open' && (
          <>
            <Prop icon={Orbit} onClick={() => void exit(capture.id, 'question')}>Hold as a question</Prop>
            <Prop icon={Orbit} onClick={() => void addToQuestion(capture.id)}>Add to a question…</Prop>
            {/* The questions kept in view, one click each, while you tidy. */}
            <PinnedQuestions className="px-2 py-1.5" onPick={(question) => void clueInto(question, { captureId: capture.id })} />
          </>
        )}
        {capture.status === 'open' && (
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <Merge className="size-4 shrink-0" />
            <input
              key={capture.id}
              placeholder="Merge into MF-…"
              onKeyDown={(event) => {
                const number = Number(event.currentTarget.value.replace(/\D/g, ''))
                if (event.key !== 'Enter' || !number) return
                if (number === capture.number) return refuse('A capture cannot be merged into itself. Type the number of another one')
                // Undone, the other's words are as they were and this one is back: never in both.
                void vigil.mergeCapture(capture.id, number).then((merged) =>
                  merged ? (chime('resolve'), toast(`Merged into MF-${number}`, () => void vigil.unmerge(capture.id, merged).then(() => chime('undo')))) : refuse(`There is no MF-${number}. Check the number and try again`)
                )
              }}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
            />
          </label>
        )}
      </Island>

      <Island compact title="Kind">
        <CaptureKindPicker flat value={capture.kind as CaptureType} onChange={(kind) => void changeKind('captures', capture.id, capture.kind, kind)} />
      </Island>
      <KindFields table="captures" id={capture.id} kind={capture.kind} onOpen={onOpen} />
      <Aliases table="captures" id={capture.id} />

      <Island compact title={<Term>Surfacing</Term>}>
        <Prop icon={capture.private ? EyeOff : Eye} active={!!capture.private} onClick={() => void vigil.setPrivate('captures', capture.id, !capture.private)}>
          {capture.private ? 'Private' : 'Can surface any time'}
        </Prop>
        <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => pin('captures', capture.id, !capture.pinnedAt)}>
          {capture.pinnedAt ? 'Pinned' : 'Pin to the box'}
        </Prop>
        <RemindMe table="captures" id={capture.id} at={capture.remindAt} />
        {/* Out of sight, apart from the exits: whatever became of it, it can be put away. */}
        <Prop icon={capture.archivedAt ? ArchiveRestore : Archive} active={!!capture.archivedAt} onClick={() => void archive('captures', [capture.id], !capture.archivedAt)}>
          {capture.archivedAt ? 'Archived: bring it back' : 'Archive'}
        </Prop>
      </Island>

      {/* Each in a box of its own: the datalist beside it would otherwise count as a row. */}
      <Island compact title="Where it came from">
        <div>
          <Remembered key={`a${capture.id}`} field="attribution" value={who} placeholder={ASKS[capture.kind as CaptureType]?.who ?? 'Who'} className="w-full rounded-none px-2 py-1.5 text-control hover:bg-accent" onChange={(value) => {
            setWho(value)
            void vigil.setCapture(capture.id, 'attribution', value.trim() || null)
          }} />
        </div>
        <div>
          <Remembered key={`m${capture.id}`} field="medium" value={where} placeholder={ASKS[capture.kind as CaptureType]?.where ?? 'Where'} className="w-full rounded-none px-2 py-1.5 text-control hover:bg-accent" onChange={(value) => {
            setWhere(value)
            void vigil.setCapture(capture.id, 'medium', value.trim() || null)
          }} />
        </div>
      </Island>
      {/* What it means to you, dated: a capture takes glosses as a nugget does. */}
      <GlossTimeline id={capture.id} />
      <Lineage id={capture.id} onOpen={onOpen} />
      <LocalGraph id={capture.id} title={capture.label} onOpen={onOpen} />
      <Island compact title="Details">
        {/* Each value with a quiet word for what it is: a bare "Mac" or "7 Oct" left you guessing. */}
        <Prop icon={Hash}><Lead>Its number</Lead>{captureKey(capture.number)}</Prop>
        {capture.device && <Prop icon={Laptop}><Lead>Caught on</Lead>{capture.device}</Prop>}
        {capture.weather && <Prop icon={CloudSun}><Lead>Weather then</Lead>{capture.weather}</Prop>}
        {capture.elapsedMs ? <Prop icon={Timer}><Lead>Took</Lead>{capture.elapsedMs < 60000 ? `${Math.round(capture.elapsedMs / 1000)}s` : `${Math.round(capture.elapsedMs / 60000)} min`} to write</Prop> : null}
        {capture.source && <Prop icon={FileText}><Lead>Came from</Lead>{capture.source.replace(/\.md$/, '')}</Prop>}
        {/* Editable, because a system you can catch up on beats one you
            cannot fall behind in: a note from last Tuesday can say so. */}
        <DatePicker key={capture.id} value={capture.capturedAt} lead="Caught" className="w-full" onChange={(at) => at && void vigil.setCapture(capture.id, 'capturedAt', at)} />
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
export function useCaptureDisplay(name: string, all: CaptureMeta[], filter?: View['filter'], archived = false): {
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
} {
  const [view, setView] = useView(name, { sort: 'newest', group: 'none', filter })
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
  const statuses = [...new Set(kept.map((one) => one.status))]
  const facets: Facet<CaptureMeta>[] = [
    // Whether it has taken an exit: offered when the list holds more than one,
    // so handled and discarded captures can be reached where it is all held.
    ...(statuses.length > 1 ? [{ key: 'status', label: 'Status', options: ['open', 'promoted', 'resolved', 'discarded'].filter((one) => statuses.includes(one)).map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), icon: STATUS_ICON[id as keyof typeof STATUS_ICON] })), test: (one: CaptureMeta, status: string) => one.status === status }] : []),
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => kept.some((one) => one.kind === type.id)).map(({ id, label, icon, tint }) => ({ id, label, icon, tint })), test: (one, kind) => one.kind === kind },
    { key: 'when', label: 'Captured', options: AGES, test: (one, when) => period(one.capturedAt) === when },
    { key: 'tag', label: 'Tag', options: [...new Set(kept.flatMap((one) => splitTags(one.label).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}`, tint: `var(--tt-color-text-${tagColors.get(tag) ?? spread(tag)})` })), test: (one, tag) => splitTags(one.label).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'typed', label: 'Typed here' }, { id: 'imported', label: 'Imported' }], test: (one, from) => (one.source ? 'imported' : 'typed') === from },
    { key: 'who', label: 'Who said it', options: [{ id: 'mine', label: 'My words' }, { id: 'theirs', label: 'Someone else' }], test: (one, who) => (one.attribution ? 'theirs' : 'mine') === who },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }, ...(archived ? [] : [{ id: 'archived', label: 'Archived' }])], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'archived' ? !!one.archivedAt : !!one.private) }
  ]
  const groups = arrange(kept, view, facets, {
    newest: (a, b) => b.capturedAt.localeCompare(a.capturedAt),
    changed: (a, b) => (b.editedAt ?? b.capturedAt).localeCompare(a.editedAt ?? a.capturedAt),
    untouched: (a, b) => touched(a).localeCompare(touched(b)),
    name: (a, b) => a.label.localeCompare(b.label),
    kind: (a, b) => a.kind.localeCompare(b.kind) || b.capturedAt.localeCompare(a.capturedAt),
    manual: (a, b) => own.compare(a.id, b.id) || b.capturedAt.localeCompare(a.capturedAt)
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note',
    date: (one) => period(one.capturedAt),
    source: (one) => (one.source ? whereFrom(one.source) || 'Vault' : 'Typed here')
  })
  // Spread over the page, the list keeps a size of its own: a grid, unless you chose another.
  const wide = view.pane === 'wide'
  const density = (wide ? view.wideDensity ?? 'grid' : view.density) ?? 'list'
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      defaults={filter ?? {}}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'changed', label: 'Recently changed' }, { id: 'untouched', label: 'Oldest untouched' }, { id: 'name', label: 'A to Z' }, { id: 'kind', label: 'Kind' }, { id: 'manual', label: 'Custom order' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }, { id: 'source', label: 'Where from' }]}
      density={density}
      onDensity={(next) => setView({ ...view, [wide ? 'wideDensity' : 'density']: next })}
    />
  )
  const chips = <FilterChips view={view} onChange={setView} facets={facets} defaults={filter ?? {}} />
  return { groups, display, chips, density, view, setView, move, moveBy }
}

/** A quiet lead-in naming what a detail is, before the detail itself. */
const Lead = ({ children }: { children: React.ReactNode }): React.JSX.Element => <span className="mr-1.5 text-muted-foreground/80">{children}</span>
