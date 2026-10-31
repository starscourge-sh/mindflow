import * as React from 'react'
import { FLOAT } from '@/lib/float'
import { cn } from '@/lib/cn'
import { onScrollAway } from '@/lib/scroll-away'

/** Whether an element, or any box in it, hides part of its words (an ellipsis or a clamped line). */
const cutShort = (element: Element): boolean =>
  [element, ...element.querySelectorAll('*')].some((one) => one.scrollWidth > one.clientWidth + 1 || one.scrollHeight > one.clientHeight + 1)

/** The editor a node sits in, as TipTap hangs it on its root: its view watches the page for changes. */
type Watched = { editor?: { view?: { domObserver?: { stop: () => void; start: () => void } } } }

/**
 * A change made where no editor sees it. Inside a note, ProseMirror watches its
 * page and redraws any line whose attributes change, so moving a `title` aside
 * on hover replaced the very link under the pointer and its click was lost.
 * Its watching is paused for the move (and only that), so the line stays as it
 * is; outside an editor the change is simply made.
 */
function unseen(target: Element, change: () => void): void {
  const observer = (target.closest('.ProseMirror') as (Element & Watched) | null)?.editor?.view?.domObserver
  observer?.stop()
  try {
    change()
  } finally {
    observer?.start()
  }
}

/**
 * Every `title` in the app shown as the app's own tip, never the system's grey
 * box: a title is taken off its element as the pointer arrives (so the system
 * never draws it), kept as `data-title-tip`, and shown here after the tips'
 * own wait, above the element (below where there is no room), unless it only
 * repeats words already showing in full. It goes as the
 * pointer leaves, on a press or a key, and when the element scrolls. One place,
 * so a title written anywhere later looks like the rest.
 */
export function TitleTips(): React.JSX.Element | null {
  const [tip, setTip] = React.useState<{ text: string; x: number; y: number; below: boolean } | null>(null)
  React.useEffect(() => {
    let timer = 0
    let on: Element | null = null
    let stopScroll = (): void => undefined
    const hide = (): void => (window.clearTimeout(timer), stopScroll(), (on = null), setTip(null))
    const over = (event: PointerEvent): void => {
      const target = (event.target as Element | null)?.closest?.('[title], [data-title-tip]')
      if (!target || target === on) return
      const said = target.getAttribute('title')
      if (said !== null) unseen(target, () => (target.setAttribute('data-title-tip', said), target.removeAttribute('title')))
      const text = target.getAttribute('data-title-tip')?.trim()
      hide()
      if (!text) return
      // Words showing in full get no tip that only says them again; cut short, they do.
      const shown = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : target.textContent
      if (text === shown?.trim() && !cutShort(target)) return
      on = target
      timer = window.setTimeout(() => {
        if (on !== target || !target.isConnected) return
        const r = target.getBoundingClientRect()
        const below = r.top < 48
        setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 12), innerWidth - 12), y: below ? r.bottom + 6 : r.top - 6, below })
        stopScroll = onScrollAway(() => target, hide)
      }, 600)
    }
    const out = (event: PointerEvent): void => {
      if (!on) return
      const next = event.relatedTarget as Node | null
      if (next && on.contains(next)) return
      hide()
    }
    addEventListener('pointerover', over, true)
    addEventListener('pointerout', out, true)
    addEventListener('pointerdown', hide, true)
    addEventListener('keydown', hide, true)
    addEventListener('blur', hide)
    return () => {
      hide()
      removeEventListener('pointerover', over, true)
      removeEventListener('pointerout', out, true)
      removeEventListener('pointerdown', hide, true)
      removeEventListener('keydown', hide, true)
      removeEventListener('blur', hide)
    }
  }, [])
  // Kept whole on screen: at the window's edge it moves in rather than being squeezed to a letter a line.
  const box = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!tip || !el) return
    const r = el.getBoundingClientRect()
    const by = r.right > innerWidth - 8 ? innerWidth - 8 - r.right : r.left < 8 ? 8 - r.left : 0
    if (by) el.style.left = `${tip.x + by}px`
  }, [tip])
  if (!tip) return null
  return (
    // Placed by the outer box and faded in by the inner one: on one box the
    // fade's own transform replaced the placing one while it ran, so the tip
    // first showed over the thing pointed at, then jumped above it.
    // As wide as its words (never narrowed by the window's edge it is centred near), up to the inner box's own limit.
    <div ref={box} className="pointer-events-none fixed z-[100] w-max" style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}>
      <div role="tooltip" data-title-tips
        className={cn(FLOAT, 'w-fit max-w-[min(20rem,calc(100vw-1rem))] rounded-md px-2.5 py-1.5 text-xs [overflow-wrap:anywhere] animate-in fade-in-0 zoom-in-95 duration-100')}>
        {tip.text}
      </div>
    </div>
  )
}
