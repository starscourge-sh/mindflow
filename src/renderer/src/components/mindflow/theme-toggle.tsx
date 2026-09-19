import { useEffect, useState } from "react"
import { Palette } from "lucide-react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { MoonStarIcon } from "@/components/tiptap-icons/moon-star-icon"

/**
 * Dark and gruvbox, in that order.
 *
 * There is no light theme. The window is transparent and sits on a frosted
 * desktop, so the page paints no background of its own: dark text would have
 * nothing to sit on and would read as a ghost. Both themes here are built for
 * that surface, and the choice is remembered.
 */
const THEMES = ["dark", "gruvbox"] as const
type Theme = (typeof THEMES)[number]

const ICONS: Record<Theme, React.ReactNode> = {
  dark: <MoonStarIcon className="tiptap-button-icon" />,
  gruvbox: <Palette className="tiptap-button-icon" />,
}

export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme")
    return THEMES.includes(saved as Theme) ? (saved as Theme) : "dark"
  })

  useEffect(() => {
    const { classList } = document.documentElement
    // Gruvbox is a dark theme in different paint, so it carries `dark` too and
    // only the colours underneath change.
    classList.add("dark")
    classList.toggle("gruvbox", theme === "gruvbox")
    localStorage.setItem("theme", theme)
  }, [theme])

  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <Button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      variant="ghost"
    >
      {ICONS[theme]}
    </Button>
  )
}
