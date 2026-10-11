import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { byKeys } from '@/lib/motion'
import { SABER_OUT, SANDBOX } from '@/lib/sandbox'
import { saberCharged, saberTouch } from '@/lib/sound'

/**
 * Every bar that fills in Vigil, in the style picked under Settings ›
 * Appearance: plain, a lightsaber, or a small dinosaur running along it.
 * Each place keeps its own size; the playful ones are a little taller where
 * they must be to read. The style is a flag on the root (`data-bars`, set
 * by useAppearance), so one switch redraws every bar in every window.
 */
export type BarStyle = 'plain' | 'saber' | 'dino'

const root = document.documentElement
const watch = (done: () => void): (() => void) => {
  const seen = new MutationObserver(done)
  seen.observe(root, { attributes: true, attributeFilter: ['data-bars'] })
  return () => seen.disconnect()
}
const style = (): BarStyle => (root.dataset.bars === 'saber' || root.dataset.bars === 'dino' ? root.dataset.bars : 'plain')

// Awake: the window is shown and looked at (focused, or the pointer over it,
// as a beacon is read without being clicked). Only then does a blade hum or
// the dinosaur run; hidden or tucked away, everything holds still (main.css).
let over = false
const wake = (): void => void root.toggleAttribute('data-awake', document.visibilityState === 'visible' && (document.hasFocus() || over))
addEventListener('focus', wake)
addEventListener('blur', wake)
document.addEventListener('visibilitychange', wake)
root.addEventListener('pointerenter', () => ((over = true), wake()))
root.addEventListener('pointerleave', () => ((over = false), wake()))
wake()

/** How long the pointer rests on a blade before it answers. */
const HOLD_MS = 600
const OFFERED = 'saber-offered'

/**
 * Rest the pointer on a lit blade and it hums, softly, and flares. Never
 * told, only found. In the sandbox, the first time, a quiet line says your
 * own bars can be lightsabers too, with a way to the setting; once only.
 */
function touched(bar: HTMLElement, chosen: boolean): void {
  saberTouch()
  const still = root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!still) bar.querySelector('.pb-core')?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.7)', offset: 0.25 }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' })
  if (!SANDBOX || !chosen) return
  try {
    if (localStorage.getItem(OFFERED)) return
    localStorage.setItem(OFFERED, new Date().toISOString())
  } catch {
    return
  }
  void Promise.all([import('./ui'), import('./powers-view')]).then(([{ toast }, { showMe }]) =>
    toast('Like these? Your own bars can be lightsabers too.', undefined, 'info', {
      label: 'Show me', key: 's',
      run: () => void showMe(
        { name: 'Progress bars', show: { view: 'settings', settings: 'Appearance', find: 'Progress bars', at: '[data-setting]', text: 'Here it changes the sandbox. In your own notes, the same choice is in the same place.' } },
        (id) => window.api.openInHome('view', id)
      )
    })
  )
}

/**
 * Nearly full, the blade gathers: from 90% its glow grows and breathes, slow
 * and calm (a day's bar gets there late in the evening, so it must never
 * pull the eye), strongest at 100%. Its strength, 0 below 90% to 1 at full.
 */
const CHARGE_FROM = 0.9
const charge = (at: number): number => Math.max(0, Math.min(1, (at - CHARGE_FROM) / (1 - CHARGE_FROM)))

/**
 * Reaching 100% while you watch: one flare, brighter and wider, then the
 * charged glow it rests in; and, with Sounds on, one low hum swelling.
 * Once each time it gets there; never on a bar that opens already full.
 */
function charged(bar: HTMLElement): void {
  saberCharged()
  const still = root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const core = bar.querySelector('.pb-core')
  if (still || !core) return
  core.animate([{ filter: 'brightness(1.12)' }, { filter: 'brightness(1.6)', offset: 0.3 }, { filter: 'brightness(1.12)' }], { duration: 1100, easing: 'ease-out' })
  core.animate([{ opacity: 1, transform: 'scaleY(1)' }, { opacity: 1, transform: 'scaleY(1.9)', offset: 0.3 }, { opacity: 1, transform: 'scaleY(1)' }], { duration: 1100, easing: 'ease-out', pseudoElement: '::before' })
}

/** The ignition: quick and out, on the sandbox blade's own curve. */
const IGNITE = `transform 220ms ${SABER_OUT}`

