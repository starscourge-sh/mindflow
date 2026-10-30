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
    // A paste brings words in; it does not type a mark. Nor does a note being loaded or tidied as it opens (a
    // gem ending "#astrophysics" opened its tag menu, and its sound, on every open): typed is a change that ends at the caret.
    const typed = props.transaction.getMeta("uiEvent") !== "paste" && endsAtCaret(props.transaction)
    const shown = !inCode && (typed || open.get(props.editor) === true) && (also?.(props) ?? true)
    open.set(props.editor, shown)
    return shown
  }
}

/** Whether some text the transaction put in ends where the caret now sits, as a key just typed does. */
function endsAtCaret(transaction: Transaction): boolean {
  const caret = transaction.selection.from
  return transaction.mapping.maps.some((map, index) => {
    let hit = false
    map.forEach((_from, _to, start, end) => void (end > start && transaction.mapping.slice(index + 1).map(end) === caret && (hit = true)))
    return hit
  })
}
