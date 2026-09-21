"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import type { JSONContent } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Markdown } from "@tiptap/markdown"
import { Image } from "@tiptap/extension-image"
import { ListItem, TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection, CharacterCount, Placeholder } from "@tiptap/extensions"
import { Mathematics } from "@tiptap/extension-mathematics"
import { FindAndReplace } from "@tiptap/extension-find-and-replace"

// TableKit bundles Table, TableRow, TableHeader and TableCell.
import { TableKit } from "@tiptap/extension-table"
import { Youtube } from "@tiptap/extension-youtube"
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details"
import { DragHandle } from "@tiptap/extension-drag-handle-react"
import { GripVertical } from "lucide-react"
import { offset } from "@floating-ui/react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { ReactNodeViewRenderer, type Editor } from "@tiptap/react"
import { lowlight } from "@/lib/lowlight"
import "katex/dist/katex.min.css"

// --- Extensions ---
import { ObsidianShortcuts } from "@/extensions/obsidian-shortcuts"
import { VimMode } from "@/extensions/vim-mode"
import { Tokens, type TokenPattern } from "@/extensions/tokens"
import { SlashCommand } from "@/extensions/slash-command"
import { ToggleHeading, headingRank } from "@/extensions/toggle-heading"
import { ImageDrop } from "@/extensions/image-drop"
import { ImagePlaceholder } from "@/extensions/image-placeholder"
import { BlockColor } from "@/extensions/block-color"
import { JoinLists } from "@/extensions/join-lists"
import { SelectedNodes } from "@/extensions/selected-nodes"
import { Bookmark } from "@/extensions/bookmark"
import { Attachment } from "@/extensions/attachment"

/** Drive the editor with vim keys. Flip this to turn it off. */
const VIM_MODE_ENABLED = true

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

/**
 * Keep the caret clear of the window edges when an edit scrolls it into view.
 * The bottom figure has to clear the fixed toolbar, which otherwise covers the
 * very strip ProseMirror scrolls the caret into.
 */
/** How long typing has to stop before the document is handed to the caller. */
const SAVE_DEBOUNCE_MS = 500

/** How long the handle stays up after the pointer leaves a block. */
const HANDLE_GRACE_MS = 1000

const CARET_MARGIN = { top: 64, right: 0, bottom: 112, left: 0 }

/**
 * Held still on purpose. `DragHandle` re-registers its ProseMirror plugin when
 * its props change, and registering a plugin destroys every plugin view in the
 * editor - which closed the `/` and `@` menus mid-typing.
 */
const HANDLE_NESTING = {
  rules: [
    {
      id: "detailsParts",
      evaluate: ({ node }: { node: { type: { name: string } } }) =>
        ["detailsSummary", "detailsContent"].includes(node.type.name) ? 1000 : 0,
    },
  ],
}

const HANDLE_POSITION = { middleware: [offset({ mainAxis: 24, crossAxis: 2 })] }

// --- UI Primitives ---
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
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
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import { SelectionMenu } from "@/components/selection/selection-menu"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
} from "@/components/tiptap-ui/color-highlight-popover"
import { MarkDropdownMenu } from "@/components/tiptap-ui/mark-dropdown-menu"
import { TextAlignDropdownMenu } from "@/components/tiptap-ui/text-align-dropdown-menu"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { SearchBar } from "@/components/search/search-bar"
import { TableMenu } from "@/components/table/table-menu"
import { TableControls } from "@/components/table/table-controls"
import { BlockMenu, type BlockTarget } from "@/components/turn-into/block-menu"
// import { WordCount } from "@/components/count/word-count"
import { TableOfContents } from "@/components/toc/table-of-contents"
import { SourceView } from "@/components/source/source-view"
import { NoteLink, type NoteSuggestion } from "@/extensions/note-link"
import { noteLinkRenderer } from "@/components/note-link/note-link-menu"
import { ImageMenu } from "@/components/image/image-menu"
import { CodeBlockView } from "@/components/code/code-block-view"
import { slashRenderer } from "@/components/slash/slash-menu"
import { slashItems } from "@/components/slash/slash-items"
import { EmojiSuggestion } from "@/components/emoji/emoji-suggestion"


