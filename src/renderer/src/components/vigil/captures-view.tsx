import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowUpRight, Eye, EyeOff, CheckCircle2, FileText, Hash, Inbox, ListTodo, Merge, Pin, Trash2, X, Laptop, Timer, History, CloudSun } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { ASKS, CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { CaptureList, captureMenu, useCaptures, type CaptureMeta } from '../capture-list'
import { tagColors, spread } from '@/extensions/tokens'
import { AGES, Display, arrange, period, useView, type Facet, type View } from './display'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { Mentions } from './mentions'
import { EXITS, STATUS_ICON, captureKey, exit, findCaptures, findHeadings, flying, takeExit, follow } from '@/lib/capture-links'
import { toMarkdown } from '@/lib/export'
import { splitTags, vigil } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { Empty, Island, Page, Prop, Props, Remembered, Rolling, ask, refuse, toast, useListKeys, useReadKey, typing, pin, askQuestion, Stepper, startAt, showTopTitle } from './ui'
import { RemindMe } from './items-view'
import { ReadThrough } from './read-through'
import { selectionActions } from './selection-actions'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { Archive, ArchiveRestore, Download } from 'lucide-react'
import { KindFields, LayoutToggle, LocalGraph, NoteCards, Versions, useLayout } from './note-extras'
import { archive, changeKind, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'

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
  const { groups, display, move, moveBy } = useCaptureDisplay(`captures:${title}`, kept, undefined, archived)
  const shown = groups.flatMap(([, list]) => list)
  const [layout, setLayout] = useLayout(`captures:${title}`)
  const [open, setOpen] = useState<Capture | null>(null)
  // An earlier version, shown in place of the editor while you look back.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  // Bumped when the words change under the editor (a version restored), so it
  // opens again on what is there now.
  const [rev, setRev] = useState(0)
  // The capture as first written, shown in place of the editor, or null.
  const [first, setFirst] = useState<unknown>(null)
  useEffect(() => setFirst(null), [open?.id])
  const pick = (id: string): void => void window.api.captures.get(id).then(setOpen)
  // Opened in a window of its own: closed here, so only one editor saves it.
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? null : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })
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
  const bulk = (status: string): void => {
    // Only the open ones: a promoted capture resolved, or undone back to open,
    // would lose where it went.
    const ids = chosen.filter((id) => all.find((capture) => capture.id === id)?.status === 'open')
    if (!ids.length) return refuse('None of these is open')
    void Promise.all(ids.map((id) => window.api.captures.save(id, { status }))).then(() => {
      chime(status === 'discarded' ? 'away' : 'resolve')
      setChosen([])
      toast(`${status[0].toUpperCase()}${status.slice(1)} ${ids.length}`, () => void Promise.all(ids.map((id) => window.api.captures.save(id, { status: 'open' }))))
    })
  }
  useEffect(() => {
    if (focus) pick(focus)
  }, [focus])
  // The open capture as the list last saw it, so its status follows an exit.
  const meta = all.find((capture) => capture.id === open?.id)

  return (
    <>
      <Page aside={!!open}
        title={title}
        count={shown.length}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-1">
              <span className="mr-1"><Rolling text={chosen.length} /> selected</span>
              <Button variant="ghost" size="sm" onClick={() => bulk('resolved')}>Resolve</Button>
              <Button variant="ghost" size="sm" onClick={() => bulk('discarded')}>Discard</Button>
              <Button variant="ghost" size="sm" onClick={() => void archive('captures', chosen, !archived).then(() => setChosen([]))}>{archived ? 'Unarchive' : 'Archive'}</Button>
              {chosen.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => void ask(`One task from these ${chosen.length}. What is it?`, 'e.g. sort out the freight rules by Thursday').then((text) => {
                  if (!text) return
                  const ids = chosen
                  void makeTask({ captures: ids, text }, `One task, from ${ids.length} captures`).then(() => setChosen([]))
                })}>One task</Button>
              )}
              <input
                placeholder="#tag ↵"
                onKeyDown={(event) => {
                  const tag = event.currentTarget.value.trim()
                  if (event.key !== 'Enter' || !tag) return
                  void vigil.bulk(chosen, { tag }).then((n) => (chime('noted'), toast(`Tagged ${n} with #${tag.replace(/^#/, '')}`)))
                  event.currentTarget.value = ''
                }}
                className="w-20 rounded-md bg-transparent px-2 py-1 text-xs outline-none placeholder:text-foreground/70 hover:bg-accent focus:bg-accent"
              />
              <DatePicker value={null} placeholder="Date…" className="text-xs" onChange={(at) => at && void vigil.bulk(chosen, { capturedAt: at }).then((n) => (chime('noted'), toast(`Dated ${n}`)))} />
              <Tip label="Clear">
              <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])}><X className="size-3.5" /></Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {shown.length > 1 && <span className="hidden text-xs whitespace-nowrap @[48rem]/page:inline">x to select</span>}
              <Tip label="Read this list full screen, one note at a time, from the highlighted one (or the first). You can write in each as you go.  ⇧⌘R">
                <Button variant="ghost" size="sm" onClick={() => setReadFrom(startAt(shown, open?.id, cursor))} disabled={!shown.length}><AliveIcon icon={BookIcon} size={14} /> Read list</Button>
              </Tip>
              <LayoutToggle layout={layout} onChange={setLayout} />
              {display}
            </span>
          )
        }
      >
        {shown.length && layout === 'cards' ? (
          <NoteCards table="captures" cards={shown.map((one) => ({ id: one.id, title: one.label, kind: one.kind, type: 'capture', dim: one.status !== 'open', private: !!one.private }))} selected={open?.id} cursor={cursor} onPick={pick}
            menu={(card) => captureMenu(shown.find((one) => one.id === card.id)!, pick)} />
        ) : shown.length ? (
          <div className="px-3 py-2">
            {groups.map(([name, list], index) => {
              const before = groups.slice(0, index).reduce((n, [, one]) => n + one.length, 0)
              return (
                <div key={name || 'all'}>
                  {name && <div className="px-2 pt-4 pb-1 text-xs text-muted-foreground first:pt-1">{name} <span className="tabular-nums"><Rolling text={list.length} /></span></div>}
                  <CaptureList captures={list} selected={open?.id} cursor={cursor - before} chosen={chosen} onPick={pick} onMove={(id, target, after) => move(kept.map((one) => one.id), id, target, after)} />
                </div>
              )
            })}
          </div>
        ) : kept.length ? (
          <Empty shape={['ellipse', 3]} title="Nothing matches">
            {"Display's filters hide everything here. Change them, or clear them."}
          </Empty>
        ) : archived ? (
          <Empty shape={['moon', 1]} title="Nothing archived">
            {'Archive puts a note out of sight without letting it go. Right-click any note, or ⌘K, to archive it; it waits here.'}
          </Empty>
        ) : (
          <Empty shape={['flower', 2]} title="Nothing waiting">
            {'Every capture has taken its exit. ⌘. catches the next thought, from anywhere.'}
          </Empty>
        )}
      </Page>
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
      {open && meta ? (
        <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
            {/* What you first caught, kept from the first edit on: read it
                beside what it has become, never lost to an edit. */}
            <div className="flex items-center justify-between gap-2 px-3 @[40rem]/page:px-[4.25rem]">
              <Stepper at={shown.findIndex((one) => one.id === open.id)} total={shown.length} onStep={(to) => pick(shown[to].id)} />
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() =>
                first !== null
                  ? // Back from reading: the capture read again, so the editor
                    // opens on its words now and never saves older ones over them.
                    void window.api.captures.get(open.id).then((found) => {
                      setOpen(found)
                      setFirst(null)
                    })
                  : void window.api.captures.get(open.id).then((found) => (found?.original ? setFirst(found.original) : toast('Unchanged since you wrote it')))
              }>
                <History className="size-3.5" /> {first !== null ? 'Back to now' : 'As first written'}
              </Button>
              <Versions table="captures" id={open.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
                onRestored={() => void window.api.captures.get(open.id).then((found) => {
                  setOpen(found)
                  setRev((n) => n + 1)
                })} />
            </div>
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
            <MindflowEditor
              key={`${open.id}-${rev}`}
              host={window.api}
              tokens={TAGS}
              onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
              toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: open.id, from: open.id }) }}
              documentId={`capture-${open.id}`}
              onTitleOut={showTopTitle}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              findHeadings={findHeadings}
              onOpenNote={(link, heading) => follow(link, (type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id)), heading)}
              after={<Mentions id={open.id} onOpen={(type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id))} />}
              onChange={(body, editor) =>
                window.api.captures.save(open.id, { body, markdown: toMarkdown(editor) })
              }
            />
            )}
          </div>
          <CaptureProps capture={meta} onOpen={onOpen} />
        </div>
      ) : null}
    </>
  )
}

