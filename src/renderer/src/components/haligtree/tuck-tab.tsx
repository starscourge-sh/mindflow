import { useEffect, useState } from 'react'
import { animate, motion } from 'motion/react'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { haligtree } from '@/lib/haligtree'
import { PAPER } from './sticky-note'

type Tuck = { side: 'left' | 'right'; flat: boolean }
const params = new URLSearchParams(location.search)
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const

/**
 * Every sticky tucked away (the menus' "Tuck sticky notes away", ⌃⌥⌘H): the
 * window is a tab on the screen's edge in the note's own colour, its name
 * written down it; flat, only a small coloured pill. Pointed at, main opens
 * the card out of it, and the card slides in from the edge; the pointer gone,
 * it folds back. The note itself stays drawn underneath, only hidden, so it
 * comes out whole with nothing to load.
 */
export function TuckTab(): React.JSX.Element | null {
  const [tuck, setTuck] = useState<Tuck | null>(null)
  const [name, setName] = useState('')
  useEffect(() => window.api.onBeaconPeek((peek) => {
    const now = peek?.tucked ? { side: peek.side, flat: !!peek.flat } : null
    setTuck((was) => {
      // Out of its tab: the card slides in from the edge it was tucked at, on a soft spring.
      if (was && !now && !still()) void animate(document.body, { x: [was.side === 'right' ? 28 : -28, 0], opacity: [0, 1] }, SPRING)
      return now
    })
  }), [])
  useEffect(() => {
    // The card under the tab is kept, only hidden.
    const root = document.getElementById('root')
    if (root) root.style.visibility = tuck ? 'hidden' : ''
    if (!tuck) return
    const type = params.get('type')
    if (type === 'goal') void haligtree.item(params.get('id') ?? '').then((goal) => setName(goal?.title || 'A goal'))
    else setName(type === 'today' ? 'Today' : type === 'goals' ? 'Goals' : document.title || 'A sticky note')
  }, [tuck])
  if (!tuck) return null
  const right = tuck.side === 'right'
  return (
    <div data-tuck-tab={tuck.flat ? 'flat' : 'tab'} className="fixed inset-0 z-50" style={{ visibility: 'visible' }} onPointerEnter={() => (chime('slide'), window.api.holdBeacon(true))}>
      <motion.div
        aria-label={name}
        initial={still() ? false : { opacity: 0, x: right ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={SPRING}
        style={{ ...PAPER, boxShadow: '0 1px 2px rgb(0 0 0 / 0.14), 0 4px 12px -3px rgb(0 0 0 / 0.22)' }}
        className={`flex h-full w-full items-center justify-center overflow-hidden border text-foreground ${right ? 'rounded-l-lg border-r-0' : 'rounded-r-lg border-l-0'}`}
      >
        {tuck.flat ? (
          // Flat: the note's colour alone, a stronger stripe of it down the pill.
          <span className="h-[70%] w-1 rounded-full bg-foreground/35" style={document.documentElement.hasAttribute('data-tint') ? { background: 'oklch(0.7 0.13 var(--mf-tint-hue))' } : undefined} />
        ) : (
          <span className="max-h-full truncate px-1 py-2 font-heading text-[13px] leading-none font-semibold" style={{ writingMode: 'vertical-rl' }}>{name}</span>
        )}
      </motion.div>
    </div>
  )
}
