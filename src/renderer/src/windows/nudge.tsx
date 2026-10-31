// A nudge card: nudge.html.
import '../assets/main.css'
import 'slot-text/style.css'
import { NudgeCards } from '../components/haligtree/nudge-card'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'

start(<NudgeCards />)
// The room round and between the cards lets clicks through to the app behind.
clearRoom()
