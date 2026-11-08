import { InputRule, Node, mergeAttributes, type Editor } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { ContentsView } from "@/components/toc/contents-view"
import { isFolded } from "@/extensions/heading-fold"
import { cue } from "@/lib/cues"
import { still } from "@/lib/motion"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    contentsBlock: {
      /** A table of contents where the caret is. */
      insertContents: () => ReturnType
    }
  }
}

/** The ways other apps write "a table of contents goes here". */
const MARKER = /^ {0,3}(?:\[TOC\]|\[\[_TOC_\]\]|\{\{TOC\}\})[ \t]*(?:\n|$)/i

/** The heading just gone to, lit for a moment. */
const landed = new PluginKey<DecorationSet>("contentsLanded")

/**
 * Go to the heading at `pos` from the contents: open it if folded, bring it to
 * the top of the page, and light it for a moment so the eye finds it.
 */
export function jumpTo(editor: Editor, pos: number): void {
  const { view } = editor
  if (isFolded(view.state, pos)) editor.commands.toggleFold(pos)
  const tr = view.state.tr
  // A picture or a file is picked whole; a line takes the cursor.
  const node = tr.doc.nodeAt(pos)
  tr.setSelection(node?.isAtom && NodeSelection.isSelectable(node) ? NodeSelection.create(tr.doc, pos) : TextSelection.near(tr.doc.resolve(pos + 1))).setMeta(landed, pos)
  view.dispatch(tr)
  view.focus()
  cue("heading")
  // Next frame: whatever hid it (a fold, a far block in a long note) is drawn by then.
  requestAnimationFrame(() => {
    if (view.isDestroyed) return
    const heading = view.nodeDOM(pos)
    // The editor's own scroll, or whatever the host scrolls it in (the box grows the window instead).
    let box: Element | null = view.dom.parentElement
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    if (!(heading instanceof HTMLElement) || !box || !heading.getClientRects().length) {
      view.dispatch(view.state.tr.scrollIntoView())
      return
    }
    const scroller = box as HTMLElement
    const goal = (): number => heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 24
    scroller.scrollTo({ top: goal(), behavior: still() ? "instant" : "smooth" })
    holdOn(scroller, heading, goal)
  })
  setTimeout(() => !view.isDestroyed && view.dispatch(view.state.tr.setMeta(landed, null).setMeta("addToHistory", false)), 1400)
}

/**
 * Kept on the place gone to while the note settles: pictures above it load
 * and grow, a list low in the note (its links) takes up the scroller, and
 * either moved the note off it or stopped its glide part way (a note opened
 * on a picture from Files went back to the top a second later). Each frame
 * it is put back if it has moved, until the note has stood still a while;
 * any scroll, click or key of yours lets go at once.
 */
function holdOn(scroller: HTMLElement, target: HTMLElement, goal: () => number): void {
  let yours = false
  const letGo = (): void => void (yours = true)
  const events = ["wheel", "pointerdown", "keydown", "touchstart"] as const
  for (const name of events) window.addEventListener(name, letGo, { capture: true, passive: true })
  let last = scroller.scrollTop
  let calm = 0
  let frames = 0
  const step = (): void => {
    // As far as the note goes: a place near its end stops where the note does.
    const want = Math.max(0, Math.min(goal(), scroller.scrollHeight - scroller.clientHeight))
    const at = scroller.scrollTop
    const gliding = Math.abs(at - last) > 0.5 && Math.abs(want - at) < Math.abs(want - last)
    if (!gliding && Math.abs(at - want) > 2) scroller.scrollTo({ top: want, behavior: "instant" })
    calm = gliding || Math.abs(scroller.scrollTop - want) > 2 ? 0 : calm + 1
    last = scroller.scrollTop
    if (!yours && target.isConnected && calm < 30 && ++frames < 240) requestAnimationFrame(step)
    else for (const name of events) window.removeEventListener(name, letGo, { capture: true })
  }
  requestAnimationFrame(step)
}

/**
 * A table of contents placed in the note, as Notion's is: every heading,
 * nested by level, kept up to date as you write. It stores nothing but how it
 * is shown; the headings are read from the note each time.
 */
export const ContentsBlock = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    const flag = (name: string) => ({
      default: false,
      parseHTML: (element: HTMLElement) => element.hasAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name.slice(5)] ? { [name]: "" } : {}),
    })
    return { collapsed: flag("data-collapsed"), numbered: flag("data-numbered") }
  },

  parseHTML() {
    return [{ tag: "div[data-toc]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toc": "" })]
  },

  // Obsidian's and Typora's marker; GitLab's and MultiMarkdown's read back too.
  renderMarkdown: () => "[TOC]",

  markdownTokenizer: {
    name: "tableOfContents",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}(?:\[TOC\]|\[\[_TOC_\]\]|\{\{TOC\}\})[ \t]*$/im),
    tokenize: (src) => {
      const match = MARKER.exec(src)
      return match ? { type: "tableOfContents", raw: match[0] } : undefined
    },
  },
  parseMarkdown: (_token, helpers) => helpers.createNode("tableOfContents", {}),

  addNodeView() {
    return ReactNodeViewRenderer(ContentsView, {
      // Its rows are buttons: their clicks and keys are theirs, not the editor's.
      stopEvent: ({ event }) => (event.target as HTMLElement | null)?.closest?.("button") != null,
    })
  },

  addCommands() {
    return {
      insertContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },

  addKeyboardShortcuts() {
    return {
      // Selected as a block, Return steps into it: its first row, or its title when folded.
      Enter: ({ editor }) => {
        const { selection } = editor.state
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false
        const dom = editor.view.nodeDOM(selection.from) as HTMLElement | null
        const first = dom?.querySelector<HTMLElement>(".mf-contents-entry") ?? dom?.querySelector<HTMLElement>(".mf-contents-head")
        first?.focus()
        return !!first
      },
    }
  },

  // `[TOC]` typed alone on a line is the block, as it is in Typora.
  addInputRules() {
    return [
      new InputRule({
        find: /^\[TOC\]$/i,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.name !== "paragraph" || $from.parent.textContent.length !== range.to - range.from) return null
          const at = $from.before()
          state.tr.replaceWith(at, $from.after(), this.type.create())
          const after = state.tr.doc.resolve(Math.min(at + 1, state.tr.doc.content.size))
          state.tr.setSelection(TextSelection.near(after))
          return undefined
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: landed,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const meta = tr.getMeta(landed) as number | null | undefined
            if (meta === undefined) return set.map(tr.mapping, tr.doc)
            if (meta === null) return DecorationSet.empty
            const node = tr.doc.nodeAt(meta)
            if (!node) return DecorationSet.empty
            // A folded heading is a section: only its title lights.
            const [from, size] = node.type.name === "details" ? [meta + 1, node.firstChild?.nodeSize ?? 0] : [meta, node.nodeSize]
            return DecorationSet.create(tr.doc, [Decoration.node(from, from + size, { class: "mf-contents-landed" })])
          },
        },
        props: { decorations: (state) => landed.getState(state) },
      }),
    ]
  },
})
