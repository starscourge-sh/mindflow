import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { host } from "@/lib/host"

const STORED = /^mindflow:\/\/assets\//

type Api = { dragOut?: (src: string, name: string) => void; pathOf?: (file: File) => string }
const api = (): Api | undefined => (window as { api?: Api }).api

/** What ProseMirror keeps while one of its blocks is dragged. */
type Dragging = { slice: ReturnType<NodeSelection["content"]>; move: boolean; node: NodeSelection } | null
const held = (view: EditorView): { dragging: Dragging } => view as unknown as { dragging: Dragging }

/** The picture or file card being carried out, and the note it came from. */
let carried: { view: EditorView; src: string } | null = null

/** The block at a node's own DOM, when it is the kind and file looked for. */
function blockAt(view: EditorView, dom: Element, type: string): number | null {
  const at = view.posAtDOM(dom, 0)
  for (const pos of [at, at - 1]) {
    if (pos < 0) continue
    const node = view.state.doc.nodeAt(pos)
    if (node?.type.name === type && STORED.test(node.attrs.src ?? "")) return pos
  }
  return null
}

/**
 * The file a drop brings is the one carried out of this note: the system
 * drag lands it as a file, which would otherwise read as a new one from
 * Finder. Main writes it to vigil-drag/<first 12 of its stored name>/.
 */
function isCarried(data: DataTransfer | null, src: string): boolean {
  const files = [...(data?.files ?? [])]
  if (files.length !== 1) return false
  const stored = src.replace(STORED, "")
  const path = api()?.pathOf?.(files[0]) ?? ""
  if (path) return path.includes(`/vigil-drag/${stored.slice(0, 12)}/`)
  // No path on disk (made in the page itself): known by its kind of file.
  return files[0].name.toLowerCase().endsWith(`.${stored.split(".").pop()}`)
}

/**
 * A picture or file dragged out of the note goes to the app it lands in
 * (Finder, a chat, a browser, a bug tracker) as the real file, under its own
 * name. Let go back inside the note, it moves there instead, as any block
 * does, and ⌥ held copies it; ⌘Z puts it back. Dragged by the block's
 * handle at the left it never leaves the window at all.
 */
export const DragOut = Extension.create({
  name: "dragOut",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dragOut"),
        // Caught on the window on the way down, before any other drop: a drop
        // that is not the carried file (one from Finder, after a drag that
        // went out and was let go there) is never taken for a move.
        view: (view) => {
          const forget = (): void => {
            if (carried?.view !== view) return
            // ProseMirror swaps in a fresh copy when the note changes mid-drag.
            held(view).dragging = null
            carried = null
          }
          const drop = (event: DragEvent): void => {
            if (carried?.view !== view) return
            const inside = event.target instanceof Node && view.dom.contains(event.target)
            if (inside && isCarried(event.dataTransfer, carried.src)) carried = null
            else forget()
          }
          // A press, or the pointer moving with no button down: the drag is over.
          const moved = (event: PointerEvent): void => void (event.buttons === 0 && forget())
          window.addEventListener("drop", drop, true)
          window.addEventListener("pointerdown", forget, true)
          window.addEventListener("pointermove", moved, true)
          return {
            destroy: () => {
              forget()
              window.removeEventListener("drop", drop, true)
              window.removeEventListener("pointerdown", forget, true)
              window.removeEventListener("pointermove", moved, true)
            },
          }
        },
        props: {
          handleDOMEvents: {
            dragstart: (view, event) => {
              // The page's own host, or Vigil's bridge where an editor (the box, a sticky) was given none.
              const out = host().dragOut ?? api()?.dragOut
              const target = event.target instanceof Element ? event.target : null
              if (!out || !target || target.closest(".tiptap-drag-handle")) return false
              // A picture: its own <img>, named by its caption or alt words.
              const img = target instanceof HTMLImageElement ? target : null
              // A card: the drag starts on the node view's own wrapper, just outside it.
              const card = target.closest(".tiptap-attachment") ?? target.querySelector(":scope > .tiptap-attachment")
              let pos: number | null = null
              let name = ""
              if (img && STORED.test(img.getAttribute("src") ?? "")) {
                pos = blockAt(view, img, "image")
                name = img.getAttribute("alt") || img.getAttribute("title") || ""
              } else if (card) {
                pos = blockAt(view, card, "attachment")
                if (pos != null) name = view.state.doc.nodeAt(pos)?.attrs.name ?? ""
              }
              if (pos == null) return false
              const src: string = view.state.doc.nodeAt(pos)!.attrs.src
              event.preventDefault()
              // Held as ProseMirror holds a block it drags, so letting go back
              // in the note is its own move (or, with ⌥, copy).
              const node = NodeSelection.create(view.state.doc, pos)
              held(view).dragging = { slice: node.content(), move: true, node }
              carried = { view, src }
              out(src, name)
              return true
            },
          },
        },
      }),
    ]
  },
})
