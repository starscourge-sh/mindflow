import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

import { EmojiButton } from "@/components/emoji/emoji-button"

import type { BlockColor } from "@/extensions/block-color"

/** A tinted box with an icon you can change, and anything you like inside. */
export function CalloutView(props: NodeViewProps): React.JSX.Element {
  const { icon, color } = props.node.attrs as { icon: string; color: BlockColor }

  return (
    <NodeViewWrapper className="tiptap-callout" data-accent={color}>
      <EmojiButton
        icon={icon}
        color={color}
        className="tiptap-callout-icon"
        onPick={props.updateAttributes}
      />
      <NodeViewContent className="tiptap-callout-body" />
    </NodeViewWrapper>
  )
}