// --- Components ---
import { ThemeToggle } from "@/components/mindflow/theme-toggle"
import { EditorToggles } from "@/components/mindflow/editor-toggles"

// --- Styles ---
// The tokens every rule below reads, and the keyframes the menus animate with.
// They travel with the component rather than with the app around it.
import "@/assets/styles/_variables.scss"
import "@/assets/styles/_keyframe-animations.scss"
import "@/components/mindflow/mindflow-editor.scss"


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
   */
  shape?: "line" | "document"
  /**
   * Which toolbars to show and what goes in them. Omit a key for its default
   * contents, pass `false` for no toolbar, or pass your own nodes. The two are
   * independent: neither placement limits what it can hold.
   */
  toolbar?: false | { fixed?: ReactNode | false; selection?: ReactNode | false }
  /** The drag handle beside each block, and the menu it opens. */
  handles?: boolean
  /** The `/` menu. */
  slash?: boolean
  /** The heading outline down the right edge. */
  outline?: boolean
  /** Find, on Mod-f. Registers a window level key handler while mounted. */
  search?: boolean
  /** Vim bindings. */
  vim?: boolean
  /**
   * Which marks exist at all. Not a toolbar setting: a mark left out here is
   * unreachable by shortcut, by markdown, and by pasting, because the schema
   * has nowhere to put it.
   *
   * Defaults to everything for a document, and to bold, italic, strike and
   * code for a line.
   */
  marks?: MarkName[]
  /**
   * Added to the editor's own box. Padding is a variable rather than a fixed
   * rule, so `--mf-padding` set from here or from `style` wins normally.
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
   */
  tokens?: TokenPattern[]
  /**
   * Read once, at mount. To show a different document, remount with a `key`.
   * Defaults to empty: a default document would be written over the caller's
   * note by the first keystroke while their note was still loading.
   */
  defaultContent?: JSONContent | string
  placeholder?: string
  /** Start with the source panel open. It also toggles on Mod-Alt-s. */
  showSource?: boolean
  /**
   * Which notes the `@` menu offers. The editor has no idea what a note is, so
   * searching is the app's job; without this, `@` simply finds nothing.
   */
  findNotes?: (query: string) => NoteSuggestion[] | Promise<NoteSuggestion[]>
  /** A note link was clicked. The editor reports; the app navigates. */
  onOpenNote?: (id: string) => void
  /**
   * The document, debounced. JSON rather than HTML: node attributes - a folded
   * heading's rank, a block's colour - are the point, and JSON keeps them
   * exactly. The editor comes with it, for a caller that wants plain text or
   * HTML as well without holding its own reference.
   */
  onChange?: (doc: JSONContent, editor: Editor) => void
}

