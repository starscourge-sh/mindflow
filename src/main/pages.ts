/** The page each `view=` loads; any other view is the box. */
const VIEWS = new Map([
  ['home', 'home.html'],
  ['focus', 'pill.html'],
  ['glow', 'pill.html'],
  ['nudge', 'nudge.html'],
  ['look', 'look.html'],
  ['sticky', 'sticky.html']
])

/**
 * Which page a window loads, read from its address. Each kind of window has a
 * page of its own (src/renderer/*.html), so it loads only its own code: the
 * box never carries the main window's views, nor a sticky the drawing editor.
 * Anything not named here is the box.
 */
export function pageFor(query: string): string {
  const asked = new URLSearchParams(query)
  if (asked.has('drawing')) return 'drawing.html'
  if (asked.has('note')) return 'note.html'
  return VIEWS.get(asked.get('view') ?? '') ?? 'index.html'
}
