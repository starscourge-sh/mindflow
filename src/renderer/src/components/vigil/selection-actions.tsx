import type { Editor } from '@tiptap/core'
import { Gem, ListTodo } from 'lucide-react'

import { ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { toast } from './ui'

/**
 * Select-to-anything: highlight words in a note and make them a nugget or a
 * task without leaving the note. The new thing remembers where it came from:
 * the note's source is inherited, never invented at the point of selection.
 */
export function selectionActions(origin: { captureId?: string; attribution?: string | null }) {
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
              void vigil.addTask(text, origin.captureId).then(() => toast('Added to your tasks'))
            }}
          >
            <ListTodo /> Task
          </button>
        </ToolbarGroup>
      </>
    )
  }
}
