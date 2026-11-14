import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { DRAWN, long } from "@/extensions/long-document"
import { grammarsIn, lowlight, wantGrammars } from "@/lib/lowlight"
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
  /** Each code block drawn now (in a note that is not long, every one), and where. */
  const eachDrawn = (state: EditorState, visit: (node: ProseMirrorNode, pos: number) => void): void => {
    const look = (node: ProseMirrorNode, pos: number): boolean => (node.type.name === name ? (visit(node, pos), false) : !node.isTextblock)
    if (!long(state)) return state.doc.descendants(look)
    if (!drawn) return
    // Counted among the note's elements, which can hold a mark or two besides its blocks: a few more either side.
    const [first, last] = [drawn[0] - 4, drawn[1] + 4]
    state.doc.forEach((node, offset, index) => {
      if (index >= first && index <= last && look(node, offset)) node.descendants((inner, pos) => look(inner, offset + 1 + pos))
    })
  }
  /** The drawn code blocks not coloured yet, coloured. */
  const colour = (set: DecorationSet, state: EditorState, painted: WeakSet<ProseMirrorNode>): DecorationSet => {
    const add: Decoration[] = []
    const drop: Decoration[] = []
    eachDrawn(state, (node, pos) => {
      if (painted.has(node)) return
      drop.push(...set.find(pos + 1, pos + node.nodeSize - 1))
      for (const run of runsOf(node)) add.push(Decoration.inline(pos + 1 + run.from, pos + 1 + run.to, { class: run.class }))
      if (grammarsIn()) painted.add(node)
    })
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
        // Words typed outside code only move its colours.
        if (!inCode(old) && !inCode(state) && onlyWordsChanged(tr) && !tr.steps.some((step, i) => tr.docs[i].resolve((step as unknown as { from: number }).from).parent.type.name === name)) return { ...value, set }
        // A code block changed is a new one: its old colours go wherever it is, and it is coloured afresh when drawn.
        const end = state.doc.content.size
        tr.mapping.maps.forEach((map, i) => map.forEach((_from, _to, start, stop) => {
          const after = tr.mapping.slice(i + 1)
          state.doc.nodesBetween(Math.max(0, after.map(start, -1)), Math.min(end, after.map(stop, 1)), (node, pos) => {
            if (node.type.name !== name) return !node.isTextblock
            set = set.remove(set.find(pos + 1, pos + node.nodeSize - 1))
            return false
          })
        }))
        return { painted: value.painted, set: colour(set, state, value.painted) }
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
