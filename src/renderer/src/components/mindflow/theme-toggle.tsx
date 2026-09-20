import { useEffect, useState } from "react"
import { Building2, Palette, Waves } from "lucide-react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { MoonStarIcon } from "@/components/tiptap-icons/moon-star-icon"

/**
 * Dark, gruvbox, kanagawa and tokyonight moon, in that order.
 *
 * There is no light theme. The window is transparent and sits on a frosted
 * desktop, so the page paints no background of its own: dark text would have
 * nothing to sit on and would read as a ghost. All of them are built for
 * that surface, and the choice is remembered.
 */
const THEMES = ["dark", "gruvbox", "kanagawa", "tokyonight"] as const
type Theme = (typeof THEMES)[number]

const ICONS: Record<Theme, React.ReactNode> = {
  dark: <MoonStarIcon className="tiptap-button-icon" />,
  gruvbox: <Palette className="tiptap-button-icon" />,
  kanagawa: <Waves className="tiptap-button-icon" />,
  tokyonight: <Building2 className="tiptap-button-icon" />,
}

export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme")
    return THEMES.includes(saved as Theme) ? (saved as Theme) : "dark"
  })

  useEffect(() => {
    const { classList } = document.documentElement
    // Both are dark themes in different paint, so they carry `dark` too and
    // only the colours underneath change.
    classList.add("dark")
    for (const t of THEMES) if (t !== "dark") classList.toggle(t, theme === t)
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
