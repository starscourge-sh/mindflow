import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import { noteLinkPluginKey, tagPluginKey, type NoteSuggestion } from "@/extensions/note-link"
import { listDirection, step } from "@/lib/menu-keys"

/** The `@` menu: which note to link to. */
const NoteList = forwardRef<SuggestionListHandle, SuggestionProps<NoteSuggestion>>(
  function NoteList({ items, command }, ref) {
    const [selected, setSelected] = useState(0)
    // Moving past the fold brings the row with it, as in the / menu.
    const selectedRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
      selectedRef.current?.scrollIntoView({ block: "nearest" })
    }, [selected])
    useEffect(() => setSelected(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const direction = listDirection(event)
        if (direction) {
          setSelected((was) => step(was, direction, items.length))
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
            <Fragment key={item.id}>
              {item.group && item.group !== items[index - 1]?.group ? (
                <div className="tiptap-slash-menu-group">{item.group}</div>
              ) : null}
              <button
                type="button"
                ref={index === selected ? selectedRef : undefined}
                className={index === selected ? "is-selected" : undefined}
                onMouseEnter={() => setSelected(index)}
                onClick={() => command(item)}
              >
                {item.icon}
                {item.key ? <span className="tiptap-note-link-key">{item.key}</span> : null}
                <span className="tiptap-slash-menu-title tiptap-note-link-title" style={item.tint ? { color: item.tint } : undefined}>
                  {item.label || "Untitled"}
                </span>
                {/* A tag's name first, how often it is used quietly at the end. */}
                {item.hint ? <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{item.hint}</span> : null}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }
)

export const noteLinkRenderer = createSuggestionRenderer(NoteList, noteLinkPluginKey)
export const tagRenderer = createSuggestionRenderer(NoteList, tagPluginKey)
