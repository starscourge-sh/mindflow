// Checks the month calendar's two probes share (qa/calendar.mjs on Home,
// qa/calendar-page.mjs on the Calendar page): how strong the days of the
// month are against the others, the scroll from month to month, and a task
// carried from one month into the next.

/** Every theme the app ships (src/renderer/src/lib/theme.ts). */
export const THEMES = ['github', 'midnight', 'paper', 'dark', 'light', 'catppuccin', 'dracula', 'gruvbox', 'tokyonight', 'obsidian-nord', 'everforest', 'kanagawa', 'adwaita', 'rose-pine']

const pad = (n) => String(n).padStart(2, '0')
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const nextMonth = (key, by = 1) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + by, 1)) }

/**
 * Contrast of a day's number in the month and out of it, against its own
 * square, worked out by painting both colours on a canvas (so oklab and
 * color-mix come out as plain pixels), and the squares' own colours.
 */
export const inks = (h) => h.evaluate(() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const x = canvas.getContext('2d', { willReadFrequently: true })
  const paint = (...colours) => { x.clearRect(0, 0, 1, 1); for (const one of colours) (x.fillStyle = one, x.fillRect(0, 0, 1, 1)); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const lum = (rgb) => { const [r, g, b] = rgb.map((c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }
  const M = document.querySelector('[data-month-plan]')
  const page = getComputedStyle(document.body).backgroundColor
  const square = (cell) => paint(page, getComputedStyle(cell).backgroundColor)
  const number = (cell) => paint(page, getComputedStyle(cell).backgroundColor, getComputedStyle(cell.querySelector('[data-day-number]')).color)
  const inDay = M.querySelector('[data-day]:not([data-outside]):not([data-weekend]):not(:has([aria-current]))')
  const outDay = M.querySelector('[data-day][data-outside]:not([data-weekend])')
  const weekendDay = M.querySelector('[data-day][data-weekend]:not([data-outside]):not(:has([aria-current]))')
  const head = (which) => { const one = M.querySelector(`[data-month-weekday="${which}"]`); const bg = paint(page, getComputedStyle(one).backgroundColor); return ratio(paint(page, getComputedStyle(one).backgroundColor, getComputedStyle(one).color), bg) }
  const plain = square(inDay)
  return {
    inRatio: ratio(number(inDay), plain),
    outRatio: ratio(number(outDay), square(outDay)),
    weekendNumber: ratio(number(weekendDay), square(weekendDay)),
    outTint: ratio(square(outDay), plain),
    weekendTint: ratio(square(weekendDay), plain),
    headWeekday: head('weekday'),
    headWeekend: head('weekend')
  }
})

/** The lightness checks, for the theme on now. */
export const checkInks = async (h, check, theme) => {
  const got = await inks(h)
  const said = Object.entries(got).map(([k, n]) => `${k} ${n.toFixed(2)}`).join(', ')
  check(`${theme}: out-of-month numbers are lighter than in-month ones`, got.inRatio >= 4.5 && got.outRatio < got.inRatio * 0.6 && got.outRatio >= 1.5, said)
  check(`${theme}: weekends are not tinted like out-of-month days`, got.outTint < 1.01 && got.weekendTint < 1.08 && got.weekendNumber >= 4.5, said)
  check(`${theme}: weekend labels are a little quieter than weekday ones`, got.headWeekend < got.headWeekday && got.headWeekend >= 3, said)
}

/** The month the calendar shows, and whether its scroll rests with that month's first week at the top. */
export const where = (h) => h.evaluate(() => {
  const M = document.querySelector('[data-month-plan]')
  const box = M.querySelector('[data-month-scroll]')
  const rows = [...box.querySelectorAll('[data-month-week]')]
  const top = box.getBoundingClientRect().top
  const first = rows.find((one) => one.getBoundingClientRect().bottom > top + 2)
  const month = M.dataset.monthShown
  const firstOf = `${month}-01`
  const days = [...first.querySelectorAll('[data-day]')].map((one) => one.dataset.day)
  return { month, scrollTop: box.scrollTop, snapped: Math.abs(first.getBoundingClientRect().top - top) < 2 && days.includes(firstOf), top: days[0] }
})

/** A wheel over the calendar, then the settle. */
export const wheel = async (h, by, wait = 1300) => {
  const box = await h.locator('[data-month-plan] [data-month-scroll]').boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.mouse.wheel(0, by)
  await h.waitForTimeout(wait)
}

/** A task's chip carried from its day, the calendar scrolled on while it is held, and set down in the next month. */
export const dragAcross = async (h, title, target) => {
  const M = '[data-month-plan]'
  const chip = h.locator(`${M} [data-plan-task]`, { hasText: title }).first()
  await chip.scrollIntoViewIfNeeded()
  const from = await chip.boundingBox()
  await h.mouse.move(from.x + 10, from.y + 5); await h.mouse.down()
  await h.mouse.move(from.x + 30, from.y + 15, { steps: 4 }); await h.waitForTimeout(300)
  const scroller = await h.locator(`${M} [data-month-scroll]`).boundingBox()
  const cell = h.locator(`${M} [data-day="${target}"]`)
  for (let n = 0; n < 16; n++) {
    const box = await cell.boundingBox()
    // Kept out of the edges, where the box scrolls itself on while a task is held.
    if (box && box.y > scroller.y + scroller.height * 0.25 && box.y < scroller.y + scroller.height * 0.55) break
    await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2, { steps: 3 })
    await h.mouse.wheel(0, box && box.y < scroller.y + scroller.height * 0.25 ? -100 : 100); await h.waitForTimeout(350)
  }
  const to = await cell.boundingBox()
  await h.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 })
  await h.mouse.up(); await h.waitForTimeout(1000)
}
