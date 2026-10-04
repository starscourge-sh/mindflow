import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowUpRight, Calendar, CheckCircle2, FileText, Hash, Inbox, ListTodo, Lock, Pin, Trash2 } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { CaptureList, useCaptures, type CaptureMeta } from '../capture-list'
import { STATUS_ICON, captureKey, findCaptures } from '@/lib/capture-links'
import { titleOf } from '@/lib/document'
import { toMarkdown } from '@/lib/export'
import { vigil } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { Empty, Kbd, Page, Prop, PropLabel, Props, toast, useListKeys } from './ui'
import { RemindMe } from './items-view'

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
  useEffect(() => {
    if (focus) pick(focus)
  }, [focus])
  // The open capture as the list last saw it, so its status follows an exit.
  const meta = all.find((capture) => capture.id === open?.id)

  return (
    <>
      <Page title={title} count={shown.length}>
        {shown.length ? (
          <div className="px-3 py-2">
            <CaptureList captures={shown} selected={open?.id} cursor={cursor} onPick={pick} />
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
              toolbar={{ fixed: false }}
              documentId={`capture-${open.id}`}
              defaultContent={(open.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              onOpenNote={pick}
              onChange={(body, editor) =>
                window.api.captures.save(open.id, { body, title: titleOf(body), markdown: toMarkdown(editor) })
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
                void exit.run().then(() => toast(exit.said, exit.label === 'Promote to nugget' ? undefined : reopen))
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
      <Prop icon={Pin} active={!!capture.pinnedAt} onClick={() => void vigil.pin('captures', capture.id, !capture.pinnedAt)}>
        {capture.pinnedAt ? 'Pinned' : 'Pin to the prompt'}
      </Prop>
      <RemindMe table="captures" id={capture.id} at={capture.remindAt} />

      <PropLabel>Details</PropLabel>
      <Prop icon={Hash}>{captureKey(capture.number)}</Prop>
      {capture.source && <Prop icon={FileText}>{capture.source.replace(/\.md$/, '')}</Prop>}
      <Prop icon={Calendar}>{new Date(capture.capturedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</Prop>
    </Props>
  )
}
