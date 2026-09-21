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

/** Marks and a link, which is as much as a small box has room for. */
const SMALL_SELECTION = (
  <>
    <ToolbarGroup>
      {(["bold", "italic", "strike", "code"] as const).map((type) => (
        <MarkButton key={type} type={type} showTooltip={false} />
      ))}
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <LinkPopover showTooltip={false} autoOpenOnLinkActive={false} />
    </ToolbarGroup>
  </>
)

/**
 * A comment. Several paragraphs if it needs them, formatting on selection, and
 * none of what a page carries around it: no toolbar along the bottom, no drag
 * handles, no outline, and no Mod-f, which listens on the whole window and
 * would open the find box in every other comment on the page at once.
 */
export function CommentEditor(props: MindflowEditorProps): React.JSX.Element {
  return (
    <MindflowEditor
      placeholder="Write a comment"
      toolbar={{ fixed: false, selection: SMALL_SELECTION }}
      handles={false}
      slash={false}
      outline={false}
      search={false}
      vim={false}
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
 */
export function LineEditor(props: MindflowEditorProps): React.JSX.Element {
  return (
    <CommentEditor
      shape="line"
      placeholder="Title"
      toolbar={{ fixed: false, selection: SMALL_SELECTION }}
      {...props}
    />
  )
}
