import type { Editor } from "@tiptap/core"
import type { Transaction } from "@tiptap/pm/state"

type Shown = { editor: Editor; query: string; transaction: Transaction }

/**
 * A suggestion list ("/", ":", "@", "#", "[[") opens as you type its mark, as
 * in Notion or Slack, never because the caret came to rest after one already
 * written: clicking into "/endpoint" or "#work" is reading, not asking. Once
 * open it stays open while the caret moves in it. Never in code, where "/" and
 * "#" are what the code says.
 */
export function typedOnly<P extends Shown>(also?: (props: P) => boolean): (props: P) => boolean {
  const open = new WeakMap<Editor, boolean>()
  return (props) => {
    const { $from } = props.transaction.selection
    const inCode = $from.parent.type.spec.code || $from.marks().some((mark) => mark.type.name === "code")
    // A paste brings words in; it does not type a mark.
    const typed = props.transaction.docChanged && props.transaction.getMeta("uiEvent") !== "paste"
    const shown = !inCode && (typed || open.get(props.editor) === true) && (also?.(props) ?? true)
    open.set(props.editor, shown)
    return shown
  }
}
