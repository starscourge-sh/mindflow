import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ChevronRight } from "lucide-react"

import { EmojiButton } from "@/components/emoji/emoji-button"
import { cue } from "@/lib/cues"

import type { BlockColor } from "@/extensions/block-color"

/**
 * A tinted box with an icon you can change, and anything you like inside.
 * One from Obsidian has a title over it, and may fold away to that title.
 */
export function CalloutView(props: NodeViewProps): React.JSX.Element {
  const { icon, color, title, fold } = props.node.attrs as { icon: string; color: BlockColor; title: string; fold: string }
  const folded = fold === "-"

  return (
    <NodeViewWrapper className="tiptap-callout" data-accent={color} data-folded={folded || undefined}>
      <EmojiButton
        icon={icon}
        color={color}
        className="tiptap-callout-icon"
        onPick={props.updateAttributes}
      />
      {(title || fold) && (
        <div className="tiptap-callout-title" contentEditable={false}>
          <span>{title}</span>
          {fold && (
            <button
              type="button"
              className="tiptap-callout-fold"
              aria-label={folded ? "Show what is inside" : "Fold away"}
              aria-expanded={!folded}
              onClick={() => {
                cue(folded ? "unfold" : "fold")
                props.updateAttributes({ fold: folded ? "+" : "-" })
              }}
            >
              <ChevronRight />
            </button>
          )}
        </div>
      )}
      <NodeViewContent className="tiptap-callout-body" />
    </NodeViewWrapper>
  )
}
