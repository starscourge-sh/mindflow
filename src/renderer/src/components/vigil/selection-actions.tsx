import type { Editor } from '@tiptap/core'
import { Gem, Inbox, ListTodo } from 'lucide-react'

import { ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { chime } from '@/lib/sound'
import { taskSaid, vigil } from '@/lib/vigil'
import { toast } from './ui'

/**
 * Select-to-anything: highlight words in a note and make them a capture, a
 * nugget or a task without leaving the note. A capture is for words too raw
 * to keep yet: they go to the inbox to be worked on. The new thing remembers
 * where it came from (`from`, the note it was lifted out of), and the note's
 * source is inherited, never invented at the point of selection.
 */
export function selectionActions(origin: { captureId?: string; attribution?: string | null; from?: string }) {
  return (editor: Editor): React.JSX.Element => {
    const words = (): string => {
      const { from, to } = editor.state.selection
      return editor.state.doc.textBetween(from, to, '\n').trim()
    }
    const button = 'flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4'
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
              if (!text) return
              chime('tap')
              void window.api.captures.create({ body: text, ...(origin.from ? { origin: origin.from } : {}) })
                .then(() => toast(origin.from ? 'In your inbox, linked back to here' : 'In your inbox'))
            }}
          >
            <Inbox /> Capture
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              const text = words()
              if (!text) return
              chime('promote')
              void vigil.nuggetFrom(text, origin).then(() => toast('Kept as a nugget'))
            }}
          >
            <Gem /> Nugget
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              const text = words()
              if (!text) return
              chime('done')
              void vigil.addTask(text, origin.captureId).then((made) => toast(taskSaid(made, 'Added to your tasks')))
            }}
          >
            <ListTodo /> Task
          </button>
        </ToolbarGroup>
      </>
    )
  }
}
