// The box, quick capture: index.html. Each window's page loads only its own code (see main.tsx).
//
// Every entry here imports in the same order: the app's styles, then the
// window's own code, then the shell in main.tsx. That is the order the one
// page always read them in, so the app's own styles still come first and its
// code still runs before the shell's.
import '../assets/main.css'
import 'slot-text/style.css'
import App from '../App'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'

start(<App />)
// Quick capture is a card inside a larger see-through window (main's overhang): the page draws the card inside
// the room, its menus may hang past the card's edge into it, and clicks on the empty room pass to the app behind.
// A note's own window (the same page) has no room and is left as it is.
if (window.api.room.left) {
  document.documentElement.dataset.overhang = ''
  document.documentElement.style.setProperty('--mf-room', `${window.api.room.left}px`)
  document.documentElement.style.setProperty('--mf-room-top', `${window.api.room.top}px`)
  clearRoom()
  document.documentElement.style.setProperty('--mf-room-left', `${window.api.room.left}px`)
  document.documentElement.style.setProperty('--mf-room-right', `${window.api.room.right}px`)
  // The room round the card for a hint (above it, or beside it on the side with room), set by main while the box is
  // away: the card moves by as much in the same frame, so on screen it stays exactly where main put it, and main
  // shows the box once that is drawn.
  window.api.onRoomHint(({ top, left, right, side }) => {
    const root = document.documentElement
    root.style.setProperty('--mf-room-top', `${top}px`)
    root.style.setProperty('--mf-room-left', `${left}px`)
    root.style.setProperty('--mf-room-right', `${right}px`)
    if (side) root.dataset.hintSide = side
    else delete root.dataset.hintSide
    // What places itself by the card's place in the window (the toast lane in the footer, the hint) measures again:
    // the window's resize came before the card moved in it.
    window.dispatchEvent(new Event('resize'))
    requestAnimationFrame(() => requestAnimationFrame(() => window.api.roomDrawn()))
  })
}
