import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus"
import { NodeSelection } from "@tiptap/pm/state"
import { EditorContext, useEditorState, type Editor } from "@tiptap/react"
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react"
import { AliveIcon } from "@/components/ui/alive-icon"
import TrashIcon from "@/components/ui/trash-icon"

import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"

/** Three widths rather than a free drag: a document reads better in columns. */
const SIZES = [
  { label: "S", width: "35%" },
  { label: "M", width: "60%" },
  { label: "L", width: "100%" },
]

const ALIGNS = [
  { value: "left", icon: <AlignLeft className="tiptap-button-icon" /> },
  { value: "center", icon: <AlignCenter className="tiptap-button-icon" /> },
  { value: "right", icon: <AlignRight className="tiptap-button-icon" /> },
]

// Nothing to resize or delete in a page only being read. One function for
// good: a new one each render made the menu reconfigure on every keystroke.
const showForImage: BubbleMenuProps["shouldShow"] = ({ state, editor }) =>
  editor.isEditable &&
  state.selection instanceof NodeSelection &&
  state.selection.node.type.name === "image"

/**
 * What you can do to the picture you just clicked.
 *
 * It only shows for a whole-node selection of an image, which is what clicking
 * one gives you. The text toolbar deliberately hides for the same selection, so
 * the two never appear together.
 */
export function ImageMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  // Subscribed, not read once: the menu stays mounted while you press its
  // buttons, so a plain read would leave every control showing the state it
  // had when the image was first selected.
  const attrs = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      width: instance?.getAttributes("image").width ?? null,
      align: instance?.getAttributes("image").align ?? null,
    }),
  })

  if (!editor || !attrs) return null

  const set = (next: Record<string, string>): boolean =>
    editor.chain().focus().updateAttributes("image", next).run()

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      style={{ zIndex: 40 }}
      shouldShow={showForImage}
      // Inside the picture's own top corner, not over the words above it. Only
      // a picture too short to hold it gets it just beneath.
      options={{
        placement: "top-start",
        flip: false,
        offset: ({ rects }) =>
          rects.reference.height >= rects.floating.height + 12
            ? { mainAxis: -rects.floating.height - 8, crossAxis: 8 }
            : { mainAxis: -rects.reference.height - rects.floating.height - 8 },
      }}
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar variant="floating">
          <ToolbarGroup>
            {SIZES.map(({ label, width }) => (
              <Button
                key={label}
                data-style="ghost"
                data-active-state={attrs.width === width ? "on" : "off"}
                aria-label={`${label} width`}
                onClick={() => set({ width })}
              >
                <span className="tiptap-button-text">{label}</span>
              </Button>
            ))}
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            {ALIGNS.map(({ value, icon }) => (
              <Button
                key={value}
                data-style="ghost"
                data-active-state={(attrs.align ?? "left") === value ? "on" : "off"}
                aria-label={`Align ${value}`}
                onClick={() => set({ align: value })}
              >
                {icon}
              </Button>
            ))}
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <Button
              data-style="ghost"
              aria-label="Delete image"
              onClick={() => editor.chain().focus().deleteSelection().run()}
            >
              <AliveIcon icon={TrashIcon} size={16} className="tiptap-button-icon" />
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
