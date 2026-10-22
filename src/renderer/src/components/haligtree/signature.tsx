import { Avatar } from './avatar'

/**
 * A quote's signature: "said by" in the app's font, then the name in a pen's
 * hand, like the names that sign Dia's changelog. Only for a quote shown as a
 * quote, and only the name: never body text. The hand and its colour live in
 * main.css (.mf-signature), so Margin marks off gives the plain font back.
 */
export function Signed({ who, className = '' }: { who: string | null | undefined; className?: string }): React.JSX.Element | null {
  const name = who?.trim()
  if (!name) return null
  return (
    <span className={`mf-signed ${className}`}>
      <span className="mf-signed-by">said by</span>
      <Avatar name={name} size={15} />
      <span className="mf-signature" dir="auto" title={name}>{name}</span>
    </span>
  )
}
