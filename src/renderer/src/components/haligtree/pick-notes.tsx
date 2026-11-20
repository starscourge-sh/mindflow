import { useEffect, useRef, useState } from 'react'
import { FolderInput, ListChecks, Trash2, X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useSelectAll } from '@/lib/select-all'
import { usePicking, type Picking } from '@/lib/pick-range'
import { binItem, moveToBin } from '@/lib/to-bin'
import { num } from '../../../../main/dates'
import { Button } from '@/components/ui/button'
import { FoldItem, MenuRows, Tip, typing } from './ui'
import type { MenuItem } from './row-menu'
import { menuOpen } from '@/lib/menu-keys'

/**
 * Picking several kept notes (questions, goals), the way the Inbox and Gems
 * pick: x on the row under the cursor, ⇧-click, ⌘A for all on show, Escape to
 * let them go. What is picked can go to the Bin together, or wherever the
 * page's own `put` sends it (goals: on ice), each with its notice and undo.
 */
export function usePickNotes(shown: string[], cursor: number, { here, noun, tier, titleOf, put }: { here: () => boolean; noun: [string, string]; /** What they are, for the Bin: question, goal. */ tier: string; /** Their words, for ⌘C. */ titleOf?: (id: string) => string | undefined; /** The page's own move for what is picked, beside the Bin. */ put?: { label: string; hint: string; run: (ids: string[]) => Promise<unknown> } }): {
  chosen: string[]
  toggle: (id: string) => void
  /** ⌘-click, ⇧-click, ⇧↑ and ⇧↓, as Finder picks. */
  picking: Picking
  bar: React.JSX.Element | null
  menu: (id: string) => MenuItem[] | null
  /** The lines a single row's menu adds: Select, Select all. */
  rowItems: (id: string) => MenuItem[]
  /** Let the picked go, quietly: after something done to them said so itself (grouped). */
  letGo: () => void
} {
  const [chosen, setChosen] = useState<string[]>([])
  const live = chosen.filter((id) => shown.includes(id))
  const picking = usePicking(shown, live, setChosen)
  const toggle = picking.toggle
  const clear = (): void => (chime('off'), setChosen([]))
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const toBin = (ids: string[]): void => void moveToBin(ids.map((id) => ({ type: tier, id }))).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => shown, live, setChosen, { here, onDelete: toBin, current: () => now.current.shown[now.current.cursor], titleOf })
  const allPicked = shown.length > 0 && shown.every((id) => live.includes(id))
  const now = useRef({ shown, cursor, live })
  now.current = { shown, cursor, live }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && now.current.live.length && !menuOpen()) {
        event.preventDefault()
        event.stopPropagation()
        return clear()
      }
      const id = now.current.shown[now.current.cursor]
      if (event.key === 'x' && id) {
        event.preventDefault()
        toggle(id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const move = (): void => void put?.run(live).then(() => setChosen([]))
  const bar = live.length ? (
    <span className="flex items-center gap-1">
      {put && <Tip label={put.hint}><Button variant="ghost" size="sm" onClick={move}>{put.label}</Button></Tip>}
      <Tip label={`Into the Bin, where ${live.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
        <Button variant="ghost" size="sm" onClick={() => toBin(live)}>Move to the Bin</Button>
      </Tip>
      {!allPicked && <Tip label={`Every ${noun[0]} on show  ⌘A`}><Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button></Tip>}
      <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><X className="size-3.5" /></Button></Tip>
      <MenuRows>
        {put && <FoldItem icon={FolderInput} label={put.label} onSelect={move} />}
        <FoldItem icon={Trash2} label="Move to the Bin" keys="⌫" onSelect={() => toBin(live)} />
      </MenuRows>
      <MenuRows group="select">
        {!allPicked && <FoldItem icon={ListChecks} label="Select all" keys="⌘A" onSelect={selectAll} />}
        <FoldItem icon={X} label="Clear the selection" keys="Esc" onSelect={clear} />
      </MenuRows>
    </span>
  ) : null
  const menu = (id: string): MenuItem[] | null => live.includes(id) && live.length > 1 ? [
    put && { label: `${put.label}: ${num(live.length)} ${noun[1]}`, hint: put.hint, run: move },
    put && 'separator',
    binItem(live.map((id) => ({ type: tier, id })), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: clear }
  ] : null
  const rowItems = (id: string): MenuItem[] => ['separator', { label: live.includes(id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => toggle(id) }, !allPicked && { label: 'Select all', about: 'list', keys: '⌘A', run: selectAll }]
  return { chosen: live, toggle, picking, bar, menu, rowItems, letGo: () => setChosen([]) }
}
