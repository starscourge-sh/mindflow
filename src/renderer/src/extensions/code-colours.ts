import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { DRAWN, long } from "@/extensions/long-document"
import { grammarsIn, lowlight, wantGrammars } from "@/lib/lowlight"
import { changedBlocks, changedSpan } from "@/lib/text-edit"
import { onlyWordsChanged } from "@/lib/tiptap-utils"

/** A run of a code block's words in one colour, counted from its first letter. */
type Run = { from: number; to: number; class: string }
/** What lowlight answers: a tree of spans, each naming its colours, round the words. */
type Tree = { value?: string; children?: Tree[]; properties?: { className?: string[] } }

/** Each code block's colours, worked out once for it: a block that changes is a new one. */
const runs = new WeakMap<ProseMirrorNode, Run[]>()

function runsOf(node: ProseMirrorNode): Run[] {
  const had = runs.get(node)
  if (had) return had
  const { language } = node.attrs
  const tree = (language && lowlight.registered(language) ? lowlight.highlight(language, node.textContent) : lowlight.highlightAuto(node.textContent)) as unknown as Tree
  const found: Run[] = []
  let at = 0
  const walk = (parts: Tree[], classes: string[]): void => {
    for (const part of parts) {
      const named = part.properties?.className ? [...classes, ...part.properties.className] : classes
      if (part.children) walk(part.children, named)
      else {
        const end = at + (part.value?.length ?? 0)
        if (named.length && end > at) found.push({ from: at, to: end, class: named.join(" ") })
        at = end
      }
    }
  }
  walk(tree.children ?? [], [])
  // Worked out before the grammars came, it is no colours at all: not kept.
  if (grammarsIn()) runs.set(node, found)
  return found
}

type Colours = { set: DecorationSet; painted: WeakSet<ProseMirrorNode> }
const key = new PluginKey<Colours>("codeColours")
/** Set on the change that colours the code blocks just drawn. */
const COLOUR = "mf:colour"

/**
 * Code's colours, for the code blocks that are drawn.
 *
 * Every code block in the note was coloured as it opened, and all again at once when the grammars came (a moment
 * after the first code block is met): 480 to 520 ms of one task on a 7,017-block note, its hundreds of blocks all
 * but a few off the page, the window frozen for it and a press lost in it. A long note now colours only the blocks
 * drawn near the screen (extensions/long-document.ts), each the moment it is drawn, before the frame it shows in,
 * and once: what a block's colours are is kept for as long as it is not changed. A note that is not long colours
 * all its code, as before. `grammars` is the change that says the grammars came.
 */
