"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { JSONContent } from "@tiptap/core"
import { Fragment, Slice } from "@tiptap/pm/model"
import { NodeSelection, Selection as PMSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { onlyWordsChanged } from "@/lib/tiptap-utils"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Markdown } from "@tiptap/markdown"
import { Marked, type marked } from "marked"
import { Image } from "@tiptap/extension-image"
import { ListItem, TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection, CharacterCount, Placeholder } from "@tiptap/extensions"
import { BlockFormula, InlineFormula } from "@/extensions/math"
import { FindAndReplace } from "@tiptap/extension-find-and-replace"

// TableKit bundles Table, TableRow, TableHeader and TableCell.
import { TableKit } from "@tiptap/extension-table"
import { Youtube } from "@tiptap/extension-youtube"
import { YoutubeView } from "@/components/mindflow/youtube-view"
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details"
import { DragHandle } from "@tiptap/extension-drag-handle-react"
import { offset } from "@floating-ui/react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { ReactNodeViewRenderer, type Editor } from "@tiptap/react"
import { lowlight, whenGrammars } from "@/lib/lowlight"
import { setHost, type MindflowHost } from "@/lib/host"
import { currentVim, onVimChange } from "@/lib/vim"
import { cue } from "@/lib/cues"
import { byKeys } from "@/lib/motion"
import "katex/dist/katex.min.css"

// --- Extensions ---
import { ObsidianShortcuts } from "@/extensions/obsidian-shortcuts"
import { VimMode } from "@/extensions/vim-mode"
import { TAGS, Tokens, type TokenMatch, type TokenPattern } from "@/extensions/tokens"
import { SlashCommand } from "@/extensions/slash-command"
import { ToggleHeading, headingRank } from "@/extensions/toggle-heading"
import { HeadingFold } from "@/extensions/heading-fold"
import { ImageDrop } from "@/extensions/image-drop"
import { DragOut } from "@/extensions/drag-out"
import { ImagePlaceholder } from "@/extensions/image-placeholder"
import { ObsidianEmbeds } from "@/extensions/obsidian-embeds"
import { BlockColor } from "@/extensions/block-color"
import { JoinLists } from "@/extensions/join-lists"
import { OutdentLists } from "@/extensions/outdent-lists"
import { CurrentItem } from "@/extensions/current-item"
import { FullLineHighlight } from "@/extensions/full-line-highlight"
import { LineCards } from "@/extensions/line-cards"
import { LinkedTasks } from "@/extensions/linked-tasks"
import { TaskMarks } from "@/extensions/task-marks"
import { Kept } from "@/extensions/kept"
import { TaskLinkMenu } from "@/components/vigil/task-link-menu"
import { CardLink } from "@/extensions/card-link"
import { AutoCard } from "@/extensions/auto-card"
import { SelectedNodes } from "@/extensions/selected-nodes"
import { BlockGestures } from "@/extensions/block-gestures"
import { Bookmark } from "@/extensions/bookmark"
import { Callout } from "@/extensions/callout"
import { Caption, captioned } from "@/extensions/caption"
import { Column, Columns, draggedOf, dropBeside, moveOutOfColumn } from "@/extensions/columns"
import { Attachment } from "@/extensions/attachment"
import { ExcalidrawDiagram } from "@/extensions/excalidraw"
import { ContentsBlock } from "@/extensions/contents-block"
import { Calc } from "@/extensions/calc"
import { markdownToDocument } from "@/lib/markdown-doc"
import { LongDocument } from "@/extensions/long-document"
import { Typewriter } from "@/extensions/typewriter"
import { useStoredFlag } from "@/lib/use-stored-flag"

