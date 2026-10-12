import type { DatabaseSync } from 'node:sqlite'

/** When a task's time comes: its timed date, or else a timed "by", as "by 5pm". All-day ones never come. */
export const ALERT_AT = 'case when due_at is not null and all_day = 0 then due_at when deadline_timed = 1 then deadline_at end'

/**
 * The open tasks set to alert whose time has come and that have not alerted
 * yet: due in the last hour, or, after a hold (quiet hours, a shared screen,
 * safe mode), any time from an hour before the hold began. So an alert held
 * back is shown once it lifts, however long it lasted.
 */
export function dueAlerts(db: DatabaseSync, at: number, notify: string, heldSince: number | null): { id: string; title: string }[] {
  const from = Math.min(at, heldSince ?? at) - 3600000
  return db.prepare(
    `select id, title from tasks where status = 'open' and ${ALERT_AT} <= ? and ${ALERT_AT} > ? and notified_at is null and coalesce(notify, ?) = 'alerts'`
  ).all(new Date(at).toISOString(), new Date(from).toISOString(), notify) as { id: string; title: string }[]
}

/**
 * The second nudge: an alert shown and not answered (nor done, nor dismissed)
 * comes back once, ten minutes on, or when its “In 10 min” runs out.
 */
export function againAlerts(db: DatabaseSync, at: number, notify: string): { id: string; title: string }[] {
  return db.prepare(
    `select id, title from tasks where status = 'open' and alert_again_at is not null and alert_again_at <= ? and coalesce(notify, ?) = 'alerts'`
  ).all(new Date(at).toISOString(), notify) as { id: string; title: string }[]
}
