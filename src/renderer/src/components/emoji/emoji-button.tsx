import { useState } from "react"

import { IconPicker } from "@/components/emoji/icon-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"

import type { BlockColor } from "@/extensions/block-color"

/**
 * An emoji you can change: the button, and the picker it opens.
 *
 * Shared by the callout and the icon beside a note's title, which want the
 * same thing and only differ in whether a colour comes with it. Leave `color`
 * out and the swatches are not offered.
 */
export function EmojiButton({
  icon,
  color,
  className,
  onPick,
}: {
  icon: string
  color?: BlockColor
  className?: string
  onPick: (change: { icon?: string; color?: BlockColor }) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* `contentEditable={false}`, or inside an editor the caret can be put
            in the button and the emoji typed over. */}
        <button type="button" className={className} contentEditable={false}>
          {icon}
        </button>
      </PopoverTrigger>

      <PopoverContent align="center">
        <IconPicker
          icon={icon}
          color={color}
          className="cursor-pointer"
          onPick={(change) => {
            onPick(change)
            // The colour is a glance; the icon is the thing being chosen, so
            // only that one closes the picker.
            if (change.icon) setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
