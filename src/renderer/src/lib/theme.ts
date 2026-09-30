/**
 * Which theme the page is wearing.
 *
 * Plain functions rather than a hook, and the host's job to call them: the
 * theme is a page-level concern like the background and the web font, and
 * hanging it off a component means the page loses its colours the moment that
 * component is not on screen - which is exactly what happened when the toggle
 * lived inside the editor's toolbar.
 */

/**
 * Every scheme, in the order the picker lists them.
 *
 * `dark` first, then the rest by name. Each is a class the stylesheet defines;
 * adding one here without adding it there gives a theme that does nothing.
 */
export const THEMES = [
  "dark",
  "adwaita",
  "atom",
  "blue-topaz",
  "border",
  "catppuccin",
  "dark-moss",
  "dracula",
  "everforest",
  "github",
  "gruvbox",
  "kanagawa",
  "kanagawa-dragon",
  "nord",
  "obsidian-nord",
  "tokyonight"
] as const

export type Theme = (typeof THEMES)[number]

/** Two names the kebab case cannot spell. Everything else is title case. */
const NAMES: Partial<Record<Theme, string>> = {
  github: "GitHub",
  tokyonight: "Tokyo Night"
}

/** What to call one, for a bar that shows the name beside the mark. */
export function themeName(theme: Theme): string {
  return (
    NAMES[theme] ??
    theme.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) =>
      (dash ? " " : "") + letter.toUpperCase()
    )
  )
}

/** The one last chosen, or the default. */
export function currentTheme(): Theme {
  const saved = localStorage.getItem("theme")
  return THEMES.includes(saved as Theme) ? (saved as Theme) : "dark"
}

/**
 * Put it on the document, and remember it.
 *
 * Call it once before the first paint. There is no light theme: the window is
 * transparent and sits on a frosted desktop, so every one of these carries
 * `dark` and only the colours underneath change.
 */
export function applyTheme(theme: Theme): void {
  const { classList } = document.documentElement
  classList.add("dark")
  for (const other of THEMES) if (other !== "dark") classList.toggle(other, theme === other)
  localStorage.setItem("theme", theme)
}
