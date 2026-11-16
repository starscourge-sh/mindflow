import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useEditorDom } from '@/lib/editor-dom'
import type { Editor } from "@tiptap/react"
import type { Transaction } from "@tiptap/pm/state"
import { num } from '../../../../main/dates'
import { useFormatBarShown } from '@/components/selection/selection-menu'
import { shown, sizeOf, wordsIn, type Size } from '@/lib/note-size'

/**
 * The whole note's size (lib/note-size.ts: lines, words, characters and the rest), counted again on each change from
 * the blocks it touched alone, so a key typed in the longest note costs its one line and the count is never late.
 * A plain caret move counts nothing. Shared with the note's bar, the focus session's footer and a word aim.
 */
export function useCounts(editor: Editor | null): Size | null {
  // Listened for rather than drawn from: a redraw on every key in a long note made React measure the caret through
  // the whole page. Only the few small things that show a count draw again, and only when it changed.
  // Counted at once for an editor already there, so its size is drawn with it; kept with the editor it is of, so
  // another editor's count is never shown for this one.
  const [counts, setCounts] = useState<{ of: Editor | null; size: Size | null }>(() => ({ of: editor, size: editor && !editor.isDestroyed ? sizeOf(editor.state.doc) : null }))
  useEffect(() => {
    if (!editor) return
    const count = (before?: Transaction["before"]): void => {
      if (editor.isDestroyed) return
      const size = sizeOf(editor.state.doc, before)
      setCounts((now) => (now.of === editor && now.size === size ? now : { of: editor, size }))
    }
    const transaction = ({ transaction }: { transaction: Transaction }): void => {
      if (transaction.docChanged) count(transaction.before)
    }
    count()
    editor.on("transaction", transaction)
    return () => void editor.off("transaction", transaction)
  }, [editor])
  return counts.of === editor ? counts.size : null
}

/**
 * Words and characters in the selection, null with none: counted as the selection changes, from the selection alone.
 * "whole" for the whole note picked (⌘A): its count is the note's own, not read again from every word of a long note.
 */
function useSelectionCounts(editor: Editor | null): { words: number; characters: number } | "whole" | null {
  const [counts, setCounts] = useState<{ words: number; characters: number } | "whole" | null>(null)
  useEffect(() => {
    if (!editor) return
    const count = (): void => {
      const { from, to, empty } = editor.state.selection
      // Only while the note has the keys: a selection left behind as you go elsewhere says nothing.
      if (empty || !editor.isFocused) return setCounts(null)
      const { doc } = editor.state
      if (from <= 1 && to >= doc.content.size - 1) return setCounts("whole")
      // Counted as the note's own count counts them (lib/note-size.ts).
      const words = wordsIn(doc.textBetween(from, to, " ", (node) => ` ${shown(node)} `))
      const characters = doc.textBetween(from, to, undefined, shown).length
      setCounts((now) => (!words ? null : now !== "whole" && now?.words === words && now.characters === characters ? now : { words, characters }))
    }
    const transaction = ({ transaction }: { transaction: { docChanged: boolean; selectionSet: boolean } }): void => {
      if (transaction.selectionSet || transaction.docChanged) count()
    }
    const gone = (): void => setCounts(null)
    editor.on("transaction", transaction)
    editor.on("focus", count)
    editor.on("blur", gone)
    return () => void (editor.off("transaction", transaction), editor.off("focus", count), editor.off("blur", gone))
  }, [editor])
  return counts
}

/** The box: its window is the one opened with nothing named in its address. */
const BOX = !/[?&](?:view|note|drawing)=/.test(window.location.search)
/** A short note needs no count: it shows from this many words, in the box and on a page. */
const BOX_FROM = 40

/**
 * Words and characters for the whole document, under its last line: where nothing else says how long it is (quick
 * capture, a task's notes). A note whose bar says its size (note-size.tsx) shows only the count of words picked.
 */
