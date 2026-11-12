/**
 * Whether the desk steps away: every sticky note, the Today sticky, every
 * goal card and their tabs at the edge, out of sight while a call may be on
 * (or in quiet hours, where Settings says so) and back the moment it ends. What says a call may be on
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

/**
 * Why the desk would be away now: a meeting first; then quiet hours, but only where Settings' “Sticky notes and goal
 * cards step away too” is on (off to start: quiet hours by themselves leave the desk as it is); null when neither.
 */
export const awayWhy = (meeting: boolean, quiet: boolean, quietTakesDesk: boolean): 'meeting' | 'quiet' | null =>
  meeting ? 'meeting' : quiet && quietTakesDesk ? 'quiet' : null

/** The desk is away: there is a reason for it, and “Show anyway” was not asked for. */
export const deskAway = (why: 'meeting' | 'quiet' | null, shownAnyway: boolean): boolean => why !== null && !shownAnyway

/**
 * “Show anyway”, and a sticky stuck by hand, last only while what hid the rest stays the same: forgotten when it ends,
 * and when a call starts in quiet hours (asked for at night, they still hide for the call) or ends into them.
 */
export const anywayKept = (shownAnyway: boolean, was: 'meeting' | 'quiet' | null, now: 'meeting' | 'quiet' | null): boolean =>
  shownAnyway && now !== null && now === was

const SEEN: Record<Signal, string> = {
  recording: 'Haligtree is recording',
  camera: 'A camera is on',
  mic: 'Another app has the microphone',
  event: 'A meeting is on in Calendar',
  mirrored: 'The screen is mirrored'
}
/**
 * What it sees now, in plain words, for Settings: the surest signal named. Each is short enough for one line in the
 * narrowest window, so the row never grows or shrinks as a call starts and ends (qa/meeting-away.mjs measures it).
 */
export const seenSaid = (signals: Signals): string => SEEN[signalsOn(signals)[0]] ?? 'Nothing is on'

/**
 * What the row under “Quiet hours” says now, as short: whether it is quiet hours, and where the stickies and goal
 * cards are (`hidden`: off the desktop this moment, for quiet hours or a meeting).
 */
export const quietSaid = (quiet: boolean, takesDesk: boolean, hidden: boolean): string =>
  !quiet ? 'Outside quiet hours' : hidden ? 'In quiet hours, they are away' : takesDesk ? 'In quiet hours, shown anyway' : 'In quiet hours, they stay out'
