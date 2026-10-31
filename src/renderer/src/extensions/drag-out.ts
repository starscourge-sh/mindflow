import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { host } from "@/lib/host"

const STORED = /^haligtree:\/\/assets\//

type Api = { dragOut?: (src: string, name: string, face?: string) => void }
const api = (): Api | undefined => (window as { api?: Api }).api

/** The note a card is being carried out of: drops back into it are refused. */
let carried: EditorView | null = null

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
 * What follows the pointer for a file card: a small card in the theme's own
 * paper and accent, with the kind's mark (a waveform for a voice note, a play
 * mark for a film, a page for a PDF or any other file) and the file's name,
 * as a PNG for the system drag. Pictures carry themselves (main/index.ts).
 */
function faceOf(card: Element, name: string): string | undefined {
  const scale = 2
  const width = 240
  const height = 44
  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = height * scale
  const pen = canvas.getContext("2d")
  if (!pen) return undefined
  // The theme's colours, read off one element that wears them.
  const probe = document.createElement("span")
  probe.className = "bg-popover text-popover-foreground border-primary"
  probe.style.cssText = "position:fixed;left:-9999px;border-width:1px;border-style:solid"
  card.append(probe)
  const look = getComputedStyle(probe)
  const paper = look.backgroundColor
  const ink = look.color
  const accent = look.borderTopColor
  const font = getComputedStyle(card).fontFamily
  probe.remove()
  pen.scale(scale, scale)
  pen.beginPath()
  pen.roundRect(0.5, 0.5, width - 1, height - 1, 10)
  pen.fillStyle = paper
  pen.fill()
  pen.strokeStyle = accent
  pen.lineWidth = 1
  pen.stroke()
  pen.fillStyle = accent
  pen.lineWidth = 1.6
  pen.lineCap = "round"
  pen.lineJoin = "round"
  const x = 14
  const mid = height / 2
  if (card.classList.contains("is-audio")) {
    ;[5, 11, 16, 9, 13, 6].forEach((tall, i) => {
      pen.beginPath()
      pen.moveTo(x + 1 + i * 3.4, mid - tall / 2)
      pen.lineTo(x + 1 + i * 3.4, mid + tall / 2)
      pen.stroke()
    })
  } else if (card.querySelector("video")) {
    pen.beginPath()
    pen.moveTo(x + 4, mid - 8)
    pen.lineTo(x + 17, mid)
    pen.lineTo(x + 4, mid + 8)
    pen.closePath()
    pen.fill()
  } else {
    // A page with its corner folded.
    pen.beginPath()
    pen.moveTo(x + 3, mid - 9)
    pen.lineTo(x + 12, mid - 9)
    pen.lineTo(x + 17, mid - 4)
    pen.lineTo(x + 17, mid + 9)
    pen.lineTo(x + 3, mid + 9)
    pen.closePath()
    pen.moveTo(x + 12, mid - 9)
    pen.lineTo(x + 12, mid - 4)
    pen.lineTo(x + 17, mid - 4)
    pen.stroke()
  }
  pen.fillStyle = ink
  pen.font = `500 13px ${font}`
  pen.textBaseline = "middle"
  const room = width - 44 - 14
  let words = name || "File"
  if (pen.measureText(words).width > room) {
    while (words.length > 1 && pen.measureText(`${words}…`).width > room) words = words.slice(0, -1)
    words = `${words.trimEnd()}…`
  }
  pen.fillText(words, 44, mid + 0.5)
  return canvas.toDataURL("image/png")
}

/**
 * A picture or file card dragged by its body goes out of the note to the app
 * it lands in (Finder, a chat, a browser, a bug tracker) as the real file,
 * under its own name, carrying a picture of itself. It is never also a move:
 * while it is carried this note refuses it (no drop line, nothing added).
 * The block's grip at the left is the way to move it within the note.
 */
export const DragOut = Extension.create({
  name: "dragOut",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dragOut"),
        // Caught on the window on the way down, before the note's own drop
        // line and file drop hear it.
        view: (view) => {
          const refuse = (event: DragEvent): void => {
            if (carried !== view || !(event.target instanceof Node) || !view.dom.contains(event.target)) return
            event.stopPropagation()
            if (event.type === "drop") event.preventDefault()
            else if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
          }
          // A press, or the pointer moving with no button down: the drag is over.
          const forget = (): void => void (carried === view && (carried = null))
          const moved = (event: PointerEvent): void => void (event.buttons === 0 && forget())
          const kinds = ["dragenter", "dragover", "drop"] as const
          kinds.forEach((kind) => window.addEventListener(kind, refuse, true))
          window.addEventListener("pointerdown", forget, true)
          window.addEventListener("pointermove", moved, true)
          return {
            destroy: () => {
              forget()
              kinds.forEach((kind) => window.removeEventListener(kind, refuse, true))
              window.removeEventListener("pointerdown", forget, true)
              window.removeEventListener("pointermove", moved, true)
            },
          }
        },
        props: {
          handleDOMEvents: {
            dragstart: (view, event) => {
              // The page's own host, or Haligtree's bridge where an editor (the box, a sticky) was given none.
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
              event.preventDefault()
              carried = view
              out(view.state.doc.nodeAt(pos)!.attrs.src, name, card && !img ? faceOf(card, name) : undefined)
              return true
            },
          },
        },
      }),
    ]
  },
})
