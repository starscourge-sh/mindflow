import { useEffect, useRef, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { AlignCenter, AlignLeft, AlignRight, AudioLines, Download, ExternalLink, File, FileText, Pause, Play, Trash2, Volume2, VolumeX } from "lucide-react"

import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { cue } from "@/lib/cues"

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

/**
 * The editor's own controls over a video or a recording: play, the place in
 * it, the time, and sound. Drawn here rather than the browser's, so they
 * wear the same type, colours and corners as everything else on the page.
 */
function useMedia(): {
  ref: React.RefObject<HTMLMediaElement | null>
  controls: React.JSX.Element
  toggle: () => void
  playing: boolean
} {
  const ref = useRef<HTMLMediaElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [length, setLength] = useState(0)
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    const media = ref.current
    if (!media) return
    const sync = (): void => {
      setPlaying(!media.paused)
      setAt(media.currentTime)
      setLength(media.duration)
      setMuted(media.muted)
    }
    const events = ["play", "pause", "timeupdate", "loadedmetadata", "volumechange", "ended"]
    events.forEach((name) => media.addEventListener(name, sync))
    sync()
    return () => events.forEach((name) => media.removeEventListener(name, sync))
  }, [])
  const toggle = (): void => {
    const media = ref.current
    if (!media) return
    cue(media.paused ? "play" : "pause")
    void (media.paused ? media.play() : media.pause())
  }
  const controls = (
    <span className="tiptap-media-controls" contentEditable={false} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
        {playing ? <Pause /> : <Play />}
      </button>
      <input
        type="range"
        aria-label="Place in it"
        min={0}
        max={Number.isFinite(length) ? length : 0}
        step="any"
        value={at}
        style={{ "--done": `${length ? (at / length) * 100 : 0}%` } as React.CSSProperties}
        onChange={(event) => {
          if (ref.current) ref.current.currentTime = Number(event.target.value)
        }}
      />
      <span className="tiptap-media-time">{clock(at)} / {clock(length)}</span>
      <button
        type="button"
        aria-label={muted ? "Sound on" : "Sound off"}
        onClick={() => {
          if (!ref.current) return
          ref.current.muted = !ref.current.muted
          cue(ref.current.muted ? "pause" : "play")
        }}
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </button>
    </span>
  )
  return { ref, controls, toggle, playing }
}

/**
 * What a selected video offers, as a picture's toolbar does: its width, its
 * place in the line, then its name and size, opening it and saving it.
 */
function MediaToolbar({ props, sized }: { props: NodeViewProps; sized: boolean }): React.JSX.Element {
  const { src, name, size, width, align } = props.node.attrs
  return (
    <span className="tiptap-media-toolbar" contentEditable={false} onMouseDown={(event) => event.preventDefault()}>
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
            <ExternalLink className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label={`Save ${name}`} onClick={() => void host().saveFileAs?.(src, name)}>
            <Download className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label={`Delete ${name}`} onClick={() => props.deleteNode()}>
            <Trash2 className="tiptap-button-icon" />
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
  const { ref, controls, toggle, playing } = useMedia()
  return (
    <NodeViewWrapper className={`tiptap-attachment is-video${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`} data-align={align ?? undefined} style={{ width: width ?? undefined }}>
      <span className="tiptap-video-frame">
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
  const { ref, controls } = useMedia()
  return (
    <NodeViewWrapper className={`tiptap-attachment is-audio${selected ? " is-selected" : ""}`}>
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
          <ExternalLink />
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
          <Download />
        </button>
      </div>
    </NodeViewWrapper>
  )
}
