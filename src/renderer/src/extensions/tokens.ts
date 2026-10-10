import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
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
  /** Matched in the document's first line only (see `firstLineOf`), as when that line is a title read for meaning. */
  firstBlockOnly?: boolean
}

/**
 * The first line with words in it, and the position of the block holding it:
 * what a note is called. The same rule as the stored note's `firstLine`, so
 * the words lit as you type are the ones read for meaning: blank blocks are
 * passed over, and a line runs to the end of its block or a line break.
 */
export function firstLineOf(doc: ProseMirrorNode): { pos: number; text: string } | null {
  let found: { pos: number; text: string } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, "\n", (leaf) => (leaf.type.name === "hardBreak" ? "\n" : String(leaf.attrs.label ?? "")))
    const line = text.split("\n").find((one) => one.trim())
    if (line) found = { pos, text: line.trim() }
    return false
  })
  return found
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
function scan(doc: ProseMirrorNode, patterns: TokenPattern[], from = 0, to = doc.content.size): TokenMatch[] {
  if (!patterns.length) return []
  const found: TokenMatch[] = []

  // Text that is already something else. A `#` in a URL is part of the address
  // and a `#` in inline code is code - chipping either one splits it in two
  // and claims a piece, which is how `Fetching Data#nt3x` lost its fragment to
  // a tag that led nowhere.
  const inert = ["link", "code"]
    .map((name) => doc.type.schema.marks[name])
    .filter(Boolean)

  const first = patterns.some((token) => token.firstBlockOnly) ? firstLineOf(doc)?.pos : undefined
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true

    const text = node.textBetween(0, node.content.size, undefined, "￼")
    const start = pos + 1
    // Only this block's own matches can overlap one another.
    const mine = found.length

    for (const token of patterns) {
      const { name, pattern } = token
      if (token.firstBlockOnly && pos !== first) continue
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
        if (found.some((other, at) => at >= mine && from < other.to && to > other.from)) continue
        if (inert.some((mark) => doc.rangeHasMark(from, to, mark))) continue

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
 * Colours chosen for tags on the Tags page, by name. Filled by the app; read
 * each time a tag is painted, so a choice shows on the next edit, in every
 * editor, without each one being built again.
 */
export const tagColors = new Map<string, BlockColor>()

/**
 * Obsidian's tags: `#feature`, `#bug`, `#reading-list`.
 *
 * The editor's default, so `#something` is a tag without anyone configuring
 * one. Passing `tokens` replaces this rather than adding to it.
 */
export const TAGS: TokenPattern[] = [{ name: "tag", pattern: /#([\w-]+)/, color: (value) => tagColors.get(value.toLowerCase()) ?? spread(value) }]

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

    const paint = (tokens: TokenMatch[]): Decoration[] =>
      tokens.map((token) =>
        Decoration.inline(token.from, token.to, {
          class: "tiptap-token",
          "data-token": token.name,
          "data-token-color": token.color,
          ...(token.name === "tag" ? { title: "Click to open, ⌥-click to edit" } : {}),
        })
      )
    // Tag colours chosen elsewhere: a new choice repaints the whole note.
    const colors = (): string => JSON.stringify([...tagColors])
    const titled = patterns.some((token) => token.firstBlockOnly)
    type Painted = { set: DecorationSet; colors: string; first: number | undefined }
    const whole = (doc: ProseMirrorNode): Painted => ({
      set: DecorationSet.create(doc, paint(scan(doc, patterns))),
      colors: colors(),
      first: titled ? firstLineOf(doc)?.pos : undefined,
    })
    const key = new PluginKey<Painted>("tokens")

    return [
      new Plugin<Painted>({
        key,
        // Kept between transactions and moved with the text: a caret move
        // costs nothing, and an edit reads again only the blocks it touched.
        // Read whole on every update, a 1 MB note took 100 ms a key.
        state: {
          init: (_, state) => whole(state.doc),
          apply: (tr: Transaction, was: Painted): Painted => {
            if (!tr.docChanged) return was
            const doc = tr.doc
            const first = titled ? firstLineOf(doc)?.pos : undefined
            if (colors() !== was.colors || (titled && first !== (was.first === undefined ? undefined : tr.mapping.map(was.first)))) return whole(doc)
            let set = was.set.map(tr.mapping, doc)
            const blocks = new Map<number, number>()
            tr.mapping.maps.forEach((map, index) => {
              const after = tr.mapping.slice(index + 1)
              map.forEach((_from, _to, from, to) => {
                const start = Math.max(0, after.map(from, -1) - 1)
                const end = Math.min(doc.content.size, after.map(to, 1) + 1)
                doc.nodesBetween(start, end, (node, pos) => {
                  if (!node.isTextblock) return true
                  blocks.set(pos, pos + node.nodeSize)
                  return false
                })
              })
            })
            for (const [from, to] of blocks) {
              set = set.remove(set.find(from, to)).add(doc, paint(scan(doc, patterns, from, to)))
            }
            return { set, colors: was.colors, first }
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.set,

          /**
           * Following a tag.
           *
           * A plain click on a tag opens it, as in Obsidian. It is decided on
           * the press, from where the caret was before it: by the time a click
           * finishes, the press itself has already moved the caret into the
           * tag, so asking then always found it "inside" and nothing opened.
           *
           * Two clicks edit instead: ⌥-click places the caret in the tag, and
           * so does a click on the tag the caret is already inside (arrowed in
           * to fix a typo). The press is held back from the editor, so opening
           * a tag never moves the caret or vim's cursor.
           */
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!onClick || event.button !== 0 || event.altKey) return false
              const chip = (event.target as Element | null)?.closest?.('.tiptap-token[data-token="tag"]')
              if (!chip || !view.dom.contains(chip)) return false
              const at = view.posAtDOM(chip, 0)
              const hit = scan(view.state.doc, patterns, at, at).find(
                (token) => token.name === "tag" && at >= token.from && at < token.to
              )
              if (!hit) return false
              const { from, to } = view.state.selection
              // Inside means between its letters. A caret at either end, or
              // vim's block on its last letter (where a click at the end of
              // the line puts it), is only next to it.
              const block = view.dom.getAttribute("data-vim-mode") === "normal" ? 1 : 0
              const inside = view.hasFocus() && from > hit.from && to < hit.to - block
              if (view.editable && inside && !(event.metaKey || event.ctrlKey)) return false

              event.preventDefault()
              // Opens on release over the same tag: pressed and dragged off, nothing happens.
              const up = (release: MouseEvent): void => {
                window.removeEventListener("mouseup", up, true)
                if (release.button === 0 && release.target instanceof Node && chip.contains(release.target)) onClick(hit)
              }
              window.addEventListener("mouseup", up, true)
              return true
            },
          },
        },
      }),
    ]
  },
})
