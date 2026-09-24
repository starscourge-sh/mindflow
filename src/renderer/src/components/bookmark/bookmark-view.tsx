import { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Check, Copy } from "lucide-react"

import type { BookmarkAttributes } from "@/extensions/bookmark"

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
  const { href, title, description, image, icon, site, loading } = props.node
    .attrs as BookmarkAttributes
  const [copied, setCopied] = useState(false)

  return (
    <NodeViewWrapper
      className="tiptap-bookmark"
      data-loading={loading ? "" : undefined}
      onClick={() => !loading && window.open(href, "_blank", "noopener")}
    >
      {loading ? (
        <span className="tiptap-bookmark-image is-loading" />
      ) : (
        image && <img className="tiptap-bookmark-image" src={image} alt="" />
      )}

      <span className="tiptap-bookmark-body">
        <span className="tiptap-bookmark-title">{title || href}</span>
        {description && <span className="tiptap-bookmark-description">{description}</span>}
        <span className="tiptap-bookmark-site">
          {icon && !loading && <img className="tiptap-bookmark-icon" src={icon} alt="" />}
          <span>{loading ? "Loading..." : site}</span>
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
