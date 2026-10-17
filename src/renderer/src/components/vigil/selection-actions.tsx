import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

import { ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/tiptap-ui-primitive/tooltip'
import { ShortcutDisplay } from '@/components/tiptap-ui-primitive/button/button'
import { makeTask } from '@/lib/tasks'
import { lineTasksSaid, makeLineTasks } from '@/lib/line-tasks'
import { host, keepAsIs, once, reword, type Origin } from './reword'
import { markKept } from '@/extensions/kept'
import { FileText as PageIcon, Gem, Inbox, ListTodo } from '@/components/ui/icons'
import { turnIntoPage } from '@/lib/turn-into-page'

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
          <Tip does="Gem, reworded first" keys="⌃⌘I">
          <button
            type="button"
            className={button}
            aria-label="Gem"
            onClick={(event) => (event.metaKey ? keepAsIs : reword)('nugget', editor, origin)}
          >
            <Gem /> <span className="tiptap-button-text">Gem</span>
          </button>
          </Tip>
          {/* Several lines picked: a task each, each linked to its line, which becomes a checklist line ticked with it. */}
          <TaskButton editor={editor} origin={origin} button={button} words={words} />
          {/* The words become a page of their own, a link to it left in their place. */}
          <Tooltip delay={200}>
            <TooltipTrigger asChild>
              <button type="button" className={button} aria-label="Turn into page" data-turn-into-page
                onClick={() => void turnIntoPage(editor, origin.captureId)}>
                <PageIcon /> <span className="tiptap-button-text">Page</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Turn into page<span className="block opacity-70">The words get a page of their own; a link to it stays here</span></TooltipContent>
          </Tooltip>
        </ToolbarGroup>
      </>
    )
  }
}

/**
 * Task, or with several lines picked "3 tasks": read again as the selection
 * changes, since the bar stays up while you widen it.
 */
function TaskButton({ editor, origin, button, words }: { editor: Editor; origin: Origin; button: string; words: () => string }): React.JSX.Element {
  // Read as Today's page reads lines: indented ones are steps of the line above.
  const count = (): { tasks: number; said: string } => lineTasksSaid(editor, editor.state.selection.from, editor.state.selection.to)
  const [plan, setPlan] = useState(count)
  const lines = plan.tasks
  useEffect(() => {
    const read = (): void => setPlan(count())
    editor.on('selectionUpdate', read)
    return () => void editor.off('selectionUpdate', read)
  })
  if (lines > 1 || plan.said !== 'a task')
    return (
      <Tooltip delay={200}>
        <TooltipTrigger asChild>
          <button type="button" className={button} aria-label={`Make ${plan.said}`} data-make-tasks
            onClick={() => void makeLineTasks(editor, editor.state.selection.from, editor.state.selection.to, origin.captureId, origin.takeOut)}>
            <ListTodo /> <span className="tiptap-button-text first-letter:uppercase">{plan.said}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Make {plan.said}<span className="block opacity-70">Each line a task; an indented line is a step of the line above</span></TooltipContent>
      </Tooltip>
    )
  return (
    <button
      type="button"
      className={button}
      aria-label="Task"
      onClick={() => {
        const text = words()
        if (!text || !once('task', text)) return
        // The words stay, marked as a task too: their mark opens it, and Undo takes both back.
        const { from, to } = editor.state.selection
        let unmark: (() => void) | null = null
        void makeTask({ text, origin: origin.captureId }, 'Added to your tasks; the line is marked in your note', { onUndo: () => unmark?.() })
          .then((made) => void (made && (unmark = markKept({ editor, from, to }, 'task', made.id))))
      }}
    >
      <ListTodo /> <span className="tiptap-button-text">Task</span>
    </button>
  )
}
