import { IN_WINDOW } from "@/components/suggestion/suggestion-renderer"
import { Extension, type Editor } from "@tiptap/core"
import type { ReactNode } from "react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"

import { findItems } from "@/lib/slash-rank"
import { typedOnly } from "@/lib/typed-suggestion"

/**
 * A `/` menu for inserting blocks.
 *
 * Items are supplied by the app rather than hard-coded here, so anything that
 * needs React state can still be reached. An item that sets `prompt` asks for
 * a value first - the menu swaps to an input and hands the answer to `run`.
 */
export interface SlashItem {
  title: string
  /** Set where two can share a title (two files of one name). */
  key?: string
  /** Section header this item sits under. */
  group: string
  /** The markdown shortcut that does the same thing, shown on the right. */
  hint?: string
  /** Other words that should find it, not shown. */
  keywords?: string[]
  icon?: ReactNode
  /** Whether this converts the current block, so "Turn into" can offer it. */
  turnInto?: boolean
  /** Only offered where this holds. Absent means everywhere. */
  when?: (editor: Editor) => boolean
  /** The question asked, over a box, for a value to collect before running, if one is needed. */
  prompt?: string
  /** Filled in by the menu when the item asked for a value. */
  value?: string
  run: (editor: Editor, value: string) => void
}

interface SlashCommandOptions {
  items: SlashItem[]
  /** Rows that come and go with the book (a file no note uses yet), asked for as you type. */
  more?: (editor: Editor, query: string) => Promise<SlashItem[]>
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
    const { items, render, more } = this.options
    // What the book answered last, for the sync question of whether the menu stays open.
    let extra: SlashItem[] = []
    const offered = (editor: Editor): SlashItem[] => items.filter((item) => item.when?.(editor) ?? true)

    return [
      Suggestion<SlashItem>({
        floatingUi: IN_WINDOW,
        flip: false,
        editor: this.editor,
        char: "/",
        // The live `/query` is already wrapped in a span by the plugin; this
        // only names it, so the stylesheet can make it look like the chip it
        // behaves as - a thing you are inside of, not text you have typed.
        decorationClass: "tiptap-slash-token",
        // Spaces are part of what you look for, `/heading 2`, `/insert row
        // above`. A space straight after the `/`, two in a row, or words that
        // no longer find anything close it: that is writing, not a search.
        allowSpaces: true,
        shouldShow: typedOnly(({ editor, query }) =>
          !query.includes(" ") ||
          (!/^\s|\s\s/.test(query) && findItems([...offered(editor), ...extra], query).length > 0)),
        items: async ({ editor, query }) => {
          extra = (await more?.(editor, query)) ?? []
          return [...findItems(offered(editor), query), ...extra]
        },
        command: ({ editor, range, props }) => {
          // The item runs against a document that no longer holds the `/query`.
          // Taking the `/query` away is not an edit of the note, so it is kept out of the undo history: one ⌘Z after
          // a command takes back what the command made and never brings "/code" back into the words. (Recorded, a
          // pick made more than half a second after the last letter, as most are, needed two ⌘Z, the first one
          // leaving the search text in the note.)
          editor.chain().focus().deleteRange(range).setMeta("addToHistory", false).run()
          props.run(editor, props.value ?? "")
        },
        render,
      }),
    ]
  },
})
