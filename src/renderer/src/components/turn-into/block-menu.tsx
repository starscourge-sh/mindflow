import { MenuGlyph } from "@/components/ui/menu-icon"
import { useEffect, useRef, useState } from "react"
import { Selection, type Transaction } from "@tiptap/pm/state"
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
import { dockRoom } from "@/lib/dock-room"
import { lookAtSelected } from "@/components/image/image-look"
import { startCaption } from "@/extensions/caption"
import { isAudio, transcribe } from "@/lib/transcribe"
import { BLOCK_COLORS, COLORABLE } from "@/extensions/block-color"
import { host, said } from "@/lib/host"
import { listDirection } from "@/lib/menu-keys"
import { fitToWidth } from "@/lib/table"
import { SpellingRows, type Misspelling } from "./spelling"
import { BLOCK_TYPES, nameBlock } from "@/extensions/block-ids"
import { haligtree } from "@/lib/haligtree"
import { scrollerOf } from "@/lib/note-place"
import { lineUnderMenu } from "@/extensions/meeting"
import { isWebPage, openArticle } from "@/components/pdf/web-reader"
import { canSplit } from "@/lib/split"
import { ClickedRows, type Clicked } from "./clicked"
import { binLetGo, isKept, keepInFiles, letGoSaid, noteTitle, putAtEnd } from "@/lib/media-files"
import { MOVE_TO, duplicatePicked, pickRun, pickedBlocks } from "@/extensions/picked-blocks"
import { blocksOf } from "@/extensions/columns"
import { NodeRangeSelection } from "@tiptap/extension-node-range"
import { isHistoryTransaction } from "@tiptap/pm/history"
import type { JSONContent } from "@tiptap/core"
import { createPortal } from "react-dom"
import { Search } from "@/components/search"
import { refuse, toast } from "@/components/haligtree/ui"
import { markdownOf } from "@/lib/export"
import { chime } from "@/lib/sound"
import { num, plural } from "../../../../main/dates"
import { quoted } from "../../../../main/clip"

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