export function WordCount({ editor, whole = true }: { editor: Editor | null; /** The whole note's count; false where the note's bar says its size. */ whole?: boolean }) {
  const counts = useCounts(editor)
  // Words picked: their own count, in the count's place, shown while they are picked (the tracker: "shows how many
  // words/characters under a selection"). Over words, on its pill, so it reads.
  const chosen = useSelectionCounts(editor)
  const picked = chosen === "whole" ? counts : chosen
  const barShown = useFormatBarShown()
  // Nothing to count says nothing: an empty box stays empty. A short note needs no count under it either, in the box
  // or on a page: the count turns up once it is long.
  const shows = whole && !!counts && counts.words >= BOX_FROM

  // Shown only where nothing is under it: past the last line, which is the
  // end of a long note scrolled down, or anywhere in a short one. Over words
  // or a picture it steps aside.
  const pill = useRef<HTMLSpanElement>(null)
  const [clear, setClear] = useState(false)
  const dom = useEditorDom(editor)
  const again = useRef<() => void>(() => {})
  useEffect(() => {
    if (!dom || !shows) return
    let frame = 0
    const look = (): void => {
      frame = 0
      const at = pill.current?.getBoundingClientRect()
      if (!at) return setClear(false)
      // The cheap test first, from where the words end: still below the pill (all through a long note), words are
      // under it and nothing more is asked. Whatever the page puts after the words (its mentions) counts as words too.
      let end = dom.getBoundingClientRect().bottom - parseFloat(getComputedStyle(dom).paddingBottom || "0")
      for (let next = dom.nextElementSibling; next; next = next.nextElementSibling) if (next.childElementCount) end = Math.max(end, next.getBoundingClientRect().bottom)
      if (end > at.top - 4) return setClear(false)
      // Past the last line, nothing else drawn there either (Related cards under a note): whatever sits under its
      // two ends and middle must be bare page. Only here is the page asked what is under a point.
      setClear([at.left + 2, at.left + at.width / 2, at.right - 2].every((x) => {
        const under = document.elementsFromPoint(x, at.top + at.height / 2).find((el) => el !== pill.current)
        return !under?.closest('p, h1, h2, h3, h4, li, img, figure, button, a, input, textarea, [role="button"], [data-row]')
      }))
    }
    // Once a frame at most, however many things asked in it.
    const check = (): void => void (frame ||= requestAnimationFrame(look))
    // Only a scroller that moves what is under the pill: one holding the note (any of them on the way up), or one
    // inside the note's own scroller (a row of cards after the words). The sidebar or a list beside it scrolling
    // asks nothing.
    const scrolled = (event: Event): void => {
      const target = event.target
      if (target instanceof Node && (target.contains(dom) || !!dom.parentElement?.contains(target))) check()
    }
    check()
    again.current = check
    // The mentions arrive after the words, and fold open and shut.
    const grows = new ResizeObserver(check)
    for (let next = dom.nextElementSibling; next; next = next.nextElementSibling) grows.observe(next)
    document.addEventListener("scroll", scrolled, { capture: true, passive: true })
    window.addEventListener("resize", check)
    return () => {
      again.current = () => {}
      cancelAnimationFrame(frame)
      grows.disconnect()
      document.removeEventListener("scroll", scrolled, { capture: true })
      window.removeEventListener("resize", check)
    }
  }, [dom, shows])
  // Words come or go: whether any now reach the pill is looked at again, in the next frame, once.
  useEffect(() => again.current(), [counts])

  if (!editor || !counts) return null
  // While the format bar is up it is the one floating thing: the count waits.
  if (picked && dom) return barShown ? null : <PickedCount dom={dom} words={picked.words} characters={picked.characters} />
  if (!shows) return null
  const { words, characters } = counts

  return (
    <span
      ref={pill}
      data-clear={clear || undefined}
      // Centred under the page on a soft pill, the way Raycast Notes shows it.
      // Tinted from the ink, so it shows on a page the colour of the background too (Paper).
      // In the box, plain words with no pill: nothing there that looks like a button (Brutal outlines pills).
      className={`tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs whitespace-nowrap tabular-nums opacity-0 transition-opacity duration-200 data-clear:opacity-100 ${BOX ? 'text-muted-foreground' : 'rounded-full bg-[color-mix(in_oklab,var(--foreground)_7%,var(--background))] text-muted-foreground'}`}>
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"}
    </span>
  )
}

/**
 * The selection's count, at the foot of what shows of the note (its scroller), wherever the note is scrolled to:
 * the whole note's count sits past its last line, out of sight in a long note.
 */
function PickedCount({ dom, words, characters }: { dom: HTMLElement; words: number; characters: number }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  // Never on the words being picked (quick capture's one-line pill has its foot on its one line): there it stays away.
  const chip = useRef<HTMLSpanElement>(null)
  const [onWords, setOnWords] = useState(false)
  useLayoutEffect(() => {
    const box = chip.current?.getBoundingClientRect()
    const selection = window.getSelection()
    if (!box || !selection?.rangeCount) return setOnWords(false)
    // Only the picked lines level with the chip are measured: the pick cut to the places just above and below it.
    // Measured whole, a long note's ⌘A laid out and measured every one of its picked lines.
    const band = selection.getRangeAt(0).cloneRange()
    const edge = dom.getBoundingClientRect().left + 1
    const above = document.caretPositionFromPoint(edge, box.top - 1)
    const below = document.caretPositionFromPoint(edge, box.bottom + 1)
    const start = above ? band.comparePoint(above.offsetNode, above.offset) : -1
    const end = below ? band.comparePoint(below.offsetNode, below.offset) : 1
    // The pick ends above the chip, or starts below it: no picked word can be under it.
    if (start > 0 || end < 0) return setOnWords(false)
    if (above && start === 0) band.setStart(above.offsetNode, above.offset)
    if (below && end === 0) band.setEnd(below.offsetNode, below.offset)
    setOnWords([...band.getClientRects()].some((one) => one.width > 0 && one.left < box.right && one.right > box.left && one.top < box.bottom && one.bottom > box.top))
  })
  useEffect(() => {
    const place = (): void => {
      let scroller: HTMLElement | null = dom.parentElement
      while (scroller && scroller !== document.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
      const box = (scroller && scroller !== document.body ? scroller : dom).getBoundingClientRect()
      const page = dom.getBoundingClientRect()
      const bottom = Math.min(box.bottom, window.innerHeight)
      const x = page.left + page.width / 2
      const y = bottom - 12
      // Its own scroller scrolling leaves the foot where it was: then nothing is drawn again, frame after frame.
      setAt((now) => (now?.x === x && now.y === y ? now : { x, y }))
    }
    // Only a scroll that can move the foot: one of the scrollers holding the note. A list beside it asks nothing.
    const scrolled = (event: Event): void => void (event.target instanceof Node && event.target.contains(dom) && place())
    place()
    document.addEventListener("scroll", scrolled, { capture: true, passive: true })
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("scroll", scrolled, { capture: true })
      window.removeEventListener("resize", place)
    }
  }, [dom])
  if (!at) return null
  return createPortal(
    <span
      ref={chip}
      data-picked-count
      data-on-words={onWords || undefined}
      style={{ left: at.x, top: at.y, visibility: onWords ? 'hidden' : undefined }}
      className="mf-frost pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-full border border-border bg-popover px-2.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground tabular-nums shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"} selected
    </span>,
    document.body
  )
}
