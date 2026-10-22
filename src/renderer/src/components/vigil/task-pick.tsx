import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { chime, type Cue } from '@/lib/sound'
import { vigil, whenInLine, type Task } from '@/lib/vigil'
import { useSelectAll } from '@/lib/select-all'
import { usePicking, type Picking } from '@/lib/pick-range'
import { binItem, moveToBin } from '@/lib/to-bin'
import { toNoteItem } from '@/lib/tasks'
import { manyTaskItems } from './late-tasks'
import { num } from '../../../../main/dates'
import { Button } from '@/components/ui/button'
import TrashIcon from '@/components/ui/trash-icon'
import { Tip, toast, typing } from './ui'
import type { RowItem } from './row-menu'
import { shiftTo } from './tasks-view'

/** The tint a picked task row takes: the same as a picked note's. */
export const PICKED_ROW = 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tt-brand-color-400)_65%,transparent)]'

/**
 * Several tasks picked at once, as notes are: x on the row under the cursor,
 * ⇧-click, ⌘A for every one on show, Escape to let them go. What is picked can
 * be done, moved or closed together, each with one notice, one sound and one
 * undo for the lot.
 */
export function useTaskPick(shown: Task[], cursor: number, { here, off = false }: { here: () => boolean; off?: boolean }): {
  chosen: string[]
  toggle: (id: string) => void
  /** A row clicked: ⌘ and ⇧ pick as Finder does and say true; a plain click lets the picked ones go and says false, so it opens. */
  click: Picking['click']
  /** ⇧↑ and ⇧↓ from the anchor. */
  extend: Picking['extend']
  bar: React.JSX.Element | null
  menu: (task: Task) => RowItem[] | null
  /** The end of one task's own menu: Select (or Unselect) and Select all, as every list's row menu ends. */
  rowItems: (id: string) => RowItem[]
} {
  const [chosen, setChosen] = useState<string[]>([])
  // Only what is still on show stays picked: a task done elsewhere drops out.
  const live = chosen.filter((id) => shown.some((task) => task.id === id))
  const picking = usePicking(shown.map((task) => task.id), live, setChosen)
  const toggle = picking.toggle
  const clear = (): void => (chime('off'), setChosen([]))
  // ⌫ on what is picked (or the row under the cursor): closed without doing, into the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string; status?: string }[] => ids.map((id) => ({ type: 'task', id, status: shown.find((task) => task.id === id)?.status }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => shown.map((task) => task.id), live, setChosen, { here, enabled: !off, onDelete: toBin, current: () => now.current.shown[now.current.cursor]?.id, titleOf: (id) => shown.find((task) => task.id === id)?.title })
  const allPicked = shown.length > 0 && shown.every((task) => live.includes(task.id))
  const now = useRef({ shown, cursor, live })
  now.current = { shown, cursor, live }
  useEffect(() => {
    if (off) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // An open menu takes its own Escape: closing it keeps what is picked.
      if (event.key === 'Escape' && now.current.live.length && !document.querySelector('[role="menu"]')) {
        event.preventDefault()
        event.stopPropagation()
        return clear()
      }
      const task = now.current.shown[now.current.cursor]
      if (event.key === 'x' && task) {
        event.preventDefault()
        toggle(task.id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [off]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = (): Task[] => shown.filter((task) => live.includes(task.id))
  // One notice for the lot, its sound, and an undo that puts each back as it was.
  const all = async <T,>(work: (task: Task) => Promise<T>, undo: (task: Task, was: T) => unknown, said: (n: number) => string, cue: Cue): Promise<void> => {
    const tasks = picked()
    if (!tasks.length) return
    setChosen([])
    const was = await Promise.all(tasks.map(work))
    chime(cue)
    toast(said(tasks.length), () => void Promise.all(tasks.map((task, at) => undo(task, was[at]))))
  }
  const done = (): Promise<void> => all((task) => vigil.doneTask(task.id), (task, was) => vigil.undoneTask(task.id, was), (n) => (n === 1 ? 'Done' : `${num(n)} done`), 'done')
  const move = (days: number): Promise<void> =>
    all(
      (task) => vigil.saveTask(task.id, { due: shiftTo(days, task.dueAt) }).then((before) => ({ due: task.dueAt, plan: task.planFor, ...(before === true ? {} : before) })),
      (task, was) => vigil.saveTask(task.id, was),
      (n) => `${n === 1 ? 'Moved' : `Moved ${num(n)}`} to ${whenInLine(shiftTo(days), true)}`,
      'move'
    )

  const bar = live.length ? (
    <span className="flex items-center gap-1">
      <Button variant="secondary" size="sm" onClick={() => void done()}>{live.length === 1 ? 'Complete' : `Complete ${num(live.length)}`}</Button>
      <Button variant="ghost" size="sm" onClick={() => void move(0)}>Today</Button>
      <Button variant="ghost" size="sm" onClick={() => void move(1)}>Tomorrow</Button>
      <Button variant="ghost" size="sm" onClick={() => void move(7)}>Next week</Button>
      <Tip label={`Closed without doing: into the Bin, where ${live.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
        {/* In quick capture's narrow panel, "Bin" with its can, so the bar stays on one line. */}
        <Button variant="ghost" size="sm" aria-label="Move to the Bin" onClick={() => toBin(live)}><TrashIcon size={14} /><span className="@max-[28rem]:hidden">Move to the </span>Bin</Button>
      </Tip>
      {!allPicked && <Tip label="Every task on show  ⌘A"><Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button></Tip>}
      <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><X className="size-3.5" /></Button></Tip>
    </span>
  ) : null
  // Right-clicked among several picked, the menu speaks for all of them.
  const menu = (task: Task): RowItem[] | null => live.includes(task.id) && live.length > 1 ? [
    { label: `Complete ${num(live.length)}`, run: () => void done() },
    'separator',
    // The day, priority and tags, as one task's menu has them, for all of them.
    ...manyTaskItems(live, { after: () => setChosen([]) }),
    'separator',
    toNoteItem(live, () => setChosen([])),
    binItem(binRefs(live), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: clear }
  ] : null
  const rowItems = (id: string): RowItem[] => [
    { label: live.includes(id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(id) },
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll }
  ]
  return { chosen: live, toggle, click: picking.click, extend: picking.extend, bar, menu, rowItems }
}
