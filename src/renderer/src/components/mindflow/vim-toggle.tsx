import { useEffect, useState } from "react"
import { Keyboard } from "lucide-react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { currentVim, onVimChange, setVim } from "@/lib/vim"

/** Vim keys on or off, for every editor on the page. */
export function VimToggle(): React.JSX.Element {
  const [on, setOn] = useState(currentVim)
  useEffect(() => onVimChange(setOn), [])

  return (
    <Button
      onClick={() => setVim(!on)}
      data-active-state={on ? "on" : "off"}
      aria-label={on ? "Turn vim keys off" : "Turn vim keys on"}
      title={on ? "Turn vim keys off" : "Turn vim keys on"}
      variant="ghost"
    >
      <Keyboard className="tiptap-button-icon" />
    </Button>
  )
}
