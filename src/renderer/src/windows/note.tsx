// A note in a window of its own: note.html.
import '../assets/main.css'
import 'slot-text/style.css'
import { NoteWindow } from '../components/haligtree/note-window'
import { params, start } from '../main'

start(<NoteWindow link={params.get('note') ?? ''} />)
