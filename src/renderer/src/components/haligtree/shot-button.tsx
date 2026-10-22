import { useEffect, useId, useRef, useState } from 'react'
import { Monitor, SquareDashed, X } from 'lucide-react'
import CameraIcon from '@/components/ui/camera-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { Tip } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * Quick capture's camera: a round button in the footer. Click it and two
 * round choices ooze up out of it in an arc, up-left and up-right (an SVG
 * goo filter on the shapes only, blur 6 and contrast 18, so the icons on top
 * stay sharp), and the camera turns into ×. Whatever they would sit on (a
 * Word's "Where you met it") steps back while they are open (box-extras.css).
 * Whole screen takes the screen behind the box; area lets you drag out the
 * part you want. Esc closes, the arrows move between them and Return picks.
 * With Motion off or Reduce motion, they simply fade in.
 */
const SIZE = 28
const CHOICES = [
  { area: false, label: 'Whole screen', Icon: Monitor },
  { area: true, label: 'Just an area: drag out the part you want', Icon: SquareDashed }
]
// Up and to either side of the ×, about 19px clear of it once open (raised, so they read as apart from it): they run
// together as they part and settle into separate circles. With no room to
// the left (the box's edge), whole screen goes straight up instead.
type Spot = { x: number; y: number }
const ARC: Spot[] = [{ x: -30, y: -37 }, { x: 30, y: -37 }]
const UP: Spot[] = [{ x: 0, y: -48 }, { x: 30, y: -37 }]
const spots = (button: HTMLElement): Spot[] => (button.getBoundingClientRect().left + ARC[0].x < 6 ? UP : ARC)
const BIG = (one: Element): boolean => { const r = one.getBoundingClientRect(); return r.height > 48 || r.width > 420 }
/** Whatever in the box the open choices would sit on: the field, chip or line under each one. */
function inTheWay(button: HTMLElement, at: Spot[]): HTMLElement[] {
  const from = button.getBoundingClientRect()
  const found = new Set<HTMLElement>()
  for (const spot of at) for (let dx = 2; dx < SIZE; dx += 6) for (let dy = 2; dy < SIZE; dy += 6) {
    let one = document.elementsFromPoint(from.left + spot.x + dx, from.top + spot.y + dy)
      .find((el): el is HTMLElement => el instanceof HTMLElement && !el.contains(button) && !button.contains(el) && !el.closest('[role=tooltip], [data-radix-popper-content-wrapper]'))
    if (!one || BIG(one)) continue
    // Up to the whole field or chip, never the writing area or the box itself.
    while (one.parentElement && !one.parentElement.contains(button) && !BIG(one.parentElement)) one = one.parentElement
    found.add(one)
  }
  return [...found]
}
const DISC = 'absolute top-0 left-0 rounded-full bg-[color-mix(in_oklch,var(--muted),var(--foreground)_6%)]'

export function ShotButton({ onShot }: { onShot: (area: boolean) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [where, setWhere] = useState<Spot[]>(ARC)
  const root = useRef<HTMLSpanElement>(null)
  const goo = `goo${useId().replace(/:/g, '')}`
  const calm = still()
  const toggle = (on: boolean): void => {
    if (on === open) return
    if (on && root.current) (chime('slide'), setAt(0), setWhere(spots(root.current)))
    setOpen(on)
  }
  const pick = (area: boolean): void => (setOpen(false), onShot(area))
  // What is in their way steps back while they are open.
  useEffect(() => {
    if (!open || !root.current) return
    const aside = inTheWay(root.current, where)
    for (const one of aside) one.setAttribute('data-shot-aside', '')
    // Back as softly as they went: the fade stays on (data-shot-back) until they are there.
    return () => {
      for (const one of aside) (one.setAttribute('data-shot-back', ''), one.removeAttribute('data-shot-aside'))
      setTimeout(() => aside.forEach((one) => one.removeAttribute('data-shot-back')), 200)
    }
  }, [open, where])
  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent): void => void (!root.current?.contains(event.target as Node) && setOpen(false))
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  const keys = (event: React.KeyboardEvent): void => {
    if (!open) return
    if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), setOpen(false))
    else if (event.key.startsWith('Arrow')) (event.preventDefault(), setAt((one) => (event.key === 'ArrowLeft' ? 0 : event.key === 'ArrowRight' ? 1 : 1 - one)))
    else if (event.key === 'Enter') (event.preventDefault(), event.stopPropagation(), pick(CHOICES[at].area))
  }
  // Out from under the × and up into place: under 300ms, eased out with a little give, each one 40ms after the last.
  // Back in quicker and with no give: the system answering, not a show. A press dips it (scale).
  const place = (index: number): React.CSSProperties => ({
    transform: open || calm ? `translate(${where[index].x}px, ${where[index].y}px)` : 'translate(0px, 0px) scale(0.6)',
    opacity: open ? 1 : 0,
    transition: calm
      ? 'opacity 150ms ease-out'
      : open
        ? `transform 280ms cubic-bezier(.3,1.35,.6,1) ${index * 40}ms, opacity 160ms ease-out ${index * 40}ms, scale 150ms ease-out, border-color 150ms ease`
        : 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1), opacity 120ms ease-out, scale 150ms ease-out, border-color 150ms ease'
  })
  return (
    <span ref={root} data-shot-button data-open={open || undefined} className="relative inline-flex shrink-0" style={{ width: SIZE, height: SIZE }} onKeyDownCapture={keys}>
      <svg aria-hidden className="absolute size-0">
        <filter id={goo}><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" /><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" /></filter>
      </svg>
      {/* The goo: one disc under the camera and one per choice, run together as they part. Only seen while open. */}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ filter: calm ? undefined : `url(#${goo}) drop-shadow(0 2px 6px rgb(0 0 0 / 0.18))`, opacity: open ? 1 : 0, transition: 'opacity 120ms ease-out' }}>
        <span className={DISC} style={{ width: SIZE, height: SIZE }} />
        {CHOICES.map((one, index) => <span key={one.label} className={DISC} style={{ width: SIZE, height: SIZE, ...place(index) }} />)}
      </span>
      {/* The camera, a footer control like the kind chip beside it, turning into × while open. */}
      <Tip label={open ? 'Close  Esc' : 'Take a screenshot'}>
        <button type="button" aria-label="Take a screenshot" aria-expanded={open} onClick={() => toggle(!open)}
          className={cn('relative flex cursor-pointer items-center justify-center rounded-full border border-border text-foreground outline-none transition-[color,background-color,border-color,scale] duration-150 ease-out hover:bg-input/50 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30', open && 'border-transparent bg-transparent hover:bg-transparent dark:bg-transparent')}
          style={{ width: SIZE, height: SIZE }}>
          <span className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200" style={{ opacity: open ? 0 : 1, transform: open && !calm ? 'rotate(-45deg) scale(0.6)' : 'none' }}><AliveIcon icon={CameraIcon} size={15} /></span>
          <span className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200" style={{ opacity: open ? 1 : 0, transform: open || calm ? 'none' : 'rotate(45deg) scale(0.6)' }}><X className="size-4" /></span>
        </button>
      </Tip>
      {/* The choices' icons, sharp, over the goo, with the soft ring once settled. */}
      {CHOICES.map((one, index) => (
        <Tip key={one.label} label={one.label}>
          <button type="button" data-shot={one.area ? 'area' : 'screen'} aria-label={one.label} tabIndex={open ? 0 : -1} aria-hidden={!open}
            onClick={() => pick(one.area)} onPointerEnter={() => setAt(index)}
            className={cn('absolute top-0 left-0 z-10 flex cursor-pointer items-center justify-center rounded-full border text-foreground outline-none hover:border-foreground/25 active:scale-[0.97]', open ? 'border-foreground/10' : 'border-transparent', open && at === index && 'border-foreground/25')}
            style={{ width: SIZE, height: SIZE, ...place(index), pointerEvents: open ? 'auto' : 'none' }}>
            <one.Icon className="size-3.5" strokeWidth={2} />
          </button>
        </Tip>
      ))}
    </span>
  )
}
