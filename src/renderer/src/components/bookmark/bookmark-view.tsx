import { useEffect, useRef, useState } from "react"
import { decodeHTML } from "entities"
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react"
import { alive } from "@/components/ui/alive-icon"
import SimpleCheckedIcon from "@/components/ui/simple-checked-icon"
import CopyIcon from "@/components/ui/copy-icon"

import type { BookmarkAttributes } from "@/extensions/bookmark"
import { Orb } from "@/components/vigil/orb"
import { isYouTube, wideThumb } from "../../../../main/video-thumbs"
import { lookOf, paintWhileLoading, withoutBands } from "@/lib/pictures"

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)
const Copy = alive(CopyIcon)

/**
 * The link preview card.
 *
 * A node view rather than plain markup, because the card needs a control
 * inside it and the markup version was an `<a>`: one interactive element may
 * not sit inside another, and a click anywhere on an anchor is handed to the
 * browser to follow before any handler of ours is reached. Divs and a real
 * button own their own clicks, so there is nothing to out-race.
 *
 * `renderHTML` on the node still writes the anchor. That is what lands on the
 * clipboard and in an export, where a card is just a link.
 */
export function BookmarkView(props: NodeViewProps): React.JSX.Element {
  const attrs = props.node.attrs as BookmarkAttributes
  const { href, image: saved, icon, loading } = attrs
  // Cards kept before entities were decoded on fetching ("What&#x27;s new") read right too.
  const [title, description, site] = [attrs.title, attrs.description, attrs.site].map((text) => decodeHTML(text ?? ""))
  // A card made before thumbnails were taken in 16:9 still points at YouTube's
  // banded 4:3 one: shown as the 16:9 one instead, which has no black bands.
  const image = (saved && wideThumb(saved)) || saved
  const [copied, setCopied] = useState(false)

  // Off the editor state rather than the `selected` prop or a decoration: a
  // card holds no text for the browser to paint, so a select-all swept past it
  // and left it looking untouched. This asks whether the selection covers it,
  // which is true whether it is the whole selection or caught inside a bigger
  // one, and a selector re-runs on every transaction so it cannot fall behind.
  const selected = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const pos = props.getPos()
      if (typeof pos !== "number") return false
      const { from, to } = editor.state.selection
      return from <= pos && to >= pos + props.node.nodeSize
    },
  })

  // A picture that nearly fills the frame fills it: shown whole, it left a
  // few pixels of its blurred copy down one side, which read as a seam.
  const frame = useRef<HTMLSpanElement>(null)
  const [fills, setFills] = useState(false)
  // A 4:3 YouTube thumbnail already kept with the note has its bands baked in:
  // only the 16:9 middle of it is shown.
  const [banded, setBanded] = useState(false)
  useEffect(() => {
    const box = frame.current
    const img = box?.querySelector("img")
    if (!box || !img) return
    // Bands found in a stored picture are known before it loads (lib/pictures.ts).
    const look = lookOf(image)
    const cut = look ? 1 - look[3] - look[4] : 1
    const check = (): void => {
      if (!img.naturalWidth || !box.clientHeight) return
      const band = cut === 1 && isYouTube(href) && Math.abs(img.naturalWidth / img.naturalHeight - 4 / 3) < 0.02
      setBanded(band)
      const off = ((img.naturalWidth / (img.naturalHeight * cut)) * (band ? 4 / 3 : 1)) / (box.clientWidth / box.clientHeight)
      setFills(Math.abs(off - 1) <= 0.06)
    }
    check()
    img.addEventListener("load", check)
    const watch = new ResizeObserver(check)
    watch.observe(box)
    return () => {
      img.removeEventListener("load", check)
      watch.disconnect()
    }
  }, [image, loading, href])

  return (
    <NodeViewWrapper
      // A card holds no text for the browser to paint, so a select-all swept
      // past it and left it looking untouched.
      className={`tiptap-bookmark${selected ? " is-selected" : ""}`}
      data-loading={loading ? "" : undefined}
      onClick={() => !loading && window.open(href, "_blank", "noopener")}
    >
      {/* No grey block pulsing where the picture will be: the orb below is
          the one sign of a wait, the same one every wait in Vigil uses. */}
      {/* The picture whole, over itself blurred: a picture of another shape
          leaves no empty bands, only its own colours carried to the edges. */}
      {image && !loading && (
        <span ref={frame} className="tiptap-bookmark-frame" data-fill={fills ? "" : undefined} data-banded={banded ? "" : undefined} style={{ '--bookmark-art': `url(${JSON.stringify(image)})` } as React.CSSProperties}>
          {/* Its colours in its place until it has loaded, and only the picture
              between any black bands baked into it. */}
          <img
            className="tiptap-bookmark-image"
            src={image}
            alt=""
            ref={paintWhileLoading}
            style={{ backgroundSize: "cover", backgroundPosition: "center", objectViewBox: withoutBands(image) } as React.CSSProperties}
          />
        </span>
      )}

      <span className="tiptap-bookmark-body">
        <span className="tiptap-bookmark-title">{title || href}</span>
        {description && <span className="tiptap-bookmark-description">{description}</span>}
        <span className="tiptap-bookmark-site">
          {icon && !loading && <img className="tiptap-bookmark-icon" src={icon} alt="" />}
          {loading ? <Orb state="connecting" label="Fetching preview…" /> : <span>{site}</span>}
        </span>
      </span>

      <button
        type="button"
        className="tiptap-bookmark-copy"
        aria-label="Copy URL"
        title={`Copy URL\n${href}`}
        // Without this the card's own handler counts the click too and opens
        // the very link that was being copied.
        onClick={(event) => {
          event.stopPropagation()
          void navigator.clipboard.writeText(href)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </NodeViewWrapper>
  )
}
