import { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Play } from "lucide-react"

/** The video's id from any of YouTube's addresses: watch, youtu.be, embed, shorts, the no-cookie one. */
export function videoId(src: string): string | null {
  try {
    const url = new URL(src)
    const fromPath = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1]
    if (fromPath) return fromPath
    if (/(^|\.)youtu\.be$/i.test(url.hostname)) return url.pathname.slice(1).split("/")[0] || null
    return url.searchParams.get("v")
  } catch {
    return null
  }
}

/**
 * A YouTube video in a note: its picture with a play button, not a blank
 * frame while the player loads (or never does). The player itself comes only
 * when you press play. With no picture (offline, or a video taken down) it
 * still says what it is, and offline it says why it cannot play.
 */
export function YoutubeView({ node }: NodeViewProps): React.JSX.Element {
  const src = String(node.attrs.src ?? "")
  const id = videoId(src)
  const title = typeof node.attrs.title === "string" && node.attrs.title ? node.attrs.title : null
  const [playing, setPlaying] = useState(false)
  const [noPicture, setNoPicture] = useState(!id)
  const [offline, setOffline] = useState(false)
  const start = Number(node.attrs.start) || 0
  const player = id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ""}` : src
  const watch = id ? `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}` : src
  const play = (): void => {
    if (!navigator.onLine) return setOffline(true)
    setOffline(false)
    setPlaying(true)
  }
  return (
    <NodeViewWrapper data-youtube-video="" data-state={playing ? "playing" : offline ? "offline" : noPicture ? "no-picture" : "ready"}>
      {playing ? (
        <iframe src={player} title={title ?? "YouTube video"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      ) : (
        <div className="mf-video-face" contentEditable={false}>
          {!noPicture && <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" draggable={false} onError={() => setNoPicture(true)} />}
          <button type="button" className="mf-video-play" aria-label={title ? `Play ${title}` : "Play the video"} onMouseDown={(event) => event.preventDefault()} onClick={play}>
            <Play className="size-6" fill="currentColor" />
          </button>
          <div className="mf-video-words">
            <span className="mf-video-title">{title ?? (noPicture ? "A YouTube video" : "YouTube")}</span>
            {offline ? (
              <span className="mf-video-note">You are offline, so it cannot play now.</span>
            ) : noPicture ? (
              <span className="mf-video-note">Its picture could not load. Press play to try the video.</span>
            ) : null}
            {(offline || noPicture) && (
              <a href={watch} className="mf-video-note underline" onMouseDown={(event) => event.preventDefault()} onClick={(event) => (event.preventDefault(), window.open(watch))}>Open it on YouTube</a>
            )}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  )
}
