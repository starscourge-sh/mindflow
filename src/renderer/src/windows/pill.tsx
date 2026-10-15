// The session timer's bubble, and the glow round the screen when a session ends: pill.html.
import '../assets/main.css'
import 'slot-text/style.css'
import { FocusPill, ScreenGlow } from '../components/vigil/focus-pill'
import { params, start } from '../main'

start(params.get('view') === 'glow' ? <ScreenGlow /> : <FocusPill />)
