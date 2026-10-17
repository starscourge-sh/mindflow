import { useId, useRef, useState } from 'react'
import CameraIcon from '@/components/ui/camera-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'

/**
 * Quick capture's camera: point at it and two choices ooze out of it, joined
 * to it like drops of ink (an SVG goo filter, so it is the shapes that blur
 * into each other, never what is behind them). “Whole screen” takes the
 * screen behind the box; “Just an area” lets you drag out the part you want.
 * With Motion off or Reduce motion, the choices are simply there.
 */
export function ShotButton({ onShot }: { onShot: (area: boolean) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const leave = useRef(0)
  const goo = `goo${useId().replace(/:/g, '')}`
  const show = (on: boolean): void => {
    clearTimeout(leave.current)
    if (on) return void (!open && (chime('slide'), setOpen(true)))
    leave.current = window.setTimeout(() => setOpen(false), 180)
  }
  const calm = still()
  const blob = (at: number): React.CSSProperties => ({
    transform: open ? `translateX(${at}px)` : 'translateX(0px)',
    opacity: open ? 1 : 0,
    transition: calm ? 'none' : `transform 420ms cubic-bezier(.34,1.56,.64,1) ${at > 40 ? 60 : 0}ms, opacity 160ms ease-out`
  })
  const choices = [{ area: false, label: 'Whole screen', at: 30 }, { area: true, label: 'Just an area', at: 122 }]
  return (
    <span data-shot-button className="relative flex h-7 items-center" onPointerEnter={() => show(true)} onPointerLeave={() => show(false)}
      onFocus={() => show(true)} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && show(false)}>
      <svg aria-hidden className="absolute size-0">
        <filter id={goo}><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" /><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" /></filter>
      </svg>
      {/* The goo: the camera's disc and a pill per choice, all one colour, run together. The words sit over it, sharp. */}
      <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-7" style={{ filter: calm ? undefined : `url(#${goo})` }}>
        <span className="absolute top-0 left-0 size-7 rounded-full bg-[var(--tt-brand-color-400)]" />
        {choices.map((one) => <span key={one.label} className="absolute top-0 left-0 h-7 w-[88px] rounded-full bg-[var(--tt-brand-color-400)]" style={blob(one.at)} />)}
      </span>
      <button type="button" aria-label="Take a screenshot" aria-expanded={open} onClick={() => (setOpen(false), onShot(false))}
        className="relative flex size-7 items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <AliveIcon icon={CameraIcon} size={15} />
      </button>
      {choices.map((one) => (
        <button key={one.label} type="button" data-shot={one.area ? 'area' : 'screen'} tabIndex={open ? 0 : -1} aria-hidden={!open}
          onClick={() => (setOpen(false), onShot(one.area))}
          className="absolute top-0 left-0 flex h-7 w-[88px] items-center justify-center rounded-full text-xs font-semibold whitespace-nowrap text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          style={{ ...blob(one.at), pointerEvents: open ? 'auto' : 'none' }}>
          {one.label}
        </button>
      ))}
    </span>
  )
}
