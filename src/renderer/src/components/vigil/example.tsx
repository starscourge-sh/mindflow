import type { ReactNode } from 'react'
import { cn } from '@/lib/tiptap-utils'

/**
 * A page with nothing of yours in it yet, shown filled with a few made-up rows
 * (lib/examples.ts) so you can see what it is for. A quiet label on top says
 * it is an example and the one thing to try; under it the page's own rows,
 * faded, which nothing can click, select or reach with the keys, so none of it
 * can ever be saved. Your first real one takes its place.
 *
 * `on` false draws the children as they are, so a page wraps its list once
 * and switches with a flag.
 */
export function Example({ on = true, tryIt, children, className, compact = false, flush = false }: {
  on?: boolean
  /** The one thing to do, after "Try it:". Live: a button here works. */
  tryIt: ReactNode
  children: ReactNode
  className?: string
  /** For the box's narrow panel. */
  compact?: boolean
  /** In a column that has its own margins already: the label lines up with it. */
  flush?: boolean
}): React.JSX.Element {
  if (!on) return <>{children}</>
  return (
    <div data-example-frame className={cn('flex min-w-0 flex-col', className)}>
      <div role="note" className={cn('flex shrink-0 items-baseline gap-2 rounded-lg border border-dashed border-foreground/15 text-control text-muted-foreground', compact ? 'mx-1 mt-2 mb-1 px-2.5 py-1.5' : flush ? 'mb-1 px-3 py-2' : 'mx-5 mt-3 mb-1 px-3 py-2')}>
        <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-px text-meta font-medium text-foreground/75">Example</span>
        {/* Dia's way: what to do, in bold, carries it; what then happens is plain. */}
        <span className={cn('mf-prose min-w-0', compact ? 'text-body' : 'text-[0.9375rem]')}>
          Try it: <Said text={tryIt} />
        </span>
      </div>
      {/* Faded toward the foot as well as dimmed, so it reads as a picture of the page rather than your notes. */}
      <div data-example inert aria-hidden className="pointer-events-none flex min-h-0 min-w-0 flex-1 flex-col opacity-55 saturate-[0.85] select-none [mask-image:linear-gradient(to_bottom,black_calc(100%-4rem),rgb(0_0_0/0.4))]">
        {children}
      </div>
    </div>
  )
}

/** Words given as text: the first sentence, what to do, in bold. Anything richer is set as it comes. */
function Said({ text }: { text: ReactNode }): React.JSX.Element {
  if (typeof text !== 'string') return <>{text}</>
  const end = /[.!?](?=\s)/.exec(text)
  if (!end) return <strong>{text}</strong>
  return <><strong>{text.slice(0, end.index + 1)}</strong>{text.slice(end.index + 1)}</>
}
