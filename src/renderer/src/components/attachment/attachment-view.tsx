import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { AlignCenter, AlignLeft, AlignRight, AudioLines, File, FileText, Maximize, Pause, PictureInPicture2, Play, RotateCcw, Volume2, VolumeX } from "lucide-react"
import { AliveIcon } from "@/components/ui/alive-icon"
import DownloadIcon from "@/components/ui/download-icon"
import ExternalLinkIcon from "@/components/ui/external-link-icon"
import TrashIcon from "@/components/ui/trash-icon"

import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { cue } from "@/lib/cues"
import { Roll } from "@/lib/roll"

import { host } from "@/lib/host"
import { isNodeSelected } from "@/extensions/selected-nodes"

/** 57.3 KB, not 58624. Binary units, because that is what a file manager shows. */
function readableSize(bytes: number): string {
  if (!bytes) return ""
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
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

/** The speeds the chip steps through, and back to the first. */
const RATES = [1, 1.5, 2]

/**
 * The editor's own controls over a video or a recording: play, the place in
 * it, the time, speed and sound, and for a video its own window and full
 * screen. Drawn here rather than the browser's, so they wear the same type,
 * colours and corners as everything else on the page.
 *
 * Play, pause and a seek answer at once; the flourish is kept for the first
 * play (the frame lights up) and the end (the controls settle back with a
 * replay in place of play).
 */
function useMedia(video: boolean): {
  ref: React.RefObject<HTMLMediaElement | null>
  frame: React.RefObject<HTMLSpanElement | null>
  controls: React.JSX.Element
  toggle: () => void
  playing: boolean
  state: string
} {
  const ref = useRef<HTMLMediaElement | null>(null)
  const frame = useRef<HTMLSpanElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [at, setAt] = useState(0)
  const [length, setLength] = useState(0)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  // A moment's class on the block: "first" as it first plays, "ended" as it stops at the end.
  const [moment, setMoment] = useState<"first" | "ended" | null>(null)
  const started = useRef(false)
  // Where the pointer is over the scrubber, and the time there.
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const [settling, setSettling] = useState(false)
  useEffect(() => {
    const media = ref.current
    if (!media) return
    const sync = (): void => {
      setPlaying(!media.paused)
      setEnded(media.ended)
      setAt(media.currentTime)
      setLength(media.duration)
      setMuted(media.muted)
      setRate(media.playbackRate)
    }
    const end = (): void => {
      cue("media-end")
      setMoment("ended")
    }
    const events = ["play", "pause", "timeupdate", "loadedmetadata", "volumechange", "ended", "ratechange"]
    events.forEach((name) => media.addEventListener(name, sync))
    media.addEventListener("ended", end)
    sync()
    return () => {
      events.forEach((name) => media.removeEventListener(name, sync))
      media.removeEventListener("ended", end)
    }
  }, [])
  // A moment lasts as long as its animation, then the block is plain again.
  useEffect(() => {
    if (!moment) return
    const done = setTimeout(() => setMoment(null), moment === "first" ? 1400 : 700)
    return () => clearTimeout(done)
  }, [moment])
  const toggle = (): void => {
    const media = ref.current
    if (!media) return
    if (media.paused) {
      if (media.ended) {
        cue("media-replay")
        media.currentTime = 0
      } else if (!started.current && media.currentTime === 0) {
        cue("media-start")
        setMoment("first")
      } else cue("play")
      started.current = true
      void media.play()
    } else {
      cue("pause")
      media.pause()
    }
  }
  const speed = (): void => {
    const media = ref.current
    if (!media) return
    const next = (RATES.indexOf(media.playbackRate) + 1) % RATES.length
    cue("media-speed", next)
    media.playbackRate = RATES[next]
  }
  const popOut = (which: "pip" | "full"): void => {
    const media = ref.current as HTMLVideoElement | null
    if (!media) return
    const out = which === "pip" ? document.pictureInPictureElement === media : document.fullscreenElement === frame.current
    cue(out ? "media-window-close" : "media-window")
    if (which === "pip") void (out ? document.exitPictureInPicture() : media.requestPictureInPicture()).catch(() => {})
    else void (out ? document.exitFullscreen() : (frame.current?.requestFullscreen() ?? Promise.resolve())).catch(() => {})
  }
  const end = Number.isFinite(length) ? length : 0
  const state = ended ? "ended" : playing ? "playing" : "paused"
  const controls = (
    <span className="tiptap-media-controls" contentEditable={false} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="tiptap-media-play" data-state={state} aria-label={ended ? "Play again" : playing ? "Pause" : "Play"} title={ended ? "Play again" : playing ? "Pause" : "Play"} onClick={toggle}>
        {/* All three drawn, one shown: the swap is a quick morph, never a wait. */}
        <Play data-icon="paused" />
        <Pause data-icon="playing" />
        <RotateCcw data-icon="ended" />
      </button>
      <span className="tiptap-media-scrub">
        <input
          type="range"
          aria-label="Place in it"
          className={settling ? "is-settling" : undefined}
          min={0}
          max={end}
          step="any"
          value={at}
          style={{ "--done": `${end ? (at / end) * 100 : 0}%` } as React.CSSProperties}
          onChange={(event) => {
            if (ref.current) ref.current.currentTime = Number(event.target.value)
          }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const x = Math.min(Math.max(event.clientX - box.left, 0), box.width)
            setHover({ x, time: box.width ? (x / box.width) * end : 0 })
          }}
          onPointerLeave={() => setHover(null)}
          onPointerUp={() => {
            setSettling(true)
            setTimeout(() => setSettling(false), 450)
          }}
        />
        {hover && end > 0 && (
          <span className="tiptap-media-bubble" style={{ left: hover.x }}>{clock(hover.time)}</span>
        )}
      </span>
      <span className="tiptap-media-time">
        <Roll text={clock(at)} /><span className="tiptap-media-total"> / {clock(length)}</span>
      </span>
      <button type="button" className="tiptap-media-speed" aria-label={`Speed ${rate} times`} title="Speed" onClick={speed}>
        <Roll text={`${rate}×`} />
      </button>
      <button
        type="button"
        aria-label={muted ? "Sound on" : "Sound off"}
        title={muted ? "Sound on" : "Sound off"}
        onClick={() => {
          if (!ref.current) return
          ref.current.muted = !ref.current.muted
          cue(ref.current.muted ? "pause" : "play")
        }}
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </button>
      {video && (
        <>
          <button type="button" className="tiptap-media-window" aria-label="Picture in picture" title="Picture in picture" onClick={() => popOut("pip")}>
            <PictureInPicture2 />
          </button>
          <button type="button" className="tiptap-media-window" aria-label="Full screen" title="Full screen" onClick={() => popOut("full")}>
            <Maximize />
          </button>
        </>
      )}
    </span>
  )
  return { ref, frame, controls, toggle, playing, state: [state, moment && `is-${moment}`].filter(Boolean).join(" ") }
}

