import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { host } from "@/lib/host"

const STORED = /^mindflow:\/\/assets\//

/**
 * A picture or file dragged out of the note goes to the app it lands in
 * (Finder, a chat, a browser, a bug tracker) as the real file, under its own
 * name. Dragged by the block's handle at the left it still moves within the
 * note, as every block does; only a drag that starts on the picture or the
 * file card itself goes out of the window.
 */
export const DragOut = Extension.create({
  name: "dragOut",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dragOut"),
        props: {
          handleDOMEvents: {
            dragstart: (view, event) => {
              // The page's own host, or Vigil's bridge where an editor (the box, a sticky) was given none.
              const out = host().dragOut ?? (window as { api?: { dragOut?: (src: string, name: string) => void } }).api?.dragOut
              const target = event.target instanceof Element ? event.target : null
              if (!out || !target || target.closest(".tiptap-drag-handle")) return false
              // A picture: its own <img>, named by its caption or alt words.
              const img = target instanceof HTMLImageElement ? target : null
              const card = target.closest(".tiptap-attachment")
              let src = ""
              let name = ""
              if (img && STORED.test(img.getAttribute("src") ?? "")) {
                src = img.getAttribute("src") ?? ""
                name = img.getAttribute("alt") || img.getAttribute("title") || ""
              } else if (card) {
                const at = view.posAtDOM(card, 0)
                const node = view.state.doc.nodeAt(at) ?? view.state.doc.resolve(at).nodeAfter
                if (node?.type.name !== "attachment" || !STORED.test(node.attrs.src ?? "")) return false
                src = node.attrs.src
                name = node.attrs.name ?? ""
              } else return false
              event.preventDefault()
              out(src, name)
              return true
            },
          },
        },
      }),
    ]
  },
})
