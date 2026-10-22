// “I have N minutes”, the playbook and Close the season. Runs with windows
// parked off screen.
//
//   npx electron-vite build --outDir out-minutes
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-minutes/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/minutes-playbook.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? `${process.env.QA_DATA}/minutes`
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 820 })
const { h, v } = c
const look = async (theme) => {
  await h.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
  await h.waitForTimeout(700)
}
const blur = () => h.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
const QUAD = { do: 0, plan: 1, handoff: 2, drop: 3 }
const shown = () => h.$$eval('[data-fits-list] [data-fit-row]', (rows) => rows.map((row) => ({ id: row.dataset.fitRow, quad: row.querySelector('[data-quad]')?.dataset.quad })))
const ask = async (words) => {
  await blur()
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type(words, { delay: 30 })
  await h.waitForTimeout(700)
}
const stopSession = async () => { const now = await v('focus:now'); if (now) await v('session:cancel', now.id) }

try {
  await v('settings:set', { sounds: false })
  await stopSession()
  // Four short ones, one to a box of the Matrix, and one with no length.
  const today = new Date(); today.setHours(17, 0, 0, 0)
  const made = {}
  for (const [name, patch] of Object.entries({
    drop: { estimate: 3, important: 0 },
    handoff: { estimate: 2, important: 0, due: today.toISOString() },
    plan: { estimate: 5, important: 1 },
    do: { estimate: 4, important: 1, due: today.toISOString() },
    long: { estimate: 45, important: 1 },
    bare: { estimate: null, important: 1 }
  })) {
    const one = await v('task:add', `Fits probe ${name}`)
    await v('task:save', one.id, { ...patch, due: patch.due ?? null, plan: null })
    made[name] = one.id
  }
  const tasks = await v('tasks')
  const doable = tasks.filter((t) => t.status === 'open' && !t.waitingOn && !t.recurrence)

  // --- ⌘K: the action, then its choices.
  await c.go('today')
  await ask('i have 15 minutes')
  const actionRow = await h.$$eval('[data-search-at], button', (rows) => rows.map((one) => one.textContent).filter((t) => t?.startsWith('I have 15 minutes')))
  check('⌘K offers “I have 15 minutes”', actionRow.length > 0, actionRow[0])
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  await ask('i have 15 min')
  await h.keyboard.press('Enter'); await h.waitForTimeout(800)
  check('typed “i have 15 min” opens the list straight away', !!(await h.$('[data-fits]')))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // Picked from the choices: 5 minutes.
  await ask('I have 15 minutes… tasks')
  await h.keyboard.press('Enter'); await h.waitForTimeout(500)
  const choices = await h.$$eval('[data-choice-at], [data-choice-at] ~ button, button', (rows) => rows.map((one) => one.textContent).filter((t) => /^\d+ minutes/.test(t ?? '')))
  check('its choices are 5, 10, 15, 30 and 60', ['5', '10', '15', '30', '60'].every((n) => choices.some((t) => t.startsWith(`${n} minutes`))), choices.join(' | '))
  await h.keyboard.type('5 min'); await h.waitForTimeout(300)
  await h.keyboard.press('Enter'); await h.waitForTimeout(900)
  check('choosing 5 opens the list', !!(await h.$('[data-fits]')))
  let rows = await shown()
  const expected = doable.filter((t) => t.estimate !== null && t.estimate <= 5).map((t) => t.id).sort()
  check('only tasks of 5 minutes or less are listed', JSON.stringify(rows.map((r) => r.id).sort()) === JSON.stringify(expected), `${rows.length} shown, ${expected.length} fit`)
  check('in the Matrix order', rows.every((r, i) => !i || QUAD[rows[i - 1].quad] <= QUAD[r.quad]), rows.map((r) => r.quad).join(','))
  const mine = rows.filter((r) => Object.values(made).includes(r.id)).map((r) => Object.keys(made).find((k) => made[k] === r.id))
  check('urgent and important first, then plan, hand off, drop', mine.join(',') === 'do,plan,handoff,drop', mine.join(','))
  check('the 45 minute one is left out', !rows.some((r) => r.id === made.long))
  check('one with no length waits under “No length yet”', !!(await h.$(`[data-fits-unsized] [data-fit-row="${made.bare}"]`)))
  check('each row says its length', (await h.$$eval('[data-fits-list] [data-fit-row]', (r) => r.every((one) => !!one.querySelector('[data-length-chip]')))))
  check('5 minutes is remembered', (await v('settings')).fitMinutes === 5)
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await h.screenshot({ path: `${SHOT}/fits-5-${theme}.png` })
  }
  await look('light')

  // Universal gestures: x picks, ⌘A picks all, Esc clears, right-click has the task's menu.
  await h.keyboard.press('x'); await h.waitForTimeout(200)
  check('x picks the row', (await h.$$('[data-fits] [data-picked]')).length === 1)
  await h.keyboard.press('Meta+a'); await h.waitForTimeout(200)
  check('⌘A picks every row', (await h.$$('[data-fits] [data-picked]')).length === (await h.$$('[data-fits] [data-fit-row]')).length)
  await h.keyboard.press('Escape'); await h.waitForTimeout(200)
  check('Esc clears the picks and leaves the list open', !(await h.$('[data-fits] [data-picked]')) && !!(await h.$('[data-fits]')))
  await h.click(`[data-fit-row="${made.drop}"]`, { button: 'right' }); await h.waitForTimeout(400)
  const menu = await h.$$eval('[role="menuitem"]', (items) => items.map((one) => one.textContent))
  check('right-click offers the task menu', menu.some((t) => t?.startsWith('Start a focus session')) && menu.some((t) => t?.startsWith('Mark it done')), menu.slice(0, 4).join(' | '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check('Esc closes the menu and the list stays', !(await h.$('[role="menu"]')) && !!(await h.$('[data-fits]')))

  // A length for the bare one: 3 is 15 minutes, which does not fit 5; 1 gives 5, and it moves up.
  const bareIndex = (await h.$$eval('[data-fit-row]', (r) => r.map((one) => one.dataset.fitRow))).indexOf(made.bare)
  await h.hover(`[data-fit-row="${made.bare}"]`); await h.waitForTimeout(200)
  check('the cursor reaches the row with no length', bareIndex >= 0 && !!(await h.$(`[data-fit-row="${made.bare}"][data-fit-at]`)))
  await h.keyboard.press('1'); await h.waitForTimeout(900)
  check('pressing 1 gives it 5 minutes', (await v('task', made.bare))?.estimate === 5)
  check('and it moves up into what fits', !!(await h.$(`[data-fits-list] [data-fit-row="${made.bare}"]`)))
  await v('task:save', made.bare, { estimate: null })
  await h.waitForTimeout(600)

  // Picking one starts a focus session as long as its estimate.
  await h.hover(`[data-fit-row="${made.do}"]`); await h.waitForTimeout(200)
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const session = await v('focus:now')
  check('Enter starts a focus session on it', session?.taskId === made.do, session?.taskId)
  check('as long as its estimate, 4 minutes', session?.plannedMs === 4 * 60_000, String(session?.plannedMs))
  check('and the list closes', !(await h.$('[data-fits]')))
  await stopSession()

  // Typed variants.
  for (const [words, n] of [['i have 20', 20], ['20 min', 20], ["I've got 45 minutes", 45]]) {
    await ask(words)
    const first = await h.$eval('[data-search-at]', (one) => one.textContent).catch(() => '')
    check(`“${words}” offers ${n} minutes first`, first.startsWith(`I have ${n} minutes`), first)
    await h.keyboard.press('Enter'); await h.waitForTimeout(800)
    const chip = await h.$eval('[data-fits]', (one) => one.dataset.fitsMinutes).catch(() => null)
    check(`and opens it for ${n}`, chip === String(n), String(chip))
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  await ask('20')
  const plain = await h.$eval('[data-search-at]', (one) => one.textContent).catch(() => '')
  check('a bare number is left to search', !plain.startsWith('I have 20'), plain)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // Empty: nothing fits in 1 minute.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:fits', { detail: 1 })))
  await h.waitForTimeout(800)
  const empty = await h.$eval('[data-fits-empty]', (one) => one.textContent).catch(() => '')
  const bare = (await h.$$('[data-fits-unsized] [data-fit-row]')).length
  check('empty: “Nothing fits in 1 min”', empty.startsWith('Nothing fits in 1 min'), empty)
  check('and says how many have no length yet', bare ? new RegExp(`${bare === 1 ? 'One task has' : `${bare} tasks have`} no length yet`).test(empty) : true, empty)
  await h.screenshot({ path: `${SHOT}/fits-empty-light.png` })
  await look('dark'); await h.screenshot({ path: `${SHOT}/fits-empty-dark.png` }); await look('light')
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // Today's header has it too, remembering the last length.
  await c.go('today')
  const button = await h.$eval('[data-fits-button]', (one) => one.textContent).catch(() => null)
  check('Today has “I have … min” in its header', !!button && /I have \d+ min/.test(button), String(button))
  await h.screenshot({ path: `${SHOT}/today-header-light.png`, clip: { x: 0, y: 0, width: 1100, height: 160 } })
  await h.click('[data-fits-button]'); await h.waitForTimeout(800)
  const opened = await h.$eval('[data-fits]', (one) => one.dataset.fitsMinutes).catch(() => null)
  check('and it opens at the last length asked for', opened === String((await v('settings')).fitMinutes), String(opened))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // --- The playbook: made once, pinned; the second open is the same one.
  const before = (await v('items', 'article')).length
  await ask('open my playbook')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1500)
  const first = (await v('settings')).playbook
  const articles = await v('items', 'article')
  const book = articles.find((one) => one.id === first)
  check('“Open my playbook” makes “How I work”', book?.title === 'How I work', book?.title)
  check('pinned', !!book?.pinnedAt || (await v('pins')).length >= 3, String(book?.pinnedAt))
  const body = JSON.stringify((await v('item', first))?.body ?? {})
  check('from the starter outline', ['Capture', 'Tasks', 'Reviews', 'Reading', 'What I have learned works'].every((one) => body.includes(one)))
  await h.screenshot({ path: `${SHOT}/playbook-light.png` })
  await look('dark'); await h.screenshot({ path: `${SHOT}/playbook-dark.png` }); await look('light')
  await ask('open my playbook')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  check('a second open opens the same one', (await v('settings')).playbook === first && (await v('items', 'article')).length === before + 1)

  // --- Close the season: only early in a quarter, skippable, remembered.
  await c.go('home')
  const sheet = async (when) => {
    await h.clock.setFixedTime(new Date(when).getTime())
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-week')))
    await h.waitForTimeout(900)
    return h.$eval('[data-close-season]', (one) => one.dataset.closeSeason).catch(() => null)
  }
  const shut = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(400) }
  check('mid-quarter, Close the week has no season part', (await sheet('2027-02-20T19:00:00')) === null)
  check('and offers the playbook instead', !!(await h.$('[data-playbook-link]')))
  await shut()
  check('the first weeks of a quarter, it does', (await sheet('2027-01-10T19:00:00')) === 'open')
  check('asking about October to December 2026', /October to December 2026/.test(await h.$eval('[data-close-season]', (one) => one.textContent)))
  check('with the playbook to edit in place', !!(await h.$('[data-season-playbook] .ProseMirror')))
  check('and the goals glanced at', !!(await h.$('[data-season-goals]')))
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await h.screenshot({ path: `${SHOT}/season-${theme}.png` })
  }
  await look('light')
  await h.click('[data-season-skip]'); await h.waitForTimeout(600)
  check('skipping folds it to a line', (await h.$eval('[data-close-season]', (one) => one.dataset.closeSeason).catch(() => null)) === 'skipped')
  check('and is remembered for the quarter', (await v('settings')).seasonClosed === '2027-Q1')
  await shut()
  check('so it is gone next time', (await sheet('2027-01-12T19:00:00')) === null)
  await shut()

  // Next quarter: answered and done; the line lands in the playbook.
  check('a new quarter brings it back', (await sheet('2027-04-04T19:00:00')) === 'open')
  await h.fill('[aria-label="What mattered most this season"]', 'Reading in the mornings')
  await h.click('[data-season-done]'); await h.waitForTimeout(1200)
  check('done folds it to a line', (await h.$eval('[data-close-season]', (one) => one.dataset.closeSeason).catch(() => null)) === 'done')
  const kept = JSON.stringify((await v('item', first))?.body ?? {})
  check('its line is kept in the playbook', kept.includes('January to March 2027: Reading in the mornings'))
  check('remembered as 2027-Q2', (await v('settings')).seasonClosed === '2027-Q2')
  await shut()

  // Closing the week with it open counts as done too.
  check('the quarter after, it is there again', (await sheet('2027-07-02T19:00:00')) === 'open')
  await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(1800)
  check('closing the week closes the season too', (await v('settings')).seasonClosed === '2027-Q3')
  await h.clock.setFixedTime(Date.now())

  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
} finally {
  await stopSession().catch(() => {})
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
