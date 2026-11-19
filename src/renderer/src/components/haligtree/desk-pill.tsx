import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { wornStyle } from '@/lib/theme'
import { LIFT, SOLID } from '@/lib/float'
import { carryWindow } from '@/lib/carry'
import type { PillPeek } from '../../../../preload'

/**
 * What a card's pill reads, said by the card itself as its words change (goal-beacon.tsx, today-sticky.tsx,
 * sticky-note.tsx), so the pill and the card never disagree: a goal's days are its card's, Today's count its list's.
 * The mark: a ring of how much is gone (a goal's time, Today's ticks) in its colour, or a note's paper as a dot.
 */
export type PillWords = { words: string; number?: string; ring?: { gone: number; ink: string }; dot?: string; warm?: string }
let said: PillWords = { words: '' }
const heard = new Set<() => void>()
const listen = (one: () => void): (() => void) => (heard.add(one), () => void heard.delete(one))
/** A card's pill, told what it reads now. */
export function usePillWords(words: PillWords | null): void {
  const key = JSON.stringify(words)
  useEffect(() => {
    if (!words) return
    said = words
    for (const one of heard) one()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The widest a pill may be: past it, its words end at the last whole word that fits, with "…". */
const WIDEST = 220
/** How long the pointer rests on a pill before its card opens: a pass across the stack opens nothing. */
const REST = 150
/** The card's one motion out of its pill and back (the tabs' own spring before pills). */
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
/** A glass card's window (the setting): its pill is frosted on the Mac's blur, as the card is. */
const GLASS = new URLSearchParams(location.search).has('glass')
/** Glass fills its window; paper keeps room round the card for its lean and shadow (main's insetOf). */
const INSET = GLASS ? 0 : 20

/** The words a pill shows: the first `count` of them, "…" after the last when some are left out. */
const firstWords = (words: string, count: number): string => {
  const all = words.trim().split(/\s+/)
  return count >= all.length ? all.join(' ') : `${all.slice(0, Math.max(1, count)).join(' ')}…`
}

/**
 * A card folded at the screen's edge (main's shapeCard and layStack): one line in the desk's stack, read at a glance,
 * the session bubble's own pill (same paper, edge, lift, type and round ends). Rested on, the pill itself grows into
 * its card beside the stack (one surface: the pill is hidden while its card is out) and folds back into it half a
 * second after the pointer has gone; a click pins the card open. The card
 * stays drawn under it, only hidden, so it comes out whole with nothing to load.
 */
export function DeskPill(): React.JSX.Element | null {
  const [peek, setPeek] = useState<PillPeek | null>(null)
  // Folded or opened by a key (⌃⌥⌘H): there at once, no motion.
  const [instant, setInstant] = useState(false)
  const words = useSyncExternalStore(listen, () => said)
  const pill = useRef<HTMLButtonElement>(null)
  const [count, setCount] = useState(Infinity)
  useEffect(() => setCount(Infinity), [words.words, words.number])
  // The stack's last pill past six stands for the cards past it: it says how many, and a click lists them.
  const [more, setMore] = useState(0)
  useEffect(() => window.api.onPillMore(setMore), [])
  // Its width by its words, measured once they change: fewer words until it fits, then told to main for the stack.
  useLayoutEffect(() => {
    const el = pill.current
    if (!el || !peek) return
    if (el.offsetWidth > WIDEST && count > 1) return setCount(Math.min(count, words.words.trim().split(/\s+/).length) - 1)
    window.api.pillWidth(Math.min(WIDEST, el.offsetWidth))
  }, [peek, count, words, more])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    let was: PillPeek | null = null
    // The card's frame inside the window and the pill's, so the card can start as the pill and grow to itself.
    const ends = (now: PillPeek): { from: Keyframe; to: Keyframe } => {
      // The window's size as main made it, not as the page may still be (the message can come before the resize).
      const { pill: at, card, size } = now.opened!
      const right = now.side === 'right'
      const tall = size.height
      // Where the card's own frame is in the root (the root is the card's window: paper keeps INSET round the card).
      const frame = { x: INSET, y: INSET, width: card - 2 * INSET, height: tall - 2 * INSET }
      const left = right ? 0 : size.width - card
      const corner = right ? left + frame.x + frame.width : left + frame.x
      const dx = right ? at.x + at.width - corner : at.x - corner
      const dy = at.y - frame.y
      // The pill's round ends, but square in Paper (a clip is a shape no border-radius rule reaches: the card grew out
      // of its pill with round corners in a style that has none), as the session pill's are (focus-pill.tsx).
      const ends = wornStyle() === 'paper' ? 0 : at.height / 2
      const cut = right
        ? `inset(${frame.y}px ${card - frame.x - frame.width}px ${tall - frame.y - at.height}px ${frame.x + frame.width - at.width}px round ${ends}px)`
        : `inset(${frame.y}px ${card - frame.x - at.width}px ${tall - frame.y - at.height}px ${frame.x}px round ${ends}px)`
      return {
        from: { clipPath: cut, transform: `translate(${dx}px, ${dy}px)` },
        to: { clipPath: `inset(0px 0px 0px 0px round ${ends}px)`, transform: 'translate(0px, 0px)' }
      }
    }
    let run: ReturnType<typeof animate> | undefined
    const settle = (): void => {
      run?.stop()
      run = undefined
      root.style.clipPath = ''
      root.style.transform = ''
    }
    const off = window.api.onBeaconPeek((now, byKey = false) => {
      const from = was
      was = now
      setInstant(byKey)
      setPeek(now)
      settle()
      const html = document.documentElement
      if (now?.opened) {
        html.setAttribute('data-pill-open', now.side)
        html.style.setProperty('--pill-card', `${now.opened.card}px`)
      } else {
        html.removeAttribute('data-pill-open')
        html.style.removeProperty('--pill-card')
      }
      // A pill: the card under it is kept, hidden in this same task, so it never shows whole for a frame.
      root.style.visibility = now && !now.opened ? 'hidden' : ''
      if (!now?.opened || from?.opened || byKey || still()) return
      // Rested on, the card grows out of its pill: placed as the pill in this same task, before the window's new size
      // is drawn, then grown the rest of the way on the spring, at full strength from its first frame.
      const { from: start, to } = ends(now)
      Object.assign(root.style, start)
      grow(to, () => ((root.style.clipPath = ''), (root.style.transform = '')))
    })
    // One motion at a time, from wherever the last one was; only the one still running says it has ended.
    const grow = (to: Keyframe, then: () => void, stiffness: number = SPRING.stiffness): void => {
      run?.stop()
      const me = animate(root, to as Record<string, string>, { ...SPRING, stiffness })
      run = me
      void me.then(() => run === me && ((run = undefined), then()))
    }
    // The pointer gone from it (main watches): back into its pill, then main makes it the pill; back on it midway, out again.
    const offFold = window.api.onBeaconFold((on) => {
      if (!was?.opened) return
      const { from: start, to } = ends(was)
      if (!on) return grow(to, () => ((root.style.clipPath = ''), (root.style.transform = '')))
      if (still()) return window.api.beaconFolded()
      if (!root.style.clipPath) root.style.clipPath = String(to.clipPath)
      // Exits are quicker than entrances.
      grow(start, () => window.api.beaconFolded(), 520)
    })
    return () => (off(), offFold(), settle())
  }, [])

  // A press anywhere on the card it opened pins it too, and the press still does what it does there (a tick, a link).
  const opened = !!peek?.opened
  useEffect(() => {
    if (!opened) return
    const pin = (event: PointerEvent): void => void (event.target instanceof Element && event.target.closest('#root') && window.api.pinSticky(true))
    window.addEventListener('pointerdown', pin, true)
    return () => window.removeEventListener('pointerdown', pin, true)
  }, [opened])
  // The pointer resting on it opens its card; leaving first, nothing.
  const rest = useRef(0)
  // Pressed and moved a little, a pill carries the whole stack (main's carryStack), from the point it was taken by;
  // pressed and let go where it was, it is a click.
  const press = useRef<PointerEvent | null>(null)
  const carried = useRef(false)
  if (!peek) return null
  const right = peek.side === 'right'
  const at = peek.opened?.pill
  const away = right ? 16 : -16
  // On glass (windows/sticky.tsx tells main its shape) it comes in at full strength, sliding out from the edge: the
  // Mac's blur under it cannot fade, so a pill fading in over it would show the blur alone first.
  const frosted = GLASS && !matchMedia('(prefers-reduced-transparency: reduce)').matches && !('solid' in document.documentElement.dataset)
  // Outside the card's own root: the card grows, moves and is cut while the pill stays where it stands, drawn over nothing.
  return createPortal(
    <div data-clear className="pointer-events-none fixed inset-0 z-50" style={{ visibility: 'visible' }}>
      <motion.button
        ref={pill}
        type="button"
        data-desk-pill={more ? 'more' : peek.opened ? 'open' : 'folded'}
        aria-label={more ? `${more} more on the desk` : `${words.words}${words.number ? `, ${words.number}` : ''}. Point to open, click to keep it open`}
        onPointerEnter={() => more || (clearTimeout(rest.current), (rest.current = window.setTimeout(() => window.api.holdBeacon(true), REST)))}
        onPointerLeave={() => clearTimeout(rest.current)}
        onPointerDown={(event) => void (event.button === 0 && (clearTimeout(rest.current), (press.current = event.nativeEvent), (carried.current = false)))}
        onPointerMove={(event) => {
          const down = press.current
          if (!down || carried.current || !(event.buttons & 1) || Math.hypot(event.screenX - down.screenX, event.screenY - down.screenY) < 4) return
          carried.current = true
          carryWindow(down, event.currentTarget)
        }}
        onPointerUp={() => void (press.current = null)}
        onClick={(event) => carried.current ? void (carried.current = false) : (clearTimeout(rest.current), more ? (chime('tap'), window.api.pillMore(event.clientX, event.clientY)) : (chime('pin'), window.api.pinSticky(true)))}
        // A full transform string, not Motion's x: on this Motion (14.0) only that runs on the compositor.
        initial={still() || instant || peek.opened ? false : { opacity: frosted ? 1 : 0, transform: `translateX(${away}px)` }}
        animate={{ opacity: 1, transform: peek.nudge && !still() ? (right ? [away, -6, 3, -2, 0] : [away, 6, -3, 2, 0]).map((x) => `translateX(${x}px)`) : 'translateX(0px)' }}
        transition={peek.nudge ? { duration: 0.7, ease: EASE } : SPRING}
        style={{
          // Its ground and lift (main.css [data-desk-pill]): the session bubble's solid, or frosted on the Mac's blur.
          ['--pill-solid' as string]: SOLID,
          ['--pill-lift' as string]: wornStyle() === 'paper' ? 'none' : LIFT,
          // At the same point of its window folded or open: the card's window starts level with the pill's, on its side.
          ...(right ? { right: 6 } : { left: 6 }), top: at ? at.y : 2,
          // While its card is out the pill is the card: it grew out of the pill's own shape, in its place, so a pill
          // left standing beside it read as a second thing popping out of the first. Folded back into that shape,
          // the pill shows again in the same task as main makes the window a pill.
          visibility: peek.opened ? 'hidden' : 'visible'
        }}
        className="pointer-events-auto absolute flex h-[28px] w-max min-w-[96px] items-center gap-2 rounded-full border px-3 font-sans text-[13px] whitespace-nowrap text-foreground transition-[scale] duration-150 active:scale-[0.97]"
      >
        {more ? <span data-pill-words className="font-semibold tabular-nums">{more} more</span> : <>
          <PillMark words={words} />
          <span data-pill-words className="min-w-0">{firstWords(words.words, count)}</span>
          {words.number && <span data-pill-number className="ml-auto shrink-0 font-semibold tabular-nums" style={words.warm ? { color: words.warm } : undefined}>{words.number}</span>}
        </>}
      </motion.button>
    </div>,
    document.body
  )
}

/** The pill's small mark: a ring of how much is gone, or a note's paper as a dot. */
function PillMark({ words }: { words: PillWords }): React.JSX.Element {
  // Drawn, not a bordered box: a look that prints flat (Paper) takes borders away, and a plain paper dot on a paper pill
  // was then nothing at all. Its ring is the ink's, so it shows on every look.
  if (!words.ring) return (
    <svg aria-hidden data-pill-dot viewBox="0 0 10 10" className="size-2.5 shrink-0">
      <circle cx="5" cy="5" r="4.25" style={{ fill: words.dot ?? 'var(--mf-pill-dot)' }} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} />
    </svg>
  )
  const R = 5.5
  const round = 2 * Math.PI * R
  return (
    <svg aria-hidden data-pill-ring viewBox="0 0 14 14" className="size-3.5 shrink-0 -rotate-90">
      <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2} />
      <circle cx="7" cy="7" r={R} fill="none" stroke={words.ring.ink} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${round * Math.min(1, Math.max(0, words.ring.gone))} ${round}`} />
    </svg>
  )
}
