/** Close the day's two questions, by the key each answer is kept under. */
export const QUESTIONS = { well: 'What went well today?', learned: 'What did you learn today?' } as const
export type Question = keyof typeof QUESTIONS
