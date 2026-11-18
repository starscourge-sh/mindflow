"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { afterPaint } from "@/lib/haligtree"
import { createPortal } from "react-dom"
import { type Attributes, type Extensions, type JSONContent } from "@tiptap/core"
import { Fragment, Slice } from "@tiptap/pm/model"
import { NodeSelection, Selection as PMSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { pressUnderLastLine } from "@/lib/press-under"
import { edgeScroll } from "@/lib/edge-scroll"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { EditorContext, useEditor } from "@tiptap/react"
import { EditorSurface, holdViews } from "@/components/haligtree/editor-surface"
import { followLink, followPdfLink, isReadable } from "@/components/pdf/pdf-reader"
import { canSplit } from "@/lib/split"
import { PLACED, sentElsewhere, useNotePlace } from "@/lib/note-place"
import { afterLayout } from "@/lib/after-layout"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Markdown } from "@tiptap/markdown"
import { Marked, type marked } from "marked"
import { Image } from "@tiptap/extension-image"
import { ListItem, TaskItem, TaskList } from "@tiptap/extension-list"
import { isToDoList, toDoState } from "@/lib/pasted-todos"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection, CharacterCount, Placeholder } from "@tiptap/extensions"
import { BlockFormula, InlineFormula } from "@/extensions/math"
import { tidyPastedHtml } from "@/lib/paste-tidy"
import { FindAndReplace } from "@tiptap/extension-find-and-replace"

// TableKit bundles Table, TableRow, TableHeader and TableCell.
import { Table, TableKit } from "@tiptap/extension-table"
import { Youtube } from "@tiptap/extension-youtube"
import { YoutubeView } from "@/components/haligtree/youtube-view"
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details"
import { DragHandle } from "@tiptap/extension-drag-handle-react"
import { computePosition, offset } from "@floating-ui/react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { ReactNodeViewRenderer, type Editor } from "@tiptap/react"
import { lowlight, whenGrammars } from "@/lib/lowlight"
import { setHost, type HaligtreeHost } from "@/lib/host"
import { currentVim, onVimChange } from "@/lib/vim"
import { vimPluginKey } from "@/extensions/vim-mode"
import { cue } from "@/lib/cues"
import { byKeys } from "@/lib/motion"
import "katex/dist/katex.min.css"

// --- Extensions ---
import { ObsidianShortcuts } from "@/extensions/obsidian-shortcuts"
import { VimMode, VimTabStays } from "@/extensions/vim-mode"
import { TAGS, Tokens, type TokenMatch, type TokenPattern } from "@/extensions/tokens"
import { SlashCommand } from "@/extensions/slash-command"
import { ToggleHeading, headingRank } from "@/extensions/toggle-heading"
import { HeadingFold } from "@/extensions/heading-fold"
import { ImageDrop } from "@/extensions/image-drop"
import { DragOut } from "@/extensions/drag-out"
import { ImagePlaceholder } from "@/extensions/image-placeholder"
import { ObsidianEmbeds, readInLine } from "@/extensions/obsidian-embeds"
import { GripLetsGo } from "@/extensions/grip-lets-go"
import { BlockColor } from "@/extensions/block-color"
import { JoinLists } from "@/extensions/join-lists"
import { OutdentLists } from "@/extensions/outdent-lists"
import { UnwrapBareLists } from "@/extensions/unwrap-bare-lists"
import { TabStays } from "@/extensions/tab-stays"
import { PlainCopy } from "@/extensions/plain-copy"
import { CurrentItem } from "@/extensions/current-item"
import { FullLineHighlight } from "@/extensions/full-line-highlight"
import { LineCards } from "@/extensions/line-cards"
import { PropertyLines } from "@/extensions/property-lines"
import { BlockRoom } from "@/extensions/block-room"
import { LinkedTasks } from "@/extensions/linked-tasks"
import { DateWords } from "@/extensions/date-words"
import { OfferSlot } from "@/extensions/offer-slot"
import { TaskMarks } from "@/extensions/task-marks"
import { Kept } from "@/extensions/kept"
import { TaskLinkMenu } from "@/components/haligtree/task-link-menu"
import { CardLink } from "@/extensions/card-link"
import { AutoCard } from "@/extensions/auto-card"
import { SelectedNodes } from "@/extensions/selected-nodes"
import { PickedBlocks, pickFromGrip } from "@/extensions/picked-blocks"
import { BlockControls } from "@/extensions/block-controls"
import { BlockGestures } from "@/extensions/block-gestures"
import { Bookmark } from "@/extensions/bookmark"
import { Callout } from "@/extensions/callout"
import { Caption, captioned } from "@/extensions/caption"
import { Column, Columns, draggedOf, dropBeside, moveBlocks } from "@/extensions/columns"
import { Attachment } from "@/extensions/attachment"
import { Meeting, MeetingLine } from "@/extensions/meeting"
import { ExcalidrawDiagram } from "@/extensions/excalidraw"
import { Graph } from "@/extensions/graph"
import { ContentsBlock } from "@/extensions/contents-block"
import { Calc } from "@/extensions/calc"
import { Collect, CollectPill } from "@/extensions/collect"
import { TypePause } from "@/extensions/type-pause"
import { markdownToDocument } from "@/lib/markdown-doc"
import { liftBlocks } from "@/lib/lift-blocks"
import { FootnoteKit } from "@/extensions/footnotes"
import { Citation } from "@/extensions/citation"
import { LongDocument } from "@/extensions/long-document"
import { LINES, LineNumbers } from "@/extensions/line-numbers"
import { codeColours } from "@/extensions/code-colours"
import { Typewriter } from "@/extensions/typewriter"
import { useStoredFlag } from "@/lib/use-stored-flag"

/** Every mark the editor can register. */
type MarkName =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "underline"
  | "link"
  | "highlight"
  | "superscript"
  | "subscript"

const ALL_MARKS: MarkName[] = [
  "bold",
  "italic",
  "strike",
  "code",
  "underline",
  "link",
  "highlight",
  "superscript",
  "subscript"
]

/**
 * What a single line carries by default.
 *
 * A title is not a place for a highlight or a superscript, and leaving them
 * registered means they arrive anyway: by shortcut, by markdown as you type, or
 * by pasting. Unregistering is the only way to actually keep them out.
 */
const LINE_MARKS: MarkName[] = ["bold", "italic", "strike", "code"]

/** How long typing has to stop before the document is handed to the caller. */
const SAVE_DEBOUNCE_MS = 500

/**
 * A table, drawn from the first moment by the view its column-resizing plugin gives it. TipTap leaves a resizable
 * table to that plugin, whose view arrives only with the plugins, after the note is first drawn: ProseMirror read a
 * new kind of view arriving as every block's look changing, and drew the whole note again, every note on every open
 * whether it held a table or not (the largest, 7,018 blocks, made twice as it opened, 0.2 to 0.6 s each). The same
 * view, given first, changes nothing when the plugins arrive. Not resizable (read-only): TipTap's own.
 */
const TableDrawnFirst = Table.extend({
  addNodeView() {
    const { View, cellMinWidth, resizable } = this.options
    if (!resizable || !this.editor.isEditable || !View) return this.parent?.() ?? null
    return ({ node, view }) => new View(node, cellMinWidth, view)
  },
})

/** Where an open "/" search sits on the page, or null with none open (the "/" menu's plugin wears the default key). */
const slashOpen = (state: EditorState): { from: number; to: number } | null => {
  const open = SuggestionPluginKey.getState(state) as { active?: boolean; range?: { from: number; to: number } } | undefined
  return open?.active && open.range ? open.range : null
}
/**
 * The page as it is kept: while a "/" search is open, its "/query" is a search for a block and not yet words of the
 * note, so it stays out of what is handed on to be saved. A note takes its name from its first line, and with "/"
 * typed there it was named "/" in its tab, its list row and Recent for as long as the menu was up. Once the menu
 * closes, whatever is left on the page is the note's words (and is handed on: see the editor's transaction watch).
 */
export const keptDoc = (state: EditorState): ProseMirrorNode => {
  const open = slashOpen(state)
  return open ? state.tr.delete(open.from, open.to).doc : state.doc
}

/** How long the handle stays up after the pointer leaves a block. */
const HANDLE_GRACE_MS = 1000

/** The three kinds of list, and the items they hold. */
const LISTS = ["bulletList", "orderedList", "taskList"]
const LIST_ITEMS = ["listItem", "taskItem"]

// The caret keeps about a third of the view above and below it, so what you
// are writing sits near the middle rather than at an edge. A third of the
// capture box at its full size, even when it opens short.
const third = Math.round((typeof window === "undefined" ? 600 : Math.max(600, window.innerHeight)) * 0.32)
/**
 * Keep the caret clear of the window edges when an edit scrolls it into view.
 * The bottom figure has to clear the fixed toolbar, which otherwise covers the
 * very strip ProseMirror scrolls the caret into.
 */
/** Set on the transaction that paints code again once the grammars have arrived. */
const GRAMMARS = "mf:grammars"
const CARET_MARGIN = { top: Math.max(64, third), right: 0, bottom: Math.max(112, third), left: 0 }

/**
 * Held still on purpose. `DragHandle` re-registers its ProseMirror plugin when
 * its props change, and registering a plugin destroys every plugin view in the
 * editor - which closed the `/` and `@` menus mid-typing.
 */
const HANDLE_NESTING = {
  rules: [
    {
      id: "detailsParts",
      // A column is only ever moved by what is in it.
      evaluate: ({ node }: { node: { type: { name: string } } }) =>
        ["detailsSummary", "detailsContent", "column"].includes(node.type.name) ? 1000 : 0,
    },
    {
      // A table carries its own row and column grips, and a cell's paragraph
      // is not separately draggable - pulling one out only breaks the table.
      // A rule returns a deduction, so this leaves the table itself as the
      // cheapest candidate and the handle points at the whole thing.
      id: "tableParts",
      // Strictly ABOVE this candidate, not above the pointer. `$pos` is the
      // position under the cursor and every candidate shares it, so asking it
      // about ancestors excluded the table along with its own cells and left
      // nothing to point at. The table has no table above it; its rows, cells
      // and their paragraphs all do.
      evaluate: ({ $pos, depth }: { $pos: ResolvedPos; depth: number }) => {
        for (let above = depth - 1; above > 0; above -= 1) {
          if ($pos.node(above).type.name === "table") return 1000
        }
        return 0
      },
    },
  ],
  // The default prefers the parent whenever the pointer is within 12px of a
  // child's left edge, which is exactly the way to that child's handle.
  edgeDetection: "none" as const,
}

/** Text that says it is Markdown: a heading, a list, a quote, a fence, a table, a rule, maths, a link, bold. */
const MARKDOWN_SIGNS = /^(#{1,6} |\s*[-*+] |\s*\d+[.)] |> ?|```|~~~|\|.*\|\s*$|(---|\*\*\*|___)\s*$|\$\$|:::\w|<!-- columns(?: cards)? -->)|\[\[|\*\*\S|\]\(|!\[|\[\^[^\]\s]+\]|\^\[/m

/**
 * The handle never stands over a line's number (extensions/line-numbers.ts): where its place would cross them, it
 * goes to the left of them, and where the + and the grip together have no room there, the grip goes alone, as on
 * a narrow page (haligtree-editor.scss, `data-tight`).
 */
const clearOfLines = {
  name: "clearOfLines",
  fn: ({ rects, elements }: { rects: { reference: { x: number } }; elements: { reference: unknown; floating: HTMLElement } }) => {
    const floating = elements.floating
    const wrapper = floating.closest(".haligtree-editor-wrapper")
    const lines = wrapper?.querySelector<HTMLElement>(".mf-lines")
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const [full, slim, room] = [3 * rem, 1.5 * rem, 4]
    // No numbers: its own place, at its full width even when it was slim a moment ago (measured slim, it sat 1.5rem off).
    if (!wrapper || !lines?.childElementCount) return floating.hasAttribute("data-tight") ? (floating.removeAttribute("data-tight"), { x: rects.reference.x - full - 24 }) : {}
    // From the handle's own coordinates to the window's, and back.
    const shift = (elements.reference as Element).getBoundingClientRect().left - rects.reference.x
    const column = lines.getBoundingClientRect()
    const left = rects.reference.x - full - 24 + shift
    if (left >= column.right + room || left + full <= column.left - room) return (floating.removeAttribute("data-tight"), { x: left - shift })
    const tight = column.left - room - full < wrapper.getBoundingClientRect().left + room
    floating.toggleAttribute("data-tight", tight)
    return { x: column.left - room - (tight ? slim : full) - shift }
  },
}
// The plugin's own defaults (left-start, absolute) spelled out, so the handle placed again beside the numbers
// (LINES, below) is placed exactly as the plugin places it.
const HANDLE_POSITION = { placement: "left-start" as const, strategy: "absolute" as const, middleware: [offset({ mainAxis: 24, crossAxis: 2 }), clearOfLines] }

/**
 * Anything floating over the editor that moves on its own keys.
 *
 * Its own copy rather than a shared one: the host has a list like this for its
 * pickers, and this file may not reach into the app around it.
 */
const MENU_OPEN = "[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup"
/** The same, a suggestion menu counted only while it shows rows. */
const MENU_SHOWING = "[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup:not(:empty)"

// --- UI Primitives ---
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { Document } from "@tiptap/extension-document"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { clip } from '../../../../main/clip'
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { LinkToBookmarkButton } from "@/components/bookmark/link-to-bookmark-button"
import { SelectionMenu } from "@/components/selection/selection-menu"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
} from "@/components/tiptap-ui/color-highlight-popover"
import { MarkDropdownMenu } from "@/components/tiptap-ui/mark-dropdown-menu"
import { TextAlignDropdownMenu } from "@/components/tiptap-ui/text-align-dropdown-menu"
import { MarkMenu } from "./sub-menu"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { SearchBar } from "@/components/search/search-bar"
import { TableMenu } from "@/components/table/table-menu"
import { TableControls } from "@/components/table/table-controls"
import { BlockMenu, type BlockTarget } from "@/components/turn-into/block-menu"
import { SpellingMenu, misspeltSoon, passedOn, rightClickOnWords, type Misspelling } from "@/components/turn-into/spelling"
import { clickedAt, lookUpIn, type Clicked } from "@/components/turn-into/clicked"
import { BookOpenText, Plus } from "lucide-react"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import { hideForMenus, menuShowing } from "@/lib/menu-showing"
import { SpellPill } from "@/components/turn-into/spell-pill"
import { WordCount } from "@/components/count/word-count"
import { WordAim } from "@/components/count/word-aim"
import { TableOfContents } from "@/components/toc/table-of-contents"
import { OutlineKeys, goToHeading } from "@/components/toc/headings"
import { SourceView } from "@/components/source/source-view"
import { NoteLink, kindsAsked, onKindsAsked, showingDocument, takePendingHeading, type NoteLinkOptions } from "@/extensions/note-link"
import { useReading } from "@/lib/reads-in"
import { BlockIds } from "@/extensions/block-ids"
import { LinkTidy, looksLikeAddress } from "@/extensions/link-tidy"
import { LinkButtons, LinkEditor } from "./link-editor"
import { NoteEmbed } from "@/extensions/note-embed"
import { embedRenderer, noteLinkRenderer, tagRenderer, wikiRenderer } from "@/components/note-link/note-link-menu"
import { ImageMenu } from "@/components/image/image-menu"
import { ImageLook } from "@/components/image/image-look"
import { holdPlace, webWhy } from "@/lib/pictures"
import { codeBlockNodeView } from "@/components/code/code-block-node-view"
import { slashRenderer } from "@/components/slash/slash-menu"
import { slashItems, slashMedia } from "@/components/slash/slash-items"
import { EmojiSuggestion } from "@/components/emoji/emoji-suggestion"
import { SuggestionPluginKey } from "@tiptap/suggestion"
import { UndoExact, notOnUndo } from "@/lib/undo-exact"

