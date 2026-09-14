import { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ImagePlusIcon } from "@/components/tiptap-icons/image-plus-icon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"
import { saveImage, saveLinkedImage } from "@/extensions/image-drop"

type Tab = "add" | "link"

/**
 * The empty image block: a row that opens a small panel.
 *
 * Two ways in, one ending. A file and a link are both copied into the app's own
 * store, and the block keeps a `mindflow://` URL, so the picture survives the
 * original being moved, deleted, or taken off the web.
 */
export function ImagePlaceholderView({ editor, node, getPos }: NodeViewProps) {
  const [open, setOpen] = useState<boolean>(node.attrs.open)
  const [tab, setTab] = useState<Tab>("add")
  const [href, setHref] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  /** Become the image. The placeholder is gone either way. */
  const fill = (src: string): void => {
    const pos = getPos()
    if (pos == null) return
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: pos, to: pos + node.nodeSize },
        { type: "image", attrs: { src } }
      )
      .run()
  }

  /** One way in for both tabs, so a link and a file end up equally kept. */
  const add = async (source: Promise<string> | undefined): Promise<void> => {
    if (!source) return
    setError("")
    setBusy(true)
    try {
      fill(await source)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that")
      setBusy(false)
    }
  }

  const pick = (files: FileList | File[] | null): Promise<void> => {
    const file = [...(files ?? [])][0]
    return add(file && saveImage(file))
  }

  return (
    <NodeViewWrapper className="tiptap-image-placeholder">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="tiptap-image-placeholder-row">
            <ImagePlusIcon />
            <span>Add an image</span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="tiptap-image-panel">
          <div className="tiptap-image-panel-tabs">
            {(["add", "link"] as const).map((name) => (
              <button
                key={name}
                type="button"
                data-active={tab === name ? "" : undefined}
                onClick={() => setTab(name)}
              >
                {name === "add" ? "Add" : "Link"}
              </button>
            ))}
          </div>

          {tab === "add" ? (
            <label
              className="tiptap-image-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void pick(event.dataTransfer.files)
              }}
            >
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void pick(event.target.files)}
              />
              <span className="tiptap-image-dropzone-title">
                <ImagePlusIcon />
                {busy ? "Adding…" : "Upload image"}
              </span>
              <span className="tiptap-image-dropzone-hint">
                Or drag and drop here
              </span>
            </label>
          ) : (
            <form
              className="tiptap-image-link"
              onSubmit={(event) => {
                event.preventDefault()
                if (href.trim()) void add(saveLinkedImage(href.trim()))
              }}
            >
              <input
                type="url"
                value={href}
                placeholder="Paste an image link"
                onChange={(event) => setHref(event.target.value)}
              />
              <button type="submit" disabled={busy || !href.trim()}>
                {busy ? "Adding…" : "Embed image"}
              </button>
            </form>
          )}

          {error ? <p className="tiptap-image-error">{error}</p> : null}
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  )
}
