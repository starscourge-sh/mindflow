import type { ReactNode } from 'react'

import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Scenery } from './scenery'
import { dayjs } from '../../../../main/dates'

/**
 * A memory as a postcard from your past self, when Postcards is on: a white
 * print laid on the desk, the day it was caught franked on it in a postmark,
 * with the cancel lines running off it, and the day's scene behind the words
 * when Scenery has pictures. Off, a memory is the hint card it always was.
 */

/** Whether memories come as postcards: Postcards on in Settings. */
export const usePostcard = (memory: boolean): boolean => !!useLive(vigil.settings, null as Settings | null)?.postcards && memory

/**
 * A postmark: two rings, VIGIL and the year around the edge, the day in the
 * middle, and wavy cancel lines trailing to the left. Drawn in the text's own
 * ink, faint, so it reads as stamped rather than printed.
 */
export function Postmark({ at, className = '' }: { at: string; className?: string }): React.JSX.Element {
  const day = dayjs(at)
  const id = `mf-postmark-${day.format('YYYYMMDD')}`
  return (
    <svg viewBox="0 0 168 64" aria-label={`Caught ${day.format('D MMMM YYYY')}`} role="img" className={`pointer-events-none text-foreground ${className}`}>
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.5">
        {[14, 22, 30, 38, 46].map((y) => (
          <path key={y} d={`M2 ${y} q 9 -4 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0`} />
        ))}
      </g>
      <g transform="translate(134 32) rotate(-9)">
        <circle r="29" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.6" />
        <circle r="20.5" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.45" />
        <defs>
          <path id={id} d="M -24.6 0 A 24.6 24.6 0 1 1 24.6 0 A 24.6 24.6 0 1 1 -24.6 0" />
        </defs>
        <text fill="currentColor" opacity="0.6" fontSize="6.4" letterSpacing="1.6" className="font-mono">
          <textPath href={`#${id}`} startOffset="2%">VIGIL · {day.format('YYYY')} · VIGIL · {day.format('YYYY')} ·</textPath>
        </text>
        <text y="-2.5" textAnchor="middle" fill="currentColor" opacity="0.72" fontSize="8.5" letterSpacing="0.8" className="font-mono">{day.format('MMM').toUpperCase()}</text>
        <text y="9" textAnchor="middle" fill="currentColor" opacity="0.72" fontSize="11" className="font-mono">{day.format('D')}</text>
      </g>
    </svg>
  )
}

/**
 * The card itself: the white border of a print with the page's own colour
 * inside, and top right a stamp (the day's scene, when Scenery has pictures)
 * franked with the postmark. What it says is the hint card's, unchanged.
 */
export function MemoryPostcard({ at, seed, children }: { at?: string; seed: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-xl bg-white p-1.5 shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_10px_28px_-10px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]">
      <div className="rounded-lg bg-background px-3 pt-3 pb-2.5">
        <div aria-hidden className="relative float-right -mt-1 -mr-0.5 mb-1 ml-3 h-14 w-[10.5rem]">
          {/* The stamp: gone, with its border, when there is no scene to put in it. */}
          <div className="absolute top-0 right-0 h-[3.25rem] w-11 rotate-[4deg] rounded-[3px] bg-white p-[3px] shadow-[0_1px_3px_rgb(0_0_0/0.25)] [&:not(:has(*))]:hidden">
            <Scenery place="recap" seed={`memory:${seed}`} mood={['day', 'dusk', 'night', 'interior']} wide={false} soft className="relative size-full" rounded="rounded-[1px]" />
          </div>
          {at && <Postmark at={at} className="absolute top-0.5 right-6 h-14 w-[9.25rem]" />}
        </div>
        {children}
      </div>
    </div>
  )
}

/** The card's words as a postcard when `on`, else just the words. */
export function Postcarded({ on, at, seed, children }: { on: boolean; at?: string; seed: string; children: ReactNode }): React.JSX.Element {
  return on ? <MemoryPostcard at={at} seed={seed}>{children}</MemoryPostcard> : <>{children}</>
}
