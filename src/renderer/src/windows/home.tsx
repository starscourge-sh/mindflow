// The main window: home.html.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { useEffect, type ReactNode } from 'react'
import { Home } from '../home'
import { start } from '../main'
import { REMADE } from '../lib/onboarding'

/**
 * Tells the main process once the page has drawn itself, a frame after its first render: only then is the window shown.
 * Made again for the welcome (lib/onboarding.ts REMADE), the welcome says so itself once it is up (welcome.tsx).
 */
function Drawn({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    if (REMADE) return
    let sent = false
    const send = (): void => void (sent || ((sent = true), window.api.homeDrawn()))
    // A hidden window may get no frames: a moment's wait stands in for one.
    requestAnimationFrame(send)
    setTimeout(send, 50)
  }, [])
  return children
}

start(<Drawn><Home /></Drawn>)
