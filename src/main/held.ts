import type { DatabaseSync } from 'node:sqlite'

/**
 * Run each time the task list is read, for `today` ("2026-10-17", the local
 * day; given in, so a test can say which day it is):
 * - each day an open one-off task is left undone past its day is one carry
 *   over, counted once a day;
 * - a task held by a fresh start comes back by itself once a day after the
 *   fresh start comes that it is for, or must be ready by. Late ones stay
 *   held until opened.
 */
export function rollOver(db: DatabaseSync, today: string): void {
  db.prepare(`update tasks set rollovers = rollovers + 1, rolled_on = ?1 where status = 'open' and recurrence is null and held_at is null
      and due_at is not null and date(due_at, 'localtime') < ?1 and coalesce(rolled_on, '') < ?1`).run(today)
  db.prepare(`update tasks set held_at = null where held_at is not null and (
      (due_at is not null and date(due_at, 'localtime') <= ?1 and date(due_at, 'localtime') > date(held_at, 'localtime'))
      or (deadline_at is not null and date(deadline_at, 'localtime', '-' || coalesce(get_ready, 0) || ' days') <= ?1
        and date(deadline_at, 'localtime', '-' || coalesce(get_ready, 0) || ' days') > date(held_at, 'localtime')))`).run(today)
}
