// A selfie in a study session's log, and a screenshot in quick capture's note.
// No real camera or screen off screen, so both are stood in for:
// HALIGTREE_QA_FAKE_CAMERA=1 gives the windows Chromium's pretend camera, and
// HALIGTREE_QA_FAKE_SCREEN=1 a made-up desktop ("denied" for either answers as
// a refused permission). Checks: the selfie is taken, kept in the session's
// log and shown in the task's log; the screenshot goes into the note with its
// caption; both refused states say so and open Privacy settings; the action
// is in the gear menu and ⌘K. Run twice inside: allowed, then refused.
//   QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/attach-camera.mjs
// QA_SHOTS=dir saves light and dark pictures.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const FIELD = '[aria-label="Add a thought to this session\'s log"]'

async function launch(fake) {
  process.env.HALIGTREE_QA_FAKE_CAMERA = fake
  process.env.HALIGTREE_QA_FAKE_SCREEN = fake
  delete process.env.QA_DATA
  const c = await sandbox({ width: 1100, height: 820 })
  await c.electron.evaluate(({ ipcMain, shell }) => {
    ipcMain.removeHandler('idle:seconds')
    ipcMain.handle('idle:seconds', () => 0)
    globalThis.opened = []
    shell.openExternal = async (url) => void globalThis.opened.push(url)
  })
  await c.v('settings:set', { sounds: true, motion: true, hintRate: 0, rotCount: 0, boxHideButtons: false })
  return c
}
const pillOf = async (c) => {
  for (let i = 0; i < 50; i++) {
    const found = c.electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const look = (win, name) => win.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), name)
const startSession = async (c, goal) => {
  const tasks = await c.v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  const id = await c.v('session:start', task.id, goal, 25 * 60000)
  await c.h.evaluate(() => window.api.showFocus(true))
  const pill = await pillOf(c)
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(3500)
  return { id, task, pill }
}
const openPill = async (pill) => {
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(700)
}
const freshBox = async (page) => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(500)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
}

