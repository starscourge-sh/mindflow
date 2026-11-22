import { useEffect, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Play } from "lucide-react"
import { idThumbs, videoId } from "../../../../main/video-thumbs"

/**
 * A YouTube video in a note: its picture with a play button, not a blank
 * frame while the player loads (or never does). The player itself comes only
 * when you press play. With no picture (offline, or a video taken down) it
 * still says what it is, and offline it says why it cannot play.
 */
export function YoutubeView({ node, editor, getPos }: NodeViewProps): React.JSX.Element {
  const src = String(node.attrs.src ?? "")
  const id = videoId(src)
  const title = typeof node.attrs.title === "string" && node.attrs.title ? node.attrs.title : null
  const [playing, setPlaying] = useState(false)
  // The player has drawn its first page: until then the picture under it shows.
  const [loaded, setLoaded] = useState(false)
  const [noPicture, setNoPicture] = useState(!id)
  const [offline, setOffline] = useState(false)
  // YouTube would not serve the player here (main saw it sent away): the face again, saying so.
  const [refused, setRefused] = useState(false)
  // A time clicked in the note ("[13:03]", extensions/line-cards.ts) plays from there.
  const [from, setFrom] = useState<number | null>(null)
  const start = from ?? (Number(node.attrs.start) || 0)
  const player = id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ""}` : src
  const watch = id ? `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}` : src
  const play = (): void => {
    if (!navigator.onLine) return setOffline(true)
    setOffline(false)
    setRefused(false)
    setLoaded(false)
    setPlaying(true)
  }
  useEffect(() => {
    const onRefused = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== player) return
      setPlaying(false)
      setRefused(true)
    }
    window.addEventListener("haligtree:video-refused", onRefused)
    return () => window.removeEventListener("haligtree:video-refused", onRefused)
  }, [player])
  useEffect(() => {
    const onTime = (event: Event): void => {
      const { seconds, video } = (event as CustomEvent<{ seconds: number; video: Element }>).detail
      const at = getPos()
      const mine = typeof at === "number" ? editor.view.nodeDOM(at) : null
      if (!mine || !(mine === video || (mine as Element).contains?.(video))) return
      setFrom(seconds)
      play()
    }
    window.addEventListener("haligtree:video-at", onTime)
    return () => window.removeEventListener("haligtree:video-at", onTime)
  })
  return (
    <NodeViewWrapper data-youtube-video="" data-from={from ?? undefined} data-state={playing ? "playing" : offline ? "offline" : refused ? "refused" : noPicture ? "no-picture" : "ready"}>
      {playing ? (
        // Pressed: its picture stays, dimmed under a dark wash, until the player has loaded and fades in over it; the frame
        // never goes blank (the user, 22 Nov: "when you press play, it first disappears").
        <div className="mf-video-stage" contentEditable={false}>
          {!noPicture && id && <img src={idThumbs(id)[0]} alt="" draggable={false} onError={(event) => (event.currentTarget.src = idThumbs(id)[1])} />}
          <iframe key={player} src={player} title={title ?? "YouTube video"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            data-loaded={loaded || undefined} onLoad={() => setLoaded(true)} />
        </div>
      ) : (
        <div className="mf-video-face" contentEditable={false}>
          {/* The sharp picture, else the 16:9 one every video has, else the face says what it is. */}
          {!noPicture && id && <img src={idThumbs(id)[0]} alt="" draggable={false} onError={(event) => (event.currentTarget.src === idThumbs(id)[1] ? setNoPicture(true) : (event.currentTarget.src = idThumbs(id)[1]))} />}
          <button type="button" className="mf-video-play" aria-label={title ? `Play ${title}` : "Play the video"} onMouseDown={(event) => event.preventDefault()} onClick={play}>
            <Play className="size-6" fill="currentColor" />
          </button>
          <div className="mf-video-words">
            <span className="mf-video-title">{title ?? (noPicture ? "A YouTube video" : "YouTube")}</span>
            {offline ? (
              <span className="mf-video-note">You are offline, so it cannot play now.</span>
            ) : refused ? (
              <span className="mf-video-note">YouTube would not play it here just now.</span>
            ) : noPicture ? (
              <span className="mf-video-note">Its picture could not load. Press play to try the video.</span>
            ) : null}
            {(offline || refused || noPicture) && (
              <a href={watch} className="mf-video-note underline" onMouseDown={(event) => event.preventDefault()} onClick={(event) => (event.preventDefault(), window.open(watch))}>Open it on YouTube</a>
            )}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  )
}
