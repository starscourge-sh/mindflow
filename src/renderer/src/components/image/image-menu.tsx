import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus"
import { NodeSelection } from "@tiptap/pm/state"
import { EditorContext, useEditorState, type Editor } from "@tiptap/react"
import { AlignCenter, AlignLeft, AlignRight, Captions } from "lucide-react"
import { AliveIcon } from "@/components/ui/alive-icon"
import TrashIcon from "@/components/ui/trash-icon"
import { crumpleAway } from "@/lib/fly-home"
import { chime } from "@/lib/sound"
import { toast } from "@/components/haligtree/ui"
import { isKept, leftNoteSaid, refreshKept, seeUnlinked } from "@/lib/media-files"
import DownloadIcon from "@/components/ui/download-icon"
import { startCaption } from "@/extensions/caption"
import { host } from "@/lib/host"
import MagnifierIcon from "@/components/ui/magnifier-icon"
import { lookAtSelected } from "@/components/image/image-look"

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
// Only for a picture picked in a note being worked in (the note or this menu
// has the focus): a note opened with a picture first starts with that picture
// picked, and the menu came up unasked, working out its place in the frame the
// note opened in, which laid the whole note out there and then.
const showForImage: BubbleMenuProps["shouldShow"] = ({ state, editor, element }) =>
  editor.isEditable &&
  state.selection instanceof NodeSelection &&
  state.selection.node.type.name === "image" &&
  (editor.view.hasFocus() || element.contains(document.activeElement))

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
      caption: Boolean(instance?.getAttributes("image").caption),
      src: String(instance?.getAttributes("image").src ?? ""),
      alt: String(instance?.getAttributes("image").alt ?? ""),
      // Read with the rest, so a change in Settings shows the next time a picture is picked.
      pictureSize: document.documentElement.dataset.pictureSize ?? "full",
    }),
  })

  if (!editor || !attrs) return null

  const set = (next: Record<string, string>): boolean =>
    editor.chain().focus().updateAttributes("image", next).run()
  // A picture given no size of its own follows Settings' “Pictures in notes”: the size it shows at is lit, and says so.
  const following = attrs.width ? null : ({ full: "100%", medium: "60%", small: "35%" } as Record<string, string>)[attrs.pictureSize] ?? "100%"

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      style={{ zIndex: 40 }}
      shouldShow={showForImage}
      // Moved the moment the chosen picture changes. With the menu's own wait
      // (a quarter second) it stayed drawn over the last picture, often one
      // just scrolled away, while the buttons already worked on the new one:
      // a press in that moment changed a picture you were not looking at, or
      // landed on nothing, and the button seemed to do nothing.
      updateDelay={0}
      // Centred inside the top of the picture, not over the words above it. Only
      // a picture too short to hold it gets it just beneath.
      options={{
        placement: "top",
        flip: false,
        offset: ({ rects }) =>
          rects.reference.height >= rects.floating.height + 12
            ? { mainAxis: -rects.floating.height - 8 }
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
                data-active-state={attrs.width === width || following === width ? "on" : "off"}
                data-following={following === width ? "" : undefined}
                aria-label={`${label} width`}
                tooltip={following === width ? `${label}, from Settings: “Pictures in notes”` : undefined}
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
              tooltip="Caption"
              shortcutKeys="alt+mod+m"
              data-active-state={attrs.caption ? "on" : "off"}
              aria-label="Caption"
              onClick={() => startCaption(editor, editor.state.selection.from)}
            >
              <Captions className="tiptap-button-icon" />
            </Button>
            {/* Only a picture kept in the note's own store has a file to copy. */}
            {attrs.src.startsWith("haligtree://assets/") && host().saveFileAs && (
              <Button
                data-style="ghost"
                tooltip="Save a copy"
                aria-label="Save a copy"
                onClick={() => void host().saveFileAs?.(attrs.src, attrs.alt ? `${attrs.alt}.${attrs.src.split(".").pop()}` : attrs.src.split("/").pop() ?? "Picture")}
              >
                <AliveIcon icon={DownloadIcon} size={16} className="tiptap-button-icon" />
              </Button>
            )}
            <Button data-style="ghost" tooltip="Look" shortcutKeys="Space" aria-label="Look" onClick={() => lookAtSelected(editor)}>
              <AliveIcon icon={MagnifierIcon} size={16} className="tiptap-button-icon" />
            </Button>
            <Button
              data-style="ghost"
              aria-label="Delete image"
              // Thrown away, shown: React Bits' paper crumples where the picture was, then fades (1.5s for now, to
              // be judged), with its crackle and a notice to put it back; by a key it simply goes.
              onClick={(event) => {
                // This toolbar lies over the picture: hidden, and a frame drawn without it, before the picture's
                // likeness is taken, or the paper crumples with the toolbar printed on it.
                const bar = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-image-menu], .tiptap-toolbar")?.parentElement
                if (bar) bar.style.visibility = "hidden"
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const at = editor.state.selection.from
                  const node = editor.state.doc.nodeAt(at)
                  // Asked afresh while the paper falls, so the notice says how this picture came.
                  const known = refreshKept()
                  const dom = editor.view.nodeDOM(at) as HTMLElement | null
                  // Gone as far as the hand is concerned while its paper crumples: no right-click, click or drag on it
                  // (a fast right-click opened its menu on a picture already on its way out).
                  dom?.setAttribute("inert", "")
                  const away = crumpleAway(dom)
                  // Out of the note only once the paper has landed: crumpled, tossed, and then the words close up
                  // over the room it left, never the two at once.
                  const remove = (): void => {
                    dom?.removeAttribute("inert")
                    if (editor.isDestroyed || editor.state.doc.nodeAt(at) !== node) return
                    try {
                      editor.chain().focus().command(({ tr }) => (tr.delete(at, at + node!.nodeSize), true)).run()
                    } catch (error) {
                      // Never in silence: the picture stays where it was, shown again as the paper's hiding ends
                      // (crumpleAway lifts it once this returns), picked with its toolbar as before, and said.
                      console.error("The picture could not be removed", error)
                      editor.chain().focus().setNodeSelection(at).run()
                      toast("Could not remove the picture", undefined, "error")
                      return
                    }
                    // Said true for how it came: an attachment waits under Files' Unlinked, a library file stays in Files.
                    const src = String(node!.attrs.src ?? "")
                    const stored = /^(haligtree|mindflow):\/\/assets\//.test(src)
                    void known.then(() => toast(stored ? leftNoteSaid(src, "Picture") : "Picture removed", () => (editor.chain().focus().undo().run(), chime("undo")), "success", stored && !isKept(src) ? seeUnlinked : undefined))
                  }
                  if (bar) bar.style.visibility = ""
                  editor.commands.blur()
                  if (away) away(remove)
                  else remove()
                }))
              }}
            >
              <AliveIcon icon={TrashIcon} size={16} className="tiptap-button-icon" />
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
