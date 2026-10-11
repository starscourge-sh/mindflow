/**
 * The one material for anything that floats over the page: menus, popovers,
 * tooltips, peeks and ⌘K. The popover's own fill (opaque: blur does not draw
 * in these windows), a hairline ring in the ink, and the shared panel shadow,
 * which Brutal turns into its hard one. Corners come from the radius scale,
 * by size: a tooltip is small (rounded-md), a menu medium (rounded-lg), a
 * card or a panel large (rounded-xl).
 */
export const FLOAT = 'bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10'
