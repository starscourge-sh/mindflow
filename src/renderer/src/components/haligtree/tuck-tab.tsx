import { useEffect, useState } from 'react'
import { animate, motion } from 'motion/react'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { haligtree } from '@/lib/haligtree'
import { PAPER } from './sticky-note'

/** A tab's words: as many of the name's first words as fit down it, never cut mid-word with dots. */
const tabWords = (name: string): string => {
  let said = ''
  for (const word of name.trim().split(/\s+/)) {
    const next = said ? `${said} ${word}` : word
    if (next.length > 14) break
    said = next
  }
  return said || name.trim().slice(0, 12)
}

type Tuck = { side: 'left' | 'right'; flat: boolean }
const params = new URLSearchParams(location.search)
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const

/** How far a named tab's window runs past the screen's edge, out of sight (TUCK_HANG in main/index.ts). */
const HANG = 16

/**
 * Every sticky tucked away (the menus' "Tuck sticky notes away", ⌃⌥⌘H): the
 * note is pushed off the screen's edge, so only its inner edge shows, in its
 * own paper and colour, square where it runs past the edge and rounded on the
 * screen's side, its name written up it near the top as a file tab's is. The
 * tabs overlap down the edge, each over the foot of the one above. Flat, only
 * a small coloured pill. Pointed at, main opens the card out of it, and the
 * card slides in from the edge; the pointer gone, it folds back. The note
 * itself stays drawn underneath, only hidden, so it comes out whole with
 * nothing to load.
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
        // The note's own paper, square and without a border where it runs past the edge.
        style={{ ...PAPER, ...(tuck.flat ? {} : right ? { paddingRight: HANG } : { paddingLeft: HANG }) }}
        className={`flex h-full w-full justify-center overflow-hidden border border-foreground/10 text-foreground ${tuck.flat ? 'items-center' : 'items-start'} ${right ? (tuck.flat ? 'rounded-l-[12px]' : 'rounded-l-[14px]') + ' border-r-0' : (tuck.flat ? 'rounded-r-[12px]' : 'rounded-r-[14px]') + ' border-l-0'}`}
      >
        {tuck.flat ? (
          // Flat: the note's colour alone, a stronger stripe of it down the pill.
          <span className="h-[70%] w-1 rounded-full bg-foreground/35" style={document.documentElement.hasAttribute('data-tint') ? { background: 'oklch(0.7 0.13 var(--mf-tint-hue))' } : undefined} />
        ) : (
          // A label, not a title: its first words in small capitals, read from the bottom up and set near the top, as a file tab's is.
          <span data-tuck-label className="mt-4 text-[11px] leading-none font-bold tracking-[0.14em] whitespace-nowrap text-foreground/50 uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{tabWords(name)}</span>
        )}
      </motion.div>
    </div>
  )
}