/** Status and the exits, then what the capture is, then where it came from. */
export function CaptureProps({ capture, onOpen, className }: { capture: CaptureMeta; onOpen?: (type: string, id: string) => void; className?: string }): React.JSX.Element {
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
    { icon: ArrowUpRight, tint: 'purple', label: 'Promote to nugget', run: () => flying(capture.id, 'nugget', () => takeExit(capture.id, 'promoted')), said: 'Promoted' },
    { icon: ListTodo, tint: 'orange', label: 'Make it a task', run: () => makeTask({ capture: capture.id }), said: 'Now a task' },
    { icon: CheckCircle2, tint: 'green', label: 'Resolve', run: () => window.api.captures.save(capture.id, { status: 'resolved' }), said: 'Resolved' },
    { icon: Trash2, tint: 'red', label: 'Discard', run: () => window.api.captures.save(capture.id, { status: 'discarded' }), said: 'Discarded' }
  ]

  return (
    <Props className={className}>
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
                tint={exit.tint}
                onClick={() => {
                  void exit.run().then((result) => {
                    if (result === 'cancelled') return
                    // A task was heard, said and made undoable where it was made; only a capture gone is left to say.
                    if (exit.label === 'Make it a task') return void (result || refuse('That capture is gone'))
                    if (result === 'needs-source') return refuse('A quote needs to say who said it: add a source below first')
                    // The sound once it went through, so a refusal never sounds like success first.
                    chime(exit.label === 'Discard' ? 'away' : exit.label === 'Promote to nugget' ? 'promote' : 'resolve')
                    if (exit.label === 'Promote to nugget')
                      return toast(exit.said, typeof result === 'string' ? () => void vigil.unpromote(capture.id, result) : undefined, 'success', typeof result === 'string' ? { label: 'Add a question', key: 'Q', run: () => void askQuestion(result) } : undefined)
                    toast(exit.said, reopen)
                  })
                }}
              >
                {exit.label}
              </Prop>
            ))
          : <Prop icon={Inbox} onClick={reopen}>Back to the inbox</Prop>}
        {capture.status === 'open' && (
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <Merge className="size-4 shrink-0" />
            <input
              key={capture.id}
              placeholder="Merge into MF-…"
              onKeyDown={(event) => {
                const number = Number(event.currentTarget.value.replace(/\D/g, ''))
                if (event.key !== 'Enter' || !number) return
                void vigil.mergeCapture(capture.id, number).then((into) =>
                  into ? (chime('resolve'), toast(`Merged into MF-${number}`, () => void window.api.captures.save(capture.id, { status: 'open' }))) : refuse(`No MF-${number} to merge into`)
                )
              }}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
            />
          </label>
        )}
      </Island>

      <Island compact title="Kind">
        <div>
          <CaptureKindPicker value={capture.kind as CaptureType} onChange={(kind) => void changeKind('captures', capture.id, capture.kind, kind)} />
        </div>
      </Island>
      <KindFields table="captures" id={capture.id} kind={capture.kind} />

      <Island compact title="Surfacing">
        <Prop icon={capture.private ? EyeOff : Eye} active={!!capture.private} onClick={() => void vigil.setPrivate('captures', capture.id, !capture.private)}>
          {capture.private ? 'Private' : 'Can surface any time'}
        </Prop>
        <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => pin('captures', capture.id, !capture.pinnedAt)}>
          {capture.pinnedAt ? 'Pinned' : 'Pin to the prompt'}
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
      <Lineage id={capture.id} onOpen={onOpen} />
      <LocalGraph id={capture.id} title={capture.label} onOpen={onOpen} />
      <Island compact title="Details">
        <Prop icon={Hash}>{captureKey(capture.number)}</Prop>
        {capture.device && <Prop icon={Laptop}>{capture.device}</Prop>}
        {capture.weather && <Prop icon={CloudSun}>{capture.weather}</Prop>}
        {capture.elapsedMs ? <Prop icon={Timer}>Written in {capture.elapsedMs < 60000 ? `${Math.round(capture.elapsedMs / 1000)}s` : `${Math.round(capture.elapsedMs / 60000)} min`}</Prop> : null}
        {capture.source && <Prop icon={FileText}>{capture.source.replace(/\.md$/, '')}</Prop>}
        {/* Editable, because a system you can catch up on beats one you
            cannot fall behind in: a note from last Tuesday can say so. */}
        <DatePicker key={capture.id} value={capture.capturedAt} className="w-full" onChange={(at) => at && void vigil.setCapture(capture.id, 'capturedAt', at)} />
        <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'captures', id: capture.id }])}>Save its pictures and files…</Prop>
      </Island>
    </Props>
  )
}

