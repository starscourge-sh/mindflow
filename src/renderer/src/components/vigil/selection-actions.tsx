import type { Editor } from '@tiptap/core'
import { alive } from '@/components/ui/alive-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'

import { ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/tiptap-ui-primitive/tooltip'
import { ShortcutDisplay } from '@/components/tiptap-ui-primitive/button/button'
import { makeTask } from '@/lib/tasks'
import { host, keepAsIs, once, reword, type Origin } from './reword'

/** The bar's own tooltip: what a click does, its keys, and the quick way past the card. */
function Tip({ does, keys, children }: { does: string; keys: string; children: React.ReactElement }): React.JSX.Element {
  return (
    <Tooltip delay={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        {does} <ShortcutDisplay shortcuts={[keys]} />
        <span className="block opacity-70">⌘-click keeps it as selected</span>
      </TooltipContent>
    </Tooltip>
  )
}

// itshover drawings in lucide's place, moving when their control is pointed at.
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)

/**
 * Select-to-anything: highlight words in a note and make them a capture, a
 * nugget or a task without leaving the note. A capture is for words too raw
 * to keep yet: they go to the inbox to be worked on. The new thing remembers
 * where it came from (`from`, the note it was lifted out of), and the note's
 * source is inherited, never invented at the point of selection.
 *
 * Capture and Idea open a small card by the words to reword them first
 * (reword.tsx); ⌘-click, or ⌘↵ with the words selected, keeps them as they are.
 */
export function selectionActions(origin: Origin) {
  return (editor: Editor): React.JSX.Element => {
    // Known to the keys: ⌃⌘C, ⌃⌘I and ⌘↵ on these words lift them out of this note.
    host(editor, origin)
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
          <Tip does="Capture, reworded first" keys="⌃⌘C">
          <button
            type="button"
            className={button}
            aria-label="Capture"
            onClick={(event) => (event.metaKey ? keepAsIs : reword)('capture', editor, origin)}
          >
            <Inbox /> <span className="tiptap-button-text">Capture</span>
          </button>
          </Tip>
          <Tip does="Idea, reworded first" keys="⌃⌘I">
          <button
            type="button"
            className={button}
            aria-label="Idea"
            onClick={(event) => (event.metaKey ? keepAsIs : reword)('nugget', editor, origin)}
          >
            <Gem /> <span className="tiptap-button-text">Idea</span>
          </button>
          </Tip>
          <button
            type="button"
            className={button}
            aria-label="Task"
            onClick={() => {
              const text = words()
              if (!text || !once('task', text)) return
              void makeTask({ text, origin: origin.captureId }, 'Added to your tasks')
            }}
          >
            <ListTodo /> <span className="tiptap-button-text">Task</span>
          </button>
        </ToolbarGroup>
      </>
    )
  }
}
