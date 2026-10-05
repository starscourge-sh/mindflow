import { useEffect, useState, type CSSProperties } from 'react'
import type { JSONContent } from '@tiptap/core'

import { MindflowEditor, TAGS } from '../mindflow'
import { useCaptures } from '../capture-list'
import { CaptureProps } from './captures-view'
import { ItemDetail } from './items-view'
import { NotePreview } from './note-preview'
import { Mentions } from './mentions'
import { selectionActions } from './selection-actions'
import { Toaster } from './ui'
import { Versions } from './note-extras'
import { TooltipProvider } from '@/components/ui/tooltip'
import { findCaptures, findHeadings, follow, headingIn } from '@/lib/capture-links'
import { toMarkdown } from '@/lib/export'
import { useAppearance, vigil, type ItemFull } from '@/lib/vigil'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/** Anything a link in here leads to opens in the main window, beside everything else. */
const elsewhere = (type: string, id: string, heading?: string): void => window.api.openInHome(type, id, heading)

/**
 * One note in a window of its own, opened with ⌘-click from any list: its
 * words and its properties, the same as beside the list, and nothing else.
 */
export function NoteWindow({ link }: { link: string }): React.JSX.Element {
  useAppearance()
  const [type, id] = link.split(':')
  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Toaster />
        <NotePreview />
        {/* Room for the traffic lights, and somewhere to hold the window by. */}
        <div className="h-10 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="@container/page flex min-h-0 flex-1 overflow-hidden">
          {type === 'capture' ? <CaptureWindow id={id} /> : <ItemWindow id={id} />}
        </div>
      </div>
    </TooltipProvider>
  )
}

function CaptureWindow({ id }: { id: string }): React.JSX.Element | null {
  const [capture, setCapture] = useState<Capture | null>(null)
  const meta = useCaptures(true).find((one) => one.id === id)
  // An earlier version shown in place of the words, and a new key once one is restored.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [rev, setRev] = useState(0)
  useEffect(() => void window.api.captures.get(id).then(setCapture), [id])
  useEffect(() => void (document.title = meta?.label || 'Note'), [meta?.label])
  if (!capture || !meta) return null
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex justify-end px-3">
          <Versions table="captures" id={id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })} onRestored={() => void window.api.captures.get(id).then((found) => {
            setCapture(found)
            setRev((n) => n + 1)
          })} />
        </div>
        {past ? (
          <MindflowEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
        <MindflowEditor
          key={`${id}-${rev}`}
          host={window.api}
          tokens={TAGS}
          onTokenClick={(token) => token.name === 'tag' && elsewhere('tag', token.value)}
          toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: id, from: id }) }}
          documentId={`capture-${id}`}
          defaultContent={(capture.body as JSONContent | string | null) ?? ''}
          findNotes={findCaptures}
          findHeadings={findHeadings}
          onOpenNote={(to, heading) => (to === id && heading ? headingIn('capture', id, heading) : follow(to, (type, at) => elsewhere(type, at, heading)))}
          after={<Mentions id={id} onOpen={elsewhere} />}
          onChange={(body, editor) => window.api.captures.save(id, { body, markdown: toMarkdown(editor) })}
        />
        )}
      </div>
      <CaptureProps capture={meta} onOpen={elsewhere} />
    </div>
  )
}

function ItemWindow({ id }: { id: string }): React.JSX.Element | null {
  const [item, setItem] = useState<ItemFull | null>(null)
  // Read again on any change, so a gloss or a question added shows here too.
  useEffect(() => {
    const load = (): void => void vigil.item(id).then(setItem)
    load()
    return window.api.captures.onChange(load)
  }, [id])
  useEffect(() => void (document.title = item?.title || 'Note'), [item?.title])
  return item ? <ItemDetail key={id} item={item} onOpen={elsewhere} /> : null
}
