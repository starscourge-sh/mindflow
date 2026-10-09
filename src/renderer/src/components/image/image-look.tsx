import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { blurFor, lookOf } from "@/lib/pictures"
import { createRoot } from "react-dom/client"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState, type Editor } from "@tiptap/react"
import { animate, motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react"
import { useFollowLabel, useTilt } from "@/components/vigil/tilt"
import { Check, FolderOpen } from "lucide-react"
import { alive } from "@/components/ui/alive-icon"
import RightChevronIcon from "@/components/ui/right-chevron"
import CopyIcon from "@/components/ui/copy-icon"
import XIcon from "@/components/ui/x-icon"
import { AliveIcon } from "@/components/ui/alive-icon"
import MagnifierIcon from "@/components/ui/magnifier-icon"
import ExpandIcon from "@/components/ui/expand-icon"
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { host } from "@/lib/host"
import { chime } from "@/lib/sound"

// itshover drawings in lucide's place, moving when their control is pointed at.
const ChevronLeft = alive(RightChevronIcon, 'rotate-180')
const ChevronRight = alive(RightChevronIcon)
const Copy = alive(CopyIcon)
const X = alive(XIcon)

/** Asked for by the image menu's own Look button. */
const LOOK = "mf-look"
export const lookAtSelected = (editor: Editor): void => void editor.view.dom.dispatchEvent(new Event(LOOK))

/** A step taken with an arrow key, marked on `went` so the picture skips its slide. */
const KEYED = 2
const still = (): boolean => document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches
const EASE = [0.16, 1, 0.3, 1] as const
// The lift and the drop: a spring, so Escape mid-flight turns it round from
// where it is rather than starting over.
// Room kept round the picture: the window's own bar on top, the viewer's below.
const TOP = 48
const FOOT = 76
const SIDE = 32

/** Drawn, and really there: a missing file's dashed note has nothing to look at. */
// One not loaded yet counts when its size is known: far down a note it loads only as it comes near the screen.
const whole = (img: HTMLImageElement): boolean => !img.dataset.missing && (img.naturalWidth > 0 || !!lookOf(img.getAttribute("src")))

/**
 * A picture as the viewer needs it: where to read it, how big it really is,
 * and where it sits on the page, if anywhere: its element, or for a picture
 * shown from another window, only its place.
 */
export type Picture = { src: string; width: number; height: number; caption: string; el: Element | null; rect?: DOMRect | null }
const pictureOf = (img: HTMLImageElement): Picture => {
  const look = lookOf(img.getAttribute("src"))
  return { src: img.currentSrc || img.src, width: img.naturalWidth || look?.[0] || 1, height: img.naturalHeight || look?.[1] || 1, caption: captionOf(img), el: img }
}

/**
 * Quick Look for any picture outside a note (a page's cover, say): it lifts
 * out of `from` when given, else simply appears. Mounts a viewer of its own.
 */
export async function openLook(src: string, from?: Element | null, caption = ""): Promise<void> {
  const probe = new Image()
  probe.src = src
  await probe.decode().catch(() => undefined)
  if (!probe.naturalWidth) return
  const holder = document.createElement("div")
  document.body.append(holder)
  const root = createRoot(holder)
  const done = (): void => {
    root.unmount()
    holder.remove()
  }
  root.render(<Viewer pictures={[{ src, width: probe.naturalWidth, height: probe.naturalHeight, caption, el: from ?? null }]} start={0} onClose={done} />)
}

/** A note's pictures in reading order: image blocks only, never an emoji or a card's thumbnail. */
function picturesOf(editor: Editor): HTMLImageElement[] {
  const found: HTMLImageElement[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return
    const dom = editor.view.nodeDOM(pos)
    // Not one inside a folded heading: there is nowhere for it to lift from or go back to.
    if (dom instanceof HTMLImageElement && whole(dom) && dom.getClientRects().length) found.push(dom)
  })
  return found
}

