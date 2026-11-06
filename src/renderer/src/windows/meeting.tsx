// A meeting's live card: meeting.html.
import '../assets/main.css'
import { MeetingCard } from '../components/haligtree/meeting-card'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'

start(<MeetingCard />)
// The room round the card, for its shadow, lets clicks through to the call behind.
clearRoom()
