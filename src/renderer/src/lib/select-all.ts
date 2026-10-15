import { useEffect, useRef } from 'react'
import { chime } from './sound'
import { refuse, toast, typing } from '@/components/vigil/ui'
import { num } from '../../../main/dates'
import { listInFront } from './list-front'

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
  { enabled = true, here = () => true, onDelete, current, titleOf, deleteSaid = '⌫ moves them to the Bin', scoped = false }: {
    enabled?: boolean
    here?: () => boolean
    /**
     * The list marks its own box (lib/list-front.ts) and says in `here` when it
     * is in front. Left out, it is the page's own list, which steps aside while
     * a marked list (the Recent panel, the Queue's Read) is under the pointer or
     * was last clicked.
     */
    scoped?: boolean
    /**
     * ⌫, Delete or ⌘⌫ on what is picked (or, with nothing picked, the row
     * under the cursor): in a list that is a move to the Bin, at once, with
     * an Undo. Lists you only pick from leave it out, and the keys do nothing.
     */
    onDelete?: (ids: string[]) => void
    /** The row under the keyboard's cursor, for ⌫ with nothing picked. */
    current?: () => string | null | undefined
    /** What ⌫ does here, said with the count when ⌘A picks: the Bin's own list deletes for good. */
    deleteSaid?: string
    /** A row's words, for ⌘C on what is picked: one line each. */
    titleOf?: (id: string) => string | undefined
  } = {}
): () => void {
  const now = useRef({ shown, chosen, setChosen, here: () => here() && (scoped || !listInFront()), onDelete, current, titleOf, deleteSaid })
  now.current = { shown, chosen, setChosen, here: () => here() && (scoped || !listInFront()), onDelete, current, titleOf, deleteSaid }
  const selectAll = (): void => {
    const { shown, chosen, setChosen, onDelete, deleteSaid } = now.current
    const ids = shown()
    // Nothing to pick, or every one picked already: said, so the key is never ignored.
    if (!ids.length || ids.every((id) => chosen.includes(id))) return chime('nope')
    chime('on')
    const all = [...new Set([...chosen, ...ids])]
    setChosen(all)
    // How many, and what the next keys do with them.
    toast(`${num(all.length)} selected${onDelete ? `: ${deleteSaid}, Esc clears` : ': Esc clears'}`, undefined, 'info')
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
    // The menu bar's Select All, if it hears ⌘A before the page: taken the same way (preload).
    const onMenu = (event: Event): void => {
      if (event.defaultPrevented || typing() || !now.current.here() || document.querySelector('[role="menu"], [role="listbox"]')) return
      event.preventDefault()
      run.current()
    }
    // ⌫, Delete or ⌘⌫, as Finder and Mail take them: what is picked goes to the Bin.
    const onDeleteKey = (event: KeyboardEvent): void => {
      const { onDelete, chosen, current, here } = now.current
      if (!onDelete || (event.key !== 'Backspace' && event.key !== 'Delete')) return
      if (event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented || typing() || !here()) return
      if (document.querySelector('[role="menu"], [role="listbox"]')) return
      // A sidebar row in focus takes its own ⌫ (off the sidebar, or unpin): the page's row is not binned behind it.
      if ((document.activeElement as HTMLElement | null)?.closest?.('[data-side-row]')) return
      const ids = chosen.length ? chosen : [current?.()].filter((id): id is string => !!id)
      if (!ids.length) return
      event.preventDefault()
      event.stopPropagation()
      onDelete(ids)
    }
    // ⌘C on what is picked: their words, one line each, when no words are selected on the page.
    const onCopy = (event: KeyboardEvent): void => {
      const { titleOf, chosen, here } = now.current
      if (!titleOf || !chosen.length || !event.metaKey || event.shiftKey || event.altKey || event.ctrlKey || event.code !== 'KeyC') return
      if (event.defaultPrevented || typing() || !here() || !(window.getSelection()?.isCollapsed ?? true)) return
      if (document.querySelector('[role="menu"], [role="listbox"]')) return
      event.preventDefault()
      const lines = chosen.map((id) => titleOf(id)).filter((one): one is string => !!one)
      void navigator.clipboard.writeText(lines.join('\n')).then(() => {
        chime('copy')
        toast(lines.length === 1 ? 'Copied its words' : `Copied ${num(lines.length)}, one to a line`)
      }, () => refuse('Could not copy it', 'error'))
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onDeleteKey, true)
    window.addEventListener('keydown', onCopy, true)
    window.addEventListener('vigil:select-all', onMenu)
    return () => {
      window.removeEventListener('keydown', onDeleteKey, true)
      window.removeEventListener('keydown', onCopy, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('vigil:select-all', onMenu)
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return selectAll
}
