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

/** What each one is called, for a host that shows the name beside the mark. */
const NAMES: Record<Theme, string> = {
  dark: "Dark",
  gruvbox: "Gruvbox",
  kanagawa: "Kanagawa",
  "kanagawa-dragon": "Kanagawa Dragon",
  tokyonight: "Tokyo Night"
}

/**
 * Cycle through them. Applying one is `lib/theme`; this only points at it.
 *
 * `showName` puts the current theme's name beside its mark, for a bar where
 * the icon alone is a guessing game. `className` is for the host's own shape -
 * a pill beside its other pills, say.
 */
export function ThemeToggle({
  showName = false,
  className
}: {
  showName?: boolean
  className?: string
} = {}): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <Button
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={`Switch to ${NAMES[next]} theme`}
      variant="ghost"
      className={className}
    >
      {ICONS[theme]}
      {showName && <span>{NAMES[theme]}</span>}
    </Button>
  )
}
