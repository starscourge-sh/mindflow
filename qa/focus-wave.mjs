// Focus sessions, the bubble and the site blocker, end to end on sandbox data:
// ticking on to start and quiet in breaks; a bare session (no task) from ⌘K's
// “Start focus” with a length picked or typed, and from ⌃⌥⌘S's ask; named in
// the bubble and on the day's page; the bubble's goal opening its task at its
// Sessions part; End early laid out as a Mac alert; the send button plainly a
// button once there is something to keep; the bubble folding once the pointer
// has gone; a break's one card; Go again and Done for now after a break; under
// the notch tips opening below and Keep going outlined and folding away; the
// pill put back on waking; the glow never full screen and rounded on a Mac's
// own screen; “Try it for 5 minutes”; the Sessions panel's room, its sites read
// as on or offered, Manage, and “Block the big three”.
//
//   npx electron-vite build --outDir out-focus
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-focus/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/focus-wave.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

// A notch stood in, so the notch's ways and the rounded glow can be seen on any Mac.
process.env.HALIGTREE_QA_NOTCH = '1'
const SHOT = process.env.SHOT ?? 'scratchpad/focus-wave'
mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const c = await sandbox({ width: 1100, height: 860 })
const { electron, h, v, page: box } = c
const windowOf = async (part) => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  throw new Error(`no window ${part}`)
}
const heard = (win) => win.evaluate(() => [...(window.haligtreeHeard ?? [])])
const island = (pill) => pill.$eval('[data-island]', (one) => one.getAttribute('data-island')).catch(() => null)
const pointer = (inside) => electron.evaluate((_, on) => void (globalThis.pillPointer = on), inside)
const theme = async (name) => {
  await h.evaluate((t) => localStorage.setItem('theme', t), name)
  await h.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
  await h.waitForTimeout(500)
}
const sized = async (w, hh) => {
  await electron.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setBounds({ x: 40, y: 40, width: w, height: hh }), [w, hh])
  await h.waitForTimeout(700)
}

