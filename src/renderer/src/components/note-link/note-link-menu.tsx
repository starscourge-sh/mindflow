import { forwardRef, useEffect, useImperativeHandle, useState } from "react"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import { noteLinkPluginKey, type NoteSuggestion } from "@/extensions/note-link"

/** The `@` menu: which note to link to. */
const NoteList = forwardRef<SuggestionListHandle, SuggestionProps<NoteSuggestion>>(
  function NoteList({ items, command }, ref) {
    const [selected, setSelected] = useState(0)
    useEffect(() => setSelected(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((was) => (was + 1) % (items.length || 1))
          return true
        }
        if (event.key === "ArrowUp") {
          setSelected((was) => (was - 1 + items.length) % (items.length || 1))
          return true
        }
        if (event.key === "Enter" && items[selected]) {
          command(items[selected])
          return true
        }
        return false
      },
    }))

    if (!items.length) return null

    return (
      <div className="tiptap-slash-menu">
        <div className="tiptap-slash-menu-list">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === selected ? "is-selected" : undefined}
              onClick={() => command(item)}
            >
              <span className="tiptap-slash-menu-title">
                {item.label || "Untitled"}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }
)

export const noteLinkRenderer = createSuggestionRenderer(NoteList, noteLinkPluginKey)
