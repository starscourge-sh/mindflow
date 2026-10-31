import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import { FilePlus } from "lucide-react"

import { EMBED_ASK, embedPluginKey, linkKind, noteLinkPluginKey, tagPluginKey, wikiPluginKey, type NoteSuggestion } from "@/extensions/note-link"
import { listDirection, step, revealRow } from "@/lib/menu-keys"
import { realMove } from "@/lib/real-move"
import { TagIcon } from "@/components/haligtree/tag-icon"
import { hoverNote } from "@/components/haligtree/note-preview"

/** The `@` menu: which note to link to. Also drawn under a plain line's @ (at-notes.tsx), with only the rows and the pick. */
export const NoteList = forwardRef<SuggestionListHandle, Pick<SuggestionProps<NoteSuggestion>, "items" | "command">>(
  function NoteList({ items, command }, ref) {
    const [selected, setSelected] = useState(0)
    // Moving past the fold brings the row with it, as in the / menu.
    const selectedRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
      revealRow(selectedRef.current)
    }, [selected])
    useEffect(() => setSelected(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const direction = listDirection(event)
        if (direction) {
          setSelected((was) => step(was, direction, items.length))
          return true
        }
        // ⌘↵ sends what is written, menu open or not: only a plain Return picks.
        if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && items[selected]) {
          command(items[selected])
          return true
        }
        return false
      },
    }))

    if (!items.length) return null

    return (
      <div className="tiptap-slash-menu">
        <div className="tiptap-slash-menu-list mf-more" data-note-side>
          {items.map((item, index) => (
            <Fragment key={`${item.id}#${item.heading ?? ""}#${item.blockIndex ?? ""}`}>
              {item.group && item.group !== items[index - 1]?.group ? (
                <div className={item.group === EMBED_ASK ? "tiptap-slash-menu-ask" : "tiptap-slash-menu-group"}>{item.group}</div>
              ) : null}
              <button
                type="button"
                ref={index === selected ? selectedRef : undefined}
                data-make={item.make || undefined}
                className={index === selected ? "is-selected" : undefined}
                onMouseMove={(event) => realMove(event) && setSelected(index)}
                onClick={() => command(item)}
              >
                {/* A heading row is the heading: its note is the group above. */}
                {item.make ? <FilePlus /> : item.heading || item.blockText ? null : item.icon ?? (item.group === 'Tags' ? <TagIcon tag={item.id} tint={item.tint} className="size-4" /> : null)}
                {item.key && !item.heading && !item.blockText ? <span className="tiptap-note-link-key">{item.key}</span> : null}
                <span {...(item.id && !item.heading && item.group !== "Tags" ? hoverNote(item.id.includes(":") ? item.id.slice(0, item.id.indexOf(":")) : "capture", item.id.includes(":") ? item.id.slice(item.id.indexOf(":") + 1) : item.id) : {})} className="tiptap-slash-menu-title tiptap-note-link-title" style={item.tint ? { color: item.tint } : undefined}>
                  {item.make ? `Make a new note \u201c${item.label}\u201d` : item.heading ? `# ${item.heading}` : item.blockText ? `¶ ${item.blockText}` : item.label || "Untitled"}
                </span>
                {/* A tag's name first, how often it is used quietly at the end. */}
                {item.hint ? <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{item.hint}</span> : null}
                {/* What it is, faintly, so a quote and a task with the same words tell apart. */}
                {!item.heading && !item.blockText && linkKind(item.kind) ? <span className="tiptap-note-link-type">{linkKind(item.kind)!.label}</span> : null}
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
export const wikiRenderer = createSuggestionRenderer(NoteList, wikiPluginKey)
// `![[`: Escape takes the unfinished `![[name` with it, as it would a lone `/`.
export const embedRenderer = createSuggestionRenderer(NoteList, embedPluginKey, { dropOnEscape: true })
