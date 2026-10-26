/** Close the day's two questions, by the key each answer is kept under. */
export const QUESTIONS = { well: 'What went well today?', learned: 'What did you learn today?' } as const
export type Question = keyof typeof QUESTIONS

/**
 * What today's empty page asks, typed in one after another (the Day page):
 * warm, open and short, framed by the time of day, and assuming nothing about
 * your day (no meetings, no tasks).
 */
export const DAY_QUESTIONS = {
  morning: [
    "What's on your mind this morning?",
    'How are you waking up today?',
    "What's sitting with you as the day starts?",
    'What would make today feel good?',
    "Anything you're carrying into today?",
    'What are you looking forward to?'
  ],
  midday: [
    "What's on your mind right now?",
    "How's the day going so far?",
    "What's taken your attention today?",
    'What would make the rest of today feel good?'
  ],
  evening: [
    "What's on your mind tonight?",
    'How was today, really?',
    'What stayed with you from today?',
    'Anything to put down before tomorrow?',
    'What made today yours?'
  ],
  late: [
    "What's keeping you up?",
    "What's still on your mind?",
    'Anything to set down before you sleep?'
  ]
} as const
/** Every one of them, whatever the hour. */
export const DAY_PROMPTS: readonly string[] = Object.values(DAY_QUESTIONS).flat()

/** Which list the hour asks from: before noon, until six, until eleven, then late at night (till five). */
export const dayPart = (hour: number): keyof typeof DAY_QUESTIONS => (hour < 5 || hour >= 23 ? 'late' : hour < 12 ? 'morning' : hour < 18 ? 'midday' : 'evening')

/**
 * The `nth` question for a day at an hour: a step of three through the hour's
 * list each day, so a day never opens on the day before's, and a reload asks
 * the same one first.
 */
export function dayPrompt(day: string, nth: number, hour = new Date().getHours()): string {
  const list = DAY_QUESTIONS[dayPart(hour)]
  const days = Math.round(Date.parse(`${day}T12:00:00Z`) / 86_400_000)
  return list[(((days * 3 + nth) % list.length) + list.length) % list.length]
}
