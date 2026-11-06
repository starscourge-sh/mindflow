import { call } from './haligtree'

/**
 * Record a meeting, from any way in (quick capture's mic, "/meeting", ⌘K, a Calendar event happening now, the menu
 * bar, ⌃⌥⌘M): main/meeting.ts brings up the live card. An event's name and people come with it, for the page and for
 * naming the voices.
 */
export const recordMeeting = (event?: { title: string; start?: string; end?: string; people?: string[] }): Promise<void> => call('meeting:start', event ?? null)

/** What ⌘K finds it by, besides its name. */
export const MEETING_WORDS = 'meeting call teams zoom google meet standup stand-up lecture seminar interview minutes transcript record both sides who said what'
