import { notOnUndo } from "@/lib/undo-exact"
import { typedOnly } from "@/lib/typed-suggestion"
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
  shortcodeToEmoji,
  type EmojiItem,
} from "@tiptap/extension-emoji"
import { Fragment, Slice, type Node as ProseMirrorNode, type NodeType } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
  IN_WINDOW,
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

/** A `:name:` code at the start of a line or after a space, as the extension's own paste rule reads one. */
const CODE = /(^|\s):([a-zA-Z0-9_+-]+):/g

/**
 * Pasted words' `:name:` codes as the emoji they name, in what is pasted, before it lands. The extension's paste
 * rule does the same once the paste is in, with two changes to the note for each code: the largest note pasted back
 * whole brought 298 codes, and every pass that looks at what a change touched went over all 596 changes, one by one
 * for each (a quarter of a second each, seconds in all, the window frozen). Here the paste is still one change, and
 * the rule finds nothing left to do. Not in code, as written.
 */
function codesAsEmoji(content: Fragment, emoji: NodeType, known: (name: string) => boolean): Fragment {
  let changed = false
  const out: ProseMirrorNode[] = []
  content.forEach((node) => {
    let next = node
    if (node.type.spec.code || node.isLeaf) next = node
    else if (node.isTextblock) {
      const parts: ProseMirrorNode[] = []
      // What came just before in the line, as the rule reads it: a picture or other inline node is "￼".
      let before = ""
      node.forEach((child) => {
        if (!child.isText || child.marks.some((mark) => mark.type.spec.code)) {
          parts.push(child)
          before = child.isText ? (child.text ?? "").slice(-1) : "￼"
          return
        }
        const text = child.text ?? ""
        let from = 0
        for (const match of text.matchAll(CODE)) {
          const at = match.index + match[1].length
          if (!match[1] && at === 0 && before && !/\s/.test(before)) continue
          if (!known(match[2])) continue
          if (at > from) parts.push(child.type.schema.text(text.slice(from, at), child.marks))
          parts.push(emoji.create({ name: match[2] }))
          from = match.index + match[0].length
        }
        if (from === 0) parts.push(child)
        else if (from < text.length) parts.push(child.type.schema.text(text.slice(from), child.marks))
        before = text.slice(-1)
      })
      if (parts.length !== node.childCount || parts.some((one, i) => one !== node.child(i))) next = node.copy(Fragment.fromArray(parts))
    } else {
      const inner = codesAsEmoji(node.content, emoji, known)
      if (inner !== node.content) next = node.copy(inner)
    }
    if (next !== node) changed = true
    out.push(next)
  })
  return changed ? Fragment.fromArray(out) : content
}

// Which emoji this screen can draw is worked out once per window, not once
// per editor: it goes through the whole emoji list (about 25 ms), and a page
// of notes builds an editor for each one.
let support: unknown
const OnceEmoji = Emoji.extend({
  // An emoji brought back by Undo stays as it was, text or not (lib/undo-exact.ts).
  addProseMirrorPlugins() {
    const emoji = this.type
    const known = (name: string): boolean => !!shortcodeToEmoji(name, this.options.emojis)
    // Copied out of a note here, its words come as they were: the paste rule leaves those alone too.
    let fromHere = false
    return [
      ...(this.parent?.() ?? []).map(notOnUndo),
      new Plugin({
        props: {
          handleDOMEvents: {
            paste: (_view, event) => void (fromHere = !!event.clipboardData?.getData("text/html").includes("data-pm-slice")),
            drop: (view) => void (fromHere = !!view.dragging),
          },
          transformPasted: (slice) => {
            if (fromHere) return slice
            const content = codesAsEmoji(slice.content, emoji, known)
            return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd)
          },
        },
      }),
    ]
  },
  addStorage() {
    support ??= this.parent?.()
    return support as ReturnType<NonNullable<typeof this.parent>>
  },
})

export const EmojiSuggestion = OnceEmoji.configure({
  enableEmoticons: true,
  suggestion: {
    // As Slack and GitHub do: a colon starts one only at the start of a word
    // ("tldr:" is a colon, not an emoji), and the list waits for two letters.
    allowedPrefixes: [" "],
    floatingUi: IN_WINDOW,
        flip: false,
    shouldShow: typedOnly(),
    items: ({ editor, query }) => {
      const term = query.toLowerCase()
      if (term.length < 2) return []
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
