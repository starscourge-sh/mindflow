// The desk's pills (briefs K2a, K2b): every card folded is one line in one stack at the screen's edge, read at a glance.
// Real pointer, clicks and menus on the parked windows. It checks:
// - a card's "–" folds it into its pill; the stack's order (Today, goals nearest first, notes most lately touched),
//   gaps, inset and widths at 1, 2, 5 and 12 things; past six, the last pill says how many more and lists them, and a
//   card chosen there opens and stays;
// - each pill's words true (a goal's days are its card's, Today's count is the tasks left and moves when one is ticked);
// - a pill's page loaded again is still a pill;
// - a rest on a pill grows its card out of it beside the stack, one motion that only comes in, the whole card on the
//   screen, the pill lit where it stood and the others still; leaving folds it back the way it came; a sweep past opens
//   nothing; caught as it folds it opens again;
// - a click on the pill, a press on the open card, or "Keep open" in its right-click menu pins it; the menu holds the
//   card's own lines and keeps the card out while it is open; its "–" folds it again;
// - a glass card stays solid while it is open out of its pill (the Mac's blur would show past the growing card), its
//   pill keeping its own frost, and wears its glass once pinned;
// - the stack carried down by a pill, and from the left edge to the right one, stays where it was put after a relaunch;
// - the stickies left last time keep their state; a relaunch keeps every pill;
// - the pill beside the session bubble and a notice: the same type, edge and fill (numbers, and frames with QA_SHOTS).
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/desk-pills.mjs
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
// The stickies left by a build before pills: the seeded book's stickies.json with any "pill" (and the "touched" that came
// with pills) a later build wrote taken out. The example book of 15 Nov 17:1x was seeded by a build with pills and left its
// goal card folded, so the first step read the seed's own choice, not a file written before pills.
const left = process.env.QA_DATA && join(process.env.QA_DATA, 'sandbox', 'stickies.json')
if (left && existsSync(left)) writeFileSync(left, JSON.stringify(JSON.parse(readFileSync(left, 'utf8')).map(({ pill, touched, ...one }) => one)))

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.QA_SHOTS
setTimeout(() => (console.log('desk-pills: out of time'), process.exit(1)), 9 * 60_000).unref()
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
/** #root's sideways offset, each frame for `ms`, in a sticky's page: how the card moves out of its pill and back. */
const sampleRoot = (page, ms) => page.evaluate((ms) => new Promise((resolve) => {
  const seen = []
  const at = performance.now()
  const tick = () => {
    const t = getComputedStyle(document.getElementById('root')).transform
    seen.push(t.startsWith('matrix') ? Math.round(Number(t.slice(7, -1).split(',')[4])) : 0)
    if (performance.now() - at < ms) requestAnimationFrame(tick)
    else resolve(seen)
  }
  tick()
}), ms)

