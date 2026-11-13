// The desk's pills (brief K2a): every card folded is one line in one stack at the screen's right edge, read at a glance.
// Real pointer and clicks on the parked windows: a card's “–” folds it into its pill; the stack's order (Today, goals
// nearest first, notes most lately touched), gaps, inset and widths at 2 and 5 things; each pill's words true (a goal's
// days are its card's, Today's count is the tasks left and moves when one is ticked); a pointer resting on a pill opens
// its card out of it, beside the stack, the pill keeping its place; leaving folds it back; a sweep past opens nothing;
// a click pins it open and it stays; its “–” folds it again; the stickies left last time keep their state; after a
// relaunch every pill is still a pill and a pinned card still open. Frames every 50 ms of the opening and folding,
// written to QA_SHOTS when set.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/desk-pills.mjs
import { writeFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.QA_SHOTS
setTimeout(() => (console.log('desk-pills: out of time'), process.exit(1)), 6 * 60_000).unref()
const until = async (test, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true
  return test()
}

/** Every sticky window: its key, window, and its pill as its page draws it (null when it is a card). */
const desk = (electron) => electron.evaluate(async ({ BrowserWindow, screen }) => {
  const area = screen.getPrimaryDisplay().workArea
  const all = []
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || !/view=sticky/.test(w.webContents.getURL())) continue
    const q = new URLSearchParams(w.webContents.getURL().split('?')[1])
    const pill = await w.webContents.executeJavaScript(`(() => {
      const p = document.querySelector('[data-desk-pill]')
      if (!p) return null
      const r = p.getBoundingClientRect()
      return { state: p.dataset.deskPill, x: r.x, y: r.y, w: r.width, h: r.height, words: p.querySelector('[data-pill-words]')?.textContent ?? '', number: p.querySelector('[data-pill-number]')?.textContent ?? null, root: getComputedStyle(document.getElementById('root')).visibility }
    })()`).catch(() => null)
    const b = w.getBounds()
    all.push({ key: `${q.get('type')}:${q.get('id')}`, id: w.id, url: w.webContents.getURL(), visible: w.isVisible(), bounds: b, pill: pill && { ...pill, sx: b.x + pill.x, sy: b.y + pill.y } })
  }
  return { area, all }
})

