import { MenuGlyph } from "@/components/ui/menu-icon"
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
import { isAudio, transcribe } from "@/lib/transcribe"
import { BLOCK_COLORS, COLORABLE } from "@/extensions/block-color"
import { host, said } from "@/lib/host"
import { listDirection } from "@/lib/menu-keys"
import { fitToWidth } from "@/lib/table"
import { SpellingRows, type Misspelling } from "./spelling"
import { Kbd } from "@/components/haligtree/ui"
import { useShowLine } from "@/lib/show-in-list"
import { BLOCK_TYPES, nameBlock } from "@/extensions/block-ids"
import { haligtree } from "@/lib/haligtree"
import { isWebPage, openArticle } from "@/components/pdf/web-reader"
import { ClickedRows, type Clicked } from "./clicked"

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
  clicked,
  clickedOnly = false,
  documentId,
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
  /** A right-click on a link, a PDF or picked words: its own lines come first, the block's under them. */
  clicked?: Clicked | null
  /** Only the clicked thing's lines: where there is no block to act on (no handles, or read-only). */
  clickedOnly?: boolean
  /** The note this editor shows (`capture-…`, `item-…`), for a link to one of its lines. */
  documentId?: string | number | null
}) {
  // The handle keeps following the pointer, so read it once, on open, and hold
  // that - otherwise the target drifts out from under the menu.
  const [block, setBlock] = useState<BlockTarget | null>(null)
  const [query, setQuery] = useState("")
  const input = useRef<HTMLInputElement>(null)

  const term = query.trim().toLowerCase()
  const matches = (label: string) => label.toLowerCase().includes(term)
  const show = useShowLine()
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
    // Only once something is typed: opened by the mouse, no row looks picked before a key is pressed.
    rows?.forEach((row, index) => row.toggleAttribute("data-first", !!query && index === 0))
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
  // A recording has no caption shown: its words, written under it, are what it offers instead.
  const recording = isAudio(thing)
  const captionable =!!thing && !recording && ["image", "youtube", "attachment"].includes(thing.type.name)
  /** A file block's own name for itself, the heading its own actions sit under, as Notion's menu does. */
  const fileName = String(thing?.attrs.name || thing?.attrs.src || "")
  const kindName: string | null = recording ? "Voice note"
    : thing?.type.name === "image" ? "Picture"
    : thing?.type.name !== "attachment" ? null
    : /\.(mp4|m4v|mov|webm)$/i.test(fileName) ? "Video"
    : /\.pdf$/i.test(fileName) ? "PDF"
    : "File"
  const fileSrc: string | undefined = thing?.type.name === "attachment" ? thing.attrs.src : undefined
  /** The recording's own player, back to its start and playing. */
  const playFromStart = (): void => {
    const found = resolve()
    const dom = found && editor.view.nodeDOM(found.pos)
    const player = dom instanceof HTMLElement ? dom.querySelector("audio, video") : null
    if (!(player instanceof HTMLMediaElement)) return
    player.currentTime = 0
    void player.play()
  }
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
      // The copy is a new line: it does not take the original's lasting name.
      .insertContentAt(found.pos + found.node.nodeSize, { ...found.node.toJSON(), attrs: { ...found.node.attrs, blockId: null } })
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

  /**
   * A link to this one line, or the line itself shown elsewhere, live (a
   * block reference): the line is given its lasting name, and what pastes
   * as the link or the embed goes on the clipboard. Only in a note that is
   * saved somewhere a link can find it.
   */
  const lineOf = /^(capture|item)-(.+)$/.exec(String(documentId ?? ""))
  const lineable = !!lineOf && !!thing && BLOCK_TYPES.includes(thing.type.name) && !!thing.textContent.trim()
  const copyLine = async (embed: boolean): Promise<void> => {
    const found = resolve()
    if (!found || !lineOf) return
    const block = nameBlock(editor, found.pos)
    const [, type, id] = lineOf
    const note = type === "capture"
      ? await window.api.captures.get(id).then((one) => one && { link: id, title: one.label || one.title || "Untitled" })
      : await haligtree.item(id).then((one) => one && { link: `${one.tier}:${id}`, title: one.title || "Untitled" })
    if (!block || !note) return said("Could not copy it", false)
    const text = `${embed ? "!" : ""}[[@${note.link}#^${block}|${note.title.replace(/[[\]|\n]+/g, " ").trim().slice(0, 80)}]]`
    await navigator.clipboard.writeText(text).then(
      () => said(embed ? "Copied: paste it in any note to show this line there, live" : "Link to this line copied: paste it in any note"),
      () => said("Could not copy it", false),
    )
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

  const conversionRows = conversions.map((item) => (
    <DropdownMenuItem key={item.title} asChild>
      <button type="button" onClick={() => at(() => item.run(editor, ""))}>
        {item.icon}
        <span className="tiptap-slash-menu-title">{item.title}</span>
        {item.hint ? <span className="tiptap-slash-menu-hint">{item.hint}</span> : null}
      </button>
    </DropdownMenuItem>
  ))

  /**
   * Under a clicked thing (a link, a PDF page, a picture), the block's own lines fold into one "Block ›" row:
   * the menu is about what was clicked, and the line it sits in is one step away. A filter shows them all, flat.
   */
  const underClicked = (rows: React.ReactNode): React.ReactNode =>
    clicked && !term ? (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-block-sub>
          <MenuGlyph label="Block" />
          <span className="tiptap-slash-menu-title">{kindName ?? "Block"}</span>
          <span className="tiptap-slash-menu-hint">&rsaquo;</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="tiptap-block-menu tiptap-block-menu-sub">
          <div className="tiptap-block-menu-list mf-more">{rows}</div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : rows

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
          data-quiet={!query ? "" : undefined}
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

        <div className="tiptap-block-menu-list mf-more">
        {spelling && !term ? <SpellingRows editor={editor} spelling={spelling} /> : null}

        {/* What the click landed on first; the block's lines after, so nothing is lost. */}
        {clicked ? <ClickedRows editor={editor} clicked={clicked} matches={matches} onDone={() => onOpenChange(false)} /> : null}

        {/* A note with no block handles (read-only, a card, a sticky): the clicked thing's lines alone. */}
        {clickedOnly ? null : underClicked(<>
        {convertible && !term && !clicked ? (
          <div className="tiptap-slash-menu-group">Turn into</div>
        ) : null}
        {convertible && (!clicked || term) ? conversionRows : null}

        {term ? null : <div className="tiptap-slash-menu-group" data-kind-heading={kindName ?? undefined}>{kindName ?? "Block"}</div>}

        {/* Under a clicked thing the block's conversions fold into one line, as a submenu. */}
        {convertible && clicked && !term ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-turn-into-sub>
              <MenuGlyph label="Turn it into" />
              <span className="tiptap-slash-menu-title">Turn into</span>
              <span className="tiptap-slash-menu-hint">&rsaquo;</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="tiptap-block-menu tiptap-block-menu-sub">
              <div className="tiptap-block-menu-list mf-more">{conversionRows}</div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {/* A divider's two looks, each offered on the other. */}
        {rule && matches(rule.label) ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => editor.commands.updateAttributes("horizontalRule", { variant: rule.variant }))}>
              <MenuGlyph label={rule.label} />
              <span className="tiptap-slash-menu-title">{rule.label}</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {asImage && matches("Show as image") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={showAsImage}>
              <MenuGlyph label="Show as image" />
              <span className="tiptap-slash-menu-title">Show as image</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* The picture's own toolbar, here too: a right-click should never offer less. */}
        {imageSrc && matches("Look") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => lookAtSelected(editor))}>
              <MenuGlyph label="Look" />
              <span className="tiptap-slash-menu-title">Look</span>
              <span className="tiptap-slash-menu-hint">Space</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {recording && editor.isEditable && matches("Transcribe") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-transcribe onClick={() => at(() => void transcribe(editor, String(thing?.attrs.src ?? "")))}>
              <MenuGlyph label="Transcribe" />
              <span className="tiptap-slash-menu-title">Transcribe</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {captionable && matches("Caption") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => startCaption(editor, editor.state.selection.from))}>
              {/* A video's are its captions, said so; a picture's or an embed's, a caption. */}
              <MenuGlyph label={kindName === "Video" ? "Captions" : thing?.attrs.caption ? "Edit caption" : "Add a caption"} />
              <span className="tiptap-slash-menu-title">{kindName === "Video" ? "Captions" : thing?.attrs.caption ? "Edit caption" : "Add a caption"}</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {imageSrc?.startsWith("haligtree://assets/") && host().saveFileAs && matches("Download") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void host().saveFileAs?.(imageSrc, thing?.attrs.alt ? `${thing.attrs.alt}.${imageSrc.split(".").pop()}` : imageSrc.split("/").pop() ?? "Picture")}>
              <MenuGlyph label="Download" />
              <span className="tiptap-slash-menu-title">Download</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {imageSrc && matches("Copy image") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void copyImage()}>
              <MenuGlyph label="Copy image" />
              <span className="tiptap-slash-menu-title">Copy image</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {recording && matches("Play from start") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-play-start onClick={playFromStart}>
              <MenuGlyph label="Play" />
              <span className="tiptap-slash-menu-title">Play from start</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {fileSrc && host().saveFileAs && matches("Save a copy") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-save-copy onClick={() => void host().saveFileAs?.(fileSrc, String(thing?.attrs.name || "File"))}>
              <MenuGlyph label="Download" />
              <span className="tiptap-slash-menu-title">Save a copy</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {fileSrc && host().openFile && matches("Open in default app") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-open-default onClick={() => void host().openFile?.(fileSrc)}>
              <MenuGlyph label="Open" />
              <span className="tiptap-slash-menu-title">Open in default app</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {kindName && !term ? <div className="tiptap-slash-menu-group">Block</div> : null}

        {thing?.type.name === "table"
          ? TABLE_ACTIONS.filter(([label]) => matches(label)).map(([label, run]) => (
              <DropdownMenuItem key={label} asChild>
                <button type="button" onClick={() => at(() => run(editor))}>
                  <MenuGlyph label={label} />
              <span className="tiptap-slash-menu-title">{label}</span>
                </button>
              </DropdownMenuItem>
            ))
          : null}

        {href && matches("Open link") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => window.open(href)}>
              <MenuGlyph label="Open link" />
              <span className="tiptap-slash-menu-title">Open link</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {href && isWebPage(href) && matches("Open in the reader") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => openArticle(href)}>
              <MenuGlyph label="Open in the reader" />
              <span className="tiptap-slash-menu-title">Open in the reader</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {href && matches("Copy link") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => void navigator.clipboard.writeText(href).then(() => said("Link copied"), () => said("Could not copy the link", false))}>
              <MenuGlyph label="Copy link" />
              <span className="tiptap-slash-menu-title">Copy link</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {matches("Copy") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={copy}>
              <MenuGlyph label="Copy" />
              <span className="tiptap-slash-menu-title">Copy</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {lineable && matches("Copy link to this line") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-copy-line-link onClick={() => void copyLine(false)}>
              <MenuGlyph label="Copy link to this line" />
              <span className="tiptap-slash-menu-title">Copy link to this line</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {lineable && matches("Copy embed of this line") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-copy-line-embed onClick={() => void copyLine(true)}>
              <MenuGlyph label="Copy embed of this line" />
              <span className="tiptap-slash-menu-title">Copy embed of this line</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {matches("Duplicate") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={duplicate}>
              <MenuGlyph label="Duplicate" />
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
            <MenuGlyph label="Color" />
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
              <MenuGlyph label="Delete" />
              <span className="tiptap-slash-menu-title">Delete</span>
              <Kbd>⌫</Kbd>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* Where the note sits in the list beside it (lib/show-in-list.ts). */}
        {show && matches(show.label) ? (
          <DropdownMenuItem asChild>
            <button type="button" data-show-in-list onClick={() => (onOpenChange(false), show.run())}>
              <MenuGlyph label={show.label} />
              <span className="tiptap-slash-menu-title">{show.label}</span>
              {show.keys && <Kbd>{show.keys}</Kbd>}
            </button>
          </DropdownMenuItem>
        ) : null}
        </>)}
        </div>

        {/* As Notion ends its menu: the way out, always in sight under the list. */}
        <button type="button" className="tiptap-menu-close" data-close-menu onClick={() => onOpenChange(false)}>
          <span>Close menu</span>
          <Kbd>esc</Kbd>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
