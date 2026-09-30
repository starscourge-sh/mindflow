import { useEffect } from "react"

/**
 * A Ctrl chord that opens something, and closes it again.
 *
 * Ctrl rather than a bare letter, because the editor holds the focus almost
 * always and a letter belongs to whatever is being typed.
 *
 * It stands down while any menu is open: they all move on Ctrl-K, J, N and P
 * now, and a window listener would take those keys out from under whichever
 * one has them - Ctrl-K in the editor's block menu would open this instead.
 *
 * Except when the open menu is this one. Pass `isOpen` and the chord closes it
 * again, which is what a second press of the key that opened something means.
 */
export function useShortcut(key: string, setOpen: (open: boolean) => void, isOpen = false): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== key || !event.ctrlKey) return
      if (event.metaKey || event.altKey) return
      const menu = "[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup"
      if (!isOpen && document.querySelector(menu)) return

      event.preventDefault()
      setOpen(!isOpen)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [key, setOpen, isOpen])
}
