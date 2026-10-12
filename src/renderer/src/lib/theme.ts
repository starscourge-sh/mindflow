/**
 * Which theme the page is wearing.
 *
 * Plain functions rather than a hook, and the host's job to call them: the
 * theme is a page-level concern like the background and the web font, and
 * hanging it off a component means the page loses its colours the moment that
 * component is not on screen - which is exactly what happened when the toggle
 * lived inside the editor's toolbar.
 */

import { byKeys } from "./motion"

/**
 * Every scheme, in the order the picker lists them.
 *
 * The default first, then the two house favourites, the plain pair, and the
 * rest roughly by how widely each is used: the list is read top down.
 * Each is a class the stylesheet defines; adding one here without adding it
 * there gives a theme that does nothing.
 */
export const THEMES = [
  "github",
  "midnight",
  "paper",
  "dark",
  "light",
  "catppuccin",
  "dracula",
  "gruvbox",
  "tokyonight",
  "obsidian-nord",
  "everforest",
  "kanagawa",
  "adwaita",
  "rose-pine"
] as const

/** What a new window wears before anything is chosen. */
export const DEFAULT_THEME = "github"

/** A scheme the stylesheet ships, or one imported from a file (`custom-…`). */
export type Theme = (typeof THEMES)[number] | `custom-${string}`

/** The ones with dark ink on a light page: the window behind them is made solid. */
const LIGHT: Theme[] = ["light", "paper"]
export const isLight = (theme: Theme): boolean => LIGHT.includes(theme) || !!customThemes().find((one) => one.id === theme)?.light

/** Names the kebab case cannot spell. Everything else is title case. */
const NAMES: Partial<Record<Theme, string>> = {
  github: "GitHub",
  tokyonight: "Tokyo Night",
  "rose-pine": "Rosé Pine"
}

/** What to call one, for a bar that shows the name beside the mark. */
export function themeName(theme: Theme): string {
  return (
    NAMES[theme] ??
    customThemes().find((one) => one.id === theme)?.name ??
    theme.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) =>
      (dash ? " " : "") + letter.toUpperCase()
    )
  )
}

/**
 * How things are drawn, apart from their colours: Soft (rounded, lifted on
 * soft shadows) or Brutal (square, outlined in the theme's ink, standing on
 * hard shadows; brutal.css). Any theme can wear either.
 */
export type Style = "soft" | "brutal"

export function currentStyle(): Style {
  try {
    return localStorage.getItem("style") === "brutal" ? "brutal" : "soft"
  } catch {
    return "soft"
  }
}

/** Wear a style; the other windows follow through storage. */
export function setStyle(style: Style): void {
  try {
    localStorage.setItem("style", style)
  } catch {
    // This window only.
  }
  applyTheme(currentTheme())
}

/**
 * Whether to say, once ever, that there is a louder style: after three
 * changes of theme, to someone still on Soft who has not been told.
 */
export function styleNudgeDue(): boolean {
  try {
    return currentStyle() === "soft" && !localStorage.getItem("style-nudged") && Number(localStorage.getItem("theme-changes") ?? 0) >= 3
  } catch {
    return false
  }
}
export const styleNudged = (): void => {
  try {
    localStorage.setItem("style-nudged", "1")
  } catch {
    // Said again next time, which is no harm.
  }
}

/** The one last chosen, or the default (GitHub). */
export function currentTheme(): Theme {
  // Brutal was briefly a pair of themes; it is a style now, worn over Paper or GitHub.
  const old = localStorage.getItem("theme")
  if (old === "brutal" || old === "brutal-dark") {
    localStorage.setItem("theme", old === "brutal" ? "paper" : "github")
    localStorage.setItem("style", "brutal")
  }
  const saved = localStorage.getItem("theme")
  return allThemes().includes(saved as Theme) ? (saved as Theme) : DEFAULT_THEME
}

/**
 * The page's colour, as `#rrggbb`, when the theme paints the window solid;
 * null when it is see-through over the frosting. Read through a canvas, which
 * turns any colour a theme writes (oklch and all) into plain red, green, blue.
 */
function solidColour(): string | null {
  const root = getComputedStyle(document.documentElement)
  if (root.getPropertyValue("--mf-window-tint").trim() !== "100%") return null
  const ink = document.createElement("canvas").getContext("2d")
  if (!ink) return null
  ink.fillStyle = root.getPropertyValue("--background").trim() || "#000"
  ink.fillRect(0, 0, 1, 1)
  const [r, g, b] = ink.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}
