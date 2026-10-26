import { Fragment, useLayoutEffect, useRef, type RefObject } from 'react'
import { animate, motion } from 'motion/react'
import { ENTER } from './welcome-reel'

/** Where the welcome's pointer is in its work on a line: coming to it, dragging across it, let go on it, or going away. */
export type Move = 'off' | 'reach' | 'drag' | 'held' | 'leave'
/** How long a reach and a drag take: the beats that follow them wait this long (welcome.tsx). */
export const REACH_MS = 820
export const DRAG_MS = 660

type Spot = { x: number; y: number }

/**
 * A hand's glide from one place to another: on a gentle arc rather than a
 * ruler's line (a wrist turns), eased to a slight overshoot and settle, as a
 * person lands a pointer on the spot they meant.
 */
function glide(from: Spot, to: Spot, ms: number, place: (x: number, y: number) => void, landed?: () => void): { stop: () => void } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  // The arc bows to one side by a fifth of the way, always below the straight line.
  let nx = -dy / length
  let ny = dx / length
  if (ny < 0) (nx = -nx), (ny = -ny)
  const bow = Math.min(120, length * 0.2)
  const cx = (from.x + to.x) / 2 + nx * bow
  const cy = (from.y + to.y) / 2 + ny * bow
  return animate(0, 1, {
    duration: ms / 1000,
    ease: [0.32, 1.08, 0.46, 1],
    onUpdate: (p) => {
      const q = 1 - p
      place(q * q * from.x + 2 * q * p * cx + p * p * to.x, q * q * from.y + 2 * q * p * cy + p * p * to.y)
    },
    onComplete: landed
  })
}

/**
 * The welcome's pointer, drawn as macOS draws it: the arrow while it travels,
 * the text beam once it is over words. It comes in from the lower right,
 * selects a line's `phrases[line]` by dragging across it (its selection,
 * `marks[line]`, growing with the drag), is let go, and travels on; at the
 * end it drifts off and fades. Only transform and opacity move, set straight
 * on the element each frame; a new move takes over from wherever it is.
 */
export function WelcomePointer({ root, phrases, marks, line, move }: { root: RefObject<HTMLElement | null>; phrases: RefObject<(HTMLElement | null)[]>; marks: RefObject<(HTMLElement | null)[]>; line: number; move: Move }): React.JSX.Element {
  const me = useRef<HTMLDivElement>(null)
  const at = useRef<Spot | null>(null)
  const run = useRef<{ stop: () => void } | null>(null)
  useLayoutEffect(() => {
    const el = me.current
    const base = root.current
    if (!el || !base) return
    const box = base.getBoundingClientRect()
    const place = (x: number, y: number): void => {
      at.current = { x, y }
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    const phrase = phrases.current?.[line]?.getBoundingClientRect()
    // A line's two ends, at the height of its letters' middle.
    const end = (r: DOMRect, right: boolean): Spot => ({ x: (right ? r.right + 1 : r.left - 1) - box.left, y: r.top + r.height * 0.56 - box.top })
    run.current?.stop()
    if (!at.current) place(box.width * 0.82, box.height + 60)
    const from = at.current as Spot
    if (move === 'reach' && phrase) {
      el.dataset.beam = ''
      el.style.opacity = '1'
      run.current = glide(from, end(phrase, false), REACH_MS, place, () => void (el.dataset.beam = 'on'))
    } else if (move === 'drag' && phrase) {
      el.dataset.beam = 'on'
      const a = end(phrase, false)
      const b = end(phrase, true)
      const mark = marks.current?.[line]
      if (mark) mark.style.transform = 'scaleX(0)'
      // Dragged as a hand drags: a slow start, steady across, easing off at the last letter, a hair off level.
      run.current = animate(0, 1, {
        duration: DRAG_MS / 1000,
        ease: [0.45, 0.05, 0.3, 1],
        onUpdate: (p) => {
          const x = from.x + (b.x - from.x) * p
          place(x, from.y + (b.y - from.y) * p - Math.sin(p * Math.PI) * 1.5)
          if (mark) mark.style.transform = `scaleX(${Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x || 1)))})`
        }
      })
    } else if (move === 'leave') {
      el.dataset.beam = ''
      el.style.opacity = '0'
      // Off a little up and to the right as it fades, never toward the button at the foot: heading for it, it
      // read as "now press Next" while the page still had its cause and answer to tell.
      run.current = glide(from, { x: Math.min(box.width - 24, from.x + 90), y: Math.max(0, from.y - 50) }, 900, place)
    }
  }, [line, move]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => run.current?.stop(), [])
  return (
    <div ref={me} aria-hidden data-pointer="" className="group pointer-events-none absolute top-0 left-0 z-40 opacity-0 transition-opacity duration-700 ease-out will-change-transform"
      style={{ filter: 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35))' }}>
      {/* The arrow: its tip is the spot. */}
      <svg width="20" height="28" viewBox="0 0 20 28" className="absolute -top-[1.5px] -left-[1.5px] transition-opacity duration-100 group-data-[beam=on]:opacity-0">
        <path d="M1.5 1.5 L1.5 21.6 L6.4 16.9 L9.7 24.7 L13 23.3 L9.8 15.8 L16.4 15.8 Z" fill="#000" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {/* The text beam: its middle is the spot. */}
      <svg width="12" height="24" viewBox="0 0 12 24" className="absolute -top-[12px] -left-[6px] opacity-0 transition-opacity duration-100 group-data-[beam=on]:opacity-100">
        {[['#fff', 3.2], ['#000', 1.3]].map(([ink, width]) => (
          <path key={ink} d="M2.5 2 C4.3 2 5.4 2.6 6 3.8 C6.6 2.6 7.7 2 9.5 2 M6 3.8 V20.2 M2.5 22 C4.3 22 5.4 21.4 6 20.2 C6.6 21.4 7.7 22 9.5 22 M4 12 H8" fill="none" stroke={ink as string} strokeWidth={width} strokeLinecap="round" />
        ))}
      </svg>
    </div>
  )
}

/**
 * Words condensing out of the mist: each from a soft blur and nothing, a
 * little low, settling sharp into its place one after another. The words keep
 * their places from the start, so nothing around them moves. Still, simply there.
 */
export function Condense({ text, on, quick, delay = 0, stagger = 0.06 }: { text: string; on: boolean; quick: boolean; delay?: number; stagger?: number }): React.JSX.Element {
  const words = text.split(' ')
  return (
    <span aria-label={text}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <motion.span aria-hidden className="inline-block" initial={false}
            animate={on ? { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0em)' } : { opacity: 0, filter: 'blur(10px)', transform: 'translateY(0.28em)' }}
            transition={{ duration: quick ? 0 : 1.1, delay: quick || !on ? 0 : delay + i * stagger, ease: ENTER }}>
            {word}
          </motion.span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </span>
  )
}
