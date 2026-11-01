import { useEffect, useState } from 'react'
import { animate, motion } from 'motion/react'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { haligtree } from '@/lib/haligtree'
import { GLASS, PAPER, SOLID_PAPER } from './sticky-note'

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

type Room = { side: number; top: number; bottom: number }
type Tuck = { side: 'left' | 'right'; flat: boolean; opened: boolean; room: Room; hang: number; strip: number; width: number }
const params = new URLSearchParams(location.search)
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
/** The card's clear room round it in its window: none on glass, 20 round paper (insetOf in main/index.ts). */
const INSET = GLASS ? 0 : 20
const NO_ROOM: Room = { side: 0, top: 0, bottom: 0 }
/** A named tab's shadow: soft, and cast mostly up, onto the foot of the tab above it, so the stack reads as layered paper. */
const SHADOW = '0 -4px 10px -3px rgb(0 0 0 / 0.24), 0 1px 2px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.14)'

/** The name down a tab: small bold capitals, muted, read from the bottom up and set near the top, as a file tab's is. */
const Label = ({ name }: { name: string }): React.JSX.Element => (
  <span data-tuck-label className="mt-4 text-[11px] leading-none font-bold tracking-[0.14em] whitespace-nowrap text-foreground/50 uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{tabWords(name)}</span>
)

/**
 * Every sticky tucked away (the menus' "Tuck sticky notes away", ⌃⌥⌘H): the
 * note is pushed off the screen's edge, so only its inner edge shows, in its
 * own paper and colour, square where it runs past the edge and rounded on the
 * screen's side, its name written up it near the top. The tabs overlap down
 * the edge, each over the foot of the one above with a soft shadow cast up
 * onto it, each a little further out than the one above. The window keeps
 * clear room round the paper for that shadow (TUCK_ROOM in main/index.ts).
 * Flat, only a small coloured pill. Pointed at, main slides the card out of
 * it: the tab's strip with the name stays on the screen side, a dashed fold,
 * then the note. The pointer gone, it folds back. The note itself stays drawn
 * underneath, only hidden, so it comes out whole with nothing to load.
 */
export function TuckTab(): React.JSX.Element | null {
  const [tuck, setTuck] = useState<Tuck | null>(null)
  const [name, setName] = useState('')
  // Tucked or brought back by its key (⌃⌥⌘H): there at once, no slide.
  const [instant, setInstant] = useState(false)
  useEffect(() => window.api.onBeaconPeek((peek, byKey = false) => {
    const now = peek?.tucked ? { side: peek.side, flat: !!peek.flat, opened: !!peek.opened, room: peek.room ?? NO_ROOM, hang: peek.hang ?? 0, strip: peek.strip ?? 0, width: peek.width ?? innerWidth } : null
    setInstant(byKey)
    setTuck((was) => {
      if (!was || was.opened || (now && !now.opened) || byKey || still()) return now
      // Pointed at, the card is drawn out of its tab: it starts with only the tab's strip on the screen and slides
      // the rest of the way out, as a card pulled from a file. Brought back from the menu bar, a short slide in from its edge.
      const sign = was.side === 'right' ? 1 : -1
      const far = now?.opened ? Math.max(28, now.width - now.hang - now.strip) : 28
      void animate(document.body, { transform: [`translateX(${sign * far}px)`, 'translateX(0px)'], opacity: [now?.opened ? 0.6 : 0, 1] }, SPRING)
      return now
    })
  }), [])
  const right = tuck?.side !== 'left'
  const strip = tuck?.opened ? tuck.strip : 0
  useEffect(() => {
    // The card under the tab is kept, only hidden. Slid out of its tab, it makes room for the tab's strip and stands straight.
    const root = document.getElementById('root')
    if (root) {
      root.style.visibility = tuck && !tuck.opened ? 'hidden' : ''
    }
    // The card itself makes room for the strip (main.css): one surface, not a slab laid beside it.
    document.documentElement.style.setProperty('--tuck-strip', `${strip}px`)
    // The card's inner corners go square to meet the strip (main.css, .mf-card).
    if (strip) document.documentElement.setAttribute('data-tuck-open', right ? 'right' : 'left')
    else document.documentElement.removeAttribute('data-tuck-open')
    if (!tuck) return
    const type = params.get('type')
    if (type === 'goal') void haligtree.item(params.get('id') ?? '').then((goal) => setName(goal?.title || 'A goal'))
    else setName(type === 'today' ? 'Today' : type === 'goals' ? 'Goals' : document.title || 'A sticky note')
  }, [tuck, strip, right])
  if (!tuck) return null
  if (tuck.opened)
    // Slid out: the name written on the card's own edge, which the card grew to hold, a dashed fold after it. No paper
    // of its own: a slab laid beside the card was shorter and another colour than a frosted or glass card.
    return (
      <div
        data-tuck-strip
        className={`pointer-events-none fixed z-50 flex text-foreground ${right ? '' : 'flex-row-reverse'}`}
        style={{ top: INSET, bottom: INSET, width: strip, ...(right ? { left: INSET } : { right: INSET }) }}
      >
        <div data-tuck-fold className={`flex h-full shrink-0 items-start justify-center border-dashed border-foreground/25 ${right ? 'border-r' : 'border-l'}`} style={{ width: strip }}>
          <Label name={name} />
        </div>
      </div>
    )
  const { room, hang } = tuck
  return (
    <div data-tuck-tab={tuck.flat ? 'flat' : 'tab'} className="pointer-events-none fixed inset-0 z-50" style={{ visibility: 'visible' }}>
      <motion.div
        aria-label={name}
        onPointerEnter={() => (chime('slide'), window.api.holdBeacon(true))}
        initial={still() || instant ? false : { opacity: 0, transform: `translateX(${right ? 20 : -20}px)` }}
        animate={{ opacity: 1, transform: 'translateX(0px)' }}
        transition={SPRING}
        // The note's own paper, square and without a border where it runs past the edge, in clear room for its shadow.
        style={tuck.flat ? PAPER : { ...SOLID_PAPER, boxShadow: SHADOW, top: room.top, bottom: room.bottom, ...(right ? { left: room.side, right: 0, paddingRight: hang } : { right: room.side, left: 0, paddingLeft: hang }) }}
        className={`pointer-events-auto absolute flex justify-center overflow-hidden border border-foreground/10 text-foreground ${tuck.flat ? 'inset-0 items-center' : 'items-start'} ${right ? (tuck.flat ? 'rounded-l-[12px]' : 'rounded-l-[14px]') + ' border-r-0' : (tuck.flat ? 'rounded-r-[12px]' : 'rounded-r-[14px]') + ' border-l-0'}`}
      >
        {tuck.flat ? (
          // Flat: the note's colour alone, a stronger stripe of it down the pill.
          <span className="h-[70%] w-1 rounded-full bg-foreground/35" style={document.documentElement.hasAttribute('data-tint') ? { background: 'oklch(0.7 0.13 var(--mf-tint-hue))' } : undefined} />
        ) : (
          <Label name={name} />
        )}
      </motion.div>
    </div>
  )
}
