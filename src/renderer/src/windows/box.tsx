// The box, quick capture: index.html. Each window's page loads only its own code (see main.tsx).
//
// Every entry here imports in the same order: the app's styles, then the
// window's own code, then the shell in main.tsx. That is the order the one
// page always read them in, so the styles still meet each other in their old
// order and the same rule wins as before.
import '../assets/main.css'
import 'slot-text/style.css'
import App from '../App'
import { start } from '../main'

start(<App />)
