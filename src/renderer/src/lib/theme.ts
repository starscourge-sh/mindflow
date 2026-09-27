/**
 * Which theme the page is wearing.
 *
 * Plain functions rather than a hook, and the host's job to call them: the
 * theme is a page-level concern like the background and the web font, and
 * hanging it off a component means the page loses its colours the moment that
 * component is not on screen - which is exactly what happened when the toggle
 * lived inside the editor's toolbar.
 */

/** Dark, gruvbox, kanagawa wave, kanagawa dragon and tokyonight moon. */
export const THEMES = ["dark", "gruvbox", "kanagawa", "kanagawa-dragon", "tokyonight"] as const

export type Theme = (typeof THEMES)[number]

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
