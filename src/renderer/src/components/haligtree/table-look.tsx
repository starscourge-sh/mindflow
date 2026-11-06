/**
 * The one table: the Bin's look, which every table-like list in Haligtree
 * wears (the Bin, Review › All cards in List and Table). One line a row, 40px
 * tall, 8px in from the list's edge; a quiet first column (what kind it is),
 * the name in ink, then the quiet columns, the last one flush right. Pointed
 * at, a row lights faintly; the keyboard's row a little more; picked rows wear
 * the picked tint every list uses. A table that names its columns heads them
 * in the same columns, in the first column's quiet type.
 */
export const TABLE_ROWS = 'divide-y divide-border/60'
export const TABLE_ROW = 'flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 outline-none transition-colors duration-100 [&:not([data-picked]):hover]:bg-accent/40 [&:not([data-picked]):focus-visible]:bg-accent/40'
/** The keyboard's row. */
export const TABLE_CURSOR = 'bg-accent/40'
/** The quiet first column: a kind, a stage; as wide as its longest word ("Not studied" with its dot). */
export const TABLE_LEAD = 'w-24 shrink-0 truncate text-xs text-muted-foreground'
/** The name, in ink, taking the room left. */
export const TABLE_NAME = 'min-w-0 flex-1 truncate text-body text-foreground'
/** A quiet column after the name: a second line of words, a deck. */
export const TABLE_QUIET = 'min-w-0 truncate text-xs text-muted-foreground'
/** The last quiet column, a date or a when, flush right. */
export const TABLE_WHEN = 'shrink-0 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap'

/** Column names over a table, each in its own column's box (the same classes, widths and gaps as its rows). */
export function TableHead({ columns }: { columns: { label: string; className: string }[] }): React.JSX.Element {
  return (
    <div data-table-head aria-hidden className="flex items-center gap-3 border-b border-border/60 px-2 pb-1.5 text-xs font-medium text-muted-foreground">
      {columns.map((one) => <span key={one.label} className={one.className.replace(/\btext-(body|foreground)\b/g, '')}>{one.label}</span>)}
    </div>
  )
}
