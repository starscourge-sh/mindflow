import type { Editor } from '@tiptap/core'
import { Gem, Inbox, ListTodo } from 'lucide-react'

import { ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { refuse, toast } from './ui'

/**
 * What has already been lifted, by kind and words, so a second click on the
 * same selection says so instead of making a duplicate. For this session only.
 */
const lifted = new Set<string>()
const once = (kind: 'capture' | 'nugget' | 'task', text: string): boolean => {
  const key = `${kind}\n${text}`
  if (!lifted.has(key)) return !!lifted.add(key)
  refuse({ capture: 'Already in your inbox', nugget: 'Already a nugget', task: 'Already a task' }[kind])
  return false
}

/**
 * Select-to-anything: highlight words in a note and make them a capture, a
 * nugget or a task without leaving the note. A capture is for words too raw
 * to keep yet: they go to the inbox to be worked on. The new thing remembers
 * where it came from (`from`, the note it was lifted out of), and the note's
 * source is inherited, never invented at the point of selection.
 */
export function selectionActions(origin: { captureId?: string; attribution?: string | null; from?: string; onLifted?: (id: string) => void }) {
  return (editor: Editor): React.JSX.Element => {
    const words = (): string => {
      const { from, to } = editor.state.selection
      return editor.state.doc.textBetween(from, to, '\n').trim()
    }
    const button = 'flex h-8 items-center gap-1.5 rounded-md px-2 text-control text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4'
    return (
      <>
        <ToolbarSeparator />
        <ToolbarGroup>
          {/* Always offered: words too raw for a nugget go to the inbox to be
              worked on. When they were lifted out of something saved, they
              point back to it. */}
          <button
            type="button"
            className={button}
            onClick={() => {
              const text = words()
              if (!text || !once('capture', text)) return
              chime('send')
              void window.api.captures.create({ body: text, ...(origin.from ? { origin: origin.from } : {}) })
                .then((id) => {
                  // From a note not saved yet: it is linked back once that note is.
                  if (!origin.from) origin.onLifted?.(id)
                  toast(origin.from ? 'In your inbox, linked back to here' : 'In your inbox, linked once this note is saved')
                })
            }}
          >
            <Inbox /> Capture
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              const text = words()
              if (!text || !once('nugget', text)) return
              // Only what can cross to the main process: not the callbacks.
              void vigil.nuggetFrom(text, { captureId: origin.captureId, attribution: origin.attribution })
                .then(() => {
                  chime('promote')
                  toast('Kept as a nugget')
                })
                .catch(() => lifted.delete(`nugget\n${text}`))
            }}
          >
            <Gem /> Nugget
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              const text = words()
              if (!text || !once('task', text)) return
              void makeTask({ text, origin: origin.captureId }, 'Added to your tasks')
            }}
          >
            <ListTodo /> Task
          </button>
        </ToolbarGroup>
      </>
    )
  }
}
