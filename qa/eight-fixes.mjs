// Eight quick capture and menu fixes, driven in the real app:
//  1. a tag that files it in your tasks turns the kind button to Task
//  2. a task's menu turns it back into a note, one or several
//  3. a YouTube video shows its picture and a play button; the player only on play
//  4. "[[" then a space closes the link menu
//  5. a word's meaning open: the box settles, never growing and shrinking
//  6. the notice from a save is not left waiting when the box opens again
//  7. "Create more" is off again once the box is put away
// The dictionary is a local server and YouTube is blocked, so nothing reaches the internet.
//   npx electron-vite build --outDir out-eight
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-eight/main/index.js MINDFLOW_QA_AWAY=1 node qa/eight-fixes.mjs
import { createServer } from 'http'
import { sandbox } from './sandbox-lib.mjs'

const server = createServer((req, res) => {
  const word = decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop() ?? '')
  if (word !== 'serendipity') return (res.writeHead(404, { 'content-type': 'application/json' }), res.end('{}'))
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify([{ word, phonetic: '/x/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A fortunate discovery made by accident, found while looking for something else entirely.', example: 'It was pure serendipity.' }] }] }]))
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
server.unref()
process.env.MINDFLOW_QA_DICT = `http://127.0.0.1:${server.address().port}/api/v2/entries/en/`

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 800 })
const { page, h, electron, v, go } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const boxUp = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !/view=/.test(w.webContents.getURL())).some((w) => w.isVisible()))
const show = async () => { await page.evaluate(() => window.api.showPrompt()); await wait(700) }
const clear = async () => { await page.$eval(EDITOR, (el) => el.editor.chain().clearContent(true).focus().run()); await wait(300) }
const putAway = async () => { await page.keyboard.press('Escape'); await wait(300); if (await boxUp()) { await page.keyboard.press('Escape'); await wait(500) } }

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  // YouTube never reached: every request to it is stopped in the app itself.
  await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.youtube.com/*', '*://*.ytimg.com/*', '*://*.youtube-nocookie.com/*', '*://youtu.be/*'] }, (_d, done) => done({ cancel: true })))
  await v('tag:set', 'probeissue', { action: true })

  // --- 1. a task tag sets the kind button
  await show(); await clear()
  await page.keyboard.type('Sort the flaky login #probeissue ', { delay: 20 })
  await wait(1200)
  const chip = await page.evaluate(() => document.querySelector('[data-kind-chip]')?.textContent?.trim() ?? '')
  const says = await page.evaluate(() => document.body.innerText)
  check('1. a task tag: "This will" says it goes to your tasks', /Add to your tasks/.test(says))
  check('1. a task tag: the kind button says Task, not Note', /Task/.test(chip) && !/Note/.test(chip), chip)
  await clear()

  // --- 4. "[[" then a space closes the link menu; a name keeps it
  await page.keyboard.type('[[', { delay: 40 }); await wait(500)
  await page.keyboard.type(' ', { delay: 40 }); await wait(500)
  const afterSpace = await page.locator('.tiptap-suggestion-popup').count()
  check('4. "[[" then a space: no link menu', afterSpace === 0, `${afterSpace} open`)
  await clear()
  await page.keyboard.type('[[Probe page', { delay: 40 }); await wait(700)
  check('4. "[[Probe page": the link menu is still offered, spaces inside a name are fine', (await page.locator('.tiptap-suggestion-popup').count()) > 0)
  await page.keyboard.press('Escape'); await wait(200); await clear()
  await page.keyboard.type('/ ', { delay: 40 }); await wait(500)
  check('4. "/" then a space: no slash menu', (await page.locator('.tiptap-suggestion-popup').count()) === 0)
  await clear()

  // --- 3. a YouTube video: its picture, a play button, the player only on play
  await page.$eval(EDITOR, (el) => el.editor.chain().focus().setYoutubeVideo({ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).run())
  await wait(1200)
  const video = await page.evaluate(() => { const v = document.querySelector('div[data-youtube-video]'); return v && { state: v.getAttribute('data-state'), play: !!v.querySelector('.mf-video-play'), iframe: !!v.querySelector('iframe'), img: v.querySelector('img')?.getAttribute('src') ?? null, words: v.textContent } })
  check('3. a video shows a play button and no player yet', video?.play && !video.iframe, JSON.stringify(video))
  check('3. its picture blocked here: it says so and offers YouTube', video?.state === 'no-picture' && /could not load/.test(video.words) && /Open it on YouTube/.test(video.words), video?.state)
  await page.click('div[data-youtube-video] .mf-video-play'); await wait(400)
  const src = await page.evaluate(() => document.querySelector('div[data-youtube-video] iframe')?.getAttribute('src') ?? '')
  check('3. play loads the player, the no-cookie one', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/.test(src), src)
  await clear()

  // --- 5. a word's meaning open: the box settles
  await page.keyboard.type('Serendipity', { delay: 20 })
  let ghost = false
  for (let i = 0; i < 60 && !ghost; i++) (await wait(100), (ghost = (await page.evaluate(() => document.querySelector('[data-define]')?.getAttribute('data-define'))) === 'ghost'))
  check('5. the meaning shows', ghost, await page.evaluate(() => (document.querySelector('[data-define]')?.getAttribute('data-define') ?? 'none') + ' | ' + document.querySelector('.tiptap.ProseMirror.mindflow-editor')?.innerText))
  await wait(1500)
  const heights = []
  for (let i = 0; i < 30; i++) (heights.push(await page.evaluate(() => innerHeight)), await wait(100))
  const changes = heights.filter((one, n) => n && one !== heights[n - 1]).length
  check('5. with the meaning up, the box holds one height for 3 seconds', changes === 0, `${changes} changes: ${[...new Set(heights)].join(', ')}`)
  await clear()

  // --- 7. "Create more" off once the box is put away
  const toggle = page.locator('label:has-text("Create more") [role=switch]').first()
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await wait(200)
  check('7. "Create more" turned on', (await toggle.getAttribute('aria-checked')) === 'true')
  await putAway()
  await show()
  check('7. put away and opened again: "Create more" is off', (await toggle.getAttribute('aria-checked')) === 'false')

  // --- 6. a save's notice: no flash as the box goes, none waiting on reopen
  await clear()
  await page.keyboard.type('Sort the second flaky login #probeissue', { delay: 15 })
  await wait(900)
  await page.keyboard.press('Meta+Enter')
  let flashed = false
  for (let i = 0; i < 20; i++) { if (/Added to your tasks/.test(await page.evaluate(() => document.querySelector('[data-sonner-toast], [role=status]')?.textContent ?? document.body.innerText))) flashed = true; await wait(50) }
  await wait(1200)
  check('6. the box went after the save', !(await boxUp()), await page.evaluate(() => document.body.innerText.slice(0, 300)))
  check('6. no "Added to your tasks" flashed as it went', !flashed)
  check('6. the task was made', (await v('tasks')).some((one) => one.title.includes('second flaky login')))
  await show()
  check('6. opened again: no notice left over', !/Added to your tasks|Kept in your Inbox/.test(await page.evaluate(() => document.body.innerText)))
  await putAway()

  // --- 2. a task back into a note, from its menu
  const one = await v('task:add', 'Probe water the ferns', undefined, true)
  const two = await v('task:add', 'Probe oil the hinge', undefined, true)
  const three = await v('task:add', 'Probe sweep the yard', undefined, true)
  await go('today'); await h.waitForTimeout(800)
  const row = (id) => h.locator(`button[data-row][data-id="${id}"]`).first()
  await row(one.id).click({ button: 'right' }); await h.waitForTimeout(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((e) => e.textContent.trim()))
  check('2. a task\'s menu offers "Turn back into a note"', menu.some((l) => l.startsWith('Turn back into a note')), menu.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Turn back into a note' }).first().click(); await h.waitForTimeout(1200)
  const notes = async () => (await h.evaluate(() => window.api.captures.list())).filter((x) => x.status === 'open')
  check('2. the task is gone from your tasks', !(await v('tasks')).some((x) => x.id === one.id))
  check('2. and it is a note in the Inbox', (await notes()).some((x) => (x.label ?? x.title ?? '').includes('water the ferns')))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  check('2. ⌘Z makes it a task again, and the note goes', (await v('tasks')).some((x) => x.id === one.id) && !(await notes()).some((x) => (x.label ?? x.title ?? '').includes('water the ferns')))
  await row(two.id).click({ modifiers: ['Shift'] }); await row(three.id).click({ modifiers: ['Shift'] }); await h.waitForTimeout(300)
  await row(three.id).click({ button: 'right' }); await h.waitForTimeout(500)
  const many = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((e) => e.textContent.trim()))
  check('2. two picked: "Turn 2 back into notes"', many.some((l) => l.startsWith('Turn 2 back into notes')), many.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'back into notes' }).first().click(); await h.waitForTimeout(1200)
  const left = await v('tasks')
  check('2. both left your tasks for the Inbox', !left.some((x) => x.id === two.id || x.id === three.id) && (await notes()).filter((x) => /oil the hinge|sweep the yard/.test(x.label ?? x.title ?? '')).length === 2)
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
