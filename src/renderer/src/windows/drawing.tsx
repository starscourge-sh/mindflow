// A drawing in a window of its own: drawing.html.
import '../assets/main.css'
import 'slot-text/style.css'
import { DrawingWindow } from '../components/excalidraw/drawing-window'
import { params, start } from '../main'

start(<DrawingWindow id={params.get('drawing') ?? ''} />)
