import { createPortal } from "react-dom"
import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"

import { Kbd } from "@/components/ui/kbd"
import { spellFixes } from "@/lib/grammar"
import { misspeltAt, onSpellingForgotten, spelling, wordAt, type Misspelling } from "./spelling"
import { useEditorDom } from "@/lib/editor-dom"
import { inTrigger } from "@/lib/typed-suggestion"

/** A pause this long and you are no longer typing: the suggestion may come. */
const TYPING = 1200
/** The pill's height (h-6), to know whether it fits under the line. */
const PILL_HEIGHT = 24

/** How many letters apart two words are (added, dropped or changed), stopping early past 2. */
const apart = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 3
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

/** Whether Tab already means something where the caret is: a list's indent, a table's next cell. */
const tabTaken = (editor: Editor): boolean => {
  const $at = editor.state.selection.$head
  for (let depth = $at.depth; depth > 0; depth--) {
    const name = $at.node(depth).type.name
    if (name === "listItem" || name === "taskItem" || name === "tableCell" || name === "tableHeader") return true
  }
  return false
}

/** A word with a capital that does not start a sentence: most likely a name, and a name is left alone. */
const named = (editor: Editor, { word, from }: { word: string; from: number }): boolean => {
  if (word === word.toLowerCase()) return false
  const $from = editor.state.doc.resolve(from)
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, " ").trimEnd()
  return before !== "" && !/[.!?:;"“]$/.test(before)
}

type Hint = Misspelling & { x: number; y: number; tab: boolean }

/**
 * With the caret on a word the spellchecker flags, its first suggestion comes
 * on a pause in a small pill right under the word (its left edge at the
 * word's, just below its line, as the Mac's own autocorrect bubble sits), and
 * Tab takes it. Never while typing; nothing where spellcheck is off or the
 * note is locked (misspeltAt and wordAt say so). In a list or a table Tab
 * keeps its own job (indenting, the next cell): there the pill has no Tab
 * key, and a click on it takes the word instead. With Vim on, Tab takes it in
 * normal mode too, since Tab does nothing there outside a list. Drawn in the
 * editor's own box, placed again as the words scroll.
 */
