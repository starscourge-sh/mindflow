import { useEditorState, type Editor } from "@tiptap/react"

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

  if (!editor || !doc) return null

  const words = editor.storage.characterCount.words()

  return (
    <span
      className="tiptap-word-count px-2 py-1 justify-center right-2 bottom-5 color-white pointer-events-none text-shadow-2xl bg-accent rounded-full ">
      {words} {words === 1 ? "word" : "words"} ·{" "}
      {editor.storage.characterCount.characters()}
    </span>
  )
}
