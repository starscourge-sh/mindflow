import { useEffect, type RefObject } from 'react'
import { call } from '@/lib/haligtree'

/** Past this long without a scroll, key or pointer, the reader is not counted as reading. */
const QUIET_MS = 60_000
/** Told to main every this much reading, and as the reader goes away. */
const TELL_MS = 15_000

/**
 * The time an article is really read, told to main (main/read-time.ts): only while its window is in front, the article
 * in view, and a scroll, key or pointer came in the last minute; each stretch between two of them counts up to a
 * minute. Its end reached is said once. Counted from events as they come, never on a clock.
 */
export function useReadTime(href: string, scroller: RefObject<HTMLElement | null>, words: number): void {
  useEffect(() => {
    const box = scroller.current
    if (!box || !words) return
    let last = 0
    let owed = 0
    let end = false
    // In view, as the browser reports it after its own layout: never asked of the page in an event (a press, a key, a
    // move), where reading the layout made the browser lay out a 300-minute article again first (580ms to 2s, the
    // first press into a pane in a split, 20 Nov).
    let shown = false
    const seen = (): boolean => shown && document.hasFocus() && document.visibilityState === 'visible'
    const tell = (): void => {
      if (owed < 1000 && !end) return
      void call('read:add', href, words, owed, end)
      owed = 0
    }
    const upTo = (now: number): void => void (last && (owed += Math.min(now - last, QUIET_MS)))
    const act = (): void => {
      const now = performance.now()
      if (!seen()) return void (last = 0)
      upTo(now)
      last = now
      if (owed >= TELL_MS) tell()
    }
    // Its end in view: the last of its words above the reader's foot. Read on a scroll and as it comes into view (an
    // article shorter than the window, at once), when the browser has just laid the page out, so it costs nothing.
    const atEnd = (): void => {
      if (end || !seen() || box.scrollTop + box.clientHeight < box.scrollHeight - 8) return
      end = true
      tell()
    }
    const scrolled = (): void => (act(), atEnd())
    const watch = new IntersectionObserver(([one]) => {
      shown = one.isIntersecting
      if (shown) (act(), atEnd())
    })
    watch.observe(box)
    // Away (another app, another tab, the window hidden): the time up to now counts, then nothing until it is back.
    const away = (): void => {
      upTo(performance.now())
      last = 0
      tell()
    }
    const hidden = (): void => void (document.visibilityState === 'hidden' && away())
    box.addEventListener('scroll', scrolled, { passive: true })
    box.addEventListener('pointermove', act, { passive: true })
    box.addEventListener('pointerdown', act)
    window.addEventListener('keydown', act)
    window.addEventListener('blur', away)
    window.addEventListener('pagehide', away)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      away()
      watch.disconnect()
      box.removeEventListener('scroll', scrolled)
      box.removeEventListener('pointermove', act)
      box.removeEventListener('pointerdown', act)
      window.removeEventListener('keydown', act)
      window.removeEventListener('blur', away)
      window.removeEventListener('pagehide', away)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [href, scroller, words])
}