/** Its own caption, else the italic line under it, else its name, else nothing worth saying. */
export function captionOf(img: HTMLImageElement): string {
  const own = img.dataset.caption?.trim() || img.closest("figure")?.querySelector("figcaption")?.textContent?.trim()
  if (own) return own
  const next = img.nextElementSibling
  // The caption written under it in the note, drawn beside the picture.
  if (next?.classList.contains("mf-caption") && next.textContent?.trim()) return next.textContent.trim()
  if (next?.tagName === "P" && next.children.length === 1 && next.firstElementChild?.tagName === "EM") return next.textContent?.trim() ?? ""
  if (img.alt) return img.alt
  // A picture pasted in whole has no name, only its bytes.
  if (img.src.startsWith("data:")) return ""
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
          style={{ top: rect.top + 12, left: rect.right - 12 }}
          onPointerLeave={(event) => event.relatedTarget !== hovered && setHovered(null)}
        >
          <Toolbar variant="floating">
            <Button data-style="ghost" size="small" tooltip="Look" shortcutKeys="Space" aria-label="Look" onClick={() => lookAt(hovered)}>
              <AliveIcon icon={MagnifierIcon} size={16} className="tiptap-button-icon" />
            </Button>
          </Toolbar>
        </div>
      )}
      {editor && <PictureTilt editor={editor} />}
      {open && <Viewer key={open.pictures[open.at].src} pictures={open.pictures.map(pictureOf)} start={open.at} onClose={() => setOpen(null)} />}
    </>,
    document.body
  )
}

// Keys pressed this recently: you are writing, and a picture swinging by the
// words would only distract.
const TYPED = 900

/**
 * A note's picture tips a few degrees toward the pointer, and its caption
 * leaves the line under it to ride beside the pointer, as on the tilted cards
 * elsewhere (Tilt), the same springs and the same label. The line under it
 * only fades while the label carries its words, so nothing below moves and the
 * words are never shown twice (unless they run past the label's three lines,
 * when it stays so all of them can be read); it is back the moment the pointer leaves the
 * picture, which is the only way to reach it, so a click on it still writes.
 * Never on a picture that is selected (its toolbar is over it), held, dragged,
 * while you type or write its caption, for a touch, or with Motion off: the
 * plain caption only.
 */
function PictureTilt({ editor }: { editor: Editor }): React.ReactNode {
  const tilt = useTilt(6, 1.015)
  const name = useFollowLabel({ wrap: true, most: 3 })
  const [caption, setCaption] = useState<string | null>(null)
  const on = useRef<HTMLImageElement | null>(null)
  // Where that picture lies flat: the pointer is read against this, never the
  // tipped picture, whose corners swing out from under it and would flicker.
  const area = useRef<DOMRect | null>(null)
  const faded = useRef<HTMLElement | null>(null)
  const transform = useMotionTemplate`perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${tilt.grow})`
  const fade = (line: HTMLElement | null): void => {
    if (faded.current === line) return
    if (faded.current) delete faded.current.dataset.following
    if (line) line.dataset.following = ""
    faded.current = line
  }
  tilt.onFlat(() => {
    name.hide()
    fade(null)
  })

  useEffect(() => {
    const dom = editor.view.dom
    let typed = 0
    const resting = (): boolean => Math.abs(tilt.x.get()) < 0.01 && Math.abs(tilt.y.get()) < 0.01 && Math.abs(tilt.grow.get() - 1) < 0.0005
    // Written on the picture in the frame the springs moved in: one transform, nothing measured.
    const unsubscribe = transform.on("change", (value) => {
      if (on.current) on.current.style.transform = resting() ? "" : value
    })
    // Flat at once, not on its spring: a press means the picture is about to
    // be selected, lifted into Look or dragged, each from its real place.
    const snap = (): void => {
      tilt.flat()
      for (const value of [tilt.x, tilt.y, tilt.glow]) value.jump(0)
      tilt.grow.jump(1)
      if (on.current) on.current.style.transform = ""
    }
    const lineUnder = (img: HTMLImageElement): HTMLElement | null => {
      const next = img.nextElementSibling
      return next instanceof HTMLElement && next.classList.contains("mf-caption") && next.textContent?.trim() ? next : null
    }
    const chosen = (img: HTMLImageElement): boolean => {
      const { selection } = editor.state
      return selection instanceof NodeSelection && editor.view.nodeDOM(selection.from) === img
    }
    // Its box with the tip taken off for a moment.
    const flatRect = (img: HTMLImageElement): DOMRect => {
      const tipped = img.style.transform
      img.style.transform = ""
      const box = img.getBoundingClientRect()
      img.style.transform = tipped
      return box
    }
    const inside = (event: PointerEvent): boolean => {
      const box = area.current
      return !!box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    }
    const onMove = (event: PointerEvent): void => {
      // Still its place while the pointer is over the picture or what lies
      // under it (a corner tipped away shows its line or the page), never over
      // something on top of it, such as its toolbar.
      const under = event.target instanceof Node && !!on.current && event.target.contains(on.current)
      const img = on.current && inside(event) && under ? on.current
        : event.target instanceof HTMLImageElement && dom.contains(event.target) && whole(event.target) && !event.target.closest("[data-type='emoji'], .tiptap-bookmark-image") ? event.target : null
      if (img !== on.current) {
        if (on.current) snap()
        on.current = img
        area.current = null
      }
      if (!img) return
      area.current ??= flatRect(img)
      if (chosen(img) || performance.now() - typed < TYPED || document.activeElement?.closest(".mf-caption") || dom.classList.contains("dragging")) return tilt.flat()
      if (!tilt.lean(event, area.current!)) return
      const line = lineUnder(img)
      if (!line) return void (name.hide(), fade(null))
      const text = line.textContent!.trim()
      setCaption(text)
      // Kept within the picture. A caption longer than the label's three
      // lines stays under the picture too, so all of it can still be read.
      const fits = name.measure(text).whole
      name.follow(event.clientX, event.clientY, area.current!)
      fade(fits ? line : null)
    }
    // Out of the window altogether: every other way off the picture is a move
    // (read on the whole window, so a handle or a toolbar lying over the
    // picture's edge is still its place, not a way out).
    const onOut = (event: PointerEvent): void => {
      if (on.current && !event.relatedTarget) tilt.flat()
    }
    // The page moved under it: its flat place is somewhere else now. Only a
    // scroll that carries the picture: a list scrolling elsewhere leaves it be.
    const onScroll = (event: Event): void => {
      if (!on.current || !(event.target instanceof Node) || !event.target.contains(on.current)) return
      snap()
      on.current = null
      area.current = null
    }
    const onKey = (): void => {
      typed = performance.now()
      if (on.current) tilt.flat()
      // What is typed can move the picture: measured again on the next move.
      area.current = null
    }
    // A press may resize or move it: measured again on the next move.
    const onPress = (): void => {
      if (on.current) snap()
      area.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerout", onOut)
    dom.addEventListener("dragstart", snap)
    window.addEventListener("scroll", onScroll, true)
    dom.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onPress, true)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerout", onOut)
      dom.removeEventListener("dragstart", snap)
      window.removeEventListener("scroll", onScroll, true)
      dom.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onPress, true)
      unsubscribe()
      snap()
      on.current = null
      area.current = null
    }
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  return name.label(caption)
}

