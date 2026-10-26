/** Close the day's two questions, by the key each answer is kept under. */
export const QUESTIONS = { well: 'What went well today?', learned: 'What did you learn today?' } as const
export type Question = keyof typeof QUESTIONS

/**
 * What today's empty writing box asks, typed in one after another (the Day
 * page): each a question only today can answer, and one you could answer in
 * a line. Mornings look ahead, the middle of the day looks around, evenings
 * look back.
 */
export const DAY_QUESTIONS = {
  morning: [
    'What would make today a good day?',
    'What is the one thing you most want to get done?',
    'Who are you seeing today, and what do you hope comes of it?',
    'What are you avoiding, and why?',
    'What are you looking forward to?',
    'What is on your mind before the day starts?',
    'How did you sleep, and what did you dream?',
    'What small thing could you do for someone today?',
    'What worry can you put down for today?',
    'What would you try today if it could not go wrong?'
  ],
  midday: [
    'What has surprised you so far?',
    'Where has your mind gone when it wandered?',
    'What has felt harder than it should?',
    'What did you notice that nobody else did?',
    'What are you avoiding, and why?',
    'What would make the rest of today better?',
    'Who have you talked to, and what stayed with you?',
    'What is the best idea you have had today?'
  ],
  evening: [
    'What surprised you today?',
    'Who made today better?',
    'What did you notice that nobody else did?',
    'What made you laugh today?',
    'What did you get done that nobody saw?',
    'What would you tell this morning’s you?',
    'What is one thing from today you want to keep?',
    'What small thing went right?',
    'What is still unfinished, and does it matter?',
    'What did you read or hear that is worth keeping?',
    'What did you change your mind about?',
    'What are you grateful for tonight?'
  ]
} as const
/** Every one of them, whatever the hour. */
export const DAY_PROMPTS: readonly string[] = Object.values(DAY_QUESTIONS).flat()

/** Which list the hour asks from: before noon, until six, after. */
export const dayPart = (hour: number): keyof typeof DAY_QUESTIONS => (hour < 12 ? 'morning' : hour < 18 ? 'midday' : 'evening')

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
