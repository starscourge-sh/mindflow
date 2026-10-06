import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState, type Editor } from "@tiptap/react"
import { animate, motion } from "motion/react"
import { ChevronLeft, ChevronRight, Copy, X } from "lucide-react"
import { AliveIcon } from "@/components/ui/alive-icon"
import MagnifierIcon from "@/components/ui/magnifier-icon"
import ExternalLinkIcon from "@/components/ui/external-link-icon"
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { host } from "@/lib/host"
import { chime } from "@/lib/sound"

/** Asked for by the image menu's own Look button. */
const LOOK = "mf-look"
export const lookAtSelected = (editor: Editor): void => void editor.view.dom.dispatchEvent(new Event(LOOK))

const still = (): boolean => document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches
const EASE = [0.16, 1, 0.3, 1] as const
// Room kept round the picture: the window's own bar on top, the viewer's below.
const TOP = 48
const FOOT = 76
const SIDE = 32

/** Drawn, and really there: a missing file's dashed note has nothing to look at. */
const whole = (img: HTMLImageElement): boolean => !img.dataset.missing && img.naturalWidth > 0

/** A note's pictures in reading order: image blocks only, never an emoji or a card's thumbnail. */
function picturesOf(editor: Editor): HTMLImageElement[] {
  const found: HTMLImageElement[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLImageElement && whole(dom)) found.push(dom)
  })
  return found
}