/** Where a picture sits when it fills the window: never past its own size. */
function fitOf(picture: Picture): { left: number; top: number; width: number; height: number; scale: number } {
  const roomW = innerWidth - SIDE * 2
  const roomH = innerHeight - TOP - FOOT
  const scale = Math.min(1, roomW / picture.width, roomH / picture.height)
  const width = picture.width * scale
  const height = picture.height * scale
  return { left: (innerWidth - width) / 2, top: TOP + (roomH - height) / 2, width, height, scale }
}

/**
 * Where the frame starts from (or goes back to) to sit over `rect`: moved and
 * scaled about its centre, and tipped a few degrees toward where it is going,
 * the way a card turns as it is lifted, settling flat once there.
 */
function from(rect: DOMRect, fit: ReturnType<typeof fitOf>): { transform: string } {
  const dx = rect.left + rect.width / 2 - (fit.left + fit.width / 2)
  const dy = rect.top + rect.height / 2 - (fit.top + fit.height / 2)
  // Flat, straight out of its place and straight back: the first way it
  // grew, which reads calmer than a tilt in flight. One transform string, so
  // the lift stays on the compositor while the full-size picture decodes.
  return { transform: `translate(${dx}px, ${dy}px) scale(${rect.width / fit.width})` }
}

export function Viewer({ pictures, start, onClose, awayRef }: {
  pictures: Picture[]
  start: number
  onClose: () => void
  /** Filled with a quick, quiet close, for a host that must put it away (its window left for another app). */
  awayRef?: React.RefObject<(() => void) | null>
}): React.JSX.Element {
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

  const picture = pictures[at]
  const img = picture.el
  const fit = fitOf(picture)
  const src = picture.src
  const stored = src.startsWith("mindflow://assets/")
  const caption = picture.caption
  const most = Math.max(4, 2 / fit.scale)

  useEffect(() => {
    const onResize = (): void => setSize((n) => n + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // The picture in the note stands empty while it is out, so it reads as lifted rather than copied.
  useEffect(() => {
    if (!(img instanceof HTMLElement)) return
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

  const close = useCallback(async (quick = false) => {
    if (leaving.current) return
    leaving.current = true
    if (!quick) chime("unlook")
    // Quick: the same way back in under 150ms.
    const pace = quick ? 0.45 : 1
    if (still() || !frame.current) return onClose()
    // Back to where it sits now: the note may have scrolled while it was out.
    // With nowhere to go back to, it settles away where it is.
    img?.scrollIntoView({ block: "nearest" })
    // Only back into its place when all of it is in view: a picture partly
    // under the note's edge would land over the footer for a moment.
    const shown = (rect: DOMRect): boolean => {
      for (let up = img?.parentElement; up; up = up.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(up).overflowY)) continue
        const view = up.getBoundingClientRect()
        if (rect.top < view.top - 1 || rect.bottom > view.bottom + 1) return false
      }
      return rect.top >= 0 && rect.bottom <= innerHeight
    }
    const place = img?.isConnected ? img.getBoundingClientRect() : null
    const home = place ? (shown(place) ? place : null) : picture.rect ?? null
    setView({ zoom: 1, x: 0, y: 0, smooth: true })
    await Promise.all([
      home ? animate(frame.current, from(home, fit), { duration: 0.32 * pace, ease: EASE }) : animate(frame.current, { transform: "translate(0px, 0px) scale(0.96)", opacity: 0 }, { duration: 0.18 * pace, ease: EASE }),
      backdrop.current && animate(backdrop.current, { opacity: 0 }, { duration: 0.28 * pace, ease: EASE }),
      foot.current && animate(foot.current, { opacity: 0 }, { duration: 0.12 * pace }),
    ])
    onClose()
  }, [fit, img, onClose, picture.rect])
  useEffect(() => {
    if (!awayRef) return
    awayRef.current = () => void close(true)
    return () => void (awayRef.current = null)
  }, [awayRef, close])

  const stepBy = useCallback(
    (by: number, keyed = false) => {
      const next = at + by
      if (next < 0 || next >= pictures.length) return chime("nope")
      went.current = keyed ? by * KEYED : by
      chime("page")
      setView({ zoom: 1, x: 0, y: 0, smooth: false })
      setAt(next)
    },
    [at, pictures.length]
  )

  // Its own pixels, here rather than handed to another app: shrunk to fit,
  // one click shows it at full size, centred, and another fits it again.
  const fullSize = (): void => (chime(view.zoom > 1 ? "zoomout" : "zoomin"), zoomTo(view.zoom > 1 ? 1 : 1 / fit.scale))
  // Copied, said where you clicked: the button becomes a tick for a moment, as
  // well as the sound, so it is seen to have worked, and a failure is seen too.
  const [copied, setCopied] = useState<"yes" | "no" | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const copyIt = async (): Promise<void> => {
    const done = !!(await host().copyImage?.(src))
    chime(done ? "copy" : "nope")
    setCopied(done ? "yes" : "no")
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(null), 1400)
  }

  useEffect(() => {
    keys = (event) => {
      if (leaving.current) return true
      const key = event.key
      if (key === "Escape" || (key === " " && !event.metaKey)) void close()
      else if (key === "ArrowLeft" || key === "ArrowRight") stepBy(key === "ArrowLeft" ? -1 : 1, true)
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
  // A click is what the zoom cursor promises: in on the spot you clicked, to
  // the picture's own pixels (or twice its size), and a click again back to
  // fitting. A drag to look around is not a click.
  const onClickImage = (event: React.MouseEvent): void => {
    if (drag.current?.moved) return void (drag.current = null)
    drag.current = null
    chime(view.zoom > 1 ? "zoomout" : "zoomin")
    zoomTo(view.zoom > 1 ? 1 : fit.scale < 1 ? 1 / fit.scale : 2, event.clientX, event.clientY)
  }

  // The first frame grows out of the picture's place in the note; a step
  // after that slides in from the side it came from.
  const lifting = went.current === 0
  const place = img?.isConnected ? img.getBoundingClientRect() : picture.rect ?? null
  const initial = still()
    ? false
    : lifting
      ? place ? { ...from(place, fit), opacity: 1 } : { transform: "translate(0px, 0px) scale(0.96)", opacity: 0 }
      // Stepped with the arrow keys, the next one is simply there, the way
      // the system's Quick Look pages; by the buttons it comes in from its side.
      : Math.abs(went.current) === KEYED ? false : { transform: `translate(${went.current * 16}px, 0px) scale(1)`, opacity: 0 }

  useEffect(() => void chime("look"), [])

  // At rest the picture leans away from the pointer, the way a print tilts
  // when you press near one edge: a few degrees, on a soft spring. Not while
  // zoomed (panning has the pointer) and not with Motion off.
  const leanX = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 })
  const leanY = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 })
  const lean = (event: React.PointerEvent): void => {
    if (still() || view.zoom > 1) return
    const box = event.currentTarget.getBoundingClientRect()
    const nx = (event.clientX - box.left) / box.width - 0.5
    const ny = (event.clientY - box.top) / box.height - 0.5
    leanY.set(-nx * 8)
    leanX.set(ny * 8)
  }
  const unlean = (): void => (leanX.set(0), leanY.set(0))
  useEffect(() => void (view.zoom > 1 && unlean()), [view.zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mf-look" role="dialog" aria-label="Look" aria-modal="true" onWheel={onWheel}>
      <motion.div
        ref={backdrop}
        className="mf-look-backdrop"
        initial={still() ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={() => void close()}
      />
      <motion.div
        key={at}
        ref={frame}
        className="mf-look-frame"
        style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
        initial={initial}
        animate={{ transform: "translate(0px, 0px) scale(1)", opacity: 1 }}
        transition={{ duration: lifting ? 0.44 : 0.18, ease: EASE }}
      >
        <motion.div className="mf-look-lean" style={{ rotateX: leanX, rotateY: leanY }} onPointerMove={lean} onPointerLeave={unlean}>
        <img
          src={src}
          alt={caption}
          draggable={false}
          className="mf-look-image"
          data-zoomed={view.zoom > 1 ? "" : undefined}
          // Its colours until it has loaded: a picture far down the note may not have yet.
          onLoad={(event) => void (event.currentTarget.style.backgroundImage = "")}
          style={{
            backgroundImage: lookOf(src)?.[3] || lookOf(src)?.[4] ? undefined : blurFor(src),
            backgroundSize: "100% 100%",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transition: view.smooth && !still() ? "transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onClick={onClickImage}
        />
        </motion.div>
      </motion.div>
      <motion.div
        ref={foot}
        className="mf-look-foot"
        initial={still() ? false : { opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
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
            {fit.scale < 1 && (
              <Button data-style="ghost" tooltip={view.zoom > 1 ? "Fit to window" : "Full size"} aria-label={view.zoom > 1 ? "Fit to window" : "Full size"} onClick={fullSize}>
                <AliveIcon icon={ExpandIcon} size={16} className="tiptap-button-icon" />
              </Button>
            )}
            {stored && host().showFile && (
              <Button data-style="ghost" tooltip="Show in Finder" aria-label="Show in Finder" onClick={() => void host().showFile?.(src).then((shown) => chime(shown ? "open" : "nope"))}>
                <FolderOpen className="tiptap-button-icon" />
              </Button>
            )}
            {stored && (
              <Button data-style="ghost" tooltip={copied === "yes" ? "Copied" : copied === "no" ? "Could not copy it" : "Copy picture"} shortcutKeys="mod+c" aria-label={copied === "yes" ? "Copied" : "Copy picture"} onClick={() => void copyIt()}>
                {/* The two glyphs share one cell and crossfade, so the button never changes size. The
                    living copy icon sits inside a display: contents span, so it is placed through it. */}
                <span className="grid size-4 place-items-center leading-none [&>*]:col-start-1 [&>*]:row-start-1 [&>.contents>*]:col-start-1 [&>.contents>*]:row-start-1">
                  <Copy size={16} className={`tiptap-button-icon transition-[opacity,scale,filter] duration-160 ${copied === "yes" ? "scale-75 opacity-0 blur-[2px]" : ""}`} />
                  <Check className={`tiptap-button-icon text-(--tt-color-text-green) transition-[opacity,scale,filter] duration-160 ${copied === "yes" ? "" : "scale-75 opacity-0 blur-[2px]"}`} />
                </span>
              </Button>
            )}
            <Button data-style="ghost" tooltip="Close" shortcutKeys="Esc" aria-label="Close" onClick={() => void close()}>
              <X className="tiptap-button-icon" />
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </motion.div>
    </div>
  )
}