/**
 * Filter, sort and group for a list of captures, with the Display menu that
 * sets them: the same in the main window and the prompt. `name` keeps each
 * list's choice apart.
 */
export function useCaptureDisplay(name: string, all: CaptureMeta[], filter?: View['filter'], archived = false): {
  groups: [string, CaptureMeta[]][]
  display: React.JSX.Element
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
  const mine = (): void => void (view.sort !== 'manual' && setView({ ...view, sort: 'manual' }))
  const move = (ids: string[], id: string, target: string, after: boolean): void => {
    mine()
    // From another sort, the order you see is the one the move starts from.
    own.move(ids, id, target, after, false, view.sort !== 'manual' ? groups.flatMap(([, list]) => list.map((one) => one.id)) : undefined)
  }
  const moveBy = (shown: string[], id: string, by: number): boolean => {
    const target = shown[shown.indexOf(id) + by]
    if (!target) return false
    mine()
    own.move(kept.map((one) => one.id), id, target, by > 0, true, view.sort !== 'manual' ? shown : undefined)
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
    manual: (a, b) => own.compare(a.id, b.id) || b.capturedAt.localeCompare(a.capturedAt),
    oldest: (a, b) => a.capturedAt.localeCompare(b.capturedAt),
    name: (a, b) => a.label.localeCompare(b.label),
    kind: (a, b) => a.kind.localeCompare(b.kind)
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note',
    date: (one) => period(one.capturedAt),
    source: (one) => one.source.replace(/\.(md|html?|csv|json|txt)$/i, '') || 'Typed here'
  })
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      defaults={filter ?? {}}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }, { id: 'kind', label: 'Kind' }, { id: 'manual', label: 'Your order' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }, { id: 'source', label: 'Where from' }]}
    />
  )
  return { groups, display, move, moveBy }
}
