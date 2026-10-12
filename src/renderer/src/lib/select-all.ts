import { useEffect, useRef } from 'react'
import { chime } from './sound'
import { typing } from '@/components/vigil/ui'

/**
 * ⌘A in a list you can pick from: every row on show is picked, the way
 * Finder and Mail do it. Not while writing in a field or a note, where ⌘A
 * stays the words' own select-all. Gives back the same select-all, for the
 * selection bar and the right-click menu.
 *
 * `shown` is what the list draws now (filters and search applied), so only
 * what you can see is picked. `here` says the list is the one in front (a
 * split window answers only there).
 */
export function useSelectAll(
  shown: () => string[],
  chosen: string[],
  setChosen: (ids: string[]) => void,
  { enabled = true, here = () => true }: { enabled?: boolean; here?: () => boolean } = {}
): () => void {
  const now = useRef({ shown, chosen, setChosen, here })
  now.current = { shown, chosen, setChosen, here }
  const selectAll = (): void => {
    const { shown, chosen, setChosen } = now.current
    const ids = shown()
    // Nothing to pick, or every one picked already: said, so the key is never ignored.
    if (!ids.length || ids.every((id) => chosen.includes(id))) return chime('nope')
    chime('on')
    setChosen([...new Set([...chosen, ...ids])])
  }
  const run = useRef(selectAll)
  run.current = selectAll
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.code !== 'KeyA') return
      if (event.defaultPrevented || typing() || !now.current.here()) return
      // An open menu or picker keeps its own keys.
      if (document.querySelector('[role="menu"], [role="listbox"]')) return
      event.preventDefault()
      event.stopPropagation()
      run.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return selectAll
}