let c = await sandbox()
const pageOf = (url) => c.electron.windows().find((p) => p.url() === url)
try {
  await wait(3000)
  // --- The stickies left last time (the seeded book's stickies.json, written before pills): kept as they were, open.
  let now = await desk(c.electron)
  const goal = now.all.find((one) => one.key.startsWith('goal:'))
  const today = now.all.find((one) => one.key === 'today:today')
  check('the old stickies.json: the goal card and Today come back open, as they were left', !!goal && !!today && !goal.pill && !today.pill, JSON.stringify(now.all.map((one) => [one.key, !!one.pill])))

  // --- Folded by their own “–”, with a real click.
  for (const one of [today, goal]) {
    const page = pageOf(one?.url)
    if (!page) continue
    await page.hover('[data-goal-card], .mf-card').catch(() => {})
    await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  }
  const pills = async () => (await desk(c.electron)).all.filter((one) => one.pill && one.visible)
  check('their “–” folds each into its pill', await until(async () => (await pills()).length === 2, 3000))
  await wait(600)
  now = await desk(c.electron)
  const stackNow = () => now.all.filter((one) => one.pill && one.visible).sort((a, b) => a.pill.sy - b.pill.sy)
  const right = now.area.x + now.area.width
  let top18 = now.area.y + Math.round(now.area.height * 0.18)
  let leftEdge = false
  const geometry = (label, stack, first = top18) => {
    const said = stack.map((one) => `${one.key.split(':')[0]} ${Math.round(one.pill.sx)},${Math.round(one.pill.sy)} ${Math.round(one.pill.w)}x${Math.round(one.pill.h)}`).join(' | ')
    check(`${label}: each pill is 28 tall`, stack.every((one) => Math.round(one.pill.h) === 28), said)
    check(`${label}: each 8 in from the ${leftEdge ? 'left' : 'right'} edge, all of it on the screen`, stack.every((one) => (leftEdge ? Math.round(one.pill.sx) === now.area.x + 8 : Math.round(one.pill.sx + one.pill.w) === right - 8)), said)
    check(`${label}: each 96 to 220 wide`, stack.every((one) => one.pill.w >= 95.5 && one.pill.w <= 220.5), said)
    check(`${label}: 6 apart, none over another`, stack.every((one, n) => !n || Math.round(one.pill.sy - (stack[n - 1].pill.sy + stack[n - 1].pill.h)) === 6), said)
    check(`${label}: the first where the stack stands (${first === top18 ? '18% down the screen' : 'where it was carried'})`, Math.abs(stack[0].pill.sy - first) <= 1, said)
    return said
  }
  let stack = stackNow()
  geometry('2 pills', stack)
  check('Today first, then the goal', stack[0]?.key === 'today:today' && stack[1]?.key.startsWith('goal:'), stack.map((one) => one.key).join(', '))

  // --- Words true: Today's count is its tasks left; a goal's days are its card's.
  const todayPage = pageOf(today.url)
  const left = await todayPage.evaluate(() => document.querySelectorAll('[data-task-tick][aria-checked="false"]').length)
  const total = await todayPage.evaluate(() => document.querySelectorAll('[data-task-tick]').length)
  const todayPill = stack.find((one) => one.key === 'today:today').pill
  check('Today\'s pill says the tasks left, as its card counts them', todayPill.words === 'Today' && todayPill.number === (!total ? 'Nothing due' : left ? `${left} left` : 'All done'), `${todayPill.words} / ${todayPill.number} (card: ${left} of ${total} open)`)
  const goalId = goal.key.slice(5)
  const days = await c.h.evaluate(async (id) => {
    const item = await window.api.haligtree('item', id)
    const noon = (day) => new Date(`${day}T12:00:00`)
    const d = new Date()
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { title: item?.title, left: Math.round((noon(item.goalAt) - noon(todayKey)) / 86_400_000) }
  }, goalId)
  const goalPill = stack.find((one) => one.key === goal.key).pill
  const daysSaid = days.left === 0 ? 'Today' : days.left > 0 ? `${days.left.toLocaleString('en-GB')} ${days.left === 1 ? 'day' : 'days'}` : `${-days.left} ${days.left === -1 ? 'day' : 'days'} past`
  check('the goal\'s pill says its days, the same as its card', goalPill.number === daysSaid, `${goalPill.words} / ${goalPill.number}; card: ${days.left} days`)
  check('the goal\'s pill starts with the goal\'s own first words, never cut mid-word', days.title.startsWith(goalPill.words.replace(/…$/, '')), `${goalPill.words} | ${days.title}`)
  // A task of Today's ticked in the main window, with a real click: Today's pill says what its card now counts.
  if (left > 0) {
    const name = await todayPage.evaluate(() => document.querySelector('[data-task-tick][aria-checked="false"]')?.getAttribute('aria-label'))
    await c.go('today')
    await c.h.locator('[data-task-row]', { hasText: name }).first().locator('[data-task-tick]').click({ timeout: 5000 }).catch(() => {})
    const after = left - 1
    const said = async () => (await desk(c.electron)).all.find((one) => one.key === 'today:today')?.pill?.number
    check('a task of Today\'s ticked in the main window: Today\'s pill counts one fewer, as its card does', await until(async () => (await said()) === (after ? `${after} left` : 'All done') && (await todayPage.evaluate(() => document.querySelectorAll('[data-task-tick][aria-checked="false"]').length)) === after, 5000), `${await said()} (${name})`)
  }

  // --- Pointing: a sweep past opens nothing; a rest opens the card out of its pill; leaving folds it back.
  const goalPage = pageOf(goal.url)
  const bounds = async () => (await desk(c.electron)).all.find((one) => one.key === goal.key)
  const isOpen = async () => (await bounds()).bounds.width > 260
  const isPill = async () => { const one = await bounds(); return one.bounds.width < 240 && one.pill?.state === 'folded' }
  const pillCentre = async () => { const one = (await bounds()).pill; return [one.x + one.w / 2, one.y + one.h / 2] }
  let [px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await wait(60)
  await goalPage.mouse.move(-40, -40)
  await wait(900)
  check('a sweep past the pill opens nothing', await isPill())
  const frames = []
  const film = async (label, ms) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const png = await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), goal.id)
      frames.push({ label, t: Date.now() - start, png })
      if (shots) writeFileSync(`${shots}/pill-${label}-${String(frames.at(-1).t).padStart(4, '0')}ms.png`, Buffer.from(png, 'base64'))
      await wait(Math.max(0, 50 - ((Date.now() - start) % 50)))
    }
  }
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await film('open', 700)
  check('a rest on the pill opens its card out of it', await until(isOpen, 1500))
  const opened = await bounds()
  check('opened, the pill stays drawn where it stood, lit', opened.pill?.state === 'open' && Math.round(opened.pill.sx + opened.pill.w) === right - 8, JSON.stringify(opened.pill))
  const cardRight = opened.bounds.x + await goalPage.evaluate(() => document.querySelector('[data-goal-card]').getBoundingClientRect().right)
  const widest = Math.max(...stack.map((one) => one.pill.w))
  check('opened, the card stands beside the stack, 8 clear of its widest pill', Math.abs(cardRight - (right - 8 - widest - 8)) <= 1, `card's right ${cardRight}, stack's inner edge ${right - 8 - widest}`)
  const others = (await desk(c.electron)).all.filter((one) => one.pill && one.key !== goal.key).map((one) => Math.round(one.pill.sy)).join()
  check('the other pills keep their places while it is open', others === stack.filter((one) => one.key !== goal.key).map((one) => Math.round(one.pill.sy)).join(), others)
  await goalPage.mouse.move(-40, -40)
  await film('fold', 1300)
  check('the pointer gone, it folds back into its pill', await until(isPill, 2500))
  // Turned back midway: out again while the pointer comes back before it has folded.
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  await goalPage.mouse.move(-40, -40)
  await wait(560)
  const at = (await bounds()).pill
  await goalPage.mouse.move(at.x + at.w / 2, at.y + at.h / 2)
  await film('turn-back', 600)
  await wait(900)
  check('back on it as it folds, it opens out again and stays', await isOpen())
  await goalPage.mouse.move(-40, -40)
  await until(isPill, 2500)

  // --- A click pins it open; it stays with the pointer gone; its “–” folds it back.
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  const p = (await bounds()).pill
  await goalPage.mouse.click(p.x + p.w / 2, p.y + p.h / 2)
  await wait(400)
  await goalPage.mouse.move(-40, -40)
  await wait(1500)
  const pinned = await bounds()
  check('a click pins it: the card stays open with the pointer gone, no pill', !pinned.pill && pinned.bounds.width > 260, JSON.stringify(pinned.bounds))
  await goalPage.hover('[data-goal-card]').catch(() => {})
  await goalPage.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('its “–” folds it back into its pill', await until(isPill, 2500))

  // --- 5 things: three notes stuck, each folded by its “–”; the newest note first among the notes.
  const made = []
  for (const title of ['Letters from the Arctic', 'Elizabeth and the garden at Belrive', 'A very long title that goes on and on past what any pill could ever hold in one line']) {
    const one = await c.h.evaluate((text) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), title)
    const id = typeof one === 'string' ? one : one?.id
    made.push(id)
    await c.h.evaluate((id) => window.api.stick('capture', id, true), id)
    await wait(1800)
    const card = (await desk(c.electron)).all.find((each) => each.key === `capture:${id}`)
    const page = card && pageOf(card.url)
    if (!page) continue
    await page.hover('.mf-card').catch(() => {})
    await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
    await until(async () => !!(await desk(c.electron)).all.find((each) => each.key === `capture:${id}`)?.pill, 3000)
  }
  await wait(800)
  now = await desk(c.electron)
  stack = stackNow()
  geometry('5 pills', stack)
  check('5 pills: Today, the goal, then the notes most lately touched first', stack.map((one) => one.key).join() === ['today:today', goal.key, ...made.slice().reverse().map((id) => `capture:${id}`)].join(), stack.map((one) => `${one.key.split(':')[0]}:${one.pill.words}`).join(' | '))
  const long = stack.find((one) => one.key === `capture:${made[2]}`)?.pill
  check('a long title ends at a whole word with "…", the pill 220 wide at most', !!long && /^A very long title( \w+)*…$/.test(long.words) && long.w <= 220.5, JSON.stringify(long))

  // --- The stack carried by a pill, with a real press and drag: down 120 on its edge, every pill with it, in order.
  {
    const first = stack[0]
    const page = pageOf(first.url)
    const [x, y] = [first.pill.x + first.pill.w / 2, first.pill.y + first.pill.h / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 3, y + 40, { steps: 3 })
    await page.mouse.move(x - 2, y + 120, { steps: 4 })
    await page.mouse.up()
    await wait(700)
    now = await desk(c.electron)
    const moved = stackNow()
    top18 = Math.round(stack[0].pill.sy + 120)
    check('carried by its first pill, the whole stack moves down 120, in the same order', moved.map((one) => one.key).join() === stack.map((one) => one.key).join() && moved.every((one, n) => Math.abs(one.pill.sy - (stack[n].pill.sy + 120)) <= 1), moved.map((one) => Math.round(one.pill.sy)).join())
    check('carried, nothing opened or pinned: still five pills', moved.length === 5 && moved.every((one) => one.pill.state === 'folded'), moved.map((one) => one.pill.state).join())
    geometry('carried', moved)
    top18 = moved[0] ? Math.round(moved[0].pill.sy) : top18
    stack = moved
  }

  // --- Looks: light and dark, in Satin, Paper and Brutal: every pill of the stack framed, for reading by eye.
  if (shots) {
    for (const theme of ['paper', 'dark']) for (const style of ['soft', 'paper', 'brutal']) {
      await c.h.evaluate(([t, s]) => {
        localStorage.setItem('theme', t)
        localStorage.setItem('style', s)
        for (const key of ['theme', 'style']) window.dispatchEvent(new StorageEvent('storage', { key }))
      }, [theme, style])
      await wait(900)
      for (const [n, one] of stackNow().entries()) {
        const png = await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), one.id)
        writeFileSync(`${shots}/look-${theme}-${style}-${n + 1}.png`, Buffer.from(png, 'base64'))
      }
    }
    await c.h.evaluate(() => {
      localStorage.setItem('theme', 'paper')
      localStorage.setItem('style', 'soft')
      for (const key of ['theme', 'style']) window.dispatchEvent(new StorageEvent('storage', { key }))
    })
  }

  // --- 12 things: six pills, the last saying how many more; the rest wait in it, listed by a click in the app's own menu.
  const stickNote = async (title) => {
    const one = await c.h.evaluate((text) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), title)
    const id = typeof one === 'string' ? one : one?.id
    await c.h.evaluate((id) => window.api.stick('capture', id, true), id)
    await until(async () => !!pageOf((await desk(c.electron)).all.find((each) => each.key === `capture:${id}`)?.url), 4000)
    const card = (await desk(c.electron)).all.find((each) => each.key === `capture:${id}`)
    const page = card && pageOf(card.url)
    await page?.waitForSelector('[aria-label="Fold it into its pill"]', { state: 'attached', timeout: 4000 }).catch(() => {})
    await page?.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click').catch(() => {})
    await until(async () => !!(await desk(c.electron)).all.find((each) => each.key === `capture:${id}`)?.pill, 3000)
    return id
  }
  for (const title of ['Walton\'s letters', 'The creature on the ice', 'Ingolstadt', 'Mont Blanc', 'Justine', 'Clerval in Oxford', 'The Orkneys']) made.push(await stickNote(title))
  await wait(1200)
  now = await desk(c.electron)
  stack = stackNow()
  geometry('12 things', stack)
  check('12 things: six pills show', stack.length === 6, stack.map((one) => one.pill.words).join(' | '))
  const last = stack[5]?.pill
  check('12 things: the last pill says "7 more"', last?.words === '7 more' && last?.state === 'more', JSON.stringify(last))
  if (stack[5]) {
    await pageOf(stack[5].url).click('[data-desk-pill="more"]')
    const menuOpen = await until(async () => !!(await c.electron.evaluate(() => globalThis.qaPopupMenu?.open)), 3000)
    const menuPage = c.electron.windows().find((one) => one.url().includes('view=menu'))
    const lines = menuOpen && menuPage ? await menuPage.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim())) : []
    check('a click on it lists the seven in the app\'s own menu', lines.length === 7 && lines.every((one) => one.startsWith('Open “')), lines.join(' | '))
    await menuPage?.keyboard.press('Escape').catch(() => {})
  }

  // --- Relaunch: the pills come back as pills, in the same order.
  const order = stack.map((one) => one.key).join()
  await c.close()
  c = await sandbox()
  await until(async () => ((now = await desk(c.electron)), stackNow().length === 6), 20_000)
  check('after a relaunch every pill is still a pill, in the same order', stackNow().map((one) => one.key).join() === order, stackNow().map((one) => one.key).join())
  check('and the stack stands where it was carried', Math.abs((stackNow()[0]?.pill.sy ?? 0) - top18) <= 1, `${stackNow()[0]?.pill.sy} vs ${top18}`)
} finally {
  await c.close().catch(() => {})
}
done()
