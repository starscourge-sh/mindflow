import type { ReactNode } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContext, type Editor } from '@tiptap/react'

import { Toolbar } from '@/components/tiptap-ui-primitive/toolbar'

/**
 * Held still at module scope, or the menu re-registers its ProseMirror plugin
 * on every render.
 *
 * `shift` is what keeps it off the window edges: the bubble is wider than some
 * selections are far from the side, and without this it sat flush against the
 * frame with its first button half cut off.
 */
const POSITION = { flip: true, shift: { padding: 12 } } as const

/**
 * The toolbar again, at the selection.
 *
 * Which controls it holds is the caller's business - a document wants the lot,
 * a title wants three marks - so they come in as children. That also stops a
 * title field importing the whole document toolbar in order to render none of
 * it.
 *
 * The context provider is what makes those children work: every `tiptap-ui`
 * control resolves its editor from `EditorContext`, and this menu gets rendered
 * outside any provider - the title editor has none at all - so it supplies its
 * own rather than inheriting whoever happens to be above it.
 */
export function SelectionMenu({
  editor,
  children
}: {
  editor: Editor | null
  children: ReactNode
}) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      // The table menu is a bubble too, and they would share the default key.
      pluginKey="selectionMenu"
      // Inline rather than a class: the title variant does not import the
      // editor's stylesheet, and this is the menu's only styling.
      style={{ zIndex: 40 }}
      options={POSITION}
      shouldShow={({ editor: instance, state }) =>
        // A node selection - an image, a rule, a card - is not text to format,
        // and a code block takes no marks.
        state.selection instanceof TextSelection &&
        !state.selection.empty &&
        instance.isEditable &&
        !instance.isActive('codeBlock')
      }
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          variant="floating"
          // The accent on its own reads as a lit panel sitting on the page.
          // Mixed back towards the page it keeps the hue and loses the glare.
          style={{ background: "color-mix(in srgb, var(--accent) 55%, var(--background))" }}
        >
          {children}
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
