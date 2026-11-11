import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { FolderOpen } from "lucide-react"
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { AliveIcon } from "@/components/ui/alive-icon"
import ExternalLinkIcon from "@/components/ui/external-link-icon"
import { X } from "@/components/ui/icons"
import { Orb } from "@/components/haligtree/orb"
import { refuse } from "@/components/haligtree/ui"
import { faceOf, kindWord } from "@/components/haligtree/files-shelves"
import { useMedia } from "@/components/attachment/attachment-view"
import { markOpened } from "@/lib/media-opened"
import { notes } from "@/lib/notes"
import { call } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { EASING, still } from "@/lib/motion"
import type { Media } from "../../../../main/media"

type Shown = Pick<Media, "src" | "kind" | "name" | "gone">

/**
 * Quick Look for a video or a document in Files, as the picture viewer is for a picture (image-look.tsx): the page
 * goes dark, the file comes up in the middle, and Esc or a click outside puts it away. A video plays there with the
 * app's own controls (the same as a note's, attachment-view.tsx); a document shows its first page as the Mac's Quick
 * Look draws it, large, or, where the Mac draws none, its icon. Either has "Open in its app" and "Show in Finder".
 */
export async function openFileLook(one: Shown, from?: Element | null): Promise<void> {
  markOpened(one.src)
  const rect = from?.getBoundingClientRect() ?? null
  // A document's face already on its tile is there at once, at its own shape, while the large one is made: it grows
  // out of the tile with its page on it, then sharpens, never a loader that pops into a page.
  const had = one.kind === "document" ? faceOf(one.src) : undefined
  let start: Start | null = null
  if (had?.image && !had.icon) {
    const probe = new Image()
    probe.src = had.image
    await probe.decode().catch(() => undefined)
    if (probe.naturalWidth) start = { image: had.image, width: probe.naturalWidth, height: probe.naturalHeight }
  }
  const holder = document.createElement("div")
  document.body.append(holder)
  const root = createRoot(holder)
  const done = (): void => {
    root.unmount()
    holder.remove()
  }
  root.render(<FileLook one={one} from={rect} start={start} onClose={done} />)
}

const bare = (name: string): string => name.replace(/\.[^.]+$/, "") || name
type Start = { image: string; width: number; height: number }

function FileLook({ one, from, start, onClose }: { one: Shown; from: DOMRect | null; start: Start | null; onClose: () => void }): React.JSX.Element {
  const frame = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const close = (): void => {
    if (closing.current) return
    closing.current = true
    chime("fold")
    if (still() || !frame.current) return onClose()
    const out = { duration: 160, easing: EASING, fill: "forwards" as const }
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], out)
    void frame.current.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }], out).finished.then(onClose, onClose)
  }
  // Esc puts it away before anything under it hears the key; Space plays and pauses a video, as Quick Look's.
  const toggleRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") (event.preventDefault(), event.stopPropagation(), close())
      else if (event.key === " " && one.kind === "video" && !(event.target instanceof HTMLButtonElement)) (event.preventDefault(), event.stopPropagation(), toggleRef.current())
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void chime("look"), [])
  // It grows out of its tile, as a picture lifts out of its square.
  useLayoutEffect(() => {
    if (still() || !frame.current) return
    const to = frame.current.getBoundingClientRect()
    const start = from && to.width ? `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(0.2, from.width / to.width)})` : "scale(0.96)"
    frame.current.animate([{ transform: start, opacity: from ? 1 : 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: EASING })
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASING })
  }, [])
  const openOwn = (): void => void window.api.openFile(one.src).then((done) => (done ? (chime("open"), close()) : refuse("No app on this Mac opens it")))
  const show = (): void => void window.api.showFile(one.src).then((done) => chime(done ? "open" : "nope"))
  return (
    <div className="mf-look" role="dialog" aria-label={`Preview of ${one.name || kindWord(one)}`} aria-modal="true" data-file-look={one.kind}>
      <div ref={backdrop} className="mf-look-backdrop" onClick={close} />
      <div data-drag-strip="" aria-hidden className="absolute inset-x-0 top-0 h-10 [-webkit-app-region:drag]" />
      <div className="pointer-events-none absolute inset-x-12 top-12 bottom-24 flex items-center justify-center">
        <div ref={frame} className="pointer-events-auto flex max-h-full max-w-full items-center justify-center">
          {one.kind === "video" ? <Player one={one} toggleRef={toggleRef} /> : <Page one={one} start={start} />}
        </div>
      </div>
      <div className="mf-look-foot">
        <Toolbar variant="floating">
          <span className="mf-look-caption" data-file-look-name>{bare(one.name) || kindWord(one)}</span>
          <ToolbarSeparator />
          <ToolbarGroup>
            <Button data-style="ghost" data-file-look-open aria-label="Open in its app" onClick={openOwn}>
              <AliveIcon icon={ExternalLinkIcon} size={16} className="tiptap-button-icon" />
              <span className="tiptap-button-text">Open in its app</span>
            </Button>
            <Button data-style="ghost" tooltip="Show in Finder" aria-label="Show in Finder" data-file-look-finder onClick={show}>
              <FolderOpen className="tiptap-button-icon" />
            </Button>
            <Button data-style="ghost" tooltip="Close" shortcutKeys="Esc" aria-label="Close" onClick={close}>
              <X className="tiptap-button-icon" />
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </div>
    </div>
  )
}

