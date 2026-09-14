import { useEffect, useRef } from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { headingRank } from "@/extensions/toggle-heading"

interface Heading {
  pos: number
  level: number
  text: string
}

/**
 * Every heading in the document, in order.
 *
 * A folded heading is a `details` whose summary carries the rank, so it counts
 * as a heading too - otherwise folding one drops it from the outline while its
 * own sub-headings stay, and the list reads as orphans.
 */
function collect(editor: Editor): Heading[] {
  const headings: Heading[] = []
  editor.state.doc.descendants((node, pos) => {
    const rank = headingRank(node)
    if (rank === null) return !node.isTextblock

    const folded = node.type.name === "details"
    const text = (folded ? node.child(0) : node).textContent.trim()
    if (text) headings.push({ pos, level: rank, text })
    // Keep descending into a folded section: its sub-headings still count.
    return folded
  })
  return headings
}

/**
 * The document outline, parked against the right edge.
 *
 * Collapsed it is one rule per heading, indented by level - enough to read the
 * shape of a document at a glance without taking any width from it. Hovering
 * swaps in the titles.
 */
export function TableOfContents({ editor }: { editor: Editor | null }) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance && {
        headings: collect(instance),
        // Which heading the caret sits under: the last one at or before it.
        caret: instance.state.selection.from,
      },
  })

  const headings = state?.headings ?? []
  const active = headings.findLastIndex((h) => h.pos <= (state?.caret ?? 0))

  // A long outline scrolls, so the entry the caret is under has to be brought
  // to it. Keyed on `active` alone: scrolling on hover would move the rows out
  // from under the pointer.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  if (!editor || headings.length < 2) return null

  const go = (pos: number) => {
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
  }

  return (
    <nav
      className="tiptap-toc"
      // Chromium gives a scroll container its own tab stop when none of its
      // children are focusable - which is exactly what putting tabIndex -1 on
      // every entry created. Without this the whole panel takes the focus ring.
      tabIndex={-1}
      aria-label="Document outline"
    >
      {headings.map((heading, index) => (
        <button
          key={`${heading.pos}-${heading.text}`}
          type="button"
          ref={index === active ? activeRef : undefined}
          // Pointer-only: the panel expands on hover, so a focused entry would
          // be an invisible tab stop - and there is one per heading.
          tabIndex={-1}
          className="tiptap-toc-item"
          data-level={Math.min(heading.level, 3)}
          data-active={index === active ? "true" : undefined}
          title={heading.text}
          onClick={() => go(heading.pos)}
        >
          <span className="tiptap-toc-rule" />
          <span className="tiptap-toc-text">{heading.text}</span>
        </button>
      ))}
    </nav>
  )
}