try {
  // --- 2: the ticking is on to start, in a book that never touched it.
  const fresh = await v('settings')
  check('2: ticking is on to start', fresh.sessionTick === true, String(fresh.sessionTick))
  check('60: “Always block” is off to start in a book that is not the developer’s', fresh.alwaysBlock === false, String(fresh.alwaysBlock))
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', pillSits: 'free', siteBlock: true, blockSites: [], quietStart: '03:00', quietEnd: '03:01' })

  // --- 25: ⌘K's Start focus, a length typed, and no task.
  await c.go('today')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(700)
  await h.keyboard.type('start focus')
  await h.waitForTimeout(500)
  const row = await h.$('[role=dialog] button:has-text("Start focus…")')
  check('25: ⌘K lists “Start focus…”', !!row)
  await row?.click()
  await h.waitForTimeout(500)
  const lengths = await h.$$eval('[role=dialog] button', (all) => all.map((one) => one.textContent.trim()).filter((t) => /^\d+ (min|h)/.test(t)))
  check('25: it asks how long: 25 min, 45 min, 1 h', ['25 min', '45 min', '1 h'].every((one) => lengths.includes(one)), lengths.join(' | '))
  await h.focus('[role=dialog] input')
  await h.keyboard.type('40')
  await h.waitForTimeout(300)
  const typed = await h.$$eval('[role=dialog] button', (all) => all.map((one) => one.textContent.trim()).filter((t) => /^\d+ (min|h)/.test(t)))
  check('25: a length typed is offered first', typed[0]?.startsWith('40 min'), typed.join(' | '))
  await h.screenshot({ path: `${SHOT}/25-cmdk-lengths.png` })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  let now = await v('focus:now')
  check('25: ↵ starts a session with no task, 40 minutes', now?.kind === 'focus' && now.taskId === '' && now.plannedMs === 40 * 60000, JSON.stringify(now && { kind: now.kind, task: now.taskId, ms: now.plannedMs, goal: now.goal }))
  check('25: called “Focus” until named', now?.goal === 'Focus', now?.goal)
  const pill = await windowOf('view=focus')
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForTimeout(2500)

  // --- 2, 38: the clock ticks in the session.
  check('2: the session ticks', (await heard(pill)).some((one) => one.startsWith('clock-tick')), (await heard(pill)).join(','))

  // --- 25: named in the bubble.
  await pill.hover('[data-island]')
  await pill.waitForTimeout(600)
  check('25: the bubble offers to name a bare session', !!(await pill.$('[data-session-goal="bare"]')))
  await pill.click('[data-session-goal="bare"]')
  await pill.waitForTimeout(300)
  await pill.fill('[data-bare-name-field]', 'Draft the talk')
  await pill.keyboard.press('Enter')
  await pill.waitForTimeout(700)
  now = await v('focus:now')
  check('25: named while it runs', now?.goal === 'Draft the talk', now?.goal)

  // --- 16: the send button, quiet when empty, plainly a button with words in.
  const send = () => pill.$eval('[data-island-send]', (one) => ({ ready: one.hasAttribute('data-ready'), bg: getComputedStyle(one).backgroundColor, opacity: getComputedStyle(one).opacity }))
  const empty = await send()
  await pill.fill('[aria-label="Add a thought to this session\'s log"]', 'Outline first, then slides')
  await pill.waitForTimeout(300)
  const ready = await send()
  check('16: empty, the send button is quiet', !empty.ready && Number(empty.opacity) < 0.6, JSON.stringify(empty))
  check('16: with words, it is filled and at full strength', ready.ready && ready.bg !== 'rgba(0, 0, 0, 0)' && Number(ready.opacity) === 1, JSON.stringify(ready))
  await (await pill.$('[data-island]'))?.screenshot({ path: `${SHOT}/16-send-ready.png` })
  await pill.click('[data-island-send]')
  await pill.waitForTimeout(600)
  check('25: a bare session keeps a log', (await v('session-log', now.id)).some((one) => one.text === 'Outline first, then slides'))

  // --- 37: open, then the pointer gone: it folds, whatever else is open.
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('focus:shot'); ipcMain.handle('focus:shot', () => ({ denied: true })) })
  await pill.click('[aria-label="Add a screenshot"]')
  await pill.waitForTimeout(500)
  check('37: the note that the screen cannot be seen holds it open', !!(await pill.$('[data-screen-denied]')) && (await island(pill)) === 'open')
  await pill.evaluate(() => document.activeElement?.blur())
  await pointer(false)
  await pill.waitForTimeout(3500)
  check('37: the pointer gone a moment, it folds anyway', (await island(pill)) === 'rest', await island(pill))
  await pointer(true)
  await pill.mouse.move(1, 1)
  await pill.waitForTimeout(300)

  // --- 13: End early, as a short Mac alert.
  await pill.hover('[data-island]')
  await pill.waitForTimeout(600)
  await pill.click('[data-island-panel] button:has-text("Stop")')
  await pill.waitForTimeout(500)
  const ask = await pill.evaluate(() => {
    const box = document.querySelector('[data-stop-ask]')
    const question = box?.querySelector('[data-stop-question]')
    const filled = [...(box?.querySelectorAll('button') ?? [])].filter((one) => getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)').map((one) => one.textContent.trim())
    const count = box?.querySelector('[data-end-early]')?.getBoundingClientRect()
    const skip = box?.querySelector('[data-abandon]')?.getBoundingClientRect()
    return { question: question?.tagName, inButton: !!question?.closest('button'), filled, countRight: count && skip ? count.left > skip.left : false, text: box?.textContent }
  })
  check('13: “End early?” is words, not a button', ask.question === 'SPAN' && !ask.inButton, JSON.stringify(ask))
  check('13: “Count it” is the one filled button, on the right', ask.filled.length === 1 && ask.filled[0] === 'Count it' && ask.countRight, ask.filled.join(','))
  await (await pill.$('[data-island]'))?.screenshot({ path: `${SHOT}/13-end-early.png` })
  await pill.click('[data-end-early]')
  await pill.waitForTimeout(1200)
  const ended = (await v('session-log:day', new Date().toLocaleDateString('en-CA'))).find((one) => one.id === now.id)
  check('25: counted, a bare session is on the day’s page', !!ended && !ended.abandonedAt && ended.title === 'Draft the talk', JSON.stringify(ended && { title: ended.title }))
  check('14: Keep going, after ending early, is outlined', await pill.$eval('[data-keep-going]', (one) => parseFloat(getComputedStyle(one).borderTopWidth) >= 1).catch(() => false))
  await (await pill.$('[data-island-frame]'))?.screenshot({ path: `${SHOT}/14-keep-going.png` })
  await pointer(true)
  await pill.mouse.move(1, 1)
  await pill.waitForTimeout(9500)
  check('14: left alone, the band folds away in a few seconds, no pick-up line after', !(await pill.$('[data-after="ask"]')) && !(await pill.$('[data-after="pickup"]')), await pill.$eval('[data-after]', (one) => one.dataset.after).catch(() => 'gone'))

  // --- 25: named after, on the day's page.
  await c.go('day')
  await h.waitForTimeout(1200)
  const line = `[data-day-session="${now.id}"]`
  check('25: the day’s page has the bare session’s line', !!(await h.$(`${line}[data-bare]`)))
  await h.click(`${line} button`)
  await h.waitForTimeout(300)
  await h.fill('[data-day-session-name]', 'Draft the conference talk')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  const renamed = (await v('session-log:day', new Date().toLocaleDateString('en-CA'))).find((one) => one.id === now.id)
  check('25: named after, in its line', renamed?.title === 'Draft the conference talk', renamed?.title)
  check('25: Go again after it is another bare session', (await v('session:last'))?.taskId === '', JSON.stringify(await v('session:last')))

  // --- 25: ⌃⌥⌘S's ask, from anywhere: quick capture's ⌘K opens on the lengths.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !new URL(one.webContents.getURL()).searchParams.get('view'))?.webContents.send('focus:ask'))
  await box.waitForTimeout(900)
  const asked = await box.$$eval('[role=dialog] button', (all) => all.map((one) => one.textContent.trim()).filter((t) => /^\d+ (min|h)/.test(t))).catch(() => [])
  check('25: the key anywhere opens on the lengths to pick', asked.includes('25 min') && asked.includes('1 h'), asked.join(' | '))
  await box.keyboard.press('Escape')
  await box.keyboard.press('Escape')
  await box.waitForTimeout(400)

  // --- 33: Try it for 5 minutes, and 61: the Sessions panel.
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title && !one.recurrence)
  await c.send('task', task.id)
  await h.waitForTimeout(1500)
  check('33: the panel offers “Try it for 5 minutes”', !!(await h.$('text=Try it for 5 minutes')) && !(await h.$('text=Try it for 2 minutes')))
  await (await h.$('text=Start a new focus session') ?? await h.$('text=Start a focus session'))?.click()
  await h.waitForTimeout(700)
  const roomy = await h.evaluate(() => {
    const form = document.querySelector('[data-start-focus]')
    const island = form?.closest('.mf-island')?.getBoundingClientRect()
    const first = form?.querySelector('section')?.getBoundingClientRect()
    const starter = document.querySelector('[data-site-starter="@social"]')
    const line = starter ? parseFloat(getComputedStyle(starter).lineHeight) || 18 : 0
    const words = starter?.querySelector('.truncate')
    return { cut: words ? words.scrollWidth > words.clientWidth + 1 : true, inset: island && first ? Math.round(first.left - island.left) : -1, top: island && first ? Math.round(first.top - island.top) : -1, starter: starter?.textContent, starterTall: starter ? Math.round(starter.getBoundingClientRect().height) : 0, line, manage: !!document.querySelector('[data-manage-blocking]') }
  })
  check('61: the start form has room inside its island', roomy.inset >= 8 && roomy.top >= 8, JSON.stringify(roomy))
  check('61: the offer reads “Block Social media (8)”, on one line, not cut', /^Block Social media \(8\)/.test(roomy.starter ?? '') && roomy.starterTall <= 30 && !roomy.cut, `${roomy.starter} ${roomy.starterTall}px cut ${roomy.cut}`)
  check('60: “Manage” beside the sites', roomy.manage)
  for (const [w, hh] of [[900, 700], [1600, 1000]]) for (const name of ['paper', 'dark']) {
    await sized(w, hh)
    await theme(name)
    await (await h.$('[data-task-sessions]'))?.screenshot({ path: `${SHOT}/61-sessions-${w}-${name}.png` })
  }
  await sized(1100, 860)
  await h.click('[data-site-starter="@social"]')
  await h.waitForTimeout(700)
  const chip = await h.evaluate(() => { const name = document.querySelector('[data-site-chip="@social"] [data-site-group-name]'); return { name: name?.textContent, cut: name ? name.scrollWidth > name.clientWidth + 1 : true, count: document.querySelector('[data-site-chip="@social"] [data-site-group-count]')?.textContent, title: document.querySelector('[data-site-field]')?.closest('section')?.querySelector('h2')?.textContent } })
  check('61: on, it reads “Blocking” over “Social media, All 8 blocked”, not cut', chip.title === 'Blocking' && chip.name === 'Social media' && chip.count === 'All 8 blocked' && !chip.cut, JSON.stringify(chip))
  await (await h.$('[data-task-sessions]'))?.screenshot({ path: `${SHOT}/61-blocking-on.png` })
  await v('settings:set', { blockSites: [] })
  await c.go('inbox')
  await c.send('task', task.id)
  await h.waitForTimeout(1200)
  await h.waitForTimeout(400)

  // --- 33: and it runs five minutes.
  await h.click('text=Try it for 5 minutes')
  await h.waitForTimeout(1200)
  now = await v('focus:now')
  check('33: “Try it for 5 minutes” is a five minute session', now?.plannedMs === 5 * 60000 && now.taskId === task.id, String(now?.plannedMs))

  // --- 67: the goal in the bubble opens its task, at its Sessions part.
  await c.go('inbox')
  await h.waitForTimeout(800)
  await pill.waitForTimeout(2500)
  await pill.hover('[data-island]')
  await pill.waitForTimeout(500)
  check('67: the goal is a link with an arrow', !!(await pill.$('[data-session-goal="task"]')) && !!(await pill.$('[data-session-open]')))
  await pill.click('[data-session-goal="task"]')
  await h.waitForTimeout(1800)
  const landed = await h.evaluate(() => {
    const part = document.querySelector('[data-task-sessions]')?.getBoundingClientRect()
    return part ? { top: Math.round(part.top), seen: part.top >= 0 && part.top < window.innerHeight } : null
  })
  check('67: the task opens in the main window, its Sessions part in sight', landed?.seen === true, JSON.stringify(landed))

  // --- 60: Block the big three, with nothing in the list.
  await v('settings:set', { alwaysBlock: true, blockSites: [] })
  await electron.evaluate(() => void (globalThis.siteBlockFake = { app: 'com.google.Chrome', url: 'https://www.youtube.com/watch?v=1' }))
  await wait(3500)
  const away = await electron.evaluate(() => (globalThis.siteBlockAway ?? []).map((one) => one.url))
  check('60: with “Always block” on, YouTube is sent away though the list is empty', away.some((one) => String(one).includes('youtube.com')), away.join(','))
  await electron.evaluate(() => void (globalThis.siteBlockFake = { app: 'com.apple.finder' }))
  await c.send('task', task.id)
  await h.waitForTimeout(1200)
  await c.go('settings')
  await h.click('[data-section="Tasks"]').catch(() => {})
  await h.waitForTimeout(800)
  check('60: Settings has “Block the big three”, on', await h.$eval('[data-setting-title="Block the big three"] [role=switch]', (one) => one.getAttribute('aria-checked') === 'true' || one.dataset.state === 'checked').catch(() => false))
  check('60: the field says what is always blocked', !!(await h.$('[data-site-always]')))
  await (await h.$('[data-setting-title="Block the big three"]'))?.screenshot({ path: `${SHOT}/60-always.png` })
  await v('settings:set', { alwaysBlock: false })

  // --- 38, 29: a break: no ticking, one card, then Go again or Done for now.
  await v('session:end', (await v('focus:now')).id, '', false)
  await pill.waitForTimeout(1500)
  await pill.evaluate(() => (window.haligtreeHeard.length = 0))
  await v('break:start', null, 9000)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(2500)
  check('38: no ticking in a break', !(await heard(pill)).some((one) => one.startsWith('clock-tick')), (await heard(pill)).join(','))
  const card = await pill.$eval('[data-break-moment]', (one) => ({ label: one.querySelector('[data-break-moment-label]')?.textContent, text: one.querySelector('[data-break-moment-open]')?.textContent })).catch(() => null)
  check('29: the break brings one card back, open to be read', !!card?.label && !!card?.text && (await island(pill)) === 'open', JSON.stringify(card))
  await (await pill.$('[data-island]'))?.screenshot({ path: `${SHOT}/29-break-card.png` })
  if (card) {
    await pill.click('[data-break-moment-skip]')
    await pill.waitForTimeout(400)
    check('29: and its × lets it go', !(await pill.$('[data-break-moment]')))
  }
  await pill.waitForTimeout(7500)
  const after = await pill.$$eval('[data-island-panel] button', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
  check('38: a break over offers “Go again” and “Done for now”', after.includes('Go again') && after.includes('Done for now'), after.join(' | '))
  await (await pill.$('[data-island]'))?.screenshot({ path: `${SHOT}/38-break-over.png` })
  await pill.hover("[data-island]")
  await pill.waitForTimeout(500)
  await pill.click('[data-island-panel] button:has-text("Done for now")', { timeout: 8000 })
  await pill.waitForTimeout(1500)
  check('38: “Done for now” ends it there', !(await v('focus:now')))

  // --- 3, 49: the glow is never a full-screen window, and on a Mac's own screen it follows the corners.
  await h.evaluate(() => window.api.glow('done'))
  const glow = await windowOf('view=glow')
  await glow.waitForTimeout(300)
  const shown = await electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=glow'))
    return win && { fullscreenable: win.isFullScreenable(), fullscreen: win.isFullScreen(), simple: win.isSimpleFullScreen() }
  })
  check('3: the glow can never go full screen (no Space of its own)', shown && !shown.fullscreenable && !shown.fullscreen && !shown.simple, JSON.stringify(shown))
  const edge = await glow.$eval('.mf-glow', (one) => ({ rounded: one.hasAttribute('data-rounded'), inset: getComputedStyle(one).top, radius: getComputedStyle(one).borderTopLeftRadius })).catch(() => null)
  check('49: on a Mac’s own screen the frame is set in and rounded', edge?.rounded && parseFloat(edge.inset) >= 2 && parseFloat(edge.radius) >= 12, JSON.stringify(edge))

  // --- 14, 17: under the notch.
  await v('settings:set', { pillSits: 'notch' })
  const tasked = await v('session:start', task.id, 'Under the notch', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(2500)
  await pill.hover('[data-island]')
  await pill.waitForTimeout(700)
  await pill.hover('[data-span-pill]')
  await pill.waitForTimeout(1300)
  const tip = await pill.evaluate(() => {
    const one = document.querySelector('[data-slot=tooltip-content]')
    const span = document.querySelector('[data-span-pill]')?.getBoundingClientRect()
    return one && span ? { side: one.getAttribute('data-side'), top: Math.round(one.getBoundingClientRect().top), below: one.getBoundingClientRect().top >= span.bottom } : null
  })
  check('14: under the notch, a tip opens below, never into the notch', tip?.side === 'bottom' && tip.below, JSON.stringify(tip))
  await pill.screenshot({ path: `${SHOT}/14-notch-tip.png` })
  check('67: under the notch, the goal is a link too', !!(await pill.$('[data-notch-head] [data-session-goal="task"]')))
  // Woken: put back where it sits and laid out again.
  await electron.evaluate(() => void (globalThis.pillPlaced = null))
  await electron.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))
  await pill.waitForTimeout(600)
  const placed = await electron.evaluate(() => globalThis.pillPlaced)
  check('17: on waking, the pill is put back beside the notch', !!placed && placed.notch > 0, JSON.stringify(placed))
  await v('session:cancel', tasked)
  await pill.waitForTimeout(1500)

  check('no errors', c.errors.length === 0, c.errors.slice(0, 5).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
