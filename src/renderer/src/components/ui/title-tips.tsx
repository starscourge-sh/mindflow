import * as React from 'react'
import { FLOAT } from '@/lib/float'
import { cn } from '@/lib/cn'
import { onScrollAway } from '@/lib/scroll-away'

/**
 * Every `title` in the app shown as the app's own tip, never the system's grey
 * box: a title is taken off its element as the pointer arrives (so the system
 * never draws it), kept as `data-title-tip`, and shown here after the tips'
 * own wait, above the element (below where there is no room). It goes as the
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
      if (said !== null) (target.setAttribute('data-title-tip', said), target.removeAttribute('title'))
      const text = target.getAttribute('data-title-tip')?.trim()
      hide()
      if (!text) return
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
  if (!tip) return null
  return (
    <div role="tooltip" data-title-tips
      className={cn(FLOAT, 'pointer-events-none fixed z-[100] w-fit max-w-[min(20rem,calc(100vw-1rem))] rounded-md px-2.5 py-1.5 text-xs [overflow-wrap:anywhere] animate-in fade-in-0 zoom-in-95 duration-100')}
      style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}>
      {tip.text}
    </div>
  )
}
