import { Extension } from "@tiptap/core"
import type { Node as PMNode, Slice } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Three gestures on blocks, as Notion and Capacities have them:
 *
 * - Lines dragged onto a toggle's own line go INSIDE it, at the end, and the
 *   toggle opens to show them. Dropped anywhere else they move as usual.
 * - A box dragged from the empty margin picks every block it touches, so
 *   ⌫, ⌘C, Turn into and the grip's drag work on all of them at once.
 * - Words picked, then a web address or a note link pasted: the words become
 *   that link, keeping what they say.
 */

/** The toggle whose own line (its summary) is under the pointer, if any. */
function toggleUnder(view: EditorView, x: number, y: number): { pos: number; node: PMNode } | null {
  const element = document.elementFromPoint(x, y)
  const summary = element?.closest?.('[data-type="details"] summary, [data-type="details"] > button')
  const details = summary?.closest('[data-type="details"]')
  if (!details || !view.dom.contains(details)) return null
  let pos: number
  try {
    pos = view.posAtDOM(details, 0)
  } catch {
    return null
  }
  // Either just before the toggle or just inside it: look at both.
  const before = view.state.doc.nodeAt(pos)
  if (before?.type.name === "details") return { pos, node: before }
  const $at = view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size)))
  for (let depth = $at.depth; depth > 0; depth--) {
    const node = $at.node(depth)
    if (node.type.name === "details") return { pos: $at.before(depth), node }
  }
  return null
}

const HOVER = "is-drop-into"
let lit: Element | null = null
const light = (element: Element | null): void => {
  if (lit === element) return
  lit?.classList.remove(HOVER)
  lit = element
  lit?.classList.add(HOVER)
}

function dropInto(view: EditorView, event: DragEvent, slice: Slice, moved: boolean): boolean {
  light(null)
  const target = toggleUnder(view, event.clientX, event.clientY)
  if (!target) return false
  const { state } = view
  const { selection } = state
  // A toggle dropped onto itself, or onto something inside it, stays put.
  if (moved && target.pos >= selection.from && target.pos < selection.to) return true
  const content = target.node.lastChild
  if (!content || content.type.name !== "detailsContent") return false
  // The end of the toggle's inside, before it is moved by what leaves.
  const end = target.pos + target.node.nodeSize - 2
  const tr = state.tr
  const dragging = (view as unknown as { dragging?: { node?: NodeSelection } | null }).dragging
  if (moved) {
    if (dragging?.node) dragging.node.replace(tr)
    else tr.deleteSelection()
  }
  const at = tr.mapping.map(end, -1)
  // An empty line left on its own inside a new toggle is dropped for what came.
  const inside = tr.doc.resolve(at).parent
  const lonely = inside.type.name === "detailsContent" && inside.childCount === 1 && inside.firstChild!.isTextblock && !inside.firstChild!.content.size
  if (lonely) tr.replace(at - inside.firstChild!.nodeSize, at, slice)
  else tr.replace(at, at, slice)
  const details = tr.mapping.map(target.pos)
  const node = tr.doc.nodeAt(details)
  if (node?.type.name === "details" && "open" in node.attrs && !node.attrs.open) tr.setNodeMarkup(details, undefined, { ...node.attrs, open: true })
  view.dispatch(tr.setMeta("uiEvent", "drop").scrollIntoView())
  view.focus()
  return true
}

// --- marquee

/** The top-level blocks, each with its place and its box on screen. */
function blocksOf(view: EditorView): { pos: number; node: PMNode; rect: DOMRect }[] {
  const out: { pos: number; node: PMNode; rect: DOMRect }[] = []
  view.state.doc.forEach((node, pos) => {
    const dom = view.nodeDOM(pos)
    if (dom instanceof HTMLElement) out.push({ pos, node, rect: dom.getBoundingClientRect() })
  })
  return out
}

function pickBlocks(view: EditorView, top: number, bottom: number): number {
  const hit = blocksOf(view).filter((one) => one.rect.bottom > top && one.rect.top < bottom && one.rect.height > 0)
  if (!hit.length) return 0
  const first = hit[0]
  const last = hit[hit.length - 1]
  const { doc } = view.state
  const selection =
    hit.length === 1 && first.node.isAtom
      ? NodeSelection.create(doc, first.pos)
      : TextSelection.between(doc.resolve(first.pos + 1), doc.resolve(last.pos + last.node.nodeSize - 1))
  // Drawn with the mouse, as ProseMirror marks its own: vim mode takes it as a visual selection, so ⌫ removes it all.
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection).setMeta("marquee", true).setMeta("pointer", true))
  return hit.length
}

