// Three journeys the user hit in the sandbox on 20 Nov 2026, each timed from the press:
// - journal: Journal › "Writing room" opens within 100 ms of the click, and its soundscape ("While you write") is
//   silent the moment Esc leaves (and by the button, and ⇧⌘↵).
// - snip: in the PDF reader, "Keep a figure" dragged over a page shows Card, Keep and Copy within 100 ms of letting
//   go; Copy and ⌘C put the picture on the test clipboard (the stand-in, never the Mac's), with "Copied the snip".
// - goals: the "Stick all goals" sticky: resting on a goal moves nothing (each lane's box, the card and its window the
//   same before and after), and clicking a goal opens it in the main window with no frame over 100 ms.
// Frames light and dark into QA_SHOTS. PART=journal,snip,goals picks parts.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/room-snip-goals.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { clearBoard, copiedTypes } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const PART = process.env.PART ?? 'journal,snip,goals'
const SHOTS = process.env.QA_SHOTS ?? '/tmp/room-snip-goals'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

/** Milliseconds from the next press (pointerdown, or keydown of `key`) in `page` to the first frame painted with `selector` in it. */
const armTimer = (page, selector, key) => page.evaluate(([selector, key]) => {
  window.__took = new Promise((done) => {
    let from = 0
    const start = (event) => { if (from || (key && event.key !== key)) return; from = performance.now(); look() }
    const look = () => (document.querySelector(selector) ? ((window.__inDom = Math.round(performance.now() - from)), requestAnimationFrame(() => done(Math.round(performance.now() - from)))) : requestAnimationFrame(look))
    window.addEventListener(key ? 'keydown' : 'pointerdown', start, true)
    setTimeout(() => done(-1), 8000)
  })
}, [selector, key ?? null])
const took = (page) => page.evaluate(() => window.__took)
const scape = () => h.evaluate(() => window.haligtreeScape?.() ?? null)