/** A video, playing as soon as it shows, under the same controls a video in a note wears. */
function Player({ one, toggleRef }: { one: Shown; toggleRef: React.RefObject<() => void> }): React.JSX.Element {
  const { ref, frame, controls, toggle, playing, state } = useMedia(true, null, () => undefined)
  toggleRef.current = toggle
  // As wide as the window lets it be at its own shape: the frame measures its width for its controls (a size
  // container), so it cannot take it from the video, and is given it once the video says its shape.
  const [shape, setShape] = useState(16 / 9)
  const [room, setRoom] = useState(() => ({ w: innerWidth, h: innerHeight }))
  useEffect(() => {
    const resized = (): void => setRoom({ w: innerWidth, h: innerHeight })
    addEventListener("resize", resized)
    return () => removeEventListener("resize", resized)
  }, [])
  // Never blown up past twice its own size: a small clip stays sharp, as Quick Look keeps it.
  const [own, setOwn] = useState(1280)
  const width = Math.max(240, Math.min(room.w - 96, own, (room.h - 144) * shape))
  useEffect(() => {
    const video = ref.current as HTMLVideoElement | null
    if (!video) return
    const read = (): void => void (video.videoWidth && video.videoHeight && (setShape(video.videoWidth / video.videoHeight), setOwn(Math.max(480, Math.min(1280, video.videoWidth * 2)))))
    read()
    video.addEventListener("loadedmetadata", read)
    // Played once it can be: the frame is there first, then it moves.
    const start = (): void => void (video.paused && !video.ended && toggle())
    if (video.readyState >= 2) start()
    else video.addEventListener("loadeddata", start, { once: true })
    return () => (video.removeEventListener("loadeddata", start), video.removeEventListener("loadedmetadata", read))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`tiptap-attachment is-video block${playing ? " is-playing" : ""}`} data-state={state} style={{ margin: 0, width }}>
      <span ref={frame} className="tiptap-video-frame">
        <video ref={ref as React.RefObject<HTMLVideoElement>} className="tiptap-attachment-video" src={one.src} preload="auto" onClick={toggle} playsInline
          style={{ aspectRatio: shape, objectFit: "contain" }} />
        {controls}
      </span>
    </span>
  )
}

/** A document's first page as Quick Look draws it, large; or the Mac's icon for its kind where it draws none. */
function Page({ one, start }: { one: Shown; start: Start | null }): React.JSX.Element {
  const [face, setFace] = useState<{ image: string; icon: boolean } | null>(start && { image: start.image, icon: false })
  // Its box, from the face it opened with: the large one has the same shape and takes its place without a move.
  const [room] = useState(() => ({ w: innerWidth - 96, h: innerHeight - 144 }))
  const box = start ? ((scale) => ({ width: Math.round(start.width * scale), height: Math.round(start.height * scale) }))(Math.min(room.w / start.width, room.h / start.height, 1600 / Math.max(start.width, start.height))) : null
  useEffect(() => {
    let live = true
    void notes.thumb(one.src, 1600)
      .then(async (image) => (image ? { image, icon: false } : { image: await call<string>("media:icon", one.src).catch(() => ""), icon: true }))
      // Quick Look drew nothing this large, though it did small: the small one stays.
      .then((made) => live && setFace((was) => (made.icon && was && !was.icon ? was : made)), () => live && setFace((was) => was ?? { image: "", icon: true }))
    return () => void (live = false)
  }, [one.src])
  if (!face) return <span className="grid h-64 w-64 place-items-center"><Orb label="Drawing a preview…" /></span>
  if (face.icon) {
    return (
      <span data-file-look-icon className="flex w-80 flex-col items-center gap-3 rounded-xl bg-popover px-8 py-10 text-center shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">
        {face.image && <img src={face.image} alt="" draggable={false} className="size-20 object-contain" />}
        <span className="text-heading font-semibold text-foreground">{bare(one.name) || kindWord(one)}</span>
        <span className="text-control text-muted-foreground">{kindWord(one)} file. The Mac has no preview of it: “Open in its app” opens it.</span>
      </span>
    )
  }
  return <img data-file-look-page src={face.image} alt="" draggable={false} className="mf-look-image max-h-[calc(100vh-9rem)] max-w-full cursor-default! bg-white object-contain" style={box ?? { width: "auto", height: "auto" }} />
}
