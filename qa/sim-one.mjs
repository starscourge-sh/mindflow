// The first sweep of "problems like the recent fixes": one word for one thing,
// no toast for what is already in front of you, undo that puts everything
// back, every list answering the Mac's gestures, nothing binned still showing,
// and Esc closing only the top thing. Each check is a person's move in the
// real app (sandbox), so a build from before the fixes counts what was missing.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sim-one.mjs
// SHOTS=<folder> saves the pictures.
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, page: box, go, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const text = (w = h) => w.evaluate(() => document.body.innerText)
const toast = (w = h) => w.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
const menu = (w = h) => w.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const shot = async (name, w = h) => SHOTS && (await w.screenshot({ path: `${SHOTS}/${name}.png` }))
const quietToasts = () => h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:untoast')))
const step = async (name, run) => {
  try { await run() } catch (error) { check(`${name}: ran`, false, String(error?.message ?? error).split('\n')[0].slice(0, 160)) }
  await h.keyboard.press('Escape').catch(() => {}); await wait(150)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })

  // --- Words -----------------------------------------------------------------
  await step('words', async () => {
    await go('today'); await wait(500)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:shortcuts'))); await wait(700)
    const sheet = await text()
    check('the shortcut sheet says B moves the task to the Bin, not “Let the task go”', /Move the task to the Bin/.test(sheet) && !/Let the task go/.test(sheet))
    await h.keyboard.press('Escape'); await wait(300)
    await go('today'); await wait(600)
    const today = await text()
    check('Today counts open tasks as “open”, never “to do”', !/\d+\s+to do\b/.test(today) && /\d+\s+open\b/.test(today), JSON.stringify((today.match(/\d+\s+(to do|open)\b/) ?? [''])[0]))
    await go('settings'); await wait(900)
    check('Settings no longer says “rot cards”', !/rot cards/i.test(await text()))
    await go('powers'); await wait(900)
    const powers = await text()
    check('What Haligtree can do says “Focus rounds” and quotes “Show me”', /Focus rounds/.test(powers) && !/Pomodoro/.test(powers) && /Press “Show me”/.test(powers))
  })

  await step('thoughts', async () => {
    const note = (await h.evaluate(() => window.api.captures.list())).find((one) => one.status === 'open')
    await send('capture', note.id); await wait(1500)
    await h.evaluate(() => [...document.querySelectorAll('button[aria-label="Details"]')].find((b) => b.getBoundingClientRect().width > 0)?.click()); await wait(900)
    const open = await text()
    check('a note\'s dated thoughts are “Thoughts on this note”, not “Glosses”', /Thoughts on this note/.test(open) && !/Glosses/.test(open))
    await shot('note-thoughts')
    await h.evaluate(() => [...document.querySelectorAll('button[aria-label="Details"]')].find((b) => b.getBoundingClientRect().width > 0)?.click()); await wait(400)
  })

  // --- Toasts for what is already there ---------------------------------------
  await step('safe mode', async () => {
    await go('settings'); await wait(900)
    await h.locator('input[placeholder="Search…"]').first().fill('safe mode'); await wait(600)
    await quietToasts()
    const safe = h.getByRole('switch', { name: 'Safe mode' }).first()
    await safe.scrollIntoViewIfNeeded()
    const was = await safe.getAttribute('aria-checked')
    await safe.click(); await wait(500)
    const said = await toast()
    const now = await safe.getAttribute('aria-checked')
    check('the Safe mode switch moves with no toast repeating it', now !== was && !/Safe mode/.test(said), `“${said}”`)
    await h.evaluate(() => document.activeElement?.blur?.())
    await h.keyboard.press('Meta+z'); await wait(700)
    check('…and ⌘Z puts it back', (await safe.getAttribute('aria-checked')) === was)
    if ((await safe.getAttribute('aria-checked')) !== was) await safe.click()
  })

  await step('tag switch', async () => {
    const tags = await v('tags')
    const tag = tags[0].tag
    await send('tag', tag); await wait(1200)
    const manage = h.locator('button', { hasText: /^Manage$/ }).first()
    if (await manage.count()) { await manage.click(); await wait(800) }
    await quietToasts()
    const sw = h.locator('label:has-text("Tagged notes become tasks") [role=switch]').first()
    const was = await sw.getAttribute('aria-checked')
    await sw.click(); await wait(600)
    const said = await toast()
    check('a tag\'s “Tagged notes become tasks” switch says nothing more than itself', !/becomes a task|only a label/.test(said), `“${said}”`)
    await h.evaluate(() => document.activeElement?.blur?.())
    await h.keyboard.press('Meta+z'); await wait(700)
    check('…and ⌘Z flips it back', (await sw.getAttribute('aria-checked')) === was)
    // Manage's rows answer as every list does.
    const row = h.locator('[data-pick]').first()
    await row.click({ button: 'right' }); await wait(400)
    const lines = await menu()
    check('a tag\'s Manage rows right-click with the shared menu', lines.some((one) => /^Open/.test(one)) && lines.some((one) => /Select/.test(one)), lines.slice(0, 6).join(' / '))
    await h.keyboard.press('Escape'); await wait(200)
    await row.click({ modifiers: ['Shift'] }); await wait(300)
    check('…and ⇧-click picks one', (await h.locator('[data-pick][data-picked]').count()) === 1)
    await h.keyboard.press('Escape'); await wait(200)
    // The Stream view: the same menu and picking.
    await h.locator('button', { hasText: /^Read$/ }).first().click().catch(() => {}); await wait(900)
    await h.locator('button', { hasText: /^Stream$/ }).first().click().catch(() => {}); await wait(900)
    const stream = h.locator('article [data-pick]').first()
    if (await stream.count()) {
      await stream.click({ button: 'right', position: { x: 20, y: 10 } }); await wait(400)
      const streamLines = await menu()
      check('a tag\'s Stream entries right-click with a menu', streamLines.length > 2, streamLines.slice(0, 5).join(' / '))
      await h.keyboard.press('Escape'); await wait(200)
      await stream.click({ modifiers: ['Shift'], position: { x: 20, y: 10 } }); await wait(300)
      check('…and ⇧-click shows it picked', (await h.locator('article[data-picked]').count()) === 1)
      await h.keyboard.press('Escape'); await wait(200)
    } else check('a tag\'s Stream view shows entries', false, 'none found')
  })

  // --- Undo that puts everything back ------------------------------------------
  await step('theme undo', async () => {
    const themes = [
      { id: 'custom-sim-a', name: 'Sim A', vars: { bg: '#f4efe6', ink: '#2b2620', accent: '#8a4b2d' }, light: true },
      { id: 'custom-sim-b', name: 'Sim B', vars: { bg: '#1d2430', ink: '#e8e4dc', accent: '#c9a76a' }, light: false },
      { id: 'custom-sim-c', name: 'Sim C', vars: { bg: '#eef3ee', ink: '#1f2a22', accent: '#3c7a52' }, light: true }
    ]
    await h.evaluate((list) => { localStorage.setItem('custom-themes', JSON.stringify(list)); localStorage.setItem('theme', 'custom-sim-b') }, themes)
    await h.reload(); await wait(1600)
    await go('settings'); await wait(900)
    await quietToasts()
    const remove = h.locator('button[aria-label="Remove Sim B"]').first()
    await remove.scrollIntoViewIfNeeded()
    await remove.click(); await wait(500)
    const off = await h.evaluate(() => localStorage.getItem('theme'))
    await h.locator('[role=status][aria-live] button', { hasText: 'Undo' }).first().click(); await wait(700)
    const back = await h.evaluate(() => ({ theme: localStorage.getItem('theme'), order: JSON.parse(localStorage.getItem('custom-themes') ?? '[]').map((one) => one.id) }))
    check('removing the theme you wear, then Undo, puts it back in its place and on again', off !== 'custom-sim-b' && back.theme === 'custom-sim-b' && back.order.join() === 'custom-sim-a,custom-sim-b,custom-sim-c', JSON.stringify(back))
    await h.evaluate(() => { localStorage.removeItem('custom-themes'); localStorage.setItem('theme', 'paper') })
    await h.reload(); await wait(1600)
  })

  await step('fit undo', async () => {
    const fitted = [0.5, 1.4, 3.6, 9.2]
    await v('settings:set', { fsrsFirst: fitted })
    await go('settings'); await wait(900)
    await h.locator('input[placeholder="Search…"]').first().fill('fit to my memory'); await wait(600)
    await quietToasts()
    const defaults = h.locator('[data-fit] button', { hasText: 'Use the defaults' }).first()
    await defaults.scrollIntoViewIfNeeded()
    await defaults.click(); await wait(600)
    const said = await toast()
    await h.locator('[role=status][aria-live] button', { hasText: 'Undo' }).first().click({ timeout: 2000 }).catch(() => {})
    await wait(600)
    const back = (await v('settings')).fsrsFirst
    check('“Use the defaults” for review timings can be undone', /Undo/.test(said) && JSON.stringify(back) === JSON.stringify(fitted), `“${said}” → ${JSON.stringify(back)}`)
    await v('settings:set', { fsrsFirst: null })
  })

  await step('timer undo', async () => {
    await v('timer:start', 'Timer', 10 * 60_000); await wait(800)
    await go('today'); await wait(500)
    await quietToasts()
    await h.keyboard.press('Meta+k'); await wait(600)
    await h.keyboard.type('Stop the timer', { delay: 15 }); await wait(500)
    await h.keyboard.press('Enter'); await wait(900)
    const said = await toast()
    const stopped = !(await v('focus:now'))
    await h.locator('[role=status][aria-live] button', { hasText: 'Undo' }).first().click({ timeout: 2000 }).catch(() => {})
    await wait(900)
    const again = await v('focus:now')
    const left = again?.plannedMs ?? 0
    check('a timer stopped from ⌘K has Undo that starts it again with the time it had left', stopped && /Timer stopped/.test(said) && !!again && left > 8 * 60_000 && left <= 10 * 60_000, `“${said}”, ${Math.round(left / 1000)} s planned`)
    if (again) await v('session:abandon', again.id)
  })

  // --- Lists answer the Mac's gestures ------------------------------------------
  await step('quick capture tasks', async () => {
    await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(900)
    await box.evaluate(() => document.activeElement?.blur?.())
    await box.keyboard.press('Control+2'); await box.waitForTimeout(900)
    const rows = await box.locator('[data-row][data-id]').count()
    await box.locator('[data-row][data-id]').first().click({ modifiers: ['Shift'] }); await box.waitForTimeout(300)
    check('quick capture\'s Tasks tab: ⇧-click picks a task', (await box.locator('[data-row][data-picked]').count()) === 1, `${rows} rows`)
    await box.keyboard.press('Meta+a'); await box.waitForTimeout(400)
    const picked = await box.locator('[data-row][data-picked]').count()
    check('…⌘A picks every task on show, with a bar that counts them', picked === rows && /\d+ selected/.test(await text(box)), `${picked} of ${rows}`)
    await shot('box-tasks-picked', box)
    await box.keyboard.press('Escape'); await box.waitForTimeout(300)
    check('…and Esc lets them go, quick capture still open', (await box.locator('[data-row][data-picked]').count()) === 0)
    await box.keyboard.press('Escape'); await box.waitForTimeout(300)
  })

  await step('home next up', async () => {
    await go('home'); await wait(1200)
    const task = h.locator('[data-drag-open^="task:"]').first()
    if (!(await task.count())) return check('Home shows a Next up task', false)
    await task.click({ modifiers: ['Shift'] }); await wait(400)
    check('Home\'s Next up: ⇧-click picks a task instead of opening it', (await h.locator('[data-drag-open^="task:"][data-picked]').count()) >= 1 && !(await h.locator('[data-page="task"]').count()))
    await h.keyboard.press('Escape'); await wait(300)
  })

  await step('goal logs', async () => {
    const goal = (await v('items', 'goal'))[0]
    for (const words of ['Ran the first mile', 'Booked the course', 'Wrote the plan down']) await v('gloss', goal.id, words)
    await send('goal', goal.id); await wait(1400)
    const rows = h.locator('[data-line-id]')
    const before = await rows.count()
    await rows.nth(0).click({ modifiers: ['Shift'], position: { x: 8, y: 8 } }); await wait(200)
    await rows.nth(1).click({ modifiers: ['Shift'], position: { x: 8, y: 8 } }); await wait(300)
    const picked = await h.locator('[data-line-id][data-picked]').count()
    await shot('goal-logs-picked')
    await quietToasts()
    await h.keyboard.press('Backspace'); await wait(900)
    const said = await toast()
    const after = await rows.count()
    check('a goal\'s logs: ⇧-click two, ⌫ removes both with one notice', picked === 2 && after === before - 2 && /Removed 2 logs/.test(said), `${picked} picked, ${before} → ${after}, “${said}”`)
    await h.locator('[role=status][aria-live] button', { hasText: 'Undo' }).first().click({ timeout: 2000 }).catch(() => {})
    await wait(900)
    check('…and one Undo brings both back', (await rows.count()) === before)
  })

  await step('queue read', async () => {
    const gems = (await v('items', 'nugget')).filter((one) => !one.archivedAt).slice(0, 2)
    await v('queue:add', gems.map((one) => one.id), false)
    const q = await v('queue')
    for (const row of q.queue.slice(0, 2)) await v('queue:done', row.id)
    await go('queue'); await wait(1000)
    const row = h.locator('[data-read-row]').first()
    await row.click({ button: 'right', position: { x: 40, y: 10 } }); await wait(400)
    const lines = await menu()
    check('the Queue\'s Read rows right-click, with “Take out of Read”', lines.some((one) => /Take out of Read/.test(one)), lines.join(' / '))
    await h.keyboard.press('Escape'); await wait(200)
    await row.click({ modifiers: ['Meta'], position: { x: 40, y: 10 } }); await wait(300)
    check('…and ⌘-click picks one', (await h.locator('[data-read-row][data-picked]').count()) === 1)
    await h.keyboard.press('Escape'); await wait(200)
  })

  await step('day page', async () => {
    await go('day'); await wait(1300)
    await h.evaluate(() => document.activeElement?.blur?.())
    const rows = await h.locator('[data-page="day"] [data-pick]').count()
    if (!rows) return check('Today\'s page has rows to pick', false, 'none')
    await h.locator('[data-page="day"] [data-pick]').first().click({ modifiers: ['Shift'] }); await wait(300)
    check('Today\'s page: ⇧-click picks a row', (await h.locator('[data-page="day"] [data-pick][data-picked]').count()) >= 1, `${rows} rows`)
    await h.locator('[data-page="day"] [data-pick]').first().click({ button: 'right' }); await wait(400)
    const lines = await menu()
    check('…and its menu offers Select', lines.some((one) => /Select|Unselect/.test(one)), lines.slice(-4).join(' / '))
    await h.keyboard.press('Escape'); await wait(200)
    await h.keyboard.press('Escape'); await wait(200)
    check('…the column says “Resolved”, not “Dealt with”', !/Dealt with/.test(await text()))
  })

  // --- Something removed still shows ----------------------------------------------
  await step('pins', async () => {
    const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
    const one = caps[0]
    for (const pin of await v('pins')) await v('pin', pin.type === 'capture' ? 'captures' : 'nuggets', pin.id, false)
    await v('pin', 'captures', one.id, true)
    await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), one.id); await wait(400)
    const pins = await v('pins')
    check('a pinned capture moved to the Bin leaves the pins', !pins.some((pin) => pin.id === one.id), `${pins.length} pins`)
    const free = await v('pin', 'captures', caps[1].id, true) && await v('pin', 'captures', caps[2].id, true) && await v('pin', 'captures', caps[3].id, true)
    check('…and takes none of the three places', !!free)
    for (const id of [caps[1].id, caps[2].id, caps[3].id]) await v('pin', 'captures', id, false)
    await v('bin:restore', 'capture', one.id)
  })

  await step('queue binned', async () => {
    const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
    const one = caps[4]
    await v('queue:add', [one.id], true)
    await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), one.id); await wait(300)
    const q = await v('queue')
    check('the Queue leaves out a note moved to the Bin', !q.queue.some((row) => row.itemId === one.id))
    await v('bin:restore', 'capture', one.id)
    check('…and has it again once it is back', (await v('queue')).queue.some((row) => row.itemId === one.id))
  })

  await step('note window', async () => {
    const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
    const one = caps[5]
    await v('notes:window', 'capture', one.id, null, null)
    let w
    for (let i = 0; i < 50 && !w; i++) { w = electron.windows().find((one) => one.url().includes('note=')); if (!w) await wait(200) }
    await w.waitForLoadState('domcontentloaded'); await w.waitForTimeout(1200)
    await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), one.id)
    await w.waitForTimeout(1200)
    const gone = await w.evaluate(() => document.querySelector('[data-note-gone]')?.textContent ?? '')
    check('a note in its own window says it is in the Bin, with “Bring it back”', /in the Bin/.test(gone) && /Bring it back/.test(gone), gone.slice(0, 80))
    await shot('note-window-binned', w)
    await w.locator('[data-note-gone] button', { hasText: 'Bring it back' }).click(); await w.waitForTimeout(1200)
    check('…and “Bring it back” gives the note back', !(await w.locator('[data-note-gone]').count()))
    await w.close().catch(() => {})
  })

  if (c.errors.length) console.log('Errors:', c.errors.slice(0, 5).join('\n'))
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.filter((one) => /PAGEERROR/.test(one)).slice(0, 2).join(' | '))
} finally {
  console.log(`\n${results.filter(Boolean).length} of ${results.length} passed`)
  await c.close()
}
