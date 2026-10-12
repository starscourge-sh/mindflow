import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { vigil, type Focus, type Task } from '@/lib/vigil'
import { frogOn } from '@/lib/day-plan'
import { RowMenu } from './row-menu'
import { taskMenu } from './tasks-view'

/**
 * A task in a note, a linked to-do or a task link, right-clicked: the menu a
 * task has on every list, in place of the line's own. Read fresh each time,
 * so it offers the session running on it and the frog as they are now.
 */
export function TaskLinkMenu({ editor }: { editor: Editor }): React.JSX.Element | null {
  const [shown, setShown] = useState<{ task: Task; focus: Focus | null; frog: string | null; x: number; y: number } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const dom = editor.view.dom
    const onContext = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target?.closest || target.closest('.tiptap-excalidraw-canvas')) return
      // Its own line, not a plain line nested under it.
      const line = target.closest('li')
      const id = target.closest('a[data-note^="task:"]')?.getAttribute('data-note')?.slice(5) ?? (dom.contains(line) ? line?.getAttribute('data-task-id') : null)
      if (!id) return
      // Before the block menu, which listens on the same element.
      event.preventDefault()
      event.stopPropagation()
      const [x, y] = [event.clientX, event.clientY]
      void Promise.all([vigil.task(id), vigil.focusNow().catch(() => null), vigil.settings().catch(() => null)]).then(([task, focus, settings]) => {
        if (task && !editor.isDestroyed) setShown({ task, focus, frog: frogOn(settings), x, y })
      })
    }
    dom.addEventListener('contextmenu', onContext, true)
    return () => dom.removeEventListener('contextmenu', onContext, true)
  }, [editor])

  // The menu opens where the pointer was, as a right click on a row opens it.
  useEffect(() => {
    if (shown) anchor.current?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: shown.x, clientY: shown.y }))
  }, [shown])

  if (!shown) return null
  const { task, focus, frog } = shown
  // Opened as the link itself opens: a click on a task link, wherever this note is.
  const follow = editor.extensionManager.extensions.find((one) => one.name === 'noteLink')?.options.onOpenNote as ((id: string) => void) | undefined
  const open = (): void => (follow ? follow(`task:${task.id}`) : window.api.openInHome('task', task.id))
  return (
    <RowMenu items={taskMenu(task, { open, now: { focus, frog } })}>
      <span ref={anchor} aria-hidden className="pointer-events-none fixed size-0" style={{ left: shown.x, top: shown.y }} />
    </RowMenu>
  )
}
