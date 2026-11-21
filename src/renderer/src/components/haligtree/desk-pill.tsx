import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, motionValue } from 'motion/react'
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

/** How long the pointer rests on a pill before its card opens: a pass across the stack opens nothing. */
const REST = 150
/** The pill's own slide in from the edge (the tabs' own spring before pills). */
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
/**
 * The pill opening into its card: the session pill's island spring in feel (a little give past the end, focus-pill.tsx),
 * timed for a card ten times the pill's height so the growth is spread over the whole opening (about 480ms, no 50ms
 * stretch past about 60 points on a 300-point card) rather than gathered into one burst.
 */
const OPEN = { type: 'spring', visualDuration: 0.48, bounce: 0.18 } as const
/** Folding back: quicker and plain, no give, still spread enough that it never jumps. */
const CLOSE = { type: 'spring', visualDuration: 0.38, bounce: 0 } as const
type Box = { x: number; y: number; width: number; height: number }
/** The pill and the card it grows into, in window points, measured once per opening. */
type Shape = { pill: Box; frame: Box; edge: 'left' | 'right'; round: number; corner: number; card: { width: number; height: number }; dx: number; dy: number; move: { x: number; y: number } }
/** A glass card's window (the setting): its pill is frosted on the Mac's blur, as the card is. */
const GLASS = new URLSearchParams(location.search).has('glass')
/** Glass fills its window; paper keeps room round the card for its lean and shadow (main's insetOf). */
const INSET = GLASS ? 0 : 20

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
  // The pill's words while it grows into its card: words only, gliding from the pill's place to the card's first line
  // as they cross-fade into it.
  const ghost = useRef<HTMLDivElement>(null)
  // The stack's last pill past six stands for the cards past it: it says how many, and a click lists them.
  const [more, setMore] = useState(0)
  useEffect(() => window.api.onPillMore(setMore), [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    let was: PillPeek | null = null
    // 0: the pill, 1: the card. One value drives the whole shape, so a pointer back on it midway reverses from there.
    const grown = motionValue(0)
    let run: ReturnType<typeof animate> | undefined
    let fading: Animation | undefined
    let shape: Shape | null = null
    const clamp = (value: number): number => Math.min(1, Math.max(0, value))
    const draw = (): void => {
      if (!shape) return
      const p = grown.get()
      const t = clamp(p)
      const { pill, frame, edge, round, corner, card, dx, dy, move } = shape
      const mix = (a: number, b: number): number => a + (b - a) * t
      // The shape: the pill's box at the card's corner on the stack's side, sprung out to the paper and the room round
      // it (its shadow), the corners from the pill's round ends to the card's own (concentric with the room's). The pill
      // is the card's width (main's pillWide), so the paper's sides stay where they are: it grows only downward. Past 1
      // (the spring's give) the card grows a hair downward from its top and settles back, never sideways.
      const left = mix(edge === 'right' ? frame.x + frame.width - pill.width : frame.x, 0)
      const top = mix(frame.y, 0)
      const width = mix(pill.width, card.width)
      const height = mix(pill.height, card.height)
      root.style.clipPath = `inset(${top}px ${card.width - left - width}px ${card.height - top - height}px ${left}px round ${mix(round, corner + frame.y)}px)`
      const give = 1 + Math.max(0, p - 1) * 0.5
      root.style.transformOrigin = `${edge === 'right' ? frame.x + frame.width : frame.x}px ${frame.y}px`
      root.style.transform = `translate(${dx * (1 - t)}px, ${dy * (1 - t)}px)${give > 1 ? ` scale(1, ${give})` : ''}`
      // The card's own words: its first line comes in as the pill's go, the rest once the shape is mostly open.
      root.style.setProperty('--pill-head', String(clamp((p - 0.25) / 0.3)))
      root.style.setProperty('--pill-body', String(clamp((p - 0.55) / 0.4)))
      // What hangs past the card's edge, once the shape has passed it.
      root.style.setProperty('--pill-later', String(clamp((p - 0.85) / 0.15)))
      const words = ghost.current
      if (!words) return
      // The pill's words glide to the card's first line as they cross-fade into it.
      const go = clamp(p / 0.6)
      words.style.opacity = String(1 - clamp(p / 0.25))
      words.style.transform = `translate(${(move.x + dx * (1 - t)) * go}px, ${(move.y + dy * (1 - t)) * go}px)`
    }
    grown.on('change', draw)
    // Grown all the way (or opened by a key): the card as it is, nothing cut, moved or faded.
    const settle = (): void => {
      run?.stop()
      run = undefined
      fading?.cancel()
      fading = undefined
      shape = null
      delete root.dataset.growing
      root.style.clipPath = ''
      root.style.transform = ''
      root.style.transformOrigin = ''
      root.style.removeProperty('--pill-head')
      root.style.removeProperty('--pill-body')
      root.style.removeProperty('--pill-later')
      if (ghost.current) ghost.current.style.opacity = '0'
    }
    // The card's frame inside the window and the pill's, so the card can start as the pill and grow to itself.
    const measure = (now: PillPeek): Shape => {
      // The window's size as main made it, not as the page may still be (the message can come before the resize).
      const { pill: at, size } = now.opened!
      // The root is laid from the pill itself (--pill-left, --pill-card): the card's paper is the pill's own width and
      // stands at the pill's own x, paper keeping INSET round it, so its sides never move; only its height grows.
      const card = at.width + 2 * INSET
      const frame = { x: INSET, y: INSET, width: at.width, height: size.height - 2 * INSET }
      const offset = at.x - INSET
      // Near the screen's foot the card stands higher than the pill, and it rises into place as it grows.
      const dx = 0
      const dy = at.y - frame.y
      const paper = root.querySelector<HTMLElement>('[data-goal-card], [data-goals-sticky], .mf-card')
      // The pill's round ends, but square in Paper (a clip is a shape no border-radius rule reaches), as the session
      // pill's are (focus-pill.tsx); the card's own corners at the end.
      const round = wornStyle() === 'paper' ? 0 : at.height / 2
      const corner = paper ? parseFloat(getComputedStyle(paper).borderTopLeftRadius) || 0 : 0
      // Where the pill's words land: the card's first line, as laid out at rest.
      const title = root.querySelector<HTMLElement>('[data-card-title]')?.getBoundingClientRect()
      const base = root.getBoundingClientRect()
      // In the window's points with the root at its place, whatever the page had laid before.
      const line = title && { x: title.x - base.x + offset, y: title.y - base.y, width: title.width, height: title.height }
      // The pill's words where the pill stands in the window as main made it (this page may not have drawn that yet).
      const box = ghost.current
      const words = box?.querySelector<HTMLElement>('[data-pill-words]')
      if (box) (box.style.transform = ''), (box.style.left = `${at.x}px`), (box.style.top = `${at.y}px`)
      const from = box && words ? { x: at.x + 1 + words.offsetLeft, y: at.y + 1 + words.offsetTop + words.offsetHeight / 2 } : null
      const move = line?.width && from ? { x: line.x - from.x, y: line.y + Math.min(line.height, 22) / 2 - from.y } : { x: 0, y: 0 }
      return { pill: at, frame, edge: now.side, round, corner, card: { width: card, height: size.height }, dx, dy, move }
    }
    // One motion at a time, from wherever the last one was (Motion carries its speed on); only the one still running says it has ended.
    const spring = (to: number, how: typeof OPEN | typeof CLOSE, then: () => void): void => {
      run?.stop()
      root.dataset.growing = ''
      const me = animate(grown, to, how)
      run = me
      void me.then(() => run === me && ((run = undefined), then()))
    }
    // Reduce motion or the app's Motion off: the card fades in or out where it stands, nothing grows.
    const fade = (into: boolean, then: () => void): void => {
      fading?.cancel()
      const me = root.animate([{ opacity: into ? 0 : 1 }, { opacity: into ? 1 : 0 }], { duration: into ? 160 : 120, easing: 'ease-out', fill: 'forwards' })
      fading = me
      void me.finished.then(() => fading === me && then(), () => undefined)
    }
    const off = window.api.onBeaconPeek((now, byKey = false) => {
      const from = was
      was = now
      setInstant(byKey)
      setPeek(now)
      settle()
      // In this same task as the card is shown, never a frame of the two together.
      if (pill.current) pill.current.style.visibility = now?.opened ? 'hidden' : 'visible'
      const html = document.documentElement
      if (now?.opened) {
        html.setAttribute('data-pill-open', now.side)
        html.style.setProperty('--pill-card', `${now.opened.pill.width + 2 * INSET}px`)
        html.style.setProperty('--pill-left', `${now.opened.pill.x - INSET}px`)
      } else {
        html.removeAttribute('data-pill-open')
        html.style.removeProperty('--pill-card')
        html.style.removeProperty('--pill-left')
      }
      // A pill: the card under it is kept, hidden in this same task, so it never shows whole for a frame.
      root.style.visibility = now && !now.opened ? 'hidden' : ''
      grown.jump(1)
      if (!now?.opened || from?.opened || byKey) return
      if (still()) return fade(true, settle)
      // Rested on, the pill becomes the card: drawn as the pill in this same task, before the window's new size is
      // drawn, then sprung open on the session pill's own spring, the card's words coming in as it opens.
      shape = measure(now)
      grown.jump(0)
      draw()
      spring(1, OPEN, settle)
    })
    // The pointer gone from it (main watches): back into its pill, then main makes it the pill; back on it midway, out
    // again from where it is.
    const offFold = window.api.onBeaconFold((on) => {
      if (!was?.opened) return
      if (still()) return on ? fade(false, () => window.api.beaconFolded()) : fade(true, settle)
      if (!on) return shape ? spring(1, OPEN, settle) : undefined
      shape ??= measure(was)
      draw()
      // Exits are quicker and plainer than entrances: no give at the end.
      spring(0, CLOSE, () => window.api.beaconFolded())
    })
    return () => (off(), offFold(), settle(), grown.destroy())
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
  // As wide as its card (main's pillWide): its name on the left, its days on the right, the name cut with "…" between.
  const wide = at ? at.width : peek.width
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
          // Placed from its window's left on either side, where main put it (PILL_ROOM), never from the page's right:
          // a page still the size of the window it was (a card's 214 points before its first fold had reached it) put
          // the pill 11 points past where main had it, so the card opened short of the pill's edge.
          left: at ? at.x : 6, top: at ? at.y : 2, width: wide,
          // While its card is out the pill is the card: it grew out of the pill's own shape, in its place, so a pill
          // left standing beside it read as a second thing popping out of the first. Folded back into that shape,
          // the pill shows again in the same task as main makes the window a pill.
          visibility: peek.opened ? 'hidden' : 'visible'
        }}
        className="pointer-events-auto absolute flex h-[28px] items-center gap-2 rounded-full border px-3 font-sans text-[13px] whitespace-nowrap text-foreground transition-[scale] duration-150 active:scale-[0.97]"
      >
        {more ? <span data-pill-words className="font-semibold tabular-nums">{more} more</span> : <>
          <PillMark words={words} />
          <span data-pill-words className="min-w-0 truncate">{words.words.trim()}</span>
          {words.number && <span data-pill-number className="ml-auto shrink-0 font-semibold tabular-nums" style={words.warm ? { color: words.warm } : undefined}>{words.number}</span>}
        </>}
      </motion.button>
      {/* Its words alone while it grows into its card (no ground: the card's paper is the one surface), drawn by the
          spring above, never there at rest. */}
      {!more && (
        <div ref={ghost} aria-hidden data-pill-ghost
          style={{ left: at ? at.x : 6, top: at ? at.y : 2, width: wide, opacity: 0 }}
          className="pointer-events-none absolute flex h-[28px] items-center gap-2 border border-transparent px-3 font-sans text-[13px] whitespace-nowrap text-foreground">
          <PillMark words={words} />
          <span data-pill-words className="min-w-0 truncate">{words.words.trim()}</span>
          {words.number && <span className="ml-auto shrink-0 font-semibold tabular-nums" style={words.warm ? { color: words.warm } : undefined}>{words.number}</span>}
        </div>
      )}
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
