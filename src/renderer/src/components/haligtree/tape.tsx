/**
 * A strip of matte tape holding a note to the desk: torn at both ends, a
 * little see-through, with the faint grain tape has, and now and then a
 * glint of light crossing it as if the room moved. Over the top edge where
 * the window has room round the note; laid just inside it on glass, where
 * the window ends at the note's edge.
 */
export function Tape({ inside = false, className = '' }: { inside?: boolean; className?: string }): React.JSX.Element {
  return <span aria-hidden className={`mf-tape pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -rotate-2 ${inside ? '-top-1 !h-3.5' : '-top-2.5'} ${className}`} />
}
