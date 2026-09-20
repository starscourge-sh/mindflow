import { useEffect, useRef, useState } from "react"
import { Selection } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"

// --- UI Primitives ---
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

// --- Items ---
import { slashItems } from "@/components/slash/slash-items"
import { BLOCK_COLORS, COLORABLE } from "@/extensions/block-color"

/** The same conversions `/` offers, minus everything that inserts. */
const CONVERSIONS = slashItems.filter((item) => item.turnInto)

export interface BlockTarget {
  pos: number
  name: string
  level?: number
}

/**
 * What you can do to one block, reached from its handle.
 *
 * The handle already knows which block it points at, so nothing here needs a
 * selection - it puts the cursor in the block first, then runs the same command
 * the `/` menu would. The rows borrow that menu's classes, so two lists of the
 * same blocks look like one feature rather than two.
 */
export function BlockMenu({
  editor,
  targetRef,
  open,
  onOpenChange,
}: {
  editor: Editor
  /** A ref, so tracking the pointer does not re-render the editor. */
  targetRef: { current: BlockTarget | null }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // The handle keeps following the pointer, so read it once, on open, and hold
  // that - otherwise the target drifts out from under the menu.
  const [block, setBlock] = useState<BlockTarget | null>(null)
  const [query, setQuery] = useState("")
  const input = useRef<HTMLInputElement>(null)

  const term = query.trim().toLowerCase()
  const matches = (label: string) => label.toLowerCase().includes(term)
  const conversions = CONVERSIONS.filter(
    (item) => matches(item.title) || (item.hint ? matches(item.hint) : false)
  )

  // Opening from the grip sets `open` directly, and Radix does not call
  // `onOpenChange` for a change it did not make - so the target has to be read
  // here or every action lands on nothing. The focus is deferred a task so it
  // beats Radix's own focus scope, which puts the caret on the first item.
  useEffect(() => {
    if (!open) {
      setBlock(null)
      setQuery("")
      return
    }
    setBlock(targetRef.current)
    const id = setTimeout(() => input.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open, targetRef])

  /** The block the handle pointed at, re-read now and checked for identity. */
  const resolve = () => {
    const { doc } = editor.state
    if (!block || block.pos < 0 || block.pos > doc.content.size) return null
    const node = doc.nodeAt(block.pos)
    // The handle re-reports the top-level ancestor after a document change, so
    // a mismatch means the position no longer names the block that was clicked.
    return node && node.type.name === block.name ? { node, pos: block.pos } : null
  }

  /** Commands read the selection, so move it into the handle's block first. */
  const at = (run: () => void) => {
    const found = resolve()
    if (!found) return
    const { node, pos } = found

    if (node.isAtom || node.isLeaf) {
      // An image, a rule or a card holds no text position to put a cursor in.
      editor.chain().focus().setNodeSelection(pos).run()
    } else {
      // `pos + 1` is inside a container but not inside a textblock, and a
      // selection there makes every conversion a silent no-op.
      const inside = Selection.near(editor.state.doc.resolve(pos + 1), 1)
      editor.chain().focus().setTextSelection(inside.from).run()
    }
    run()
  }

  const thing = resolve()?.node

  /**
   * Is there a line of text here to turn into something else?
   *
   * Asking whether the block is an atom was a proxy for this, and it was only
   * ever right about images. A table is not an atom either, so it was offered
   * nine conversions that all act on whatever cell the cursor lands in. The
   * question is what the block holds: text, or other blocks.
   */
  const convertible =
    !!thing &&
    (thing.isTextblock ||
      ["listItem", "taskItem", "blockquote"].includes(thing.type.name))
  const imageSrc: string | undefined =
    thing?.type.name === "image" ? thing.attrs.src : undefined

  /**
   * An attachment holding a picture, which can be shown as one instead.
   *
   * The store keeps every file the same way, so the card and the thumbnail are
   * two ways of drawing the same bytes. Only the extension says which is
   * possible: the slash menu's file picker makes a card out of anything.
   */
  const asImage: string | undefined =
    thing?.type.name === "attachment" &&
    /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(thing.attrs.src ?? "")
      ? thing.attrs.src
      : undefined

  /** Swap the card for a picture of the same file, in place. */
  const showAsImage = (): void => {
    const found = resolve()
    if (!found || !asImage) return
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: found.pos, to: found.pos + found.node.nodeSize },
        { type: "image", attrs: { src: asImage } }
      )
      .run()
  }

  /**
   * Would a colour land anywhere?
   *
   * `setBlockColor` walks up for the outermost block that can hold one, so the
   * question is whether the target or any of its ancestors is such a block. An
   * image holds no text and no surface, and a collapsible section does not
   * declare the attributes, so on either of those every swatch was a no-op.
   */
  const colorable = (() => {
    const found = resolve()
    if (!found) return false
    if (COLORABLE.includes(found.node.type.name)) return true

    const $at = editor.state.doc.resolve(found.pos)
    for (let depth = $at.depth; depth > 0; depth--) {
      if (COLORABLE.includes($at.node(depth).type.name)) return true
    }
    return false
  })()

  /** A copy of the block, right after it. */
  const duplicate = () => {
    const found = resolve()
    if (!found) return
    editor
      .chain()
      .focus()
      .insertContentAt(found.pos + found.node.nodeSize, found.node.toJSON())
      .run()
  }

  /** The picture itself on the clipboard, not a link to it. */
  const copyImage = async () => {
    if (imageSrc && !(await window.api.copyImage(imageSrc))) {
      console.error(`Could not copy ${imageSrc}`)
    }
  }

  /** Delete by range: `deleteNode` looks for an ancestor and misses atoms. */
  const remove = () => {
    const found = resolve()
    if (!found) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: found.pos, to: found.pos + found.node.nodeSize })
      .run()
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      {/* The grip cannot be the trigger: Radix preventDefaults its pointerdown,
          which kills the handle's native drag. This anchors the menu instead. */}
      <DropdownMenuTrigger asChild>
        <span className="tiptap-block-menu-anchor" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="right"
        className="tiptap-block-menu"
      >
        <input
          ref={input}
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the top match; arrows and Escape belong to Radix, and
            // everything else has to be kept from its own typeahead.
            if (event.key === "Enter") {
              event.preventDefault()
              const first = conversions[0]
              if (first) at(() => first.run(editor, ""))
              return
            }
            if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
              event.stopPropagation()
            }
          }}
        />

        <div className="tiptap-block-menu-list">
        {convertible && !term ? (
          <div className="tiptap-slash-menu-group">Turn into</div>
        ) : null}

        {convertible
          ? conversions.map((item) => (
              <DropdownMenuItem key={item.title} asChild>
                <button type="button" onClick={() => at(() => item.run(editor, ""))}>
                  {item.icon}
                  <span className="tiptap-slash-menu-title">{item.title}</span>
                  {item.hint ? (
                    <span className="tiptap-slash-menu-hint">{item.hint}</span>
                  ) : null}
                </button>
              </DropdownMenuItem>
            ))
          : null}

        {term ? null : <div className="tiptap-slash-menu-group">Block</div>}

        {asImage && matches("Show as image") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={showAsImage}>
              <span className="tiptap-slash-menu-title">Show as image</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {imageSrc && matches("Copy image") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void copyImage()}>
              <span className="tiptap-slash-menu-title">Copy image</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {matches("Duplicate") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={duplicate}>
              <span className="tiptap-slash-menu-title">Duplicate</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* An image or a rule holds no text and no surface, so the whole
            submenu was a dead end on one: every swatch left the node exactly
            as it found it. */}
        {colorable && matches("Color") ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="tiptap-slash-menu-title">Color</span>
            <span className="tiptap-slash-menu-hint">&rsaquo;</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="tiptap-block-colors">
            <div className="tiptap-block-colors-label">Text</div>
            {BLOCK_COLORS.map((color) => (
              <button
                key={`text-${color}`}
                type="button"
                data-color={color}
                title={`${color} text`}
                onClick={() => at(() => editor.commands.setBlockColor({ text: color }))}
              >
                A
              </button>
            ))}

            <div className="tiptap-block-colors-label">Background</div>
            {BLOCK_COLORS.map((color) => (
              <button
                key={`bg-${color}`}
                type="button"
                data-background={color}
                title={`${color} background`}
                onClick={() =>
                  at(() => editor.commands.setBlockColor({ background: color }))
                }
              />
            ))}

            <button
              type="button"
              className="tiptap-block-colors-clear"
              onClick={() =>
                at(() =>
                  editor.commands.setBlockColor({ background: null, text: null })
                )
              }
            >
              Clear
            </button>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        ) : null}

        {matches("Delete") ? (
          <DropdownMenuItem asChild>
            <button
              type="button"
              onClick={() =>
                remove()
              }
            >
              <span className="tiptap-slash-menu-title">Delete</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