/** Told to main (it listens only to the box): the window's own colour behind the page. */
let toldSurface: string | null | undefined
function tellSurface(): void {
  const colour = solidColour()
  if (colour === toldSurface) return
  toldSurface = colour
  window.api?.setSurface?.(colour)
}
// Once the stylesheet is surely in, should the first telling have come before it.
if (typeof window !== "undefined") window.addEventListener("load", () => tellSurface())

/** When a preview's colour glide ends (applyTheme). */
let glideEnd: ReturnType<typeof setTimeout> | undefined
/** The appearance last told to the window, so a preview only tells it on a change. */
let told: "light" | "dark" | null = null

/**
 * Put it on the document, and remember it.
 *
 * Call it once before the first paint. Every theme carries `dark`, including
 * the light one: that class picks the ramp the editor reads, and each theme
 * repaints the ramp underneath it. The page is transparent over the desktop
 * either way, so there is no second set of rules to switch to.
 */
export function applyTheme(theme: Theme, remember = true): void {
  const paint = (): void => {
    const { classList } = document.documentElement
    classList.add("dark")
    paintCustom()
    for (const other of allThemes()) if (other !== "dark") classList.toggle(other, theme === other)
    // The style rides along with the theme, so it turns over in the same picture.
    if (currentStyle() === "brutal") document.documentElement.dataset.style = "brutal"
    else delete document.documentElement.dataset.style
    // An imported light theme has no class of its own in the stylesheet to make
    // the window solid, so it says so here.
    // A sticky note is paper on the desktop: always solid. Frosted, it showed
    // whatever was behind it through its words, text over text, and macOS
    // blurs nothing behind a window this small and tilted. Its frost is drawn
    // instead, from the desktop picture (components/vigil/frost.tsx).
    const sticky = new URLSearchParams(location.search).get("view") === "sticky" && !new URLSearchParams(location.search).has("glass")
    if ((theme.startsWith("custom-") && isLight(theme)) || sticky) document.documentElement.dataset.solid = ""
    else delete document.documentElement.dataset.solid
    // Native bits (a time field, a scrollbar) follow light or dark, imported themes included.
    if (isLight(theme)) document.documentElement.dataset.light = ""
    else delete document.documentElement.dataset.light
    tellSurface()
  }
  // Chosen with the pointer, the whole window turns over as one picture,
  // through a breath of blur (main.css): the page, its words and its lines
  // change together, instead of a background fading behind text that had
  // already flipped. A preview (passing over the themes) is simply there: a
  // fade per theme passed froze the open menu mid-hover. So is a change before
  // the first paint, by keys, or with Motion off.
  const fade = remember && document.readyState === "complete" && document.documentElement.dataset.motion !== "off" && !byKeys() && typeof document.startViewTransition === "function"
  // A newer change skips one still running, which only means it is not needed.
  if (fade) document.startViewTransition(paint).ready.catch(() => {})
  else if (!remember && document.readyState === "complete" && document.documentElement.dataset.motion !== "off" && !byKeys() && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // A preview under the pointer: the colours glide over 120ms instead of
    // snapping, with plain CSS transitions that never hold the menu still.
    const root = document.documentElement
    root.setAttribute("data-theme-glide", "")
    paint()
    clearTimeout(glideEnd)
    glideEnd = setTimeout(() => root.removeAttribute("data-theme-glide"), 180)
  } else paint()
  // A preview is worn, not kept, so the other window does not follow it.
  if (remember) {
    // Kept themes are counted, for the one nudge toward the Brutal style (page-hint.tsx).
    if (localStorage.getItem("theme") !== theme) localStorage.setItem("theme-changes", String(Number(localStorage.getItem("theme-changes") ?? 0) + 1))
    localStorage.setItem("theme", theme)
  }
  // The window is see-through over macOS's frosted backing: it has to be
  // dark frosting under a dark theme, or the text lands on white.
  // Told only when it changes: each telling redraws the frosting.
  const appearance = isLight(theme) ? "light" : "dark"
  if (appearance !== told) window.api?.setAppearance?.(appearance)
  told = appearance
}

/**
 * Themes imported from a file. Kept as the variables they set, so wearing one
 * is a class like any other: the rules are written into one style tag, which
 * every window rebuilds from the same storage.
 */
