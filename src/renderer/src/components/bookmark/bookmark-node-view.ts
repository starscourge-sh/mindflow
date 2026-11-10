import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { decodeHTML } from "entities"
import type { NodeViewRendererProps } from "@tiptap/core"
import type { Decoration, NodeView } from "@tiptap/pm/view"

import type { BookmarkAttributes } from "@/extensions/bookmark"
import { Orb } from "@/components/haligtree/orb"
import { isYouTube, wideThumb } from "../../../../main/video-thumbs"
import { lookOf, paintWhileLoading, withoutBands } from "@/lib/pictures"
import { lazyRoot } from "@/lib/lazy-root"
import { stopLikeTiptap } from "@/lib/plain-node-view"
import { BookmarkButtons } from "@/components/bookmark/bookmark-view"

/**
 * The link preview card.
 *
 * A node view rather than plain markup, because the card needs a control
 * inside it and the markup version was an `<a>`: one interactive element may
 * not sit inside another, and a click anywhere on an anchor is handed to the
 * browser to follow before any handler of ours is reached. Divs and a real
 * button own their own clicks, so there is nothing to out-race.
 *
 * Plain elements rather than React: a React view per card cost the most of
 * opening a note with many (the Engineering Codex has 52). Its two buttons,
 * which show only on hover, are drawn by React once the pointer first comes
 * over the card. The elements are the ones the React view made, classes and
 * all: `.react-renderer.node-bookmark` around `.tiptap-bookmark`.
 *
 * `renderHTML` on the node still writes the anchor. That is what lands on the
 * clipboard and in an export, where a card is just a link.
 */