try {
  await v('settings:set', { hintRate: 0, writingSound: 'rain', sounds: true })

  if (PART.includes('journal')) {
    await c.go('day'); await wait(1500)
    // As the user did: writing on today's page first (the bar fades a few words in), then "Writing room" where it sat.
    const button = await h.locator('[data-room-open]').boundingBox()
    await h.click('[data-day-write] .ProseMirror')
    await h.keyboard.type('A grey evening, the lamps on early and the street quiet. ', { delay: 15 }); await wait(1500)
    check('writing on today\'s page plays the soundscape (its setting)', (await scape())?.kind === 'rain', JSON.stringify(await scape()))
    await c.both(`${SHOTS}/day-writing`)
    await h.keyboard.press('Escape'); await wait(200)
    check('Esc ("Esc to leave") out of writing on today\'s page silences the soundscape', (await scape()) === null, JSON.stringify(await scape()))
    await h.keyboard.type('The rain came on after dark and kept on. ', { delay: 15 }); await wait(1500)
    console.log('room button while writing:', JSON.stringify(await h.evaluate(() => {
      const b = document.querySelector('[data-room-open]'); const r = b.getBoundingClientRect()
      const faded = []; for (let up = b; up; up = up.parentElement) { const s = getComputedStyle(up); if (Number(s.opacity) < 1 || s.pointerEvents === 'none' || s.visibility === 'hidden') faded.push(`${up.tagName}.${[...up.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')).join('.')} o=${s.opacity} pe=${s.pointerEvents}`) }
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { box: [r.x, r.y, r.width, r.height].map(Math.round), hitsButton: !!hit?.closest('[data-room-open]'), hit: hit?.tagName + '.' + [...(hit?.attributes ?? [])].map((a) => a.name).filter((n) => n.startsWith('data-')).join('.'), faded }
    })))
    button.x = (await h.locator('[data-room-open]').boundingBox()).x; button.y = (await h.locator('[data-room-open]').boundingBox()).y
    await armTimer(h, '[data-room]')
    await h.mouse.click(button.x + button.width / 2, button.y + button.height / 2)
    const ms = await took(h)
    check(`"Writing room" opens within 100 ms of the click (${ms} ms; in the page at ${await h.evaluate(() => window.__inDom)} ms)`, ms >= 0 && ms <= 100, String(ms))
    await wait(400)
    await c.both(`${SHOTS}/room`)
    await h.keyboard.type('Rain on the window. ', { delay: 20 }); await wait(300)
    const playing = await scape()
    check('writing in the room starts the soundscape', playing?.kind === 'rain', JSON.stringify(playing))
    await h.keyboard.press('Escape'); await wait(200)
    check('Esc leaves the room', !(await h.evaluate(() => !!document.querySelector('[data-room]'))))
    check('and the soundscape is silent at once', (await scape()) === null, JSON.stringify(await scape()))
    // The other ways out: the button and ⇧⌘↵.
    await h.click('[data-room-open]', { timeout: 5000 }); await wait(300)
    await h.keyboard.type('More. ', { delay: 20 }); await wait(200)
    await h.keyboard.press('Meta+Shift+Enter'); await wait(200)
    check('⇧⌘↵ leaves the room, the soundscape silent', !(await h.evaluate(() => !!document.querySelector('[data-room]'))) && (await scape()) === null, JSON.stringify(await scape()))
    await h.click('[data-room-open]', { timeout: 5000 }); await wait(300)
    await h.keyboard.type('Again. ', { delay: 20 }); await wait(200)
    await c.go('home'); await wait(600)
    check('going to another page from the room silences it', (await scape()) === null, JSON.stringify(await scape()))
  }

  if (PART.includes('snip')) {
    // A page with a large figure, as a scanned plate is: the snip covers most of the page.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    for (let n = 1; n <= 2; n++) {
      const page = pdf.addPage([600, 800])
      page.drawText(`Plate ${n}`, { x: 40, y: 760, size: 18, font })
      for (let i = 0; i < 60; i++) page.drawRectangle({ x: 40 + (i % 10) * 52, y: 80 + Math.floor(i / 10) * 110, width: 48, height: 100, color: rgb((i * 37 % 255) / 255, (i * 91 % 255) / 255, (i * 53 % 255) / 255) })
    }
    const bytes = Array.from(await pdf.save())
    const id = await v('article:new')
    await v('item:save', id, { title: 'Plates', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await c.send('article', id); await wait(1400)
    await h.evaluate((bytes) => {
      const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'plates.pdf', { type: 'application/pdf' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
    }, bytes)
    const block = await h.waitForSelector('.tiptap-attachment.is-pdf', { state: 'attached', timeout: 30000 }).catch(async (error) => { await h.screenshot({ path: `${SHOTS}/snip-no-block.png` }); throw error })
    await wait(1500)
    await block.hover()
    await h.click('.is-pdf button[aria-label^="Open"]', { force: true })
    await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 15000 }); await wait(1200)
    const snipOnce = async () => {
      const tool = h.locator('.pdf-reader .pdf-reader-bar button[aria-label="Keep a figure"]:visible').first()
      if (await tool.count()) await tool.click()
      else { await h.click('.pdf-reader .pdf-reader-bar button[aria-label="More"]'); await wait(300); await h.click('[data-fit-menu] [data-tool="Keep a figure"]') }
      await wait(300)
      const box = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-page[data-page="1"]').getBoundingClientRect(); return { x: r.left + r.width * 0.05, y: r.top + r.height * 0.08, w: r.width * 0.9, h: Math.min(r.height * 0.8, innerHeight - r.top - 120) } })
      await h.mouse.move(box.x, box.y); await h.mouse.down()
      await h.mouse.move(box.x + box.w, box.y + box.h, { steps: 6 })
      // Timed from letting go: the next pointerup to the first frame with the bar's Card in it.
      await h.evaluate(() => {
        window.__took = new Promise((done) => {
          const start = () => { const from = performance.now(); const look = () => (document.querySelector('.pdf-keep-bar button[aria-label="Card"]') ? requestAnimationFrame(() => done(Math.round(performance.now() - from))) : requestAnimationFrame(look)); look() }
          window.addEventListener('pointerup', start, { capture: true, once: true })
          setTimeout(() => done(-1), 8000)
        })
      })
      await h.mouse.up()
      return took(h)
    }
    const ms = await snipOnce()
    check(`the snip's bar shows within 100 ms of letting go (${ms} ms)`, ms >= 0 && ms <= 100, String(ms))
    const bar = await h.evaluate(() => [...document.querySelectorAll('.pdf-keep-bar button')].map((one) => one.getAttribute('aria-label')))
    check('it offers Card, Keep and Copy', ['Card', 'Keep', 'Copy'].every((one) => bar.includes(one)), JSON.stringify(bar))
    await wait(300)
    await c.both(`${SHOTS}/snip-bar`)
    await clearBoard(electron)
    await h.click('.pdf-keep-bar button[aria-label="Copy"]')
    await h.waitForFunction(() => /Copied the snip/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {})
    const types = await copiedTypes(electron)
    check('Copy puts the picture on the (test) clipboard', types.includes('image/png'), JSON.stringify(types))
    check('and says "Copied the snip"', await h.evaluate(() => /Copied the snip/.test(document.body.textContent)))
    await c.both(`${SHOTS}/snip-copied`)
    // ⌘C while a snip is shown: the same.
    await clearBoard(electron)
    await h.evaluate(() => document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })))
    await wait(1200)
    check('⌘C (the copy event) with the snip shown copies the picture too', (await copiedTypes(electron)).includes('image/png'), JSON.stringify(await copiedTypes(electron)))
    // Keep still keeps it, its picture saved.
    await h.click('.pdf-keep-bar button[aria-label="Keep"]')
    await h.waitForFunction(() => /Kept as a gem/.test(document.body.textContent), null, { timeout: 6000 }).catch(() => {})
    const gem = (await v('items', 'nugget')).find((one) => one.title?.startsWith('Figure from'))
    const full = gem && (await v('item', gem.id))
    check('Keep keeps the snip as a gem with its picture', /!\[\]\(haligtree:\/\/assets\/[0-9a-f]{64}\.png\)/.test(JSON.stringify(full?.body ?? '')), JSON.stringify(full?.body ?? '').slice(0, 160))
  }

  if (PART.includes('goals')) {
    await c.go('goals'); await wait(900)
    await h.click('[data-all-goals-sticky]')
    let win = null
    for (let i = 0; i < 60 && !win; i++) { win = electron.windows().find((one) => !one.isClosed() && one.url().includes('view=sticky') && one.url().includes('type=goals')); if (!win) await wait(250) }
    check('the goals sticky is up', !!win)
    await win.waitForSelector('[data-goals-lane]', { timeout: 8000 })
    await win.waitForTimeout(1500)
    const boxes = () => win.evaluate(() => {
      const r = (one) => { const b = one.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round).join(',') }
      return { lanes: [...document.querySelectorAll('[data-goals-lane]')].map(r), card: r(document.querySelector('[data-goals-sticky]')), below: [...document.querySelectorAll('[data-goals-item], [data-goals-focus]')].map(r) }
    })
    const bounds = () => electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('type=goals')); const b = w?.getBounds(); return b ? `${b.width}x${b.height}` : null })
    const before = { ...(await boxes()), window: await bounds() }
    await c.both(`${SHOTS}/goals-rest`, win)
    const lane = win.locator('[data-goals-lane]').nth(1)
    const at = await lane.boundingBox()
    await win.mouse.move(at.x + at.width / 2, at.y + at.height / 2); await win.waitForTimeout(700)
    const after = { ...(await boxes()), window: await bounds() }
    check('resting on a goal moves nothing: every lane, the card, the lines below and the window keep their boxes', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
    const said = await win.evaluate(() => document.querySelector('[data-goals-focus]')?.textContent ?? '')
    check('and its detail shows in its fixed line', /left|gone|today/.test(said), said)
    await c.both(`${SHOTS}/goals-hover`, win)
    // Clicking it: the main window answers, no frame over 100 ms, and opens the goal.
    await h.evaluate(() => { window.__gaps = []; let last = performance.now(); const loop = () => { const now = performance.now(); window.__gaps.push(now - last); last = now; if (window.__gaps.length < 400) requestAnimationFrame(loop) }; requestAnimationFrame(loop) })
    const pressed = Date.now()
    await lane.click()
    const answered = await h.evaluate(() => performance.now()).then(() => Date.now() - pressed, () => -1)
    await wait(2500)
    const worst = await h.evaluate(() => Math.round(Math.max(...window.__gaps)))
    check(`clicking a goal in the sticky: the main window answers (${answered} ms) with no frame over 100 ms (worst ${worst} ms)`, answered >= 0 && answered < 1000 && worst <= 100, `${answered} / ${worst}`)
    check('and the main window shows that goal', await h.evaluate(() => /goal/i.test(document.title + document.body.innerText)))
  }
} finally {
  await c.close()
}
done()
