// The session timer's bubble, and the glow round the screen when a session ends: pill.html.
import '../assets/main.css'
import 'slot-text/style.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { FocusPill, ScreenGlow } from '../components/haligtree/focus-pill'
import { params, start } from '../main'
import { clearRoom } from '../lib/clear-room'

start(params.get('view') === 'glow' ? <ScreenGlow /> : <FocusPill />)
// The window is wider and taller than the pill: the room round it lets clicks through to the app behind.
if (params.get('view') !== 'glow') clearRoom()
