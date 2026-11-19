import { useEffect, useImperativeHandle, useRef } from "react"
import type { Editor, JSONContent } from "@tiptap/core"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import { ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { HaligtreeEditor, type HaligtreeEditorProps } from "@/components/haligtree/haligtree-editor"
import { vimPluginKey } from "@/extensions/vim-mode"

/**
 * The editor, dressed for a few common jobs.
 *
 * Each of these is only a set of defaults over the one component: there is no
 * second editor underneath. Anything a preset sets can be overridden by passing
 * the prop yourself, and anything it leaves out keeps the full editor's
 * behaviour.
 */

/** The four marks a small box has room for. */
const MARKS = (
  <ToolbarGroup>
    {(["bold", "italic", "strike", "code"] as const).map((type) => (
      <MarkButton key={type} type={type} showTooltip={false} />
    ))}
  </ToolbarGroup>
)

/** The same, plus a link, for a box whose text can point somewhere. */
const MARKS_AND_LINK = (
  <>
    {MARKS}
    <ToolbarSeparator />
    <ToolbarGroup>
      <LinkPopover showTooltip={false} autoOpenOnLinkActive={false} />
    </ToolbarGroup>
  </>
)

/**
 * Everything a page carries that a field in a form does not.
 *
 * `search` among them because Mod-f listens on the whole window, so one box
 * that keeps it opens the find bar in every other box on the page at once.
 */
const BARE = {
  handles: false,
  slash: false,
  outline: false,
  search: false,
  vim: false,
} as const

/**
 * A comment. Several paragraphs if it needs them, formatting on selection, and
 * none of the chrome a page carries around it.
 */
export function CommentEditor(props: HaligtreeEditorProps): React.JSX.Element {
  return (
    <HaligtreeEditor
      {...BARE}
      placeholder="Write a comment"
      marks={["bold", "italic", "strike", "code", "link"]}
      toolbar={{ fixed: false, selection: MARKS_AND_LINK }}
      {...props}
    />
  )
}

/** A description field. A comment with the `/` menu, since it holds real content. */
export function DescriptionEditor(props: HaligtreeEditorProps): React.JSX.Element {
  return (
    <CommentEditor placeholder="Add a description" slash {...props} />
  )
}

/**
 * One line, for a title or a message box. The schema holds a single paragraph,
 * so Return has nowhere to go and a paste of several blocks flattens into it.
 *
 * Built on the editor rather than on `CommentEditor`: the two share only the
 * chrome they switch off, and inheriting one from the other says a title is a
 * kind of comment, which it is not.
 */
export function LineEditor(props: HaligtreeEditorProps): React.JSX.Element {
  return (
    <HaligtreeEditor
      {...BARE}
      shape="line"
      placeholder="Title"
      // No link: a title is a name, not somewhere to point. Left out of the
      // marks as well as the toolbar, or it arrives by shortcut anyway.
      marks={["bold", "italic", "strike", "code"]}
      toolbar={{ fixed: false, selection: MARKS }}
      {...props}
    />
  )
}

/** Plain words as the editor's document: one paragraph a line, the empty ones kept. */
const plainDoc = (text: string, line: boolean): JSONContent => {
  const para = (words: string): JSONContent => (words ? { type: "paragraph", content: [{ type: "text", text: words }] } : { type: "paragraph" })
  return { type: "doc", content: line ? [para(text.replace(/\n+/g, " "))] : text.split("\n").map(para) }
}

/**
 * What a caller holds of a PlainField, shaped as the textarea it replaced was used: put the caret in it, take it out,
 * read its words, and place the caret (setSelectionRange, counted in characters with a line break as one).
 */
export type PlainHandle = {
  focus: () => void
  blur: () => void
  readonly value: string
  setSelectionRange: (from: number, to: number) => void
}

/** The words of the field, a line a paragraph. */
const plainOf = (editor: Editor): string => editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n")

/**
 * A field of plain words (a month's focus, a thought under a note, a goal's log), written in the one editor, so it
 * keys as a note does: Vim when Vim is on, the same undo, selection and spelling. It hands back plain text, a line each
 * paragraph: on every change (`onChange`, for a field whose words the caller holds as `value`) and when the caret
 * leaves it (`onSave`). `line` holds one line, and Return leaves it. `onKey` sees a key before the editor does (Return
 * to keep, ↑ for what came before, Escape to put it away) and takes it by `preventDefault`; Escape goes to Vim first
 * while Vim has a use for it (leaving insert mode, cancelling a half-typed command).
 */
export function PlainField({ value, placeholder, label, line = false, className = "", autoFocus = false, vimStart = "normal", style, handle, onChange, onSave, onLeave, onKey, ...rest }: {
  value: string
  /** A field summoned to write in (a thought, a log) starts Vim in insert mode, as quick capture does; a page's field in normal. */
  vimStart?: "normal" | "insert"
  placeholder: string
  label: string
  line?: boolean
  className?: string
  style?: React.CSSProperties
  autoFocus?: boolean
  handle?: React.Ref<PlainHandle | null>
  onChange?: (text: string) => void
  onSave?: (text: string) => void
  /** The caret gone elsewhere (not into its own menus): a field that closes when left empty. */
  onLeave?: () => void
  onKey?: (event: KeyboardEvent) => void
} & { [data: `data-${string}`]: string | boolean | undefined }): React.JSX.Element {
  const editor = useRef<Editor | null>(null)
  const kept = useRef(value)
  kept.current = value
  const changed = useRef(onChange)
  changed.current = onChange
  const keyed = useRef(onKey)
  keyed.current = onKey
  // The caller's words changed by the caller (cleared once kept, a thought put back to reword): laid in. Its own
  // typing comes back the same, and lays nothing in.
  useEffect(() => {
    const one = editor.current
    if (!one || one.isDestroyed || plainOf(one) === value) return
    one.commands.setContent(plainDoc(value, line), { emitUpdate: false })
    // Still being written in (a thought put back to reword): the caret at the end of the words laid in, the focus left as it is.
    if (one.isFocused) one.commands.setTextSelection(one.state.doc.content.size - 1)
  }, [value, line])
  useImperativeHandle(handle, () => ({
    focus: () => void editor.current?.commands.focus(),
    blur: () => void editor.current?.commands.blur(),
    get value() {
      return editor.current ? plainOf(editor.current) : kept.current
    },
    setSelectionRange: (from: number, to: number) => {
      const one = editor.current
      if (!one) return
      // Characters to places in the document: each paragraph after the first starts two places on (its close and open).
      const place = (at: number): number => {
        let left = at
        let pos = one.state.doc.content.size - 1
        one.state.doc.forEach((block, offset) => {
          if (left < 0) return
          const size = block.textContent.length
          if (left <= size) (pos = offset + 1 + left), (left = -1)
          else left -= size + 1
        })
        return pos
      }
      one.chain().focus().setTextSelection({ from: place(from), to: place(to) }).run()
    }
  }), [])
  return (
    <div {...rest} data-plain-field={label} aria-label={label} className={`min-w-0 ${className}`} style={style}
      onBlur={(event) => {
        // Into its own menu or the selection bar: still being written.
        const into = event.relatedTarget as Element | null
        if (into && (event.currentTarget.contains(into) || into.closest("[role=menu], .tiptap-suggestion-popup"))) return
        onLeave?.()
        const one = editor.current
        if (!one || one.isDestroyed || !onSave) return
        const text = plainOf(one).trim()
        if (text !== kept.current.trim()) onSave(text)
      }}>
      <HaligtreeEditor
        {...BARE}
        vim={undefined}
        vimStart={vimStart}
        plain
        shape={line ? "line" : "document"}
        lineNumbers={false}
        math={false}
        marks={[]}
        toolbar={false}
        autofocus={autoFocus ? "end" : false}
        defaultContent={plainDoc(value, line)}
        placeholder={placeholder}
        // A field, not a page: no word count, no page furniture at its foot.
        foot={() => null}
        smoothScroll={false}
        style={{ "--mf-padding": "0" } as React.CSSProperties}
        onKeyDown={(event) => {
          const one = editor.current
          // Escape is Vim's while it means something to it: out of insert or visual mode, or a half-typed command away.
          const vim = one ? vimPluginKey.getState(one.state) : null
          if (event.key === "Escape" && vim?.enabled && (vim.mode !== "normal" || vim.operator || vim.count || vim.pendingFind || vim.pendingG || vim.pendingZ || vim.pendingReplace || vim.pendingTextObject)) return false
          if (line && event.key === "Enter" && !event.shiftKey && !keyed.current) return (one?.commands.blur(), true)
          keyed.current?.(event)
          return event.defaultPrevented
        }}
        onReady={(one) => {
          editor.current = one
          one.on("update", () => changed.current?.(plainOf(one)))
        }}
      />
    </div>
  )
}
