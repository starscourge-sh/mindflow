import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Download, File } from "lucide-react"

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

/** The card: an icon, the name it arrived under, how big it is, and a way out. */
export function AttachmentView(props: NodeViewProps): React.JSX.Element {
  const { src, name, size } = props.node.attrs

  return (
    <NodeViewWrapper
      className={`tiptap-attachment${isNodeSelected(props) ? " is-selected" : ""}`}
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
        <File className="tiptap-attachment-icon" />
        <span className="tiptap-attachment-body">
          <span className="tiptap-attachment-name">{name || "Attachment"}</span>
          <span className="tiptap-attachment-size">{readableSize(size)}</span>
        </span>

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
