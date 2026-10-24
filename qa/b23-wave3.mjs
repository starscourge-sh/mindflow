// The rest of the list (b23 wave 3), in the sandbox: the Calendar's panel
// switches sit on their own sides and "Go to today" from ⌘K brings the now
// line into sight; a calendar deleted keeps its events in another, and a
// double click on + makes one calendar; Page previews switch off; a tag's
// colour dot opens its picker; Check back in quick capture opens its calendar.
//
//   npx electron-vite build --outDir out-w3
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-w3/main/index.js HALIGTREE_QA_AWAY=1 node qa/b23-wave3.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1500, height: 900 })
const { h, page, v, go } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)

try {
  await v('settings:set', { safeMode: false, hintRate: 0, motion: false })
  await v('onboarding:set', { pageHints: false })

  // 5: each panel's switch on its own side.
  await go('calendar'); await wait(1200)
  if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await wait(500) }
  const sides = await h.evaluate(() => {
    const x = (sel) => document.querySelector(sel)?.getBoundingClientRect().left ?? -1
    return { left: x('[data-cal-left-toggle]'), title: x('[data-cal-jump]'), plan: x('[data-cal-side-toggle]'), mid: innerWidth / 2 }
  })
  check('5: the left panel\'s switch sits left of the title, "Plan" on the right', sides.left >= 0 && sides.left < sides.title && sides.plan > sides.mid, JSON.stringify(sides))
  const hadLeft = await h.locator('[data-cal-side]').count()
  await h.locator('[data-cal-left-toggle]').click(); await wait(400)
  check('5: the left switch folds the left panel', (await h.locator('[data-cal-side]').count()) !== hadLeft)
  if (!hadLeft) await h.locator('[data-cal-left-toggle]').click()
  else await h.locator('[data-cal-left-toggle]').click()
  await wait(400)

  // 6: "Go to today" from ⌘K scrolls the grid to the now line.
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 0))
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Go to today'); await wait(400)
  await h.keyboard.press('Enter'); await wait(1200)
  const near = await h.evaluate(() => {
    const now = document.querySelector('[data-cal-now]')?.getBoundingClientRect()
    const box = document.querySelector('[data-cal-scroll]')?.getBoundingClientRect()
    return now && box ? { now: Math.round(now.top), top: Math.round(box.top), bottom: Math.round(box.bottom) } : null
  })
  const hour = new Date().getHours()
  check('6: Go to today from ⌘K brings the now line into sight', !!near && near.now >= near.top && near.now <= near.bottom && (hour > 2 ? (await h.locator('[data-cal-scroll]').evaluate((el) => el.scrollTop)) > 0 : true), JSON.stringify(near))

  // 4: one calendar per double click; delete moves its events.
  const before = (await v('calendars')).length
  await h.locator('[data-cal-layer-add]').dblclick(); await wait(1200)
  await h.keyboard.press('Escape'); await wait(300)
  const after = await v('calendars')
  check('4: a double click on + makes one calendar', after.length === before + 1, `${before} → ${after.length}`)
  check('4: a line says what a calendar is for', (await h.locator('[data-cal-layers-about]').innerText()).includes('Right-click'))
  const made = after.find((one) => one.name === 'New calendar')
  const start = new Date(); start.setHours(15, 0, 0, 0)
  const ev = await v('event:add', { title: 'Wave3 moved event', start: start.toISOString(), end: new Date(start.getTime() + 3600e3).toISOString(), calendarId: made.id })
  await wait(600)
  await h.locator(`[data-cal-layer="${made.id}"]`).click({ button: 'right' }); await wait(400)
  await h.getByRole('menuitem', { name: /^Delete, its events go to/ }).click(); await wait(900)
  const left = await v('calendars')
  const moved = await v('event', ev.key)
  check('4: Delete takes the calendar away', !left.some((one) => one.id === made.id))
  check('4: …and its event moves to another calendar', !!moved && moved.calendarId !== made.id && left.some((one) => one.id === moved.calendarId), JSON.stringify(moved && moved.calendarId))
  check('4: the toast says where they went', (await h.evaluate(() => document.body.innerText)).includes('moved to'))

  // 1: Page previews off.
  await v('settings:set', { pagePreviews: false }); await wait(500)
  check('1: Page previews off marks the window', await h.evaluate(() => 'noPreviews' in document.documentElement.dataset))
  await v('settings:set', { pagePreviews: true }); await wait(500)
  check('1: and on again', await h.evaluate(() => !('noPreviews' in document.documentElement.dataset)))

  // Wave 2's leftover: a tag's colour dot opens its picker.
  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A line #wavetag' }] }] } }))
  await wait(800)
  await c.send('tag', 'wavetag'); await wait(1500)
  await h.mouse.move(5, 5); await wait(300)
  const dot = h.locator('main [data-tag-colour="wavetag"], [data-tag-colour="wavetag"]').first()
  if (await dot.count()) {
    const hit = await dot.evaluate((el) => { const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: r.width, h: r.height, hit: at?.outerHTML.slice(0, 120), inside: el.contains(at) } })
    check('the dot is what a click lands on', hit.inside, JSON.stringify(hit))
    await dot.click({ force: true }); await wait(500)
    const opened = (await h.locator('[data-tag-swatch]').count()) === 9
    if (!opened) {
      const where = await h.evaluate(() => [...document.querySelectorAll('[data-tag-colour]')].slice(0, 3).map((el) => (el.click(), el.closest('aside') ? 'sidebar' : el.closest('h1, h2, [data-collection-title]') ? 'title' : 'list')))
      await wait(500)
      console.log('synthetic click on', where, 'swatches', await h.locator('[data-tag-swatch]').count(), 'state', await h.evaluate(() => [...document.querySelectorAll('[data-tag-colour]')].map((el) => el.getAttribute('data-state')).join(',')))
    }
    check('a tag\'s colour dot opens its colour picker', opened)
    await h.keyboard.press('Escape'); await wait(300)
  } else check('a tag\'s colour dot is there', false, 'no [data-tag-colour]')

  // 23: Check back opens its calendar at once.
  await h.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(1200)
  await page.keyboard.press('Meta+6'); await page.waitForTimeout(800)
  const asked = await page.evaluate(() => ({ calendar: !!document.querySelector('[data-slot="popover-content"] [role="grid"], [data-slot="popover-content"] .rdp, [data-slot="popover-content"] table'), text: document.querySelector('[data-slot="popover-content"]')?.textContent?.slice(0, 400) ?? '' }))
  check('23: picking Check back opens its date picker straight away', asked.calendar || /in a week/i.test(asked.text), JSON.stringify(asked))
  check('23: with the common choices', /in 2 weeks/i.test(asked.text) && /in a year/i.test(asked.text), asked.text)
  // Its words and its month side by side, so it fits in the box it opens from (stacked, it ran past the box's foot).
  const fit = await page.evaluate(() => { const pop = document.querySelector('[data-slot="popover-content"]')?.getBoundingClientRect(); return pop ? { h: Math.round(pop.height), room: window.innerHeight, scrolls: document.querySelector('[data-slot="popover-content"]').scrollHeight > document.querySelector('[data-slot="popover-content"]').clientHeight + 2 } : null })
  await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/checkback-picker.png` })
  check('23: the picker fits in the box, nothing hidden below', fit && !fit.scrolls && fit.h < fit.room, JSON.stringify(fit))
  // Two tabs: the words first, the month a press away.
  const pop = page.locator('[data-slot="popover-content"]')
  check('23: "Say when" and "Pick a day" are tabs', (await pop.getByRole('button', { name: 'Say when' }).count()) === 1 && (await pop.getByRole('button', { name: 'Pick a day' }).count()) === 1)
  const tabAt = async () => Math.round((await pop.getByRole('button', { name: 'Pick a day' }).boundingBox()).y)
  const panes = async () => Math.round(await page.evaluate(() => document.querySelector('[data-when-panes]').getBoundingClientRect().height))
  const tabsBefore = [await tabAt(), await panes()]
  await pop.getByRole('button', { name: 'Pick a day' }).click(); await page.waitForTimeout(500)
  const tabsAfter = [await tabAt(), await panes()]
  check('23: the tabs stay put when switching', Math.abs(tabsBefore[0] - tabsAfter[0]) <= 1, `tab y ${tabsBefore[0]} -> ${tabsAfter[0]}, panes ${tabsBefore[1]} -> ${tabsAfter[1]}`)
  const month = await page.evaluate(() => ({ grid: !!document.querySelector('[data-slot="popover-content"] [role="grid"], [data-slot="popover-content"] table'), words: (() => { const one = document.querySelector('[data-slot="popover-content"] input[aria-label="When, in words"]'); return !!one && getComputedStyle(one).visibility !== 'hidden' })() }))
  await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/checkback-day-tab.png` })
  check('23: "Pick a day" shows the month in place of the words', month.grid && !month.words, JSON.stringify(month))
  // The row under the writing on one line: "Create more" never wraps, Create never cut off.
  const row = await page.evaluate(() => { const main = document.querySelector('main[data-zen-row]'); const create = [...main.querySelectorAll('button')].find((b) => /⌘↵/.test(b.textContent)); const more = [...main.querySelectorAll('label')].find((l) => /Create more/.test(l.textContent)); const day = main.querySelector('[data-zen-keep] button'); return { dayWidth: day ? Math.round(day.getBoundingClientRect().width) : null, createIn: create ? create.getBoundingClientRect().right <= main.getBoundingClientRect().right + 1 : null, moreLines: more ? Math.round(more.getBoundingClientRect().height) : null, width: Math.round(main.getBoundingClientRect().width) } })
  check('23: Create stays whole and "Create more" on one line, with Check back\'s date showing', row.createIn && row.moreLines < 30 && row.dayWidth >= 100, JSON.stringify(row))

  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
