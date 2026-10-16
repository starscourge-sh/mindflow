/** An in-app nudge: a small card over everything, with its own answers (a task due, the review, a session ended while away). */
export type Nudge =
  | { kind: 'task'; id: string; title: string; again: boolean }
  | { kind: 'review'; text: string; again: boolean }
  | { kind: 'away'; id: string; goal: string; endedAt: string; timer: boolean; breakOf: boolean; idle: boolean; /** Ended by the Mac's sleep (Settings): when it slept, and how it ended. */ sleptAt?: string; choice?: 'abandon' | 'finish' }
  /** A sticky just hidden from its own button: said once, with a way to bring it back. `id` is its key. */
  | { kind: 'sticky'; id: string; title: string }
