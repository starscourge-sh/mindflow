import { useState } from "react"
import { Building2, Flame, Palette, Waves } from "lucide-react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { MoonStarIcon } from "@/components/tiptap-icons/moon-star-icon"
import { THEMES, applyTheme, currentTheme, type Theme } from "@/lib/theme"

const ICONS: Record<Theme, React.ReactNode> = {
  dark: <MoonStarIcon className="tiptap-button-icon" />,
  gruvbox: <Palette className="tiptap-button-icon" />,
  kanagawa: <Waves className="tiptap-button-icon" />,
  "kanagawa-dragon": <Flame className="tiptap-button-icon" />,
  tokyonight: <Building2 className="tiptap-button-icon" />,
}

/** Cycle through them. Applying one is `lib/theme`; this only points at it. */
export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <Button
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={`Switch to ${next} theme`}
      variant="ghost"
    >
      {ICONS[theme]}
    </Button>
  )
}
