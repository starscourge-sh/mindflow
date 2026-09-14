import { Extension, type Editor } from "@tiptap/core"
import type { ReactNode } from "react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"

/**
 * A `/` menu for inserting blocks.
 *
 * Items are supplied by the app rather than hard-coded here, so anything that
 * needs React state can still be reached. An item that sets `prompt` asks for
 * a value first - the menu swaps to an input and hands the answer to `run`.
 */
export interface SlashItem {
  title: string
  /** Section header this item sits under. */
  group: string
  /** The markdown shortcut that does the same thing, shown on the right. */
  hint?: string
  icon?: ReactNode
  /** Whether this converts the current block, so "Turn into" can offer it. */
  turnInto?: boolean
  /** Placeholder for the value to collect before running, if one is needed. */
  prompt?: string
  /** Filled in by the menu when the item asked for a value. */
  value?: string
  run: (editor: Editor, value: string) => void
}

export interface SlashCommandOptions {
  items: SlashItem[]
  /** Supplied by the app, which owns the popup rendering. */
  render: NonNullable<SuggestionOptions<SlashItem>["render"]>
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      items: [],
      render: () => ({}),
    }
  },

  addProseMirrorPlugins() {
    const { items, render } = this.options

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        items: ({ query }) => {
          const term = query.toLowerCase()
          return items.filter(
            (item) =>
              item.title.toLowerCase().includes(term) ||
              item.group.toLowerCase().includes(term) ||
              (item.hint?.toLowerCase().includes(term) ?? false)
          )
        },
        command: ({ editor, range, props }) => {
          // The item runs against a document that no longer holds the `/query`.
          editor.chain().focus().deleteRange(range).run()
          props.run(editor, props.value ?? "")
        },
        render,
      }),
    ]
  },
})
