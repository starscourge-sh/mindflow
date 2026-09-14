import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/core"

/** A thing worth picking out of what someone typed: a priority, a date, a tag. */
export interface TokenPattern {
  /** Used as `data-token`, so the stylesheet can colour each kind. */
  name: string
  /** Matched against each block of text. The `g` flag is added if missing. */
  pattern: RegExp
}

export interface TokenMatch {
  name: string
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

    for (const { name, pattern } of patterns) {
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

        found.push({ name, text: match[0], value: match[1] ?? match[0], from, to })
      }
    }

    // The block's text has already been read whole.
    return false
  })

  return found.sort((a, b) => a.from - b.from)
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
export const Tokens = Extension.create<{ patterns: TokenPattern[] }>({
  name: "tokens",

  addOptions() {
    return { patterns: [] }
  },

  addProseMirrorPlugins() {
    const { patterns } = this.options

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
                })
              )
            ),
        },
      }),
    ]
  },
})