/** A press in the editor's own margin, never on a block's words. */
const inMargin = (view: EditorView, event: MouseEvent): boolean => {
  if (event.target !== view.dom) return false
  // Beside a block (left or right of it), or in the gap between two.
  return !blocksOf(view).some((one) => event.clientX >= one.rect.left && event.clientX <= one.rect.right && event.clientY >= one.rect.top && event.clientY <= one.rect.bottom)
}

function marquee(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || !view.editable || !inMargin(view, event)) return false
  event.preventDefault()
  const x0 = event.clientX
  const y0 = event.clientY
  let box: HTMLDivElement | null = null
  const move = (moved: MouseEvent): void => {
    if (!box && Math.hypot(moved.clientX - x0, moved.clientY - y0) < 5) return
    if (!box) {
      box = document.createElement("div")
      box.className = "mf-marquee"
      box.setAttribute("data-marquee", "")
      document.body.appendChild(box)
      view.focus()
    }
    const left = Math.min(x0, moved.clientX)
    const top = Math.min(y0, moved.clientY)
    Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(moved.clientX - x0)}px`, height: `${Math.abs(moved.clientY - y0)}px` })
    pickBlocks(view, top, Math.max(y0, moved.clientY))
  }
  const up = (ended: MouseEvent): void => {
    window.removeEventListener("mousemove", move, true)
    window.removeEventListener("mouseup", up, true)
    if (box) return void box.remove()
    // A click in the margin, not a drag: the caret goes to the nearest line, as before.
    const near = view.posAtCoords({ left: ended.clientX, top: ended.clientY })
    view.focus()
    if (near) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(near.pos))))
  }
  window.addEventListener("mousemove", move, true)
  window.addEventListener("mouseup", up, true)
  return true
}

// --- paste onto words

const WITH_ID = /^\[\[@([^|#\]]+)(?:#([^|\]]+))?\|([^\]]+)\]\]$/
const URL = /^(https?:\/\/|mailto:)\S+$/i

function pasteOnto(view: EditorView, event: ClipboardEvent): boolean {
  const { state } = view
  const { from, to, empty, $from, $to } = state.selection
  if (empty || !$from.sameParent($to) || !$from.parent.isTextblock || $from.parent.type.spec.code) return false
  const pasted = event.clipboardData?.getData("text/plain").trim() ?? ""
  const words = state.doc.textBetween(from, to).trim()
  if (!pasted || !words || pasted.includes("\n")) return false
  const note = WITH_ID.exec(pasted)
  if (note && state.schema.nodes.noteLink) {
    const [, id, heading = "", label] = note
    const link = state.schema.nodes.noteLink.create({ id, label, heading: heading.trim(), text: words })
    view.dispatch(state.tr.replaceWith(from, to, link).scrollIntoView())
    return true
  }
  if (URL.test(pasted) && state.schema.marks.link) {
    view.dispatch(state.tr.addMark(from, to, state.schema.marks.link.create({ href: pasted })).scrollIntoView())
    return true
  }
  return false
}

export const BlockGestures = Extension.create({
  name: "blockGestures",
  // Before the editor's own paste and drop handling.
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockGestures"),
        // Caught on the way down, before the toggle's own view, which keeps
        // drag events inside it from ever reaching the editor.
        view: (view) => {
          type Dragging = { slice: Slice; move: boolean } | null
          const held = (): Dragging => (view as unknown as { dragging: Dragging }).dragging
          const over = (event: DragEvent): void => {
            const target = held() && toggleUnder(view, event.clientX, event.clientY)
            light(target ? (view.nodeDOM(target.pos) as Element | null) : null)
            if (target) event.preventDefault()
          }
          const drop = (event: DragEvent): void => {
            const dragging = held()
            if (!dragging || !toggleUnder(view, event.clientX, event.clientY)) return light(null)
            if (!dropInto(view, event, dragging.slice, dragging.move && !event.altKey)) return
            event.preventDefault()
            event.stopPropagation()
            ;(view as unknown as { dragging: Dragging }).dragging = null
          }
          const leave = (event: DragEvent): void => void (!view.dom.contains(event.relatedTarget as Node | null) && light(null))
          const end = (): void => light(null)
          view.dom.addEventListener("dragover", over, true)
          view.dom.addEventListener("drop", drop, true)
          view.dom.addEventListener("dragleave", leave, true)
          view.dom.addEventListener("dragend", end, true)
          return {
            destroy: () => {
              view.dom.removeEventListener("dragover", over, true)
              view.dom.removeEventListener("drop", drop, true)
              view.dom.removeEventListener("dragleave", leave, true)
              view.dom.removeEventListener("dragend", end, true)
            },
          }
        },
        props: {
          handlePaste: (view, event) => pasteOnto(view, event),
          handleDOMEvents: {
            mousedown: (view, event) => marquee(view, event),
          },
        },
      }),
    ]
  },
})