// --- Allowed: the pretend camera and desktop.
{
  const c = await launch('1')
  const { page, h, v } = c
  try {
    const { id, task, pill } = await startSession(c, 'Revise chapter four')
    await openPill(pill)
    check('the pill has “Take a selfie” beside the screenshot', !!(await pill.$('[data-take-selfie]')) && !!(await pill.$('[aria-label="Add a screenshot"]')))
    await pill.click('[data-take-selfie]')
    await pill.waitForSelector('[data-selfie="live"]', { timeout: 8000 }).catch(() => {})
    await pill.waitForFunction(() => document.querySelector('[data-selfie] video')?.videoWidth > 0, null, { timeout: 4000 }).catch(() => {})
    // Tailwind's flip is the scale property, not a transform.
    const live = await pill.$eval('[data-selfie] video', (one) => ({ w: one.videoWidth, mirrored: getComputedStyle(one).scale })).catch(() => null)
    check('the camera comes on in the pill, mirrored', live && live.w > 0 && /^-1/.test(live.mirrored), JSON.stringify(live))
    for (const theme of ['light', 'dark']) {
      await look(pill, theme)
      await pill.waitForTimeout(900)
      if (shots) await pill.screenshot({ path: `${shots}/pill-selfie-live-${theme}.png` })
    }
    await pill.click('[data-selfie-take]')
    await pill.waitForTimeout(1200)
    const counting = await pill.$eval('[data-selfie]', (one) => one.dataset.selfie).catch(() => '')
    check('Take counts 3, 2, 1 first', counting === 'counting', counting)
    if (shots) await pill.screenshot({ path: `${shots}/pill-selfie-count-dark.png` })
    await pill.waitForSelector('[data-selfie="shot"]', { timeout: 6000 }).catch(() => {})
    check('then holds the picture to keep or retake', !!(await pill.$('[data-selfie-keep]')) && !!(await pill.$('[data-selfie-retake]')))
    for (const theme of ['light', 'dark']) {
      await look(pill, theme)
      await pill.waitForTimeout(900)
      if (shots) await pill.screenshot({ path: `${shots}/pill-selfie-shot-${theme}.png` })
    }
    // Retake goes back to the camera; Enter takes again at once (Take it now), Enter keeps.
    await pill.click('[data-selfie-retake]')
    await pill.waitForTimeout(500)
    check('Retake goes back to the camera', (await pill.$eval('[data-selfie]', (one) => one.dataset.selfie).catch(() => '')) === 'live')
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(300)
    await pill.keyboard.press('Enter')
    await pill.waitForSelector('[data-selfie="shot"]', { timeout: 4000 }).catch(() => {})
    await pill.keyboard.press('Enter')
    await pill.waitForTimeout(900)
    const attached = await pill.$eval('[data-island-attached]', (one) => one.textContent).catch(() => '')
    check('kept, it waits by the field like a screenshot', /^Selfie \d/.test(attached.trim()) && !(await pill.$('[data-selfie]')), attached)
    check('the camera is off once kept', await pill.evaluate(() => !document.querySelector('video')))
    if (shots) await pill.screenshot({ path: `${shots}/pill-selfie-attached-dark.png` })
    // The ↵ beside the field is a button, and does what Enter does: kept with the selfie.
    check('the ↵ beside the field is a button', await pill.$eval('[data-island-send]', (one) => one.tagName === 'BUTTON' && one.textContent.includes('↵')).catch(() => false))
    await pill.focus(FIELD)
    await pill.keyboard.type('Halfway through the reading', { delay: 10 })
    await pill.click('[data-island-send]')
    await pill.waitForTimeout(600)
    const sent = await pill.evaluate((field) => ({ words: document.querySelector(field)?.value, attached: !!document.querySelector('[data-island-attached]'), focused: document.activeElement === document.querySelector(field) }), FIELD)
    check('clicking ↵ with a selfie attached keeps it: the field and the selfie row clear, the field keeps the keys', sent.words === '' && !sent.attached && sent.focused, JSON.stringify(sent))
    // A screenshot in the pill, from the made-up desktop. The pill shrank
    // back from under the pointer once the camera went: pointed at again.
    await openPill(pill)
    await pill.click('[aria-label="Add a screenshot"]')
    await pill.waitForSelector('[data-island-attached]', { timeout: 4000 }).catch(() => {})
    const shotName = await pill.$eval('[data-island-attached]', (one) => one.textContent).catch(() => '')
    check('the pill\'s screenshot still works', /^Screenshot \d/.test(shotName.trim()), shotName || await pill.$eval('[data-island]', (one) => `${one.dataset.island}: ${one.innerText.replace(/\s+/g, ' ')}`))
    // Nothing typed, only the picture: ↵ clicked keeps it too, as Enter would.
    await pill.click('[data-island-send]')
    await pill.waitForTimeout(500)
    const entries = await v('session-log', id)
    check('clicking ↵ with only a picture attached keeps it in the log', entries.some((one) => /^Screenshot /.test(one.assetName ?? '') && one.text === ''), JSON.stringify(entries.map((one) => [one.text, one.assetName])))
    const selfie = entries.find((one) => /\.jpg$/.test(one.asset ?? ''))
    check('the selfie is kept in the session\'s log as a JPEG', !!selfie && selfie.text === 'Halfway through the reading' && /^Selfie /.test(selfie.assetName ?? ''), JSON.stringify(entries.map((one) => [one.text, one.assetName])))
    if (shots) await pill.screenshot({ path: `${shots}/pill-log-dark.png` })
    // Ended: in the task's log, the picture shown.
    await c.v('session:end', id, '', false).catch(() => {})
    await pill.waitForTimeout(800)
    for (const theme of ['paper', 'dark']) {
      await c.theme(theme)
      await c.send('task', task.id)
      await h.waitForTimeout(1800)
      const picture = await h.$('[data-session-log] img[src$=".jpg"]')
      if (picture) await picture.scrollIntoViewIfNeeded().catch(() => {})
      check(`the task's log shows the selfie (${theme})`, !!picture)
      await h.waitForTimeout(300)
      if (shots) await h.screenshot({ path: `${shots}/task-log-${theme}.png` })
    }

    // --- Quick capture: ⇧⌘2 puts the screen in the note with a caption.
    await freshBox(page)
    await page.keyboard.type('What the lecture slide said', { delay: 8 })
    await page.keyboard.press('Shift+Meta+2')
    await page.waitForTimeout(1500)
    const doc = await page.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.editor?.getJSON())
    const image = JSON.stringify(doc ?? {}).match(/"type":"image","attrs":\{[^}]*\}/)?.[0] ?? ''
    check('⇧⌘2 puts a screenshot in the note', /haligtree:\/\/assets\/[a-f0-9]{64}\.png/.test(image), image.slice(0, 160))
    check('captioned with when and the app in front', /"caption":"Screen, [^"]+ · Safari"/.test(image), image.match(/"caption":"[^"]*"/)?.[0])
    check('the words typed before it stay', JSON.stringify(doc ?? {}).includes('What the lecture slide said'))
    const toastSaid = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent).join(' | '))
    check('the picture in the note is the answer: no toast', !/Screenshot added/.test(toastSaid), toastSaid)
    const shownCaption = await page.evaluate(() => [...document.querySelectorAll('.tiptap *')].find((one) => !one.children.length && /^Screen, /.test(one.textContent ?? ''))?.textContent ?? '')
    check('the caption shows under the picture', /· Safari$/.test(shownCaption.trim()), shownCaption)
    for (const theme of ['paper', 'dark']) {
      await look(page, theme)
      await page.waitForTimeout(1600)
      await page.evaluate(() => [...document.querySelectorAll('.tiptap *')].find((one) => !one.children.length && /^Screen, /.test(one.textContent ?? ''))?.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(300)
      if (shots) await page.screenshot({ path: `${shots}/box-screenshot-${theme}.png` })
    }
    // In the gear menu, under This note.
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.waitForTimeout(400)
    const items = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((one) => one.innerText.split('\n')[0].trim()))
    check('the gear menu has “Attach a screenshot”', items.includes('Attach a screenshot'), JSON.stringify(items))
    if (shots) await page.screenshot({ path: `${shots}/box-gear-dark.png` })
    await page.getByRole('menuitem', { name: 'Attach a screenshot' }).click()
    await page.waitForTimeout(1500)
    const count = await page.evaluate(() => (JSON.stringify(document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.editor?.getJSON() ?? {}).match(/"type":"image"/g) ?? []).length)
    check('choosing it adds another', count === 2, `${count} pictures`)
    // In ⌘K.
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(500)
    await page.keyboard.type('screenshot', { delay: 20 })
    await page.waitForTimeout(700)
    const found = await page.evaluate(() => document.body.innerText.includes('Attach a screenshot'))
    check('⌘K finds “Attach a screenshot”', found)
    if (shots) await page.screenshot({ path: `${shots}/box-cmdk-dark.png` })
    await page.keyboard.press('Escape')
  } finally {
    check('no page errors', c.errors.length === 0, c.errors.join(' / '))
    await c.close()
  }
}