// Undo brings back a link as it was: the words it puts back are not linked anew (lib/undo-exact.ts).
const Kit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((one) => (one.name === "link" ? one.extend({ addProseMirrorPlugins() { return (this.parent?.() ?? []).map(notOnUndo) } }) : one))
  },
})

// --- Styles ---
// The tokens every rule below reads, and the keyframes the menus animate with.
// They travel with the component rather than with the app around it.
import "@/assets/styles/_variables.scss"
import "@/assets/styles/_keyframe-animations.scss"
import "@/components/haligtree/haligtree-editor.scss"
import { GripVertical } from '@/components/ui/icons'
import { BackToTop } from '@/components/haligtree/ui'
import { domOf, useEditorDom } from '@/lib/editor-dom'
import { gripOn, installBlockCarry } from '@/lib/block-carry'
import { markdownOf } from '@/lib/export'

// A block carried by its grip, in the one look every carry has (lib/block-carry.tsx, components/haligtree/carry.tsx).
installBlockCarry()

/** The page's document editors, any of which can read Markdown for `readMarkdown`. */
/** Editors whose Markdown is already laid in: a view mounted again keeps what was typed since. */
const laidIn = new WeakSet<object>()
const readers = new Set<Editor>()

/**
 * The editor's own element skips a write that changes nothing.
 *
 * ProseMirror writes every attribute of it again whenever it rebuilds its view
 * of the note: when tiptap hands it the node views as a note opens, and when it
 * takes them away again as the note's page goes. Chromium takes contenteditable
 * written, even to the value it already had, as a new editing host and works
 * out the whole note again: about 22ms each time on a long note, twice for
 * every note opened, a third of the open.
 */
function quietAttributes(dom: HTMLElement): void {
  const write = dom.setAttribute
  dom.setAttribute = (name: string, value: string): void => {
    if (dom.getAttribute(name) !== String(value)) write.call(dom, name, value)
  }
}

/**
 * Markdown as this editor's document, read the way a page opening it would:
 * for a host that keeps documents, so it can turn Markdown into one once
 * rather than on every opening. Null until a document editor is on the page.
 */
export function readMarkdown(markdown: string): JSONContent | null {
  for (const reader of readers) {
    if (reader.isDestroyed) readers.delete(reader)
    else return markdownToDocument(reader, markdown)
  }
  return null
}

/**
 * The other way: a document as Markdown, written the way the editor showing it would write it, for a note whose
 * own editor is not open (lib/owed-copies.ts). Only by an editor that knows every kind of block and mark in the
 * document: one that does not (a host given fewer) would leave those out of the copy. Null until such an editor
 * is on the page.
 */
export function writeMarkdown(doc: JSONContent): string | null {
  const blocks = new Set<string>()
  const marks = new Set<string>()
  const look = (node: JSONContent): void => {
    if (node.type) blocks.add(node.type)
    for (const mark of node.marks ?? []) marks.add(mark.type)
    node.content?.forEach(look)
  }
  look(doc)
  for (const reader of readers) {
    if (reader.isDestroyed) readers.delete(reader)
    else if ([...blocks].every((name) => reader.schema.nodes[name]) && [...marks].every((name) => reader.schema.marks[name])) return markdownOf(reader, doc)
  }
  return null
}

/**
 * A ref holding the newest value, for callbacks that outlive the render that
 * made them. Written in an effect rather than during the render, which React
 * treats as a side effect and warns about.
 */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

export interface HaligtreeEditorProps {
  /**
   * `line` holds a single paragraph, `document` holds blocks. This is the
   * schema, so it is fixed at mount: remount with a `key` to change it.
   *
   * There is no shape between the two. What separates a comment box from a
   * page is which of the toolbars, handles and panels below are switched on,
   * not what the schema allows.
   *
   * @default "document"
   */
  shape?: "line" | "document"
  /**
   * Which toolbars to show and what goes in them. Omit a key for its default
   * contents, pass `false` for no toolbar, or pass your own nodes. The two are
   * independent: neither placement limits what it can hold.
   *
   * @default both, with their default contents
   */
  toolbar?: false | { fixed?: ReactNode | false; selection?: ReactNode | false; selectionExtra?: (editor: Editor) => ReactNode; selectionInCode?: (editor: Editor) => ReactNode }
  /**
   * The drag handle beside each block, and the menu it opens.
   *
   * @default true
   */
  handles?: boolean
  /**
   * Line numbers beside the words, when Settings' “Line numbers” is on: a page's note, not a small box.
   *
   * @default a document with handles
   */
  lineNumbers?: boolean
  /**
   * The `/` menu.
   *
   * @default true
   */
  slash?: boolean
  /**
   * The heading outline down the right edge. Off, it is still there for the
   * keys: ⇧⌘O brings it up to move through, and ⌥⌘↑ and ⌥⌘↓ jump between
   * headings either way.
   *
   * @default true
   */
  outline?: boolean
  /**
   * Math as you type: a line ending in `=` shows its answer, Tab or → writes it in.
   * The page's own switch covers every editor at once - see `setCalc`; this
   * leaves one editor out of it.
   *
   * @default true for a document, false for a line
   */
  math?: boolean
  /**
   * Find, on Mod-f. Registers a window level key handler while mounted.
   *
   * @default true
   */
  search?: boolean
  /**
   * Vim bindings. Left out, it follows the page's own switch, so one setting
   * covers every editor on it - see `setVim`.
   *
   * @default the page's own switch - see `currentVim`
   */
  vim?: boolean
  /**
   * Which mode vim opens in, when vim is on at all.
   *
   * `insert` is what a box you summoned with a key wants: the thought arrived
   * somewhere else and the window is in the way of writing it down. `normal`
   * is what a document you came back to wants.
   *
   * @default "normal"
   */
  vimStart?: "normal" | "insert"
  /**
   * Put the caret in it on mount, so it can be typed into without a click.
   *
   * `true` and `"start"` are the top of the document, `"end"` the bottom -
   * which is what a scratch space wants, since the next line goes after the
   * last one. Read once, at mount.
   *
   * @default false
   */
  autofocus?: boolean | "start" | "end"
  /** Where the words scroll in the editor itself (a note's page): a long note's way back to its top, as a long list has. */
  backToTop?: boolean
  /**
   * May hold the line being typed at a steady height, the page scrolling under
   * it, when Settings > Writing > Typewriter scrolling is on. For a full page
   * of writing; a short box that grows with its words has nothing to scroll.
   * "always" holds it whatever the switch says (the day's page).
   *
   * @default false
   */
  typewriter?: boolean | "always"
  /**
   * Ease the document to the caret instead of snapping to it.
   *
   * Every jump the editor makes on its own - a keystroke scrolling the caret
   * back into view, a vim motion, a search hit - glides. Holding `j` then
   * reads as the page moving under you rather than as a stack of jumps.
   *
   * Dragging a block past the edge is deliberately left out: that scroll is
   * already a smooth loop of its own, and easing each of its steps would fight
   * the pointer.
   *
   * @default true
   */
  smoothScroll?: boolean
  /**
   * Which marks exist at all. Not a toolbar setting: a mark left out here is
   * unreachable by shortcut, by markdown, and by pasting, because the schema
   * has nowhere to put it.
   *
   * @default every mark for a document; bold, italic, strike and code for a line
   */
  marks?: MarkName[]
  /**
   * Added to the editor's own box. Padding is a variable rather than a fixed
   * rule, so `--mf-padding` set from here or from `style` wins normally.
   *
   * @default ""
   */
  className?: string
  /** Set on the editor's own box, the same as any other component. */
  style?: CSSProperties
  /**
   * Return was pressed on a `line` shaped editor, which is a commit rather
   * than a new paragraph, because there is no second line to go to.
   */
  onSubmit?: () => void
  /**
   * A key, before the editor's own: true when the caller took it. Not asked
   * while a menu (the @ or / menu) has the keys, so its Return and arrows
   * stay its own. For a line that is one of many, as a list's lines are.
   */
  onKeyDown?: (event: KeyboardEvent) => boolean
  /** More of the editor's own parts, beside the built in ones. Read once, at mount. */
  extensions?: Extensions
  /**
   * Patterns to tint as they are typed, and report back. Read once at mount:
   * the extension captures them when the editor is built.
   *
   * Defaults to `TAGS`, so `#something` is a tag with no setup - each one in
   * its own colour, which is the part Obsidian does not do. Pass `[]` for
   * none, or your own patterns, which replace the default rather than adding
   * to it.
   *
   * @default `TAGS`
   */
  tokens?: TokenPattern[]
  /**
   * Read once, at mount. To show a different document, remount with a `key`.
   * Defaults to empty: a default document would be written over the caller's
   * note by the first keystroke while their note was still loading.
   *
   * @default "" - an empty document
   */
  defaultContent?: JSONContent | string
  /** @default "Write, or type / for commands…" */
  placeholder?: string
  /**
   * Start with the source panel open. It also toggles on Mod-e.
   *
   * @default false
   */
  showSource?: boolean
  /** ⌘E calls this instead of opening the editor's own source panel. */
  onToggleSource?: () => void
  /** Shown after the document, scrolling with it: backlinks, as Obsidian keeps them. */
  after?: ReactNode
  /** One quiet offer from your own notes, just under the words, before `after` (note-offers.tsx). */
  offers?: (editor: Editor | null) => ReactNode
  /** A line under the words already offers the word's fix (a Word being defined): no spelling pill as well. */
  quietSpelling?: boolean
  /** The note's properties, drawn in the page under its first line (property-strip.tsx). */
  belowTitle?: ReactNode
  /** The title is kept apart from the words (an article's title box): the strip opens the words instead of following their first line. */
  stripFirst?: boolean
  /** A `name:: value` line finished with Enter: true once it is kept as a property, and the line goes. */
  onPropertyLine?: (name: string, value: string) => boolean
  /**
   * What sits at the foot of a document in place of the word count: the
   * focus session's footer, which shows the count itself when no session runs.
   */
  foot?: (editor: Editor | null) => ReactNode
  /**
   * What the editor asks of whatever it is running inside: storing a dropped
   * picture, reading what a link is about, handing a file to the system.
   *
   * Left out, a browser's own answers are used - a picture becomes a data URL,
   * an export downloads - and anything a browser cannot do goes quiet instead
   * of throwing. An Electron app passes its preload bridge here.
   */
  host?: HaligtreeHost
  /**
   * Which document this is.
   *
   * Change it and the editor swaps documents, by remounting - `defaultContent`
   * is read once, so there is no other honest way to replace one, and a prop
   * that rewrote the document in place would throw away whatever was being
   * typed. This is the `key` you would otherwise write yourself.
   *
   * `null` means the content has not arrived yet and renders nothing, which
   * saves a caller guarding every use site. Left out, one editor stays mounted
   * for good.
   */
  documentId?: string | number | null
  /**
   * When the words were written (a note's making, ISO): its dates are read as
   * on that day, so "tomorrow" in an old note says which day it meant. A
   * Journal day ("day-2026-11-06") is its own day; left out, today.
   */
  writtenOn?: string | null
  /**
   * What the folded headings are remembered under, for an editor with no
   * `documentId`. Folding never changes the document, so this is all there is.
   *
   * @default `documentId`, or not remembered
   */
  foldKey?: string
  /**
   * Read only, the way an input is: the caret still moves and the text can
   * still be selected and copied, but nothing can change it, and the menus
   * that would change it stop offering.
   *
   * Not `disabled`, which in a form means unfocusable and skipped over. A
   * document nobody can edit is still a document to be read.
   *
   * The lock in the toolbar does the same thing from the inside, so a caller
   * holding this should leave that button out of `toolbar` - otherwise the
   * reader can simply unlock it until this prop next changes.
   *
   * @default false
   */
  readOnly?: boolean
  /**
   * Which notes the `@` menu offers. The editor has no idea what a note is, so
   * searching is the app's job; without this, `@` simply finds nothing.
   *
   * @default () => [] - the `@` menu finds nothing
   */
  findNotes?: NoteLinkOptions["findNotes"]
  /**
   * A note link was clicked. The editor reports; the app navigates. A link to
   * a heading says which: the next editor to open scrolls there itself, and
   * `showHeading` covers a note that is already open or opens elsewhere.
   */
  onOpenNote?: (id: string, heading?: string) => void
  /**
   * The headings in another note, for `@Note#` to offer. Without it, `@#`
   * still offers this note's own.
   */
  findHeadings?: (id: string) => string[] | Promise<string[]>
  /**
   * The first line has scrolled out of sight (its words), or come back (null):
   * for a host that shows the title in its top bar once the page has not.
   */
  onTitleOut?: (title: string | null) => void
  /**
   * A tag was followed. The editor reports the match; what following one means
   * - a search, a filter, a new view - is the app's.
   *
   * Mod-click, because a plain click belongs to the caret while the text can
   * still be edited. With `readOnly` there is nothing to edit, so a plain
   * click is enough.
   */
  onTokenClick?: (token: TokenMatch) => void
  /**
   * The document, debounced. JSON rather than HTML: node attributes - a folded
   * heading's rank, a block's colour - are the point, and JSON keeps them
   * exactly. The editor comes with it, for a caller that wants plain text or
   * HTML as well without holding its own reference.
   */
  onChange?: (doc: JSONContent, editor: Editor) => void
  /** The editor, once built: for a caller that must read it now, not after the pause onChange waits for. */
  onReady?: (editor: Editor) => void
}

