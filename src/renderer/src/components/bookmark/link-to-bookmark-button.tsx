import { BookmarkPlus } from "lucide-react"
import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { linkCard } from "@/lib/link-card"

/**
 * Turn the link the caret is in into a card.
 *
 * Only shown on a link, because that is the only thing it can act on. The link
 * itself goes: a card and the words it came from would say the same thing
 * twice, and the card carries the address anyway.
 */
export function LinkToBookmarkButton({
  editor,
}: {
  editor: Editor | null
}): React.JSX.Element | null {
  // A string, so this settles instead of re-rendering on every transaction.
  const href = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance?.getAttributes("link").href ?? "",
  })

  if (!editor || !href) return null

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Turn this link into a card"
      onClick={() => {
        editor.chain().focus().extendMarkRange("link").deleteSelection().run()
        void linkCard(editor, href)
      }}
    >
      <BookmarkPlus className="tiptap-button-icon" />
    </Button>
  )
}