// --- Refused: the camera and Screen Recording both said no.
{
  const c = await launch('denied')
  const { page, electron } = c
  try {
    const { pill } = await startSession(c, 'Practice questions')
    await openPill(pill)
    await pill.click('[data-take-selfie]')
    await pill.waitForSelector('[data-selfie="denied"]', { timeout: 5000 }).catch(() => {})
    const said = await pill.$eval('[data-selfie] [role=status]', (one) => one.innerText).catch(() => '')
    check('a refused camera says so plainly', /can’t use the camera/.test(said) && /Privacy settings/.test(said), said.replace(/\n/g, ' / '))
    for (const theme of ['light', 'dark']) {
      await look(pill, theme)
      await pill.waitForTimeout(900)
      if (shots) await pill.screenshot({ path: `${shots}/pill-selfie-denied-${theme}.png` })
    }
    await pill.click('[data-selfie-privacy]')
    await pill.waitForTimeout(300)
    let opened = await electron.evaluate(() => globalThis.opened)
    check('“Open Privacy settings” opens the camera\'s page', opened.some((url) => url.includes('Privacy_Camera')), opened.join(' '))
    await pill.keyboard.press('Escape')
    await pill.waitForTimeout(400)
    check('Esc puts it away', !(await pill.$('[data-selfie]')))
    // The pill's screenshot refused.
    await openPill(pill)
    await pill.click('[aria-label="Add a screenshot"]')
    await pill.waitForTimeout(600)
    const screenSaid = await pill.$eval('[data-screen-denied]', (one) => one.innerText).catch(() => '')
    check('a refused screenshot in the pill offers Privacy settings', /can’t see the screen/.test(screenSaid) && /Open Privacy settings/.test(screenSaid), screenSaid)

    await freshBox(page)
    await page.keyboard.type('A slide to keep', { delay: 8 })
    await page.keyboard.press('Shift+Meta+2')
    await page.waitForTimeout(900)
    const toastSaid = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.innerText).join(' | '))
    check('a refused screenshot in the box says so, with Open Privacy settings', /can’t see the screen/.test(toastSaid) && /Open Privacy settings/.test(toastSaid), toastSaid.replace(/\n/g, ' '))
    for (const theme of ['paper', 'dark']) {
      await look(page, theme)
      await page.waitForTimeout(300)
      await page.keyboard.press('Shift+Meta+2')
      await page.waitForTimeout(700)
      if (shots) await page.screenshot({ path: `${shots}/box-denied-${theme}.png` })
    }
    await page.locator('[role=status]').getByText('Open Privacy settings').first().click().catch(() => {})
    await page.waitForTimeout(300)
    opened = await electron.evaluate(() => globalThis.opened)
    check('its link opens Screen Recording\'s page', opened.some((url) => url.includes('Privacy_ScreenCapture')), opened.join(' '))
    check('nothing was put in the note', await page.evaluate(() => !document.querySelector('.tiptap img')))
  } finally {
    check('no page errors (refused)', c.errors.length === 0, c.errors.join(' / '))
    await c.close()
  }
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
