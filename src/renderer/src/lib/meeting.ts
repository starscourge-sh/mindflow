import { call } from './haligtree'

/**
 * Record a meeting, from any way in (quick capture's mic, "/meeting", ⌘K, a Calendar event happening now, the menu
 * bar, ⌃⌥⌘M): main/meeting.ts brings up the live card. An event's name and people come with it, for the page and for
 * naming the voices.
 */
export const recordMeeting = (event?: { title: string; start?: string; end?: string; people?: string[] }): Promise<void> => call('meeting:start', event ?? null)

/** A line found by search in a note, waiting for that note's meeting page to open on it (meeting-page.tsx). */
let aimed: { line: string; until: number } | null = null
export function aimAt(_id: string, line: string | undefined): void {
  aimed = line ? { line: line.replace(/^…|…$/g, ''), until: Date.now() + 4000 } : null
  // A meeting page already open (in a pane kept behind another view) hears it too.
  if (aimed) window.dispatchEvent(new CustomEvent('haligtree:meeting-aim'))
}
/** The line asked for, while it is fresh: the meeting page that holds it takes it, once (`done`). */
export const aimNow = (): string | null => (aimed && Date.now() < aimed.until ? aimed.line : null)
export const aimTaken = (): void => void (aimed = null)

/** What ⌘K finds it by, besides its name. */
export const MEETING_WORDS = 'meeting call teams zoom google meet standup stand-up lecture seminar interview minutes transcript record both sides who said what'
