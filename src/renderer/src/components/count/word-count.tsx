import { useEffect, useRef, useState } from "react"
import { useEditorState, type Editor } from "@tiptap/react"
import { num } from '../../../../main/dates'

/**
 * Words and characters for the whole document.
 *
 * The counts live in extension storage, which React has no reason to re-read on
 * its own. Subscribing to the doc rather than to the numbers is what keeps a
 * plain caret move from counting the whole document twice: the doc is the same
 * object until an edit replaces it.
 */
export function WordCount({ editor }: { editor: Editor | null }) {
  const doc = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance?.state.doc,
    equalityFn: Object.is,
  })

  // Counted once the typing pauses in a long note: each count reads the whole
  // document, which in a 1 MB note was most of every keystroke.
  const [counts, setCounts] = useState<{ words: number; characters: number } | null>(null)
  useEffect(() => {
    if (!editor || !doc) return
    const count = (): void => setCounts({ words: editor.storage.characterCount.words(), characters: editor.storage.characterCount.characters() })
    if (doc.content.size < 20000) return count()
    const later = setTimeout(count, 500)
    return () => clearTimeout(later)
  }, [editor, doc])

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
        const end = dom.getBoundingClientRect().bottom - parseFloat(getComputedStyle(dom).paddingBottom || "0")
        setClear(top !== undefined && end <= top - 4)
      })
    }
    check()
    // Any scroller on the way up may be the one that moves the words under it.
    document.addEventListener("scroll", check, { capture: true, passive: true })
    window.addEventListener("resize", check)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("scroll", check, { capture: true })
      window.removeEventListener("resize", check)
    }
  }, [editor, counts, doc])

  if (!editor || !doc || !counts) return null
  const { words, characters } = counts
  // Nothing to count says nothing: an empty box stays empty.
  if (!words) return null

  return (
    <span
      ref={pill}
      data-clear={clear || undefined}
      // Centred under the page on a soft pill, the way Raycast Notes shows it.
      className="tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background px-2 py-0.5 text-xs whitespace-nowrap text-foreground/70 tabular-nums opacity-0 transition-opacity duration-200 data-clear:opacity-100">
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"}
    </span>
  )
}
