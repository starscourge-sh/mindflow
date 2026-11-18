import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { AlignCenter, AlignLeft, AlignRight, ListTree, PanelLeft } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AliveIcon } from "@/components/ui/alive-icon"
import DownloadIcon from "@/components/ui/download-icon"
import ExternalLinkIcon from "@/components/ui/external-link-icon"

import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"

import { host } from "@/lib/host"
import { PdfPages, pdfTitle, sheetAt, showPage } from "@/components/pdf/pdf-pages"
import { learnTitle, openPdf } from "@/components/pdf/pdf-reader"
import { useDarkPages, usePaperPages } from "@/components/pdf/paper"
import { usePdfCover } from "@/components/pdf/pdf-cover"
import { PdfSide, usePdfOutline, type RailTab } from "@/components/pdf/pdf-rail"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { chime } from "@/lib/sound"
import { canSplit } from "@/lib/split"
import { isNodeSelected } from "@/extensions/selected-nodes"
import { hasWords, heardOf, isTranscribing, onTranscribing, stopTranscribing, transcribe, transcriptOf } from "@/lib/transcribe"
import { bubblesOf } from "@/lib/bubbles"
import { playAt } from "@/extensions/line-cards"
import { Orb } from "@/components/haligtree/orb"
import { SoundPlayer, VideoPlayer, soundTitle } from "@/components/haligtree/sound-player"
import { FileText as File, FileText } from "@/components/ui/icons"
import { plural } from '../../../../main/dates'
import { sizeOf } from "@/components/pdf/book-head"
import { kindWord, useFileFace } from "@/components/haligtree/files-shelves"
import { openFileLook } from "@/components/attachment/file-look"
import type { Media } from "../../../../main/media"

/** 57.3 KB, not 58624: as Finder says it (decimal units), the same as the shelf and a book's Information. */
function readableSize(bytes: number): string {
  return bytes ? sizeOf(bytes) : ""
}

/** The widths a video can take, as a picture's: a document reads better in columns. */
const SIZES = [
  { label: "S", width: "35%" },
  { label: "M", width: "60%" },
  { label: "L", width: "100%" },
]
const ALIGNS = [
  { value: "left", icon: <AlignLeft className="tiptap-button-icon" /> },
  { value: "center", icon: <AlignCenter className="tiptap-button-icon" /> },
  { value: "right", icon: <AlignRight className="tiptap-button-icon" /> },
]

