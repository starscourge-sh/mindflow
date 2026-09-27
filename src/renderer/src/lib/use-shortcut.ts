import { useEffect } from "react"

/**
 * A Ctrl chord that opens something.
 *
 * Ctrl rather than a bare letter, because the editor holds the focus almost
 * always and a letter belongs to whatever is being typed.
 *
 * It stands down while a command list is open: cmdk claims Ctrl-K, J, N and P
 * for moving through its own list, and a window listener would take those keys
 * out from under it.
 */
export function useShortcut(key: string, open: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== key || !event.ctrlKey) return
      if (event.metaKey || event.altKey) return
      if (document.querySelector("[cmdk-root]")) return

      event.preventDefault()
      open()
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [key, open])
}
