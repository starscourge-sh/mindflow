import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { decodeHTML } from "entities"
import type { NodeViewRendererProps } from "@tiptap/core"
import type { Decoration, NodeView } from "@tiptap/pm/view"

import type { BookmarkAttributes } from "@/extensions/bookmark"
import { Orb } from "@/components/haligtree/orb"
import { idThumbs, isYouTube, videoId, wideThumb } from "../../../../main/video-thumbs"
import { EASING, still } from "@/lib/motion"
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

    // The picture's place is always there, so the card is one shape from the
    // moment it goes in: the site's own face (its colour, its icon) first, the
    // picture faded in over it once it has come, and the face kept if it never
    // does. A YouTube card has its picture at once, from the video's id. The
    // picture whole, over itself blurred: a picture of another shape leaves
    // no empty bands, only its own colours carried to the edges.
    const frame = el("span", "tiptap-bookmark-frame")
    frame.append(face(href, icon && !loading ? icon : "", site))
    parts.push(frame)
    const wanted = (!loading && image) || youTubeThumbs(href)[0] || ""
    if (wanted) {
      // Only the picture between any black bands baked into it.
      const img = el("img", "tiptap-bookmark-image") as HTMLImageElement
      img.alt = ""
      img.style.backgroundSize = "cover"
      img.style.backgroundPosition = "center"
      img.src = wanted
      const box = withoutBands(wanted)
      if (box) img.style.setProperty("object-view-box", box)
      frame.append(img)
      undo = arrive(frame, img, wanted, href)
      if (!loading) keepOnce(props, wanted, icon ?? "")
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

/** The two pictures YouTube has for every video, from the id in its address: none for any other link. */
const youTubeThumbs = (href: string): string[] => {
  const id = videoId(href)
  return id ? idThumbs(id) : []
}

const remote = (src: string): boolean => /^https?:/i.test(src)

/** The theme's own hues (the ones a book wears), so a face suits every theme; never grey. */
const HUES = ["blue", "purple", "pink", "red", "orange", "yellow", "green"]

/**
 * The site's face, under the picture: a quiet tint of one of the theme's own
 * hues, picked from the domain so a site always wears the same one, and its
 * icon when known, else the first letter of its name.
 */
function face(href: string, icon: string, site: string): HTMLElement {
  let host = ""
  try {
    host = new URL(href).hostname.replace(/^www\./, "")
  } catch {
    /* not an address: no domain to colour by */
  }
  let sum = 0
  for (const char of host) sum = (sum * 31 + char.charCodeAt(0)) >>> 0
  const one = el("span", "tiptap-bookmark-face")
  one.style.setProperty("--bookmark-hue", `var(--tt-color-text-${HUES[sum % HUES.length]})`)
  const letter = (): HTMLElement => el("span", "tiptap-bookmark-face-letter", (decodeHTML(site).trim() || host || "?").slice(0, 1).toUpperCase())
  if (icon) {
    const small = el("img", "tiptap-bookmark-face-icon") as HTMLImageElement
    small.src = icon
    small.alt = ""
    // An icon that will not load leaves its letter, not a broken box.
    small.addEventListener("error", () => small.replaceWith(letter()), { once: true })
    one.append(small)
  } else one.append(letter())
  return one
}

/**
 * The picture over the face: drawn at once when it is already here (a stored
 * one, or one the browser has), faded in when it arrives (180ms; at once with
 * Motion off), and taken away if it never comes, so the face stays rather
 * than a broken box. A YouTube picture that is missing tries the 16:9 one
 * every video has first. Returns a way to stop watching.
 */
function arrive(frame: HTMLElement, img: HTMLImageElement, image: string, href: string): () => void {
  const stop = fit(frame, img, image, href)
  // The blurred copy behind a picture shown whole is set once the picture is
  // here, from the same file, so it never asks for it a second time.
  const show = (): void => frame.style.setProperty("--bookmark-art", `url(${JSON.stringify(img.currentSrc || img.src)})`)
  if (img.complete && img.naturalWidth) {
    show()
    return stop
  }
  // A stored picture has its own colours to stand in until it is drawn (lib/pictures.ts).
  paintWhileLoading(img)
  const fades = !still()
  if (fades) img.style.opacity = "0"
  const tried = new Set([img.src])
  const loaded = (): void => {
    show()
    if (!fades) return
    img.style.opacity = ""
    if (img.isConnected) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASING })
  }
  const failed = (): void => {
    const next = youTubeThumbs(href).find((one) => !tried.has(one))
    if (next) {
      tried.add(next)
      img.src = next
      return
    }
    img.remove()
  }
  img.addEventListener("load", loaded)
  img.addEventListener("error", failed)
  return () => {
    stop()
    img.removeEventListener("load", loaded)
    img.removeEventListener("error", failed)
  }
}

/**
 * A picture still on the site, kept with the notes the first time its card is
 * shown, the way a pasted picture is: from then on it comes from the book,
 * at once and offline. Each address is asked for once per window, however
 * many cards show it; one that cannot be kept (offline, too big) is left as
 * it is and tried again the next time the app opens. Only an editable note
 * is changed, and not as a step of its own to undo.
 */
const keeping = new Map<string, Promise<{ image: string; icon: string }>>()
function keepOnce(props: NodeViewRendererProps, image: string, icon: string): void {
  const keep = (window as { api?: { keepCardPictures?: (image: string, icon: string) => Promise<{ image: string; icon: string }> } }).api?.keepCardPictures
  const ask = { image: remote(image) ? image : "", icon: remote(icon) ? icon : "" }
  if (!keep || !props.editor.isEditable || !(ask.image || ask.icon)) return
  const key = `${ask.image}\n${ask.icon}`
  let asked = keeping.get(key)
  if (!asked) keeping.set(key, (asked = keep(ask.image, ask.icon).catch(() => ({ image: "", icon: "" }))))
  void asked.then((now) => {
    const { editor } = props
    if (editor.isDestroyed) return
    const at = typeof props.getPos === "function" ? props.getPos() : undefined
    const node = at == null ? null : editor.state.doc.nodeAt(at)
    if (at == null || !node || node.type.name !== "bookmark" || node.attrs.loading) return
    const was = { image: String(node.attrs.image ?? ""), icon: String(node.attrs.icon ?? "") }
    // Only a copy now stored replaces the address it was kept from (or fills
    // an empty place, a YouTube card whose page never answered).
    const kept = (before: string, after: string, from: string): string => (from && after && !remote(after) && (!before || (wideThumb(before) ?? before) === (wideThumb(from) ?? from)) ? after : before)
    const nextImage = kept(was.image, now.image, ask.image)
    const nextIcon = kept(was.icon, now.icon, ask.icon)
    if (nextImage === was.image && nextIcon === was.icon) return
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(at, undefined, {
          ...node.attrs,
          image: nextImage,
          icon: nextIcon,
          // The site's address stays with the card, beside the copy.
          imageSource: node.attrs.imageSource || (nextImage !== was.image ? ask.image : ""),
          iconSource: node.attrs.iconSource || (nextIcon !== was.icon ? ask.icon : ""),
        })
        .setMeta("addToHistory", false),
    )
  })
}