/** What the menu is titled for the block it is on, in Notion's words: never "Block". */
const KIND_NAMES: Record<string, string> = {
  paragraph: "Paragraph", heading: "Heading", listItem: "List item", taskItem: "Task", bulletList: "List", orderedList: "Numbered list", taskList: "Tasks",
  blockquote: "Quote", callout: "Callout", codeBlock: "Code", table: "Table", horizontalRule: "Divider", columns: "Columns", bookmark: "Link card",
  image: "Picture", youtube: "Video", noteEmbed: "Embedded note", details: "Toggle", math: "Maths", blockMath: "Maths",
}
const kindTitle = (name: string, level?: number): string =>
  name === "heading" && level ? `Heading ${level}` : KIND_NAMES[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (one) => one.toUpperCase())

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
  /** Where a right-click happened: the menu opens there, at the pointer, not at the grip (a whole block's too). */
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
  /** Opened on one of several picked blocks (extensions/picked-blocks.ts): how many, and every line acts on them all. */
  const [many, setMany] = useState(0)
  /** Opened on a picked block (the grip picks its own): the keys a pick answers are shown on their lines. */
  const [keyed, setKeyed] = useState(false)
  const [query, setQuery] = useState("")
  /** "Move to…": the note picker is up for this many picked blocks (the pick is the editor's own while it waits). */
  const [moving, setMoving] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const anchor = useRef<HTMLSpanElement | null>(null)
  // ⇧⌘P on picked blocks asks for the same picker as the line below (extensions/picked-blocks.ts tells the note).
  useEffect(() => {
    if (clickedOnly) return
    const ask = (event: Event): void => void (event.target === editor.view.dom && setMoving(pickedBlocks(editor.state.selection).length))
    window.addEventListener(MOVE_TO, ask, true)
    return () => window.removeEventListener(MOVE_TO, ask, true)
  }, [editor, clickedOnly])
  // Beside the grip in the margin when the margin holds the menu; else under the grip, so it never
  // covers its own line or the list of notes beside the page.
  const gripSide = () => {
    const at = anchor.current, pane = at && scrollerOf(at)
    if (!at || !pane) return "left"
    return at.getBoundingClientRect().left - pane.getBoundingClientRect().left >= 236 ? "left" : "bottom"
  }
  const underFirstLine = () => {
    const at = anchor.current, found = resolve(), dom = found && editor.view.nodeDOM(found.pos)
    if (!at || !(dom instanceof HTMLElement)) return 6
    const top = dom.getBoundingClientRect().top
    const line = parseFloat(getComputedStyle(dom).lineHeight) || 26
    // A picture or card has no line of words: its top is enough to stay clear of.
    const first = dom.matches("p, h1, h2, h3, h4, h5, h6, li") ? top + Math.min(line, dom.getBoundingClientRect().height) : at.getBoundingClientRect().bottom
    return Math.max(6, first - at.getBoundingClientRect().bottom + 6)
  }

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
      setMany(0)
      setQuery("")
      return
    }
    setBlock(targetRef.current)
    const { selection } = editor.state
    const target = targetRef.current
    const picked = pickedBlocks(selection).length
    const holds = !!target && !!picked && target.pos >= selection.from && target.pos < selection.to
    setKeyed(holds)
    setMany(holds && picked > 1 ? picked : 0)
    const id = setTimeout(() => input.current?.focus(), 0)
    // A change to the note while the menu is open (a save, a word typed elsewhere) moves the block with it: the menu
    // still acts on the block it was opened for, and on nothing once that block is gone.
    const follow = ({ transaction }: { transaction: Transaction }): void => {
      if (!transaction.docChanged) return
      setBlock((was) => {
        if (!was) return was
        const { pos, deleted } = transaction.mapping.mapResult(was.pos, 1)
        return deleted ? null : { ...was, pos }
      })
    }
    editor.on("transaction", follow)
    return () => {
      clearTimeout(id)
      editor.off("transaction", follow)
    }
  }, [open, targetRef, editor])

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
    // Several picked: the pick is what every command reads.
    if (many) return void (editor.commands.focus(), run())
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

  const thing = many ? undefined : resolve()?.node
  // A picture or a file kept in the book's own store: it can stay in Files without a note, or go to the Bin with it.
  const stored = (thing?.type.name === "image" || thing?.type.name === "attachment") && /^(haligtree|mindflow):\/\/assets\//.test(String(thing.attrs.src ?? "")) ? String(thing.attrs.src) : null
  const storedWhat = thing?.type.name === "image" ? "Picture" : "File"
  const kept = stored ? isKept(stored) : false
  /** Whether the note still holds this file somewhere else, after one copy of it is taken out. */
  const stillHolds = (src: string): boolean => {
    let found = false
    editor.state.doc.descendants((node) => { if (node.attrs?.src === src) found = true; return !found })
    return found
  }
  const undoRemove = () => void editor.chain().focus().undo().run()

  /**
   * Is there a line of text here to turn into something else?
   *
   * Asking whether the block is an atom was a proxy for this, and it was only
   * ever right about images. A table is not an atom either, so it was offered
   * nine conversions that all act on whatever cell the cursor lands in. The
   * question is what the block holds: text, or other blocks.
   */
  const convertible = (many ? pickedBlocks(editor.state.selection).map((one) => one.node) : thing ? [thing] : []).some((one) =>
    one.isTextblock || ["listItem", "taskItem", "blockquote"].includes(one.type.name))
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
  const captionable =!!thing && !recording && ["image", "youtube", "attachment", "graph"].includes(thing.type.name)
  /** A file block's own name for itself, the heading its own actions sit under, as Notion's menu does. */
  const fileName = String(thing?.attrs.name || thing?.attrs.src || "")
  const kindName: string | null = recording ? "Voice note"
    : thing?.type.name === "meeting" ? "Recording"
    : thing?.type.name === "image" ? "Picture"
    : thing?.type.name === "graph" ? "Graph"
    : thing?.type.name !== "attachment" ? null
    : /\.(mp4|m4v|mov|webm)$/i.test(fileName) ? "Video"
    : /\.pdf$/i.test(fileName) ? "PDF"
    : "File"
  const fileSrc: string | undefined = thing?.type.name === "attachment" ? thing.attrs.src : undefined
  const isMeeting = thing?.type.name === "meeting"
  /** "Fix this line" chosen: the line to open once the menu is gone. */
  const fixAfter = useRef<string | null>(null)
  /** The meeting line right-clicked, when the menu is a meeting's. */
  const meetingLine = isMeeting ? lineUnderMenu() : null
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
    // Several picked: each that holds a colour takes it (block-color.ts colours the pick).
    if (many) return pickedBlocks(editor.state.selection).some((one) => COLORABLE.includes(one.node.type.name))
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
    if (many) return void (duplicatePicked(editor.view), editor.commands.focus())
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
    if (many) editor.commands.focus()
    else if (found) editor.chain().focus().setNodeSelection(found.pos).run()
    else return
    const done = document.execCommand("copy")
    said(done ? (many ? `${many} blocks copied` : "Block copied") : "Could not copy it", done)
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
      ? await window.api.captures.get(id).then((one) => one && { link: id, title: one.label || one.title || "New note" })
      : await haligtree.item(id).then((one) => one && { link: `${one.tier}:${id}`, title: one.title || "New note" })
    if (!block || !note) return said("Could not copy it", false)
    const text = `${embed ? "!" : ""}[[@${note.link}#^${block}|${note.title.replace(/[[\]|\n]+/g, " ").trim().slice(0, 80)}]]`
    await navigator.clipboard.writeText(text).then(
      () => said(embed ? "Copied: paste it in any note to show this block there, live" : "Link to block copied: paste it in any note"),
      () => said("Could not copy it", false),
    )
  }

  /** Delete by range: `deleteNode` looks for an ancestor and misses atoms. */
  const remove = () => {
    if (many) return void editor.chain().focus().deleteSelection().run()
    const found = resolve()
    if (!found) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: found.pos, to: found.pos + found.node.nodeSize })
      .run()
  }

  /** "Move to…" chosen: the block the menu is on picked as blocks are (several are already), then the note asked for. */
  const askMove = () => {
    const found = many ? null : resolve()
    if (found) editor.view.dispatch(editor.state.tr.setSelection(pickRun(editor.state.doc, found.pos, found.pos)))
    setMoving(many || 1)
  }

  /**
   * The picked blocks at the end of the note picked, and gone from here: one step, whichever Undo takes it back (the
   * notice's, ⌘Z here, or ⌘Z away from the note), both notes back as they were.
   */
  const moveTo = async (type: string, id: string): Promise<void> => {
    setMoving(0)
    const { selection, doc } = editor.state
    if (!(selection instanceof NodeRangeSelection)) return void refuse("Nothing is picked to move: pick the blocks again")
    if (String(documentId ?? "") === `${type === "capture" || type === "day" ? type : "item"}-${id}`) return void refuse("They are in that note already: pick another note")
    const count = pickedBlocks(selection).length
    const content = blocksOf(doc, selection.from, selection.to)
    const blocks = content.toJSON() as JSONContent[]
    const [title, putBack] = await Promise.all([noteTitle(type, id), putAtEnd(type, id, blocks, markdownOf(editor, { type: "doc", content: blocks }), count === 1 ? "A block goes" : "Blocks go")])
    if (!putBack) return
    const there = quoted(title || "New note", 41)
    /** The other note as it was, said plainly when it could not be written. */
    const takeBack = (then: () => void): void => void putBack().then(then, () => refuse(`Could not take them out of ${there} again: they are in both notes`, "error"))
    // Changed while the other note was written (closed, or the pick let go): that note is put back, nothing moves.
    const now = editor.isDestroyed ? null : editor.state.selection
    if (!(now instanceof NodeRangeSelection) || !blocksOf(editor.state.doc, now.from, now.to).eq(content)) return takeBack(() => refuse("The picked blocks changed before they could move: nothing moved"))
    const before = editor.state.doc
    editor.chain().focus().deleteSelection().run()
    const after = editor.state.doc
    // Taken back here (⌘Z, or the notice's Undo below): out of the other note too, once.
    const back = ({ transaction }: { transaction: Transaction }): void => {
      if (!transaction.docChanged || !isHistoryTransaction(transaction) || !editor.state.doc.eq(before)) return
      editor.off("transaction", back)
      takeBack(() => chime("undo"))
    }
    editor.on("transaction", back)
    chime("noted")
    toast(`Moved ${count === 1 ? "the block" : plural(count, "block")} to ${there}`, () => {
      // Closed since: its own Undo went with it, so the blocks stay where they went rather than be lost.
      if (editor.isDestroyed) return void refuse(`This note was closed: the blocks stay in ${there}`)
      // Written on since: the blocks come back at the note's end, and the other note is put back as it was.
      if (editor.state.doc.eq(after)) return void editor.commands.undo()
      editor.off("transaction", back)
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, blocks).run()
      takeBack(() => chime("undo"))
    }, "success", { label: "Open", key: "O", run: () => window.api.openInHome(type, id) })
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

  // A picture right-clicked is its block: one menu, the same however it opens (a right-click, the grip),
  // its own lines first and the block's after, never its lines on top and the rest folded under a second "Picture ›"
  // (tracker: "what is the reasoning for the differentiation").
  const itself = !clickedOnly && clicked?.kind === "picture" && !!imageSrc
  const apart = itself ? null : clicked
  /**
   * Under a clicked thing (a link, a PDF page), the block's own lines fold into one "Block ›" row:
   * the menu is about what was clicked, and the line it sits in is one step away. A filter shows them all, flat.
   */
  const underClicked = (rows: React.ReactNode): React.ReactNode =>
    apart && !term ? (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-block-sub>
          <MenuGlyph label="Block" />
          <span className="tiptap-slash-menu-title">{title}</span>
          <span className="tiptap-slash-menu-hint">&rsaquo;</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="tiptap-block-menu tiptap-block-menu-sub">
          <div className="tiptap-block-menu-list mf-more">{rows}</div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : rows

  /** What it is titled for: the block it is on in Notion's words ("Link card", "Picture", "Paragraph"), or "3 blocks". */
  const title = many ? `${many} blocks` : kindName ?? (thing ? kindTitle(thing.type.name, Number(thing.attrs.level) || undefined) : "")
  // Measured only while open: worked out on every draw of every note, it read the page's layout each time.
  const grip = open && !point ? gripSide() : "left"
  // Quick capture's card, which its picker is drawn on and no further.
  const card = moving ? editor.view.dom.closest<HTMLElement>(".app-container") : null
  return (
    <>
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
            anchor.current = node
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
        // From the grip it opens beside it in the margin (gripSide), never over the line it acts on;
        // a right-click opens at the pointer, as on the Mac.
        side={point ? "right" : grip}
        // Under the block's FIRST line, attached to what was pressed: that line stays clear, and a tall block (a link card,
        // a picture, a long paragraph) is covered below it, as Notion's is. Under the whole block it stood a card's height
        // from the grip (21 Nov). With no room under it, Radix turns it upward.
        sideOffset={!point && grip === "bottom" ? underFirstLine() : 6}
        // From the grip, the note's own pane is its edge, never the list of notes beside it; at the pointer, the window.
        collisionBoundary={open && !point ? scrollerOf(editor.view.dom) : undefined}
        // The "Add a thought…" bar's top is the window's foot (dock-room.ts): low on the page, the menu goes up.
        collisionPadding={{ top: 8, right: 8, left: 8, bottom: open ? dockRoom() : 8 }}
        className="tiptap-block-menu"
        // Closing hands focus back to the anchor by default, which took it
        // straight out of a caption just opened from here (an empty caption
        // goes when it loses focus). The action that ran keeps its focus.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (fixAfter.current) {
            window.dispatchEvent(new CustomEvent("haligtree:meeting-fix", { detail: { id: fixAfter.current, editor } }))
            fixAfter.current = null
            return
          }
          // What it ran asks for words ("Edit formula…", "Edit link"): that field keeps the keys (quietClose hands it the focus).
          // The editor's focus lands a frame later, so asked for here it took the keys back from the field.
          if (document.querySelector("[data-ask], [data-name-in-place], [data-sure], [data-link-editor]")) return
          // Closed without an action (Escape, a click away): back to the note.
          if (!document.activeElement || document.activeElement === document.body) editor.commands.focus()
        }}
      >
        <input
          ref={input}
          type="text"
          placeholder="Search actions…"
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
            // Radix walks the rows only once one of them has the keys: from the search field ↓ and ↑ did nothing,
            // so the rows (and "Spelling ›") could not be reached by keys. Hand the keys to the first or last row.
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const rows = event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])')
              const to = rows?.[event.key === "ArrowDown" ? 0 : rows.length - 1]
              if (to) {
                event.preventDefault()
                to.focus()
              }
              return
            }
            if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
              event.stopPropagation()
            }
          }}
        />

        <div className="tiptap-block-menu-list mf-more">
        {/* A misspelt word: its fixes one step away under "Spelling ›", so the block's own lines stay where they always are. */}
        {spelling && !term ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-spelling-sub>
                <MenuGlyph label="Spelling" />
                <span className="tiptap-slash-menu-title">Spelling</span>
                <span className="tiptap-slash-menu-hint">&rsaquo;</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="tiptap-block-menu tiptap-block-menu-sub">
                <div className="tiptap-block-menu-list mf-more"><SpellingRows editor={editor} spelling={spelling} titled={false} /></div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}

        {/* What the click landed on first; the block's lines after, so nothing is lost. */}
        {apart ? <ClickedRows editor={editor} clicked={apart} matches={matches} onDone={() => onOpenChange(false)} /> : null}

        {/* A note with no block handles (read-only, a card, a sticky): the clicked thing's lines alone. */}
        {clickedOnly ? null : underClicked(<>
        {/* Filtered, its conversions are found flat with the rest; otherwise they wait in "Turn into ›", after the actions. */}
        {convertible && term ? conversionRows : null}

        {term ? null : <div className="tiptap-slash-menu-group" data-kind-heading={title}>{title}</div>}


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
        {/* A meeting's recording let go, its words kept (meeting-page.tsx does it, with Undo). */}
        {/* The meeting line right-clicked, its words opened to fix a misheard word (meeting-page.tsx); its time and voice stay. */}
        {meetingLine && editor.isEditable && matches("Fix this line") ? (
          <DropdownMenuItem asChild>
            {/* Opened once the menu has closed and let go of the focus, so the line's words keep it. */}
            <button type="button" data-meeting-fix-line onClick={() => void (fixAfter.current = meetingLine)}>
              <MenuGlyph label="Fix this line" />
              <span className="tiptap-slash-menu-title">Fix this line</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {thing?.type.name === "meeting" && thing.attrs.audio && editor.isEditable && matches("Delete the recording, keep the words") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-meeting-drop-audio onClick={() => at(() => window.dispatchEvent(new CustomEvent("haligtree:meeting-drop-audio", { detail: editor })))}>
              <MenuGlyph label="Delete the recording, keep the words" />
              <span className="tiptap-slash-menu-title">Delete the recording, keep the words</span>
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
        {/* One word with the picture's bar and Notion's menu, and its key (extensions/caption.ts). */}
        {captionable && matches("Caption") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-caption-line onClick={() => at(() => startCaption(editor, editor.state.selection.from))}>
              <MenuGlyph label="Caption" />
              <span className="tiptap-slash-menu-title">Caption</span>
              <span className="tiptap-slash-menu-hint">⌥⌘M</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {imageSrc?.startsWith("haligtree://assets/") && host().saveFileAs && matches("Save a copy") ? (
          <DropdownMenuItem asChild>
            {/* One name with a file's and the picture toolbar's: "Save a copy", never "Download" in one place and that in another. */}
            <button type="button" data-save-copy onClick={() => void host().saveFileAs?.(imageSrc, thing?.attrs.alt ? `${thing.attrs.alt}.${imageSrc.split(".").pop()}` : imageSrc.split("/").pop() ?? "Picture")}>
              <MenuGlyph label="Download" />
              <span className="tiptap-slash-menu-title">Save a copy</span>
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
        {/* Open in the default app (a copy), among the picture's own lines. */}
        {/* Opened from the grip, the same lines as from a right-click on the picture. */}
        {itself && clicked ? <ClickedRows within editor={editor} clicked={clicked} matches={matches} onDone={() => onOpenChange(false)} />
          : !clicked && imageSrc ? <ClickedRows within editor={editor} clicked={{ kind: "picture", src: imageSrc }} matches={matches} onDone={() => onOpenChange(false)} /> : null}

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
        {fileSrc && host().openFile && matches("Open in the default app") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-open-default onClick={() => void host().openFile?.(fileSrc, String(thing?.attrs.name || ""))}>
              <MenuGlyph label="Open in the default app" />
              <span className="tiptap-slash-menu-title">Open in the default app</span>
            </button>
          </DropdownMenuItem>
        ) : null}

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

        {/* A row of columns: each column a card of its own, or plain again ("Cards in a row" in the slash menu). */}
        {thing?.type.name === "columns" && matches(thing.attrs.look === "cards" ? "Show as plain columns" : "Show as cards") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => at(() => {
              const found = resolve()
              if (found) editor.view.dispatch(editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, look: found.node.attrs.look === "cards" ? null : "cards" }))
            })}>
              <MenuGlyph label={thing.attrs.look === "cards" ? "Show as plain columns" : "Show as cards"} />
              <span className="tiptap-slash-menu-title">{thing.attrs.look === "cards" ? "Show as plain columns" : "Show as cards"}</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* A link card back to a plain link in its line, its title the words (Notion's "Turn into link"). */}
        {href && thing?.type.name === "bookmark" && editor.isEditable && matches("Turn into link") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-turn-into-link onClick={() => {
              const found = resolve()
              if (!found) return
              const words = String(found.node.attrs.title || href)
              editor.chain().focus().insertContentAt({ from: found.pos, to: found.pos + found.node.nodeSize }, { type: "paragraph", content: [{ type: "text", text: words, marks: [{ type: "link", attrs: { href } }] }] }).run()
            }}>
              <MenuGlyph label="Link it" />
              <span className="tiptap-slash-menu-title">Turn into link</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {href && matches("Open in the browser") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => window.open(href)}>
              <MenuGlyph label="Open in the browser" />
              <span className="tiptap-slash-menu-title">Open in the browser</span>
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

        {/* Beside the note the card is in, as ⌥-click on the card's book does. */}
        {href && isWebPage(href) && canSplit() && matches("Open in the reader to the side") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={() => openArticle(href, undefined, "aside", editor.view.dom.closest("[data-pane]")?.getAttribute("data-pane"))}>
              <MenuGlyph label="Open in the reader to the side" />
              <span className="tiptap-slash-menu-title">Open in the reader to the side</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* Notion's words: "Copy link" is the card's own address, "Copy link to block" a link to the block in this note. */}
        {href && matches("Copy link") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-copy-link onClick={() => void navigator.clipboard.writeText(href).then(() => said("Link copied"), () => said("Could not copy the link", false))}>
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
              {keyed ? <span className="tiptap-slash-menu-hint">⌘C</span> : null}
            </button>
          </DropdownMenuItem>
        ) : null}

        {lineable && matches("Copy link to block") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-copy-line-link onClick={() => void copyLine(false)}>
              <MenuGlyph label="Copy link to block" />
              <span className="tiptap-slash-menu-title">Copy link to block</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {lineable && matches("Copy embed of block") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-copy-line-embed onClick={() => void copyLine(true)}>
              <MenuGlyph label="Copy embed of block" />
              <span className="tiptap-slash-menu-title">Copy embed of block</span>
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* A meeting is one of a kind: never two of it in a note, never taken out by a key (extensions/meeting.ts). */}
        {!isMeeting && matches("Duplicate") ? (
          <DropdownMenuItem asChild>
            <button type="button" onClick={duplicate}>
              <MenuGlyph label="Duplicate" />
              <span className="tiptap-slash-menu-title">Duplicate</span>
              {keyed ? <span className="tiptap-slash-menu-hint">⌘D</span> : null}
            </button>
          </DropdownMenuItem>
        ) : null}

        {/* Notion's "Move to": another note, picked from the notes' own search. */}
        {!isMeeting && editor.isEditable && matches("Move to…") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-move-to onClick={askMove}>
              <MenuGlyph label="Move to…" />
              <span className="tiptap-slash-menu-title">Move to…</span>
              {keyed ? <span className="tiptap-slash-menu-hint">⇧⌘P</span> : null}
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

        {/* The actions first, as Notion and Craft have them; the block's other shapes are one step away. */}
        {convertible && !term ? (
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

        {stored && editor.isEditable && matches("Keep in Files") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-keep-in-files aria-checked={kept} role="menuitemcheckbox" onClick={() => at(() => void keepInFiles(stored, !kept))}>
              <MenuGlyph label="Keep in Files" />
              <span className="tiptap-slash-menu-title">Keep in Files</span>
              <span className="tiptap-slash-menu-hint">{kept ? "On" : "Off"}</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {stored && editor.isEditable && matches("Remove from note") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-remove-from-note onClick={() => at(() => (remove(), letGoSaid(stored, storedWhat, undoRemove)))}>
              <MenuGlyph label="Remove from note" />
              <span className="tiptap-slash-menu-title">Remove from note</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {stored && editor.isEditable && matches("Remove and move to the Bin") ? (
          <DropdownMenuItem asChild>
            <button type="button" data-remove-to-bin onClick={() => at(() => (remove(), void binLetGo(stored, storedWhat, stillHolds(stored), undoRemove)))}>
              <MenuGlyph label="Remove and move to the Bin" />
              <span className="tiptap-slash-menu-title">Remove and move to the Bin</span>
            </button>
          </DropdownMenuItem>
        ) : null}
        {!isMeeting && !stored && matches("Delete") ? (
          <DropdownMenuItem asChild>
            <button
              type="button"
              onClick={() =>
                remove()
              }
            >
              <MenuGlyph label="Delete" />
              <span className="tiptap-slash-menu-title">Delete</span>
              {keyed ? <span className="tiptap-slash-menu-hint">⌫</span> : null}
            </button>
          </DropdownMenuItem>
        ) : null}

        </>)}
        </div>

      </DropdownMenuContent>
    </DropdownMenu>
    {/* "Move to…": the notes' own search as the picker, as "Put in a note…" asks (media-view.tsx); in quick capture, on its card, as its own ⌘K was. */}
    {moving ? createPortal(
      <Search
        menus={false}
        inCard={!!card}
        placeholder={moving === 1 ? "Move the block to which note?" : `Move ${num(moving)} blocks to which note?`}
        onClose={() => (setMoving(0), editor.commands.focus())}
        onOpen={(type, id) => void moveTo(type, id)}
      />,
      card ?? document.body,
    ) : null}
    </>
  )
}
