/**
 * The one material for anything that floats over the page: menus, popovers,
 * tooltips, peeks and ⌘K. The popover's own fill, frosted in the main window
 * (mf-frost, main.css: the page blurred under a translucent fill, opaque under
 * Reduce Transparency and in see-through windows), a hairline ring in the ink, and the shared panel shadow,
 * which Brutal turns into its hard one. Corners come from one token (main.css `--mf-float-radius`): every
 * menu, submenu, popover, hover card and the Calendar's popovers are `rounded-float` (6px, a card's small corner);
 * a tooltip is a step smaller, `rounded-tip` (4px). A row inside a menu is `rounded-sm`, inside the menu's corner.
 */
export const FLOAT = 'mf-frost bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10'

/**
 * The two looks for anything shown on hover, and only these two. A label (a
 * name, a key, a value under a chart's pointer) is a tip: small corners, small
 * words. Anything with content (a note, a tag, a thought) is the card an @
 * link shows (note-preview.tsx): a kind line, a bold title, its words, a
 * hairline above a quiet foot. qa/popups-consistent.mjs holds every hover to one of them.
 */
export const TIP = `${FLOAT} rounded-tip px-2.5 py-1.5 text-xs`
// A card is the same material as a menu (FLOAT's ring, not a border of its own), at the same corners.
export const CARD = `${FLOAT} rounded-float`

/**
 * The one surface of a pill floating over other apps (the session bubble, the desk's pills): the theme's popover,
 * drawn over the page's own colour so nothing behind shows through, in every theme. With `backgroundColor: Canvas`.
 */
export const SOLID = 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))'
/** Such a pill's lift off the screen, drawn round whatever shape it is clipped to (a box shadow would be clipped with it). None in Paper, which prints everything flat. */
export const LIFT = 'drop-shadow(0 1px 1px color-mix(in oklab, var(--mf-shadow-ink) 14%, transparent)) drop-shadow(0 3px 3px color-mix(in oklab, var(--mf-shadow-ink) 8%, transparent))'

/** A menu line's words, cut where they run long: a note's whole title in a line ("Open …") blew the menu out across the window. */
export const MENU_LINE = 'max-w-80 min-w-0 truncate'
