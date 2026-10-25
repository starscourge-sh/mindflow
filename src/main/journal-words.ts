/** Close the day's two questions, by the key each answer is kept under. */
export const QUESTIONS = { well: 'What went well today?', learned: 'What did you learn today?' } as const
export type Question = keyof typeof QUESTIONS

/**
 * What an empty day's writing box asks, one at a time, as it breathes (the
 * Day page): short and particular, each something only today can answer.
 */
export const DAY_PROMPTS = [
  'What surprised you today?',
  'What did you notice that you nearly missed?',
  'Who did you talk to, and what stayed with you?',
  'What is on your mind that you have not said out loud?',
  'What made you laugh today?',
  'What did you get done that nobody saw?',
  'What would you tell this morning’s you?',
  'What is one thing from today you want to keep?',
  'Where did your mind go when it wandered?',
  'What felt harder than it should have?',
  'What are you looking forward to?',
  'What did you read or hear that is worth keeping?',
  'What small thing went right?',
  'What is still unfinished, and does it matter?'
] as const

/**
 * The prompt for a day's `nth` breath: a step of five through the list each
 * day (five and fourteen share nothing), so a day's two differ, a day never
 * repeats the day before, and a reload asks the same.
 */
export function dayPrompt(day: string, nth: number): string {
  const days = Math.round(Date.parse(`${day}T12:00:00Z`) / 86_400_000)
  return DAY_PROMPTS[(((days * 5 + nth) % DAY_PROMPTS.length) + DAY_PROMPTS.length) % DAY_PROMPTS.length]
}
