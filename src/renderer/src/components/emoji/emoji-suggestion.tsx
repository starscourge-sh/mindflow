import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react"
import { listDirection } from "@/lib/menu-keys"
import {
  Emoji,
  EmojiSuggestionPluginKey,
  type EmojiItem,
} from "@tiptap/extension-emoji"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import { realMove } from "@/lib/real-move"

/**
 * `:` emoji autocomplete.
 *
 * The extension already owns the trigger character and the insertion; what it
 * leaves to the app is which emoji to offer and how to draw the list.
 */

const MAX_RESULTS = 8

const EmojiList = forwardRef(function EmojiList(
  { items, command }: SuggestionProps<EmojiItem>,
  ref: ForwardedRef<SuggestionListHandle>
) {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [items])

  const pick = (index: number) => {
    const item = items[index]
    if (item) command({ name: item.name })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      // Ctrl+K and Ctrl+J as well as the arrows, as in every other menu.
      const way = listDirection(event)
      const back =
        event.key === "ArrowLeft" ||
        way === "up" ||
        // Tab completes; Shift+Tab steps back rather than being swallowed
        // by whatever handles it downstream.
        (event.key === "Tab" && event.shiftKey)
      if (back) {
        setSelected((current) => (current + items.length - 1) % items.length)
        return true
      }
      if (event.key === "ArrowRight" || way === "down") {
        setSelected((current) => (current + 1) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pick(selected)
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div className="tiptap-emoji-list">
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          title={`:${item.name}:`}
          className={index === selected ? "is-selected" : undefined}
          onMouseMove={(event) => realMove(event) && setSelected(index)}
          onClick={() => pick(index)}
        >
          {item.emoji}
        </button>
      ))}
    </div>
  )
})

// Which emoji this screen can draw is worked out once per window, not once
// per editor: it goes through the whole emoji list (about 25 ms), and a page
// of notes builds an editor for each one.
let support: unknown
const OnceEmoji = Emoji.extend({
  addStorage() {
    support ??= this.parent?.()
    return support as ReturnType<NonNullable<typeof this.parent>>
  },
})

export const EmojiSuggestion = OnceEmoji.configure({
  enableEmoticons: true,
  suggestion: {
    items: ({ editor, query }) => {
      const term = query.toLowerCase()
      const { emojis, isSupported } = editor.storage.emoji
      return emojis
        .filter(
          (item: EmojiItem) =>
            isSupported(item) &&
            (item.shortcodes.some((code) => code.startsWith(term)) ||
              item.tags.some((tag) => tag.startsWith(term)))
        )
        .slice(0, MAX_RESULTS)
    },

    render: createSuggestionRenderer(EmojiList, EmojiSuggestionPluginKey),
  },
})
