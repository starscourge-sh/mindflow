/**
 * The one material for anything that floats over the page: menus, popovers,
 * tooltips, peeks and ⌘K. The popover's own fill (opaque: blur does not draw
 * in these windows), a hairline ring in the ink, and the shared panel shadow,
 * which Brutal turns into its hard one. Corners come from the radius scale,
 * by size: a tooltip is small (rounded-md), a menu medium (rounded-lg), a
 * card or a panel large (rounded-xl).
 */
export const FLOAT = 'bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10'

/**
 * The two looks for anything shown on hover, and only these two. A label (a
 * name, a key, a value under a chart's pointer) is a tip: small corners, small
 * words. Anything with content (a note, a tag, a thought) is the card an @
 * link shows (note-preview.tsx): a kind line, a bold title, its words, a
 * hairline above a quiet foot. qa/popups-consistent.mjs holds every hover to one of them.
 */
export const TIP = `${FLOAT} rounded-md px-2.5 py-1.5 text-xs`
export const CARD = 'rounded-lg border bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