export function codeColours(name: string, grammars: string): Plugin<Colours> {
  // The blocks drawn now in a long note, as long-document.ts last said: none until it has drawn some.
  let drawn: [number, number] | null = null
  // For each version of a note, its blocks that hold code (a code block, or a list or a quote with one inside): where
  // each is among the note's blocks, and where it starts. Found once a version, so a move of the drawn blocks (many
  // in a fling) looks up the few it reaches by halves, where it looked at every one of 7,017 blocks each time.
  const holders = new WeakMap<ProseMirrorNode, { index: number[]; at: number[] }>()
  /** The note's blocks from `start` to before `end` that hold code, put in `found`. */
  const holdersIn = (doc: ProseMirrorNode, start: number, end: number, offset: number, found: { index: number[]; at: number[] }): void => {
    for (let i = start; i < end; offset += doc.child(i++).nodeSize) {
      const node = doc.child(i)
      let holds = node.type.name === name
      if (!holds && !node.isTextblock) node.descendants((inner) => !holds && (inner.type.name === name ? ((holds = true), false) : !inner.isTextblock))
      if (holds) (found.index.push(i), found.at.push(offset))
    }
  }
  const holdersOf = (doc: ProseMirrorNode): { index: number[]; at: number[] } => {
    const had = holders.get(doc)
    if (had) return had
    const found = { index: [] as number[], at: [] as number[] }
    holdersIn(doc, 0, doc.childCount, 0, found)
    holders.set(doc, found)
    return found
  }
  /**
   * A changed note's blocks that hold code, from the note's before the change when they were found: those before the
   * change kept, those it touched found again, those after it moved. Found afresh for each version, a long paste coming
   * in a stretch at a time looked at every block of the note once a stretch.
   */
  const holdersAfter = (before: ProseMirrorNode, after: ProseMirrorNode): void => {
    const was = holders.get(before)
    if (!was || holders.has(after)) return
    const span = changedSpan(before, after)
    if (!span) return void holders.set(after, was)
    const $from = after.resolve(span.from)
    const start = $from.index(0)
    const $old = before.resolve(span.oldTo)
    const $new = after.resolve(span.newTo)
    const oldEnd = $old.index(0) + ($old.depth ? 1 : 0)
    const newEnd = $new.index(0) + ($new.depth ? 1 : 0)
    const found = { index: [] as number[], at: [] as number[] }
    let k = 0
    for (; k < was.index.length && was.index[k] < start; k++) (found.index.push(was.index[k]), found.at.push(was.at[k]))
    holdersIn(after, start, newEnd, $from.depth ? $from.before(1) : span.from, found)
    const moved = newEnd - oldEnd
    const shift = span.newTo - span.oldTo
    for (; k < was.index.length; k++) if (was.index[k] >= oldEnd) (found.index.push(was.index[k] + moved), found.at.push(was.at[k] + shift))
    holders.set(after, found)
  }
  /** Each code block drawn now (in a note that is not long, every one), and where; only those between `from` and `to` when given. */
  const eachDrawn = (state: EditorState, visit: (node: ProseMirrorNode, pos: number) => void, from = 0, to = state.doc.content.size): void => {
    const look = (node: ProseMirrorNode, pos: number): boolean => (node.type.name === name ? (visit(node, pos), false) : !node.isTextblock)
    if (!long(state)) return state.doc.nodesBetween(from, to, look)
    if (!drawn) return
    // Counted among the note's elements, which can hold a mark or two besides its blocks: a few more either side.
    const [first, last] = [drawn[0] - 4, drawn[1] + 4]
    const { index, at } = holdersOf(state.doc)
    let low = 0
    let high = index.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (index[middle] < first) low = middle + 1
      else high = middle
    }
    for (let k = low; k < index.length && index[k] <= last; k++) {
      const node = state.doc.child(index[k])
      if (at[k] + node.nodeSize < from || at[k] > to) continue
      if (look(node, at[k])) node.descendants((inner, pos) => look(inner, at[k] + 1 + pos))
    }
  }
  /** The drawn code blocks not coloured yet, coloured (only those between `from` and `to` when given). */
  const colour = (set: DecorationSet, state: EditorState, painted: WeakSet<ProseMirrorNode>, from?: number, to?: number): DecorationSet => {
    const add: Decoration[] = []
    const drop: Decoration[] = []
    eachDrawn(state, (node, pos) => {
      if (painted.has(node)) return
      drop.push(...set.find(pos + 1, pos + node.nodeSize - 1))
      for (const run of runsOf(node)) add.push(Decoration.inline(pos + 1 + run.from, pos + 1 + run.to, { class: run.class }))
      if (grammarsIn()) painted.add(node)
    }, from, to)
    return drop.length || add.length ? set.remove(drop).add(state.doc, add) : set
  }
  const afresh = (state: EditorState): Colours => {
    const painted = new WeakSet<ProseMirrorNode>()
    return { painted, set: colour(DecorationSet.empty, state, painted) }
  }
  const inCode = (state: EditorState): boolean => state.selection.$head.parent.type.name === name
  const plugin: Plugin<Colours> = new Plugin<Colours>({
    key,
    state: {
      init: (_, state) => afresh(state),
      apply: (tr, value, old, state) => {
        if (tr.getMeta(grammars)) return afresh(state)
        if (!tr.docChanged) return tr.getMeta(COLOUR) ? { ...value, set: colour(value.set, state, value.painted) } : value
        let set = value.set.map(tr.mapping, tr.doc)
        holdersAfter(tr.before, state.doc)
        // Words typed outside code only move its colours.
        if (!inCode(old) && !inCode(state) && onlyWordsChanged(tr) && !tr.steps.some((step, i) => tr.docs[i].resolve((step as unknown as { from: number }).from).parent.type.name === name)) return { ...value, set }
        // A code block changed is a new one: its old colours go wherever it is, and it is coloured afresh when drawn.
        // Only the blocks the change touched are looked at (lib/text-edit.ts `changedBlocks`), however many steps
        // made it: looked for over the whole note, a long paste coming in a stretch at a time did it once a stretch.
        const span = changedBlocks(tr.before, state.doc)
        if (!span) return { ...value, set }
        state.doc.nodesBetween(span.from, span.to, (node, pos) => {
          if (node.type.name !== name) return !node.isTextblock
          if (!value.painted.has(node)) set = set.remove(set.find(pos + 1, pos + node.nodeSize - 1))
          return false
        })
        return { painted: value.painted, set: colour(set, state, value.painted, span.from, span.to) }
      },
    },
    props: {
      decorations: (state) => plugin.getState(state)?.set,
    },
    view: (view) => {
      let asked = false
      // The drawn blocks moved (a scroll, a jump, the note first drawn): any code among them not coloured yet is
      // coloured straight after, in the same frame (a microtask runs before the page is drawn). The grammars,
      // when they are not in yet, are fetched, and colour the drawn blocks as they come (`grammars`).
      const moved = (event: Event): void => {
        drawn = (event as CustomEvent<[number, number] | null>).detail
        const { painted } = plugin.getState(view.state) ?? {}
        let any = false
        eachDrawn(view.state, (node) => void (any ||= !painted?.has(node)))
        if (!any || asked) return
        if (!grammarsIn()) return wantGrammars()
        asked = true
        queueMicrotask(() => {
          asked = false
          if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(COLOUR, true).setMeta("addToHistory", false))
        })
      }
      view.dom.addEventListener(DRAWN, moved)
      return { destroy: () => view.dom.removeEventListener(DRAWN, moved) }
    },
  })
  return plugin
}
