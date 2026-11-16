// The main window: home.html.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { useEffect, type ReactNode } from 'react'
import { Home } from '../home'
import { start } from '../main'
import { useReadsIn } from '../lib/reads-in'

/**
 * Tells the main process once the first screen is whole, a frame after it is: only then is the window shown. The
 * sidebar and the page on show each keep themselves unseen until their reads are in (lib/reads-in.tsx); this is the
 * page they are parts of, so it is whole once every part is in (1.5 s at the latest, as any page). Told after React's
 * first render instead, main showed a shell, the bar and an empty page, and the sidebar and the page's words came a
 * second later in one jump (qa/start-time.mjs's frames, 16 Nov).
 */
function Drawn({ children }: { children: ReactNode }): ReactNode {
  // The pages on it only (the sidebar, the page on show): a part on no page never held the window.
  const { provide, style } = useReadsIn(false, false, { pages: true })
  const whole = !style
  // The page's own steps, beside main's (qa/start-time.mjs): its code read, its first render, its first screen whole.
  useEffect(() => void performance.mark('haligtree:render'), [])
  useEffect(() => {
    if (!whole) return
    performance.mark('haligtree:whole')
    let sent = false
    const send = (): void => void (sent || ((sent = true), window.api.homeDrawn()))
    // A hidden window may get no frames: a moment's wait stands in for one.
    requestAnimationFrame(send)
    setTimeout(send, 50)
  }, [whole])
  return provide(children)
}

performance.mark('haligtree:code')
start(<Drawn><Home /></Drawn>)
