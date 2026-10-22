import { useEffect, useRef, useState, type RefObject } from 'react'
import { chime } from './sound'
import { haligtree } from './haligtree'
import { toast, typing } from '@/components/haligtree/ui'
import { num } from '../../../main/dates'
import { listInFront, useListScope } from './list-front'

/**
 * Several dated lines picked at once (a question's clues, a goal's logs), as
 * every list picks: ⇧- or ⌘-click, x on the line with the focus, ⌘A with the
 * pointer over the list or the last click in it, Esc to let go, and ⌫ to remove what is picked (or the
 * line with the focus), with one Undo for the lot. Rows carry `data-line-id`.
 */
export function usePickLines(ids: string[], scope: RefObject<HTMLElement | null>, what: { one: string; many: string }): {
  picked: (id: string) => boolean
  count: number
  toggle: (id: string) => void
  clear: () => void
  /** A click on a row: true when it picked rather than did the row's own thing. */
  click: (event: React.MouseEvent, id: string) => boolean
  remove: (list: string[]) => void
  all: () => void
} {
  const [chosen, setChosen] = useState<string[]>([])
  const live = chosen.filter((id) => ids.includes(id))
  useListScope(scope)
  const now = useRef({ ids, live })
  now.current = { ids, live }
  const toggle = (id: string): void => setChosen((was) => (chime(was.includes(id) ? 'off' : 'on'), was.includes(id) ? was.filter((one) => one !== id) : [...was, id]))
  const clear = (): void => (chime('off'), setChosen([]))
  const all = (): void => {
    const { ids, live } = now.current
    if (!ids.length || ids.every((id) => live.includes(id))) return chime('nope')
    chime('on')
    setChosen(ids)
  }
  const remove = (list: string[]): void => {
    if (!list.length) return
    void Promise.all(list.map((id) => haligtree.cutClue(id))).then((was) => {
      setChosen([])
      chime('away')
      const back = was.filter((one) => !!one)
      toast(list.length === 1 ? `${what.one[0].toUpperCase()}${what.one.slice(1)} removed` : `Removed ${num(list.length)} ${what.many}`,
        back.length ? () => void Promise.all(back.map((one) => haligtree.putClue(one!))).then(() => chime('undo')) : undefined)
    })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // In front: under the pointer or last clicked (lib/list-front.ts), or holding the focus.
      const front = listInFront()
      const inside = !!scope.current && (front ? front === scope.current : scope.current.contains(document.activeElement))
      const { live } = now.current
      if ((!inside && !live.length) || typing() || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (document.querySelector('[role="menu"], [role="dialog"]')) return
      const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-line-id]')?.dataset.lineId
      if (event.metaKey && event.code === 'KeyA' && inside) return void (event.preventDefault(), event.stopPropagation(), all())
      if (event.key === 'Escape' && live.length) return void (event.preventDefault(), event.stopPropagation(), clear())
      if ((event.key === 'Backspace' || event.key === 'Delete') && !event.shiftKey) {
        const list = live.length ? live : row && inside ? [row] : []
        if (!list.length) return
        event.preventDefault()
        event.stopPropagation()
        return remove(list)
      }
      if (event.key === 'x' && !event.metaKey && row && inside) (event.preventDefault(), event.stopPropagation(), toggle(row))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    picked: (id) => live.includes(id),
    count: live.length,
    toggle,
    clear,
    click: (event, id) => {
      if (!event.shiftKey && !event.metaKey) return false
      event.preventDefault()
      toggle(id)
      return true
    },
    remove,
    all
  }
}
