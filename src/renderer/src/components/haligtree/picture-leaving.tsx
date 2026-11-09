import { useLayoutEffect, useRef, useState } from 'react'
import { still } from '@/lib/motion'

/**
 * The picture a tile had, held a moment as it goes (its note's picture deleted or changed): laid over whatever
 * takes its place and faded out over 300ms, so the tile never changes in one frame. Its parent is `relative`.
 */
export function PictureLeaving({ picture, of, className = '' }: { picture: string | null | undefined; /** Whose picture: a tile drawn again for another note starts afresh. */ of: string; className?: string }): React.JSX.Element | null {
  const [leaving, done] = useLeaving(picture, of)
  return <LeavingPicture src={leaving} onDone={done} className={className} />
}

/**
 * The same, for a tile whose picture and stand-in are drawn in different boxes (Home's cards, the grid's covers):
 * the tile keeps what is leaving, above both, and lays `LeavingPicture` in whichever box is drawn now.
 */
export function useLeaving(picture: string | null | undefined, of: string, /** False when the tile has no box to lay it in now (a card turned to words): nothing is kept to show later. */ box = true): [string | null, () => void] {
  const [leaving, setLeaving] = useState<string | null>(null)
  const was = useRef(picture)
  const whose = useRef(of)
  // Before the frame is painted, so the new picture is never seen alone for a frame under where the old one goes.
  useLayoutEffect(() => {
    const before = was.current
    const same = whose.current === of
    was.current = picture
    whose.current = of
    if (!same || !box) setLeaving(null)
    else if (before && before !== picture && !still()) setLeaving(before)
  }, [picture, of, box])
  return [leaving && leaving !== picture ? leaving : null, () => setLeaving(null)]
}

/** The leaving picture itself, over the box it is laid in (`relative`). */
export function LeavingPicture({ src, onDone, className = '' }: { src: string | null; onDone: () => void; className?: string }): React.JSX.Element | null {
  if (!src) return null
  return (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      data-picture-leaving=""
      onAnimationEnd={onDone}
      // An even crossfade: the old picture is still half there halfway through.
      style={{ animation: 'mf-plain-out 300ms ease-in-out forwards' }}
      className={`pointer-events-none absolute inset-0 size-full object-cover ${className}`}
    />
  )
}
