// The session pill as an island: it drops in from under the menu bar and
// springs open, settles into the pill, opens under the pointer, and takes a
// session's log (typed, pasted, dropped, shot) that then shows in the task's
// log and on the day's page.
//
//   npx electron-vite build --outDir out-island
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-island/main/index.js MINDFLOW_QA_AWAY= SHOT=<dir> node qa/island.mjs
//
// COST_ONLY=1 measures only what the pill costs at rest, to compare builds.
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/island'
mkdirSync(`${SHOT}/drop`, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const pillBounds = () => electron.evaluate(({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=focus'))
  const display = screen.getDisplayMatching(win.getBounds())
  return { win: win.getBounds(), visible: win.isVisible(), work: display.workArea, screen: display.bounds }
})
const FIELD = '[aria-label="Add a thought to this session\'s log"]'
const stage = (pill) => pill.$eval('[data-island]', (one) => one.dataset.island).catch(() => null)

try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: true, motion: true })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  const begin = async (goal, ms = 25 * 60000) => {
    const id = await v('session:start', task.id, goal, ms)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }

  // A warm-up session, so the pill's window is made and listening.
  let id = await begin('Warm up')
  const pill = await pillWindow()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  pill.on('console', (message) => message.type() === 'error' && c.errors.push('PILL ' + message.text().slice(0, 300)))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(3000)
  await v('session:cancel', id)
  await pill.waitForTimeout(1200)

  if (process.env.COST_ONLY) {
    id = await begin('Write the chapter')
    await pill.waitForTimeout(12000)
    const cdp = await pill.context().newCDPSession(pill)
    await cdp.send('Performance.enable')
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value]))
    const runs = []
    for (let i = 0; i < 3; i++) {
      const m0 = await metrics()
      await pill.waitForTimeout(10000)
      const m1 = await metrics()
      runs.push(((m1.TaskDuration - m0.TaskDuration) * 1000 / 10 / 60).toFixed(3))
      if (process.env.DETAIL) console.log(['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'RecalcStyleCount', 'LayoutCount'].map((k) => `${k} ${(m1[k] - m0[k]).toFixed(3)}`).join(' · '))
    }
    console.log(`COST per 60fps frame at rest: ${runs.join(', ')} ms`)
    await v('session:cancel', id)
  } else {
    // --- The drop-in: every frame, as the page draws it, and the shell's size per frame.
    const cdp = await pill.context().newCDPSession(pill)
    const frames = []
    cdp.on('Page.screencastFrame', (frame) => {
      frames.push({ t: frame.metadata.timestamp * 1000, data: frame.data })
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
    await pill.evaluate(() => {
      window.__sizes = []
      const start = performance.now()
      const look = () => {
        const shell = document.querySelector('[data-island]')?.parentElement
        if (shell) {
          const box = shell.getBoundingClientRect()
          window.__sizes.push({ t: performance.now() - start, w: box.width, h: box.height, top: box.top, stage: shell.firstElementChild?.dataset.island ?? '' })
        }
        if (performance.now() - start < 3500) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    id = await begin('Write the chapter')
    await pill.waitForTimeout(3600)
    await cdp.send('Page.stopScreencast')
    const sizes = await pill.evaluate(() => window.__sizes)
    // Every 30ms of the first 900ms, from the frame on screen at that moment.
    const first = frames.findIndex((one) => one.t > 0)
    const t0 = frames[first]?.t ?? 0
    const picked = []
    for (let at = 0; at <= 900; at += 30) {
      const frame = [...frames].reverse().find((one) => one.t - t0 <= at)
      if (frame) picked.push([at, frame])
    }
    for (const [at, frame] of picked) writeFileSync(`${SHOT}/drop/${String(at).padStart(4, '0')}ms.png`, Buffer.from(frame.data, 'base64'))
    console.log(`frames: ${frames.length} drawn, ${picked.length} kept every 30ms in ${SHOT}/drop`)
    // The spring: how far past its size it went, and how soon it settled.
    const opening = sizes.filter((one) => one.stage === 'shown')
    const from = sizes.find((one) => one.stage === 'shown')
    if (opening.length && from) {
      const startW = sizes.filter((one) => one.stage !== 'shown' && one.t < from.t).at(-1)?.w ?? 132
      const endW = 324
      const peak = Math.max(...opening.map((one) => one.w))
      const overshoot = (peak - endW) / (endW - startW) * 100
      const settled = opening.find((one, i) => opening.slice(i).every((later) => Math.abs(later.w - endW) <= (endW - startW) * 0.02))
      check('it opens wider with a 3 to 5% overshoot', overshoot >= 2.5 && overshoot <= 5.5, `${startW.toFixed(0)}px to ${endW}px, peak ${peak.toFixed(1)}px, ${overshoot.toFixed(1)}% past`)
      check('it settles in about 450ms', settled && settled.t - from.t >= 300 && settled.t - from.t <= 560, `${settled ? (settled.t - from.t).toFixed(0) : '?'}ms`)
      const startTop = sizes[0]?.top
      check('it drops in from above', startTop < 0, `first frame's top ${startTop?.toFixed(0)}px`)
    } else check('the open stage was seen', false, JSON.stringify(sizes.slice(0, 5)))
    check('it settles into the pill', (await stage(pill)) === 'rest', await stage(pill))
    const place = await pillBounds()
    const menu = place.work.y - place.screen.y
    check('it hangs just under the menu bar, never over the notch', place.win.y >= place.work.y && place.win.y - place.work.y <= 12, `menu bar ${menu}px, window top ${place.win.y} vs work area ${place.work.y}`)
    check('it is centred on the screen', Math.abs(place.win.x + place.win.width / 2 - (place.work.x + place.work.width / 2)) <= 1)
    check('at rest its window is the pill\'s size', place.win.height === 64, `${place.win.width}x${place.win.height}`)

    // --- Light and dark, at rest and open.
    for (const theme of ['light', 'dark']) {
      await h.evaluate((t) => localStorage.setItem('theme', t), theme)
      await pill.reload()
      await pill.waitForTimeout(3200)
      await pill.screenshot({ path: `${SHOT}/rest-${theme}.png` })
      await pill.hover('[data-island] button >> nth=0')
      await pill.waitForTimeout(800)
      check(`under the pointer it opens (${theme})`, (await stage(pill)) === 'open')
      const grown = await pillBounds()
      check(`its window grows down for it (${theme})`, grown.win.height > 64 && grown.win.y === place.win.y, `${grown.win.height}px`)
      await pill.screenshot({ path: `${SHOT}/open-${theme}.png` })
      await pill.mouse.move(330, 2)
      await pill.waitForTimeout(400)
      await pill.evaluate(() => document.querySelector('[data-island]').dispatchEvent(new PointerEvent('pointerleave')))
      await pill.waitForTimeout(1200)
    }

    // --- The log: typed, pasted with a picture, typed again, and a file dropped.
    await pill.hover('[data-island] button >> nth=0')
    await pill.waitForTimeout(600)
    await pill.click(FIELD)
    await pill.keyboard.type('The intro needs the 1998 study first', { delay: 15 })
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(400)
    await pill.evaluate(async (field) => {
      const canvas = document.createElement('canvas')
      canvas.width = 480
      canvas.height = 300
      const g = canvas.getContext('2d')
      g.fillStyle = '#2563eb'; g.fillRect(0, 0, 480, 300)
      g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.fillText('Figure 2', 120, 170)
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      const data = new DataTransfer()
      data.items.add(new File([blob], 'figure.png', { type: 'image/png' }))
      const input = document.querySelector(field)
      input.focus()
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, FIELD)
    await pill.waitForTimeout(700)
    check('a pasted picture waits by the field', await pill.$('[data-island-attached] img') !== null)
    await pill.keyboard.type('Figure 2 is the one to redraw', { delay: 15 })
    await pill.screenshot({ path: `${SHOT}/attached-dark.png` })
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(400)
    await pill.keyboard.type('Ask Sam about the error bars', { delay: 15 })
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(500)
    // A screenshot refused: said, and paste or drop offered instead.
    await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('focus:shot'); ipcMain.handle('focus:shot', () => ({ denied: true })) })
    await pill.click('[aria-label="Add a screenshot"]')
    await pill.waitForTimeout(400)
    const said = await pill.$eval('[data-island-panel] [role="status"]', (one) => one.textContent).catch(() => '')
    check('a refused screenshot says so and offers paste or drop', said.includes('Paste or drop'), said)
    await pill.screenshot({ path: `${SHOT}/denied-dark.png` })
    // A file dropped on it.
    await pill.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['notes'], 'reading-list.txt', { type: 'text/plain' }))
      const on = document.querySelector('[data-island]')
      for (const type of ['dragenter', 'dragover', 'drop']) on.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
    })
    await pill.waitForTimeout(700)
    check('a dropped file waits by the field', ((await pill.$eval('[data-island-attached]', (one) => one.textContent).catch(() => '')) ?? '').includes('reading-list.txt'))
    await pill.focus(FIELD)
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(500)
    const rows = await pill.$$eval('[data-island-log] li', (all) => all.map((one) => one.textContent.trim()))
    check('the pill shows the last three, then how many more', rows.length === 4 && rows[3] === '1 more', rows.join(' | '))
    check('newest first, with its time', /^\d\d:\d\d/.test(rows[0]) && rows[0].includes('reading-list.txt'), rows[0])
    await pill.screenshot({ path: `${SHOT}/log-dark.png` })
    const entries = await v('session-log', id)
    check('four entries are kept against the session', entries.length === 4 && entries.every((one) => one.sessionId === id), `${entries.length}`)
    check('the pasted picture is kept as an asset', entries.some((one) => /^mindflow:\/\/assets\/[a-f0-9]{64}\.png$/.test(one.asset ?? '') && one.text.includes('Figure 2')))
    // Esc closes it, the pointer still on it.
    await pill.focus(FIELD)
    await pill.keyboard.press('Escape')
    await pill.waitForTimeout(700)
    check('Esc closes it', (await stage(pill)) === 'rest', await stage(pill))
    await pill.mouse.move(330, 2)
    await pill.evaluate(() => document.querySelector('[data-island]').dispatchEvent(new PointerEvent('pointerleave')))
    await pill.waitForTimeout(1000)
    check('closed, its window goes back to the pill\'s size', (await pillBounds()).win.height === 64, `${(await pillBounds()).win.height}`)

    // --- Ended: the log in the task's history and on the day's page.
    await pill.hover('[data-island] button >> nth=0')
    await pill.waitForTimeout(600)
    await pill.click('[data-island-panel] button:has-text("Stop")')
    await pill.waitForTimeout(800)
    await pill.keyboard.press('Escape')
    await pill.waitForTimeout(800)
    for (const theme of ['light', 'dark']) {
      await c.theme(theme)
      await c.send('task', task.id)
      await h.waitForTimeout(1500)
      const log = await h.$$eval('[data-session-log] [data-log-entry]', (all) => all.map((one) => one.textContent.trim())).catch(() => [])
      check(`the task's log has the session's timeline (${theme})`, log.length >= 4, log.join(' | '))
      const picture = await h.$('[data-session-log] img')
      if (picture) await picture.scrollIntoViewIfNeeded()
      check(`with the picture (${theme})`, !!picture)
      await h.waitForTimeout(300)
      await h.screenshot({ path: `${SHOT}/task-log-${theme}.png` })
      await c.go('day')
      await h.waitForTimeout(1500)
      const day = await h.$(`[data-day-session="${id}"]`)
      if (day) await day.scrollIntoViewIfNeeded()
      const dayRows = await h.$$eval(`[data-day-session="${id}"] [data-log-entry]`, (all) => all.length).catch(() => 0)
      check(`the day's page has it, with time markers (${theme})`, dayRows === 4 && (await h.$$eval(`[data-day-session="${id}"] time`, (all) => all.every((one) => /\d\d:\d\d/.test(one.textContent)))))
      await h.waitForTimeout(300)
      await h.screenshot({ path: `${SHOT}/day-${theme}.png` })
    }
    // One click: a capture, by way of the reword card.
    const entry = h.locator(`[data-day-session="${id}"] [data-log-entry]`).filter({ hasText: 'Ask Sam' })
    await entry.hover()
    await entry.locator('[aria-label="Keep as a capture"]').click()
    await h.waitForTimeout(600)
    const card = await h.$eval('[data-reword] textarea', (one) => one.value).catch(() => '')
    check('an entry opens the reword card on its words', card === 'Ask Sam about the error bars', card)
    await h.screenshot({ path: `${SHOT}/reword-dark.png` })
    const before = (await h.evaluate(() => window.api.captures.list?.() ?? [])).length
    await h.keyboard.press('Meta+Enter')
    await h.waitForTimeout(800)
    check('saved from the card, it is a capture', (await h.evaluate(() => window.api.captures.list?.() ?? [])).length === before + 1 || !(await h.$('[data-reword]')))

    // --- Motion off: a fade, nothing dropping or springing.
    await v('settings:set', { motion: false })
    await pill.reload()
    await pill.waitForTimeout(800)
    await pill.evaluate(() => {
      window.__sizes = []
      const start = performance.now()
      const look = () => {
        const shell = document.querySelector('[data-island]')?.parentElement
        if (shell) { const box = shell.getBoundingClientRect(); window.__sizes.push({ t: performance.now() - start, w: box.width, top: box.top, o: Number(getComputedStyle(shell).opacity) }) }
        if (performance.now() - start < 1500) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    id = await begin('Motion off')
    await pill.waitForTimeout(1600)
    const calm = await pill.evaluate(() => window.__sizes)
    check('with Motion off it only fades in', calm.length > 0 && calm.every((one) => Math.round(one.w) === 324 && Math.round(one.top) === 8) && calm[0].o < 1, `${calm.length} frames, first opacity ${calm[0]?.o}, sizes ${[...new Set(calm.map((one) => `${Math.round(one.w)}@${Math.round(one.top)}`))].join(' ')}`)
    await v('session:cancel', id)
    await v('settings:set', { motion: true })
    check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
    // React's own complaints, which only a development build makes.
    const mine = c.errors.filter((one) => !one.startsWith('PILL ') && /session|island|timeline|reword|DaySessions|SessionTimeline/i.test(one))
    check('the main window logs no errors from the session log', !mine.length, mine.join(' | '))
    check('the pill logs no errors', !c.errors.some((one) => one.startsWith('PILL ')), c.errors.filter((one) => one.startsWith('PILL ')).join(' | '))
  }
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
