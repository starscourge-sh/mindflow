// A nudge card: nudge.html.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { NudgeCards } from '../components/haligtree/nudge-card'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'

// A floating window: never dimmed when another has the focus (main.css, data-floating).
document.documentElement.dataset.floating = ''
start(<NudgeCards />)
// The room round and between the cards lets clicks through to the app behind.
clearRoom()