/** 1:05, or 1:02:05 for something long. */
const clock = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00"
  const whole = Math.floor(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s).padStart(2, "0")}`
}

/**
 * What a picked video offers while you look at it, as a picture's toolbar
 * does: its width and its place in the line. Never on hover: everything else
 * it does is in its block menu (⋮⋮ or a right-click), under "Video".
 */
function MediaToolbar({ props }: { props: NodeViewProps }): React.JSX.Element {
  const { width, align } = props.node.attrs
  // Over the top by default, as a picture's; under the block when another
  // block's player or file card is in that spot (a picture's edge may be
  // covered: its own toolbar sits inside its top, never there) (two recordings one under the other), or
  // something covers it (a pager, the window's top); over its own block's top
  // edge when there is a player on both sides.
  const bar = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<"above" | "below" | "inside">("above")
  // Centred on a small video in a narrow pane it would hang off a side: nudged
  // back inside whatever clips it.
  const [nudge, setNudge] = useState(0)
  const [tight, setTight] = useState(false)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    // The node view mounts before it is on the page, so this waits for the
    // first real size, and measures again as the buttons settle in and as the
    // blocks around it move (one deleted, one added).
    let nudged = 0
    let full = 0
    const root = props.editor.view.dom
    const fit = (): void => {
      const box = el.getBoundingClientRect()
      const own = el.parentElement
      const tall = el.firstElementChild?.getBoundingClientRect().height ?? 0
      if (!el.isConnected || !box.width || !own || !tall) return
      const block = own.getBoundingClientRect()
      const spots = {
        above: { top: block.top - 8 - tall, bottom: block.top - 8 },
        below: { top: block.bottom + 8, bottom: block.bottom + 8 + tall },
      }
      // Measured from the block, not from where the bar is now, so it never
      // flips back and forth.
      const others = [...root.querySelectorAll<HTMLElement>(".tiptap-attachment, iframe")].filter((one) => !own.contains(one) && !one.contains(own))
      const clashes = (spot: { top: number; bottom: number }): boolean =>
        others.some((one) => {
          const them = one.getBoundingClientRect()
          return them.width > 0 && them.top < spot.bottom && them.bottom > spot.top && them.left < box.right && them.right > box.left
        })
      const hit = document.elementFromPoint(box.left + box.width / 2, spots.above.top + 2)
      const covered = spots.above.top < 0 || !hit || !(root.contains(hit) || el.contains(hit) || hit.contains(root))
      setPlace(!covered && !clashes(spots.above) ? "above" : !clashes(spots.below) ? "below" : "inside")
      let clip: HTMLElement | null = el.parentElement
      while (clip && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement
      const edge = clip?.getBoundingClientRect() ?? { left: 0, right: innerWidth }
      // Wider than the pane even so: it drops the file's name, which the
      // card's own title already shows, and keeps every button.
      if (!el.classList.contains("is-tight")) full = box.width
      const room = edge.right - edge.left - 16
      setTight(full > room)
      const [left, right] = [box.left - nudged, box.right - nudged]
      // The left edge wins when it cannot fit both: that is where it starts.
      nudged = Math.round(Math.max(0, edge.left + 8 - left) || -Math.max(0, right - (edge.right - 8)))
      setNudge(nudged)
    }
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    // The block it sits on resizes too, as the video's own size loads, and
    // the note as blocks around it come and go.
    if (el.parentElement) watch.observe(el.parentElement)
    watch.observe(root)
    return () => watch.disconnect()
  }, [props.editor])
  return (
    <span ref={bar} data-media-toolbar="" className={`tiptap-media-toolbar is-${place}${tight ? " is-tight" : ""}`} style={nudge ? { transform: `translateX(calc(-50% + ${nudge}px))` } : undefined} contentEditable={false} onMouseDown={(event) => event.preventDefault()}>
      <Toolbar variant="floating">
        {(
          <>
            <ToolbarGroup>
              {SIZES.map((one) => (
                <Button key={one.label} data-style="ghost" data-active-state={(width ?? "100%") === one.width ? "on" : "off"} aria-label={`${one.label} width`} onClick={() => props.updateAttributes({ width: one.width })}>
                  <span className="tiptap-button-text">{one.label}</span>
                </Button>
              ))}
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              {ALIGNS.map((one) => (
                <Button key={one.value} data-style="ghost" data-active-state={(align ?? "left") === one.value ? "on" : "off"} aria-label={`Align ${one.value}`} onClick={() => props.updateAttributes({ align: one.value })}>
                  {one.icon}
                </Button>
              ))}
            </ToolbarGroup>
          </>
        )}
      </Toolbar>
    </span>
  )
}

/**
 * Whether this block's toolbar shows: one at a time in a note. The picked
 * block's (clicked, so it is the whole selection: a block caught in a longer
 * selection is outlined but offers no toolbar), or else the one under the
 * pointer while nothing is picked. Read from the editor's own selection, so
 * it goes the moment the selection moves off the block.
 */
function useToolbarShown(props: NodeViewProps): boolean {
  const picked = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.state.selection instanceof NodeSelection,
  })
  return props.editor.isEditable && props.selected && picked
}

/**
 * The length a recording or video shows before it plays (or a video's shape):
 * the one kept on the block, and once found for one without (a video's by its
 * player, a recording's as its waveform is read), kept there, outside Undo, as
 * a fact about the file rather than an edit.
 */
function useKept(props: NodeViewProps, attr: "duration" | "shape"): [number | null, (value: number) => void] {
  const known = Number(props.node.attrs[attr]) || null
  const learn = (value: number): void => {
    const at = props.getPos()
    const { editor } = props
    if (at == null || !editor.isEditable || editor.state.doc.nodeAt(at)?.type.name !== "attachment" || editor.state.doc.nodeAt(at)?.attrs[attr] === value) return
    editor.view.dispatch(editor.state.tr.setNodeAttribute(at, attr, value).setMeta("addToHistory", false))
  }
  return [known, learn]
}
const useLength = (props: NodeViewProps): [number | null, (seconds: number) => void] => useKept(props, "duration")

/**
 * A video: the player is the block, sized and placed like a picture, and it is the sound player's own (sound-player.tsx,
 * VideoPlayer): its poster frame from Quick Look until it plays, the same bar over its foot. Never taller than most of
 * the window: a portrait film is narrowed to stay whole.
 */
function VideoBlock(props: NodeViewProps): React.JSX.Element {
  const { src, name, width, align } = props.node.attrs
  const selected = isNodeSelected(props)
  const shown = useToolbarShown(props)
  const [length, learn] = useLength(props)
  const [playing, setPlaying] = useState(false)
  // Its shape as kept on the block (a film never seen here yet: as most are, 16:9, until its player reads it).
  const [kept, keep] = useKept(props, "shape")
  const [read, setRead] = useState<number | null>(null)
  const ratio = read ?? kept
  const one = useMemo(() => ({ src, name: String(name ?? ""), kind: "video", gone: false }) as Media, [src, name])
  const face = useFileFace(/^(haligtree|mindflow):\/\/assets\//.test(src) ? one : null, true)
  return (
    <NodeViewWrapper className={`tiptap-attachment is-video${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`} data-align={align ?? undefined}
      style={{ width: width ?? undefined, maxWidth: ratio ? `min(100%, ${(70 * ratio).toFixed(2)}vh)` : undefined }}>
      <VideoPlayer className="tiptap-video-frame" src={src} poster={face && !face.icon ? face.image : null} length={length} onLength={learn} onPlaying={setPlaying}
        onShape={(w, h) => ((shape) => (setRead(shape), keep(shape)))(Math.round((w / h) * 1000) / 1000)} onOpenOwn={() => void host().openFile?.(src, one.name)} pictureStyle={{ aspectRatio: ratio ?? 16 / 9 }} />
      {shown && <MediaToolbar props={props} />}
    </NodeViewWrapper>
  )
}

/** "0:12", the way the player writes a time. */
const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

/**
 * In the recording's status place while its words are made out: the orb, how far into the recording the words
 * have reached ("Listening… 0:12 of 0:56", from the helper's own parts as they come, never past the length; it
 * counted seconds on the clock before, and read "1:43 of 0:47"), and "Stop" (or Esc on it) to give up.
 */
function Listening({ src, length }: { src: string; length: number | null }): React.JSX.Element {
  const heard = useSyncExternalStore(onTranscribing, () => heardOf(src))
  const shown = length ? Math.min(heard, length) : heard
  return (
    <span className="tiptap-attachment-listening" data-listening-clock={mmss(shown)} contentEditable={false}>
      <Orb state="listening" label={`Listening… ${mmss(shown)}${length ? ` of ${mmss(length)}` : ""}`} />
      <button type="button" data-transcribe-stop onMouseDown={(event) => event.preventDefault()} onClick={() => stopTranscribing(src)}
        onKeyDown={(event) => event.key === "Escape" && (event.preventDefault(), stopTranscribing(src))}
        className="cursor-pointer rounded-sm font-medium text-(--mf-muted-strong) underline-offset-2 transition-colors hover:text-foreground hover:underline active:scale-[0.97]">
        Stop
      </button>
    </span>
  )
}

/** A recording: the one sound player (sound-player.tsx) in a card like a file's, its transcript under it. */
function AudioBlock(props: NodeViewProps): React.JSX.Element {
  const { src, name } = props.node.attrs
  const selected = isNodeSelected(props)
  const [length, learn] = useLength(props)
  const [playing, setPlaying] = useState(false)
  const listening = useSyncExternalStore(onTranscribing, () => isTranscribing(src))
  // Kept with "Transcribe voice notes as you record them" on: its words start as it first shows, once.
  useEffect(() => {
    if (!props.node.attrs.transcribe || !props.editor.isEditable) return
    props.updateAttributes({ transcribe: false })
    void transcribe(props.editor, src)
  }, [props.node.attrs.transcribe]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘K's "Transcribe the voice notes": each recording on show without its words.
  useEffect(() => {
    const run = (): void => void (props.editor.isEditable && !hasWords(props.editor, src) && transcribe(props.editor, src))
    window.addEventListener("haligtree:transcribe-page", run)
    return () => window.removeEventListener("haligtree:transcribe-page", run)
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps
  const worded = hasWords(props.editor, src)
  // With words: two tabs under the card, your own writing as it is, or the transcript as speech bubbles.
  const [tab, setTab] = useState<"thoughts" | "transcript">("thoughts")
  const noWords = !listening && !worded && props.editor.isEditable ? (
    <>
      <span>No transcript</span>
      <span aria-hidden>·</span>
      <button type="button" data-transcribe title="Its words under it, by Apple’s speech recognition" onMouseDown={(event) => event.preventDefault()} onClick={() => void transcribe(props.editor, src)}
        className="cursor-pointer rounded-sm font-medium text-(--mf-muted-strong) underline-offset-2 transition-colors hover:text-foreground hover:underline active:scale-[0.97]">
        Transcribe
      </button>
    </>
  ) : null
  // One status in one place, the player's quiet line: "No transcript · Transcribe" or "Listening… 0:14 of 0:47 · Stop".
  const status = listening ? <Listening src={src} length={length} /> : noWords
  return (
    <NodeViewWrapper className={`tiptap-attachment is-audio${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`} data-words={worded ? "" : undefined}>
      <div className="tiptap-attachment-card">
        <SoundPlayer src={src} name={soundTitle(name, null)} length={length} onLength={learn} onPlaying={setPlaying}
          status={status && <span data-no-words className="flex min-w-0 items-center gap-1.5">{status}</span>} />
      </div>
      {worded && !listening && (
        <div data-voice-tabs contentEditable={false} className="flex flex-col gap-2 pt-1.5">
          <div role="tablist" className="flex items-center gap-1 text-xs">
            {(["thoughts", "transcript"] as const).map((one) => (
              <button key={one} type="button" role="tab" aria-selected={tab === one} data-voice-tab={one} onMouseDown={(event) => event.preventDefault()} onClick={() => setTab(one)}
                className="cursor-pointer rounded-full px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground aria-selected:bg-accent aria-selected:text-foreground active:scale-[0.97]">
                {one === "thoughts" ? "My thoughts" : "Transcript"}
              </button>
            ))}
          </div>
          {/* The bubbles take the plain lines' place while they show: the same words are never on the page twice. */}
          {tab === "transcript" && <style>{`.ProseMirror [data-words-of="${CSS.escape(src)}"] { display: none; }`}</style>}
          {tab === "transcript" && <Bubbles lines={transcriptOf(props.editor, src)} play={(at) => playAt(props.editor.view.dom as HTMLElement, src, at)} />}
        </div>
      )}
    </NodeViewWrapper>
  )
}

/**
 * A PDF: its name, page count and size over its pages, which scroll in a box
 * of their own inside the note. "Open" shows it full size.
 */
function PdfBlock(props: NodeViewProps): React.JSX.Element {
  const { src, name, size } = props.node.attrs
  const selected = isNodeSelected(props)
  const scroller = useRef<HTMLDivElement>(null)
  const block = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const pages = doc?.numPages ?? 0
  // Its cover and own title, shared with every card of the same book (kept in the book's store once drawn).
  const cover = usePdfCover(src, name)
  // Its pages look as the reader's do: white, or "Paper pages" when that is on (one setting for both).
  const [paper, setPaper] = usePaperPages()
  // "Dark pages" set in the reader turns a PDF in a note dark too, as "Paper pages" does.
  const [dark, setDark] = useDarkPages()
  // How its pages sit, as you last left them for every PDF in a note.
  const [fit, setFit] = useState<"width" | "height">(() => (localStorage.getItem("pdf-note-fit") === "height" ? "height" : "width"))
  const [spread, setSpread] = useState(() => localStorage.getItem("pdf-note-spread") === "two")
  const [rail, setRail] = useState<RailTab | null>(null)
  const outline = usePdfOutline(doc)
  const [page, setPage] = useState(1)
  const fitTo = (next: "width" | "height"): void => (localStorage.setItem("pdf-note-fit", next), chime("tick"), setFit(next))
  const spreadTo = (two: boolean): void => (localStorage.setItem("pdf-note-spread", two ? "two" : "one"), chime("tick"), setSpread(two))
  const railTo = (tab: RailTab | null): void => (chime(tab ? "slide" : "fold"), setRail(tab))
  // The page you are on: the first whose foot is below the top of the box.
  useEffect(() => {
    const box = scroller.current
    if (!box || !doc) return
    const read = (): void => {
      const top = box.getBoundingClientRect().top
      // Found by halves, as the reader finds its page (pdf-reader.tsx): a few sheets read on each frame of a scroll,
      // where every sheet down to this one was.
      const sheet = sheetAt(box.querySelector(".pdf-pages"), (one) => one.bottom > top + 24)
      if (sheet) setPage(Number(sheet.dataset.page) || 1)
    }
    box.addEventListener("scroll", read, { passive: true })
    return () => box.removeEventListener("scroll", read)
  }, [doc])
  const go = (to: number): void => {
    if (!scroller.current?.querySelector(`.pdf-page[data-page="${to}"]`)) return
    showPage(scroller.current, to, 12)
    setPage(to)
  }
  // The same choices from the block's right-click menu (turn-into/clicked.tsx), told to this block.
  useEffect(() => {
    const el = block.current
    if (!el) return
    const hear = (event: Event): void => {
      const what = (event as CustomEvent<string>).detail
      if (what === "fit-width" || what === "fit-height") fitTo(what === "fit-width" ? "width" : "height")
      if (what === "one" || what === "two") spreadTo(what === "two")
      if (what === "paper") setPaper(!paper)
      if (what === "pages" || what === "outline") railTo(what)
      if (what === "no-rail") railTo(null)
    }
    el.addEventListener("mf:pdf-view", hear)
    return () => el.removeEventListener("mf:pdf-view", hear)
  })
  // Full size in a pane of the main window; a note's own window has no panes, so the system's viewer there.
  // At the page last read in the block, never the page a hover over its name or cover turned to (that page opens from the preview card).
  const open = (): void => (canSplit() ? openPdf(src, name, page > 1 ? page : undefined) : void host().openFile?.(src, name))
  const tool = (label: string, on: boolean, run: () => void, icon: React.ReactNode, title = label): React.JSX.Element => (
    <Button data-style="ghost" aria-label={label} title={title} data-active-state={on ? "on" : "off"} onClick={(event) => (event.stopPropagation(), run())}>{icon}</Button>
  )
  return (
    <NodeViewWrapper
      ref={block}
      className={`tiptap-attachment is-pdf${selected ? " is-selected" : ""}${paper && !dark ? " is-paper" : ""}${dark ? " is-dark" : ""}`}
      data-pdf-fit={fit}
      data-pdf-spread={spread ? "two" : "one"}
      data-pdf-rail={rail ?? ""}
      data-pdf-page={page}
      data-pdf-outline={outline.length ? "" : undefined}
    >
      {/* The book as the reader's Details shows it: its cover, its own title in the serif, and the file under it. */}
      <div className="tiptap-attachment-card tiptap-pdf-card" data-drag-handle="">
        {/* A background, not an <img>: a picture in the note is a picture block, this is the book's face. */}
        <span aria-hidden className="tiptap-pdf-cover cursor-pointer" data-pdf-peek={src} data-pdf-peek-name={name} onClick={(event) => (event.stopPropagation(), open())} style={cover ? { backgroundImage: `url("${cover.image}")` } : undefined}>
          {!cover && <FileText className="tiptap-attachment-icon" />}
        </span>
        <span className="tiptap-attachment-body">
          <span className="tiptap-pdf-title">{cover?.title ?? (String(name ?? "").replace(/\.pdf$/i, "") || "PDF")}</span>
          <span className="tiptap-pdf-file">
            <span className="tiptap-attachment-name cursor-pointer" data-pdf-peek={src} data-pdf-peek-name={name} onClick={(event) => (event.stopPropagation(), open())}>{name || "PDF"}</span>
            <span className="tiptap-attachment-size">
              {[pages ? `${plural(pages, 'page')}` : "", readableSize(size)].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>
        <button type="button" aria-label={`Open ${name || "PDF"}`} title="Open" className="tiptap-attachment-save" onClick={(event) => { event.stopPropagation(); open() }}>
          <AliveIcon icon={ExternalLinkIcon} size={16} />
        </button>
        <button type="button" aria-label={`Save ${name || "PDF"}`} title="Save" className="tiptap-attachment-save" onClick={(event) => { event.stopPropagation(); void host().saveFileAs?.(src, name) }}>
          <AliveIcon icon={DownloadIcon} size={16} />
        </button>
      </div>
      {/* The reader's own view choices, in its own buttons: how the pages sit, their colour, and the rail beside them. */}
      <div className="tiptap-pdf-bar" contentEditable={false} data-pdf-bar="" onMouseDown={(event) => event.stopPropagation()}>
        {tool("Sidebar", !!rail, () => railTo(rail ? null : "pages"), <PanelLeft className="tiptap-button-icon" />, "Pages and outline")}
        {outline.length > 0 && tool("Show this page in contents", rail === "outline", () => railTo("outline"), <ListTree className="tiptap-button-icon" />)}
        <span className="tiptap-pdf-bar-gap" />
        {/* How the pages lie and look: one "View" menu, named in words, as the reader's bar has it, not five bare icons. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button data-style="ghost" aria-label="View" title="View: how the pages lie, and their colour" onClick={(event) => event.stopPropagation()}>
              <span className="tiptap-button-text">View</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" data-pdf-block-view>
            <DropdownMenuLabel>Fit</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={fit} onValueChange={(to) => fitTo(to as "width" | "height")}>
              <DropdownMenuRadioItem value="width">Fit width</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="height">Fit height: a whole page in view</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Layout</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={spread ? "two" : "one"} onValueChange={(to) => spreadTo(to === "two")}>
              <DropdownMenuRadioItem value="one">One page</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="two">Two pages side by side</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Page colour</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={dark ? "dark" : paper ? "paper" : "white"} onValueChange={(to) => (chime("tick"), setPaper(to === "paper"), setDark(to === "dark"))}>
              <DropdownMenuRadioItem value="white">White pages</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="paper">Paper pages</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark pages</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="tiptap-pdf-body" contentEditable={false}>
        {rail && doc && <PdfSide doc={doc} page={page} outline={outline} tab={rail} onTab={railTo} onGo={go} />}
        <div ref={scroller} className="tiptap-pdf-scroll" onMouseDown={(event) => event.stopPropagation()}>
          <PdfPages src={src} scroller={scroller} fit={fit} spread={spread} dark={dark} onLoad={(loaded) => (setDoc(loaded), void pdfTitle(loaded, name).then((read) => learnTitle(src, read)))} />
        </div>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * The card: an icon, the name it arrived under, how big it is, and a way out.
 * A video or a recording plays where it sits instead.
 */
export function AttachmentView(props: NodeViewProps): React.JSX.Element {
  const { src, name, size } = props.node.attrs
  const selected = isNodeSelected(props)
  if (/\.(mp4|m4v|mov|webm)$/i.test(name)) return <VideoBlock {...props} />
  if (/\.(mp3|m4a|weba|wav|ogg|aac|flac)$/i.test(name)) return <AudioBlock {...props} />
  if (/\.pdf$/i.test(name)) return <PdfBlock {...props} />

  return (
    <NodeViewWrapper
      className={`tiptap-attachment${selected ? " is-selected" : ""}`}
    >
      {/* A div, not a button: the save control is a real button and one cannot
          sit inside another. Selecting the card is ProseMirror's job anyway. */}
      <div
        className="tiptap-attachment-card"
        // Opening is a double click on purpose. A single one selects the card,
        // which is what every other block here does, and handing a file to the
        // system is not something to do by brushing past it.
        onDoubleClick={() => void host().openFile?.(src, name)}
      >
        <CardFace src={src} name={name} />
        <span className="tiptap-attachment-body">
          <span className="tiptap-attachment-name" title={name || undefined}>{name || "Attachment"}</span>
          <span className="tiptap-attachment-size">{[kindWord({ kind: "document", name: String(name ?? ""), src }), readableSize(size)].filter(Boolean).join(" · ")}</span>
        </span>

        <button
          type="button"
          aria-label={`Open ${name || "attachment"}`}
          className="tiptap-attachment-save"
          onClick={(event) => {
            event.stopPropagation()
            void host().openFile?.(src, name)
          }}
        >
          <AliveIcon icon={ExternalLinkIcon} size={16} />
        </button>
        <button
          type="button"
          aria-label={`Save ${name || "attachment"}`}
          className="tiptap-attachment-save"
          // Without this the card's own handler counts the second click too.
          onClick={(event) => {
            event.stopPropagation()
            void host().saveFileAs?.(src, name)
          }}
        >
          <AliveIcon icon={DownloadIcon} size={16} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * A file's face on its card, as Files shows it (files-shelves.tsx): its first page as the Mac's Quick Look draws it,
 * or the Mac's icon for its kind. A click on it previews the file over the page; the card's double click opens it in its app.
 */
function CardFace({ src, name }: { src: string; name: string }): React.JSX.Element {
  const one = useMemo(() => ({ src, name: String(name ?? ""), kind: "document", gone: false }) as Media, [src, name])
  const face = useFileFace(/^(haligtree|mindflow):\/\/assets\//.test(src) ? one : null, false)
  return (
    <button type="button" data-attachment-face={face ? (face.icon ? "icon" : "page") : ""} aria-label={`Preview ${name || "the file"}`} title="Preview"
      className={`tiptap-attachment-face${face && !face.icon ? " is-page" : ""}`}
      onClick={(event) => (event.stopPropagation(), void openFileLook(one, event.currentTarget))}>
      {face?.image ? <img src={face.image} alt="" draggable={false} /> : <File className="tiptap-attachment-icon" />}
    </button>
  )
}

/** Shown a page at a time: 300 bubbles stay quick, the rest one press away. */
const PAGE = 60

/**
 * A transcript as speech bubbles (lib/bubbles.ts): split where the speaker
 * paused, each with its time, which plays the recording from there.
 */
function Bubbles({ lines, play }: { lines: string[]; play: (at: number) => void }): React.JSX.Element {
  const key = lines.join("\n")
  const bubbles = useMemo(() => bubblesOf(key ? key.split("\n") : []), [key])
  const [shown, setShown] = useState(PAGE)
  const left = bubbles.length - shown
  return (
    <div data-bubbles className="mf-more flex max-h-80 flex-col items-start gap-1.5 overflow-y-auto pr-1">
      {bubbles.slice(0, shown).map((one, i) => (
        <button key={i} type="button" data-bubble onMouseDown={(event) => event.preventDefault()} onClick={() => one.at !== null && play(one.at)}
          className="max-w-[85%] cursor-pointer rounded-2xl rounded-tl-md bg-muted/70 px-3 py-1.5 text-left text-control transition-colors hover:bg-muted active:scale-[0.99]">
          {one.at !== null && <span className="mr-1.5 text-xs tabular-nums text-muted-foreground">{clock(one.at)}</span>}
          {one.text}
        </button>
      ))}
      {left > 0 && (
        <button type="button" data-more-bubbles onMouseDown={(event) => event.preventDefault()} onClick={() => setShown((now) => now + PAGE)}
          className="cursor-pointer rounded-full px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Show {Math.min(PAGE, left)} more ({left} left)
        </button>
      )}
    </div>
  )
}
