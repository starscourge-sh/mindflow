import { memo, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"

import { OPEN, headingsOf, land, type Heading } from "@/components/toc/headings"
import { cue } from "@/lib/cues"

type Outline = { headings: { level: number; text: string }[]; active: number }

function outlineOf(editor: Editor): Outline {
  const found = headingsOf(editor)
  const caret = editor.state.selection.from
  return {
    headings: found.map(({ level, text }) => ({ level, text })),
    // Which heading the caret sits under: the last one at or before it.
    active: found.findLastIndex((h) => h.pos <= caret),
  }
}

const same = (a: Outline, b: Outline): boolean =>
  a.active === b.active && a.headings.length === b.headings.length && a.headings.every((one, i) => one.level === b.headings[i].level && one.text === b.headings[i].text)

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
  const goRef = useRef<(index: number) => void>(() => {})
  // Words and levels only, and which heading the caret is under: typing moves
  // every heading after it, and redrawing thousands of rows for that was most
  // of what a key cost in a long note. Where each one is, is read on the way
  // there. In a long note the words catch up once the typing pauses: any redraw
  // while typing there costs a pass over the whole page.
  const [state, setState] = useState<Outline | null>(null)
  useEffect(() => {
    if (!editor) return setState(null)
    let later: ReturnType<typeof setTimeout> | undefined
    const update = (): void => setState((now) => {
      const next = outlineOf(editor)
      return now && same(now, next) ? now : next
    })
    const changed = ({ transaction }: { transaction: { docChanged: boolean; selectionSet: boolean } }): void => {
      clearTimeout(later)
      if (transaction.docChanged && editor.state.doc.content.size > 20000) later = setTimeout(update, 400)
      else if (transaction.docChanged || transaction.selectionSet) update()
    }
    update()
    editor.on("transaction", changed)
    return () => {
      clearTimeout(later)
      editor.off("transaction", changed)
    }
  }, [editor])

  const headings = state?.headings ?? []
  const active = state?.active ?? -1
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

  // Room for it: wherever the note's words would run under the strip (a
  // narrow pane, a wide block, a long outline), the note's right padding grows
  // just enough to clear it, and goes back once it is not needed. Measured
  // with the strip at rest, never while it is open over the words.
  const drawn = !!editor && headings.length >= 2 && shown
  useEffect(() => {
    const nav = navRef.current
    const page = editor?.view.dom as HTMLElement | undefined
    if (!drawn || !nav || !page) return
    const fit = (): void => {
      if (nav.matches(":hover, [data-open]")) return
      page.style.paddingRight = ""
      const words = page.getBoundingClientRect().right - parseFloat(getComputedStyle(page).paddingRight)
      const over = words + 12 - nav.getBoundingClientRect().left
      if (over > 0) page.style.paddingRight = `${parseFloat(getComputedStyle(page).paddingRight) + over}px`
    }
    // Measured first by the observer itself, once the frame is laid out and before it is painted:
    // measured here, in the middle of drawing a note, it laid the whole window out an extra time.
    const watch = new ResizeObserver(fit)
    watch.observe(page.parentElement ?? page)
    return () => {
      watch.disconnect()
      page.style.paddingRight = ""
    }
  }, [drawn, editor, headings.length])

  if (!editor || headings.length < (keyed === null ? 2 : 1)) return null
  if (!shown && keyed === null) return null

  const go = (index: number): void => {
    setKeyed(null)
    const heading: Heading | undefined = headingsOf(editor)[index]
    if (heading) land(editor, heading)
  }

  goRef.current = go

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
          go(keyed)
        } else if (event.key === "Escape") {
          // Spent here, so it does not go on to hide the window.
          event.preventDefault()
          event.stopPropagation()
          leave()
        }
      }}
    >
      {headings.map((heading, index) => (
        <Entry
          key={index}
          index={index}
          level={heading.level}
          text={heading.text}
          active={index === active}
          keyed={index === keyed}
          lit={index === lit ? activeRef : undefined}
          onGo={goRef}
        />
      ))}
    </nav>
  )
}

/** One heading in the outline: redrawn only when its own words or highlight change. */
const Entry = memo(function Entry({ index, level, text, active, keyed, lit, onGo }: {
  index: number
  level: number
  text: string
  active: boolean
  keyed: boolean
  lit: React.RefObject<HTMLButtonElement | null> | undefined
  onGo: React.RefObject<(index: number) => void>
}): React.JSX.Element {
  return (
    <button
      id={`toc-${index}`}
      type="button"
      ref={lit}
      // Pointer-only: the panel expands on hover, so a focused entry would
      // be an invisible tab stop - and there is one per heading. The keys
      // move a highlight instead, with the panel itself holding the focus.
      tabIndex={-1}
      className="tiptap-toc-item"
      data-level={Math.min(level, 3)}
      data-active={active ? "true" : undefined}
      data-keyed={keyed ? "true" : undefined}
      title={text}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onGo.current(index)}
    >
      <span className="tiptap-toc-rule" />
      <span className="tiptap-toc-text">{text}</span>
    </button>
  )
})
