import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Editor, JSONContent } from "@tiptap/core"

import { BLOCK_COLORS, type BlockColor } from "@/extensions/block-color"

/** A thing worth picking out of what someone typed: a priority, a date, a tag. */
export interface TokenPattern {
  /** Used as `data-token`, so the stylesheet can colour each kind. */
  name: string
  /** Matched against each block of text. The `g` flag is added if missing. */
  pattern: RegExp
  /**
   * What colour to paint it.
   *
   * One of the nine the themes already define, not a hex: those are tuned per
   * theme for contrast against that theme's page, so a tag stays readable when
   * the palette changes under it.
   *
   * A function is handed the match's `value`, which is how one pattern gives
   * every tag its own colour - `#feature` cyan, `#bug` red - rather than
   * painting them all alike. Left out, `spread` does exactly that.
   */
  color?: BlockColor | ((value: string) => BlockColor)
}

/**
 * The seven of the nine that are a hue.
 *
 * Gray and brown are left out: a tag painted in either reads as one that
 * failed to get a colour, sitting flat beside a green or a purple one.
 */
const SPREAD = BLOCK_COLORS.filter((color) => color !== "gray" && color !== "brown")

/**
 * A colour per distinct value, stable across runs and evenly spread.
 *
 * The default for a pattern that does not say. The same tag is always the same
 * colour, because the hash is of the text; different tags rarely collide,
 * because seven buckets over a handful of tags is room enough.
 */
export function spread(value: string): BlockColor {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return SPREAD[Math.abs(hash) % SPREAD.length]
}

/** The colour a match should be painted. */
function colorOf({ color }: TokenPattern, value: string): BlockColor {
  if (typeof color === "function") return color(value)
  return color ?? spread(value)
}

export interface TokenMatch {
  name: string
  /** Which of the nine this match is painted in. */
  color: BlockColor
  /** The matched text, including the marker: `!p1`, `#inbox`. */
  text: string
  /** The first capture group if the pattern has one, else the whole match. */
  value: string
  /**
   * ProseMirror document positions, NOT offsets into the text. They are what
   * `tr.delete(from, to)` wants. For a single paragraph the string index is
   * `from - 1`.
   */
  from: number
  to: number
}

/**
 * Every match in the document, in order.
 *
 * Scans each block's flattened text rather than each text node, so a mark in
 * the middle of a token does not cut the match in half. Leaf inline nodes keep
 * one placeholder character so offsets still line up with positions.
 */
function scan(doc: ProseMirrorNode, patterns: TokenPattern[]): TokenMatch[] {
  if (!patterns.length) return []
  const found: TokenMatch[] = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const text = node.textBetween(0, node.content.size, undefined, "￼")
    const start = pos + 1

    for (const token of patterns) {
      const { name, pattern } = token
      const flags = pattern.flags.includes("g")
        ? pattern.flags
        : `${pattern.flags}g`

      for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
        // A pattern that can match nothing would otherwise report one empty
        // token per character.
        if (!match[0]) continue

        const from = start + (match.index ?? 0)
        const to = from + match[0].length

        // Earlier patterns win an overlap, so two highlights never fight over
        // the same characters.
        if (found.some((other) => from < other.to && to > other.from)) continue

        const value = match[1] ?? match[0]
        found.push({ name, color: colorOf(token, value), text: match[0], value, from, to })
      }
    }

    // The block's text has already been read whole.
    return false
  })

  return found.sort((a, b) => a.from - b.from)
}

/**
 * Obsidian's tags: `#feature`, `#bug`, `#reading-list`.
 *
 * The editor's default, so `#something` is a tag without anyone configuring
 * one. Passing `tokens` replaces this rather than adding to it.
 */
export const TAGS: TokenPattern[] = [{ name: "tag", pattern: /#([\w-]+)/ }]

/**
 * Every distinct tag in a stored document, with how often each appears.
 *
 * Reads the JSON rather than an editor, so a note that is not open can still
 * be asked what it is about - the same way `assetsOf` lists the files a note
 * points at without loading it.
 */
export function tagsOf(
  doc: JSONContent | null | undefined,
  patterns: TokenPattern[] = TAGS
): Array<{ name: string; value: string; color: BlockColor; count: number }> {
  const found = new Map<string, { name: string; value: string; color: BlockColor; count: number }>()

  const walk = (node: JSONContent): void => {
    if (typeof node.text === "string") {
      for (const token of patterns) {
        const flags = token.pattern.flags.includes("g")
          ? token.pattern.flags
          : `${token.pattern.flags}g`

        for (const match of node.text.matchAll(new RegExp(token.pattern.source, flags))) {
          if (!match[0]) continue
          const value = match[1] ?? match[0]
          const key = `${token.name}:${value}`
          const seen = found.get(key)
          if (seen) seen.count += 1
          else found.set(key, { name: token.name, value, color: colorOf(token, value), count: 1 })
        }
      }
    }
    for (const child of node.content ?? []) walk(child)
  }

  if (doc) walk(doc)
  return [...found.values()]
}

/** Every match in the document, in order. */
export function findTokens(
  editor: Editor,
  patterns: TokenPattern[]
): TokenMatch[] {
  return scan(editor.state.doc, patterns)
}

/**
 * Highlight what someone typed, without changing what they typed.
 *
 * These are decorations, not marks: nothing is written to the document, so the
 * text stays exactly as entered and the highlight can never drift out of step
 * with it. Delete a character of `!p1` and the highlight simply stops matching.
 *
 * It paints, it does not parse. Use `findTokens` to read the matches and act on
 * them.
 *
 * Patterns are read once, when the editor is built. Changing them later means
 * remounting the editor.
 */
export const Tokens = Extension.create<{
  patterns: TokenPattern[]
  onClick?: (token: TokenMatch) => void
}>({
  name: "tokens",

  addOptions() {
    return { patterns: [] }
  },

  addProseMirrorPlugins() {
    const { patterns, onClick } = this.options

    return [
      new Plugin({
        props: {
          decorations: (state) =>
            DecorationSet.create(
              state.doc,
              scan(state.doc, patterns).map((token) =>
                Decoration.inline(token.from, token.to, {
                  class: "tiptap-token",
                  "data-token": token.name,
                  "data-token-color": token.color,
                })
              )
            ),

          /**
           * Following a tag.
           *
           * A note link is a node with nothing to type in, so a plain click
           * follows it. A token is live text someone may be in the middle of
           * editing, and taking the plain click would leave no way to put the
           * caret inside `#feature` to fix a typo. So Mod-click follows, the
           * way a link in editable text does - and in a locked document, where
           * there is nothing to edit, a plain click is enough.
           */
          handleClick: (view, pos, event) => {
            if (!onClick) return false
            if (view.editable && !(event.metaKey || event.ctrlKey)) return false

            const hit = scan(view.state.doc, patterns).find(
              (token) => pos >= token.from && pos < token.to
            )
            if (!hit) return false

            onClick(hit)
            return true
          },
        },
      }),
    ]
  },
})