/** Every mark the editor can register. */
export type MarkName =
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
const MARKDOWN_SIGNS = /^(#{1,6} |\s*[-*+] |\s*\d+[.)] |> ?|```|~~~|\|.*\|\s*$|(---|\*\*\*|___)\s*$|\$\$|:::\w|<!-- columns -->)|\[\[|\*\*\S|\]\(|!\[/m

const HANDLE_POSITION = { middleware: [offset({ mainAxis: 24, crossAxis: 2 })] }

/**
 * Anything floating over the editor that moves on its own keys.
 *
 * Its own copy rather than a shared one: the host has a list like this for its
 * pickers, and this file may not reach into the app around it.
 */
const MENU_OPEN = "[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup"

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
import { AlignMenu, HighlightMenu, MarkMenu, ScriptMenu } from "./sub-menu"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { SearchBar } from "@/components/search/search-bar"
import { TableMenu } from "@/components/table/table-menu"
import { TableControls } from "@/components/table/table-controls"
import { BlockMenu, type BlockTarget } from "@/components/turn-into/block-menu"
import { SpellingMenu, misspeltAt, type Misspelling } from "@/components/turn-into/spelling"
import { WordCount } from "@/components/count/word-count"
import { WordAim } from "@/components/count/word-aim"
import { TableOfContents } from "@/components/toc/table-of-contents"
import { OutlineKeys, goToHeading } from "@/components/toc/headings"
import { SourceView } from "@/components/source/source-view"
import { NoteLink, showingDocument, takePendingHeading, type NoteSuggestion } from "@/extensions/note-link"
import { BlockIds } from "@/extensions/block-ids"
import { LinkTidy, looksLikeAddress } from "@/extensions/link-tidy"
import { LinkButtons, LinkEditor } from "./link-editor"
import { NoteEmbed } from "@/extensions/note-embed"
import { noteLinkRenderer, tagRenderer, wikiRenderer } from "@/components/note-link/note-link-menu"
import { ImageMenu } from "@/components/image/image-menu"
import { ImageLook } from "@/components/image/image-look"
import { holdPlace } from "@/lib/pictures"
import { CodeBlockView } from "@/components/code/code-block-view"
import { slashRenderer } from "@/components/slash/slash-menu"
import { slashItems } from "@/components/slash/slash-items"
import { EmojiSuggestion } from "@/components/emoji/emoji-suggestion"

// --- Styles ---
// The tokens every rule below reads, and the keyframes the menus animate with.
// They travel with the component rather than with the app around it.
import "@/assets/styles/_variables.scss"
import "@/assets/styles/_keyframe-animations.scss"
import "@/components/mindflow/mindflow-editor.scss"
import { GripVertical } from '@/components/ui/icons'

/** The page's document editors, any of which can read Markdown for `readMarkdown`. */
/** Editors whose Markdown is already laid in: a view mounted again keeps what was typed since. */
const laidIn = new WeakSet<object>()
const readers = new Set<Editor>()

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

export interface MindflowEditorProps {
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
  toolbar?: false | { fixed?: ReactNode | false; selection?: ReactNode | false; selectionExtra?: (editor: Editor) => ReactNode }
  /**
   * The drag handle beside each block, and the menu it opens.
   *
   * @default true
   */
  handles?: boolean
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
   * Math as you type: a line ending in `=` shows its answer, Tab writes it in.
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
  /**
   * May hold the line being typed at a steady height, the page scrolling under
   * it, when Settings > Writing > Typewriter scrolling is on. For a full page
   * of writing; a short box that grows with its words has nothing to scroll.
   *
   * @default false
   */
  typewriter?: boolean
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
  host?: MindflowHost
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
  findNotes?: (query: string) => NoteSuggestion[] | Promise<NoteSuggestion[]>
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
export function MindflowEditor({
  documentId,
  ...props
}: MindflowEditorProps = {}): React.JSX.Element | null {
  if (documentId === null) return null
  return <Surface key={documentId ?? undefined} documentId={documentId} {...props} />
}

function Surface({
  documentId,
  foldKey,
  defaultContent = "",
  placeholder = "Write, or type / for commands…",
  showSource = false,
  onToggleSource,
  after,
  foot,
  readOnly = false,
  host,
  shape = "document",
  toolbar,
  handles = true,
  slash = true,
  outline = true,
  search = true,
  vim,
  vimStart = "normal",
  autofocus = false,
  typewriter = false,
  smoothScroll = true,
  marks,
  className = "",
  style,
  onSubmit,
  tokens = TAGS,
  findNotes = () => [],
  onOpenNote,
  findHeadings,
  onTitleOut,
  math,
  onTokenClick,
  onChange,
  onReady,
}: MindflowEditorProps = {}): React.JSX.Element {

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
  const typing = typewriter && typewriterOn && !readOnly
  const typingRef = useLatest(typing)

  /**
   * Scroll the document while a block is dragged near its edge.
   *
   * Without it a block can only travel as far as one screenful, which on a
   * long note is most of the way to useless. It runs on a frame loop while a
   * drag is on rather than on `dragover` alone, because the gesture is to hold still at the edge and
   * wait - and an event that only fires on movement stops the moment you do.
   */
  const dragScroll = useCallback((box: HTMLElement | null) => {
    if (!box) return undefined

    // A wider band, so the edge is easy to find. Pixels a second at the very
    // edge, easing to none at the inside of the band. Per second rather than
    // per frame: per frame, a 120Hz screen scrolled twice as fast as a 60Hz one,
    // which at the old 34 a frame was over 4000px a second.
    const EDGE = 96
    const SPEED = 100
    let at: number | null = null
    let frame = 0
    let last = 0

    // `instant`, spelled out: the box may be easing its own scrolls, and a
    // frame loop that asks for an eased step every frame never arrives.
    const by = (delta: number): void => box.scrollBy({ top: delta, behavior: "instant" })

    // Only while something is being dragged: a loop left running would tick
    // every frame for as long as the editor is open, seen or not.
    const step = (now: number): void => {
      if (at === null) return void (frame = 0)
      frame = requestAnimationFrame(step)
      // Capped, so a frame after a stall does not jump a screenful.
      const seconds = Math.min(now - last, 50) / 1000
      last = now

      const { top, bottom } = box.getBoundingClientRect()
      const above = at - top
      const below = bottom - at
      const rate = SPEED * seconds
      if (above < EDGE) by(-rate * (1 - Math.max(0, above) / EDGE))
      else if (below < EDGE) by(rate * (1 - Math.max(0, below) / EDGE))
    }

    const follow = (event: DragEvent): void => {
      at = event.clientY
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(step)
    }
    const stop = (): void => {
      at = null
    }

    box.addEventListener('dragover', follow)
    document.addEventListener('dragend', stop)
    document.addEventListener('drop', stop)

    return () => {
      cancelAnimationFrame(frame)
      box.removeEventListener('dragover', follow)
      document.removeEventListener('dragend', stop)
      document.removeEventListener('drop', stop)
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
  const [sourceOpen, setSourceOpen] = useState(showSource)
  const emptyAtStart = typeof defaultContent === "string" ? !defaultContent.trim() : !JSON.stringify(defaultContent ?? null).includes('"text":"')
  // Through a ref: extensions are built once, and the handler can change.
  // A place after the document for `after`, appended once the content box exists:
  // before the frame is painted, so what sits under the words comes with them, not a frame after.
  const [contentBox, setContentBox] = useState<HTMLDivElement | null>(null)
  const [afterBox, setAfterBox] = useState<HTMLDivElement | null>(null)
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
      blockTarget.current = node
        ? { pos, name: node.type.name, level: headingRank(node) ?? undefined }
        : null

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
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Which block the drag handle is pointing at, so its menu needs no selection.
  // A ref rather than state: `onNodeChange` fires on every pointer move across a
  // block, and re-rendering the editor that often makes the handle flicker.
  const blockTarget = useRef<BlockTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // A right-click's spot, so its menu opens under the pointer; the grip's opens at the grip.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  // A right-click on a misspelt word, whose suggestions head that menu.
  const [spelling, setSpelling] = useState<Misspelling | null>(null)
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

  const editor = useEditor({
    // Drawn with its words in the first frame: created after it, a note opened (a page, a window, a tag's stream) showed empty for a frame, then its words, and pushed what was under it down.
    immediatelyRender: true,
    editable: !readOnly,
    autofocus,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "true",
        autocapitalize: "none",
        "aria-label": "Main content area, start typing to enter text.",
        // The shape is on the element too. Both editors carry `mindflow-editor`
        // now, so without this there is no way to tell a title from a document
        // in CSS or from outside.
        class: shape === "line" ? "mindflow-editor is-line" : "mindflow-editor",
      },
      // Return, and the macOS editing keys nobody asked for.
      //
      // Here rather than in a keyboard shortcut because ProseMirror checks
      // these props before any plugin, and vim swallows Return in normal mode.
      handleKeyDown: (view, event) => {
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
          window.open(href, "_blank", "noopener")
          return true
        }

        // A single line has no second line to go to, so Return commits it.
        if (shape !== "line" || !submit.current) return false
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

        // Take it out first when it is a move, and map the target through that
        // removal - the block being dropped may sit before the place it lands.
        // Out of a column, the column it empties goes too.
        if (!(dragged && moveOutOfColumn(tr, dragged, target, content))) {
          if (range) {
            // Into itself: nowhere to go, and nothing to lose.
            if (target > range.from && target < range.to) return true
            tr.delete(range.from, range.to)
          }
          tr.insert(tr.mapping.map(target), content)
        }

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
      // Mod-click opens a link. A plain click belongs to the caret, because
      // the text is there to be edited - the same rule a tag follows.
      // `openOnClick` is off on the extension for exactly that reason, and it
      // has no setting for "only with a modifier".
      handleClick: (_view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) return false
        const href = (event.target as HTMLElement | null)
          ?.closest("a[href]")
          ?.getAttribute("href")
        if (!href) return false

        // setWindowOpenHandler in main sends it to the real browser.
        window.open(href, "_blank", "noopener")
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
      StarterKit.configure({
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
        // Only h1-h4 are styled; an h5 would render as a paragraph.
        heading: { levels: [1, 2, 3, 4] },
        // Replaced by the highlighting version below.
        codeBlock: false,
        link: has("link") && {
          openOnClick: false,
          enableClickSelection: true,
          // Only words that really are an address: "vigil.app", never "the.re" (link-tidy.ts).
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
      TaskList,
      TaskItem.configure({ nested: true }).extend({
        content: "(paragraph|details|bulletList|orderedList|taskList) block*",
      }),
      ...(has("highlight") ? [Highlight.configure({ multicolor: true }), FullLineHighlight] : []),
      // "question :: answer": a review card, marked at the line's end.
      LineCards,
      // A to-do that is a task too, kept ticked as one; a pasted list offered as tasks.
      LinkedTasks.configure({ origin: () => (/^(?:capture|item)-(.+)$/.exec(String(documentId ?? ""))?.[1] ?? null), box: () => new URLSearchParams(location.search).get("view") === null && !documentId }),
      TaskMarks,
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
      ...(search ? [FindAndReplace.configure({ injectCSS: false })] : []),
      // Columns never narrower than a few words: a table with many of them
      // grows past the page and scrolls sideways, rather than crushing each.
      TableKit.configure({ table: { resizable: true, cellMinWidth: 128 } }),
      OutdentLists,
      Bookmark,
      Callout,
      Caption,
      Columns,
      Column,
      Attachment,
      ExcalidrawDiagram,
      ContentsBlock,
      // Gives the editor `storage.markdown.getMarkdown()`, used by Export.
      // A Markdown reader of its own: on the shared one, each editor added its
      // rules for good, and they kept every editor ever opened in memory.
      // The option is typed as the shared one; an instance does all it is asked.
      Markdown.configure({ marked: new Marked() as unknown as typeof marked }),
      // Through refs, not the props directly: extensions are configured once,
      // when the editor is built, and the note list is usually still loading
      // then. Captured that early, `@` would search an empty list forever.
      NoteLink.configure({
        findNotes: (query) => finder.current(query),
        onOpenNote: (id, heading) => opener.current?.(id, heading),
        findHeadings: (id) => headingFinder.current?.(id) ?? [],
        render: noteLinkRenderer,
        tagRender: tagRenderer,
        wikiRender: wikiRenderer,
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
        addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
        // The grammars come the first time a code block is met (see
        // lib/lowlight): once in, the code is painted again, which is not an
        // edit and nothing to undo.
        onCreate() {
          const editor = this.editor
          editor.on("destroy", whenGrammars(() => editor.isDestroyed || editor.view.dispatch(editor.state.tr.setMeta(GRAMMARS, true).setMeta("addToHistory", false))))
        },
        // Named here or the extended copy adds its highlighter on top of the
        // parent's: every code block was coloured twice on every key.
        // The highlighter also walked the whole note twice on every change,
        // even a caret move: words typed outside code only move its colours.
        addProseMirrorPlugins() {
          const plugins = this.parent?.() ?? []
          const inCode = (state: EditorState): boolean => state.selection.$head.parent.type.name === this.name
          for (const plugin of plugins) {
            const field = plugin.spec.state
            if (!field || !(plugin as unknown as { key: string }).key.startsWith("lowlight")) continue
            const { apply, init } = field
            field.apply = (tr: Transaction, set, old, state) =>
              tr.getMeta(GRAMMARS) ? init.call(plugin, {} as never, state) : !tr.docChanged ? set : !inCode(old) && !inCode(state) && onlyWordsChanged(tr) && !tr.steps.some((_, i) => tr.docs[i].resolve((tr.steps[i] as unknown as { from: number }).from).parent.type.name === this.name) ? set.map(tr.mapping, tr.doc) : apply.call(plugin, tr, set, old, state)
          }
          return plugins
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
      ...(slash ? [SlashCommand.configure({ render: slashRenderer, items: slashItems })] : []),
      EmojiSuggestion,
      // Formulas that copy as their text, and money that stays money.
      InlineFormula,
      BlockFormula,
      ToggleHeading,
      ...(shape === "document" ? [HeadingFold.configure({ id: foldKey ?? (documentId != null ? String(documentId) : null) })] : []),
      ...(shape === "document" ? [OutlineKeys] : []),
      ...((math ?? shape === "document") ? [Calc] : []),
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
      SelectedNodes,
      ...(shape === "line" ? [] : [BlockGestures]),
      ObsidianShortcuts.configure({
        onToggleSource: () => (toggleSource.current ? toggleSource.current() : setSourceRef.current(!sourceOpenRef.current)),
      }),
      VimMode.configure({
        enabled: vimOn,
        // An empty document opens ready to type, whatever the default: in
        // normal mode its first letters were commands, and nothing appeared.
        start: emptyAtStart ? "insert" : vimStart,
        // A line has nowhere for o, O, V or dd to go.
        singleLine: shape === "line",
        onSearch: () => setSearchOpen(true),
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
    ],
    // A string is Markdown: what an imported note, or one pasted from a file,
    // is. A page's is read once the editor exists, in pieces (see onCreate).
    content: typeof defaultContent === "string" && shape !== "line" ? "" : defaultContent,
    contentType: typeof defaultContent === "string" && shape === "line" ? "markdown" : "json",
    // Its Markdown laid in the moment it has a view, before the frame is painted: laid in on create (a
    // tick later), an imported note showed empty for a frame, then its words, and pushed what was under it down.
    onMount: ({ editor: instance }) => {
      if (laidIn.has(instance)) return
      laidIn.add(instance)
      if (typeof defaultContent === "string" && shape !== "line" && defaultContent.trim()) {
        // Not an edit: nothing to undo back to, and nothing to save.
        try {
          const doc = instance.schema.nodeFromJSON(markdownToDocument(instance, defaultContent))
          instance.view.dispatch(instance.state.tr.replaceWith(0, instance.state.doc.content.size, doc.content).setMeta("addToHistory", false).setMeta("preventUpdate", true))
        } catch {
          instance.commands.setContent(defaultContent, { contentType: "markdown", emitUpdate: false })
        }
      }
    },
    onCreate: ({ editor: instance }) => {
      // Let go of when it goes, or every editor ever opened stays in memory.
      if (shape === "document") (readers.add(instance), instance.on("destroy", () => readers.delete(instance)))
      onReady?.(instance)
      // Opened by a link to one of its headings: go there once laid out.
      const heading = shape === "document" ? takePendingHeading() : null
      if (heading) requestAnimationFrame(() => goToHeading(instance, heading))
    },
    onUpdate: ({ editor: instance }) => {
      if (!latest.current) return
      // Serialising a long document on every keystroke is real work; the caller
      // only needs it when the typing stops.
      clearTimeout(pending.current)
      pending.current = setTimeout(() => {
        pending.current = undefined
        latest.current?.(instance.getJSON(), instance)
      }, SAVE_DEBOUNCE_MS)
    },
  })

  // Unmount covers switching notes with a `key`; `pagehide` covers closing the
  // window, which never unmounts anything.
  // `editable` above is read when the editor is built, so a caller that
  // flips this later needs telling. Same for vim, which configures an
  // extension once and has a command for the rest.
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // A nested block's handle sits over its parent's padding, so reaching for it
  // crossed the parent and the handle jumped there: the inner one could be seen
  // but never caught. While the pointer is left of the block the handle points
  // at, and level with it, the handle is not told the pointer moved, so it stays.
  // Not the plugin's own lock: a locked handle cannot be dragged. Top-level
  // blocks need none of this; the gutter beside them maps back to them already.
  useEffect(() => {
    if (!editor || !handles) return
    const dom = editor.view.dom
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
    const onContext = (event: MouseEvent): void => {
      if (!editor.isEditable || (event.target as HTMLElement).closest(".tiptap-excalidraw-canvas")) return
      const found = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
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
      setMenuAt({ x: event.clientX, y: event.clientY })
      setSpelling(misspeltAt(editor, event.clientX, event.clientY))
      setTimeout(() => setMenuOpen(true))
    }
    // Capture, so this runs before the handle's own listener further down.
    dom.addEventListener("mousemove", onMove, true)
    dom.addEventListener("contextmenu", onContext)
    return () => {
      dom.removeEventListener("mousemove", onMove, true)
      dom.removeEventListener("contextmenu", onContext)
    }
  }, [editor, handles])

  // Without handles there is no block menu, so a misspelt word gets one of
  // its own; anywhere else the right-click is left alone.
  useEffect(() => {
    if (!editor || handles) return
    const onContext = (event: MouseEvent): void => {
      const found = misspeltAt(editor, event.clientX, event.clientY)
      if (!found) return
      event.preventDefault()
      setMenuAt({ x: event.clientX, y: event.clientY })
      setSpelling(found)
    }
    editor.view.dom.addEventListener("contextmenu", onContext)
    return () => editor.view.dom.removeEventListener("contextmenu", onContext)
  }, [editor, handles])

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
    const dom = editor?.view.dom
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
      const label = `${clip(name, 48)} isn’t here`
      const width = Math.min(520, Math.max(220, label.length * 7 + 56))
      const text = label.replace(/[<&>"]/g, (one) => `&#${one.charCodeAt(0)};`)
      img.dataset.missing = "1"
      img.alt = label
      // Grey at part strength reads calmly on a light page and a dark one.
      img.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><rect x=".5" y=".5" width="${width - 1}" height="63" rx="10" fill="#888" fill-opacity=".06" stroke="#888" stroke-opacity=".35" stroke-dasharray="4 4"/><g fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(18 23)"><rect width="18" height="18" rx="3"/><circle cx="6" cy="6" r="1.5"/><path d="m18 12-4-4-9 9"/></g><text x="48" y="33" dominant-baseline="middle" font-family="-apple-system, system-ui" font-size="13" fill="#888">${text}</text></svg>`)}`
    }
    const onError = (event: Event): void => void (event.target instanceof HTMLImageElement && missing(event.target))
    dom.addEventListener("error", onError, true)
    // Any that failed before this was listening.
    dom.querySelectorAll("img").forEach((img) => img.complete && !img.naturalWidth && img.src && missing(img))
    return () => dom.removeEventListener("error", onError, true)
  }, [editor])

  // Known by its id while open, so a heading link to this same document lands
  // here rather than waiting for an editor that will never mount.
  useEffect(() => (documentId != null && editor ? showingDocument(String(documentId), editor) : undefined), [editor, documentId])

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
      const first = editor.isDestroyed ? null : editor.view.dom.firstElementChild
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
      if (editor && !editor.isDestroyed) latest.current?.(editor.getJSON(), editor)
    }
    window.addEventListener("pagehide", flush)
    // Asked by a note about to move to another window: its words go first.
    window.addEventListener("mindflow:flush", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("mindflow:flush", flush)
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
          {/* The four text marks behind one button, as Linear keeps them, with
              their keys beside each; code stays out on its own. */}
          <ToolbarGroup>
            {editor && <MarkMenu editor={editor} />}
            <MarkButton type="code" showTooltip={false} />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {editor && <ScriptMenu editor={editor} />}
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {/* A pasted address over a selection makes a link, and @ or [[ link a note;
                on a link already made, these edit it or take it off. */}
            {editor && <LinkButtons editor={editor} />}
            <LinkToBookmarkButton editor={editor} />
            {editor && <HighlightMenu editor={editor} />}
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {/* A small row of its own, opened beneath the button: not the
                fixed toolbar's Radix dropdown, which takes the focus and makes
                the bar hide itself. */}
            {editor && <AlignMenu editor={editor} />}
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

  return (
    <div
      ref={wrapperRef}
      className={[
        "relative mindflow-editor-wrapper",
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
      style={style}
    >
      <EditorContext.Provider value={{ editor }}>
        {sourceOpen ? <SourceView editor={editor} /> : null}

        <ImageMenu editor={editor} />
        <ImageLook editor={editor} />

        {shape === "document" && <TableOfContents editor={editor} shown={outline} />}
        <TableControls editor={editor} />
        <TableMenu editor={editor} />

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
            // page drops the insert control, mindflow-editor.scss).
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
              +
            </button>

            <button
              type="button"
              tabIndex={-1}
              className="tiptap-drag-handle-grip"
              data-silent=""
              aria-label="Block actions"
              onClick={() => {
                setMenuAt(null)
                setSpelling(null)
                setMenuOpen(true)
              }}
            >
              <GripVertical />
            </button>

            <BlockMenu
              editor={editor}
              targetRef={blockTarget}
              spelling={spelling}
              at={menuAt}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              documentId={documentId}
            />
          </DragHandle>
        )}

        {selectionItems !== false && (
          <SelectionMenu editor={editor}>
            {selectionItems ?? defaultSelection}
            {/* The host's own actions on a selection, after the editor's. */}
            {toolbar !== false && toolbar?.selectionExtra && editor ? toolbar.selectionExtra(editor) : null}
          </SelectionMenu>
        )}

        {/* A finish line, when this piece has a word aim (word-aim.tsx). */}
        {shape === "document" && !readOnly && documentId != null && <WordAim editor={editor} id={String(documentId)} />}

        <EditorContent
          editor={editor}
          role="presentation"
          className={`mindflow-editor-content relative p-3 overflow-auto${
            smoothScroll ? " is-smooth" : ""
          }${typing ? " is-typewriter" : ""}`}
          ref={contentRef}
        />
        {/* After the words, inside the same scroll: added beside ProseMirror's
            own element, never inside it. */}
        {after && afterBox && createPortal(after, afterBox)}

        <LinkPreview editor={editor} />
        <LinkEditor editor={editor} />
        {editor && <TaskLinkMenu editor={editor} />}
        {!handles && editor && <SpellingMenu editor={editor} spelling={spelling} at={menuAt} onClose={() => setSpelling(null)} />}

        {/* How much is written, quietly in the corner of a document. */}
        {shape === "document" && !readOnly && (foot ? foot(editor) : <WordCount editor={editor} />)}

        {/* The dock earns its place only if something is in it. */}
        {(fixedItems !== false || search) && (
          // The holder spans the editor's width but is see-through to the
          // pointer, so only its controls catch clicks, not the lines under it.
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 m-auto">
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
      </EditorContext.Provider>
    </div>
  )
}
/**
 * Where a link points, while the pointer is on it.
 *
 * The browser's own tooltip says the same thing, but it waits a second, cuts a
 * long URL off at the window edge and looks like nothing else here. This is
 * what Linear shows: the address without its scheme, wrapped rather than
 * truncated, in a box the rest of the app would recognise.
 *
 * Portalled to the body because the editor scrolls: inside it the box would be
 * clipped by the same overflow that makes the document scrollable.
 */
function LinkPreview({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [link, setLink] = useState<{ href: string; top?: number; bottom?: number; left: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    const root = editor.view.dom
    const hide = (): void => setLink(null)

    const show = (event: Event): void => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return hide()

      const box = anchor.getBoundingClientRect()
      setLink({
        // The scheme is the one part nobody is checking, and it costs a line
        // of a wrapped URL.
        href: (anchor.getAttribute("href") ?? "").replace(/^https?:\/\//, ""),
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

    return () => {
      root.removeEventListener("pointerover", show)
      root.removeEventListener("pointerleave", hide)
      window.removeEventListener("scroll", hide, true)
    }
  }, [editor])

  if (!link?.href) return null

  return createPortal(
    <span className="tiptap-link-preview" style={{ top: link.top, bottom: link.bottom, left: link.left }}>
      {link.href}
    </span>,
    document.body
  )
}
