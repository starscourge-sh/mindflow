/**
 * A strip of matte tape holding a note to the desk: torn at both ends, a
 * little see-through, with the faint grain tape has, and now and then a
 * glint of light crossing it as if the room moved. Over the top edge where
 * the window has room round the note. On glass the window ends at the note,
 * so the tape sits on the card, where the window cannot cut it.
 */
export function Tape({ inside = false, className = '' }: { inside?: boolean; className?: string }): React.JSX.Element {
  return <span aria-hidden className={`mf-tape pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -rotate-2 ${inside ? 'top-2 !h-3.5' : '-top-2.5'} ${className}`} />
}
