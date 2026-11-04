// A picture looked at up close: look.html.
import '../assets/main.css'
import 'slot-text/style.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { LookWindow } from '../components/haligtree/look-window'
import { start } from '../main'

start(<LookWindow />)