export function MindflowEditor({
  defaultContent = "",
  placeholder = "Write, type '/' for commands…",
  showSource = false,
  shape = "document",
  toolbar,
  handles = true,
  slash = true,
  outline = true,
  search = true,
  vim = VIM_MODE_ENABLED,
  marks,
  className = "",
  style,
  onSubmit,
  tokens = [],
  findNotes = () => [],
  onOpenNote,
  onChange,
}: MindflowEditorProps = {}): React.JSX.Element {

  const [searchOpen, setSearchOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(showSource)

  const rememberBlock = useCallback(
    ({ node, pos }: { node: ProseMirrorNode | null; pos: number }): void => {
      blockTarget.current = node
        ? { pos, name: node.type.name, level: headingRank(node) ?? undefined }
        : null
    },
    []
  )

  const finder = useLatest(findNotes)
  const opener = useLatest(onOpenNote)
  // @tiptap/react already routes `onUpdate` to the newest props. The ref is for
  // the teardown effect below, which is keyed on `[editor]` and would otherwise
  // close over the callback from the render that created the editor.
  const latest = useLatest(onChange)
  // Held from the first render: the extension captures its patterns when the
  // editor is built, so a newer prop would tint what is not being matched.
  const [held] = useState(tokens)
  const allowed = marks ?? (shape === "line" ? LINE_MARKS : ALL_MARKS)
  const has = (mark: MarkName): boolean => allowed.includes(mark)
  const submit = useLatest(onSubmit)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Which block the drag handle is pointing at, so its menu needs no selection.
  // A ref rather than state: `onNodeChange` fires on every pointer move across a
  // block, and re-rendering the editor that often makes the handle flicker.
  const blockTarget = useRef<BlockTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        // The shape is on the element too. Both editors carry `mindflow-editor`
        // now, so without this there is no way to tell a title from a document
        // in CSS or from outside.
        class: shape === "line" ? "mindflow-editor is-line" : "mindflow-editor",
      },
      // Return commits a single line rather than doing nothing. Guarded on
      // composition, so accepting a Japanese candidate is not a submit.
      handleKeyDown: (_view, event) => {
        if (shape !== "line" || !submit.current) return false
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return false
        event.preventDefault()
        submit.current()
        return true
      },
      // Start scrolling before the caret reaches the edge, and leave a margin
      // once it has, so edits never happen just out of sight.
      scrollThreshold: CARET_MARGIN,
      scrollMargin: CARET_MARGIN,
      // A contenteditable swallows link clicks, so a bookmark card has to open
      // itself. setWindowOpenHandler in main sends it to the real browser.
      handleClick: (_view, _pos, event) => {
        const href = (event.target as HTMLElement | null)
          ?.closest("a[data-bookmark]")
          ?.getAttribute("href")
        if (!href) return false
        window.open(href, "_blank", "noopener")
        return true
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
        },
      }),
      ...(shape === "line" ? [Document.extend({ content: "paragraph" })] : []),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // A bullet turns into a toggle in place, the way Notion does it: the item
      // keeps its spot in the list and its children become what the toggle
      // hides. That needs a toggle to be a legal first child.
      ListItem.extend({ content: "(paragraph|details) block*" }),
      TaskList,
      TaskItem.configure({ nested: true }).extend({
        content: "(paragraph|details) block*",
      }),
      ...(has("highlight") ? [Highlight.configure({ multicolor: true })] : []),
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
      }),
      Typography,
      ...(has("superscript") ? [Superscript] : []),
      ...(has("subscript") ? [Subscript] : []),
      Selection,
      ...(search ? [FindAndReplace.configure({ injectCSS: false })] : []),
      TableKit.configure({ table: { resizable: true, cellMinWidth: 64 } }),
      Bookmark,
      Attachment,
      // Gives the editor `storage.markdown.getMarkdown()`, used by Export.
      Markdown,
      // Through refs, not the props directly: extensions are configured once,
      // when the editor is built, and the note list is usually still loading
      // then. Captured that early, `@` would search an empty list forever.
      NoteLink.configure({
        findNotes: (query) => finder.current(query),
        onOpenNote: (id) => opener.current?.(id),
        render: noteLinkRenderer,
      }),
      // `enableTabIndentation` is the extension's own Tab handling: it indents
      // every selected line, where a hand-rolled insert replaces the selection.
      CodeBlockLowlight.extend({
        addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
      }).configure({
        lowlight,
        enableTabIndentation: true,
        tabSize: 2,
      }),
      Youtube.configure({ width: 640, height: 360 }),
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
      Mathematics,
      ToggleHeading,
      ImageDrop,
      BlockColor,
      JoinLists,
      SelectedNodes,
      ObsidianShortcuts.configure({
        onToggleSource: () => setSourceOpen((open) => !open),
      }),
      VimMode.configure({
        enabled: vim,
        // A line has nowhere for o, O, V or dd to go.
        singleLine: shape === "line",
        onSearch: () => setSearchOpen(true),
      }),
      ...(tokens.length ? [Tokens.configure({ patterns: held })] : []),
      ImagePlaceholder,
    ],
    content: defaultContent,
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
  useEffect(() => {
    const flush = (): void => {
      if (!pending.current) return
      clearTimeout(pending.current)
      pending.current = undefined
      if (editor && !editor.isDestroyed) latest.current?.(editor.getJSON(), editor)
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
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
          <ToolbarGroup>
            {(["bold", "italic", "underline", "strike", "code"] as const).map((type) => (
              <MarkButton key={type} type={type} showTooltip={false} />
            ))}
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {(["superscript", "subscript"] as const).map((type) => (
              <MarkButton key={type} type={type} showTooltip={false} />
            ))}
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <LinkPopover showTooltip={false} autoOpenOnLinkActive={false} />
            <ColorHighlightPopover showTooltip={false} />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {/* Buttons, not the dropdown the fixed toolbar uses. A Radix menu
                takes focus when it opens, the editor blurs, and the bubble
                hides itself - taking with it the button the menu was measuring
                against, so the menu landed in the corner. The popovers beside
                this one never move focus, so they are unaffected. */}
            {(["left", "center", "right"] as const).map((align) => (
              <TextAlignButton key={align} align={align} showTooltip={false} />
            ))}
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
                  aligns={["left", "center", "right", "justify"]}
                  showTooltip={false}
                />
              </ToolbarGroup>
              <Spacer />
              <ToolbarGroup>
                <EditorToggles
                  editor={editor}
                  sourceOpen={sourceOpen}
                  onToggleSource={() => setSourceOpen((open) => !open)}
                />
                <ThemeToggle />
              </ToolbarGroup>
    </>
  )

  return (
    <div
      className={[
        "relative mindflow-editor-wrapper",
        // A line hugs its text. Only a document needs to fill what holds it.
        shape === "line" ? "is-line" : "",
        sourceOpen ? "has-source" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <EditorContext.Provider value={{ editor }}>
        {sourceOpen ? <SourceView editor={editor} /> : null}

        <ImageMenu editor={editor} />

        {outline && <TableOfContents editor={editor} />}
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
            // still inside the 3rem the editor leaves on the left.
            computePositionConfig={HANDLE_POSITION}
          >
            <button
              ref={watchHandle}
              type="button"
              tabIndex={-1}
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
              aria-label="Block actions"
              onClick={() => setMenuOpen(true)}
            >
              <GripVertical />
            </button>

            <BlockMenu
              editor={editor}
              targetRef={blockTarget}
              open={menuOpen}
              onOpenChange={setMenuOpen}
            />
          </DragHandle>
        )}

        {selectionItems !== false && (
          <SelectionMenu editor={editor}>{selectionItems ?? defaultSelection}</SelectionMenu>
        )}

        <EditorContent
          editor={editor}
          role="presentation"
          className="mindflow-editor-content relative p-3 overflow-auto"
        />

        {/* The dock earns its place only if something is in it. */}
        {(fixedItems !== false || search) && (
          <div className="absolute inset-x-0 bottom-0 z-50 m-auto bg-linear-to-t from-[var(--accent)]/40">
          <div className="w-full flex flex-col gap-1 items-center py-3 select-none">
            {/* A grid row rather than a height: `height: auto` cannot be
                transitioned, but `0fr` to `1fr` can, so the gradient above
                grows and shrinks with the box instead of jumping. */}
            {search && (
              <div
                className="grid w-full justify-items-center transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: searchOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
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
                className="rounded-xl border-1 shadow"
                style={{ background: 'var(--accent)' }}
              >
                {fixedItems ?? defaultFixed}
              </Toolbar>
            )}
            {/* <WordCount editor={editor} /> */}
            </div>
          </div>
        )}
      </EditorContext.Provider>
    </div>
  )
}