/**
 * What a selected video offers, as a picture's toolbar does: its width, its
 * place in the line, then its name and size, opening it and saving it.
 */
function MediaToolbar({ props, sized }: { props: NodeViewProps; sized: boolean }): React.JSX.Element {
  const { src, name, size, width, align } = props.node.attrs
  // Over the top by default, as a picture's; under the block when something
  // covers that spot (a pager, the window's top), the way the picture's flips.
  const bar = useRef<HTMLSpanElement>(null)
  const [below, setBelow] = useState(false)
  // Centred on a small video in a narrow pane it would hang off a side: nudged
  // back inside whatever clips it.
  const [nudge, setNudge] = useState(0)
  const [tight, setTight] = useState(false)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    // The node view mounts before it is on the page, so this waits for the
    // first real size, and measures again as the buttons settle in.
    let placed = false
    let nudged = 0
    let full = 0
    const fit = (): void => {
      const box = el.getBoundingClientRect()
      if (!el.isConnected || !box.width) return
      if (!placed) {
        placed = true
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 2)
        if (box.top < 0 || !hit || !el.contains(hit)) setBelow(true)
      }
      let clip = el.parentElement
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
    // The block it sits on resizes too, as the video's own size loads.
    if (el.parentElement) watch.observe(el.parentElement)
    return () => watch.disconnect()
  }, [])
  return (
    <span ref={bar} className={`tiptap-media-toolbar${below ? " is-below" : ""}${tight ? " is-tight" : ""}`} style={nudge ? { transform: `translateX(calc(-50% + ${nudge}px))` } : undefined} contentEditable={false} onMouseDown={(event) => event.preventDefault()}>
      <Toolbar variant="floating">
        {sized && (
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
            <ToolbarSeparator />
          </>
        )}
        <span className="tiptap-media-name" title={name}>
          <span>{name || "File"}</span>
          {size ? <span className="tiptap-media-size">{readableSize(size)}</span> : null}
        </span>
        <ToolbarGroup>
          <Button data-style="ghost" aria-label={`Open ${name}`} onClick={() => void host().openFile?.(src)}>
            <AliveIcon icon={ExternalLinkIcon} size={16} className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label={`Save ${name}`} onClick={() => void host().saveFileAs?.(src, name)}>
            <AliveIcon icon={DownloadIcon} size={16} className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label={`Delete ${name}`} onClick={() => props.deleteNode()}>
            <AliveIcon icon={TrashIcon} size={16} className="tiptap-button-icon" />
          </Button>
        </ToolbarGroup>
      </Toolbar>
    </span>
  )
}

