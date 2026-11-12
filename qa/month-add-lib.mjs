// Shared by the probes that add a task to a month's day (12 Nov): the "+" on a hovered day is gone, and the tall side
// panel with it. A double-click on a day's empty part puts a draft there and opens the popover tied to it (cal-add.tsx),
// its line holding the keys; ↵ makes the thing and the popover goes. A thing that exists opens in the same popover (a
// double-click on it, or ↵), and its own page is one step on from there: "Open" in the popover, in the side panel.

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

/** A task's page, opened from the month: a double-click on its line on its day opens the popover on it, and "Open" there is its page, in the side panel. `name` is the line's words. */
export async function openFromMonth(h, id, name) {
  const chip = h.locator('[data-month-plan] [data-plan-task]', { hasText: name }).first()
  await chip.scrollIntoViewIfNeeded()
  await chip.dblclick()
  await h.locator(`[data-cal-add][data-cal-open="${id}"] [data-cal-open-page]`).click({ timeout: 5000 })
  await h.locator(`[data-day-side="task"] [data-open="${id}"]`).waitFor({ timeout: 5000 })
  await h.waitForTimeout(400)
}

/**
 * The page of an event or a task on the Calendar (the side panel): a double-click on it opens its popover, and "Open"
 * there is its page. `thing` is a locator for its block, chip or line.
 */
export async function openPage(h, thing) {
  await thing.scrollIntoViewIfNeeded()
  await thing.dblclick()
  await h.locator('[data-cal-add][data-cal-open] [data-cal-open-page]').click({ timeout: 5000 })
  await h.locator('[data-day-side]').waitFor({ timeout: 5000 })
  await h.waitForTimeout(400)
}
