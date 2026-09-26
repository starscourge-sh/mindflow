import { useState } from "react"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

import { IconPicker } from "@/components/callout/icon-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"

import type { BlockColor } from "@/extensions/block-color"

/** A tinted box with an icon you can change, and anything you like inside. */
export function CalloutView(props: NodeViewProps): React.JSX.Element {
  const { icon, color } = props.node.attrs as { icon: string; color: BlockColor }
  const [open, setOpen] = useState(false)

  return (
    <NodeViewWrapper className="tiptap-callout" data-accent={color}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* `contentEditable={false}`, or the caret can be put inside the
              button and the emoji typed over. */}
          <button type="button" className="tiptap-callout-icon" contentEditable={false}>
            {icon}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <IconPicker
            icon={icon}
            color={color}
            onPick={(change) => {
              props.updateAttributes(change)
              // The colour is a glance; the icon is the thing being chosen, so
              // only that one closes the picker.
              if (change.icon) setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <NodeViewContent className="tiptap-callout-body" />
    </NodeViewWrapper>
  )
}