export function bookmarkNodeView(props: NodeViewRendererProps): NodeView {
  let node = props.node
  let decorations = props.decorations as readonly Decoration[]
  let picked = false

  const dom = document.createElement("div")
  dom.className = "react-renderer node-bookmark"
  const card = document.createElement("div")
  card.setAttribute("data-node-view-wrapper", "")
  card.style.whiteSpace = "normal"
  dom.append(card)
  card.addEventListener("click", () => {
    const { href, loading } = node.attrs as BookmarkAttributes
    if (!loading) window.open(href, "_blank", "noopener")
  })

  // The buttons keep one place, after the card's words, across redraws.
  const buttons = document.createElement("span")
  buttons.style.display = "contents"
  const drawnButtons = lazyRoot(buttons, card, () => createElement(BookmarkButtons, { href: (node.attrs as BookmarkAttributes).href, loading: !!node.attrs.loading }))

  // A card holds no text for the browser to paint, so a select-all swept past
  // it and left it looking untouched: picked on its own, or inside a range
  // (the decoration from extensions/selected-nodes.ts), it says so.
  const select = (): void => {
    const on = picked || decorations.some((decoration) => (decoration as unknown as { spec?: { inRange?: boolean } }).spec?.inRange === true)
    card.className = `tiptap-bookmark${on ? " is-selected" : ""}`
  }

  let undo: (() => void) | null = null
  const draw = (): void => {
    undo?.()
    undo = null
    const attrs = node.attrs as BookmarkAttributes
    const { href, image: saved, icon, loading } = attrs
    // Cards kept before entities were decoded on fetching ("What&#x27;s new") read right too.
    const [title, description, site] = [attrs.title, attrs.description, attrs.site].map((text) => decodeHTML(text ?? ""))
    // A card made before thumbnails were taken in 16:9 still points at YouTube's
    // banded 4:3 one: shown as the 16:9 one instead, which has no black bands.
    const image = (saved && wideThumb(saved)) || saved

    select()
    if (loading) card.setAttribute("data-loading", "")
    else card.removeAttribute("data-loading")
    const parts: Node[] = []

    // No grey block pulsing where the picture will be: the orb below is
    // the one sign of a wait, the same one every wait in Haligtree uses.
    // The picture whole, over itself blurred: a picture of another shape
    // leaves no empty bands, only its own colours carried to the edges.
    if (image && !loading) {
      const frame = el("span", "tiptap-bookmark-frame")
      frame.style.setProperty("--bookmark-art", `url(${JSON.stringify(image)})`)
      // Its colours in its place until it has loaded, and only the picture
      // between any black bands baked into it.
      const img = el("img", "tiptap-bookmark-image") as HTMLImageElement
      img.src = image
      img.alt = ""
      img.style.backgroundSize = "cover"
      img.style.backgroundPosition = "center"
      const box = withoutBands(image)
      if (box) img.style.setProperty("object-view-box", box)
      frame.append(img)
      paintWhileLoading(img)
      parts.push(frame)
      undo = fit(frame, img, image, href)
    }

    const body = el("span", "tiptap-bookmark-body")
    body.append(el("span", "tiptap-bookmark-title", title || href))
    if (description) body.append(el("span", "tiptap-bookmark-description", description))
    const where = el("span", "tiptap-bookmark-site")
    if (icon && !loading) {
      const small = el("img", "tiptap-bookmark-icon") as HTMLImageElement
      small.src = icon
      small.alt = ""
      where.append(small)
    }
    if (loading) {
      // The one wait sign, drawn by React only while the preview is being fetched.
      const orb = document.createElement("span")
      orb.style.display = "contents"
      const root = createRoot(orb)
      root.render(createElement(Orb, { state: "connecting", label: "Fetching preview…" }))
      const before = undo
      undo = () => {
        before?.()
        setTimeout(() => root.unmount())
      }
      where.append(orb)
    } else where.append(el("span", "", site))
    body.append(where)
    parts.push(body, buttons)
    card.replaceChildren(...parts)
    drawnButtons.redraw()
  }
  draw()

  return {
    dom,
    update(next, nextDecorations) {
      if (next.type !== node.type) return false
      const changed = next.attrs !== node.attrs
      node = next
      decorations = nextDecorations
      if (changed) draw()
      else select()
      return true
    },
    selectNode() {
      picked = true
      dom.classList.add("ProseMirror-selectednode")
      select()
    },
    deselectNode() {
      picked = false
      dom.classList.remove("ProseMirror-selectednode")
      select()
    },
    // The buttons own their clicks; a press anywhere else picks the card.
    stopEvent: (event) => stopLikeTiptap(event, dom, null, node),
    ignoreMutation: () => true,
    destroy() {
      undo?.()
      drawnButtons.destroy()
    },
  }
}

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const one = document.createElement(tag)
  if (className) one.className = className
  if (text != null) one.textContent = text
  return one
}

/**
 * A picture that nearly fills the frame fills it: shown whole, it left a few
 * pixels of its blurred copy down one side, which read as a seam. And a 4:3
 * YouTube thumbnail already kept with the note has its bands baked in: only
 * the 16:9 middle of it is shown. Returns a way to stop watching.
 */
function fit(box: HTMLElement, img: HTMLImageElement, image: string, href: string): () => void {
  // Bands found in a stored picture are known before it loads (lib/pictures.ts).
  const look = lookOf(image)
  const cut = look ? 1 - look[3] - look[4] : 1
  const flag = (name: string, on: boolean): void => {
    if (on) box.setAttribute(name, "")
    else box.removeAttribute(name)
  }
  const check = (): void => {
    if (!img.naturalWidth || !box.clientHeight) return
    const band = cut === 1 && isYouTube(href) && Math.abs(img.naturalWidth / img.naturalHeight - 4 / 3) < 0.02
    flag("data-banded", band)
    const off = ((img.naturalWidth / (img.naturalHeight * cut)) * (band ? 4 / 3 : 1)) / (box.clientWidth / box.clientHeight)
    flag("data-fill", Math.abs(off - 1) <= 0.06)
  }
  // Not read at once, while the note is still being drawn: the watcher's first report comes once it is laid out.
  img.addEventListener("load", check)
  const watch = new ResizeObserver(check)
  watch.observe(box)
  return () => {
    img.removeEventListener("load", check)
    watch.disconnect()
  }
}