/** A video: the player is the block, sized and placed like a picture. */
function VideoBlock(props: NodeViewProps): React.JSX.Element {
  const { src, name, width, align } = props.node.attrs
  const selected = isNodeSelected(props)
  const { ref, frame, controls, toggle, playing, state } = useMedia(true)
  return (
    <NodeViewWrapper className={`tiptap-attachment is-video${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`} data-state={state} data-align={align ?? undefined} style={{ width: width ?? undefined }}>
      <span ref={frame} className="tiptap-video-frame">
        <video ref={ref as React.RefObject<HTMLVideoElement>} className="tiptap-attachment-video" src={src} preload="metadata" title={name} onClick={toggle} playsInline />
        {controls}
      </span>
      {selected && props.editor.isEditable && <MediaToolbar props={props} sized />}
    </NodeViewWrapper>
  )
}

/** A recording: its name over the same controls, in a card like a file's. */
function AudioBlock(props: NodeViewProps): React.JSX.Element {
  const { src, name, size } = props.node.attrs
  const selected = isNodeSelected(props)
  const { ref, controls, playing, state } = useMedia(false)
  return (
    <NodeViewWrapper className={`tiptap-attachment is-audio${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`} data-state={state}>
      <audio ref={ref as React.RefObject<HTMLAudioElement>} src={src} preload="metadata" />
      <div className="tiptap-attachment-card">
        <AudioLines className="tiptap-attachment-icon" />
        <span className="tiptap-attachment-body">
          <span className="tiptap-attachment-name">{name || "Recording"}</span>
          <span className="tiptap-attachment-size">{readableSize(size)}</span>
        </span>
        {controls}
      </div>
      {selected && props.editor.isEditable && <MediaToolbar props={props} sized={false} />}
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
  if (/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(name)) return <AudioBlock {...props} />

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
        onDoubleClick={() => void host().openFile?.(src)}
      >
        {/\.pdf$/i.test(name) ? <FileText className="tiptap-attachment-icon" /> : <File className="tiptap-attachment-icon" />}
        <span className="tiptap-attachment-body">
          <span className="tiptap-attachment-name">{name || "Attachment"}</span>
          <span className="tiptap-attachment-size">{readableSize(size)}</span>
        </span>

        <button
          type="button"
          aria-label={`Open ${name || "attachment"}`}
          className="tiptap-attachment-save"
          onClick={(event) => {
            event.stopPropagation()
            void host().openFile?.(src)
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
