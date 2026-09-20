import { useEditorState, type Editor } from "@tiptap/react"
import { Braces, Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/tiptap-ui-primitive/button"

/**
 * Lock the document, and show what it is made of.
 *
 * Locking is `setEditable`, which is the editor's own idea of read only: the
 * caret still moves and text can still be selected and copied, but nothing can
 * change it, and the menus that would change it stop offering.
 */
export function EditorToggles({
  editor,
  sourceOpen,
  onToggleSource,
}: {
  editor: Editor | null
  sourceOpen: boolean
  onToggleSource: () => void
}): React.JSX.Element | null {
  const editable = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance?.isEditable ?? true,
  })

  if (!editor) return null

  return (
    <>
      <Button
        data-style="ghost"
        data-active-state={editable ? "off" : "on"}
        aria-label={editable ? "Lock document" : "Unlock document"}
        title={editable ? "Lock document" : "Unlock document"}
        onClick={() => editor.setEditable(!editor.isEditable)}
      >
        {editable ? (
          <LockOpen className="tiptap-button-icon" />
        ) : (
          <Lock className="tiptap-button-icon" />
        )}
      </Button>

      <Button
        data-style="ghost"
        data-active-state={sourceOpen ? "on" : "off"}
        aria-label="Show document source"
        title="Show document source (⌘⌥S)"
        onClick={onToggleSource}
      >
        <Braces className="tiptap-button-icon" />
      </Button>
    </>
  )
}
