// Shared by the probes that add a task to a month's day (12 Nov): the "+" on a hovered day is gone, and the tall side
// panel with it. A double-click on a day's empty part puts a draft there and opens the popover tied to it (cal-add.tsx),
// its line holding the keys; ↵ makes the thing and the popover goes. The thing's own page is then one step away: its
// chip on its day opens it in the side panel, as before.

/**
 * A double-click on an empty part of a month's day: the popover is up, on `kind` when one is asked for. The empty part
 * is looked for in the day's own padding (its corners and edges), where the day itself is under the pointer and not one
 * of its things, a notice passing over it or another day; with none in sight yet, it is looked for again.
 */
export async function startOnDay(h, cell, kind) {
  await cell.scrollIntoViewIfNeeded()
  await h.waitForTimeout(250)
  let spot = null
  for (let tries = 0; tries < 14 && !spot; tries++) {
    spot = await cell.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const points = [[r.right - 4, r.bottom - 4], [r.right - 4, r.top + r.height / 2], [r.right - 4, r.top + 4], [r.left + r.width / 2, r.bottom - 3], [r.left + 3, r.bottom - 4]]
      const hit = points.find(([x, y]) => document.elementFromPoint(x, y) === el)
      return hit ? { x: hit[0], y: hit[1] } : null
    })
    if (!spot) await h.waitForTimeout(500)
  }
  if (!spot) throw new Error('No empty part of the day is under the pointer to double-click')
  await h.mouse.move(spot.x, spot.y)
  await h.mouse.dblclick(spot.x, spot.y)
  await h.locator('[data-cal-add]').waitFor({ timeout: 5000 })
  if (kind && (await h.locator('[data-cal-add]').getAttribute('data-cal-add')) !== kind) await h.click(`[data-cal-add] [data-day-side-kind="${kind}"]`)
  await h.waitForTimeout(450)
}

/** A task's page, opened from the month by its chip on its day: the side panel holding it. `name` is the chip's words. */
export async function openFromMonth(h, id, name) {
  const chip = h.locator('[data-month-plan] [data-plan-task]', { hasText: name }).first()
  await chip.scrollIntoViewIfNeeded()
  await chip.click()
  await h.locator(`[data-day-side="task"] [data-open="${id}"]`).waitFor({ timeout: 5000 })
  await h.waitForTimeout(400)
}
