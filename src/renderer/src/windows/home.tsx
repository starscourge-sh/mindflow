// The main window: home.html.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { useEffect, type ReactNode } from 'react'
import { Home } from '../home'
import { start } from '../main'

/**
 * Tells the main process once the page has drawn itself, a frame after its first render: only then is the window shown.
 */
function Drawn({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    // The page's own steps, beside main's (qa/start-time.mjs): its code read, then its first render.
    performance.mark('haligtree:render')
    let sent = false
    const send = (): void => void (sent || ((sent = true), window.api.homeDrawn()))
    // A hidden window may get no frames: a moment's wait stands in for one.
    requestAnimationFrame(send)
    setTimeout(send, 50)
  }, [])
  return children
}

performance.mark('haligtree:code')
start(<Drawn><Home /></Drawn>)
