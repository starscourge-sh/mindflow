import { useLayoutEffect, useRef, useState } from 'react'
import { still } from '@/lib/motion'

/**
 * The picture a tile had, held a moment as it goes (its note's picture deleted or changed): laid over whatever
 * takes its place and faded out over 300ms, so the tile never changes in one frame. Its parent is `relative`.
 */
export function PictureLeaving({ picture, of, className = '' }: { picture: string | null | undefined; /** Whose picture: a tile drawn again for another note starts afresh. */ of: string; className?: string }): React.JSX.Element | null {
  const [leaving, setLeaving] = useState<string | null>(null)
  const was = useRef(picture)
  const whose = useRef(of)
  // Before the frame is painted, so the new picture is never seen alone for a frame under where the old one goes.
  useLayoutEffect(() => {
    const before = was.current
    const same = whose.current === of
    was.current = picture
    whose.current = of
    if (!same) setLeaving(null)
    else if (before && before !== picture && !still()) setLeaving(before)
  }, [picture, of])
  if (!leaving || leaving === picture) return null
  return (
    <img
      key={leaving}
      src={leaving}
      alt=""
      aria-hidden
      draggable={false}
      data-picture-leaving=""
      onAnimationEnd={() => setLeaving(null)}
      // An even crossfade: the old picture is still half there halfway through.
      style={{ animation: 'mf-plain-out 300ms ease-in-out forwards' }}
      className={`pointer-events-none absolute inset-0 size-full object-cover ${className}`}
    />
  )
}
