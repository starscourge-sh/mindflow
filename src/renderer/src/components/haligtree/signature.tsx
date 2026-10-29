import { Avatar } from './avatar'
import { useLive } from '@/lib/haligtree'
import { sources } from '@/lib/sources'

/**
 * A quote's signature: "said by" in the app's font, then the name in a pen's
 * hand, like the names that sign Dia's changelog. Only for a quote shown as a
 * quote, and only the name: never body text. The hand and its colour live in
 * main.css (.mf-signature), so Margin marks off gives the plain font back.
 *
 * Its year lives in one place: a quote that names where it is from has its
 * source's year (shown on the source's page and the margin card); a quote
 * with no source, or a source with no year yet, has its own.
 */
export function Signed({ who, where, year, className = '' }: { who: string | null | undefined; /** Where it is from: that source's year is the quote's. */ where?: string | null; /** The quote's own year. */ year?: string | null; className?: string }): React.JSX.Element | null {
  const name = who?.trim()
  const from = where?.trim() ?? ''
  const born = useLive(() => (from ? sources.card(name, from).then((card) => card?.born ?? '') : Promise.resolve('')), '', [name, from], undefined, 'signed-born')
  if (!name) return null
  const when = born.trim() || year?.trim()
  return (
    <span className={`mf-signed ${className}`}>
      <span className="mf-signed-by">said by</span>
      <Avatar name={name} size={15} />
      {/* The name and its year in one run: the row's gap stood between them, a space before ", 1818". */}
      <span className="flex min-w-0 items-baseline">
        <span className="mf-signature" dir="auto" title={name}>{name}</span>
        {when && <span data-signed-year className="shrink-0 text-muted-foreground">, {when}</span>}
      </span>
    </span>
  )
}
