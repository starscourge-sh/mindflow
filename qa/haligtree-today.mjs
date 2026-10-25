// Today, tasks and date reading for the Haligtree list, on sandbox data:
//   4.  Today's List, Page and Matrix use one column width;
//   5.  dragging a task on Today's page leaves "The rest, once the first three
//       are done" where it is: it is its own line, never part of a row;
//   7.  linking a task as blocked by another says so, with Undo;
//   12. a task's menu gives every date line one "Date" submenu;
//   64. the carried-over question sits on its own line, its four answers in one row;
//   55. "this week" in the box is due by the end of this week, and a misspelt
//       "tomorow" is lit as a guess there and in Today's add field.
//
//   npx electron-vite build --outDir out-cal
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal/main/index.js HALIGTREE_QA_AWAY=1 node qa/haligtree-today.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1600, height: 1000 })
const { h, page, v, go, send, size } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.env.SHOTS
const shot = async (name, on = h) => SHOTS && on.screenshot({ path: `${SHOTS}/${name}.png` })
const rect = (sel) => h.evaluate((s) => {
  const all = [...document.querySelectorAll(s)].filter((el) => el.getBoundingClientRect().width > 0)
  if (!all.length) return null
  const boxes = all.map((el) => el.getBoundingClientRect())
  return { left: Math.round(Math.min(...boxes.map((b) => b.left))), right: Math.round(Math.max(...boxes.map((b) => b.right))) }
}, sel)
const chip = (label) => h.locator(`button[aria-pressed][aria-label="${label}"]`).first()
try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const ids = []
  for (const name of ['First probe line', 'Second probe line', 'Third probe line', 'Fourth probe line', 'Fifth probe line']) ids.push((await v('task:add', `${name} today`, undefined, true)).id)

  // 4. One width for the three views.
  await go('today'); await wait(1200)
  await chip('List').click().catch(() => {}); await wait(800)
  const list = await rect('form:has([data-task-input])')
  await shot('today-list')
  await chip('Page').click(); await wait(1200)
  const pageView = await rect('[data-day-list]')
  await shot('today-page')
  await chip('Matrix').click(); await wait(1200)
  const matrix = await rect('[data-matrix-list]')
  await shot('today-matrix')
  const near = (a, b) => !!a && !!b && Math.abs(a.left - b.left) <= 32 && Math.abs(a.right - b.right) <= 32
  check('4. Page uses the List\'s column', near(list, pageView), `list ${JSON.stringify(list)}, page ${JSON.stringify(pageView)}`)
  check('4. Matrix uses the List\'s column', near(list, matrix), `list ${JSON.stringify(list)}, matrix ${JSON.stringify(matrix)}`)

  // 5. The divider is its own line.
  await chip('Page').click(); await wait(1200)
  const own = await h.evaluate(() => { const line = document.querySelector('[data-top-three]'); return line ? !line.closest('[data-sortable-id]') : null })
  check('5. "The rest, once the first three are done" is not part of any row', own === true, String(own))
  const third = await h.evaluate(() => document.querySelector('[data-top-three]')?.previousElementSibling?.getAttribute('data-sortable-id') ?? null)
  if (third) {
    const row = h.locator(`[data-sortable-id="${third}"]`).first()
    const b = await row.boundingBox()
    const line0 = await h.locator('[data-top-three]').boundingBox()
    await h.mouse.move(b.x + 30, b.y + b.height / 2); await h.mouse.down()
    await h.mouse.move(b.x + 30, b.y + b.height / 2 + 12, { steps: 3 }); await h.mouse.move(b.x + 30, b.y + b.height / 2 + 70, { steps: 6 }); await wait(250)
    const carried = await h.evaluate(() => [...document.querySelectorAll('[data-dnd-overlay], [data-lifted], body > div')].filter((el) => getComputedStyle(el).position === 'fixed').some((el) => /The rest, once/.test(el.textContent ?? '')))
    const line1 = await h.locator('[data-top-three]').boundingBox()
    await shot('today-page-dragging')
    await h.mouse.up(); await wait(600)
    check('5. dragging the third task leaves the divider where it is', !carried && !!line1 && Math.abs(line1.y - line0.y) < 4, `carried ${carried}, line ${Math.round(line0.y)} → ${Math.round(line1?.y ?? -1)}`)
  } else check('5. the divider sits under the third task', false)

  // 12. One "Date" line in the task's menu.
  await chip('List').click(); await wait(1000)
  await h.locator(`[data-row][data-id="${ids[0]}"]`).first().click({ button: 'right' }); await wait(450)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  const dateLine = lines.find((one) => /^Date/.test(one))
  check('12. the menu has one "Date" line and no date lines of its own', !!dateLine && !lines.some((one) => /^(Do it today|Do it tomorrow|Pick a date|Later|Show again on|Do this first today)/.test(one)), lines.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Date/ }).first().hover(); await wait(500)
  const sub = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check('12. "Date" holds them all', ['Do this first today', 'Do it today', 'Do it tomorrow', 'Do it next week', 'Pick a date…', 'Someday', 'Show again on'].every((one) => sub.includes(one)), sub.replace(/\s+/g, ' '))
  await shot('today-menu-date')
  await h.keyboard.press('m'); await wait(800)
  const moved = await v('task', ids[0])
  check('12. M still moves it to tomorrow with the menu open', new Date(moved.dueAt).getDate() === new Date(Date.now() + 86400000).getDate(), moved.dueAt)
  await h.keyboard.press('Escape'); await wait(200)

  // 7. Blocked by another: said, with Undo.
  await send('task', ids[1]); await wait(1500)
  await h.locator('[data-blocked-input]').click()
  await h.keyboard.type('Third probe', { delay: 20 }); await wait(500)
  for (let i = 0; i < 8 && (await h.evaluate(() => document.querySelector('[data-blocked-option][data-selected="true"]')?.getAttribute('data-blocked-option'))) !== ids[2]; i++) await h.keyboard.press('ArrowDown')
  await h.keyboard.press('Enter'); await wait(1200)
  const notice = await h.evaluate(() => [...document.querySelectorAll('[role=status], [data-sonner-toast]')].map((one) => one.textContent).join(' | '))
  check('7. blocking a task says so, and where it is now', /Blocked by “Third probe line”\. (It stays on Today, marked Blocked|It moved off Today)/.test(notice) && /Undo/.test(notice), notice)
  await shot('task-blocked-notice')
  await h.locator('[data-sonner-toast] button:has-text("Undo"), [role=status] button:has-text("Undo")').first().click(); await wait(900)
  check('7. Undo takes the block back', !(await v('task', ids[1])).blockedBy)
  await h.keyboard.press('Escape'); await wait(300)

  // 64. The carried-over question, roomy at 900 wide.
  await v('task:save', ids[3], { rollovers: 6 })
  await size(900, 700); await go('today'); await wait(1200)
  await send("task", ids[3]); await wait(1800)
  const ask = await h.evaluate(() => {
    const box = document.querySelector('[data-task-ask="carried"]')
    if (!box) return null
    const question = box.querySelector('span')
    const buttons = [...box.querySelectorAll('button')]
    const q = question.getBoundingClientRect()
    return { question: question.textContent, below: buttons.every((one) => one.getBoundingClientRect().top >= q.bottom - 1), oneRow: new Set(buttons.map((one) => Math.round(one.getBoundingClientRect().top))).size === 1, labels: buttons.map((one) => one.textContent), wrapped: buttons.some((one) => one.scrollWidth > one.clientWidth + 1 || one.getBoundingClientRect().height > 40) }
  })
  check('64. the question is on its own line, short', ask?.question === 'Carried over 6 times. What now?' && ask.below, JSON.stringify(ask))
  check('64. its four answers sit in one even row, "Drop it" alone', ask?.oneRow && !ask.wrapped && JSON.stringify(ask.labels) === JSON.stringify(['Pick a date', 'Someday', 'Make it smaller', 'Drop it']), JSON.stringify(ask?.labels))
  if (SHOTS) await h.locator('[data-task-ask="carried"]').first().screenshot({ path: `${SHOTS}/task-carried-900.png` }).catch(() => {})
  await h.keyboard.press('Escape'); await wait(300)
  await size(1600, 1000)

  // 55. A guess, marked, in Today's add field.
  await go('today'); await wait(1000)
  await h.locator('[data-task-input]').first().click()
  await h.keyboard.type('Call the probe tomorow 3', { delay: 10 }); await wait(500)
  const guessChip = await h.locator('[data-task-chip="date"][data-guess]').first().getAttribute('title').catch(() => null)
  check('55. Today\'s add field marks "tomorow 3" as a guess and says why', !!guessChip && /tomorow/.test(guessChip), guessChip ?? 'no guess chip')
  await shot('today-add-guess')
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace')

  // 55. The box: "this week" is due by its end; "tomorow" is lit as a guess.
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(2500)
  const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  await page.click(EDITOR)
  await page.keyboard.type('Create 2 framer websites and deploy them this week', { delay: 5 }); await page.waitForTimeout(900)
  const week = await page.evaluate(() => [...document.querySelectorAll('[data-will-do] [data-will]')].map((one) => one.textContent).join(' | '))
  check('55. "this week" will be due this week, by its Sunday, never tomorrow', /Due this week, by Sun/.test(week) && !/tomorrow/i.test(week), week)
  await shot('box-this-week', page)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('Call the probe tomorow', { delay: 5 }); await page.waitForTimeout(900)
  const lit = await page.evaluate(() => ({ dashed: !!document.querySelector('.box-token[data-guess]'), said: document.querySelector('[data-will-guess]')?.textContent ?? null, outline: document.querySelector('.box-token[data-guess]') ? getComputedStyle(document.querySelector('.box-token[data-guess]')).outlineStyle : null }))
  check('55. the box lights "tomorow" with a dashed ring and says "a guess"', lit.dashed && lit.outline === 'dashed' && lit.said === 'a guess', JSON.stringify(lit))
  await shot('box-guess', page)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape').catch(() => {})
  if (SHOTS) {
    await c.theme('dark')
    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await size(w, hh); await go('today'); await wait(1000)
      await chip('Page').click().catch(() => {}); await wait(900)
      await shot(`today-dark-page-${w}`)
      await send('task', ids[3]); await wait(1500)
      await shot(`today-dark-task-${w}`)
      await h.keyboard.press('Escape'); await wait(300)
    }
  }
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} catch (error) {
  console.log('PROBE ERROR', error)
  results.push(false)
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
