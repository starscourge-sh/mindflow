import { useState } from "react"

import { said } from "@/lib/host"
import { chime } from "@/lib/sound"
import { BookOpen, Check, Copy } from "@/components/ui/icons"
import { isWebPage, openArticle } from "@/components/pdf/web-reader"
import { canSplit } from "@/lib/split"

/** "Open in the reader" and "Copy URL", tucked into the card's corner, shown on hover. */
export function BookmarkButtons({ href, loading }: { href: string; loading: boolean }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <>
      {/* Read here, in the reader, as well as in the browser: a PDF in the PDF reader, any other page as an article.
          Not on a video's card: there is no article to read, and the card itself plays it. */}
      {isWebPage(href) && !loading && (
        <button
          type="button"
          className="tiptap-bookmark-copy is-read"
          aria-label="Open in the reader"
          title={canSplit() ? "Open in the reader. ⌥-click opens it to the side" : "Open in the reader"}
          onClick={(event) => {
            event.stopPropagation()
            openArticle(href, undefined, undefined, event.currentTarget.closest("[data-pane]")?.getAttribute("data-pane"))
          }}
        >
          <BookOpen />
        </button>
      )}
      <button
        type="button"
        className="tiptap-bookmark-copy"
        aria-label="Copy URL"
        title={`Copy URL\n${href}`}
        // Without this the card's own handler counts the click too and opens
        // the very link that was being copied.
        onClick={(event) => {
          event.stopPropagation()
          // The tick only once the link is really on the clipboard; a failure is said.
          void navigator.clipboard.writeText(href).then(() => {
            chime("copy")
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }, () => said("Could not copy the link", false))
        }}
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </>
  )
}