/** Whether a stored document holds any words at all: stops at the first it meets. */
const hasWords = (node: JSONContent | null | undefined): boolean => !!node && (typeof node.text === "string" || !!node.content?.some(hasWords))

/** Each editor's drag handle, once found. */
const gripOf = new WeakMap<Editor, HTMLElement>()

/**
 * The editor.
 *
 * A shell over the one below, holding the two rules a caller would otherwise
 * have to know: `defaultContent` is read once at mount, so a different
 * document needs a different editor, and an editor must not appear before its
 * content has arrived.
 *
 * `documentId` does both. Changing it swaps the document by remounting, which
 * is what a `key` was for; `null` says the content is still on its way and
 * nothing is rendered until it is. Leaving it out keeps a single editor that
 * never remounts, so nobody who never had an id is caught by this.
 */
/** Where the caret starts in a note: the first place words can be typed, never a picture picked whole. */
const openingCaret = (doc: ProseMirrorNode): PMSelection => PMSelection.findFrom(doc.resolve(0), 1, true) ?? PMSelection.atStart(doc)

export function HaligtreeEditor({
  documentId,
  ...props
}: HaligtreeEditorProps = {}): React.JSX.Element | null {
  if (documentId === null) return null
  return <Surface key={documentId ?? undefined} documentId={documentId} {...props} />
}

