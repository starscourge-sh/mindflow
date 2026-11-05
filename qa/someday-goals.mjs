// Someday goals: a goal with no day, for the life list. Made from "New goal"
// with "No day: someday", it sits under "Someday" in Open with no countdown,
// no percent and no road; given a day and back with Undo; taken off its day
// from a dated goal and back with Undo; Made it crosses it off with a stamp.
// Home, the goals sticky and the menu bar never show NaN or "Invalid".
// Screenshots the list, the page and Made it, light and dark, beside a dated goal's page.
//   npx electron-vite build --outDir out-sd && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-sd/main/index.js HALIGTREE_QA_AWAY=1 node qa/someday-goals.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { electron, h, v, go, send, theme, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const bad = (text) => /NaN|Invalid|undefined/.test(text ?? '')
const listen = () => h.evaluate(() => ((window.qaToasts = []), addEventListener('haligtree:toast', (event) => window.qaToasts.push(event.detail))))
const lastToast = () => h.evaluate(() => window.qaToasts.at(-1)?.text ?? '')
const undoLast = () => h.evaluate(() => window.qaToasts.at(-1)?.undo?.())
const goal = async (id) => (await v('items', 'goal')).find((one) => one.id === id)
try {
  await v('settings:set', { stickiesGlass: false, sounds: false })
  // 1. Made from "New goal", no day.
  await go('goals')
  await wait(800)
  await h.locator('button', { hasText: 'New goal' }).first().click()
  await wait(400)
  await h.locator('[aria-label="The goal"]').fill('Visit Hobbiton')
  await h.locator('[role="dialog"]').getByRole('button', { name: 'No day: someday' }).click()
  await wait(300)
  check('the dialog says what Someday is', (await h.locator('[data-someday-said]').count()) === 1)
  await listen()
  await h.locator('[role="dialog"] button', { hasText: 'Set the goal' }).click()
  await wait(1200)
  const made = (await v('items', 'goal')).find((one) => one.title === 'Visit Hobbiton')
  check('a goal with no day is kept', !!made && made.goalAt === null, JSON.stringify(made))
  check('the toast says it is on the someday list', /someday list/.test(await lastToast()), await lastToast())
  // 2. In the list under Someday, after the dated ones, with no countdown.
  const list = await h.evaluate((id) => {
    const row = document.querySelector(`[data-row][data-id="${id}"]`)
    const rows = [...document.querySelectorAll('[data-row][data-id]')].map((one) => one.getAttribute('data-id'))
    return { text: row?.textContent ?? '', last: rows.at(-1) === id, page: document.body.innerText, someday: [...document.querySelectorAll('h2, h3, [data-section-head], div')].some((one) => one.childElementCount === 0 && one.textContent.trim() === 'Someday') }
  }, made.id)
  check('its row says when it was added and no steps yet', /Added \w+ \d{4}/.test(list.text) && list.text.includes('no steps logged yet'), list.text)
  check('its row has no countdown, percent or bar', !/days? left|of the way|%/.test(list.text), list.text)
  check('it sits under the “Someday” tab, which is picked', await h.evaluate(() => /^Someday/.test(document.querySelector('[data-list-tabs] button[aria-pressed="true"]')?.getAttribute('aria-label') ?? '')))
  // 3. Its page: no road, no days left.
  await send('goal', made.id)
  await wait(1200)
  const page = await h.evaluate(() => document.querySelector('[data-open]')?.innerText ?? '')
  check('its page has no road and no days left', !/The road|days left|of the way/.test(page) && (await h.locator('[data-open] [data-road-card]').count()) === 0 && (await h.locator('[data-open] [data-give-day]').count()) === 1, page.slice(0, 300))
  check('its page has no Missed and no On screen', !/\bMissed\b|Keep this goal on screen/.test(page))
  check('no NaN or Invalid on its page', !bad(page))
  for (const look of ['light', 'dark']) {
    await theme(look)
    await go('goals')
    await wait(900)
    await h.screenshot({ path: `${SHOTS}/someday-list-${look}.png` })
    await send('goal', made.id)
    await wait(1200)
    await h.screenshot({ path: `${SHOTS}/someday-page-${look}.png` })
    const dated = (await v('items', 'goal')).find((one) => !one.closedAt && one.goalAt)
    await send('goal', dated.id)
    await wait(1200)
    await h.screenshot({ path: `${SHOTS}/dated-page-${look}.png` })
  }
  await theme('light')
  // 4. Given a day, then Undo; a dated goal made someday, then Undo.
  await send('goal', made.id)
  await wait(1200)
  await listen()
  const ahead = new Date(Date.now() + 60 * 86_400_000).toLocaleDateString('en-CA')
  await v('goal:dates', made.id, { target: ahead })
  check('given a day, it counts down', (await goal(made.id)).goalAt === ahead)
  await v('goal:dates', made.id, { target: null })
  check('its day taken away, it is someday again', (await goal(made.id)).goalAt === null)
  const dated = (await v('items', 'goal')).find((one) => !one.closedAt && one.goalAt)
  await send('goal', dated.id)
  await wait(1200)
  await listen()
  await h.locator('[data-goal-no-day]').click()
  await wait(800)
  check('a dated goal loses its day from its page', (await goal(dated.id)).goalAt === null)
  check('the toast says No day now', /No day now/.test(await lastToast()), await lastToast())
  await undoLast()
  await wait(800)
  const back = await goal(dated.id)
  check('Undo gives it its day and start back', back.goalAt === dated.goalAt && back.goalFrom === dated.goalFrom, `${back.goalAt} ${back.goalFrom}`)
  await send('goal', made.id)
  await wait(1200)
  await listen()
  await h.locator('[data-give-day]').click()
  await wait(500)
  const suggest = h.locator('[data-slot="popover-content"] button', { hasText: 'in 3 months' })
  if (await suggest.count()) {
    await suggest.first().click()
    await wait(800)
    check('“Give it a day” gives it one', !!(await goal(made.id)).goalAt, JSON.stringify(await goal(made.id)))
    check('the toast says the countdown starts', /countdown starts/.test(await lastToast()), await lastToast())
    await undoLast()
    await wait(800)
    check('Undo makes it someday again', (await goal(made.id)).goalAt === null)
  } else check('the day picker offers “in 3 months”', false)
  await h.keyboard.press('Escape')
  // 5. Home and the sticky, with a someday goal there.
  await go('home')
  await wait(1200)
  const home = await h.evaluate(() => document.body.innerText)
  check('Home has no NaN or Invalid', !bad(home))
  check('Home\'s goal strip leaves the someday goal out', !(await h.locator(`[data-strip-goal="${made.id}"]`).count()))
  await go('goals')
  await wait(800)
  await h.locator('[data-all-goals-sticky]').click()
  let all = null
  for (let i = 0; i < 40 && !all; i++) (all = electron.windows().find((one) => !one.isClosed() && one.url().includes('type=goals&id=all')) ?? null, await wait(250))
  check('the goals sticky is up', !!all)
  if (all) {
    await all.waitForSelector('[data-goals-lane]', { timeout: 8000 })
    const text = await all.evaluate(() => document.body.innerText)
    check('the sticky has no NaN or Invalid', !bad(text), text.slice(0, 200))
    check('the sticky leaves the someday goal out', !text.includes('Visit Hobbiton'))
    await all.close()
  }
  // 6. “Cross it off”: crossed off, with the stamp.
  await send('goal', made.id)
  await wait(1200)
  await listen()
  await h.locator('[data-open] button', { hasText: /^Cross it off$/ }).last().click()
  await wait(1800)
  check('Made it closes it', (await goal(made.id)).closedHow === 'made it')
  check('the toast says crossed off', /Crossed off/.test(await lastToast()), await lastToast())
  await send('goal', made.id)
  await wait(1200)
  check('its page wears the Crossed off stamp', (await h.locator('[data-crossed-off]').count()) === 1)
  await h.screenshot({ path: `${SHOTS}/someday-made-light.png` })
  await theme('dark')
  await send('goal', made.id)
  await wait(1200)
  await h.screenshot({ path: `${SHOTS}/someday-made-dark.png` })
  const ended = await h.evaluate(() => document.body.innerText)
  check('the ended page says Crossed off, no NaN', /Crossed off/i.test(ended) && !bad(ended))
  await theme('light')
  check('no errors', !errors.length, errors.join('\n'))
  console.log(`shots in ${SHOTS}`)
} finally {
  await c.close()
}
done()
