"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lowlight } from "@/lib/lowlight"
import "katex/dist/katex.min.css"

// --- Extensions ---
import { ObsidianShortcuts } from "@/extensions/obsidian-shortcuts"
import { VimMode } from "@/extensions/vim-mode"
import { SlashCommand } from "@/extensions/slash-command"
import { ToggleHeading, headingRank } from "@/extensions/toggle-heading"
import { ImageDrop } from "@/extensions/image-drop"
import { ImagePlaceholder } from "@/extensions/image-placeholder"
import { BlockColor } from "@/extensions/block-color"
import { SelectedNodes } from "@/extensions/selected-nodes"
import { Bookmark } from "@/extensions/bookmark"
import { Attachment } from "@/extensions/attachment"

/** Drive the editor with vim keys. Flip this to turn it off. */
const VIM_MODE_ENABLED = true

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


export interface MindflowEditorProps {
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
   * exactly.
   */
  onChange?: (doc: JSONContent) => void
}

export function MindflowEditor({
  defaultContent = "",
  placeholder = "Write, type '/' for commands…",
  showSource = false,
  findNotes = () => [],
  onOpenNote,
  onChange,
}: MindflowEditorProps = {}) {

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

  const finder = useRef(findNotes)
  const opener = useRef(onOpenNote)
  finder.current = findNotes
  opener.current = onOpenNote
  // @tiptap/react already routes `onUpdate` to the newest props. The ref is for
  // the teardown effect below, which is keyed on `[editor]` and would otherwise
  // close over the callback from the render that created the editor.
  const latest = useRef(onChange)
  latest.current = onChange
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

  const watchHandle = (button: HTMLButtonElement | null) => {
    insert.current = button
    detach.current?.()
    detach.current = undefined

    const handle = button?.parentElement
    if (!handle) return

    let timer: ReturnType<typeof setTimeout>
    const sync = () => {
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
        class: "mindflow-editor",
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
        // Replaced below so a list item can hold a toggle as its first child.
        listItem: false,
        horizontalRule: false,
        // Only h1-h4 are styled; an h5 would render as a paragraph.
        heading: { levels: [1, 2, 3, 4] },
        // Replaced by the highlighting version below.
        codeBlock: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
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
      Highlight.configure({ multicolor: true }),
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
      Superscript,
      Subscript,
      Selection,
      FindAndReplace.configure({ injectCSS: false }),
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
      SlashCommand.configure({ render: slashRenderer, items: slashItems }),
      EmojiSuggestion,
      Mathematics,
      ToggleHeading,
      ImageDrop,
      BlockColor,
      SelectedNodes,
      ObsidianShortcuts.configure({
        onToggleSource: () => setSourceOpen((open) => !open),
      }),
      VimMode.configure({
        enabled: VIM_MODE_ENABLED,
        onSearch: () => setSearchOpen(true),
      }),
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
        latest.current?.(instance.getJSON())
      }, SAVE_DEBOUNCE_MS)
    },
  })

  // Unmount covers switching notes with a `key`; `pagehide` covers closing the
  // window, which never unmounts anything.
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return
      clearTimeout(pending.current)
      pending.current = undefined
      if (editor && !editor.isDestroyed) latest.current?.(editor.getJSON())
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [editor])

  return (
    <div
      className={`relative mindflow-editor-wrapper${sourceOpen ? " has-source" : ""}`}
    >
      <EditorContext.Provider value={{ editor }}>
        {sourceOpen ? <SourceView editor={editor} /> : null}

        <ImageMenu editor={editor} />

        <TableOfContents editor={editor} />
        <TableControls editor={editor} />
        <TableMenu editor={editor} />

        {editor && (
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

        {/* What you can do to a run of text. Turn into is not here: it acts on a
            whole block, and the handle beside that block already offers it. */}
        <SelectionMenu editor={editor}>
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
        </SelectionMenu>

        <EditorContent
          editor={editor}
          role="presentation"
          className="mindflow-editor-content relative p-3 overflow-auto"
        />

        <div className="absolute inset-x-0 bottom-0 z-50 m-auto bg-linear-to-t from-[var(--accent)]/40">
          <div className="w-full flex flex-col gap-1 items-center py-3 select-none">
            {/* A grid row rather than a height: `height: auto` cannot be
                transitioned, but `0fr` to `1fr` can, so the gradient above
                grows and shrinks with the box instead of jumping. */}
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

            <Toolbar className="rounded-xl border-1 shadow"
              style={{ background: 'var(--accent)' }}>
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
            </Toolbar>
            {/* <WordCount editor={editor} /> */}
          </div>
        </div>
      </EditorContext.Provider>
    </div>
  )
}

