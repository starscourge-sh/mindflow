import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { LinkPopover } from "@/components/tiptap-ui/link-popover"
import { ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { MindflowEditor, type MindflowEditorProps } from "@/components/mindflow/mindflow-editor"

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
export function CommentEditor(props: MindflowEditorProps): React.JSX.Element {
  return (
    <MindflowEditor
      {...BARE}
      placeholder="Write a comment"
      marks={["bold", "italic", "strike", "code", "link"]}
      toolbar={{ fixed: false, selection: MARKS_AND_LINK }}
      {...props}
    />
  )
}

/** A description field. A comment with the `/` menu, since it holds real content. */
export function DescriptionEditor(props: MindflowEditorProps): React.JSX.Element {
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
export function LineEditor(props: MindflowEditorProps): React.JSX.Element {
  return (
    <MindflowEditor
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

/**
 * A document's title: a line at input scale, lined up with the body below it.
 *
 * The editor's stylesheet carries that as `is-title`, and this is what applies
 * it. Left to the caller it was a bare string in a `className` with no prop and
 * no type behind it - something nobody finds twice, least of all anyone
 * dropping this editor into their own app.
 */
export function TitleEditor({
  className = "",
  ...props
}: MindflowEditorProps): React.JSX.Element {
  return <LineEditor className={`is-title ${className}`.trim()} {...props} />
}
