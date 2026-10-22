import { Mark, mergeAttributes, type Editor } from "@tiptap/core"
import type { Mark as PMMark, Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import { haligtree } from "@/lib/haligtree"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Tip } from "@/components/haligtree/ui"

/**
 * Words in a note made into something (a gem, a capture, a task) stay where
 * they are and are marked as kept: a soft wash in the kind's colour over
 * exactly those words, and its small mark at their end that opens it. The
 * link is a mark in the document (`kept`, with the kind and its id), so it is
 * saved with the note and reopens with it; Markdown and plain text leave it
 * out. Read live: put in the Bin, the words dim and say so; gone for good, or
 * taken back with Undo, the mark goes.
 */

export type KeptKind = "nugget" | "capture" | "task"
type State = "live" | "bin" | "gone"

const NAME = "kept"
const KEY = new PluginKey<{ known: Map<string, State>; set: DecorationSet }>(NAME)

// Lucide's drawings, at the size of the words around them.
const PATHS: Record<KeptKind, string> = {
  nugget: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  capture: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  task: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
}
const svg = (kind: KeptKind): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[kind]}</svg>`

/** What its tip says, and where a click goes. */
const SAID: Record<KeptKind, Record<"live" | "bin", string>> = {
  nugget: { live: "Kept as a gem: click to open it", bin: "Gem in the Bin: click to see the Bin" },
  capture: { live: "Kept in your Inbox: click to open it", bin: "Capture in the Bin: click to see the Bin" },
  task: { live: "Made a task: click to open it", bin: "Task in the Bin: click to see the Bin" },
}
const open = (kind: KeptKind, id: string, state: State): void =>
  state === "bin" ? window.api.openInHome("view", "discarded") : window.api.openInHome(kind, id)

/** Just made in this window: its mark comes in with a small pop, once. */
const fresh = new Set<string>()
const roots = new WeakMap<HTMLElement, Root>()

const icon = (kind: KeptKind, id: string, state: "live" | "bin") => (): HTMLElement => {
  const dom = document.createElement("span")
  dom.className = fresh.delete(id) ? "mf-kept-icon is-new" : "mf-kept-icon"
  dom.contentEditable = "false"
  dom.dataset.kept = kind
  dom.dataset.keptState = state
  dom.dataset.keptFor = id
  const root = createRoot(dom)
  const button = createElement("button", {
    type: "button",
    "aria-label": SAID[kind][state],
    // The note keeps its caret and its selection.
    onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClick: () => open(kind, id, state),
    dangerouslySetInnerHTML: { __html: svg(kind) },
  })
  root.render(createElement(TooltipProvider, { delayDuration: 400, children: createElement(Tip, { label: SAID[kind][state], children: button }) }))
  roots.set(dom, root)
  return dom
}

/** Each kept thing's words, as runs of the document, in order. */
function runsOf(doc: PMNode): Map<string, { kind: KeptKind; ranges: [number, number][] }> {
  const runs = new Map<string, { kind: KeptKind; ranges: [number, number][] }>()
  doc.descendants((node, pos) => {
    if (!node.isInline) return
    for (const mark of node.marks) {
      if (mark.type.name !== NAME || !mark.attrs.keptId) continue
      const id = String(mark.attrs.keptId)
      let run = runs.get(id)
      if (!run) runs.set(id, (run = { kind: mark.attrs.kind as KeptKind, ranges: [] }))
      const last = run.ranges[run.ranges.length - 1]
      if (last && last[1] === pos) last[1] = pos + node.nodeSize
      else run.ranges.push([pos, pos + node.nodeSize])
    }
  })
  return runs
}

function decorate(doc: PMNode, known: Map<string, State>): DecorationSet {
  const runs = runsOf(doc)
  if (!runs.size) return DecorationSet.empty
  const found: Decoration[] = []
  for (const [id, run] of runs) {
    // Not read yet (just made, or the note just opened): kept, as it almost always is.
    const state = known.get(id) ?? "live"
    if (state !== "live") for (const [from, to] of run.ranges) found.push(Decoration.inline(from, to, { class: state === "bin" ? "mf-kept-binned" : "mf-kept-gone" }))
    if (state === "gone") continue
    const end = run.ranges[run.ranges.length - 1][1]
    found.push(Decoration.widget(end, icon(run.kind, id, state), {
      key: `kept:${id}:${state}`,
      side: -1,
      // Beside the words, not inside their wash.
      marks: [],
      ignoreSelection: true,
      // Its button is its own: the note does not move its caret for a click on it.
      stopEvent: () => true,
      destroy: (dom: Node) => {
        const root = roots.get(dom as HTMLElement)
        // Not while the editor is drawing: React would warn of an unmount mid-render.
        if (root) setTimeout(() => root.unmount())
      },
    }))
  }
  return DecorationSet.create(doc, found)
}

/** Whether it is still there, in the Bin, or gone for good. */
async function stateOf(kind: KeptKind, id: string): Promise<State> {
  if (kind === "nugget") {
    const item = await haligtree.item(id)
    return !item ? "gone" : (item as { binnedAt?: string | null }).binnedAt ? "bin" : "live"
  }
  if (kind === "capture") {
    const capture = await window.api.captures.get(id)
    return !capture ? "gone" : capture.status === "discarded" ? "bin" : "live"
  }
  const task = await haligtree.task(id)
  return !task ? "gone" : task.status === "dropped" ? "bin" : "live"
}

/** A spot in a note: the words something was made from. */
export type Spot = { editor: Editor; from: number; to: number }

/**
 * Mark the words at `at` as kept as `kind` `id`. Gives back how to take the
 * mark off again (an Undo), or null when there was nothing to mark.
 */
export function markKept(at: Spot | null | undefined, kind: KeptKind, id: string): (() => void) | null {
  if (!at || at.editor.isDestroyed) return null
  const { editor } = at
  const type = editor.schema.marks[NAME]
  const doc = editor.state.doc
  let from = Math.max(0, Math.min(at.from, doc.content.size))
  let to = Math.max(from, Math.min(at.to, doc.content.size))
  // Exactly the words: not the spaces or the line breaks picked with them.
  while (from < to && /^\s$/.test(doc.textBetween(from, from + 1))) from++
  while (to > from && /^\s$/.test(doc.textBetween(to - 1, to))) to--
  if (!type || to <= from || !doc.textBetween(from, to, "\n").trim()) return null
  fresh.add(id)
  // Not a step of the note's own undo: the notice's Undo takes the thing and its mark back together.
  editor.view.dispatch(editor.state.tr.addMark(from, to, type.create({ kind, keptId: id })).setMeta("addToHistory", false))
  return () => unmarkKept(editor, id)
}

/** The mark of `id` taken off, wherever it is in the note; the words stay. */
export function unmarkKept(editor: Editor, id: string): void {
  if (editor.isDestroyed) return
  const tr = editor.state.tr
  editor.state.doc.descendants((node, pos) => {
    for (const mark of node.marks) if (mark.type.name === NAME && mark.attrs.keptId === id) tr.removeMark(pos, pos + node.nodeSize, mark)
  })
  if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false))
}

/** The kept mark at a place in the note, if any. */
function keptAt(doc: PMNode, pos: number): PMMark | null {
  const $pos = doc.resolve(pos)
  const node = $pos.parent.childAfter($pos.parentOffset).node
  return node?.marks.find((mark) => mark.type.name === NAME && mark.attrs.keptId) ?? null
}

export const Kept = Mark.create({
  name: NAME,
  // Words typed just after them are new words, not more of the kept ones.
  inclusive: false,
  // Two things kept from words that overlap each keep their own mark.
  excludes: "",
  spanning: true,

  addAttributes() {
    return {
      kind: {
        default: "nugget",
        parseHTML: (element) => element.getAttribute("data-kept"),
        renderHTML: (attributes) => ({ "data-kept": attributes.kind }),
      },
      keptId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-kept-id"),
        renderHTML: (attributes) => (attributes.keptId ? { "data-kept-id": attributes.keptId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-kept-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "mf-kept" }, HTMLAttributes), 0]
  },

  // No renderMarkdown: Markdown has no way to say it, so the words go out as they are.

  onCreate() {
    const editor = this.editor
    let waiting: ReturnType<typeof setTimeout> | undefined
    let last = ""
    const load = async (): Promise<void> => {
      if (editor.isDestroyed) return
      const runs = runsOf(editor.state.doc)
      if (!runs.size && !last) return
      const read = await Promise.all([...runs].map(async ([id, run]) => [id, await stateOf(run.kind, id).catch(() => "live" as State)] as const))
      if (editor.isDestroyed) return
      const known = new Map<string, State>(read)
      const tr = editor.state.tr
      // Gone for good (deleted, or taken back with Undo): the words lose their mark.
      if (editor.isEditable)
        editor.state.doc.descendants((node, pos) => {
          for (const mark of node.marks) if (mark.type.name === NAME && known.get(String(mark.attrs.keptId)) === "gone") tr.removeMark(pos, pos + node.nodeSize, mark)
        })
      const said = JSON.stringify(read)
      if (said === last && !tr.docChanged) return
      last = said
      editor.view.dispatch(tr.setMeta(KEY, known).setMeta("addToHistory", false))
    }
    const later = (): void => {
      clearTimeout(waiting)
      waiting = setTimeout(() => void load(), 250)
    }
    ;(this.storage as { later?: () => void }).later = later
    void load()
    const off = window.api.captures.onChange(later)
    editor.on("destroy", () => (off(), clearTimeout(waiting)))
  },

  addStorage() {
    return { later: undefined as (() => void) | undefined }
  },

  onTransaction({ transaction }) {
    if (!transaction.docChanged || transaction.getMeta(KEY)) return
    // Words newly marked (made just now, pasted in, a line undone back): read what they point at.
    const known = KEY.getState(this.editor.state)?.known
    for (const id of runsOf(transaction.doc).keys()) if (!known?.has(id)) return void this.storage.later?.()
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: KEY,
      state: {
        init: (_, state) => ({ known: new Map<string, State>(), set: decorate(state.doc, new Map()) }),
        apply: (tr, was) => {
          const known = tr.getMeta(KEY) as Map<string, State> | undefined
          if (known) return { known, set: decorate(tr.doc, known) }
          return tr.docChanged ? { known: was.known, set: decorate(tr.doc, was.known) } : was
        },
      },
      props: {
        decorations: (state) => KEY.getState(state)?.set,
        // ⌘-click on kept words opens what they became, as a link does.
        handleClick: (view, pos, event) => {
          if (!event.metaKey) return false
          const mark = keptAt(view.state.doc, pos)
          if (!mark) return false
          const state = KEY.getState(view.state)?.known.get(String(mark.attrs.keptId)) ?? "live"
          if (state === "gone") return false
          open(mark.attrs.kind as KeptKind, String(mark.attrs.keptId), state)
          return true
        },
      },
    })]
  },
})
