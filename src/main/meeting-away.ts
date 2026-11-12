/**
 * Whether the desk steps away: every sticky note, the Today sticky, every
 * goal card and their tabs at the edge, out of sight while a call may be on
 * (or in quiet hours) and back the moment it ends. What says a call may be on
 * is a signal, each an event from the Mac or the book (in-meeting.ts), never
 * looked up again and again.
 *
 * Pure, so the rule can be read and tested apart from any window.
 */
export const SIGNALS = ['recording', 'camera', 'mic', 'event', 'mirrored'] as const
/**
 * recording: Haligtree's own meeting recorder is running.
 * camera: a camera is in use, by any app.
 * mic: a microphone is in use by an app other than Haligtree.
 * event: a Calendar event with other people is happening now.
 * mirrored: the screen is mirrored to another (a projector, a television).
 */
export type Signal = (typeof SIGNALS)[number]
export type Signals = Record<Signal, boolean>
export const NO_SIGNALS: Signals = { recording: false, camera: false, mic: false, event: false, mirrored: false }

/** The signals on now, the surest first. */
export const signalsOn = (signals: Signals): Signal[] => SIGNALS.filter((one) => signals[one])

/** A meeting is on: any signal, while the setting (“Step away in meetings”) is on. */
export const inMeeting = (signals: Signals, setting: boolean): boolean => setting && signalsOn(signals).length > 0

/** Why the desk would be away now: a meeting first, then quiet hours; null when neither. */
export const awayWhy = (meeting: boolean, quiet: boolean): 'meeting' | 'quiet' | null => (meeting ? 'meeting' : quiet ? 'quiet' : null)

/** The desk is away: a meeting or quiet hours, unless “Show anyway” was asked for. */
export const deskAway = (meeting: boolean, quiet: boolean, shownAnyway: boolean): boolean => (meeting || quiet) && !shownAnyway

/** “Show anyway” lasts as long as what hid them: forgotten once the meeting and quiet hours are both over. */
export const anywayKept = (shownAnyway: boolean, meeting: boolean, quiet: boolean): boolean => shownAnyway && (meeting || quiet)

const SEEN: Record<Signal, string> = {
  recording: 'Haligtree is recording a meeting',
  camera: 'A camera is on',
  mic: 'Another app is using the microphone',
  event: 'A Calendar event with other people is on',
  mirrored: 'The screen is mirrored'
}
/**
 * What it sees now, in plain words, for Settings: the surest signal named,
 * and what that means for the stickies and goal cards.
 */
export function seenSaid(signals: Signals, setting: boolean, shownAnyway: boolean): string {
  const [first] = signalsOn(signals)
  if (!first) return 'Nothing is on'
  if (!setting) return `${SEEN[first]}: stickies and goal cards stay out`
  return `${SEEN[first]}: stickies and goal cards are ${shownAnyway ? 'shown anyway' : 'hidden'}`
}