export function SpellPill({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  const shown = useRef(hint)
  shown.current = hint
  const takeRef = useRef<(one: Hint) => void>(() => {})
  // The editor's words once on the page: tiptap's view.dom throws before (lib/editor-dom.ts).
  const page = useEditorDom(editor ?? null)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = page
    if (!dom) return
    const box = dom.closest<HTMLElement>(".haligtree-editor-wrapper")
    if (!box) return
    let frame = 0
    let typing = 0
    // The word the dictionary was last asked about: its answer counts while the caret is still on it, however
    // often the pill is placed again meanwhile (a squiggle drawn, a selection update).
    let asked = ''
    let gone = false
    // The caret's line was off the screen when last placed: a scroll may bring it back, and the pill with it.
    let away = false
    const place = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        away = false
        if (editor.isDestroyed) return
        const { selection } = editor.state
        // A name being looked up after `[[`, `@`, `#` or `/` is not a word to spell: the list there finishes it.
        if (typing || !editor.isFocused || !selection.empty || !document.hasFocus() || inTrigger(editor.state)) return setHint(null)
        // An empty line has no word to spell: nothing is measured for it (a long paste's caret waits in one while
        // the rest comes, and the page was laid out to place a pill there once a stretch).
        if (!selection.$head.parent.content.size) return setHint(null)
        const at = editor.view.coordsAtPos(selection.head)
        // Scrolled out of what shows of the note (its scroller, or the window): nothing to point at until it comes back.
        const view = dom.parentElement?.getBoundingClientRect()
        if (at.bottom <= Math.max(view?.height ? view.top : 0, 0) || at.top >= Math.min(view?.height ? view.bottom : innerHeight, innerHeight)) return void ((away = true), setHint(null))
        // Placed on the window itself, over everything: inside the editor's box it was cut off on the last line.
        const from = { left: 0, top: 0 }
        // Just under the caret's line, never over the word.
        // On a line with no room under it (quick capture as one line, the window's last line), beside the
        // word instead, on its line: under it, it was cut off at the window's foot.
        const room = at.bottom + 2 + PILL_HEIGHT <= innerHeight
        const y = room ? at.bottom - from.top + 2 : Math.round((at.top + at.bottom - PILL_HEIGHT) / 2) - from.top
        const left = (word: { from: number; to: number }): number => (room ? editor.view.coordsAtPos(word.from).left : editor.view.coordsAtPos(word.to).right + 8) - from.left
        const tab = !tabTaken(editor)
        const flagged = misspeltAt(editor, at.left - 1, (at.top + at.bottom) / 2)
        // A word not asked about yet: asked now, without holding the window, and the pill placed again once the
        // answer is in (it shows only if the caret is still on that word then).
        if (flagged === undefined) {
          const here = wordAt(editor, at.left - 1, (at.top + at.bottom) / 2)
          if (here) void spelling(here).then(() => !gone && place())
          return setHint(null)
        }
        // Spelt right as the Mac reads it where it stands (a Spanish word in a Spanish sentence): nothing to offer.
        if (!flagged) return setHint(null)
        // Underlined but with nothing from the Mac's checker (its list is short): Harper's dictionary, asked once
        // per word, and shown only if the caret is still on that word. Names (a capital) are left alone.
        if (!flagged.suggestions.length) {
          const here = wordAt(editor, at.left - 1, (at.top + at.bottom) / 2)
          if (!here || here.word.length < 3 || here.word !== here.word.toLowerCase()) return setHint(null)
          const ask = `${here.from}:${here.word}`
          asked = ask
          void spellFixes(here.word).then((fixes) => {
            const now = editor.state.selection
            if (gone || ask !== asked || typing || inTrigger(editor.state) || !fixes.length || editor.isDestroyed || !now.empty || now.head < here.from || now.head > here.to || editor.state.doc.textBetween(here.from, here.to) !== here.word) return
            // The whole word there now, not only its start: an answer for "feelin" never lands on "feeling".
            const coords = editor.view.coordsAtPos(now.head)
            if (wordAt(editor, coords.left - 1, (coords.top + coords.bottom) / 2)?.word !== here.word) return
            setHint({ ...here, suggestions: fixes, x: left(here), y, tab })
          })
          return setHint(null)
        }
        // Tab offers only a likely fix: for a word in lower case, a capitalised one only when it is that word with a
        // capital ("monday" to "Monday") or a letter off, never a different name ("Sligo" for "slsig").
        asked = ''
        const best = flagged.suggestions[0]
        if (named(editor, flagged)) return setHint(null)
        if (flagged.word === flagged.word.toLowerCase() && best !== best.toLowerCase() && apart(best.toLowerCase(), flagged.word) > 1) return setHint(null)
        setHint({ ...flagged, x: left(flagged), y, tab })
      })
    }
    const take = (one: Hint): void => {
      editor.chain().focus().command(({ tr }) => (tr.insertText(one.suggestions[0], one.from, one.to), true)).run()
    }
    const onKey = (event: KeyboardEvent): void => {
      const one = shown.current
      if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && one?.tab) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return take(one)
      }
      // Typing: the pill goes at once, and comes back only on a pause.
      if (event.metaKey || event.ctrlKey || event.isComposing) return
      if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter" && event.key !== "Delete") return
      setHint(null)
      clearTimeout(typing)
      typing = window.setTimeout(() => ((typing = 0), place()), TYPING)
    }
    takeRef.current = take
    // The squiggles come back on a pause (the editor puts its spellcheck back then): so does the pill.
    const squiggles = new MutationObserver(place)
    squiggles.observe(dom, { attributes: true, attributeFilter: ["spellcheck"] })
    editor.on("selectionUpdate", place)
    editor.on("update", place)
    editor.on("focus", place)
    editor.on("blur", place)
    dom.addEventListener("keydown", onKey, true)
    window.addEventListener("resize", place)
    // The words scroll under it: it goes with them. Only a scroll that moves these words, and only when it can change
    // what shows (a pill to carry along, or the caret's line off the screen): the word under the caret is the same
    // word however far the note scrolls, so it is not asked about again on every frame of a scroll.
    const scrolled = (event: Event): void => void (event.target instanceof Node && event.target.contains(dom) && (shown.current || away) && place())
    window.addEventListener("scroll", scrolled, true)
    window.addEventListener("blur", place)
    window.addEventListener("focus", place)
    // A word learnt or unlearnt, here or in another window: what was said of the word under the caret is asked afresh.
    const relearnt = onSpellingForgotten(place)
    place()
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(typing)
      squiggles.disconnect()
      relearnt()
      gone = true
      setHint(null)
      editor.off("selectionUpdate", place)
      editor.off("update", place)
      editor.off("focus", place)
      editor.off("blur", place)
      dom.removeEventListener("keydown", onKey, true)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", scrolled, true)
      window.removeEventListener("blur", place)
      window.removeEventListener("focus", place)
    }
  }, [page, editor])
  if (!hint) return null
  return createPortal(
    <span data-spell-hint data-spell-word={hint.word} data-spell-tab={hint.tab || undefined} aria-hidden
      // A press on it takes the word; held off the editor, so the caret stays where it was.
      onPointerDown={(event) => (event.preventDefault(), takeRef.current(hint))}
      className="mf-spell-hint fixed top-0 left-0 z-[60] inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-foreground/10 bg-background ps-2.5 pe-1 text-control whitespace-nowrap text-(--mf-muted-strong) shadow-xs select-none"
      style={{ translate: `${hint.x}px ${hint.y}px`, paddingInlineEnd: hint.tab ? undefined : "0.625rem" }}>
      {hint.suggestions[0]}{hint.tab && <Kbd className="rounded border border-border/80 text-key">Tab</Kbd>}
    </span>,
    document.body
  )
}
