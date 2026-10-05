import { useEffect, useRef, useState } from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { OPEN, headingsOf, land, type Heading } from "@/components/toc/headings"
import { cue } from "@/lib/cues"

/**
 * The document outline, parked against the right edge.
 *
 * Collapsed it is one rule per heading, indented by level - enough to read the
 * shape of a document at a glance without taking any width from it. Hovering
 * swaps in the titles. ⇧⌘O opens it for the keys: arrows (or j and k) to move,
 * Return to go, Escape to come back. With `shown` off it is out of sight until
 * that key asks for it.
 */
export function TableOfContents({ editor, shown = true }: { editor: Editor | null; shown?: boolean }): React.JSX.Element | null {
  const activeRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  // The row the keys are on while the outline has them; null when it does not.
  const [keyed, setKeyed] = useState<number | null>(null)
  const wantsFocus = useRef(false)
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance && {
        headings: headingsOf(instance),
        // Which heading the caret sits under: the last one at or before it.
        caret: instance.state.selection.from,
      },
  })

  const headings = state?.headings ?? []
  const active = headings.findLastIndex((h) => h.pos <= (state?.caret ?? 0))
  const lit = keyed ?? active

  // ⇧⌘O in this editor: the outline takes the keys, on the heading you are under.
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const open = (): void => {
      if (!headingsOf(editor).length) return
      cue("outline")
      setKeyed(Math.max(0, headingsOf(editor).findLastIndex((h) => h.pos <= editor.state.selection.from)))
      wantsFocus.current = true
      // Already drawn (shown, or opened twice): it can take the keys now.
      navRef.current?.focus()
    }
    dom.addEventListener(OPEN, open)
    return () => dom.removeEventListener(OPEN, open)
  }, [editor])

  // Focus once the outline is actually drawn. With it hidden there is nothing
  // to focus until this render, and a next-frame focus could still miss it.
  useEffect(() => {
    if (keyed === null || !wantsFocus.current || !navRef.current) return
    wantsFocus.current = false
    navRef.current.focus()
  }, [keyed])

  // A long outline scrolls, so the entry the caret is under has to be brought
  // to it. Keyed on `lit` alone: scrolling on hover would move the rows out
  // from under the pointer.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [lit])

  if (!editor || headings.length < (keyed === null ? 2 : 1)) return null
  if (!shown && keyed === null) return null

  const go = (heading: Heading): void => {
    setKeyed(null)
    land(editor, heading)
  }

  const leave = (): void => {
    setKeyed(null)
    cue("outline-close")
    editor.commands.focus()
  }

  return (
    <nav
      ref={navRef}
      className="tiptap-toc"
      data-open={keyed === null ? undefined : "true"}
      // Chromium gives a scroll container its own tab stop when none of its
      // children are focusable - which is exactly what putting tabIndex -1 on
      // every entry created. Without this the whole panel takes the focus ring.
      tabIndex={-1}
      aria-label="Document outline"
      aria-activedescendant={keyed === null ? undefined : `toc-${keyed}`}
      onBlur={() => keyed !== null && setKeyed(null)}
      onKeyDown={(event) => {
        if (keyed === null) return
        const down = event.key === "ArrowDown" || event.key === "j"
        const up = event.key === "ArrowUp" || event.key === "k"
        if (down || up) {
          event.preventDefault()
          const next = Math.min(headings.length - 1, Math.max(0, keyed + (down ? 1 : -1)))
          if (next !== keyed) cue("outline-step", next)
          setKeyed(next)
        } else if (event.key === "Enter") {
          event.preventDefault()
          go(headings[keyed])
        } else if (event.key === "Escape") {
          // Spent here, so it does not go on to hide the window.
          event.preventDefault()
          event.stopPropagation()
          leave()
        }
      }}
    >
      {headings.map((heading, index) => (
        <button
          key={`${heading.pos}-${heading.text}`}
          id={`toc-${index}`}
          type="button"
          ref={index === lit ? activeRef : undefined}
          // Pointer-only: the panel expands on hover, so a focused entry would
          // be an invisible tab stop - and there is one per heading. The keys
          // move a highlight instead, with the panel itself holding the focus.
          tabIndex={-1}
          className="tiptap-toc-item"
          data-level={Math.min(heading.level, 3)}
          data-active={index === active ? "true" : undefined}
          data-keyed={index === keyed ? "true" : undefined}
          title={heading.text}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => go(heading)}
        >
          <span className="tiptap-toc-rule" />
          <span className="tiptap-toc-text">{heading.text}</span>
        </button>
      ))}
    </nav>
  )
}
