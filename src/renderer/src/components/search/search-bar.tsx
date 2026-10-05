import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { cue } from "@/lib/cues"

/**
 * A small find bar: term, match count, prev/next, close, and replace folded
 * away under the arrow on its left.
 *
 * The searching is all `@tiptap/extension-find-and-replace` - this is only the
 * input. Regex and the match options are deliberately left out. A replace is
 * an ordinary edit, so ⌘Z takes it back.
 */
export interface SearchBarProps {
  editor: Editor | null
  open: boolean
  onOpen: () => void
  onClose: () => void
}

export function SearchBar({ editor, open, onOpen, onClose }: SearchBarProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [replacing, setReplacing] = useState(false)

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
      cue("find-close")
      if (clearTerm) {
        editor?.commands.clearSearch()
        // The bar stays mounted while shut, so its boxes would still show the
        // old words the next time it opens.
        if (inputRef.current) inputRef.current.value = ""
        if (replaceRef.current) replaceRef.current.value = ""
        editor?.commands.setReplaceTerm("")
      }
      editor?.commands.focus()
    },
    [editor, onClose]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Take over find-in-page, which is meaningless in an app window. ⌥⌘F
      // opens it with replace showing.
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyF" && !event.shiftKey) {
        // One page can hold several editors, each with a find bar. The one
        // you are typing in answers; with the caret in none, the first does.
        const mine = barRef.current?.closest(".mindflow-editor-wrapper")
        const focused = document.activeElement?.closest(".mindflow-editor-wrapper[data-search]")
        if ((focused ?? document.querySelector(".mindflow-editor-wrapper[data-search]")) !== mine) return
        event.preventDefault()
        if (event.altKey && editor?.isEditable) setReplacing(true)
        if (open) inputRef.current?.select()
        else onOpen()
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
  // Opening is the bar's sound; vim's `/` opens it too and is heard the same.
  useEffect(() => {
    if (!open) return
    cue("find")
    inputRef.current?.select()
  }, [open])

  const step = (back: boolean): void => {
    if (!editor?.storage.findAndReplace?.results.length) return cue("find-miss")
    if (back) editor.commands.goToPreviousResult()
    else editor.commands.goToNextResult()
    cue("find-step", editor.storage.findAndReplace.currentIndex ?? 0)

    // The extension scrolls the selection into view, but the very first step
    // after typing runs before its highlights are in the DOM and the scroll is
    // skipped. Centring the match ourselves is both reliable and nicer to read.
    requestAnimationFrame(() => {
      editor.view.dom
        .querySelector(".find-and-replace-result-current")
        ?.scrollIntoView({ block: "center" })
    })
  }

  // A locked or read-only note can be searched but not changed. Read at
  // render, since a lock is not a transaction; the hook only redraws on one.
  useEditorState({ editor, selector: ({ editor: instance }) => instance?.isEditable ?? false })
  const editable = !!editor?.isEditable

  const replace = (all: boolean): void => {
    if (!editor?.isEditable) return cue("find-miss")
    if (!editor.storage.findAndReplace?.results.length) return cue("find-miss")
    // The extension replaces the current match; with none chosen yet, the
    // first is the one you would expect.
    if (editor.storage.findAndReplace.currentIndex === null) editor.commands.goToNextResult()
    if (all) editor.commands.replaceAll()
    else editor.commands.replace()
    cue(all ? "replace-all" : "replace")
  }

  return (
    <div
      ref={barRef}
      className="tiptap-find-bar relative"
      // Kept in the page while closed so the row above can animate it shut as
      // well as open. `inert` takes it out of the tab order and off the
      // pointer while it is collapsed to nothing.
      inert={!open}
      aria-hidden={!open}
    >
      <div className="tiptap-find-bar-row">
        <button
          type="button"
          hidden={!editable}
          onClick={() => {
            setReplacing((was) => !was)
            requestAnimationFrame(() => replaceRef.current?.focus())
          }}
          aria-label={replacing ? "Hide replace" : "Replace"}
          aria-expanded={replacing}
          title="Replace  ⌥⌘F"
        >
          {replacing ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
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
        <button type="button" onClick={() => step(true)} aria-label="Previous match" title="Previous  ⇧↵">
          <ChevronUp className="size-3.5" />
        </button>
        <button type="button" onClick={() => step(false)} aria-label="Next match" title="Next  ↵">
          <ChevronDown className="size-3.5" />
        </button>
        <button type="button" onClick={() => leave(true)} aria-label="Close find">
          <X className="size-3.5" />
        </button>
      </div>
      {replacing && editable && (
        <div className="tiptap-find-bar-row">
          <input
            ref={replaceRef}
            type="text"
            placeholder="Replace with"
            defaultValue={editor?.storage.findAndReplace?.replaceTerm ?? ""}
            onChange={(event) => editor?.commands.setReplaceTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              // ⌥↵ replaces every match. Not ⌘↵, which the box keeps for saving.
              replace(event.altKey)
            }}
          />
          <button type="button" onClick={() => replace(false)} title="Replace this one  ↵">
            Replace
          </button>
          <button type="button" onClick={() => replace(true)} title="Replace every match  ⌥↵">
            All
          </button>
        </div>
      )}
    </div>
  )
}