/** The italic line under it if it has one, else its name, else nothing worth saying. */
function captionOf(img: HTMLImageElement): string {
  const next = img.nextElementSibling
  if (next?.tagName === "P" && next.children.length === 1 && next.firstElementChild?.tagName === "EM") return next.textContent?.trim() ?? ""
  if (img.alt) return img.alt
  const end = decodeURIComponent(img.src.split(/[?#]/)[0].split("/").pop() ?? "")
  // A stored file's name is only its hash.
  return /^[a-f0-9]{64}\./.test(end) ? "" : end
}

// Keys go to the viewer before anything else in the window. Added when this
// file loads, so ahead of every window listener the views add later: the box
// and the main window both take Escape for themselves otherwise.
let keys: ((event: KeyboardEvent) => boolean) | null = null
window.addEventListener(
  "keydown",
  (event) => {
    if (!keys?.(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  },
  true
)

/**
 * Quick Look for a note's pictures: a small corner button on the one under the
 * pointer, a double-click, or Space on a selected picture lifts it out of the
 * page to fill the window. Space or Escape puts it back where it came from.
 */
export function ImageLook({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [hovered, setHovered] = useState<HTMLImageElement | null>(null)
  const [open, setOpen] = useState<{ pictures: HTMLImageElement[]; at: number } | null>(null)
  const button = useRef<HTMLDivElement>(null)

  // The image menu has its own Look button while a picture is selected, so the
  // corner one stands aside rather than sit on top of it.
  const selected = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const selection = instance?.state.selection
      return instance?.isEditable && selection instanceof NodeSelection && selection.node.type.name === "image" ? selection.from : null
    },
  })

  const lookAt = useCallback(
    (img: HTMLImageElement | null) => {
      if (!editor || !img || !whole(img)) return
      const pictures = picturesOf(editor)
      const at = pictures.indexOf(img)
      if (at < 0) return
      setHovered(null)
      setOpen({ pictures, at })
    },
    [editor]
  )

  useEffect(() => {
    const dom = editor?.view.dom
    if (!editor || !dom) return
    const picture = (target: EventTarget | null): HTMLImageElement | null =>
      target instanceof HTMLImageElement && whole(target) && !target.closest("[data-type='emoji'], .tiptap-bookmark-image") ? target : null
    const chosen = (): HTMLImageElement | null => {
      const { selection } = editor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return null
      const dom = editor.view.nodeDOM(selection.from)
      return dom instanceof HTMLImageElement ? dom : null
    }
    const onOver = (event: PointerEvent): void => {
      const img = picture(event.target)
      if (img) setHovered(img)
    }
    const onOut = (event: PointerEvent): void => {
      if (!picture(event.target)) return
      // Onto the button itself is still pointing at the picture.
      if (button.current?.contains(event.relatedTarget as Node)) return
      setHovered(null)
    }
    const onDouble = (event: MouseEvent): void => {
      const img = picture(event.target)
      if (!img) return
      event.preventDefault()
      lookAt(img)
    }
    // Space only on a picture selected whole, never with the caret in words:
    // there it is a space, and in vim's normal mode a motion.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) return
      // Writing its caption, the picture is still selected: a space is a space.
      if ((event.target as Element).closest?.(".mf-caption")) return
      const img = chosen()
      if (!img || !whole(img)) return
      event.preventDefault()
      event.stopPropagation()
      lookAt(img)
    }
    const onLook = (): void => lookAt(chosen())
    // A scroll moves the picture out from under a button placed for it.
    const onScroll = (): void => setHovered(null)
    dom.addEventListener("pointerover", onOver)
    dom.addEventListener("pointerout", onOut)
    dom.addEventListener("dblclick", onDouble)
    dom.addEventListener("keydown", onKey, true)
    dom.addEventListener(LOOK, onLook)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      dom.removeEventListener("pointerover", onOver)
      dom.removeEventListener("pointerout", onOut)
      dom.removeEventListener("dblclick", onDouble)
      dom.removeEventListener("keydown", onKey, true)
      dom.removeEventListener(LOOK, onLook)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [editor, lookAt])

  const rect = hovered?.isConnected ? hovered.getBoundingClientRect() : null
  const showButton = rect && rect.width >= 96 && rect.height >= 56 && !open && (selected == null || editor?.view.nodeDOM(selected) !== hovered)

  return createPortal(
    <>
      {showButton && (
        <div
          ref={button}
          className="mf-look-corner"
          style={{ top: rect.top + 8, left: rect.right - 8 }}
          onPointerLeave={(event) => event.relatedTarget !== hovered && setHovered(null)}
        >
          <Toolbar variant="floating">
            <Button data-style="ghost" size="small" tooltip="Look" shortcutKeys="Space" aria-label="Look" onClick={() => lookAt(hovered)}>
              <AliveIcon icon={MagnifierIcon} size={16} className="tiptap-button-icon" />
            </Button>
          </Toolbar>
        </div>
      )}
      {open && <Viewer key={open.pictures[open.at].src} pictures={open.pictures} start={open.at} onClose={() => setOpen(null)} />}
    </>,
    document.body
  )
}

/** Where a picture sits when it fills the window: never past its own size. */
function fitOf(img: HTMLImageElement): { left: number; top: number; width: number; height: number; scale: number } {
  const roomW = innerWidth - SIDE * 2
  const roomH = innerHeight - TOP - FOOT
  const scale = Math.min(1, roomW / img.naturalWidth, roomH / img.naturalHeight)
  const width = img.naturalWidth * scale
  const height = img.naturalHeight * scale
  return { left: (innerWidth - width) / 2, top: TOP + (roomH - height) / 2, width, height, scale }
}

function Viewer({ pictures, start, onClose }: { pictures: HTMLImageElement[]; start: number; onClose: () => void }): React.JSX.Element {
  const [at, setAt] = useState(start)
  const [, setSize] = useState(0)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0, smooth: true })
  const frame = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)
  // Which way the last step went; none yet means the picture is still lifting.
  const went = useRef(0)
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null)

  const img = pictures[at]
  const fit = fitOf(img)
  const src = img.currentSrc || img.src
  const stored = src.startsWith("mindflow://assets/")
  const caption = captionOf(img)
  const most = Math.max(4, 2 / fit.scale)

  useEffect(() => {
    const onResize = (): void => setSize((n) => n + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // The picture in the note stands empty while it is out, so it reads as lifted rather than copied.
  useEffect(() => {
    img.style.visibility = "hidden"
    return () => void (img.style.visibility = "")
  }, [img])

  /** Zoom to `zoom` keeping the point at (px, py) in the window where it is. */
  const zoomTo = useCallback(
    (zoom: number, px = innerWidth / 2, py = fit.top + fit.height / 2, smooth = true) =>
      setView((was) => {
        const next = Math.min(most, Math.max(1, zoom))
        const cx = innerWidth / 2
        const cy = fit.top + fit.height / 2
        const x = px - cx - ((px - cx - was.x) / was.zoom) * next
        const y = py - cy - ((py - cy - was.y) / was.zoom) * next
        // Never pushed so far that the window shows past the picture's edge.
        const spanX = Math.max(0, (fit.width * next - (innerWidth - SIDE * 2)) / 2)
        const spanY = Math.max(0, (fit.height * next - (innerHeight - TOP - FOOT)) / 2)
        return { zoom: next, x: Math.max(-spanX, Math.min(spanX, x)), y: Math.max(-spanY, Math.min(spanY, y)), smooth }
      }),
    [fit.height, fit.top, fit.width, most]
  )

  const close = useCallback(async () => {
    if (leaving.current) return
    leaving.current = true
    chime("unstick")
    if (still() || !frame.current) return onClose()
    // Back to where it sits now: the note may have scrolled while it was out.
    img.scrollIntoView({ block: "nearest" })
    const home = img.getBoundingClientRect()
    setView({ zoom: 1, x: 0, y: 0, smooth: true })
    await Promise.all([
      animate(frame.current, { x: home.left - fit.left, y: home.top - fit.top, scale: home.width / fit.width }, { duration: 0.32, ease: EASE }),
      backdrop.current && animate(backdrop.current, { opacity: 0 }, { duration: 0.28 }),
      foot.current && animate(foot.current, { opacity: 0 }, { duration: 0.12 }),
    ])
    onClose()
  }, [fit.left, fit.top, fit.width, img, onClose])

  const stepBy = useCallback(
    (by: number) => {
      const next = at + by
      if (next < 0 || next >= pictures.length) return chime("nope")
      went.current = by
      chime("page")
      setView({ zoom: 1, x: 0, y: 0, smooth: false })
      setAt(next)
    },
    [at, pictures.length]
  )

  const openIt = (): void => void (stored ? host().openFile?.(src) : window.open(src, "_blank", "noopener"))
  const copyIt = async (): Promise<void> => chime((await host().copyImage?.(src)) ? "copy" : "nope")

  useEffect(() => {
    keys = (event) => {
      if (leaving.current) return true
      const key = event.key
      if (key === "Escape" || (key === " " && !event.metaKey)) void close()
      else if (key === "ArrowLeft" || key === "ArrowRight") stepBy(key === "ArrowLeft" ? -1 : 1)
      else if (key === "+" || key === "=") zoomTo(view.zoom * 1.4)
      else if (key === "-") zoomTo(view.zoom / 1.4)
      else if (key === "0") zoomTo(1)
      else if (event.metaKey && key === "c" && stored) void copyIt()
      // Any other plain key is kept from the note underneath; ⌘ chords go on.
      else return !event.metaKey
      return true
    }
    return () => void (keys = null)
  })

  const onWheel = (event: React.WheelEvent): void => {
    // A pinch arrives as a wheel with Control held, in much smaller steps.
    zoomTo(view.zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025)), event.clientX, event.clientY, false)
  }
  const onDown = (event: React.PointerEvent): void => {
    if (view.zoom <= 1 || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, from: { x: view.x, y: view.y }, moved: false }
  }
  const onMove = (event: React.PointerEvent): void => {
    const was = drag.current
    if (!was) return
    was.moved = true
    const spanX = Math.max(0, (fit.width * view.zoom - (innerWidth - SIDE * 2)) / 2)
    const spanY = Math.max(0, (fit.height * view.zoom - (innerHeight - TOP - FOOT)) / 2)
    const x = Math.max(-spanX, Math.min(spanX, was.from.x + event.clientX - was.x))
    const y = Math.max(-spanY, Math.min(spanY, was.from.y + event.clientY - was.y))
    setView((now) => ({ ...now, x, y, smooth: false }))
  }
  // Double-click: the picture's own pixels, one to one, or back to fitting.
  const onDouble = (event: React.MouseEvent): void => {
    chime("tap")
    zoomTo(view.zoom > 1 ? 1 : fit.scale < 1 ? 1 / fit.scale : 2, event.clientX, event.clientY)
  }

  // The first frame grows out of the picture's place in the note; a step
  // after that slides in from the side it came from.
  const lifting = went.current === 0
  const from = img.getBoundingClientRect()
  const initial = still()
    ? false
    : lifting
      ? { x: from.left - fit.left, y: from.top - fit.top, scale: from.width / fit.width, opacity: 1 }
      : { x: went.current * 28, y: 0, scale: 1, opacity: 0 }

  useEffect(() => void chime("open"), [])

  return (
    <div className="mf-look" role="dialog" aria-label="Look" aria-modal="true" onWheel={onWheel}>
      <motion.div
        ref={backdrop}
        className="mf-look-backdrop"
        initial={still() ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        onClick={() => void close()}
      />
      <motion.div
        key={at}
        ref={frame}
        className="mf-look-frame"
        style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height, originX: 0, originY: 0 }}
        initial={initial}
        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: lifting ? 0.44 : 0.22, ease: EASE }}
      >
        <img
          src={src}
          alt={caption}
          draggable={false}
          className="mf-look-image"
          data-zoomed={view.zoom > 1 ? "" : undefined}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transition: view.smooth && !still() ? "transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => void (drag.current = null)}
          onDoubleClick={onDouble}
        />
      </motion.div>
      <motion.div
        ref={foot}
        className="mf-look-foot"
        initial={still() ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: still() ? 0 : 0.14, ease: EASE }}
      >
        <Toolbar variant="floating">
          {caption && <span className="mf-look-caption">{caption}</span>}
          {pictures.length > 1 && (
            <ToolbarGroup>
              <Button data-style="ghost" tooltip="Previous" shortcutKeys="←" aria-label="Previous picture" disabled={at === 0} onClick={() => stepBy(-1)}>
                <ChevronLeft className="tiptap-button-icon" />
              </Button>
              <span className="mf-look-count">
                {at + 1} / {pictures.length}
              </span>
              <Button data-style="ghost" tooltip="Next" shortcutKeys="→" aria-label="Next picture" disabled={at === pictures.length - 1} onClick={() => stepBy(1)}>
                <ChevronRight className="tiptap-button-icon" />
              </Button>
            </ToolbarGroup>
          )}
          {(caption || pictures.length > 1) && <ToolbarSeparator />}
          <ToolbarGroup>
            {!src.startsWith("data:") && (
              <Button data-style="ghost" tooltip={stored ? "Open in Preview" : "Open in browser"} aria-label={stored ? "Open in Preview" : "Open in browser"} onClick={openIt}>
                <AliveIcon icon={ExternalLinkIcon} size={16} className="tiptap-button-icon" />
              </Button>
            )}
            {stored && (
              <Button data-style="ghost" tooltip="Copy picture" shortcutKeys="mod+c" aria-label="Copy picture" onClick={() => void copyIt()}>
                <Copy className="tiptap-button-icon" />
              </Button>
            )}
            <Button data-style="ghost" tooltip="Close" shortcutKeys="Space" aria-label="Close" onClick={() => void close()}>
              <X className="tiptap-button-icon" />
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </motion.div>
    </div>
  )
}
