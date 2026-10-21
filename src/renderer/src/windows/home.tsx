// The main window: home.html.
import '../assets/main.css'
import 'slot-text/style.css'
import { useEffect, type ReactNode } from 'react'
import { Home } from '../home'
import { start } from '../main'

/** Tells the main process once the page has drawn itself, a frame after its first render: only then is the window shown. */
function Drawn({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    let sent = false
    const send = (): void => void (sent || ((sent = true), window.api.homeDrawn()))
    // A hidden window may get no frames: a moment's wait stands in for one.
    requestAnimationFrame(send)
    setTimeout(send, 50)
  }, [])
  return children
}

start(<Drawn><Home /></Drawn>)
