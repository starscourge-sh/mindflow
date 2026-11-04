// A drawing in a window of its own: drawing.html.
import '../assets/main.css'
import 'slot-text/style.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { DrawingWindow } from '../components/excalidraw/drawing-window'
import { params, start } from '../main'

start(<DrawingWindow id={params.get('drawing') ?? ''} />)