function Surface({
  documentId,
  writtenOn,
  foldKey,
  defaultContent = "",
  placeholder = "Write, or type / for commands…",
  showSource = false,
  onToggleSource,
  after,
  offers,
  quietSpelling = false,
  belowTitle,
  stripFirst = false,
  onPropertyLine,
  foot,
  readOnly = false,
  host,
  shape = "document",
  toolbar,
  handles = true,
  lineNumbers,
  slash = true,
  outline = true,
  search = true,
  vim,
  vimStart = "normal",
  autofocus = false,
  backToTop = false,
  typewriter = false,
  smoothScroll = true,
  marks,
  className = "",
  style,
  onSubmit,
  onKeyDown,
  extensions: more = [],
  tokens = TAGS,
  findNotes = () => [],
  onOpenNote,
  findHeadings,
  onTitleOut,
  math,
  onTokenClick,
  onChange,
  onReady,
}: HaligtreeEditorProps = {}): React.JSX.Element {

  // Before the editor exists, because an input rule or a paste handler can ask
  // the moment it does, and those are not components with a context to read.
  setHost(host)

  // A prop wins where it is passed; otherwise the page's switch does, and
  // every editor on the page follows it while it is open.
  const [pageVim, setPageVim] = useState(currentVim)
  useEffect(() => onVimChange(setPageVim), [])
  const vimOn = vim ?? pageVim

  // Typewriter scrolling: the editor asked for it, and the switch is on. Read
  // through a ref by the extension, which is built once.
  const [typewriterOn] = useStoredFlag("typewriter")
  const typing = (typewriter === "always" || (typewriter && typewriterOn)) && !readOnly
  const typingRef = useLatest(typing)

  /** Scroll the document while a block is dragged or carried near its edge (lib/edge-scroll.ts, which the box drawn round blocks uses too). */
  const dragScroll = useCallback((box: HTMLElement | null) => {
    if (!box) return undefined
    const edge = edgeScroll(box)
    const follow = (event: DragEvent | PointerEvent): void => edge.follow(event.clientY)
    const stop = edge.stop
    // A drag that leaves the window (to another app, or a file carried in from Finder and out again) ends nothing here.
    const left = (event: DragEvent): void => void (!event.relatedTarget && stop())

    // A block carried by its grip (lib/block-carry.tsx) is the pointer's own move, not the browser's drag.
    const carried = (event: PointerEvent): void => void (document.documentElement.hasAttribute('data-block-carry') ? follow(event) : stop())

    // Heard on the way down: a picture carried by itself is answered by its note alone (lib/block-carry.tsx carryAway),
    // which keeps its drag from the editor's own handlers below.
    box.addEventListener('dragover', follow, true)
    box.addEventListener('pointermove', carried)
    document.addEventListener('dragend', stop, true)
    document.addEventListener('drop', stop, true)
    document.addEventListener('dragleave', left, true)
    document.addEventListener('pointerup', stop)

    return () => {
      stop()
      box.removeEventListener('dragover', follow, true)
      box.removeEventListener('pointermove', carried)
      document.removeEventListener('dragend', stop, true)
      document.removeEventListener('drop', stop, true)
      document.removeEventListener('dragleave', left, true)
      document.removeEventListener('pointerup', stop)
    }
  }, [])
  // Stable, so the content box is set once, not on every render.
  // The last box's listeners undone when it goes (called with null): left,
  // the document held every editor ever shown, a search preview's included.
  // Kept here, since EditorContent's ref merging drops a returned cleanup.
  const undoDrag = useRef<(() => void) | undefined>(undefined)
  const contentRef = useCallback((box: HTMLDivElement | null) => {
    undoDrag.current?.()
    undoDrag.current = dragScroll(box)
    setContentBox(box)
  }, [dragScroll])

  const [searchOpen, setSearchOpen] = useState(false)
  // Find taken away (the pill): an open bar goes with it.
  useEffect(() => void (!search && setSearchOpen(false)), [search])
  const [sourceOpen, setSourceOpen] = useState(showSource)
  // Read once, as the note opens, and only as far as its first word: written out whole to look for one, a
  // megabyte note cost about 30ms on every draw of this component.
  const [emptyAtStart] = useState(() => (typeof defaultContent === "string" ? !defaultContent.trim() : !hasWords(defaultContent)))
  // Through a ref: extensions are built once, and the handler can change.
  // A place after the document for `after`, appended once the content box exists:
  // before the frame is painted, so what sits under the words comes with them, not a frame after.
  const [contentBox, setContentBox] = useState<HTMLDivElement | null>(null)
  const [afterBox, setAfterBox] = useState<HTMLDivElement | null>(null)
  // The offer's place (OfferSlot, just under the last line) and the property strip's (PropertyLines, under the first)
  // are the editor's own, read from it where they are drawn below: never one element shared by every editor made here.
  const hasStrip = useLatest(!!belowTitle)
  const stripTop = useLatest(stripFirst)
  const propertyLineRef = useLatest(onPropertyLine)
  // A link drawn before its kind is known gains its kind's icon in place of its "@" a moment later,
  // and the words after it reflow: the page it is on waits for the kinds (lib/reads-in.tsx).
  useReading(useSyncExternalStore(onKindsAsked, kindsAsked))
  useLayoutEffect(() => {
    if (!contentBox || !after) return
    const box = document.createElement("div")
    contentBox.appendChild(box)
    setAfterBox(box)
    return () => {
      box.remove()
      setAfterBox(null)
    }
  }, [contentBox, !after]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSource = useRef(onToggleSource)
  toggleSource.current = onToggleSource
  const wrapperRef = useRef<HTMLDivElement>(null)
  // The editor's own source panel, heard opening and closing; Escape shuts it.
  const sourceOpenRef = useRef(sourceOpen)
  sourceOpenRef.current = sourceOpen
  const setSource = (open: boolean): void => {
    cue(open ? "source" : "source-close")
    setSourceOpen(open)
  }
  const setSourceRef = useRef(setSource)
  setSourceRef.current = setSource
  useEffect(() => {
    if (!sourceOpen) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !wrapperRef.current?.contains(event.target as Node)) return
      if (document.querySelector("[role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup, .tiptap-find-bar:not([inert])")) return
      event.preventDefault()
      event.stopPropagation()
      setSourceRef.current(false)
    }
    window.addEventListener("keydown", onEscape, true)
    return () => window.removeEventListener("keydown", onEscape, true)
  }, [sourceOpen])
  const rememberBlock = useCallback(
    ({ node, editor, pos }: { node: ProseMirrorNode | null; editor: Editor; pos: number }): void => {
      // The plugin lets its record go at any key (and as the pointer leaves the note) while the grip stays on show
      // beside the block: the record is kept, following that block through each change (`followBlock`), so the
      // grip's menu, its + and its carry act on the block it stands by. Let go, “Delete” on a table just typed in
      // did nothing (15 Nov).
      if (node) {
        blockTarget.current = { pos, name: node.type.name, level: headingRank(node) ?? undefined }
        blockDoc.current = editor.state.doc
      }
      // What a carry from the grip lifts.
      gripOn(editor.view, blockTarget.current?.pos ?? -1)

      // A backstop for the rule above, for the case where the table is not
      // among the candidates and the cheapest one is still inside it.
      //
      // Set on the element rather than through state: the plugin moves the
      // handle in a promise of its own, and a class that arrives on React's
      // next commit loses that race often enough to flash.
      const $at = node ? editor.state.doc.resolve(pos) : null
      let table = false
      for (let depth = $at?.depth ?? 0; depth > 0; depth -= 1) {
        if ($at?.node(depth).type.name === "table") table = true
      }
      // Kept once found: looking it up searched the whole note on every key.
      let handle = gripOf.get(editor)
      if (!handle?.isConnected) {
        handle = editor.view.dom.parentElement?.querySelector<HTMLElement>(".tiptap-drag-handle") ?? undefined
        if (handle) gripOf.set(editor, handle)
      }
      handle?.classList.toggle("is-hidden", table)
      // A heading's grip shows its level instead of the dots, Obsidian's "H2".
      if (node?.type.name === "heading") handle?.setAttribute("data-level", String(node.attrs.level))
      else handle?.removeAttribute("data-level")
    },
    []
  )

  const finder = useLatest(findNotes)
  const searchable = useLatest(search)
  const opener = useLatest(onOpenNote)
  const headingFinder = useLatest(findHeadings)
  // @tiptap/react already routes `onUpdate` to the newest props. The ref is for
  // the teardown effect below, which is keyed on `[editor]` and would otherwise
  // close over the callback from the render that created the editor.
  const latest = useLatest(onChange)
  // Held from the first render: the extension captures its patterns when the
  // editor is built, so a newer prop would tint what is not being matched.
  const [held] = useState(tokens)
  // Through a ref, like the note finder above: extensions are configured once,
  // when the editor is built, and a handler captured then would be the first
  // one this component ever rendered with.
  const follow = useRef<(token: TokenMatch) => void>(() => {})
  useEffect(() => {
    follow.current = onTokenClick ?? ((): void => {})
  })
  const onToken = useCallback((token: TokenMatch): void => follow.current(token), [])
  const allowed = marks ?? (shape === "line" ? LINE_MARKS : ALL_MARKS)
  const has = (mark: MarkName): boolean => allowed.includes(mark)
  const submit = useLatest(onSubmit)
  const keyed = useLatest(onKeyDown)
  const [extra] = useState(more)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Whether a "/" search was open after the last transaction, to hand the page on when one closes with its words left.
  const slashWas = useRef(false)
  // Which block the drag handle is pointing at, so its menu needs no selection.
  // A ref rather than state: `onNodeChange` fires on every pointer move across a
  // block, and re-rendering the editor that often makes the handle flicker.
  const blockTarget = useRef<BlockTarget | null>(null)
  /** The note as it was when that record was taken: each change after it moves the record with its block. */
  const blockDoc = useRef<ProseMirrorNode | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // A right-click's spot, so its menu opens under the pointer; the grip's opens at the grip.
  /** The room a block's right-click menu needs to open under or over the block: about seven rows since its actions
   * came first (9 Nov), and a longer list (a picture's) scrolls inside it. 560 was the old, taller menu's: in a
   * smaller window it opened at the pointer instead, over the block's own title (10 Nov). */
  const MENU_ROOM = 320
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; width?: number; height?: number } | null>(null)
  // A right-click on a misspelt word, whose suggestions head that menu.
  const [spelling, setSpelling] = useState<Misspelling | null>(null)
  /** What a right-click landed on (a link, a PDF, picked words): its lines lead the menu. */
  const [clicked, setClicked] = useState<Clicked | null>(null)
  // A right-click on picked words where there is no block menu: "Look up" alone.
  const [lookAt, setLookAt] = useState<{ x: number; y: number; from: number; to: number; words: string } | null>(null)
  useEffect(() => {
    if (!lookAt) return
    const away = (event: Event): void => {
      if (!(event.target as Element | null)?.closest?.("[data-look-menu]")) setLookAt(null)
    }
    const key = (event: KeyboardEvent): void => void (event.key === "Escape" && setLookAt(null))
    window.addEventListener("pointerdown", away, true)
    window.addEventListener("keydown", key, true)
    return () => (window.removeEventListener("pointerdown", away, true), window.removeEventListener("keydown", key, true))
  }, [lookAt])
  /** The menu of a clicked thing's lines alone, where there is no block to act on. */
  const [clickedOpen, setClickedOpen] = useState(false)
  const noBlock = useRef<BlockTarget | null>(null)
  /** Open that menu if the right-click landed on a link, a PDF or picked words; says whether it did. */
  const openClicked = (event: MouseEvent): boolean => {
    const found = editor ? clickedAt(editor, event) : null
    if (!found || !editor) return false
    event.preventDefault()
    setMenuAt({ x: event.clientX, y: event.clientY })
    setClicked(found)
    setSpelling(null)
    // A tick later, as the block menu: the click is still moving focus, which the menu would read as a click away.
    setTimeout(() => setClickedOpen(true))
    return true
  }
  // The plugin hides its handle by writing inline `visibility`, instantly, from
  // several different paths. Watching that one attribute catches all of them -
  // listening to `onNodeChange` alone left the handle stuck on screen. We turn
  // the flip into a fade with a grace period, so crossing the gutter to reach
  // the handle is not a race.
  const insert = useRef<HTMLButtonElement>(null)
  const detach = useRef<(() => void) | undefined>(undefined)

  const watchHandle = (button: HTMLButtonElement | null): void => {
    insert.current = button
    detach.current?.()
    detach.current = undefined

    const handle = button?.parentElement
    if (!handle) return

    let timer: ReturnType<typeof setTimeout>
    const sync = (): void => {
      clearTimeout(timer)
      if (handle.style.visibility !== "hidden") handle.classList.add("is-shown")
      else {
        timer = setTimeout(
          () => handle.classList.remove("is-shown"),
          HANDLE_GRACE_MS
        )
      }
    }

    const observer = new MutationObserver(sync)
    observer.observe(handle, { attributes: true, attributeFilter: ["style"] })
    sync()
    detach.current = () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }

  // The editor the caller was last told of (onReady), and the one this surface draws. In a development
  // run (StrictMode) more than one is made for a surface and the one put away can say it was made last,
  // so the caller kept a gone editor: a page's board, asked of it, said "Nothing here to make a board of
  // yet" while its menu ticked "Board view". Only the drawn one is told of, again when it changes.
  const toldOf = useRef<Editor | null>(null)
  const drawn = useRef<Editor | null>(null)
  const tell = (instance: Editor): void => {
    if (instance.isDestroyed || instance === toldOf.current || (drawn.current && drawn.current !== instance && !drawn.current.isDestroyed)) return
    toldOf.current = instance
    onReady?.(instance)
  }
  const editor = useEditor({
    // Drawn with its words in the first frame: created after it, a note opened (a page, a window, a tag's stream) showed empty for a frame, then its words, and pushed what was under it down.
    immediatelyRender: true,
    // Not drawn again on every keystroke: each bar, menu and count keeps itself current (useEditorState or
    // its own listener), so a long note's whole surface is not redrawn per letter (TipTap's performance guide).
    shouldRerenderOnTransaction: false,
    // TipTap's "delete" event: nothing here listens for it, and working it out walked every
    // block a change touched on every change (half a second for an Undo that brings back a long note).
    enableCoreExtensions: { delete: false },
    editable: !readOnly,
    autofocus,
    editorProps: {
      attributes: {
        // TipTap gives the note this role as it is made, then hands these attributes over again, without it, as the
        // note reaches the page (setOptions): ProseMirror read the note's own element changing and went through every
        // block to see what else had (200 ms as the largest note opened), and screen readers lost the note's role.
        role: "textbox",
        autocomplete: "off",
        autocorrect: "true",
        autocapitalize: "none",
        "aria-label": "Main content area, start typing to enter text.",
        // The shape is on the element too. Both editors carry `haligtree-editor`
        // now, so without this there is no way to tell a title from a document
        // in CSS or from outside.
        class: shape === "line" ? "haligtree-editor is-line" : "haligtree-editor",
      },
      // A press on the note's bare box under its last line: before ProseMirror's own, which would read the browser's place.
      handleDOMEvents: { mousedown: (view, event) => event.target === view.dom && pressUnderLastLine(view, event) },
      // Return, and the macOS editing keys nobody asked for.
      //
      // Here rather than in a keyboard shortcut because ProseMirror checks
      // these props before any plugin, and vim swallows Return in normal mode.
      handleKeyDown: (view, event) => {
        // The caller's keys first, unless a menu is open and the key is its. A suggestion menu with
        // nothing in it (a #word no tag starts with) shows nothing and takes no key.
        if (keyed.current && !event.isComposing && !document.querySelector(MENU_SHOWING) && keyed.current(event)) {
          event.preventDefault()
          return true
        }
        // Escape with words selected lets go of them first, rather than going
        // straight on to hide the window. Not in vim's visual mode, which
        // leaves it itself, and not while a menu has the key.
        if (event.key === "Escape" && !view.state.selection.empty && !document.querySelector(MENU_OPEN) && !/visual/i.test(view.dom.getAttribute("data-vim-mode") ?? "")) {
          const { head } = view.state.selection
          view.dispatch(view.state.tr.setSelection(PMSelection.near(view.state.doc.resolve(head))))
          return true
        }
        // macOS gives every editable field a set of Emacs keys and Chromium
        // honours them. Ctrl-H is a second Backspace, Ctrl-W eats a word and
        // Ctrl-T swaps two characters - none of which anything here asked for.
        //
        // Ctrl-K goes with them: killing to the end of the line is `D`, and
        // changing to it is `C`, both of which vim mode already has - so all
        // the chord adds is the same edit under a name nobody reached for, and
        // in insert mode besides. Ctrl-D, O, Y, E, F, B, U and the bracket
        // pairs stay: those are vim's own, and swallowing them here, before
        // any plugin runs, would take them off vim mode as well.
        if (event.ctrlKey && !event.metaKey && !event.altKey) {
          const key = event.key.toLowerCase()
          // Unless a menu is open, and then Ctrl-K is its "up". `handleKeyDown`
          // is read off the props, which ProseMirror checks before any plugin,
          // so swallowing it here took the key away from the slash menu before
          // the menu ever saw it - Ctrl-J went down and nothing came back up.
          const menu = key === "k" && document.querySelector(MENU_OPEN)
          if (!menu && ["h", "k", "w"].includes(key)) {
            event.preventDefault()
            return true
          }
        }

        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return false

        // A whole card is selected: open it. A card is a link you arrived at
        // rather than clicked, and Return opens the thing under the cursor
        // everywhere else - Space is a motion in vim and a scroll key outside
        // it.
        const { selection } = view.state
        if (selection instanceof NodeSelection) {
          const { href } = selection.node.attrs
          if (typeof href !== "string" || !href) return false
          event.preventDefault()
          if (!followPdfLink(href)) window.open(href, "_blank", "noopener")
          return true
        }

        // A single line has no second line to go to, so Return commits it:
        // unless the @ menu is open, whose Return picks the note.
        if (shape !== "line" || !submit.current || document.querySelector(MENU_OPEN)) return false
        event.preventDefault()
        submit.current()
        return true
      },
      /**
       * Which side of a block a dragged block lands on.
       *
       * ProseMirror asks where the pointer is and inserts at the nearest
       * position, and anywhere inside a paragraph is nearest to the end of it
       * - so the whole of a block meant "after this one" and only the hairline
       * gap above it meant "before". A one-step move upwards did nothing at
       * all, and reaching the top of a document needed a pixel-perfect aim.
       *
       * Halves, as everywhere else: above the middle drops before, below drops
       * after. The move itself is still ProseMirror's - this only says where.
       */
      handleDrop: (view, event, slice, moved) => {
        // Only a move. A copy - Alt held - is ProseMirror's own business, and
        // taking it over here mangled the block it was copied from.
        if (!moved) return false
        // Beside a block rather than above or below it: a row of columns.
        if (dropBeside(view, moved)) {
          event.preventDefault()
          view.focus()
          return true
        }

        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!at) return false
        // What lands is that block itself: the handle can hand over a slice
        // measured from a stale position, which would put back more than left.
        const dragged = draggedOf(view)
        const content = dragged ? Fragment.from(dragged.node) : slice.content
        // Several blocks at once: the range the handle selected is what moves.
        const range = dragged ?? (view.dragging ? view.state.selection : null)

        // The block under the pointer at the dragged block's own level, and the
        // edges it sits between: a top-level block lands between top-level
        // blocks, a list item inside a callout between the items around it.
        // Stepping out only as far as needed for what is dropped to fit there.
        const $at = view.state.doc.resolve(at.pos)
        const $from = dragged?.$from ?? view.state.selection.$from
        let depth = Math.min($at.depth, $from.depth + 1)
        while (depth > 1) {
          const index = $at.index(depth - 1)
          if ($at.node(depth - 1).canReplace(index, index, content)) break
          depth -= 1
        }

        // Between two blocks rather than inside one: the position is already
        // the boundary, so there is no half to pick.
        let target = $at.pos
        if (depth >= 1) {
          const dom = view.nodeDOM($at.before(depth))
          const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
          if (!box) return false
          target = event.clientY < box.top + box.height / 2 ? $at.before(depth) : $at.after(depth)
        }
        const tr = view.state.tr

        // Taken out and put in as one step (columns.ts moveBlocks, which the grip's own carry uses too): out of a
        // column or a list it leaves empty, those go as well. Into itself: nowhere to go, and nothing to lose.
        if (!range) tr.insert(target, content)
        else if (!moveBlocks(tr, range, dragged, target, content)) return true

        // The handle forgets the block it was on: left alone it keeps a
        // position from before the move, and the next drag starts from there.
        view.dispatch(tr.setMeta("hideDragHandle", true).scrollIntoView())
        event.preventDefault()
        // Back to the text, not the grip it was carried by: ⌘Z undoes the move.
        view.focus()
        return true
      },
      // Alt and a drag leaves the block where it was and drops a copy, the way
      // duplicating works everywhere else. ProseMirror already does this, but
      // off a per-platform modifier - Alt on a Mac, Ctrl elsewhere - and the
      // handle hands it `move: true` besides. Saying it here makes it one
      // gesture on every platform and stops it depending on either.
      dragCopies: (event) => event.altKey,
      // Start scrolling before the caret reaches the edge, and leave a margin
      // once it has, so edits never happen just out of sight.
      scrollThreshold: CARET_MARGIN,
      scrollMargin: CARET_MARGIN,
      // Plain text that is written in Markdown - a note copied out of
      // Obsidian, a README - reads as the blocks it describes, the same way a
      // Markdown file opens. Plain text with none of its marks stays plain
      // lines, and Shift pastes anything as it is.
      clipboardTextParser: (text, $context, plain, view) => {
        const editor = (view.dom as HTMLElement & { editor?: Editor }).editor
        if (plain || !editor || $context.parent.type.spec.code || !MARKDOWN_SIGNS.test(text)) return null as unknown as Slice
        return new Slice(view.state.schema.nodeFromJSON(markdownToDocument(editor, text)).content, 0, 0)
      },
      // A heading gets a blank line above it, if it did not arrive with one.
      //
      // Markdown has no empty paragraph - a blank line there separates blocks
      // rather than being one - so pasting from Obsidian lands every section
      // hard against the one before it. This puts the gap back as a real line,
      // which is what it looks like in the file it came from.
      //
      // On the paste rather than on every change: a line you can delete is the
      // whole difference between help and a fight. And only where there is not
      // one already, so pasting the same text twice does not stack them up.
      // Word's lists made lists again, a web page's menus and buttons left behind (lib/paste-tidy.ts).
      transformPastedHTML: tidyPastedHtml,
      transformPasted: (slice, view, plain) => {
        const blocks: ProseMirrorNode[] = []

        slice.content.forEach((node) => {
          const previous = blocks[blocks.length - 1]
          const blank = previous?.type.name === "paragraph" && previous.content.size === 0

          // Nothing above the first block: it joins what is already there.
          if (node.type.name === "heading" && previous && !blank) {
            blocks.push(view.state.schema.nodes.paragraph.create())
          }
          blocks.push(node)
        })

        // Google Docs ends every copy with a <br>: a line of nothing under it.
        const last = blocks[blocks.length - 1]
        if (blocks.length > 1 && last.type.name === "paragraph" && last.childCount && last.content.content.every((part) => part.type.name === "hardBreak")) blocks.pop()

        // Text opens only at a line of words, which joins the line it lands
        // in. ProseMirror opens it all the way down, and a callout or a list
        // read from Markdown dissolved into its insides.
        const content = Fragment.fromArray(blocks)
        if (plain && slice.openStart > 1 && content.firstChild && !content.firstChild.isTextblock) {
          const open = (node: ProseMirrorNode | null): number => (node?.isTextblock ? 1 : 0)
          return new Slice(content, open(content.firstChild), open(content.lastChild))
        }
        return new Slice(content, slice.openStart, slice.openEnd)
      },
      // A plain click opens a link, as in Obsidian and Notion: in the browser,
      // or the PDF reader for a PDF's. ⌥-click opens it to the side (a web
      // page in the reader beside this one), ⌘-click in a window of its own,
      // which for a web page is the browser's. Editing stays a click away:
      // a click beside the link, or the arrow keys, puts the caret in it; a
      // drag across it picks it (ProseMirror only calls this for a click that
      // did not move); a right-click gives "Edit link". `openOnClick` is off
      // on the extension because it has no ⌥ or ⌘ of its own.
      handleClick: (view, _pos, event) => {
        // A right-click (or ⌃-click) is for the link's menu, ⇧-click stretches the selection: neither follows it.
        if (event.button !== 0 || event.shiftKey || (event.ctrlKey && !event.metaKey)) return false
        const href = (event.target as HTMLElement | null)
          ?.closest("a[href]")
          ?.getAttribute("href")
        if (!href || !view.dom.contains(event.target as Node)) return false

        // A PDF's link opens the reader (beside, on ⌥-click); a web page on ⌥-click opens in the reader:
        // beside this one where the window splits, else in the main window (openArticle), as its hover says.
        // setWindowOpenHandler in main sends the rest to the real browser. One way for every place a note's words show,
        // ⌥-click to the side of the pane it was clicked in.
        followLink(href, event, view.dom.closest("[data-pane]")?.getAttribute("data-pane"))
        return true
      },
      // A list pasted into an empty bullet takes that bullet's place.
      //
      // Dropped in as it comes, the list lands *inside* the item, beside the
      // empty paragraph already there - which draws as a blank bullet with the
      // whole pasted tree indented under it, a level deeper than anything was
      // meant to be. An empty item is a place to put something, not something
      // to nest under.
      handlePaste: (view, _event, slice) => {
        const { state } = view
        const { $from, empty } = state.selection
        const list = slice.content.firstChild
        if (!empty || slice.content.childCount !== 1) return false
        if (!list || !LISTS.includes(list.type.name)) return false

        for (let depth = $from.depth; depth > 0; depth--) {
          const item = $from.node(depth)
          if (!LIST_ITEMS.includes(item.type.name)) continue
          // Only an empty one. Anything typed here is content the paste should
          // join, which is what the ordinary handling already does.
          if (item.textContent.length || item.childCount > 1) return false

          const parent = $from.node(depth - 1)
          const index = $from.index(depth - 1)
          // A checklist pasted into a bullet list has items the list cannot
          // hold; let the usual paste sort that one out.
          if (!parent.canReplace(index, index + 1, list.content)) return false

          view.dispatch(
            state.tr
              .replaceWith($from.before(depth), $from.after(depth), list.content)
              .scrollIntoView()
          )
          return true
        }

        return false
      },
    },
    extensions: [
      Kit.configure({
        // A line shape brings its own, holding a single paragraph. Blocks stay
        // registered but unreachable: the schema will not accept them.
        document: shape !== "line" && undefined,
        bold: has("bold") && undefined,
        italic: has("italic") && undefined,
        strike: has("strike") && undefined,
        code: has("code") && undefined,
        underline: has("underline") && undefined,
        // Replaced below so a list item can hold a toggle as its first child.
        listItem: false,
        horizontalRule: false,
        // The footnotes are always last (extensions/footnotes.ts): no empty line
        // is added under them, which they would move above themselves for ever.
        trailingNode: { notAfter: ["paragraph", "footnotes"] },
        // Only h1-h4 are styled; an h5 would render as a paragraph. Each paragraph and heading is drawn with a class
        // (a note is kept as JSON, without it), so a rule about the line before one names it by class (main.css, the reading rhythm).
        paragraph: { HTMLAttributes: { class: "mf-p" } },
        heading: { levels: [1, 2, 3, 4], HTMLAttributes: { class: "mf-h" } },
        // Words carried (they land between two letters, where no block can make way) and files brought in from another
        // app are the editor's own drag: its line marks the place, as wide as every carry's line (carry.tsx DropLine).
        dropcursor: { width: 2 },
        // Replaced by the highlighting version below.
        codeBlock: false,
        link: has("link") && {
          openOnClick: false,
          enableClickSelection: true,
          // A stored file can be linked to: a gem keeps its way back into a PDF so.
          protocols: ["haligtree", "mindflow"],
          // Only words that really are an address: "haligtree.app", never "the.re" (link-tidy.ts).
          shouldAutoLink: looksLikeAddress,
        },
      }),
      ...(shape === "line" ? [Document.extend({ content: "paragraph" })] : []),
      HorizontalRule,
      // Not on a line. There is nothing to align a one line title against, and
      // registering it hands Mod-Shift-r and its siblings a title to push to
      // the right - which is how a title ended up right aligned.
      ...(shape === "line"
        ? []
        : [
            // No shortcuts. Mod-Shift-l/e/r/j are the extension's own, and they
            // are far too easy to hit for something nobody reaches for: the
            // title ended up right aligned by a stray Mod-Shift-r. The toolbar
            // buttons still set it.
            TextAlign.extend({ addKeyboardShortcuts: () => ({}) }).configure({
              types: ["heading", "paragraph"],
            }),
          ]),
      // A bullet turns into a toggle in place, the way Notion does it: the item
      // keeps its spot in the list and its children become what the toggle
      // hides. That needs a toggle to be a legal first child.
      // `bulletList|orderedList|taskList` are not shapes anyone types on
      // purpose: they are what prosemirror-schema-list builds mid-lift, at
      // `liftToOuterList`, where it wraps the items following the lifted ones
      // in `itemType.create(null, list)`. Forbid it and Shift-Tab throws
      // whenever there is a sibling after what is being lifted.
      ListItem.extend({
        content: "(paragraph|details|bulletList|orderedList|taskList) block*"
      }),
      // To-dos pasted from Notion, Apple Notes or a web page come in as checklist items, ticked as they were,
      // in every editor (lib/pasted-todos.ts); a plain list stays bullets.
      TaskList.extend({
        parseHTML() {
          return [...(this.parent?.() ?? []), { tag: "ul", priority: 52, getAttrs: (element) => (isToDoList(element) ? null : false) }]
        },
      }),
      TaskItem.configure({ nested: true }).extend({
        content: "(paragraph|details|bulletList|orderedList|taskList) block*",
        addAttributes() {
          const own: Attributes = this.parent?.() ?? {}
          return { ...own, checked: { ...own.checked, parseHTML: (element: HTMLElement) => own.checked?.parseHTML?.(element) || toDoState(element) === true } }
        },
        parseHTML() {
          return [...(this.parent?.() ?? []), { tag: "li", priority: 52, getAttrs: (element) => (element.parentElement && isToDoList(element.parentElement) && toDoState(element) !== null ? null : false) }]
        },
        // Its own box (the tick and the words read to screen readers, and the task's own element) is the view's, as
        // TipTap's own node views keep theirs (NodeView.ignoreMutation): the editor reads back only the task's words.
        // Read back, a change there drew the whole task again, and a block carried lost what the carry marks on it: a
        // task carried stayed in sight, and the task it rested on never lit (15 Nov).
        addNodeView() {
          const made = this.parent?.()
          if (!made) return null
          return (props) => {
            const drawn = made(props)
            const words = drawn.contentDOM
            return { ...drawn, ignoreMutation: (mutation) => mutation.type !== "selection" && !!words && (mutation.target === words ? mutation.type === "attributes" : !words.contains(mutation.target)) }
          }
        },
      }),
      ...(has("highlight") ? [Highlight.configure({ multicolor: true }), FullLineHighlight] : []),
      // "question :: answer": a review card, marked at the line's end.
      LineCards,
      // "Author:: Ursula Le Guin": a property, kept on Enter; and the strip of them under the title.
      PropertyLines.configure({ strip: () => hasStrip.current, top: () => stripTop.current, onProperty: (name, value) => propertyLineRef.current?.(name, value) ?? false }),
      // The room over a paragraph, set by the block before it, as a class on it (extensions/block-room.ts says why).
      BlockRoom,
      // A to-do that is a task too, kept ticked as one; a pasted list offered as tasks.
      LinkedTasks.configure({ origin: () => (/^(?:capture|item)-(.+)$/.exec(String(documentId ?? ""))?.[1] ?? null), box: () => new URLSearchParams(location.search).get("view") === null && !documentId }),
      TaskMarks,
      // One quiet offer from your own notes under the last line (note-offers.tsx).
      ...(offers ? [OfferSlot] : []),
      // Dates and times lit as they are written, each saying the day it means; never in a one-line field.
      ...(shape === "line" ? [] : [DateWords.configure({
        writtenOn: () => {
          const day = /^day-(\d{4}-\d{2}-\d{2})$/.exec(String(documentId ?? ""))?.[1]
          const at = day ? new Date(`${day}T12:00`) : writtenOn ? new Date(writtenOn) : null
          return at && !Number.isNaN(at.getTime()) ? at : null
        },
        box: () => new URLSearchParams(location.search).get("view") === null && !documentId,
      })]),
      // Words made into a gem, a capture or a task: marked as kept, their mark opening it.
      Kept,
      // Width and alignment live on the node so they survive a save. Width is a
      // CSS length rather than a preset name, which leaves room for a drag.
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: null,
              parseHTML: (element) => element.style.width || null,
              renderHTML: ({ width }) => (width ? { style: `width: ${width}` } : {}),
            },
            align: {
              default: null,
              parseHTML: (element) => element.getAttribute("data-align"),
              renderHTML: ({ align }) => (align ? { "data-align": align } : {}),
            },
          }
        },
        // A <figcaption> with a picture beside it is that picture's caption
        // (see Caption), so it is not read a second time as a line of text.
        parseHTML() {
          return [...(this.parent?.() ?? []), { tag: "figcaption", ignore: true, getAttrs: (element) => (element.parentElement?.querySelector("img") ? null : false) }]
        },
        // The extension's own way of writing it, then the caption under it.
        renderMarkdown: (node) =>
          captioned(`![${node.attrs?.alt ?? ""}](${node.attrs?.src ?? ""}${node.attrs?.title ? ` "${node.attrs.title}"` : ""})`, node),
        // The same <img> the markup gives, with its place kept and its colours
        // shown until it loads (holdPlace). The first screenful is read at
        // once; the rest as they come near the screen.
        addNodeView: () => ({ node, HTMLAttributes, getPos }) => {
          const img = document.createElement("img")
          for (const [key, value] of Object.entries(HTMLAttributes)) if (value != null && key !== "src") img.setAttribute(key, String(value))
          const at = getPos() ?? Infinity
          img.loading = at < 3000 ? "eager" : "lazy"
          img.decoding = "async"
          if (node.attrs.src) img.setAttribute("src", node.attrs.src)
          holdPlace(img, at < 1200)
          return { dom: img, update: (next) => next.sameMarkup(node) }
        },
      }),
      Typography,
      ...(has("superscript") ? [Superscript] : []),
      ...(has("subscript") ? [Subscript] : []),
      Selection,
      // In every editor: `search` only says whether find is offered now, and that changes while an editor lives (quick
      // capture is made as the one-line pill and grows into the box), but an editor's extensions are fixed when it is
      // made, so a find bar opened over one made without this had none of its commands.
      FindAndReplace.configure({ injectCSS: false }),
      // Columns never narrower than a few words: a table with many of them
      // grows past the page and scrolls sideways, rather than crushing each.
      // A column is never narrower than about 18 letters: ten columns squeezed long words onto five lines; past the page, the table scrolls.
      TableDrawnFirst.configure({ resizable: true, cellMinWidth: 160 }),
      TableKit.configure({ table: false }),
      OutdentLists,
      UnwrapBareLists,
      ...(shape === "line" ? [] : [TabStays]),
      PlainCopy,
      Bookmark,
      Callout,
      Caption,
      Columns,
      Column,
      Attachment,
      Meeting,
      MeetingLine,
      ExcalidrawDiagram,
      Graph,
      ContentsBlock,
      // Footnotes as Obsidian writes them: a raised number, the notes at the foot.
      ...(shape === "line" ? [] : [FootnoteKit, Citation]),
      // Gives the editor `storage.markdown.getMarkdown()`, used by Export.
      // A Markdown reader of its own: on the shared one, each editor added its
      // rules for good, and they kept every editor ever opened in memory.
      // The option is typed as the shared one; an instance does all it is asked.
      Markdown.configure({ marked: new Marked() as unknown as typeof marked }),
      // Through refs, not the props directly: extensions are configured once,
      // when the editor is built, and the note list is usually still loading
      // then. Captured that early, `@` would search an empty list forever.
      NoteLink.configure({
        findNotes: (query, options) => finder.current(query, options),
        // The note shown, as the book keeps it (its `documentId`, notePowers'): its waiting links are pointed there.
        kept: () => {
          const found = /^(capture|item)-(.+)$/.exec(String(documentId ?? ""))
          return found ? (found[1] === "capture" ? found[2] : `item:${found[2]}`) : null
        },
        onOpenNote: (id, heading) => opener.current?.(id, heading),
        findHeadings: (id) => headingFinder.current?.(id) ?? [],
        render: noteLinkRenderer,
        tagRender: tagRenderer,
        wikiRender: wikiRenderer,
        embedRender: embedRenderer,
      }),
      // Another note shown here whole, live and editable at its source (transclusion).
      NoteEmbed,
      // A line's lasting name, given when a link is made to it.
      BlockIds,
      // Web links that behave: ⌘Z takes an automatic one back, edited words unlink themselves.
      ...(has("link") ? [LinkTidy] : []),
      // `enableTabIndentation` is the extension's own Tab handling: it indents
      // every selected line, where a hand-rolled insert replaces the selection.
      CodeBlockLowlight.extend({
        addNodeView: () => codeBlockNodeView,
        // The grammars come the first time a code block is met (see
        // lib/lowlight): once in, the code is painted again, which is not an
        // edit and nothing to undo.
        onCreate() {
          const editor = this.editor
          editor.on("destroy", whenGrammars(() => editor.isDestroyed || editor.view.dispatch(editor.state.tr.setMeta(GRAMMARS, true).setMeta("addToHistory", false))))
        },
        // Esc in a diagram's words steps out below it, so the drawing shows
        // again (a new empty line when it is the last block of the note).
        addKeyboardShortcuts() {
          return {
            ...this.parent?.(),
            Escape: ({ editor }) => {
              const { $head } = editor.state.selection
              if ($head.parent.type.name !== this.name || $head.parent.attrs.language !== "mermaid") return false
              const after = $head.after()
              const next = editor.state.doc.nodeAt(after)
              if (next?.isTextblock) return editor.chain().setTextSelection(after + 1).run()
              return editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run()
            },
          }
        },
        // The extension's own highlighter coloured every code block in the
        // note at once (and all again on a key in code): code's colours are
        // worked out only for the blocks drawn, once each (extensions/code-colours.ts).
        addProseMirrorPlugins() {
          return [...(this.parent?.() ?? []).filter((plugin) => !(plugin as unknown as { key: string }).key.startsWith("lowlight")), codeColours(this.name, GRAMMARS)]
        },
      }).configure({
        lowlight,
        enableTabIndentation: true,
        tabSize: 2,
      }),
      // The no-cookie address: a video in a note does not tell YouTube who you are.
      // Written as a picture of its address, which the reader turns back into a video.
      // Shown as its picture with a play button; the player loads only once it is pressed.
      Youtube.extend({ renderMarkdown: (node) => captioned(`![](${node.attrs?.src ?? ""})`, node), addNodeView: () => ReactNodeViewRenderer(YoutubeView) }).configure({ width: 640, height: 360, nocookie: true }),
      // Collapsible sections. `persist` writes the open state into the
      // document, so a section left folded is still folded when it reopens.
      Details.configure({ persist: true }),
      // `text*` would silently drop an emoji or an inline formula when a
      // heading is folded into the summary.
      DetailsSummary.extend({ content: "inline*" }),
      // The folded heading's rank lives HERE, and nowhere else it could: the
      // details extension's toggle button rewrites the details' attributes as
      // `{ open }` alone, and `clearNodes` - which every `setNode` runs - resets
      // the attributes of any TEXTBLOCK around the cursor, which the summary is.
      // `detailsContent` is `block+`, so neither touches it.
      DetailsContent.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            level: {
              default: null,
              parseHTML: (element) =>
                Number(element.getAttribute("data-level")) || null,
              renderHTML: ({ level }) => (level ? { "data-level": level } : {}),
            },
          }
        },
      }),
      CharacterCount,
      // The prompt used to be a `content:` string in a vendored stylesheet,
      // where it could not be changed from code or translated.
      Placeholder.configure({ placeholder }),
      // Pasting a YouTube link embeds it; `/` is the deliberate way in.
      ...(slash ? [SlashCommand.configure({ render: slashRenderer, items: slashItems, more: slashMedia })] : []),
      EmojiSuggestion,
      // Formulas that copy as their text, and money that stays money.
      InlineFormula,
      BlockFormula,
      ToggleHeading,
      ...(shape === "document" ? [HeadingFold.configure({ id: foldKey ?? (documentId != null ? String(documentId) : null) })] : []),
      ...(shape === "document" ? [OutlineKeys] : []),
      ...((math ?? shape === "document") ? [Calc] : []),
      // Collect what you copy: only a whole note can take copies in.
      ...(shape === "document" ? [Collect] : []),
      // A note's video pauses as you write, and ⌥K ⌥J ⌥L play and skip it.
      ...(shape === "document" ? [TypePause] : []),
      ImageDrop,
      DragOut,
      BlockColor,
      JoinLists,
      CurrentItem,
      Typewriter.configure({ on: () => typingRef.current }),
      CardLink,
      // A link on its own line becomes its card, fetched in the background.
      AutoCard,
      LongDocument,
      // A page's note: never a line, nor a box that asks for none (quick capture, a sticky).
      ...((lineNumbers ?? (shape === "document" && handles)) ? [LineNumbers] : []),
      UndoExact,
      SelectedNodes,
      BlockControls,
      ...(shape === "line" ? [] : [BlockGestures, PickedBlocks]),
      ObsidianShortcuts.configure({
        onToggleSource: () => (toggleSource.current ? toggleSource.current() : setSourceRef.current(!sourceOpenRef.current)),
      }),
      VimTabStays,
      VimMode.configure({
        enabled: vimOn,
        // An empty document opens ready to type, whatever the default: in
        // normal mode its first letters were commands, and nothing appeared.
        start: emptyAtStart ? "insert" : vimStart,
        // A line has nowhere for o, O, V or dd to go.
        singleLine: shape === "line",
        // Find only where this editor has it: not in quick capture's one-line pill, where Vim's / opens nothing.
        onSearch: () => void (searchable.current && setSearchOpen(true)),
      }),
      ...(tokens.length
        ? // `onToken` reads a ref, which the rule cannot tell from reading one
          // during render. It only runs on a click, which is the one place a
          // ref is meant to be read.
          // eslint-disable-next-line react-hooks/refs
          [Tokens.configure({ patterns: held, onClick: onToken })]
        : []),
      ImagePlaceholder,
      // Pictures pasted from Obsidian come in as pictures, not their paths.
      ObsidianEmbeds,
      // The grip lets its block go when a change takes the block away.
      GripLetsGo.configure({ kept: () => blockTarget.current }),
      ...extra,
    ],
    // A string is Markdown: what an imported note, or one pasted from a file,
    // is. A page's is read once the editor exists, in pieces (see onCreate).
    content: typeof defaultContent === "string" && shape !== "line" ? "" : defaultContent,
    contentType: typeof defaultContent === "string" && shape === "line" ? "markdown" : "json",
    // Its Markdown laid in the moment it has a view, before the frame is painted: laid in on create (a
    // tick later), an imported note showed empty for a frame, then its words, and pushed what was under it down.
    // Its React blocks have somewhere to be drawn from before it builds its page, so the page is built once (editor-surface.tsx).
    onBeforeCreate: ({ editor: instance }) => {
      holdViews(instance)
      // A picture or rule stored inside a line of words is put on a line of its own before the page is built from
      // it, with this editor's own schema (lib/lift-blocks.ts): left in, the first edit near it threw. Only shown
      // so: it is saved in this shape when the person next edits the note, never on opening, so those pictures
      // are not looked for in a vault as it opens either (a find is saved at once).
      const { content } = instance.options
      if (!content || typeof content !== "object" || Array.isArray(content)) return
      const held = new Set<string>()
      instance.setOptions({ content: liftBlocks(content, instance.schema, (block) => void (block.attrs?.src && held.add(String(block.attrs.src)))) })
      if (held.size) readInLine.set(instance, held)
    },
    onMount: ({ editor: instance }) => {
      if (laidIn.has(instance)) return
      laidIn.add(instance)
      quietAttributes(instance.view.dom)
      if (typeof defaultContent === "string" && shape !== "line" && defaultContent.trim()) {
        // Not an edit: nothing to undo back to, and nothing to save.
        try {
          const doc = instance.schema.nodeFromJSON(markdownToDocument(instance, defaultContent))
          // The selection starts at the start, as it does for words given as a
          // document: mapped through the replace it would land at the end, and
          // on a picture there it is a node selection, drawn as a ring on it.
          const tr = instance.state.tr.replaceWith(0, instance.state.doc.content.size, doc.content)
          instance.view.dispatch(tr.setSelection(openingCaret(tr.doc)).setMeta("addToHistory", false).setMeta("preventUpdate", true))
        } catch {
          instance.commands.setContent(defaultContent, { contentType: "markdown", emitUpdate: false })
        }
      }
      // A note that starts with a picture (a card, a drawing) opened with it
      // picked, a ring round it that read as an error: the caret goes to the
      // first place words can be typed instead, after it.
      const { selection } = instance.state
      if (selection instanceof NodeSelection && selection.from === 0) {
        // A picture alone has no line after it until the first change asks for one (trailingNode): asked now.
        if (!PMSelection.findFrom(instance.state.doc.resolve(0), 1, true)) instance.view.dispatch(instance.state.tr.setMeta("addToHistory", false).setMeta("preventUpdate", true))
        const caret = openingCaret(instance.state.doc)
        if (!caret.eq(selection)) instance.view.dispatch(instance.state.tr.setSelection(caret).setMeta("addToHistory", false).setMeta("preventUpdate", true))
      }
    },
    onCreate: ({ editor: instance }) => {
      // Let go of when it goes, or every editor ever opened stays in memory.
      if (shape === "document") (readers.add(instance), instance.on("destroy", () => readers.delete(instance)))
      tell(instance)
    },
    onUpdate: ({ editor: instance }) => {
      if (!latest.current) return
      // Serialising a long document on every keystroke is real work; the caller
      // only needs it when the typing stops.
      clearTimeout(pending.current)
      pending.current = setTimeout(() => {
        pending.current = undefined
        latest.current?.(keptDoc(instance.state).toJSON() as JSONContent, instance)
      }, SAVE_DEBOUNCE_MS)
    },
    // A "/" search closed with its words left on the page and nothing else changed (the caret moved off it, or
    // no block answered to it any more): they are the note's words from then on, so the page is handed on as it
    // is now. Every other way out of the menu (a pick, Esc) changes the page and is handed on by onUpdate.
    onTransaction: ({ editor: instance, transaction }) => {
      const open = !!slashOpen(instance.state)
      if (slashWas.current && !open && !transaction.docChanged && latest.current) {
        clearTimeout(pending.current)
        pending.current = setTimeout(() => {
          pending.current = undefined
          latest.current?.(keptDoc(instance.state).toJSON() as JSONContent, instance)
        }, SAVE_DEBOUNCE_MS)
      }
      slashWas.current = open
    },
  })

  drawn.current = editor
  useEffect(() => {
    if (editor) tell(editor)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // No squiggles while the words are coming, as iA Writer does: the
  // spellchecker looks again once you pause.
  // The editor's words once on the page: tiptap's view.dom throws before (lib/editor-dom.ts).
  const page = useEditorDom(editor ?? null)
  useEffect(() => {
    const dom = page
    if (!dom) return
    if (!dom) return
    let timer = 0
    // Back to what the page around it says (Settings' switches, on the root or a place's wrapper),
    // said outright: only a change to the attribute has the word just typed looked at again.
    const back = (): void => (clearTimeout(timer), dom.setAttribute("spellcheck", String(dom.parentElement?.spellcheck ?? true)))
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter")) return
      dom.setAttribute("spellcheck", "false")
      clearTimeout(timer)
      timer = window.setTimeout(back, 1200)
    }
    dom.addEventListener("keydown", onKey, true)
    dom.addEventListener("blur", back)
    return () => (back(), dom.removeEventListener("keydown", onKey, true), dom.removeEventListener("blur", back))
  }, [page, editor])

  // Unmount covers switching notes with a `key`; `pagehide` covers closing the
  // window, which never unmounts anything.
  // `editable` above is read when the editor is built, so a caller that
  // flips this later needs telling. Same for vim, which configures an
  // extension once and has a command for the rest.
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // The grip's kept record (rememberBlock) follows its block through every change, and goes when the block goes.
  useEffect(() => {
    if (!editor) return
    const followBlock = ({ transaction }: { transaction: Transaction }): void => {
      const kept = blockTarget.current
      if (!kept || !transaction.docChanged || blockDoc.current !== transaction.before) return
      const { pos, deleted } = transaction.mapping.mapResult(kept.pos, 1)
      const node = deleted ? null : transaction.doc.nodeAt(pos)
      blockTarget.current = node?.type.name === kept.name ? { ...kept, pos } : null
      blockDoc.current = transaction.doc
      gripOn(editor.view, blockTarget.current?.pos ?? -1)
    }
    editor.on("transaction", followBlock)
    return () => void editor.off("transaction", followBlock)
  }, [editor])

  // The numbers' column came, went or grew (extensions/line-numbers.ts): the handle is placed again beside the
  // block it is on at once, as the drag handle places itself (its own computePosition, with the same config), so
  // it stands left of the numbers the moment they come and back in its own place the moment they go, with no
  // pointer having to reach another block first.
  useEffect(() => {
    if (!editor || !handles) return
    const dom = editor.view.dom
    const again = (): void => {
      const handle = gripOf.get(editor) ?? dom.parentElement?.querySelector<HTMLElement>(".tiptap-drag-handle")
      if (!handle?.isConnected || editor.isDestroyed) return
      // The block it stands beside: the plugin's own record when it has one, else the block under the handle's
      // middle just inside the words' edge (the plugin lets its record go at any key, while the handle stays on show).
      let pos = blockTarget.current?.pos ?? -1
      if (pos < 0) {
        const at = handle.getBoundingClientRect()
        const edge = dom.getBoundingClientRect().left + (parseFloat(getComputedStyle(dom).paddingLeft) || 0)
        pos = editor.view.posAtCoords({ left: edge + 4, top: at.top + at.height / 2 })?.inside ?? -1
      }
      const block = pos >= 0 ? editor.view.nodeDOM(pos) : null
      if (!(block instanceof HTMLElement)) return
      void computePosition({ getBoundingClientRect: () => block.getBoundingClientRect() }, handle, HANDLE_POSITION).then(({ x, y, strategy }) => {
        if (!editor.isDestroyed) Object.assign(handle.style, { position: strategy, left: `${x}px`, top: `${y}px` })
      })
    }
    dom.addEventListener(LINES, again)
    return () => dom.removeEventListener(LINES, again)
  }, [editor, handles])

  // A nested block's handle sits over its parent's padding, so reaching for it
  // crossed the parent and the handle jumped there: the inner one could be seen
  // but never caught. While the pointer is left of the block the handle points
  // at, and level with it, the handle is not told the pointer moved, so it stays.
  // Not the plugin's own lock: a locked handle cannot be dragged. Top-level
  // blocks need none of this; the gutter beside them maps back to them already.
  useEffect(() => {
    if (!editor || !handles || !page) return
    const dom = page
    const onMove = (event: MouseEvent): void => {
      const at = blockTarget.current?.pos
      if (at == null || event.buttons || editor.state.doc.resolve(at).depth === 0) return
      const block = editor.view.nodeDOM(at)
      if (!(block instanceof HTMLElement)) return
      const box = block.getBoundingClientRect()
      if (event.clientX < box.left && event.clientY >= box.top && event.clientY <= box.bottom) {
        event.stopPropagation()
      }
    }
    // Right-click opens the grip's menu for the block under the pointer. Found
    // from the pointer rather than taken from the handle, which can be pointing
    // at a neighbour. A tick later: the click is still moving focus into the
    // editor, which the menu would read as a click away.
    //
    // Not on a locked note, whose menu would still delete, nor inside a drawing,
    // which has a menu of its own. Inside a table it is the table's menu, as
    // with the grip: a cell's line pulled out on its own breaks the table.
    const atomUnder = (target: Node): number | null => {
      let at: number | null = null
      editor.state.doc.descendants((node, pos) => {
        if (at !== null) return false
        const drawn = editor.view.nodeDOM(pos)
        if (!(drawn instanceof HTMLElement) || !drawn.contains(target)) return false
        // Blocks only: an inline atom (a note link) keeps its own menu, from the click.
        if (node.isAtom && node.isBlock) at = pos
        return !node.isAtom
      })
      return at
    }
    const onContext = (event: MouseEvent): void => {
      // Locked: no block lines, but a link or picked words still get theirs.
      if (!editor.isEditable) return void openClicked(event)
      if ((event.target as HTMLElement).closest(".tiptap-excalidraw-canvas")) return
      // A whole block drawn by its own view (a recording, a picture, a file)
      // is found from what was clicked: near its edges the coordinates name
      // the text beside it or nothing, and the note's own menu took the click.
      const atom = atomUnder(event.target as Node)
      const found = atom === null ? editor.view.posAtCoords({ left: event.clientX, top: event.clientY }) : { inside: atom }
      if (!found || found.inside < 0) return
      const $at = editor.state.doc.resolve(found.inside)
      let pos = found.inside
      for (let depth = $at.depth; depth > 0; depth -= 1) {
        if ($at.node(depth).type.name === "table") pos = $at.before(depth)
      }
      let node = editor.state.doc.nodeAt(pos)
      // A bullet sits in its list's margin, so the pointer finds the list:
      // the item level with it is the one meant, and it can be turned into.
      while (node && /List$/.test(node.type.name)) {
        const list: number = pos
        let item: number | null = null
        node.forEach((_, offset) => {
          const dom = editor.view.nodeDOM(list + 1 + offset)
          const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
          if (box && event.clientY >= box.top && event.clientY <= box.bottom) item = list + 1 + offset
        })
        if (item === null) break
        pos = item
        node = editor.state.doc.nodeAt(pos)
      }
      if (!node) return
      event.preventDefault()
      blockTarget.current = { pos, name: node.type.name, level: headingRank(node) ?? undefined }
      // A whole block (a recording, a picture): the menu under or over it, clear of its own controls, when there
      // is a menu's room there. A tall picture leaves none on either side: then it opens at the pointer, as any
      // right-click menu does, rather than squeezed into the strip above.
      const drawn = atom === null ? null : editor.view.nodeDOM(atom)
      const edge = drawn instanceof HTMLElement ? drawn.getBoundingClientRect() : null
      const room = edge ? Math.max(window.innerHeight - edge.bottom, edge.top) >= MENU_ROOM : false
      setMenuAt(edge && room ? { x: edge.left, y: edge.top, width: edge.width, height: edge.height } : { x: event.clientX, y: event.clientY })
      setClicked(clickedAt(editor, event))
      // Its spelling rows head the menu: the word under the pointer is asked about (a few milliseconds, never a
      // held window; nothing to ask off a word), and the menu opens whole with the answer, once this right-click
      // has run its course: no row lands under the pointer after it.
      const spelt = misspeltSoon(editor, event.clientX, event.clientY)
      setTimeout(() => void spelt.then((found) => (setSpelling(found), setMenuOpen(true))))
    }
    // Capture, so this runs before the handle's own listener further down.
    dom.addEventListener("mousemove", onMove, true)
    dom.addEventListener("contextmenu", onContext)
    return () => {
      dom.removeEventListener("mousemove", onMove, true)
      dom.removeEventListener("contextmenu", onContext)
    }
  }, [page, editor, handles])

  // Writing, the gutter (+ and the grip) steps out of the way, as in Notion: a key typed hides it and the
  // mouse moved brings it back. On the wrapper, so CSS can say so in one place (data-gutter-away). A name of its
  // own: as "data-keyed", the mark of a popup reached by keys, it had every rule about that mark asked again under the
  // wrapper on the first key and on the next move of the mouse, the contents list's 934 rows in the largest note.
  useEffect(() => {
    const wrap = wrapperRef.current
    if (!page || !wrap || !handles) return
    const typed = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter") return
      wrap.setAttribute("data-gutter-away", "")
    }
    const moved = (event: MouseEvent): void => void ((event.movementX || event.movementY) && wrap.removeAttribute("data-gutter-away"))
    page.addEventListener("keydown", typed, true)
    window.addEventListener("mousemove", moved, { passive: true })
    return () => {
      page.removeEventListener("keydown", typed, true)
      window.removeEventListener("mousemove", moved)
      wrap.removeAttribute("data-gutter-away")
    }
  }, [page, handles])

  // Without handles there is no block menu, so a link or picked words get a
  // menu of their own lines, and a misspelt word its fixes; anywhere else the
  // right-click is left alone.
  useEffect(() => {
    if (!editor || handles) return
    const onContext = (event: MouseEvent): void => {
      // One these words already looked at and passed on (below): left alone.
      if (passedOn(event)) return
      // Picked words keep their own one-line "Look up" menu below; a link, a PDF, a tag or a time get theirs.
      if (clickedAt(editor, event)?.kind !== "words" && openClicked(event)) return
      const { clientX: x, clientY: y } = event
      // The words picked as the button went down (the Mac picks the word under a right-click a moment after).
      const { from, to, empty } = editor.state.selection
      const words = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim()
      // One way everywhere (rightClickOnWords): on a word, the right-click is taken and the word asked about; a
      // misspelt one gets its fixes. Otherwise picked words (a card's answer in Review, any page without the
      // block menu) get one row, "Look up", the same Look Up card as everywhere; and with neither, the
      // right-click goes on to whatever is behind the words (a card's own menu, a sticky's).
      rightClickOnWords(editor, event, (found) => {
        if (found) return (setMenuAt({ x, y }), setSpelling(found), true)
        if (!words || words.length > 200) return false
        setLookAt({ x, y, from, to, words })
        return true
      })
    }
    page?.addEventListener("contextmenu", onContext)
    return () => page?.removeEventListener("contextmenu", onContext)
  }, [page, editor, handles])

  // While a block's menu is open its handle stays where it is. The menu is tied to the handle, and the handle went
  // on following the pointer from block to block under the open menu, taking the menu with it: it jumped about the
  // page as the pointer moved (12 Nov). Held the plugin's own way, so nothing behind an open menu moves, as on the Mac.
  useEffect(() => {
    if (!editor || !handles || !menuOpen) return
    editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", true))
    return () => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", false))
    }
  }, [editor, handles, menuOpen])

  // Only when the switch actually moves. The extension is built with `vimOn`
  // already, so running this on mount changed nothing except the one thing it
  // had no business changing: `setVimMode` puts you in normal mode, which
  // threw away `vimStart` and left a box you had just opened unable to type.
  const appliedVim = useRef(vimOn)
  useEffect(() => {
    if (!editor || appliedVim.current === vimOn) return
    appliedVim.current = vimOn
    editor.commands.setVimMode(vimOn)
  }, [editor, vimOn])

  // An image whose file is gone shows a quiet note in its place rather than
  // the browser's broken-picture icon. Only what is drawn changes: the note
  // keeps its link, so the image comes back if the file does.
  useEffect(() => {
    const dom = page
    if (!dom) return
    // Named by what it was called, or the end of its address; a stored file's
    // address is only a hash, which says nothing.
    const missing = (img: HTMLImageElement): void => {
      if (img.dataset.missing || img.src.startsWith("data:")) return
      // A link card's site icon or picture that does not load is simply left out: a
      // missing favicon is not a missing picture of yours.
      if (img.closest(".tiptap-bookmark")) {
        img.dataset.missing = "1"
        ;((img.closest(".tiptap-bookmark-frame") as HTMLElement | null) ?? img).style.display = "none"
        return
      }
      const end = decodeURIComponent(img.src.split(/[?#]/)[0].split("/").pop() ?? "")
      const name = img.alt || (/^[a-f0-9]{64}\./.test(end) || !end ? "A picture" : end)
      img.dataset.missing = "1"
      const say = (label: string): void => {
        const width = Math.min(520, Math.max(220, label.length * 7 + 56))
        const text = label.replace(/[<&>"]/g, (one) => `&#${one.charCodeAt(0)};`)
        img.alt = label
        img.style.visibility = ""
        // Grey at part strength reads calmly on a light page and a dark one.
        img.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><rect x=".5" y=".5" width="${width - 1}" height="63" rx="10" fill="#888" fill-opacity=".06" stroke="#888" stroke-opacity=".35" stroke-dasharray="4 4"/><g fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(18 23)"><rect width="18" height="18" rx="3"/><circle cx="6" cy="6" r="1.5"/><path d="m18 12-4-4-9 9"/></g><text x="48" y="33" dominant-baseline="middle" font-family="-apple-system, system-ui" font-size="13" fill="#888">${text}</text></svg>`)}`
      }
      // A picture from another site says why it is not here, as its site or the connection answered (src/main/
      // web-pictures.ts keeps the answer): "isn't here" was said of pictures that are, behind their site's sign-in.
      // Hidden, not broken, for the moment it takes to ask.
      const web = /^https?:\/\//.test(img.src) ? img.src : null
      if (!web) return say(`${clip(name, 48)} isn’t here`)
      img.style.visibility = "hidden"
      void window.api.haligtree<string | null>("pictures:why", web).catch(() => null).then((why) => say(`${clip(name, 32)}: ${webWhy(web, why)}`))
    }
    const onError = (event: Event): void => void (event.target instanceof HTMLImageElement && missing(event.target))
    dom.addEventListener("error", onError, true)
    // Any that failed before this was listening.
    dom.querySelectorAll("img").forEach((img) => img.complete && !img.naturalWidth && img.src && missing(img))
    return () => dom.removeEventListener("error", onError, true)
  }, [page, editor])

  // Known by its id while open, so a heading link to this same document lands
  // here rather than waiting for an editor that will never mount.
  //
  // And opened by a link to one of its headings (or lines, or pictures): the place asked for is taken here, as the
  // note comes to be the one showing its document, and said at once (sentElsewhere: the rule is in
  // lib/note-place.ts), so the note is never first put back where it was last left; it goes there once laid out
  // (told by the page itself, at the note's first layout: a frame after it was made, a long note was not always
  // on the page yet). Taken as the editor told of its own making, the note's first layout had come about 100 ms
  // before: the note was put back at its kept place, and the jump that followed did not always win it back.
  useEffect(() => {
    if (documentId == null || !editor) return
    const gone = showingDocument(String(documentId), editor)
    const heading = shape === "document" ? takePendingHeading(String(documentId)) : null
    if (heading) {
      sentElsewhere(editor)
      afterLayout(editor.view.dom, () => void (!editor.isDestroyed && goToHeading(editor, heading)))
    }
    return gone
  }, [editor, documentId, shape])
  // A note opens where you were in it: its scroll and caret, kept as you leave it (note-place.ts).
  useNotePlace(editor, documentId != null ? String(documentId) : null, shape === "document")
  // An editor that goes takes the browser's selection with it. Left behind, the browser keeps it at the place in
  // the page the editor was taken from, a place no caret can be, and from then on looks from there for the
  // nearest place one can be each time it lays out: with a long note next in the page, through every block of
  // it that is not drawn (the window stopped for half a minute at a press). Let go of before the editor is taken
  // out of the page, which is when this runs.
  useLayoutEffect(() => {
    if (!editor) return
    return () => {
      const selection = document.getSelection()
      if (selection?.rangeCount && !editor.isDestroyed && editor.view.dom.contains(selection.anchorNode)) selection.removeAllRanges()
    }
  }, [editor])

  // The first line, watched against the window rather than the scroller: in
  // the box the document scrolls itself, in a page its column does, and only
  // the window is the same in both. The top 48px are the host's bar.
  const titleOut = useLatest(onTitleOut)
  // Kept out of React: a redraw of the whole editor on every key typed in
  // the first line was most of what those keys cost in a long note.
  useEffect(() => {
    if (!onTitleOut || !editor) return
    let watched: Element | null = null
    let gone = false
    let told: string | null = null
    const tell = (): void => {
      let line = gone ? editor.state.doc.firstChild?.textContent.trim() || null : null
      if (line === told) return
      // Asked again before the words change: the watcher can miss the line
      // coming back (a long note is drawn off the page and put back).
      if (line && watched) {
        const box = watched.getBoundingClientRect()
        gone = box.bottom <= 48 || !box.height
        if (!gone) line = null
        if (line === told) return
      }
      told = line
      titleOut.current?.(line)
    }
    const watch = new IntersectionObserver(
      ([entry]) => {
        gone = !entry.isIntersecting && entry.boundingClientRect.top < 48
        tell()
      },
      { rootMargin: "-48px 0px 0px 0px" }
    )
    // Again when the first block is replaced: a new heading or a paste swaps
    // its element for a new one with the same words.
    const check = (): void => {
      const first = domOf(editor)?.firstElementChild ?? null
      if (first !== watched) {
        if (watched) watch.unobserve(watched)
        watched = first
        if (first) watch.observe(first)
      }
      if (gone) tell()
    }
    check()
    editor.on("transaction", check)
    return () => {
      editor.off("transaction", check)
      watch.disconnect()
    }
  }, [editor, !onTitleOut]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => titleOut.current?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const flush = (): void => {
      if (!pending.current) return
      clearTimeout(pending.current)
      pending.current = undefined
      if (editor && !editor.isDestroyed) latest.current?.(keptDoc(editor.state).toJSON() as JSONContent, editor)
    }
    window.addEventListener("pagehide", flush)
    // Asked by a note about to move to another window: its words go first.
    window.addEventListener("haligtree:flush", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("haligtree:flush", flush)
      flush()
    }
  }, [editor])

  // Omitting a toolbar key means its usual contents; `false` means no toolbar
  // at all. Neither choice limits what the other can hold.
  const fixedItems = toolbar === false ? false : toolbar?.fixed
  const selectionItems = toolbar === false ? false : toolbar?.selection

  // What you can do to a run of text. Turn into is not here: it acts on a whole
  // block, and the handle beside that block already offers it.
  const defaultSelection = (
    <>
          {/* The three used most, out on the bar with their keys in their tips;
              "Aa" holds the rest of the text's look, by name. */}
          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            {/* Words with no link: "Link" asks for an address; on a link, edit it or take it off. */}
            {editor && <LinkButtons editor={editor} />}
            {editor && <MarkMenu editor={editor} />}
            <LinkToBookmarkButton editor={editor} />
          </ToolbarGroup>
    </>
  )

  const defaultFixed = (
    <>
              <ToolbarGroup>
                <HeadingDropdownMenu
                  modal={false}
                  levels={[1, 2, 3]}
                  showTooltip={false}
                />
                <ListDropdownMenu
                  modal={false}
                  types={["bulletList", "orderedList", "taskList"]}
                  showTooltip={false}
                />
                <BlockquoteButton showTooltip={false} />
                <CodeBlockButton showTooltip={false} />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <MarkDropdownMenu
                  modal={false}
                  types={["bold", "italic", "strike", "code", "underline", "superscript", "subscript"]}
                  showTooltip={false}
                />
                <ColorHighlightPopover showTooltip={false} />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <TextAlignDropdownMenu
                  modal={false}
                  aligns={["left", "center", "right"]}
                  showTooltip={false}
                />
              </ToolbarGroup>
    </>
  )

  // The floating bars (picture, table, selection) join once the note has been painted: placed as
  // they join, they read where their words are, and read in the frame the note opens in (⌘⌫ opening
  // the next one) that laid the whole new note out there and then, 110 to 130ms.
  const [painted, setPainted] = useState<typeof editor | null>(null)
  useEffect(() => (editor ? afterPaint(() => setPainted(editor)) : undefined), [editor])
  const floats = !!editor && painted === editor

  return (
    <div
      ref={wrapperRef}
      className={[
        "relative haligtree-editor-wrapper",
        // A line hugs its text. Only a document needs to fill what holds it.
        shape === "line" ? "is-line" : "",
        sourceOpen ? "has-source" : "",
        handles ? "has-handles" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      // Which editors have a find bar, so ⌘F can pick one when several share a page.
      data-search={search ? "" : undefined}
      // Which note it is ("capture-…", "item-…"), so a note's menu can find its page to draw it as a picture.
      data-document={documentId ?? undefined}
      style={style}
      // The room under the words where the scroller ends with them (quick capture's card): the note's end too.
      onMouseDown={(event) => void (event.target === event.currentTarget && editor && !editor.isDestroyed && pressUnderLastLine(editor.view, event.nativeEvent))}
    >
      <EditorContext.Provider value={{ editor }}>
        {sourceOpen ? <SourceView editor={editor} /> : null}

        {floats && <ImageMenu editor={editor} />}
        <ImageLook editor={editor} />
        <CollectPill editor={editor} />

        {shape === "document" && <TableOfContents editor={editor} shown={outline} />}
        <TableControls editor={editor} />
        {floats && <TableMenu editor={editor} />}

        {handles && editor && (
          <DragHandle
            editor={editor}
            // Per-item handles for lists, but never the parts of a collapsible
            // section: they are not separately draggable, and dropping one
            // splits the section in two.
            nested={HANDLE_NESTING}
            className="tiptap-drag-handle"
            onNodeChange={rememberBlock}
            // `left-start` is already the default; what it lacks is a gap. It
            // measures from the block's own rect, and a list marker sits
            // OUTSIDE that rect, so the clearance has to cover the marker too -
            // still inside the 4.75rem gutter a wide page leaves on the left (a narrow
            // page drops the insert control, haligtree-editor.scss).
            computePositionConfig={HANDLE_POSITION}
          >
            <button
              ref={watchHandle}
              type="button"
              tabIndex={-1}
              // Silent, like the grip: they appear under the pointer on every line passed.
              data-silent=""
              aria-label="Insert a block below"
              // A new paragraph plus a "/" - the same menu typing it would open,
              // so there is one list of blocks rather than two.
              onClick={() => {
                const target = blockTarget.current
                const node = target && editor.state.doc.nodeAt(target.pos)
                if (!node || !target) return

                // Inside a list the handle points at the item's paragraph, and
                // inserting a paragraph straight after that splits the list in
                // two. Insert a sibling ITEM instead, right after this one, so
                // the new row lands where the click was.
                // Resolve INSIDE the block: a node's own position resolves to
                // the slot before it, whose ancestors do not include the node.
                const $inside = editor.state.doc.resolve(target.pos + 1)
                let item = -1
                for (let depth = $inside.depth; depth > 0; depth--) {
                  const name = $inside.node(depth).type.name
                  if (name === "listItem" || name === "taskItem") {
                    item = depth
                    break
                  }
                }

                const at =
                  item > 0 ? $inside.after(item) : target.pos + node.nodeSize
                const block =
                  item > 0
                    ? {
                      type: $inside.node(item).type.name,
                      content: [{ type: "paragraph" }],
                    }
                    : { type: "paragraph" }
                editor
                  .chain()
                  .focus()
                  // Normal mode would swallow whatever they type next, and the
                  // "/" below only opens the menu because insert mode allows it.
                  .enterInsertMode()
                  .insertContentAt(at, block)
                  .setTextSelection(at + (item > 0 ? 2 : 1))
                  .insertContent("/")
                  .run()
              }}
            >
              {/* Drawn, not typed: a "+" in the text face sat off its button's middle. */}
              <Plus aria-hidden />
            </button>

            <button
              type="button"
              tabIndex={-1}
              className="tiptap-drag-handle-grip"
              data-silent=""
              aria-label="Block actions"
              onClick={(event) => {
                // Its block picked, as Notion's grip picks it (one of a pick already: the pick kept, the menu acts on
                // them all); with ⇧, the run from the pick's start to it, and the menu stays shut.
                const target = blockTarget.current
                if (target) pickFromGrip(editor.view, target.pos, event.shiftKey)
                if (event.shiftKey) return
                setMenuAt(null)
                setSpelling(null)
                setClicked(null)
                setMenuOpen(true)
              }}
            >
              <GripVertical />
            </button>

            <BlockMenu
              editor={editor}
              targetRef={blockTarget}
              spelling={spelling}
              clicked={clicked}
              at={menuAt}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              documentId={documentId}
            />
          </DragHandle>
        )}

        {floats && selectionItems !== false && (
          <SelectionMenu editor={editor} reading={readOnly && toolbar !== false && !!toolbar?.selectionExtra} inCode={toolbar !== false && toolbar?.selectionInCode && editor ? toolbar.selectionInCode(editor) : undefined}>
            {/* Locked: nothing to format, only the host's ways to keep the words. */}
            {readOnly ? null : selectionItems ?? defaultSelection}
            {/* The host's own actions on a selection, after the editor's. */}
            {toolbar !== false && toolbar?.selectionExtra && editor ? toolbar.selectionExtra(editor) : null}
          </SelectionMenu>
        )}

        {/* A finish line, when this piece has a word aim (word-aim.tsx). */}
        {shape === "document" && !readOnly && documentId != null && <WordAim editor={editor} id={String(documentId)} />}

        <EditorSurface
          editor={editor}
          role="presentation"
          className={`haligtree-editor-content relative p-3 overflow-auto${
            smoothScroll ? " is-smooth" : ""
          }${typing ? " is-typewriter" : ""}${onTokenClick ? "" : " tags-inert"}`}
          // The scroller whose place lib/note-place.ts keeps (`useNotePlace` below is on for the same notes): the
          // pane leaves its scroll alone (panes.tsx), so a note's place has one owner.
          {...(shape === "document" && documentId != null ? { [PLACED]: "" } : {})}
          innerRef={contentRef}
          // The bare room under the words, in the same scroller, the holder of what comes after them and the page's
          // one wrapper in it included (a press on their own room, never on anything drawn in them): the note's end too.
          onMouseDown={(event) => void ((event.target === event.currentTarget || (!!afterBox && (event.target === afterBox || event.target === afterBox.firstElementChild))) && editor && !editor.isDestroyed && pressUnderLastLine(editor.view, event.nativeEvent))}
        />
        {/* After the words, inside the same scroll: added beside ProseMirror's
            own element, never inside it. */}
        {after && afterBox && createPortal(after, afterBox)}
        {/* Into the places of the editor drawn here (a page that gained its offers after its editor was made has none). */}
        {offers && editor?.storage.offerSlot && createPortal(offers(editor), editor.storage.offerSlot.box)}
        {belowTitle && editor && createPortal(belowTitle, editor.storage.propertyLines.strip)}

        <LinkPreview editor={editor} />
        <LinkEditor editor={editor} />
        {editor && <TaskLinkMenu editor={editor} />}
        {/* A misspelt word's likely fix, under it on a pause; Tab takes it. In every page you write in. */}
        {shape === "document" && !readOnly && !quietSpelling && <SpellPill editor={editor} />}
        {editor && <BlockMenu editor={editor} targetRef={noBlock} clicked={clicked} clickedOnly at={menuAt} open={clickedOpen} onOpenChange={setClickedOpen} documentId={documentId} />}
        {!handles && editor && <SpellingMenu editor={editor} spelling={spelling} at={menuAt} onClose={() => setSpelling(null)} />}

        {/* How much is written, quietly in the corner of a document. */}
        {shape === "document" && !readOnly && <VimSaid editor={editor} />}
        {shape === "document" && !readOnly && (foot ? foot(editor) : <WordCount editor={editor} />)}

        {/* The dock earns its place only if something is in it. */}
        {(fixedItems !== false || search) && (
          // The holder spans the editor's width but is see-through to the
          // pointer, so only its controls catch clicks, not the lines under it.
          <div data-find-holder className="pointer-events-none absolute inset-x-0 bottom-0 z-50 m-auto">
          <div className="w-full flex flex-col gap-1 items-center py-3 select-none">
            {/* Its room opens at once (a growing height stretched the bar's
                words); opened by a click the bar fades and rises 4px into it,
                by ⌘F or ⌥⌘F it is simply there, and it goes at once on Esc. */}
            {search && (
              <div
                className="grid w-full justify-items-center"
                style={{ gridTemplateRows: searchOpen ? '1fr' : '0fr' }}
              >
                <div className={`pointer-events-auto overflow-hidden ${searchOpen ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0 motion-reduce:translate-y-0'} ${searchOpen && !byKeys() ? 'transition-[opacity,translate] duration-150 ease-out' : ''}`}>
                  <SearchBar
                    editor={editor}
                    open={searchOpen}
                    onOpen={() => setSearchOpen(true)}
                    onClose={() => setSearchOpen(false)}
                  />
                </div>
              </div>
            )}

            {fixedItems !== false && (
              <Toolbar
                className="pointer-events-auto rounded-xl border-1 shadow"
                style={{ background: 'var(--accent)' }}
              >
                {fixedItems ?? defaultFixed}
              </Toolbar>
            )}
            </div>
          </div>
        )}
        {lookAt && editor && createPortal(
          <div data-look-menu role="menu" className={cn(FLOAT, "fixed z-[95] min-w-36 rounded-lg p-1 text-sm")} style={{ left: lookAt.x, top: lookAt.y }}>
            <button type="button" role="menuitem" autoFocus className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              onClick={() => (lookUpIn(editor, lookAt.from, lookAt.to, lookAt.words), setLookAt(null))}>
              <BookOpenText className="size-4 text-muted-foreground" /> Look up
            </button>
          </div>,
          document.body,
        )}
        {backToTop && editor && <BackToTop target={editor.view.dom.parentElement} />}
      </EditorContext.Provider>
    </div>
  )
}
/**
 * What a click on a link does, as its hover box says it under the address: a
 * web page the reader can read is offered there too, on ⌥-click (handleClick).
 */
const howToOpen = (href: string): string =>
  isReadable(href)
    ? `Click to open in your browser, ⌥-click to open in the reader${canSplit() ? " to the side" : ""}`
    : /^https?:\/\//i.test(href)
      ? "Click to open in your browser"
      : /^(?:haligtree|mindflow):\/\/article\?/i.test(href)
        ? "Click to open in the reader"
        : "Click to open"

/**
 * Where a link points, while the pointer is on it, and what a click does.
 *
 * The browser's own tooltip says the same thing, but it waits a second, cuts a
 * long URL off at the window edge and looks like nothing else here. This is
 * what Linear shows: the address without its scheme, wrapped rather than
 * truncated, in a box the rest of the app would recognise. It is the link's one
 * hover (tooltip.tsx, CARDED): a title the link was given shows here, above it.
 *
 * Portalled to the body because the editor scrolls: inside it the box would be
 * clipped by the same overflow that makes the document scrollable.
 */
function LinkPreview({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [link, setLink] = useState<{ href: string; how: string; title: string; top?: number; bottom?: number; left: number } | null>(null)

  // The editor's words once on the page: tiptap's view.dom throws before (lib/editor-dom.ts).
  const page = useEditorDom(editor ?? null)
  useEffect(() => {
    if (!editor) return
    const root = page
    if (!root) return
    const hide = (): void => setLink(null)

    const show = (event: Event): void => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]")
      // Never over a menu: one open is what is being read (lib/menu-showing.ts).
      // Nor under a pressed button: that is a click or the start of a drag.
      if (!(anchor instanceof HTMLAnchorElement) || menuShowing() || (event as PointerEvent).buttons) return hide()

      const box = anchor.getBoundingClientRect()
      const href = anchor.getAttribute("href") ?? ""
      setLink({
        // The scheme is the one part nobody is checking, and it costs a line
        // of a wrapped URL.
        href: href.replace(/^https?:\/\//, ""),
        how: howToOpen(href),
        // A title of its own, taken off the link by the app's tips (title-tips.tsx) so the system's never shows.
        title: (anchor.getAttribute("title") ?? anchor.getAttribute("data-title-tip") ?? "").trim(),
        // Above the link when it sits near the window's foot, so it is never cut off there.
        ...(box.bottom + 80 > window.innerHeight ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }),
        left: Math.max(8, Math.min(box.left, window.innerWidth - 8 - 448)),
      })
    }

    root.addEventListener("pointerover", show)
    root.addEventListener("pointerleave", hide)
    // Capture, because the thing that scrolls is inside the editor rather than
    // the window, and a box pinned to the viewport would be left behind.
    window.addEventListener("scroll", hide, true)
    const stop = hideForMenus(hide)

    return () => {
      stop()
      root.removeEventListener("pointerover", show)
      root.removeEventListener("pointerleave", hide)
      window.removeEventListener("scroll", hide, true)
    }
  }, [page, editor])

  // A link into a PDF shows the book itself, page by page, in the app's one
  // PDF preview (components/pdf/pdf-peek.tsx), starting at the page it lands on.
  if (!link?.href || /^(?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf(?:#.*)?$/i.test(link.href)) return null

  return createPortal(
    <span className="tiptap-link-preview" style={{ top: link.top, bottom: link.bottom, left: link.left }}>
      {link.title && <span className="tiptap-link-preview-title">{link.title}</span>}
      <span className="tiptap-link-preview-address">{link.href}</span>
      <span className="tiptap-link-preview-how">{link.how}</span>
    </span>,
    document.body
  )
}

/** Vim's mode, in words, at the foot of the page. The caret shape was the only sign, and normal mode swallows letters. */
function VimSaid({ editor }: { editor: Editor | null }) {
  const [word, setWord] = useState<string | null>(null)
  useEffect(() => {
    if (!editor) return
    const read = (): void => {
      const vim = vimPluginKey.getState(editor.state)
      const next = !vim?.enabled ? null : vim.mode === "insert" ? "Insert" : vim.mode === "visual" || vim.mode === "visualLine" ? "Visual" : "Normal"
      setWord((was) => (was === next ? was : next))
    }
    read()
    editor.on("transaction", read)
    return () => { editor.off("transaction", read) }
  }, [editor])
  if (!word) return null
  return (
    <span data-vim-status role="status" className="pointer-events-none absolute bottom-2 left-3 z-10 text-meta text-muted-foreground">
      {word}
    </span>
  )
}
