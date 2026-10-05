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
  // Nothing to count says nothing: an empty box stays empty.
  if (!words) return null
  const characters = editor.storage.characterCount.characters()

  return (
    <span // Centred under the page on a soft pill, the way Raycast Notes shows it, so a
    // line of text running under it stays readable.
    className="tiptap-word-count pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums backdrop-blur-sm">
      {words} {words === 1 ? "word" : "words"} · {characters} {characters === 1 ? "character" : "characters"}
    </span>
  )
}
