import { useRef } from "react"
import type { Editor, JSONContent } from "@tiptap/core"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import { ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { HaligtreeEditor, type HaligtreeEditorProps } from "@/components/haligtree/haligtree-editor"

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
 * A field of plain words on a page (a month's focus, a week's intentions), written in the one editor, so it keys as
 * a note does: Vim when Vim is on, the same undo, selection and spelling. It hands back plain text, a line each
 * paragraph, when the caret leaves it. `line` holds one line, and Return leaves it.
 */
export function PlainField({ value, placeholder, label, line = false, className = "", onSave }: {
  value: string
  placeholder: string
  label: string
  line?: boolean
  className?: string
  onSave: (text: string) => void
}): React.JSX.Element {
  const editor = useRef<Editor | null>(null)
  const kept = useRef(value)
  kept.current = value
  const leave = (): void => {
    const one = editor.current
    if (!one || one.isDestroyed) return
    const text = one.state.doc.textBetween(0, one.state.doc.content.size, "\n").trim()
    if (text !== kept.current.trim()) onSave(text)
  }
  return (
    <div data-plain-field={label} aria-label={label} className={`min-w-0 ${className}`}
      onBlur={(event) => {
        // Into its own menu or the selection bar: still being written.
        const into = event.relatedTarget as Element | null
        if (into && (event.currentTarget.contains(into) || into.closest("[role=menu], .tiptap-suggestion-popup"))) return
        leave()
      }}
      onKeyDown={(event) => {
        if (line && event.key === "Enter" && !event.shiftKey) editor.current?.commands.blur()
      }}>
      <HaligtreeEditor
        {...BARE}
        vim={undefined}
        shape={line ? "line" : "document"}
        lineNumbers={false}
        math={false}
        marks={[]}
        toolbar={false}
        defaultContent={plainDoc(value, line)}
        placeholder={placeholder}
        // A field, not a page: no word count, no page furniture at its foot.
        foot={() => null}
        smoothScroll={false}
        style={{ "--mf-padding": "0" } as React.CSSProperties}
        onReady={(one) => void (editor.current = one)}
      />
    </div>
  )
}