export type CustomTheme = { id: `custom-${string}`; name: string; vars: Record<string, string>; light: boolean }

export function customThemes(): CustomTheme[] {
  try {
    return JSON.parse(localStorage.getItem("custom-themes") ?? "[]") as CustomTheme[]
  } catch {
    return []
  }
}

/** Every theme the pickers list: the shipped ones, then the imported. */
export const allThemes = (): Theme[] => [...THEMES, ...customThemes().map((one) => one.id)]

// The surface and overlay ladders the stylesheet builds each shipped theme
// from (`mf-palette` in _variables.scss), so an imported palette of a dozen
// colours gets the same hover states and borders as the rest.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
const SURFACES = [4, 9, 16, 26, 38, 50, 62, 74, 85, 100]
const OVERLAYS = [5, 7, 11, 22, 37, 50, 64, 75, 88, 96]
const HUES = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]

/** A palette (`bg`, `ink`, `accent` and the nine hues) as the variables it sets. */
function fromPalette(palette: Record<string, string>): Record<string, string> {
  const { bg, ink, accent } = palette
  const vars: Record<string, string> = {}
  if (bg) vars["--black"] = bg
  if (bg && ink)
    STEPS.forEach((step, i) => {
      vars[`--tt-gray-dark-${step}`] = `color-mix(in srgb, ${ink} ${SURFACES[i]}%, ${bg})`
      vars[`--tt-gray-dark-a-${step}`] = `color-mix(in srgb, ${ink} ${OVERLAYS[i]}%, transparent)`
    })
  if (accent) {
    vars["--tt-brand-color-400"] = accent
    vars["--tt-cursor-color"] = accent
    vars["--tt-selection-color"] = `color-mix(in srgb, ${accent} 20%, transparent)`
    vars["--mf-accent-ink"] = accent
  }
  for (const hue of HUES) if (palette[hue]) vars[`--tt-color-text-${hue}`] = palette[hue]
  if (palette.yellow) vars["--mf-heading"] = palette.yellow
  if (palette.red) vars["--mf-code-ink"] = palette.red
  if (palette.green) vars["--mf-quote-ink"] = palette.green
  return vars
}

/** Whether a colour is light, read the way the browser reads it. */
function lightColour(colour: string | undefined): boolean {
  if (!colour) return false
  const probe = document.createElement("i")
  probe.style.color = colour
  document.body.append(probe)
  const [r, g, b] = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? []).map(Number)
  probe.remove()
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
}

/**
 * Read a theme file: JSON, either a palette (`bg`, `ink`, `accent`, the nine
 * hues, and a `name`) or CSS variables by name; or CSS, from which every
 * `--name: value` is taken, whatever selector it sits under. Returns the
 * theme added, or a sentence saying what was wrong.
 */
