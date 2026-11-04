import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useEditorDom } from '@/lib/editor-dom'
import type { Editor } from "@tiptap/react"
import type { Node as PMNode } from "@tiptap/pm/model"
import { num } from '../../../../main/dates'

/**
 * Words and characters for the whole document, counted on edits only, so a
 * plain caret move never counts the whole document. Shared with the focus
 * session's footer, which counts the words written since it began.
 */
export function useCounts(editor: Editor | null): { words: number; characters: number } | null {
  // Counted once the typing pauses in a long note: each count reads the whole
  // document, which in a 1 MB note was most of every keystroke. Listened for
  // rather than drawn from: a redraw on every key in a long note made React
  // measure the caret through the whole page.
  const [counts, setCounts] = useState<{ words: number; characters: number } | null>(null)
  useEffect(() => {
    if (!editor) return
    let later: ReturnType<typeof setTimeout> | undefined
    const count = (): void => {
      // A link to a note counts as the words it shows; the counter's own read
      // took it for a gap. A `/` on its own is the block menu being opened.
      const { doc } = editor.state
      const shown = (node: PMNode): string => (node.type.name === "noteLink" ? String(node.attrs.text || node.attrs.label || " ") : " ")
      const words = doc.textBetween(0, doc.content.size, " ", (node) => ` ${shown(node)} `).split(/\s+/).filter((word) => word && word !== "/").length
      const characters = doc.textBetween(0, doc.content.size, undefined, shown).length
      setCounts((now) => (now?.words === words && now.characters === characters ? now : { words, characters }))
    }
    const changed = (): void => {
      clearTimeout(later)
      if (editor.state.doc.content.size < 20000) count()
      else later = setTimeout(count, 500)
    }
    const transaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) changed()
    }
    changed()
    editor.on("transaction", transaction)
    return () => {
      clearTimeout(later)
      editor.off("transaction", transaction)
    }
  }, [editor])
  return counts
}

/** Words and characters in the selection, null with none: counted as the selection changes, from the selection alone. */
function useSelectionCounts(editor: Editor | null): { words: number; characters: number } | null {
  const [counts, setCounts] = useState<{ words: number; characters: number } | null>(null)
  useEffect(() => {
    if (!editor) return
    const count = (): void => {
      const { from, to, empty } = editor.state.selection
      // Only while the note has the keys: a selection left behind as you go elsewhere says nothing.
      if (empty || !editor.isFocused) return setCounts(null)
      const { doc } = editor.state
      const shown = (node: PMNode): string => (node.type.name === "noteLink" ? String(node.attrs.text || node.attrs.label || " ") : " ")
      const words = doc.textBetween(from, to, " ", (node) => ` ${shown(node)} `).split(/\s+/).filter((word) => word && word !== "/").length
      const characters = doc.textBetween(from, to, undefined, shown).length
      setCounts((now) => (!words ? null : now?.words === words && now.characters === characters ? now : { words, characters }))
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
 * Words and characters for the whole document.
 *
 * The counts live in extension storage, which React has no reason to re-read on
 * its own.
 */
export function WordCount({ editor }: { editor: Editor | null }) {
  const counts = useCounts(editor)
  // Words picked: their own count, in the count's place, shown while they are picked (the tracker: "shows how many
  // words/characters under a selection"). Over words, on its pill, so it reads.
  const picked = useSelectionCounts(editor)

  // Shown only where nothing is under it: past the last line, which is the
  // end of a long note scrolled down, or anywhere in a short one. Over words
  // or a picture it steps aside.
  const pill = useRef<HTMLSpanElement>(null)
  const [clear, setClear] = useState(false)
  const dom = useEditorDom(editor)
  useEffect(() => {
    if (!dom || !counts) return
    let frame = 0
    const check = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const top = pill.current?.getBoundingClientRect().top
        let end = dom.getBoundingClientRect().bottom - parseFloat(getComputedStyle(dom).paddingBottom || "0")
        // Whatever the page puts after the words (its mentions) counts as words too.
        for (let next = dom.nextElementSibling; next; next = next.nextElementSibling) if (next.childElementCount) end = Math.max(end, next.getBoundingClientRect().bottom)
        // And nothing else drawn there either (Related cards under a note):
        // whatever sits under its two ends and middle must be bare page.
        const at = pill.current?.getBoundingClientRect()
        const bare = !!at && [at.left + 2, at.left + at.width / 2, at.right - 2].every((x) => {
          const under = document.elementsFromPoint(x, at.top + at.height / 2).find((el) => el !== pill.current)
          return !under?.closest('p, h1, h2, h3, h4, li, img, figure, button, a, input, textarea, [role="button"], [data-row]')
        })
        setClear(top !== undefined && end <= top - 4 && bare)
      })
    }
    check()
    // The mentions arrive after the words, and fold open and shut.
    const grows = new ResizeObserver(check)
    for (let next = dom.nextElementSibling; next; next = next.nextElementSibling) grows.observe(next)
    // Any scroller on the way up may be the one that moves the words under it.
    document.addEventListener("scroll", check, { capture: true, passive: true })
    window.addEventListener("resize", check)
    return () => {
      cancelAnimationFrame(frame)
      grows.disconnect()
      document.removeEventListener("scroll", check, { capture: true })
      window.removeEventListener("resize", check)
    }
  }, [dom, counts])

  if (!editor || !counts) return null
  if (picked && dom) return <PickedCount dom={dom} words={picked.words} characters={picked.characters} />
  const { words, characters } = counts
  // Nothing to count says nothing: an empty box stays empty. In the box, a
  // few lines say nothing either: the count turns up once it is long.
  // Anywhere else too: a short note needs no count under it.
  if (!words || words < BOX_FROM) return null

  return (
    <span
      ref={pill}
      data-clear={clear || undefined}
      // Centred under the page on a soft pill, the way Raycast Notes shows it.
      // Tinted from the ink, so it shows on a page the colour of the background too (Paper).
      // In the box, plain words with no pill: nothing there that looks like a button (Brutal outlines pills).
      className={`tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs whitespace-nowrap tabular-nums opacity-0 transition-opacity duration-200 data-clear:opacity-100 ${BOX ? 'text-muted-foreground' : 'rounded-full bg-[color-mix(in_oklab,var(--foreground)_7%,var(--background))] text-foreground/70'}`}>
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
  useEffect(() => {
    const place = (): void => {
      let scroller: HTMLElement | null = dom.parentElement
      while (scroller && scroller !== document.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
      const box = (scroller && scroller !== document.body ? scroller : dom).getBoundingClientRect()
      const page = dom.getBoundingClientRect()
      const bottom = Math.min(box.bottom, window.innerHeight)
      setAt({ x: page.left + page.width / 2, y: bottom - 12 })
    }
    place()
    document.addEventListener("scroll", place, { capture: true, passive: true })
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("scroll", place, { capture: true })
      window.removeEventListener("resize", place)
    }
  }, [dom])
  if (!at) return null
  return createPortal(
    <span
      data-picked-count
      style={{ left: at.x, top: at.y }}
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-full border border-border bg-popover px-2.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground tabular-nums shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"} selected
    </span>,
    document.body
  )
}