let c = await sandbox()
const pageOf = (url) => c.electron.windows().find((p) => p.url() === url)
const menuPage = () => c.electron.windows().find((one) => one.url().includes('view=menu'))
const menuOpen = async () => !!(await c.electron.evaluate(() => globalThis.qaPopupMenu?.open))
const menuLines = async () => (await menuPage()?.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))) ?? []
try {
  await wait(3000)
  // --- The stickies left last time (the seeded book's stickies.json, written before pills): kept as they were, open.
  let now = await desk(c.electron)
  const goal = now.all.find((one) => one.key.startsWith('goal:'))
  const today = now.all.find((one) => one.key === 'today:today')
  check('the old stickies.json: the goal card and Today come back open, as they were left', !!goal && !!today && !goal.pill && !today.pill, JSON.stringify(now.all.map((one) => [one.key, !!one.pill])))
  const stackNow = () => now.all.filter((one) => one.pill && one.visible).sort((a, b) => a.pill.sy - b.pill.sy)
  const right = now.area.x + now.area.width
  let top18 = now.area.y + Math.round(now.area.height * 0.18)
  let leftEdge = false
  const geometry = (label, stack, first = top18) => {
    const said = stack.map((one) => `${one.key.split(':')[0]} ${Math.round(one.pill.sx)},${Math.round(one.pill.sy)} ${Math.round(one.pill.w)}x${Math.round(one.pill.h)}`).join(' | ')
    check(`${label}: each pill is 28 tall`, stack.length > 0 && stack.every((one) => Math.round(one.pill.h) === 28), said)
    check(`${label}: each 8 in from the ${leftEdge ? 'left' : 'right'} edge, all of it on the screen`, stack.length > 0 && stack.every((one) => (leftEdge ? Math.round(one.pill.sx) === now.area.x + 8 : Math.round(one.pill.sx + one.pill.w) === right - 8)), said)
    check(`${label}: each 96 to 220 wide`, stack.every((one) => one.pill.w >= 95.5 && one.pill.w <= 220.5), said)
    check(`${label}: 6 apart, none over another`, stack.every((one, n) => !n || Math.round(one.pill.sy - (stack[n - 1].pill.sy + stack[n - 1].pill.h)) === 6), said)
    check(`${label}: the first where the stack stands (${first === top18 ? 'where it begins or was put' : 'where it was carried'})`, Math.abs((stack[0]?.pill.sy ?? -99) - first) <= 1, said)
    return said
  }

  // --- Folded by their own “–”, with a real click: one pill, then two.
  const pills = async () => (await desk(c.electron)).all.filter((one) => one.pill && one.visible)
  const fold = async (one) => {
    const page = pageOf(one?.url)
    if (!page) return
    await page.hover('[data-goal-card], .mf-card').catch(() => {})
    await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  }
  // The goal card still stands open at the top right, in the stack's column: the one pill steps below it, never over its words.
  const goalBottom = goal.bounds.y + await pageOf(goal.url).evaluate(() => document.querySelector('[data-goal-card]').getBoundingClientRect().bottom)
  await fold(today)
  check('Today\'s “–” folds it into its pill', await until(async () => (await pills()).length === 1, 3000))
  await wait(500)
  now = await desk(c.electron)
  geometry('1 pill, below the open goal card standing in its column', stackNow(), Math.round(goalBottom + 6))
  await fold(goal)
  check('the goal\'s “–” folds it too: two pills', await until(async () => (await pills()).length === 2, 3000))
  await wait(600)
  now = await desk(c.electron)
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
  // Its page loaded again (a reload, a crash brought back): still a pill, asked of main as it starts.
  await todayPage.reload()
  check('a pill\'s page loaded again is still a pill', await until(async () => (await desk(c.electron)).all.find((one) => one.key === 'today:today')?.pill?.state === 'folded', 8000))

  // --- Pointing: a sweep past opens nothing; a rest grows the card out of its pill; leaving folds it back.
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
  const film = async (label, ms, id = goal.id) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const png = await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), id)
      frames.push({ label, t: Date.now() - start, png })
      if (shots) writeFileSync(`${shots}/pill-${label}-${String(frames.at(-1).t).padStart(4, '0')}ms.png`, Buffer.from(png, 'base64'))
      await wait(Math.max(0, 50 - ((Date.now() - start) % 50)))
    }
  }
  // Every other control on the desk holds still while one opens: the other pills' windows, read each step.
  const othersAt = async () => (await desk(c.electron)).all.filter((one) => one.key !== goal.key).map((one) => `${one.key}:${one.bounds.x},${one.bounds.y},${one.bounds.width},${one.bounds.height}`).join(' ')
  const before = await othersAt()
  ;[px, py] = await pillCentre()
  const opening = sampleRoot(goalPage, 1000)
  await goalPage.mouse.move(px, py)
  await film('open', 700)
  const outXs = (await opening).filter((x, n, all) => n === 0 || x !== all[n - 1])
  check('a rest on the pill opens its card out of it', await until(isOpen, 1500))
  const far = Math.max(...outXs.map(Math.abs))
  const fromFar = outXs.slice(outXs.findIndex((x) => Math.abs(x) === far)).map(Math.abs)
  check('it grows out from the pill, more than 20 from where it lands, and only comes in, landing at 0', far > 20 && fromFar.every((x, n) => !n || x <= fromFar[n - 1] + 0.5) && outXs.at(-1) === 0, outXs.join(','))
  check('nothing else on the desk moves while it opens', (await othersAt()) === before, before)
  const opened = await bounds()
  check('opened, the pill stays drawn where it stood, lit', opened.pill?.state === 'open' && Math.round(opened.pill.sx + opened.pill.w) === right - 8, JSON.stringify(opened.pill))
  const card = await goalPage.evaluate(() => { const r = document.querySelector('[data-goal-card]').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
  const cardRight = opened.bounds.x + card.right
  const widest = Math.max(...stack.map((one) => one.pill.w))
  check('opened, the card stands beside the stack, 8 clear of its widest pill', Math.abs(cardRight - (right - 8 - widest - 8)) <= 1, `card's right ${cardRight}, stack's inner edge ${right - 8 - widest}`)
  check('opened, the whole card is on the screen and is one thing: no pill drawn over it', opened.bounds.x + card.left >= now.area.x && opened.bounds.y + card.top >= now.area.y && opened.bounds.y + card.bottom <= now.area.y + now.area.height && opened.pill.sx >= cardRight, JSON.stringify(card))
  const folding = sampleRoot(goalPage, 1400)
  await goalPage.mouse.move(-40, -40)
  await film('fold', 1300)
  const backXs = (await folding).filter((x, n, all) => n === 0 || x !== all[n - 1])
  const most = Math.max(...backXs.map(Math.abs))
  const toMost = backXs.slice(0, backXs.findIndex((x) => Math.abs(x) === most) + 1).map(Math.abs)
  check('the pointer gone, it folds back into its pill', await until(isPill, 2500))
  check('folding, it goes back the way it came, only going out, before it is the pill again', most > 20 && toMost.every((x, n) => !n || x >= toMost[n - 1] - 0.5), backXs.join(','))
  // In Paper the card grows out of its pill with square corners. A clip is a shape no border-radius rule reaches, and
  // it grew with the pill's round ends in a style that has none (the user, 13 Nov: "im guessting other elements that
  // have their own windows have the same issues"). Every clip seen while it opens, read each frame.
  await goalPage.evaluate(() => { document.documentElement.dataset.style = 'paper' })
  const clipsSeen = goalPage.evaluate(() => new Promise((resolve) => {
    const seen = new Set()
    const t0 = performance.now()
    const step = () => {
      for (const el of document.querySelectorAll('[style*="clip-path"]')) if (el.style.clipPath) seen.add(el.style.clipPath)
      if (performance.now() - t0 < 1200) requestAnimationFrame(step)
      else resolve([...seen])
    }
    requestAnimationFrame(step)
  }))
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  const paperClips = await clipsSeen
  const rounded = paperClips.filter((one) => /round\s+(?!0px)[\d.]+px/.test(one))
  check('in Paper the card grows out of its pill square: no clip with round ends while it opens', paperClips.length > 0 && rounded.length === 0, JSON.stringify(paperClips.slice(0, 3)))
  await goalPage.mouse.move(-40, -40)
  await until(isPill, 2500)
  await goalPage.evaluate(() => { delete document.documentElement.dataset.style })
  // Turned back midway: out again while the pointer comes back before it has folded.
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  await goalPage.mouse.move(-40, -40)
  await wait(560)
  const at = (await bounds()).pill
  const turning = sampleRoot(goalPage, 900)
  await goalPage.mouse.move(at.x + at.w / 2, at.y + at.h / 2)
  await film('turn-back', 600)
  await wait(900)
  const turnXs = (await turning).filter((x, n, all) => n === 0 || x !== all[n - 1])
  check('back on it as it folds, it opens out again and stays', await isOpen())
  check('and turns round in one motion, landing at 0', turnXs.at(-1) === 0, turnXs.join(','))

  // --- A press on the open card pins it, and the press does what it does there.
  const cardBox = await goalPage.evaluate(() => { const r = document.querySelector('[data-goal-card] [data-goal-left], [data-goal-card]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
  await goalPage.mouse.move(cardBox[0], cardBox[1])
  await goalPage.mouse.down()
  await goalPage.mouse.up()
  await goalPage.mouse.move(-40, -40)
  await wait(1500)
  let pinned = await bounds()
  check('a press on the card it opened pins it: it stays with the pointer gone, no pill', !pinned.pill && pinned.bounds.width > 260, JSON.stringify(pinned.bounds))
  await goalPage.hover('[data-goal-card]').catch(() => {})
  await goalPage.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('its “–” folds it back into its pill', await until(isPill, 2500))

  // --- A click on the pill pins it.
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  const p = (await bounds()).pill
  await goalPage.mouse.click(p.x + p.w / 2, p.y + p.h / 2)
  await wait(400)
  await goalPage.mouse.move(-40, -40)
  await wait(1500)
  pinned = await bounds()
  check('a click on the pill pins it: the card stays open with the pointer gone, no pill', !pinned.pill && pinned.bounds.width > 260, JSON.stringify(pinned.bounds))
  await goalPage.hover('[data-goal-card]').catch(() => {})
  await goalPage.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('and its “–” folds it again', await until(isPill, 2500))

  // --- Its right-click menu: the card's own lines and "Keep open"; open, it keeps the card out; "Keep open" pins it.
  ;[px, py] = await pillCentre()
  await goalPage.mouse.click(px, py, { button: 'right' })
  check('a pill\'s right-click opens the card\'s own menu', await until(menuOpen, 3000))
  let lines = await menuLines()
  check('its lines: "Keep open", then the card\'s own ("Open in Haligtree", "Take it down")', lines[0] === 'Keep open' && lines.some((one) => one.startsWith('Open in')) && lines.some((one) => one.startsWith('Take it down')), lines.join(' | '))
  await menuPage()?.keyboard.press('Escape').catch(() => {})
  await until(async () => !(await menuOpen()), 2000)
  await goalPage.mouse.move(-40, -40)
  ;[px, py] = await pillCentre()
  await goalPage.mouse.move(px, py)
  await until(isOpen, 1500)
  const inCard = await goalPage.evaluate(() => { const r = document.querySelector('[data-goal-card]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
  await goalPage.mouse.click(inCard[0], inCard[1], { button: 'right' })
  await until(menuOpen, 3000)
  await goalPage.mouse.move(-40, -40)
  await wait(1200)
  check('with its menu open, the card stays out though the pointer has gone onto the menu', (await menuOpen()) && (await isOpen()))
  lines = await menuLines()
  if (lines.includes('Keep open')) await menuPage().getByRole('menuitem', { name: 'Keep open' }).click()
  await wait(1500)
  pinned = await bounds()
  check('"Keep open" pins it: the card stays open with the pointer gone, no pill', !pinned.pill && pinned.bounds.width > 260, `${lines.join(' | ')} ${JSON.stringify(pinned.bounds)}`)
  await goalPage.hover('[data-goal-card]').catch(() => {})
  await goalPage.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  await until(isPill, 2500)

  // --- 5 things: three notes stuck, each folded by its “–”; the newest note first among the notes.
  const made = []
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
  for (const title of ['Letters from the Arctic', 'Elizabeth and the garden at Belrive', 'A very long title that goes on and on past what any pill could ever hold in one line']) made.push(await stickNote(title))
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
    await until(menuOpen, 3000)
    lines = await menuLines()
    check('a click on it lists the seven in the app\'s own menu', lines.length === 7 && lines.every((one) => one.startsWith('Open “')), lines.join(' | '))
    // One chosen there opens, pinned, and the last pill counts one fewer.
    const chosen = lines[0]
    if (chosen) await menuPage().getByRole('menuitem', { name: chosen }).click()
    await wait(1500)
    now = await desk(c.electron)
    const name = chosen?.slice(6, -1)
    const opened = now.all.find((one) => one.visible && !one.pill && one.bounds.height > 100 && one.key.startsWith('capture:'))
    const lastNow = stackNow()[5]?.pill
    check('a card chosen from that list opens and stays, and the last pill says "6 more"', !!opened && lastNow?.words === '6 more', `${name}: ${JSON.stringify(opened?.bounds)} | ${lastNow?.words}`)
    stack = stackNow()
  }

  // --- Glass: the card stays solid while it is open out of its pill, and wears its glass once pinned.
  await c.v('settings:set', { stickiesFrosted: true, stickiesGlass: true })
  await until(async () => (await desk(c.electron)).all.some((one) => one.key === goal.key && /glass=1/.test(one.url) && one.pill), 8000)
  await wait(1500)
  {
    const glassGoal = (await desk(c.electron)).all.find((one) => one.key === goal.key && /glass=1/.test(one.url))
    const page = glassGoal && pageOf(glassGoal.url)
    const shapes = () => c.electron.evaluate((_, id) => (globalThis.haligtreeGlass?.() ?? []).find(([wid]) => wid === id)?.[1]?.shapes ?? null, glassGoal.id)
    if (page) {
      const one = glassGoal.pill
      const seen = []
      await page.mouse.move(one.x + one.w / 2, one.y + one.h / 2)
      for (let n = 0; n < 16; n++) {
        seen.push(JSON.stringify(await shapes()))
        if (shots) writeFileSync(`${shots}/glass-open-${String(n * 50).padStart(4, '0')}ms.png`, Buffer.from(await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), glassGoal.id), 'base64'))
        await wait(50)
      }
      const openNow = (await desk(c.electron)).all.find((each) => each.id === glassGoal.id)
      // The pill keeps its own frost beside it (qa/desk-pill-glass.mjs): a shape a pill's size, never the card's.
      check('a glass card open out of its pill: no glass under it while it grows or stands open (solid)', openNow.bounds.width > 260 && seen.every((s) => (JSON.parse(s) ?? []).every((shape) => shape[2] <= 230 && shape[3] <= 30)), [...new Set(seen)].join(' / '))
      await page.mouse.click(openNow.pill.x + openNow.pill.w / 2, openNow.pill.y + openNow.pill.h / 2)
      await page.mouse.move(-40, -40)
      check('pinned, it wears its glass again', await until(async () => ((await shapes()) ?? []).length > 0, 3000), JSON.stringify(await shapes()))
      if (shots) writeFileSync(`${shots}/glass-pinned.png`, Buffer.from(await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), glassGoal.id), 'base64'))
      await page.hover('[data-goal-card]').catch(() => {})
      await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
      await until(async () => !!(await desk(c.electron)).all.find((each) => each.id === glassGoal.id)?.pill, 3000)
    } else check('a glass goal card to open', false)
  }
  await c.v('settings:set', { stickiesFrosted: false, stickiesGlass: false })
  // Each card made again as paper: the glass window leaves once the paper one is in, so wait for one of each.
  await until(async () => { now = await desk(c.electron); const keys = now.all.filter((one) => one.visible).map((one) => one.key); return keys.length === new Set(keys).size && stackNow().length === 6 && now.all.every((one) => !/glass=1/.test(one.url)) }, 12_000)
  await wait(800)
  now = await desk(c.electron)
  stack = stackNow()

  // --- Relaunch: the pills come back as pills, in the same order, where the stack was carried.
  const order = stack.map((one) => one.key).join()
  const folder = await c.electron.evaluate(({ app }) => app.getPath('userData'))
  await c.close()
  c = await sandbox()
  await until(async () => ((now = await desk(c.electron)), stackNow().length === 6), 20_000)
  check('after a relaunch every pill is still a pill, in the same order', stackNow().map((one) => one.key).join() === order, `${stackNow().map((one) => one.key).join()} vs ${order}`)
  check('and the stack stands where it was carried', Math.abs((stackNow()[0]?.pill.sy ?? 0) - top18) <= 1, `${stackNow()[0]?.pill.sy} vs ${top18}`)

  // --- From the left edge to the right: a stack put on the left (as a carry there leaves it) stands there after a
  // launch, and is carried by a pill across to the right edge, where a relaunch keeps it. (The probe's pointer cannot
  // leave its window to the left, so the stack starts on the left and is carried right.)
  await c.close()
  writeFileSync(join(folder, 'desk-stack.json'), JSON.stringify({ side: 'left', top: top18 }))
  c = await sandbox()
  await until(async () => ((now = await desk(c.electron)), stackNow().length === 6), 20_000)
  leftEdge = true
  geometry('put on the left edge', stackNow())
  {
    const first = stackNow()[0]
    const page = first && pageOf(first.url)
    if (page) {
      const [x, y] = [first.pill.x + first.pill.w / 2, first.pill.y + first.pill.h / 2]
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 30, y, { steps: 2 })
      await page.mouse.move(x + 300, y + 60, { steps: 4 })
      await page.mouse.move(x + Math.round(now.area.width * 0.8), y + 60, { steps: 6 })
      await page.mouse.up()
      await wait(800)
      now = await desk(c.electron)
      const moved = stackNow()[0]
      const byPointer = (moved?.pill.sx ?? 0) > now.area.x + now.area.width / 2
      console.log(`(the real pointer carried the first pill to ${Math.round(moved?.pill.sx)},${Math.round(moved?.pill.sy)} from ${Math.round(first.pill.sx)},${Math.round(first.pill.sy)})`)
      check('the real pointer carried the stack across (a move past its window to the right reached it)', byPointer)
      // Not reached: the same carry the pointer makes, through the page's own calls (lib/carry.ts carryWindow: grab, carry, let go).
      if (!byPointer) {
        await page.evaluate(([dx]) => {
          const pill = document.querySelector('[data-desk-pill]').getBoundingClientRect()
          const at = { x: window.screenX + pill.left + pill.width / 2, y: window.screenY + pill.top + pill.height / 2 }
          window.api.grab(at.x, at.y)
          for (const step of [0.25, 0.5, 0.75, 1]) window.api.carry(at.x + dx * step, at.y)
          window.api.letGo()
        }, [Math.round(now.area.width * 0.8)])
        await wait(800)
      }
    }
  }
  now = await desk(c.electron)
  leftEdge = false
  check('carried across by a pill, the whole stack stands on the right edge, in the same order', stackNow().map((one) => one.key).join() === order, stackNow().map((one) => `${Math.round(one.pill.sx)},${Math.round(one.pill.sy)}`).join(' | '))
  top18 = Math.round(stackNow()[0]?.pill.sy ?? top18)
  geometry('carried to the right edge', stackNow())
  await c.close()
  c = await sandbox()
  await until(async () => ((now = await desk(c.electron)), stackNow().length === 6), 20_000)
  geometry('the right edge kept after a relaunch', stackNow())

  // --- Beside the session bubble and a notice: the same words' size, the same round ends, the same fill.
  {
    await c.v('settings:set', { focusShows: 'bubble', countIn: false })
    const made = await c.v('task:add', 'Write the essay plan')
    await c.v('session:start', made?.id ?? made, 'Write the essay plan', 25 * 60_000)
    await c.h.evaluate(() => window.api.showFocus(true))
    await wait(3500)
    const bubble = c.electron.windows().find((one) => one.url().includes('view=focus'))
    const pillPage = pageOf(stackNow()[1]?.url)
    const look = (page, pick) => page?.evaluate((pick) => {
      const el = [...document.querySelectorAll(pick)].find((one) => getComputedStyle(one).backgroundImage.includes('gradient'))
      if (!el) return null
      const s = getComputedStyle(el)
      return { size: s.fontSize, radius: s.borderTopLeftRadius, fill: s.backgroundImage.replace(/\s+/g, ' ').slice(0, 90), edge: s.borderTopWidth }
    }, pick)
    const pillLook = await look(pillPage, '[data-desk-pill]')
    const bubbleLook = await look(bubble, 'button, div')
    // The same fill and words as the bubble, round at both ends as it is; its 1px ring is the floating material's
    // (DESIGN.md, Float: a ring of ink at 10%), which the bubble's island leaves to its lift.
    check('the pill wears the session bubble\'s fill, its words the same size, round at both ends', !!pillLook && !!bubbleLook && pillLook.fill === bubbleLook.fill && pillLook.size === bubbleLook.size && parseFloat(pillLook.radius) >= 14 && parseFloat(bubbleLook.radius) >= 14, JSON.stringify({ pillLook, bubbleLook }))
    // A notice: a note taken down from its pill's own menu, said in the main window with "Put it back".
    const note = stackNow().find((one) => one.key.startsWith('capture:'))
    const notePage = note && pageOf(note.url)
    if (notePage) {
      await notePage.mouse.click(note.pill.x + note.pill.w / 2, note.pill.y + note.pill.h / 2, { button: 'right' })
      await until(menuOpen, 3000)
      const take = (await menuLines()).find((one) => one.startsWith('Take it down'))
      if (take) await menuPage().getByRole('menuitem', { name: /^Take it down/ }).click()
      const toast = await until(async () => (await c.h.locator('[role="status"]', { hasText: 'taken off the desktop' }).count()) > 0, 4000)
      check('taken down from its pill\'s menu: a notice says so in the main window, with “Put it back”', toast && (await c.h.locator('[role="status"]', { hasText: 'Put it back' }).count()) > 0)
      now = await desk(c.electron)
      if (shots) {
        for (const theme of ['paper', 'dark']) {
          await c.h.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
          await wait(900)
          const one = c.h.locator('[role="status"]', { hasText: 'taken off the desktop' }).first()
          if (await one.count()) await one.screenshot({ path: `${shots}/beside-${theme}-notice.png` }).catch(() => {})
          if (bubble) await bubble.screenshot({ path: `${shots}/beside-${theme}-bubble.png` }).catch(() => {})
          now = await desk(c.electron)
          for (const [n, each] of stackNow().slice(0, 3).entries()) writeFileSync(`${shots}/beside-${theme}-pill-${n + 1}.png`, Buffer.from(await c.electron.evaluate(async ({ BrowserWindow }, id) => (await BrowserWindow.fromId(id).capturePage()).toPNG().toString('base64'), each.id), 'base64'))
        }
      }
    }
  }
} catch (error) {
  check('ran to the end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close().catch(() => {})
}
done()
