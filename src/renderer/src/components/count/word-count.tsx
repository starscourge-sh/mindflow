import { useEffect, useRef, useState } from "react"
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

/** The box: its window is the one opened with nothing named in its address. */
const BOX = !/[?&](?:view|note|drawing)=/.test(window.location.search)
/** In the box a short capture needs no count: it shows from this many words. */
const BOX_FROM = 40

/**
 * Words and characters for the whole document.
 *
 * The counts live in extension storage, which React has no reason to re-read on
 * its own.
 */
export function WordCount({ editor }: { editor: Editor | null }) {
  const counts = useCounts(editor)

  // Shown only where nothing is under it: past the last line, which is the
  // end of a long note scrolled down, or anywhere in a short one. Over words
  // or a picture it steps aside.
  const pill = useRef<HTMLSpanElement>(null)
  const [clear, setClear] = useState(false)
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom || !counts) return
    let frame = 0
    const check = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const top = pill.current?.getBoundingClientRect().top
        let end = dom.getBoundingClientRect().bottom - parseFloat(getComputedStyle(dom).paddingBottom || "0")
        // Whatever the page puts after the words (its mentions) counts as words too.
        for (let next = dom.nextElementSibling; next; next = next.nextElementSibling) if (next.childElementCount) end = Math.max(end, next.getBoundingClientRect().bottom)
        setClear(top !== undefined && end <= top - 4)
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
  }, [editor, counts])

  if (!editor || !counts) return null
  const { words, characters } = counts
  // Nothing to count says nothing: an empty box stays empty. In the box, a
  // few lines say nothing either: the count turns up once it is long.
  if (!words || (BOX && words < BOX_FROM)) return null

  return (
    <span
      ref={pill}
      data-clear={clear || undefined}
      // Centred under the page on a soft pill, the way Raycast Notes shows it.
      // Tinted from the ink, so it shows on a page the colour of the background too (Paper).
      // In the box, plain words with no pill: nothing there that looks like a button (Brutal outlines pills).
      className={`tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs whitespace-nowrap tabular-nums opacity-0 transition-opacity duration-200 data-clear:opacity-100 ${BOX ? 'text-muted-foreground' : 'rounded-full bg-foreground/[0.07] text-foreground/70'}`}>
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"}
    </span>
  )
}
