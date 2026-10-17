// Ten bits of polish, each driven in the real app over the sandbox's made-up data:
// quick capture's menus short and lightly shadowed, a #tag moved out of a task's
// name, the task page's description hint, picture credits as captions (Today and
// the week), bookmark corners, Who and Where for a note, the session pill's
// place switched from its own menu (main process), Home's Inbox, month and days.
//
//   npx electron-vite build --outDir out-polish
//   QA_ARGS=--sandbox QA_ENTRY=out-polish/main/index.js MINDFLOW_QA_AWAY=1 node qa/polish-ten.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1200, height: 860 })
const { h, page, v, go, send, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const E = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
try {
  await v('settings:set', { hintRate: 0 })

  // 1. Quick capture: a taller small box, a short menu, the lighter shadow.
  const boxHeight = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.getBounds().height)
  check('1. the small box opens at least 280 tall', boxHeight >= 280, `${boxHeight}`)
  await page.click(E)
  await page.keyboard.type('a line to turn into something', { delay: 15 })
  await page.locator(`${E} > p`).first().hover()
  await page.waitForTimeout(300)
  await page.locator('.tiptap-drag-handle-grip').click()
  await page.waitForTimeout(600)
  const menu = await page.evaluate(() => { const m = document.querySelector('.tiptap-block-menu'); return m && { rem: parseFloat(getComputedStyle(document.documentElement).fontSize), h: m.getBoundingClientRect().height, shadow: getComputedStyle(m).boxShadow, text: m.textContent } })
  check('1. “Turn into” is capped at 13rem', menu && menu.text.includes('Turn into') && menu.h <= menu.rem * 13 + 0.5, `${menu?.h}px, 13rem is ${menu?.rem * 13}px`)
  check('1. and casts the lighter shadow', /0px 4px 12px -4px/.test(menu?.shadow ?? ''), menu?.shadow)
  await page.keyboard.press('Escape')

  // 5. A bookmark card: the frame rounds its own corners, the picture inside is square.
  const corners = await page.evaluate((sel) => {
    const ed = document.querySelector(sel)
    const card = document.createElement('a'); card.className = 'tiptap-bookmark'
    card.innerHTML = '<span class="tiptap-bookmark-frame"><img class="tiptap-bookmark-image" alt=""></span><span class="tiptap-bookmark-body">x</span>'
    ed.appendChild(card)
    const out = { frame: getComputedStyle(card.querySelector('.tiptap-bookmark-frame')).borderTopLeftRadius, image: getComputedStyle(card.querySelector('img')).borderTopLeftRadius }
    card.remove()
    return out
  }, E)
  check('5. bookmark frame is rounded to the card, its picture square inside', corners.frame !== '0px' && corners.image === '0px', JSON.stringify(corners))

  // 6. A plain note: the gear menu offers Who and Where, and both fields show.
  await page.click('button[aria-label="Actions"]')
  await page.waitForTimeout(500)
  const offer = page.locator('[role=menuitem]:has-text("Add who and where it’s from")')
  check('6. a note is offered “Add who and where it’s from”', await offer.count() === 1)
  if (await offer.count()) await offer.click()
  await page.waitForTimeout(600)
  check('6. and gets both a Who and a Where field', await page.locator('input[placeholder="Who"]').count() === 1 && await page.locator('[data-box-where]').count() === 1)
  await page.keyboard.press('Escape')

  // 2 and 3. A capture with a #tag becomes a task: the tag is a tag, not part of the name.
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'todo', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'buy stamps #errands' }] }] } }))
  const made = await v('toTask', id)
  const task = await v('task', made.id)
  check('2. the tag still rides with the task, so it routes', /#errands/.test(task.title), task.title)
  await send('task', made.id)
  await h.waitForTimeout(1500)
  const name = await h.locator(`[data-open="${made.id}"] textarea`).first().inputValue()
  check('2. the task page’s name has no #tag', name === 'buy stamps' || name === 'Buy stamps', name)
  check('2. the tag shows as a tag', (await h.locator(`[data-open="${made.id}"] [data-task-tags]`).innerText()).includes('#errands'))
  const hint = await h.locator(`[data-open="${made.id}"] [data-placeholder]`).first().getAttribute('data-placeholder').catch(() => '')
  check('3. a description hint sits under the title', /Add a description/.test(hint ?? ''), hint)
  await h.locator(`[data-open="${made.id}"] textarea`).first().fill('buy first-class stamps')
  await h.locator(`[data-open="${made.id}"] textarea`).first().blur()
  await h.waitForTimeout(500)
  check('2. renaming keeps the tag', (await v('task', made.id)).title === 'buy first-class stamps #errands', (await v('task', made.id)).title)

  // 4. Picture credits: on the page in Vigil's caption, never a system tooltip; the week has one.
  await v('settings:set', { scenery: true, sceneryToday: true })
  await go('day')
  // The pictures are read from their folder once Scenery is on: the credit comes with them, not in a set time.
  await h.waitForSelector('[data-picture-credit]', { timeout: 8000 }).catch(() => {})
  const today =await h.evaluate(() => [...document.querySelectorAll('[data-picture-credit]')].map((one) => ({ text: one.textContent, title: one.getAttribute('title'), italic: getComputedStyle(one).fontStyle })))
  check('4. Today’s picture credit is a caption, no tooltip', today.length > 0 && today.every((one) => !one.title && one.italic === 'italic'), JSON.stringify(today))
  await go('weekpage')
  await h.waitForTimeout(1500)
  const week = await h.locator('[data-picture-credit]').allInnerTexts()
  check('4. the week’s picture has a credit', week.length > 0, JSON.stringify(week))

  // 8 and 10. Home: the month, the Inbox said plainly, the days you came.
  await go('home')
  await h.waitForTimeout(1500)
  check('10. Home has a month calendar', await h.locator('[data-month-plan] [data-day]').count() >= 28)
  const before = await h.locator('[data-month-name]').innerText()
  await h.click('[data-month-next]')
  await h.waitForTimeout(300)
  const after = await h.locator('[data-month-name]').innerText()
  await h.click('[data-month-prev]')
  check('10. › steps to the next month and ‹ back', before !== after && (await h.locator('[data-month-name]').innerText()) === before, `${before} → ${after}`)
  check('10. the month shows planned tasks by name', await h.locator('[data-month-plan] [data-plan-task]').count() > 0)
  check('10. Home no longer has its own days heatmap', await h.locator('[data-days-heatmap]').count() === 0 && await h.locator('[data-home-days]').count() === 0)
  // The days you opened Vigil, as marks in the month: off by default, a switch above it, kept.
  const opens = new Map((await v('stats')).opens.map((one) => [one.day, one.n]))
  const marked = async () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-month-plan] [data-opened]')].map((one) => [one.getAttribute('data-day'), Number(one.getAttribute('data-opened'))])))
  const shown = async () => h.evaluate(() => [...document.querySelectorAll('[data-month-plan] [data-day]')].map((one) => one.getAttribute('data-day')))
  const expect = (days) => Object.fromEntries(days.filter((day) => opens.has(day)).map((day) => [day, opens.get(day) >= 4 ? 3 : opens.get(day) >= 2 ? 2 : 1]))
  check('10. the opened-days switch is off by default, no marks', (await v('settings')).monthOpened === false && Object.keys(await marked()).length === 0)
  // In the month's Show menu, ⋯ beside its arrows.
  await h.click('[data-month-plan] [data-month-show]'); await h.click('[data-month-opened-switch]'); await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  const now = await marked()
  check('10. switched on, the marks show on the opened days, by level', Object.keys(now).length > 0 && JSON.stringify(now) === JSON.stringify(expect(await shown())), `${Object.keys(now).length} marked`)
  const label = await h.locator(`[data-day="${Object.keys(now)[0]}"] button[aria-label^="Open"]`).first().getAttribute('aria-label')
  check('10. a marked day says “Opened Vigil” in its label', /Opened Vigil/.test(label ?? ''), label)
  const gap = await h.evaluate(() => { const day = document.querySelector('[data-month-plan] [data-opened]'); const a = day.querySelector('button').getBoundingClientRect(); const b = day.querySelector('[data-opened-mark]').getBoundingClientRect(); return b.left - a.right })
  check('10. the mark sits clear of the date circle', gap >= 4, `${gap}px`)
  await h.click('[data-month-prev]')
  await h.waitForTimeout(300)
  const past = await marked()
  check('10. ‹ shows last month’s marks', JSON.stringify(past) === JSON.stringify(expect(await shown())) && Object.keys(past).length > 0, `${Object.keys(past).length} marked`)
  await h.click('[data-month-next]')
  check('10. the switch is saved', (await v('settings')).monthOpened === true)
  await h.reload()
  await h.waitForTimeout(1500)
  check('10. and still on after a reload', Object.keys(await marked()).length > 0)
  if (process.env.SHOTS) for (const theme of ['light', 'paper', 'dark']) {
    await c.theme(theme)
    await h.locator('[data-month-plan]').screenshot({ path: `${process.env.SHOTS}/month-opened-${theme}.png` })
  }
  const inbox = await h.locator('[data-home-inbox]').innerText()
  const open = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt).length
  check('8. Home says how many wait in the Inbox', inbox.includes(String(open)), `${inbox.replace(/\n/g, ' ')} / ${open}`)
  await h.click('[data-open-inbox]')
  await h.waitForTimeout(900)
  check('8. “Open the Inbox” goes there', await h.evaluate(() => document.body.innerText.includes('Inbox')))

  // 9. The pill's menu (built in the main process): both places, as radio items.
  await electron.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate.bind(Menu)
    globalThis.__pillMenu = []
    Menu.buildFromTemplate = (template) => { globalThis.__pillMenu = template.map((one) => one.type === 'radio' ? `(radio) ${one.label}` : one.label).filter(Boolean); const m = build(template); m.popup = (o) => setTimeout(() => o?.callback?.(), 10); return m }
  })
  await h.evaluate(() => window.api.focusMenu(false))
  const labels = await electron.evaluate(() => globalThis.__pillMenu)
  check('9. the pill menu switches between under the notch and floating', labels.includes('(radio) Under the notch') && labels.includes('(radio) Where I put it'), JSON.stringify(labels))
} catch (error) {
  console.log('ERROR', error.message)
  results.push(false)
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5))
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
