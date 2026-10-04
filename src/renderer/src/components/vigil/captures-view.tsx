import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowUpRight, CheckCircle2, FileText, Hash, Inbox, ListTodo, Lock, Merge, Pin, Trash2, X, Laptop, Timer, History } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { ASKS, CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { CaptureList, useCaptures, type CaptureMeta } from '../capture-list'
import { AGES, Display, arrange, period, useView, type Facet, type View } from './display'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { EXITS, STATUS_ICON, captureKey, exit, findCaptures, flying, takeExit, toTask, follow } from '@/lib/capture-links'
import { toMarkdown } from '@/lib/export'
import { splitTags, vigil } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { Empty, Kbd, Page, Prop, PropLabel, Props, Remembered, Rolling, ask, toast, useListKeys, typing, pin } from './ui'
import { RemindMe } from './items-view'
import { selectionActions } from './selection-actions'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/**
 * Captures: the raw tier. A list in the middle and the open one on the right,
 * with its properties and its exits. `focus` opens one straight away, for when
 * search or a tag sent you here.
 */
export function CapturesView({ title, keep, focus, onOpen }: {
  title: string
  keep: (capture: CaptureMeta) => boolean
  focus?: string
  /** Go to another thing: a nugget it became, a page that links to it. */
  onOpen?: (type: string, id: string) => void
}): React.JSX.Element {
  const all = useCaptures()
  const kept = all.filter(keep)
  const { groups, display } = useCaptureDisplay(`captures:${title}`, kept)
  const shown = groups.flatMap(([, list]) => list)
  const [open, setOpen] = useState<Capture | null>(null)
  // The capture as first written, shown in place of the editor, or null.
  const [first, setFirst] = useState<unknown>(null)
  useEffect(() => setFirst(null), [open?.id])
  const pick = (id: string): void => void window.api.captures.get(id).then(setOpen)
  const [cursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })
  // x selects, as in Linear, for an exit on many at once.
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing()) return
      // Escape lets a selection go, the way Linear's does.
      // Taken first, so the list does not also close what is open.
      if (event.key === 'Escape' && chosen.length) {
        event.preventDefault()
        return setChosen([])
      }
      // P, R and D take that exit on the row under the cursor, as the menu says.
      const one = EXITS.find((e) => e.key === event.key)
      if (one && shown[cursor]?.status === 'open') return void exit(shown[cursor].id, one.status)
      if (event.key !== 'x') return
      const capture = shown[cursor]
      if (capture) setChosen((ids) => (ids.includes(capture.id) ? ids.filter((one) => one !== capture.id) : [...ids, capture.id]))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const bulk = (status: string): void => {
    const ids = chosen
    chime(status === 'discarded' ? 'away' : 'done')
    void Promise.all(ids.map((id) => window.api.captures.save(id, { status }))).then(() => {
      setChosen([])
      toast(`${ids.length} ${status}`, () => void Promise.all(ids.map((id) => window.api.captures.save(id, { status: 'open' }))))
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
              <span className="mr-1">{chosen.length} selected</span>
              <Button variant="ghost" size="sm" onClick={() => bulk('resolved')}>Resolve</Button>
              <Button variant="ghost" size="sm" onClick={() => bulk('discarded')}>Discard</Button>
              {chosen.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => void ask(`One task from these ${chosen.length}. What is it?`, 'e.g. sort out the freight rules by Thursday').then((text) => {
                  if (!text) return
                  const ids = chosen
                  void vigil.taskFrom(ids, text).then(() => { chime('done'); setChosen([]); toast(`One task, from ${ids.length} captures`) })
                })}>One task</Button>
              )}
              <input
                placeholder="#tag ↵"
                onKeyDown={(event) => {
                  const tag = event.currentTarget.value.trim()
                  if (event.key !== 'Enter' || !tag) return
                  void vigil.bulk(chosen, { tag }).then((n) => toast(`Tagged ${n} with #${tag.replace(/^#/, '')}`))
                  event.currentTarget.value = ''
                }}
                className="w-20 rounded-md bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground hover:bg-accent focus:bg-accent"
              />
              <DatePicker value={null} placeholder="Date…" className="text-xs" onChange={(at) => at && void vigil.bulk(chosen, { capturedAt: at }).then((n) => toast(`Dated ${n}`))} />
              <Tip label="Clear">
              <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])}><X className="size-3.5" /></Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {shown.length > 1 && <span className="text-xs">x to select</span>}
              {display}
            </span>
          )
        }
      >
        {shown.length ? (
          <div className="px-3 py-2">
            {groups.map(([name, list], index) => {
              const before = groups.slice(0, index).reduce((n, [, one]) => n + one.length, 0)
              return (
                <div key={name || 'all'}>
                  {name && <div className="px-2 pt-4 pb-1 text-xs text-muted-foreground first:pt-1">{name} <span className="tabular-nums">{list.length}</span></div>}
                  <CaptureList captures={list} selected={open?.id} cursor={cursor - before} chosen={chosen} onPick={pick} />
                </div>
              )
            })}
          </div>
        ) : kept.length ? (
          <Empty shape={['ellipse', 3]} title="Nothing matches">
            The filters in Display hide everything here. Press <Kbd>F</Kbd> to change them.
          </Empty>
        ) : (
          <Empty shape={['flower', 2]} title="Nothing waiting">
            Everything here has taken an exit. Press <Kbd>⌘</Kbd> <Kbd>.</Kbd> anywhere to catch the next thought.
          </Empty>
        )}
      </Page>
      {open && meta ? (
        <div className="flex min-w-0 flex-[1.4] border-l">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
            {/* What you first caught, kept from the first edit on: read it
                beside what it has become, never lost to an edit. */}
            <div className="flex justify-end px-6">
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
            </div>
            {first !== null ? (
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
              key={open.id}
              host={window.api}
              tokens={TAGS}
              onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
              toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: open.id, from: open.id }) }}
              documentId={`capture-${open.id}`}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              onOpenNote={(link) => follow(link, (type, id) => (type === 'capture' ? pick(id) : onOpen?.(type, id)))}
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
export function CaptureProps({ capture, onOpen }: { capture: CaptureMeta; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  const reopen = (): void => void window.api.captures.save(capture.id, { status: 'open' })
  const [who, setWho] = useState(capture.attribution ?? '')
  const [where, setWhere] = useState(capture.medium ?? '')
  useEffect(() => {
    setWho(capture.attribution ?? '')
    setWhere(capture.medium ?? '')
  }, [capture.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const exits = [
    { icon: ArrowUpRight, tint: 'purple', label: 'Promote to nugget', run: () => flying(capture.id, 'nugget', () => takeExit(capture.id, 'promoted')), said: 'Promoted to a nugget' },
    { icon: ListTodo, tint: 'orange', label: 'Make it a task', run: () => toTask(capture.id), said: 'Now a task' },
    { icon: CheckCircle2, tint: 'green', label: 'Resolve', run: () => window.api.captures.save(capture.id, { status: 'resolved' }), said: 'Resolved' },
    { icon: Trash2, tint: 'red', label: 'Discard', run: () => window.api.captures.save(capture.id, { status: 'discarded' }), said: 'Discarded' }
  ]

  return (
    <Props>
      <PropLabel>Status</PropLabel>
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
                chime(exit.label === 'Discard' ? 'away' : exit.label === 'Promote to nugget' ? 'promote' : 'done')
                void exit.run().then((result) =>
                  result === 'cancelled' ? undefined : result === 'needs-source'
                    ? toast('A quote needs to say who said it: add a source below first')
                    : toast(exit.said, exit.label === 'Promote to nugget' ? undefined : reopen)
                )
              }}
            >
              {exit.label}
            </Prop>
          ))
        : <Prop icon={Inbox} onClick={reopen}>Back to the inbox</Prop>}

      <PropLabel>Kind</PropLabel>
      <div className="px-1">
        <CaptureKindPicker value={capture.kind as CaptureType} onChange={(kind) => void window.api.captures.save(capture.id, { kind })} />
      </div>

      <PropLabel>Surfacing</PropLabel>
      <Prop icon={Lock} active={!!capture.private} onClick={() => void vigil.setPrivate('captures', capture.id, !capture.private)}>
        {capture.private ? 'Private' : 'Can surface any time'}
      </Prop>
      <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => pin('captures', capture.id, !capture.pinnedAt)}>
        {capture.pinnedAt ? 'Pinned' : 'Pin to the prompt'}
      </Prop>
      <RemindMe table="captures" id={capture.id} at={capture.remindAt} />

      {capture.status === 'open' && (
        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
          <Merge className="size-4 shrink-0" />
          <input
            key={capture.id}
            placeholder="Merge into MF-…"
            onKeyDown={(event) => {
              const number = Number(event.currentTarget.value.replace(/\D/g, ''))
              if (event.key !== 'Enter' || !number) return
              void vigil.mergeCapture(capture.id, number).then((into) =>
                into ? toast(`Merged into MF-${number}`, () => void window.api.captures.save(capture.id, { status: 'open' })) : toast(`No MF-${number} to merge into`)
              )
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}
      <PropLabel>Who and where</PropLabel>
      <Remembered key={`a${capture.id}`} field="attribution" value={who} placeholder={ASKS[capture.kind as CaptureType]?.who ?? 'Who'} className="w-full text-[13px]" onChange={(value) => {
        setWho(value)
        void vigil.setCapture(capture.id, 'attribution', value.trim() || null)
      }} />
      <Remembered key={`m${capture.id}`} field="medium" value={where} placeholder={ASKS[capture.kind as CaptureType]?.where ?? 'Where'} className="w-full text-[13px]" onChange={(value) => {
        setWhere(value)
        void vigil.setCapture(capture.id, 'medium', value.trim() || null)
      }} />
      <Lineage id={capture.id} onOpen={onOpen} />
      <PropLabel>Details</PropLabel>
      <Prop icon={Hash}>{captureKey(capture.number)}</Prop>
      {capture.device && <Prop icon={Laptop}>{capture.device}</Prop>}
      {capture.elapsedMs ? <Prop icon={Timer}>Written in {capture.elapsedMs < 60000 ? `${Math.round(capture.elapsedMs / 1000)}s` : `${Math.round(capture.elapsedMs / 60000)} min`}</Prop> : null}
      {capture.source && <Prop icon={FileText}>{capture.source.replace(/\.md$/, '')}</Prop>}
      {/* Editable, because a system you can catch up on beats one you
          cannot fall behind in: a note from last Tuesday can say so. */}
      <DatePicker key={capture.id} value={capture.capturedAt} className="w-full" onChange={(at) => at && void vigil.setCapture(capture.id, 'capturedAt', at)} />
    </Props>
  )
}

/**
 * Filter, sort and group for a list of captures, with the Display menu that
 * sets them: the same in the main window and the prompt. `name` keeps each
 * list's choice apart.
 */
export function useCaptureDisplay(name: string, kept: CaptureMeta[], filter?: View['filter']): { groups: [string, CaptureMeta[]][]; display: React.JSX.Element } {
  const [view, setView] = useView(name, { sort: 'newest', group: 'none', filter })
  const statuses = [...new Set(kept.map((one) => one.status))]
  const facets: Facet<CaptureMeta>[] = [
    // Whether it has taken an exit: offered when the list holds more than one,
    // so handled and discarded captures can be reached where it is all held.
    ...(statuses.length > 1 ? [{ key: 'status', label: 'Status', options: ['open', 'promoted', 'resolved', 'discarded'].filter((one) => statuses.includes(one)).map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })), test: (one: CaptureMeta, status: string) => one.status === status }] : []),
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => kept.some((one) => one.kind === type.id)).map(({ id, label }) => ({ id, label })), test: (one, kind) => one.kind === kind },
    { key: 'when', label: 'Captured', options: AGES, test: (one, when) => period(one.capturedAt) === when },
    { key: 'tag', label: 'Tag', options: [...new Set(kept.flatMap((one) => splitTags(one.label).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}` })), test: (one, tag) => splitTags(one.label).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'typed', label: 'Typed here' }, { id: 'imported', label: 'Imported' }], test: (one, from) => (one.source ? 'imported' : 'typed') === from },
    { key: 'who', label: 'Who said it', options: [{ id: 'mine', label: 'My words' }, { id: 'theirs', label: 'Someone else' }], test: (one, who) => (one.attribution ? 'theirs' : 'mine') === who },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : !!one.private) }
  ]
  const groups = arrange(kept, view, facets, {
    newest: (a, b) => b.capturedAt.localeCompare(a.capturedAt),
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
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }, { id: 'kind', label: 'Kind' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }, { id: 'source', label: 'Where from' }]}
    />
  )
  return { groups, display }
}
