import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { chime } from '@/lib/sound'
import { Rolling } from './ui'

/**
 * Home's "Now": of the cards that wait above the shelves, only the one that
 * fits the moment is shown, the way Arc's sidebar keeps today's things on top
 * and the rest a step away. Each card still decides for itself when it has
 * something to say (Close the day in the evening, Your week on Sunday); a
 * child marked `data-now={rank}` that has something is ranked, the lowest
 * rank is shown first, and the others wait behind "2 more". Children with no
 * rank (a guide) are always shown, in their place.
 */
export function NowSlot({ children }: { children: ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(0)
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const sort = (): void => {
      const ranked = [...el.children].filter((one): one is HTMLElement => one instanceof HTMLElement && one.dataset.now !== undefined)
      const saying = ranked.filter((one) => one.childElementCount > 0).sort((a, b) => Number(a.dataset.now) - Number(b.dataset.now))
      for (const one of ranked) {
        const at = saying.indexOf(one)
        // The one shown comes first; the rest keep their rank's order under it.
        one.style.order = at < 0 ? '' : at === 0 ? '-1' : String(at)
        one.toggleAttribute('data-now-later', at > 0 && !openRef.current)
      }
      setMore(Math.max(0, saying.length - 1))
    }
    sort()
    // A card that comes in (its read answered) is counted before the frame is painted: counted a frame
    // later, "2 more" was drawn and then turned into "4 more".
    const watch = new MutationObserver(() => flushSync(sort))
    watch.observe(el, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [open])
  return (
    <div data-now-slot className="contents">
      <div ref={box} className="flex flex-col [&>[data-now-later]]:hidden">{children}</div>
      {more > 0 && (
        <div className="page-column relative w-full px-3 pt-1.5 @[44rem]/page:px-6">
          <button type="button" data-now-more aria-expanded={open}
            onClick={() => (chime(open ? 'fold' : 'slide'), setOpen(!open))}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-control font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
            {open ? 'Show fewer' : <><Rolling text={more} /> more for today</>}
            <ChevronDown aria-hidden className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}