export function importTheme(fileName: string, text: string): (CustomTheme & { undo: () => void }) | string {
  let given: Record<string, string> = {}
  if (/\.json$/i.test(fileName) || text.trim().startsWith("{")) {
    try {
      given = JSON.parse(text)
    } catch {
      return "That file is not valid JSON"
    }
  } else for (const [, key, value] of text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) given[key] = value.trim()
  // A CSS file can name the palette too: --bg, --ink, --accent and the hues read as bg, ink, accent.
  for (const key of ["bg", "ink", "accent", ...HUES]) if (given[key] === undefined && given[`--${key}`] !== undefined) given[key] = given[`--${key}`]
  const name = String(given.name ?? fileName.replace(/\.[^.]+$/, "")).slice(0, 40)
  const vars = { ...fromPalette(given), ...Object.fromEntries(Object.entries(given).filter(([key]) => key.startsWith("--")).map(([key, value]) => [key, String(value)])) }
  if (!Object.keys(vars).length) return "No colours found: a theme file needs bg, ink and accent"
  // Named in part, the page would mix with the theme worn: all three, or none (Vigil's own --variables only).
  const missing = ["bg", "ink", "accent"].filter((key) => given[key] === undefined)
  if (missing.length && missing.length < 3) return `The theme file is missing ${missing.join(" and ")}: bg, ink and accent are all needed`
  const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}` as const
  const theme: CustomTheme = { id, name, vars, light: lightColour(given.bg ?? given["--black"] ?? given["--background"]) }
  // Undo puts things as they were: an earlier theme of the same name comes
  // back rather than going with it, and the theme worn before is worn again.
  const before = currentTheme()
  const replaced = customThemes().find((one) => one.id === id)
  saveCustom([...customThemes().filter((one) => one.id !== id), theme])
  const undo = (): void => {
    if (replaced) saveCustom(customThemes().map((one) => (one.id === id ? replaced : one)))
    else {
      saveCustom(customThemes().filter((one) => one.id !== id))
      document.documentElement.classList.remove(id)
    }
    applyTheme(allThemes().includes(before) ? before : DEFAULT_THEME)
  }
  return { ...theme, undo }
}

/** Take one away. Returns it, so it can be put back. */
export function removeTheme(id: Theme): CustomTheme | undefined {
  const gone = customThemes().find((one) => one.id === id)
  const wearing = localStorage.getItem("theme") === id
  saveCustom(customThemes().filter((one) => one.id !== id))
  // Its class is no longer in the list applyTheme clears, so it goes here.
  document.documentElement.classList.remove(id)
  if (wearing) applyTheme(DEFAULT_THEME)
  return gone
}

/** Put a removed one back, where it was in the list or at the end. */
export const restoreTheme = (theme: CustomTheme): void => saveCustom([...customThemes(), theme])

function saveCustom(list: CustomTheme[]): void {
  localStorage.setItem("custom-themes", JSON.stringify(list))
  paintCustom()
}

/**
 * The imported themes as rules, in one style tag: each as a class, like the
 * shipped ones, and its swatch the three colours the picker shows.
 */
export function paintCustom(): void {
  let tag = document.getElementById("mf-custom-themes")
  if (!tag) {
    tag = document.createElement("style")
    tag.id = "mf-custom-themes"
    document.head.append(tag)
  }
  tag.textContent = customThemes()
    .map(({ id, vars }) => {
      // A theme file is someone else's: only plain variable names, and no
      // value that points the page at a file or an address (url()).
      const body = Object.entries(vars).filter(([key, value]) => /^--[\w-]+$/.test(key) && !/url\s*\(|\\/i.test(String(value)))
        .map(([key, value]) => `${key}: ${String(value).replace(/[;{}<]/g, "")};`).join(" ")
      const dot = (n: number, colour?: string): string => (colour ? `.mf-swatch-${id} i:nth-child(${n}) { background: ${colour.replace(/[;{}<]/g, "")}; }` : "")
      // Its page in small, for Settings' theme tiles.
      const clean = (value?: string): string => (value && !/url\s*\(|\\/i.test(value) ? value.replace(/[;{}<]/g, "") : "")
      const page = Object.entries({ bg: vars["--black"] ?? vars["--background"], ink: vars["--tt-gray-dark-900"] ?? vars["--foreground"], accent: vars["--tt-brand-color-400"] ?? vars["--primary"], heading: vars["--tt-color-text-yellow"], quote: vars["--tt-color-text-green"] })
        .map(([key, value]) => (clean(value) ? `--sw-${key}: ${clean(value)};` : "")).join(" ")
      return `:root.${id} { ${body} } .mf-swatch-${id} { ${page} } ${dot(1, vars["--tt-brand-color-400"])} ${dot(2, vars["--tt-color-text-yellow"])} ${dot(3, vars["--tt-color-text-green"])}`
    })
    .join("\n")
}

/**
 * The themes as things to do from ⌘K: one "Change theme…" that turns the
 * palette into the list of them, worn as you pass. Each theme's own name is
 * still there for typing ("drac"), but kept out of the list until typed, so
 * fourteen of them do not flood it.
 */
export function themeActions(said: (text: string) => void): { label: string; run: () => void; themes?: (theme: Theme) => void; typed?: boolean }[] {
  const wear = (theme: Theme): void => {
    applyTheme(theme)
    said(`Wearing ${themeName(theme)}`)
  }
  const all = allThemes()
  return [
    { label: 'Change theme…', run: () => {}, themes: wear },
    { label: 'Next theme', typed: true, run: () => wear(all[(all.indexOf(currentTheme()) + 1) % all.length]) },
    { label: 'Brutal style', run: () => (setStyle("brutal"), said("Brutal: square, outlined, on hard shadows")) },
    { label: 'Soft style', run: () => (setStyle("soft"), said("Soft: rounded, on soft shadows")) },
    ...all.map((theme) => ({ label: `Theme: ${themeName(theme)}`, typed: true, run: () => wear(theme) }))
  ]
}
