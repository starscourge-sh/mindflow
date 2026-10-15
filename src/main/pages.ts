/**
 * Which page a window loads, read from its address. Each kind of window has a
 * page of its own (src/renderer/*.html), so it loads only its own code: the
 * box never carries the main window's views, nor a sticky the drawing editor.
 * Anything not named here is the box.
 */
export function pageFor(query: string): string {
  const has = (what: string): boolean => new RegExp(`[?&]${what}(&|$)`).test(query)
  const asks = (key: string): boolean => new RegExp(`[?&]${key}=`).test(query)
  if (asks('drawing')) return 'drawing.html'
  if (asks('note')) return 'note.html'
  if (has('view=home')) return 'home.html'
  if (has('view=focus') || has('view=glow')) return 'pill.html'
  if (has('view=nudge')) return 'nudge.html'
  if (has('view=look')) return 'look.html'
  if (has('view=sticky')) return 'sticky.html'
  return 'index.html'
}
