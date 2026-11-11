import { ChevronDown, ChevronUp } from 'lucide-react'
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

/** A column's order, when its head can be clicked to sort by it: lit while the list goes by it, the arrow saying which way. */
export type ColumnSort = { on: boolean; down: boolean; pick: () => void }

/**
 * Column names over a table, each in its own column's box (the same classes, widths and gaps as its rows). A column
 * given `sort` is a button: clicked, the list goes by it; clicked again, the other way, as Finder's columns do.
 */
export function TableHead({ columns }: { columns: { label: string; className: string; sort?: ColumnSort }[] }): React.JSX.Element {
  const sorts = columns.some((one) => one.sort)
  return (
    <div data-table-head aria-hidden={sorts ? undefined : true} role={sorts ? 'row' : undefined} className="flex items-center gap-3 border-b border-border/60 px-2 pb-1.5 text-xs font-medium text-muted-foreground">
      {columns.map((one) => {
        const box = one.className.replace(/\btext-(body|foreground)\b/g, '')
        if (!one.sort) return <span key={one.label} className={box}>{one.label}</span>
        const { on, down, pick } = one.sort
        const Arrow = down ? ChevronDown : ChevronUp
        const right = box.includes('text-right')
        return (
          <button key={one.label} type="button" role="columnheader" aria-sort={on ? (down ? 'descending' : 'ascending') : 'none'} data-sort-column={one.label} onClick={pick}
            className={`${box} flex cursor-pointer items-center gap-0.5 rounded-sm outline-none transition-colors duration-100 hover:text-foreground focus-visible:text-foreground ${right ? 'justify-end' : ''} ${on ? 'text-foreground' : ''}`}>
            {/* Its room kept whether lit or not, so a name never shifts as the order moves to it; on the inner side, so
                the name lines up with its column's words (a right-aligned column's arrow sits before its name). */}
            {right && <Arrow aria-hidden className={`size-3 shrink-0 ${on ? '' : 'invisible'}`} />}
            <span className="truncate">{one.label}</span>
            {!right && <Arrow aria-hidden className={`size-3 shrink-0 ${on ? '' : 'invisible'}`} />}
          </button>
        )
      })}
    </div>
  )
}
