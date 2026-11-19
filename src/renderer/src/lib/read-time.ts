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
    const seen = (): boolean => document.hasFocus() && document.visibilityState === 'visible' && box.offsetParent !== null
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
      // Its end in view: the last of its words above the reader's foot (an article shorter than the window, at once).
      const reached = box.scrollTop + box.clientHeight >= box.scrollHeight - 8
      if (reached && !end) return void ((end = true), tell())
      if (owed >= TELL_MS) tell()
    }
    // Away (another app, another tab, the window hidden): the time up to now counts, then nothing until it is back.
    const away = (): void => {
      upTo(performance.now())
      last = 0
      tell()
    }
    const hidden = (): void => void (document.visibilityState === 'hidden' && away())
    box.addEventListener('scroll', act, { passive: true })
    box.addEventListener('pointermove', act, { passive: true })
    box.addEventListener('pointerdown', act)
    window.addEventListener('keydown', act)
    window.addEventListener('blur', away)
    window.addEventListener('pagehide', away)
    document.addEventListener('visibilitychange', hidden)
    act()
    return () => {
      away()
      box.removeEventListener('scroll', act)
      box.removeEventListener('pointermove', act)
      box.removeEventListener('pointerdown', act)
      window.removeEventListener('keydown', act)
      window.removeEventListener('blur', away)
      window.removeEventListener('pagehide', away)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [href, scroller, words])
}
