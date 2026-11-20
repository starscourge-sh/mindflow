import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import { FilePlus } from "lucide-react"

import { EMBED_ASK, LINK_ASK, embedPluginKey, saidByPluginKey, noteLinkPluginKey, tagPluginKey, wikiPluginKey, type NoteSuggestion } from "@/extensions/note-link"
import { listDirection, step, revealRow } from "@/lib/menu-keys"
import { realMove } from "@/lib/real-move"
import { TagIcon } from "@/components/haligtree/tag-icon"
import { hoverNote } from "@/components/haligtree/note-preview"
import { Kbd } from "@/components/haligtree/ui"

/** A code like `H-85` typed: the rows say theirs, so it can be told which matched. */
const typingCode = (query = ""): boolean => /^[a-z]{1,3}-\d/i.test(query.trim())

/**
 * The note lists, `@`, `[[` and "Embed a note": one look. What picking does,
 * said over the rows with a word that typing searches; each row its kind's
 * icon, its title and a quiet word to choose by (when it was last written
 * in). Codes stay out of sight unless one is typed, at the row's end, so every
 * title starts at the same left edge.
 */
export const NoteList = forwardRef<SuggestionListHandle, Pick<SuggestionProps<NoteSuggestion>, "items" | "command"> & { query?: string; ask?: string; stepIn?: (item: NoteSuggestion) => void; /** Tab takes the row too, as ↵ does: a name being finished (a quote's "- who"). */ tabPicks?: boolean }>(
  function NoteList({ items, command, query, ask, stepIn, tabPicks }, ref) {
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
        // Into a note, to show one of its parts rather than all of it ("Embed a note").
        const into = items[selected]
        if (stepIn && (event.key === "Tab" || event.key === "ArrowRight") && !event.shiftKey && into?.id && !into.make && into.blockIndex === undefined) {
          stepIn(into)
          return true
        }
        // ⌘↵ sends what is written, menu open or not: only a plain Return picks.
        if ((event.key === "Enter" || (tabPicks && event.key === "Tab" && !event.shiftKey)) && !event.metaKey && !event.ctrlKey && items[selected]) {
          command(items[selected])
          return true
        }
        return false
      },
    }))

    if (!items.length) return null

    return (
      <div className="tiptap-slash-menu" data-note-picker={ask ? "" : undefined}>
        <div className="tiptap-slash-menu-list mf-more" data-note-side>
          {ask ? (
            <div className="tiptap-slash-menu-ask flex items-baseline gap-3">
              {ask}
              <span className="ml-auto text-xs font-normal text-muted-foreground">{stepIn ? <>Type to search · <Kbd>⇥</Kbd> one part</> : "Type to search"}</span>
            </div>
          ) : null}
          {items.map((item, index) => (
            <Fragment key={`${item.id}#${item.heading ?? ""}#${item.blockIndex ?? ""}`}>
              {item.group && item.group !== items[index - 1]?.group ? <div className="tiptap-slash-menu-group">{item.group}</div> : null}
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
                <span {...(item.id && !item.heading && !item.fileBlock && item.group !== "Tags" ? hoverNote(item.id.includes(":") ? item.id.slice(0, item.id.indexOf(":")) : "capture", item.id.includes(":") ? item.id.slice(item.id.indexOf(":") + 1) : item.id) : {})} className="tiptap-slash-menu-title tiptap-note-link-title" style={item.tint ? { color: item.tint } : undefined}>
                  {item.make ? `Make a new note \u201c${item.label}\u201d` : item.heading ? `# ${item.heading}` : item.blockText ? `${item.headingLine ? "#" : "¶"} ${item.blockText}` : item.label || "New note"}
                  {/* A character's work, after the name: "Paul Atreides · Dune". */}
                  {item.detail && !item.heading && !item.blockText ? <span data-link-detail className="text-muted-foreground"> · {item.detail}</span> : null}
                </span>
                {/* Quietly at the end: a tag's use count, a note's last edit, or its code when a code is typed. */}
                {(typingCode(query) && item.key && !item.heading && !item.blockText) || item.hint ? (
                  <span className="ml-auto shrink-0 pl-3 text-xs tabular-nums text-muted-foreground">{typingCode(query) && item.key && !item.heading && !item.blockText ? item.key : item.hint}</span>
                ) : null}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }
)

type ListProps = Pick<SuggestionProps<NoteSuggestion>, "items" | "command" | "query" | "editor" | "range">
/** A note list that says over its rows what picking does. */
const Asking = (ask: string) =>
  forwardRef<SuggestionListHandle, ListProps>(function AskingList(props, ref) {
    // "Embed a note": ⇥ (or →) on a note lists its headings and paragraphs, to show one alone.
    const stepIn = ask === EMBED_ASK ? (item: NoteSuggestion) => void props.editor.chain().focus().insertContentAt(props.range, `[[${item.label}#`).run() : undefined
    return <NoteList ref={ref} items={props.items} command={props.command} query={props.query} ask={ask} stepIn={stepIn} />
  })

export const noteLinkRenderer = createSuggestionRenderer(Asking(LINK_ASK), noteLinkPluginKey)
export const tagRenderer = createSuggestionRenderer(NoteList, tagPluginKey)
// A quote's "- who, where": the people and works in the book, Tab or ↵ taking the whole name (lib/source-rows.tsx).
export const saidByRenderer = createSuggestionRenderer(forwardRef<SuggestionListHandle, ListProps>(function SaidByList(props, ref) {
  return <NoteList ref={ref} items={props.items} command={props.command} query={props.query} tabPicks />
}), saidByPluginKey)
export const wikiRenderer = createSuggestionRenderer(Asking(LINK_ASK), wikiPluginKey)
// "Embed a note": Escape takes the unfinished `[[name` with it, as it would a lone `/`.
export const embedRenderer = createSuggestionRenderer(Asking(EMBED_ASK), embedPluginKey, { dropOnEscape: true })
