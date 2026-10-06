import { useEffect, useState } from "react"
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

  if (!editor || !doc || !counts) return null
  const { words, characters } = counts
  // Nothing to count says nothing: an empty box stays empty.
  if (!words) return null

  return (
    <span // Centred under the page on a soft pill, the way Raycast Notes shows it, so a
    // line of text running under it stays readable.
    className="tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background px-2 py-0.5 text-xs whitespace-nowrap text-foreground/70 tabular-nums">
      {num(words)} {words === 1 ? "word" : "words"} · {num(characters)} {characters === 1 ? "character" : "characters"}
    </span>
  )
}
