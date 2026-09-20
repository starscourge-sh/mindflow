import { useCallback, useEffect, useRef } from "react"
import { useEditorState, type Editor } from "@tiptap/react"

/**
 * A one-line find bar: term, match count, prev/next, close.
 *
 * The searching is all `@tiptap/extension-find-and-replace` - this is only the
 * input. Replace, regex and the match options are deliberately left out; the
 * the full replace UI if it is ever wanted back.
 */
export interface SearchBarProps {
  editor: Editor | null
  open: boolean
  onOpen: () => void
  onClose: () => void
}

export function SearchBar({ editor, open, onOpen, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const counts = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      total: instance?.storage.findAndReplace?.results.length ?? 0,
      index: instance?.storage.findAndReplace?.currentIndex ?? null,
    }),
  })

  /**
   * Stepping moves the editor selection onto the match, but a caret is only
   * drawn in the focused element - so leaving has to hand focus back, or you
   * end up where you started rather than on the match you stopped at.
   *
   * Escape only dismisses the box: the term stays live so `n` and `N` keep
   * working, as they do in vim. The close button is what clears it.
   */
  const leave = useCallback(
    (clearTerm: boolean) => {
      onClose()
      if (clearTerm) editor?.commands.clearSearch()
      editor?.commands.focus()
    },
    [editor, onClose]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Take over find-in-page, which is meaningless in an app window.
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault()
        onOpen()
        return
      }
      if (event.key === "Escape" && open) {
        event.preventDefault()
        leave(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpen, open, leave])

  // Runs after the mount below, which is why it can select rather than focus.
  useEffect(() => {
    if (open) inputRef.current?.select()
  }, [open])

  if (!open) return null

  const step = (back: boolean) => {
    if (back) editor?.commands.goToPreviousResult()
    else editor?.commands.goToNextResult()

    // The extension scrolls the selection into view, but the very first step
    // after typing runs before its highlights are in the DOM and the scroll is
    // skipped. Centring the match ourselves is both reliable and nicer to read.
    requestAnimationFrame(() => {
      editor?.view.dom
        .querySelector(".find-and-replace-result-current")
        ?.scrollIntoView({ block: "center" })
    })
  }

  return (
    <div className="tiptap-find-bar relative">
      <input
        ref={inputRef}
        type="text"
        placeholder="Find"
        // The bar unmounts when closed, so this re-seeds from the live search
        // each time it opens - otherwise it reopens blank over a running search.
        defaultValue={editor?.storage.findAndReplace?.searchTerm ?? ""}
        onChange={(event) => editor?.commands.setSearchTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          step(event.shiftKey)
        }}
      />
      <span className="tiptap-find-bar-count">
        {counts?.total ? `${(counts.index ?? 0) + 1}/${counts.total}` : "0/0"}
      </span>
      <button type="button" onClick={() => step(true)} aria-label="Previous match">
        ↑
      </button>
      <button type="button" onClick={() => step(false)} aria-label="Next match">
        ↓
      </button>
      <button type="button" onClick={() => leave(true)} aria-label="Close find">
        ✕
      </button>
    </div>
  )
}
