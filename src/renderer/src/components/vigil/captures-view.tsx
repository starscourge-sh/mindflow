import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowUpRight, Calendar, CheckCircle2, FileText, Hash, Inbox, ListTodo, Lock, Merge, Pin, Trash2, X } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { ASKS, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { CaptureList, useCaptures, type CaptureMeta } from '../capture-list'
import { STATUS_ICON, captureKey, findCaptures } from '@/lib/capture-links'
import { toMarkdown } from '@/lib/export'
import { vigil } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { Empty, Kbd, Page, Prop, PropLabel, Props, Remembered, toast, useListKeys } from './ui'
import { RemindMe } from './items-view'
import { selectionActions } from './selection-actions'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/**
 * Captures: the raw tier. A list in the middle and the open one on the right,
 * with its properties and its exits. `focus` opens one straight away, for when
 * search or a tag sent you here.
 */
export function CapturesView({ title, keep, focus }: {
  title: string
  keep: (capture: CaptureMeta) => boolean
  focus?: string
}): React.JSX.Element {
  const all = useCaptures()
  const shown = all.filter(keep)
  const [open, setOpen] = useState<Capture | null>(null)
  const pick = (id: string): void => void window.api.captures.get(id).then(setOpen)
  const [cursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })
  // x selects, as in Linear, for an exit on many at once.
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      if (event.key !== 'x' || active?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '')) return
      const capture = shown[cursor]
      if (capture) setChosen((ids) => (ids.includes(capture.id) ? ids.filter((one) => one !== capture.id) : [...ids, capture.id]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      <Page
        title={title}
        count={shown.length}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-1">
              <span className="mr-1">{chosen.length} selected</span>
              <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() => bulk('resolved')}>Resolve</button>
              <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() => bulk('discarded')}>Discard</button>
              <button type="button" title="Clear" className="rounded p-1 hover:bg-accent" onClick={() => setChosen([])}><X className="size-3.5" /></button>
            </span>
          ) : shown.length > 1 ? <span className="text-xs">x to select</span> : null
        }
      >
        {shown.length ? (
          <div className="px-3 py-2">
            <CaptureList captures={shown} selected={open?.id} cursor={cursor} chosen={chosen} onPick={pick} />
          </div>
        ) : (
          <Empty shape={['flower', 2]} title="Nothing waiting">
            Everything here has taken an exit. Press <Kbd>⌘</Kbd> <Kbd>.</Kbd> anywhere to catch the next thought.
          </Empty>
        )}
      </Page>
      {open && meta ? (
        <div className="flex min-w-0 flex-[1.4] border-l">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
            {/* The first line names the capture, the same as in the prompt. */}
            <MindflowEditor
              key={open.id}
              host={window.api}
              tokens={TAGS}
              toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: open.id }) }}
              documentId={`capture-${open.id}`}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              onOpenNote={pick}
              onChange={(body, editor) =>
                window.api.captures.save(open.id, { body, markdown: toMarkdown(editor) })
              }
            />
          </div>
          <CaptureProps capture={meta} />
        </div>
      ) : null}
    </>
  )
}

/** Status and the exits, then what the capture is, then where it came from. */
function CaptureProps({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const Status = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.open
  const reopen = (): void => void window.api.captures.save(capture.id, { status: 'open' })
  const [who, setWho] = useState(capture.attribution ?? '')
  const [where, setWhere] = useState(capture.medium ?? '')
  useEffect(() => {
    setWho(capture.attribution ?? '')
    setWhere(capture.medium ?? '')
  }, [capture.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const exits = [
    { icon: ArrowUpRight, label: 'Promote to nugget', run: () => vigil.promote(capture.id), said: 'Promoted to a nugget' },
    { icon: ListTodo, label: 'Make it a task', run: () => vigil.toTask(capture.id), said: 'Now a task' },
    { icon: CheckCircle2, label: 'Resolve', run: () => window.api.captures.save(capture.id, { status: 'resolved' }), said: 'Resolved' },
    { icon: Trash2, label: 'Discard', run: () => window.api.captures.save(capture.id, { status: 'discarded' }), said: 'Discarded' }
  ]

  return (
    <Props>
      <PropLabel>Status</PropLabel>
      <Prop icon={Status} active>
        <span className="capitalize">{capture.status}</span>
      </Prop>
      {capture.status === 'open'
        ? exits.map((exit) => (
            <Prop
              key={exit.label}
              icon={exit.icon}
              onClick={() => {
                chime(exit.label === 'Discard' ? 'away' : exit.label === 'Promote to nugget' ? 'promote' : 'done')
                void exit.run().then((result) =>
                  result === 'needs-source'
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
      <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => void vigil.pin('captures', capture.id, !capture.pinnedAt).then((ok) => ok || toast('Three pins at most: unpin one first'))}>
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
      <PropLabel>Details</PropLabel>
      <Prop icon={Hash}>{captureKey(capture.number)}</Prop>
      {capture.source && <Prop icon={FileText}>{capture.source.replace(/\.md$/, '')}</Prop>}
      {/* Editable, because a system you can catch up on beats one you
          cannot fall behind in: a note from last Tuesday can say so. */}
      <label className="flex items-center gap-2 rounded-md px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
        <Calendar className="size-4 shrink-0" />
        <input
          key={capture.id}
          type="date"
          defaultValue={capture.capturedAt.slice(0, 10)}
          onChange={(event) => event.target.value && void vigil.setCapture(capture.id, 'capturedAt', new Date(`${event.target.value}T12:00:00`).toISOString())}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
    </Props>
  )
}
