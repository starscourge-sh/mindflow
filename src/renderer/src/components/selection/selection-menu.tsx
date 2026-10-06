import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContext, useEditorState, type Editor } from '@tiptap/react'

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
 * The bubble stays inside the editor's own box, not just the window, and when
 * even that is narrower than the bubble (a large interface size in a small
 * window) its buttons drop their words and keep their icons.
 */
function useFit(editor: Editor | null) {
  const bar = useRef<HTMLDivElement>(null)
  const [tight, setTight] = useState(false)
  const full = useRef(0)
  const box = editor && !editor.isDestroyed ? (editor.view.dom.closest('.mindflow-editor-wrapper') as HTMLElement | null) : null
  const options = useMemo(() => (box ? { ...POSITION, shift: { ...POSITION.shift, boundary: box } } : POSITION), [box])
  useEffect(() => {
    const el = bar.current
    if (!el || !box) return
    const check = (): void => {
      // Measured with the words showing, so dropping them never makes it think it fits again.
      if (!el.hasAttribute('data-tight')) full.current = el.scrollWidth
      if (full.current) setTight(full.current > box.clientWidth - 2 * POSITION.shift.padding)
    }
    const watch = new ResizeObserver(check)
    watch.observe(el)
    watch.observe(box)
    return () => watch.disconnect()
  }, [box])
  return { bar, tight, options }
}

// One function for good: a new one each render made the menu reconfigure its
// plugin on every keystroke.
// A node selection - an image, a rule, a card - is not text to format,
// and a code block takes no marks.
const showForText: BubbleMenuProps['shouldShow'] = ({ editor: instance, state }) =>
  state.selection instanceof TextSelection &&
  !state.selection.empty &&
  instance.isEditable &&
  !instance.isActive('codeBlock')

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
  const { bar, tight, options } = useFit(editor)
  // Its controls are drawn only while words are selected. Mounted all along
  // they redrew on every key, and each redraw while typing made React measure
  // the caret through the whole note.
  const selecting = useEditorState({ editor, selector: ({ editor: instance }) => !!instance && !instance.state.selection.empty })
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      // The table menu is a bubble too, and they would share the default key.
      pluginKey="selectionMenu"
      // Inline rather than a class: the title variant does not import the
      // editor's stylesheet, and this is the menu's only styling.
      style={{ zIndex: 40 }}
      options={options}
      shouldShow={showForText}
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={bar}
          data-tight={tight || undefined}
          variant="floating"
          // Silent on hover: it appears under the pointer whenever words are selected.
          data-silent=""
          // The accent on its own reads as a lit panel sitting on the page.
          // Mixed back towards the page it keeps the hue and loses the glare.
          style={{ background: "color-mix(in srgb, var(--accent) 55%, var(--background))" }}
        >
          {selecting && children}
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