export function ProgressBar({
  value, label, className = '', thick = 4, fill = 'color-mix(in oklab, var(--foreground) 45%, transparent)',
  track = 'color-mix(in oklab, var(--foreground) 9%, transparent)', blade = 'var(--tt-color-text-blue)',
  duration = 700, square = false, ignite = false, as
}: {
  /** How far, 0 to 1. */
  value: number
  label: string
  /** Placement only (margins, flex); the height is the bar's own. */
  className?: string
  /** The plain bar's height in px. */
  thick?: number
  /** The plain bar's colours. */
  fill?: string
  track?: string
  /** The lightsaber's colour. */
  blade?: string
  /** How long a change slides, in ms, when it is not an ignition. */
  duration?: number
  /** Square ends, for a bar that runs edge to edge. */
  square?: boolean
  /** Lit as it arrives (a beacon coming back), not only as it grows. */
  ignite?: boolean
  /** This style whatever Settings says, for a moment that is always the same one. */
  as?: BarStyle
}): React.JSX.Element {
  const chosen = useSyncExternalStore(watch, style)
  const kind = as ?? chosen
  const at = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  // Arriving lit from nothing: dark for a frame, then out to where it is.
  const [phase, setPhase] = useState<'dark' | 'lit' | 'still'>(ignite && root.dataset.motion !== 'off' ? 'dark' : 'still')
  useEffect(() => {
    if (phase === 'still') return
    if (phase === 'lit') {
      const rest = setTimeout(() => setPhase('still'), 700)
      return () => clearTimeout(rest)
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('lit')))
    return () => cancelAnimationFrame(frame)
  }, [phase])
  // Grown in front of you by a click: a quick ignition. By a key, or a minute
  // ticking by, it only slides (lib/motion.ts, rule 5).
  const was = useRef(at)
  const grew = at - was.current >= 0.01 && !byKeys()
  useEffect(() => void (was.current = at), [at])
  const shown = phase === 'dark' ? 0 : at
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(resting.current), [])
  const quick = phase === 'lit' || grew
  // Full just now, not opened full: the flare, once (above), when the blade
  // has slid all the way out, not as it starts to.
  const self = useRef<HTMLSpanElement>(null)
  const before = useRef(at)
  const arrive = quick && kind === 'saber' ? 220 : duration
  useEffect(() => {
    const full = kind === 'saber' && at >= 1 && before.current < 1
    before.current = at
    if (!full) return
    const out = setTimeout(() => self.current && charged(self.current), arrive)
    return () => clearTimeout(out)
    // Only a change of value counts; the slide's length is read as it was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, kind])
  const move = {
    transition: quick && kind === 'saber' ? IGNITE : quick && kind === 'dino' ? 'transform 600ms var(--mf-ease)' : `transform ${duration}ms var(--mf-ease)`
  }
  const bar = {
    role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(at * 100), 'data-style': kind
  } as const

  if (kind === 'saber') {
    const core = Math.max(thick, 3)
    const hilt = core * 2 + 3
    return (
      <span {...bar} ref={self} data-charged={at >= CHARGE_FROM ? '' : undefined} className={`pb-saber relative flex items-center ${className}`}
        style={{ height: hilt, '--blade': blade, '--charge': charge(at) } as CSSProperties}
        onPointerEnter={(event) => {
          const held = event.currentTarget
          clearTimeout(resting.current)
          resting.current = setTimeout(() => touched(held, !as), HOLD_MS)
        }}
        onPointerLeave={() => clearTimeout(resting.current)}>
        <Hilt height={hilt} />
        <span aria-hidden className="relative h-full flex-1">
          {/* Unlit, the rest of the way: a faint line to say where it ends. */}
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-foreground/[0.12]" />
          {/* The blade slides out of the hilt; its glow spills past, faded out under the emitter. */}
          <span className="absolute -inset-y-2 -left-2 -right-2 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8px)]">
            <span className="pb-blade absolute top-1/2 left-2 w-[calc(100%-1rem)] -translate-y-1/2 rounded-full" style={{ height: core }}>
              {/* Put away, a little further in, so not even its glow shows at the emitter. */}
              <span className="block h-full w-full rounded-full" style={{ ...move, transform: `translateX(calc(${(shown - 1) * 100}% - ${(1 - shown) * 16}px))` }}>
                <span className="pb-core block h-full w-full rounded-full" />
              </span>
            </span>
          </span>
        </span>
      </span>
    )
  }

  if (kind === 'dino') {
    const done = at >= 1
    return (
      <span {...bar} className={`pb-dino relative block h-[22px] overflow-x-clip text-foreground ${className}`}>
        {/* The ground: dots all the way, the run so far drawn over them. */}
        <span aria-hidden className="pb-ground absolute inset-x-0 bottom-[2px] h-[1.5px]" />
        <span aria-hidden className={`absolute inset-y-0 left-0 ${done ? 'right-[34px]' : 'right-[24px]'}`} style={{ ...move, transform: `translateX(${shown * 100}%)` }}>
          <span className="absolute bottom-[2px] h-[1.5px] w-[200vw] right-[calc(100%-12px)] bg-current opacity-55" />
          {!done && (
            <>
              <Cactus className="pb-near" at={36} />
              <Cactus at={84} />
              <Cactus at={150} />
            </>
          )}
          <Dino done={done} />
        </span>
        {done && <Flag />}
      </span>
    )
  }

  return (
    <span {...bar} className={`relative block overflow-hidden ${square ? '' : 'rounded-full'} ${className}`} style={{ height: thick, background: track }}>
      <span className={`absolute inset-0 ${square ? '' : 'rounded-full'}`} style={{ ...move, background: fill, transform: `translateX(${(shown - 1) * 100}%)` }} />
    </span>
  )
}

/** A small hilt, drawn rather than rendered: pommel, ridged grip, a button, the emitter. */
function Hilt({ height }: { height: number }): React.JSX.Element {
  const id = useId()
  return (
    <svg aria-hidden viewBox="0 0 24 10" height={height} width={(height * 24) / 10} className="relative z-10 -mr-px shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e6ea" />
          <stop offset="0.45" stopColor="#a7acb4" />
          <stop offset="1" stopColor="#5c6169" />
        </linearGradient>
      </defs>
      <g stroke="#2a2c31" strokeWidth="0.5" strokeLinejoin="round">
        {/* Pommel, grip, shroud, emitter: a touch uneven, as drawn. */}
        <path d="M0.6 3.1Q0.4 2.4 1.3 2.3L3.2 2.4 3.1 7.7 1.2 7.6Q0.5 7.5 0.6 6.9Z" fill="#45484f" />
        <path d="M3.1 2.6L12.4 2.5 12.5 7.4 3.1 7.5Z" fill={`url(#${id}m)`} />
        <path d="M12.4 1.6L19.6 1.4 19.8 8.6 12.5 8.4Z" fill={`url(#${id}m)`} />
        <path d="M19.7 2.6L23.4 2.4Q23.7 5 23.4 7.6L19.7 7.5Z" fill="#3a3d43" />
      </g>
      <g fill="#2a2c31">
        <rect x="4.6" y="2.6" width="0.9" height="4.8" />
        <rect x="6.6" y="2.6" width="0.9" height="4.8" />
        <rect x="8.6" y="2.6" width="0.9" height="4.8" />
        <rect x="13.6" y="5.6" width="5" height="0.8" opacity="0.55" />
      </g>
      <rect x="15.2" y="2.6" width="2" height="1.7" rx="0.5" fill="#d44a3a" stroke="#2a2c31" strokeWidth="0.4" />
    </svg>
  )
}

// The dinosaur, Vigil's own: a small long-necked sauropod in the ink of
// the page, with a red scarf. Drawn on a 16 by 12 grid, a pixel 1.5px (3 on
// a Retina screen, so every pixel is whole).
const BODY = [
  '...........###..',
  '..........##.##.',
  '..........######',
  '..........###...',
  '................',
  '..........##....',
  '.....######.....',
  '...#########....',
  '.###########....',
  '#...########....'
]
const LEGS_A = ['....##...##.....', '...##.....##....']
const LEGS_B = ['.....##.##......', '.....##.##......']
const SIT = ['..##########....', '................']
const SCARF = ['', '', '', '', '..........####..', '.........#......']
const SCARF_A = ['', '', '', '', '........##......', '']
const SCARF_B = ['', '', '', '........#.......', '.........#......', '']

/** A grid's filled cells as one path, row by row. */
const cells = (rows: string[], top = 0): string =>
  rows.flatMap((row, y) => [...row.matchAll(/#+/g)].map((run) => `M${run.index}.0 ${y + top}h${run[0].length}v1h-${run[0].length}z`)).join('')

function Dino({ done }: { done: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 12" width={24} height={18} shapeRendering="crispEdges" className={`absolute bottom-[3.5px] left-0 ${done ? '' : 'pb-hop'}`}>
      <g transform={done ? 'translate(0 2)' : undefined}>
        <path d={cells(BODY.slice(0, 9))} fill="currentColor" />
        <path d={done ? cells(SIT, 9) : cells(BODY.slice(9), 9)} fill="currentColor" />
        <path d={cells(SCARF)} fill="var(--tt-color-text-red)" />
        <path className="pb-frame-a" d={cells(SCARF_A)} fill="var(--tt-color-text-red)" />
        {!done && <path className="pb-frame-b" d={cells(SCARF_B)} fill="var(--tt-color-text-red)" />}
      </g>
      {!done && (
        <>
          <path className="pb-frame-a" d={cells(LEGS_A, 10)} fill="currentColor" />
          <path className="pb-frame-b" d={cells(LEGS_B, 10)} fill="currentColor" />
        </>
      )}
    </svg>
  )
}

/** A cactus ahead, arms up. */
function Cactus({ at, className = '' }: { at: number; className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 5 7" width={5} height={7} shapeRendering="crispEdges" className={`absolute bottom-[3.5px] opacity-50 ${className}`} style={{ left: at }}>
      <path d="M2 0h1v7h-1zM0 1h1v3h1v1h-2zM4 2h1v3h-2v-1h1z" fill="currentColor" />
    </svg>
  )
}

/** At the end, a pennant in the ground. */
function Flag(): React.JSX.Element {
  return (
    <svg aria-hidden viewBox="0 0 6 12" width={9} height={18} shapeRendering="crispEdges" className="absolute right-0 bottom-[2px]">
      <path d="M1 0h1v12h-1z" fill="currentColor" />
      <path d="M2 0h4v1h-1v1h1v1h-4z" fill="var(--tt-color-text-red)" />
    </svg>
  )
}
