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
import { lookAtSelected } from "@/components/image/image-look"
import { startCaption } from "@/extensions/caption"
import { BLOCK_COLORS, COLORABLE } from "@/extensions/block-color"
import { host, said } from "@/lib/host"
import { listDirection } from "@/lib/menu-keys"
import { fitToWidth } from "@/lib/table"
import { SpellingRows, type Misspelling } from "./spelling"

/**
 * What belongs to the whole table rather than to a row or a column.
 *
 * These were in the row and column menus, which is where they landed for want
 * of anywhere else - and reading "Delete table" under a column's own actions
 * is a good way to lose one. The handle points at the table, so this is the
 * menu that means the table.
 */
const TABLE_ACTIONS: Array<[string, (editor: Editor) => void]> = [
  ["Toggle header row", (editor) => editor.chain().focus().toggleHeaderRow().run()],
  ["Toggle header column", (editor) => editor.chain().focus().toggleHeaderColumn().run()],
  ["Fit to width", (editor) => void fitToWidth(editor)],
]

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
  at: point,
  spelling,
}: {
  editor: Editor
  /** A ref, so tracking the pointer does not re-render the editor. */
  targetRef: { current: BlockTarget | null }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where a right-click happened: the menu opens there, not at the grip. */
  at?: { x: number; y: number } | null
  /** A right-click on a misspelt word: its suggestions come first. */
  spelling?: Misspelling | null
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

  /**
   * Mark the row Enter would take, so it looks picked the way a cmdk row does.
   *
   * Radix gives its highlight to whatever holds the focus, and the focus is in
   * the filter box - so nothing is highlighted until you press an arrow. This
   * marks the first row instead, and the stylesheet only shows it while the
   * box still has the focus, which is exactly until an arrow moves off it.
   */
  useEffect(() => {
    const rows = input.current?.parentElement?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    rows?.forEach((row, index) => row.toggleAttribute("data-first", index === 0))
  })

  /** The row Enter takes: the first one still showing, whatever kind it is. */
  const takeFirst = () => {
    input.current?.parentElement?.querySelector<HTMLElement>('[role="menuitem"]')?.click()
  }

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
  /** On a divider, the look it does not have yet. */
  const rule =
    thing?.type.name === "horizontalRule"
      ? thing.attrs.variant === "ribbon"
        ? { label: "Plain line", variant: null }
        : { label: "Ribbon", variant: "ribbon" }
      : null
  const captionable =!!thing && ["image", "youtube", "attachment"].includes(thing.type.name)
  /** A card's address. Opened through `window.open`, which the app hands to the browser. */
  const href: string | undefined = thing?.attrs.href || undefined

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

  /**
   * The block on the clipboard, to paste somewhere else.
   *
   * Selecting the node and asking the browser to copy, rather than building
   * the clipboard by hand: ProseMirror already serialises its own selection,
   * so this puts there exactly what pressing copy on the block would - which
   * means a paste back rebuilds the node instead of re-parsing its markup.
   */
  const copy = () => {
    const found = resolve()
    if (!found) return
    editor.chain().focus().setNodeSelection(found.pos).run()
    const done = document.execCommand("copy")
    said(done ? "Block copied" : "Could not copy it", done)
  }

  /** The picture itself on the clipboard, not a link to it. */
  const copyImage = async () => {
    if (!imageSrc) return
    const done = !!(await host().copyImage?.(imageSrc))
    said(done ? "Picture copied" : "Could not copy the picture", done)
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
        <span
          className="tiptap-block-menu-anchor"
          // At the click, measured against whatever box the anchor sits in:
          // the window can sit inside a moved (transformed) box, where a
          // fixed position is not the screen's.
          ref={(node) => {
            if (!node) return
            if (!point) {
              node.style.position = ""
              return
            }
            node.style.position = "absolute"
            const box = (node.offsetParent ?? document.body).getBoundingClientRect()
            node.style.left = `${point.x - box.left}px`
            node.style.top = `${point.y - box.top}px`
          }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="right"
        className="tiptap-block-menu"
        // Closing hands focus back to the anchor by default, which took it
        // straight out of a caption just opened from here (an empty caption
        // goes when it loses focus). The action that ran keeps its focus.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // Closed without an action (Escape, a click away): back to the note.
          if (!document.activeElement || document.activeElement === document.body) editor.commands.focus()
        }}
      >
        <input
          ref={input}
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Radix owns the arrows, so a Ctrl chord is handed on as one rather
            // than moving the selection here, which would leave two ideas of
            // where the list is. Chords only - passing a real arrow on would
            // match again on the way back and never stop.
            const direction = event.ctrlKey ? listDirection(event) : null
            if (direction) {
              event.preventDefault()
              event.currentTarget.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: direction === "down" ? "ArrowDown" : "ArrowUp",
                  bubbles: true,
                })
              )
              return
            }
            // Enter takes the top match; arrows and Escape belong to Radix, and
            // everything else has to be kept from its own typeahead.
            if (event.key === "Enter") {
              event.preventDefault()
              takeFirst()
              return
            }
            if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
              event.stopPropagation()
            }
          }}
        />

        <div className="tiptap-block-menu-list">
        {spelling && !term ? <SpellingRows editor={editor} spelling={spelling} /> : null}

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

        {/* A divider's two looks, each offered on the other. */}
        {rule && matches(rule.label) ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => editor.commands.updateAttributes("horizontalRule", { variant: rule.variant }))}>
              <span className="tiptap-slash-menu-title">{rule.label}</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {asImage && matches("Show as image") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={showAsImage}>
              <span className="tiptap-slash-menu-title">Show as image</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* The picture's own toolbar, here too: a right-click should never offer less. */}
        {imageSrc && matches("Look") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => lookAtSelected(editor))}>
              <span className="tiptap-slash-menu-title">Look</span>
              <span className="tiptap-slash-menu-hint">Space</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {captionable && matches("Caption") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => startCaption(editor, editor.state.selection.from))}>
              <span className="tiptap-slash-menu-title">{thing?.attrs.caption ? "Edit caption" : "Add a caption"}</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {imageSrc?.startsWith("mindflow://assets/") && host().saveFileAs && matches("Download") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void host().saveFileAs?.(imageSrc, thing?.attrs.alt ? `${thing.attrs.alt}.${imageSrc.split(".").pop()}` : imageSrc.split("/").pop() ?? "Picture")}>
              <span className="tiptap-slash-menu-title">Download</span>
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

        {thing?.type.name === "table"
          ? TABLE_ACTIONS.filter(([label]) => matches(label)).map(([label, run]) => (
              <DropdownMenuItem key={label} asChild>
                <button type="button" onClick={() => at(() => run(editor))}>
                  <span className="tiptap-slash-menu-title">{label}</span>
                </button>
              </DropdownMenuItem>
            ))
          : null}

        {href && matches("Open link") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => window.open(href)}>
              <span className="tiptap-slash-menu-title">Open link</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {href && matches("Copy link") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void navigator.clipboard.writeText(href).then(() => said("Link copied"), () => said("Could not copy the link", false))}>
              <span className="tiptap-slash-menu-title">Copy link</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {matches("Copy") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={copy}>
              <span className="tiptap-slash-menu-title">Copy</span>
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
