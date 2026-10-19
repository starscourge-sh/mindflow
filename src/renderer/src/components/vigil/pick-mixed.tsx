import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { manyTaskItems } from './late-tasks'
import { binItem, moveToBin } from '@/lib/to-bin'
import { makeTasks, type TaskNote } from '@/lib/tasks'
import { enqueue } from '@/lib/reading-queue'
import { num } from '../../../../main/dates'
import { Button } from '@/components/ui/button'
import { Tip, typing } from './ui'
import type { MenuItem, RowItem } from './row-menu'

/** A thing on a page that mixes kinds (Home, a tag, search): enough to act on it. */
export type Pickable = { type: string; id: string; title: string; status?: string; private?: boolean | number }
const keyOf = (one: Pick<Pickable, 'type' | 'id'>): string => `${one.type}:${one.id}`
/** What can go to the Bin from a mixed page: every kind the Bin holds. */
const BINNABLE = ['capture', 'task', 'nugget', 'article', 'question', 'goal']
/** What can become a task: a capture (still in the inbox, or it is skipped and said), a gem, a piece of writing. */
const taskable = (one: Pickable): boolean => one.type === 'capture' || one.type === 'nugget' || one.type === 'article'
const noteOf = (one: Pickable): TaskNote =>
  one.type === 'capture' ? { id: one.id, title: one.title, private: !!one.private, capture: true, open: (one.status ?? 'open') === 'open' } : { id: one.id, title: one.title, private: !!one.private }

/**
 * Picking several on a page of mixed things, the way every list picks: ⇧-click
 * (or x on the one with the focus), ⌘A for all on show, Escape to let go.
 * What is picked can be made tasks or queued to read together, each with a
 * count, a sound and one undo. `keys: false` leaves ⌘A and x to the page (a
 * search box, whose ⌘A is its words').
 */
