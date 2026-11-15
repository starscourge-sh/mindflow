import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { host } from "@/lib/host"
import { carryAway } from "@/lib/block-carry"

const STORED = /^haligtree:\/\/assets\//

type Api = { dragOut?: (src: string, name: string, face?: string) => void }
const api = (): Api | undefined => (window as { api?: Api }).api

/** The block at a node's own DOM, when it is the kind looked for (any block taken whole by its body, for none named). */
function blockAt(view: EditorView, dom: Element, type?: string): number | null {
  const at = view.posAtDOM(dom, 0)
  for (const pos of [at, at - 1]) {
    if (pos < 0) continue
    const node = view.state.doc.nodeAt(pos)
    if (type ? node?.type.name === type : node?.isBlock && node.isAtom && node.type.spec.draggable && view.nodeDOM(pos) === dom) return pos
  }
  return null
}

/**
 * Any other block a person takes by its body (a link's card, an embedded note, a picture's empty place, a film): the
 * one whose own box the drag starts in. It is carried as a picture is, never by the editor's own drop line.
 */
function wholeAt(view: EditorView, target: Element): number | null {
  for (let el = target.closest("[draggable=true]"); el && view.dom.contains(el); el = el.parentElement?.closest("[draggable=true]") ?? null) {
    const pos = blockAt(view, el)
    if (pos != null) return pos
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
 * under its own name, carrying a picture of itself. Over its own note it is
 * a move as its grip's carry is, the blocks making way where it would land
 * (lib/block-carry.tsx `carryAway`); let go there, it moves, and nothing is added.
 */
function dragStarted(view: EditorView, event: DragEvent): void {
  const target = event.target instanceof Element ? event.target : null
  // The note's own blocks only: never the grip (lib/block-carry.tsx), nor words dragged inside a note embedded in it.
  if (!target || target.closest(".tiptap-drag-handle") || target.closest(".ProseMirror") !== view.dom) return
  // A picture: its own <img>, named by its caption or alt words.
  const img = target instanceof HTMLImageElement ? target : null
  // A card: the drag starts on the node view's own wrapper, just outside it.
  const card = target.closest(".tiptap-attachment") ?? target.querySelector(":scope > .tiptap-attachment")
  const pos = (img && blockAt(view, img, "image")) ?? (card && blockAt(view, card, "attachment")) ?? wholeAt(view, target)
  if (pos == null) return
  carryAway(view, pos)
  // Only a picture or a file goes out as a file of its own; any other block goes by the browser's own drag.
  if (!["image", "attachment"].includes(view.state.doc.nodeAt(pos)!.type.name)) return
  // Kept in the app: the system's drag, with the real file. Anything else (a picture on the web) goes by the browser's own.
  // The page's own host, or Haligtree's bridge where an editor (the box, a sticky) was given none.
  const out = host().dragOut ?? api()?.dragOut
  const src: string = view.state.doc.nodeAt(pos)!.attrs.src ?? ""
  if (!out || !STORED.test(src)) return
  const name = img ? img.getAttribute("alt") || img.getAttribute("title") || "" : view.state.doc.nodeAt(pos)!.attrs.name ?? ""
  event.preventDefault()
  out(src, name, card && !img ? faceOf(card, name) : undefined)
}

export const DragOut = Extension.create({
  name: "dragOut",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dragOut"),
        // Heard on the way down, before a block's own view keeps a drag begun inside it from the editor (a link's card
        // dragged by its words or picture): the editor's own drop line and drop would take it as something new.
        view: (view) => {
          const heard = (event: DragEvent): void => dragStarted(view, event)
          view.dom.addEventListener("dragstart", heard, true)
          return { destroy: () => view.dom.removeEventListener("dragstart", heard, true) }
        },
        // The system's drag begun above: the editor's own drag stays out of it.
        props: { handleDOMEvents: { dragstart: (_view, event) => event.defaultPrevented } },
      }),
    ]
  },
})