export function usePickMixed(shown: Pickable[], { here = () => true, keys = true }: { here?: () => boolean; keys?: boolean } = {}): {
  picked: (one: Pick<Pickable, 'type' | 'id'>) => boolean
  toggle: (one: Pick<Pickable, 'type' | 'id'>) => void
  /** A row clicked: ⌘ and ⇧ pick as Finder does and say true; a plain click lets the picked ones go and says false, so it opens. */
  click: (event: { metaKey: boolean; shiftKey: boolean; altKey: boolean }, one: Pick<Pickable, 'type' | 'id'>) => boolean
  count: number
  selectAll: () => void
  clear: () => void
  bar: React.JSX.Element | null
  /** The right-click menu among several picked, or null for the row's own. */
  menu: (one: Pick<Pickable, 'type' | 'id'>) => RowItem[] | null
  /** What a single row's menu adds: Select, Select all. */
  rowItems: (one: Pick<Pickable, 'type' | 'id'>) => MenuItem[]
} {
  const [chosen, setChosen] = useState<string[]>([])
  // One thing shows in two places on Home: picked once, counted once.
  const all = [...new Map(shown.map((one) => [keyOf(one), one])).values()]
  const live = chosen.filter((key) => all.some((one) => keyOf(one) === key))
  const list = all.filter((one) => live.includes(keyOf(one)))
  const picking = usePicking(all.map(keyOf), live, setChosen)
  const toggle = (one: Pick<Pickable, 'type' | 'id'>): void => picking.toggle(keyOf(one))
  const clear = (): void => (chime('off'), setChosen([]))
  // ⌫ on what is picked (or the row with the focus): to the Bin at once, with Undo.
  const refsOf = (keys: string[]): { type: string; id: string; status?: string }[] =>
    all.filter((one) => keys.includes(keyOf(one)) && BINNABLE.includes(one.type)).map((one) => ({ type: one.type, id: one.id, status: one.status }))
  const toBin = (keys: string[]): void => {
    const refs = refsOf(keys)
    if (!refs.length) return
    void moveToBin(refs).then((n) => n && setChosen([]))
  }
  const focused = (): string | undefined => {
    const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-pick], [data-drag-open]')
    return row?.dataset.pick ?? row?.dataset.dragOpen
  }
  const selectAll = useSelectAll(() => all.map(keyOf), live, setChosen, { here, enabled: keys, onDelete: toBin, current: focused, titleOf: (key) => all.find((one) => keyOf(one) === key)?.title })
  const allPicked = all.length > 0 && all.every((one) => live.includes(keyOf(one)))
  const now = useRef(live)
  now.current = live
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && now.current.length && !document.querySelector('[role="menu"]') && (!typing() || !keys)) {
        event.preventDefault()
        event.stopPropagation()
        return clear()
      }
      if (!keys || typing() || event.key !== 'x') return
      const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-pick], [data-drag-open]')
      const key = row?.dataset.pick ?? row?.dataset.dragOpen
      if (!key) return
      const [type, ...rest] = key.split(':')
      event.preventDefault()
      toggle({ type, id: rest.join(':') })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [keys]) // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = list.filter(taskable)
  const reads = list.filter((one) => one.type !== 'task')
  const makeEach = (): void => void makeTasks(tasks.map(noteOf)).then((made) => made && setChosen([]))
  const queue = (next: boolean): void => void enqueue(reads.map((one) => one.id), next).then(() => setChosen([]))
  const bar = live.length ? (
    <span className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-sm font-medium whitespace-nowrap text-foreground tabular-nums">{num(live.length)} selected</span>
      {tasks.length > 0 && (
        <Tip label="A task for each, linked to its note">
          <Button variant="secondary" size="sm" onClick={makeEach}>{tasks.length === 1 ? 'Make it a task' : `Make ${num(tasks.length)} tasks`}</Button>
        </Tip>
      )}
      {reads.length > 0 && (
        <Tip label="At the end of your reading queue; ⌥-click to read them next">
          <Button variant="ghost" size="sm" onClick={(event) => queue(event.altKey)}>Add to queue</Button>
        </Tip>
      )}
      {refsOf(live).length > 0 && (
        <Tip label={`Into the Bin, where ${live.length === 1 ? 'it' : 'they'} can come back${keys ? '  ⌫' : ''}`}>
          <Button variant="ghost" size="sm" onClick={() => toBin(live)}>Move to the Bin</Button>
        </Tip>
      )}
      {!allPicked && <Tip label={keys ? 'Everything on show  ⌘A' : 'Everything found'}><Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button></Tip>}
      <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><X className="size-3.5" /></Button></Tip>
    </span>
  ) : null
  const menu = (one: Pick<Pickable, 'type' | 'id'>): RowItem[] | null => live.includes(keyOf(one)) && live.length > 1 ? [
    tasks.length > 0 && { label: tasks.length === 1 ? 'Make it a task' : `Make ${num(tasks.length)} tasks`, run: makeEach },
    reads.length > 0 && { label: `Add ${num(reads.length)} to the queue`, run: () => queue(false) },
    'separator',
    // The tasks among them: their day, priority and tags, as one task's menu has them.
    ...manyTaskItems(list.filter((one) => one.type === 'task').map((one) => one.id), { mixed: list.some((one) => one.type !== 'task'), after: () => setChosen([]) }),
    list.some((one) => one.type === 'task') && 'separator',
    refsOf(live).length > 0 && binItem(refsOf(live), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', keys: keys ? '⌘A' : undefined, run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: clear }
  ] : null
  const rowItems = (one: Pick<Pickable, 'type' | 'id'>): MenuItem[] => ['separator', { label: live.includes(keyOf(one)) ? 'Unselect' : 'Select', keys: '⇧-click', run: () => toggle(one) }, all.length > 1 && !allPicked && { label: 'Select all', keys: keys ? '⌘A' : undefined, run: selectAll }]
  return { picked: (one) => live.includes(keyOf(one)), toggle, click: (event, one) => picking.click(event, keyOf(one)), count: live.length, selectAll, clear, bar, menu, rowItems }
}

/** How a picked card or row looks anywhere: the accent's tint and a ring in it, plain in every theme. */
export const PICKED_MARK = 'data-[picked]:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] data-[picked]:shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tt-brand-color-400)_65%,transparent)]'
