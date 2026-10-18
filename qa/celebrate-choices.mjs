// Screen recordings, a switch for each kind of window; what plays for each
// celebration (Vigil's paper drawing, your file, or Giphy: pinned or random); and a
// task ticked getting only its tick (the Today sticky celebrates its list all
// done, not each task). Off screen, in a fresh data folder of its own. The
// Giphy parts need the network and the key built in from .env.local; the key
// is never written here. SHOTS=dir keeps pictures.
//
//   npx electron-vite build --outDir out-celebrate
//   QA_ENTRY=out-celebrate/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=… node qa/celebrate-choices.mjs
import { copyFileSync, mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'mindflow-choices-'))
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

// A picture of our own to pick: one of the bundled drawings, copied out, so its thumbnail is plainly a picture.
const files = mkdtempSync(join(tmpdir(), 'mindflow-choices-files-'))
const GIF = join(files, 'cheer.webp')
copyFileSync(join(import.meta.dirname, '../src/renderer/src/assets/drawings/38199.webp'), GIF)

const c = await sandbox({ width: 1100, height: 820, seeded: false })
const { h, v, electron, page } = c
const wait = (ms) => h.waitForTimeout(ms)
const HIDDEN = { main: false, box: false, stickies: false, bubble: false }
try {
  // Welcomed already: the welcome would lie over everything.
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await c.theme('paper')
  await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, sounds: true, motion: false, celebrate: true, celebrationsFolder: '', celebrationPicks: {}, celebrationSources: {}, giphyPins: {}, quietStart: '03:00', quietEnd: '03:01' })

  // --- 1. Screen recordings ---------------------------------------------------
  const kindOf = (url) => (url.includes('view=home') ? 'main' : url.includes('view=sticky') || url.includes('view=look') ? 'stickies' : url.includes('view=focus') || url.includes('view=glow') ? 'bubble' : url.includes('view=') ? 'other' : 'box')
  const guarded = async () => {
    await wait(400)
    const all = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL(), on: w.isContentProtected() })))
    return all.map((one) => ({ kind: kindOf(one.url), on: one.on }))
  }
  // A sticky and the bubble out, so every kind is there to look at.
  await h.evaluate(() => window.api.stick('today', 'today', true))
  await h.evaluate(() => window.api.showFocus(true)).catch(() => undefined)
  for (let i = 0; i < 30 && !(await guarded()).some((one) => one.kind === 'stickies'); i++) await wait(200)
  let now = await guarded()
  check('fresh: every window shows in recordings, so a screenshot in the welcome has Vigil in it', now.length >= 3 && now.filter((one) => one.kind !== 'other').every((one) => !one.on), JSON.stringify(now))
  await v('settings:set', { inRecordings: { ...HIDDEN, main: true } })
  now = await guarded()
  check('the main window alone shown: it shows, the rest stay hidden', now.filter((one) => one.kind === 'main').every((one) => !one.on) && now.filter((one) => one.kind !== 'main' && one.kind !== 'other').every((one) => one.on), JSON.stringify(now))
  await v('settings:set', { inRecordings: { ...HIDDEN, stickies: true } })
  now = await guarded()
  check('sticky notes alone shown: the sticky shows, the main window and the box do not', now.filter((one) => one.kind === 'stickies').every((one) => !one.on) && now.filter((one) => one.kind === 'main' || one.kind === 'box').every((one) => one.on), JSON.stringify(now))

  // A sticky kept out never shows on the way: every call on it says hidden while the others change.
  await electron.evaluate(({ BrowserWindow }) => {
    globalThis.protections = []
    const own = BrowserWindow.prototype.setContentProtection
    BrowserWindow.prototype.setContentProtection = function (on) {
      globalThis.protections.push({ sticky: this.webContents.getURL().includes('view=sticky'), on })
      return own.call(this, on)
    }
  })
  await v('settings:set', { inRecordings: { main: true, box: true, stickies: false, bubble: true } })
  await wait(300)
  const calls = await electron.evaluate(() => globalThis.protections)
  check('changing the others never unhides a hidden sticky, even for a moment', calls.some((one) => one.sticky) && calls.filter((one) => one.sticky).every((one) => one.on), JSON.stringify(calls))

  // Settings: the four switches, each saving its own kind.
  await v('settings:set', { inRecordings: HIDDEN })
  await c.go('settings')
  await h.getByText('What comes back to you', { exact: true }).first().click()
  await wait(700)
  const head = h.locator('[data-setting]').filter({ hasText: 'Hide from recordings' })
  await head.scrollIntoViewIfNeeded()
  check('Settings: “Hide from recordings” with four switches', (await head.count()) === 1 && (await h.locator('[data-recording]').count()) === 4)
  const titles = await h.locator('[data-recording]').evaluateAll((all) => all.map((one) => one.closest('[data-setting]').querySelector('.font-medium').textContent))
  check('the four are the main window, quick capture, sticky notes and goal cards, and the session bubble', JSON.stringify(titles) === JSON.stringify(['The main window', 'Quick capture', 'Sticky notes and goal cards', 'The session bubble']), JSON.stringify(titles))
  // Set hidden above, so the switches read hidden here.
  check('all four read hidden once hidden', (await h.locator('[data-recording][aria-checked="true"], [data-recording][data-checked]').count()) === 4)
  await h.locator('[data-recording="box"]').click()
  await wait(500)
  check('turning off “Quick capture” shows only the box', JSON.stringify((await v('settings')).inRecordings) === JSON.stringify({ ...HIDDEN, box: true }))
  now = await guarded()
  check('…and the box window is no longer protected', now.filter((one) => one.kind === 'box').every((one) => !one.on) && now.filter((one) => one.kind === 'main').every((one) => one.on), JSON.stringify(now))
  if (SHOTS) {
    const rows = h.locator('[data-setting]').filter({ hasText: 'Hide from recordings' })
    await rows.scrollIntoViewIfNeeded()
    await wait(300)
    await h.screenshot({ path: `${SHOTS}/recordings-paper.png` })
  }

  // ⌘K: all at once, saying so; undo puts each back as it was.
  await h.evaluate(() => { window.__toasts = []; addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text)) })
  const command = async (words) => {
    await h.keyboard.press('Meta+k')
    await wait(500)
    await h.keyboard.type(words, { delay: 10 })
    await wait(700)
    // Under Actions: Enter on words that name nothing yet would keep them as a note. The row, not the preview beside the list.
    await h.getByText(words, { exact: true }).first().click()
    await wait(900)
  }
  await c.go('home')
  await h.keyboard.press('Escape')
  // ⌘K's line is short now (home.tsx): "Show in recordings", and "Hide from recordings" once shown.
  await command('Show in recordings')
  check('⌘K “Show in recordings” shows every window', JSON.stringify((await v('settings')).inRecordings) === JSON.stringify({ main: true, box: true, stickies: true, bubble: true }), JSON.stringify((await v('settings')).inRecordings))
  check('…and says so', (await h.evaluate(() => window.__toasts)).includes('All of Vigil shows in screen recordings'), JSON.stringify(await h.evaluate(() => window.__toasts)))
  now = await guarded()
  check('…every window unprotected', now.filter((one) => one.kind !== 'other').every((one) => !one.on), JSON.stringify(now))
  await command('Hide from recordings')
  check('⌘K “Hide from recordings” hides them all, saying so', JSON.stringify((await v('settings')).inRecordings) === JSON.stringify(HIDDEN) && (await h.evaluate(() => window.__toasts)).includes('All of Vigil is hidden from screen recordings'))
  await h.keyboard.press('Escape')

  // The old single switch moved over, once, so nobody's choice changes.
  const migrate = async (flag, unshared) => {
    await v('settings:set', { inRecordings: HIDDEN, stickiesUnshared: unshared })
    await page.evaluate((flag) => localStorage.setItem('recordable', flag), flag)
    await page.reload()
    await page.waitForTimeout(2000)
    return { seen: (await v('settings')).inRecordings, left: await page.evaluate(() => localStorage.getItem('recordable')) }
  }
  let moved = await migrate('on', true)
  const same = (a, b) => ['main', 'box', 'stickies', 'bubble'].every((kind) => a?.[kind] === b[kind])
  check('old “Show Vigil” on with “Except sticky notes”: all show but sticky notes', same(moved.seen, { main: true, box: true, stickies: false, bubble: true }) && moved.left === null, JSON.stringify(moved))
  moved = await migrate('on', false)
  check('old “Show Vigil” on without the exception: all show', same(moved.seen, { main: true, box: true, stickies: true, bubble: true }) && moved.left === null, JSON.stringify(moved))
  moved = await migrate('off', false)
  check('old “Show Vigil” off: all stay hidden', JSON.stringify(moved.seen) === JSON.stringify(HIDDEN) && moved.left === null, JSON.stringify(moved))
  now = await guarded()
  check('…and the windows match', now.filter((one) => one.kind !== 'other').every((one) => one.on), JSON.stringify(now))

  // --- 2. What plays for each --------------------------------------------------
  await c.go('home')
  await h.keyboard.press('Escape')
  const card = async (kind) => {
    await h.evaluate(() => document.querySelectorAll('[data-celebration] [role=status]').forEach(() => undefined))
    await h.mouse.click(5, 5)
    await h.keyboard.press('Escape')
    await wait(500)
    await h.evaluate((kind) => window.dispatchEvent(new CustomEvent('vigil:celebrate', { detail: { id: `qa:${Math.random()}`, kind, rank: 0, headline: 'Inbox empty', line: 'A check.', mark: '0', tint: 'green' } })), kind)
    await h.waitForSelector('[data-celebration] [role=status]', { timeout: 8000 }).catch(() => undefined)
    await wait(1200)
    return h.evaluate(() => {
      const box = document.querySelector('[data-celebration] [role=status]')
      return { shown: !!box, giphy: !!box?.querySelector('[data-giphy-attribution]'), video: box?.querySelector('video')?.getAttribute('src') ?? '', img: box?.querySelector('img')?.getAttribute('src') ?? '' }
    })
  }
  // Vigil's drawing: one of the paper drawings, the same for the kind, its number in ink, a beam round it.
  await v('settings:set', { celebrationSources: { inbox: 'drawing' } })
  let seen = await card('inbox')
  const drawn = await h.evaluate(() => {
    const box = document.querySelector('[data-celebration] [role=status]')
    return { paper: !!box?.querySelector('[data-paper-cover] img[src*="drawings"], [data-paper-cover] img[src*=".webp"]'), number: !!box?.querySelector('[data-celebration-drawing]'), beam: !!box?.querySelector('.mf-beam-card') }
  })
  check('“Vigil’s drawing”: a paper drawing with its number, no GIF', seen.shown && !seen.video && !seen.giphy && drawn.paper && drawn.number, JSON.stringify({ seen, drawn }))
  check('…with a beam round the card', drawn.beam)

  const search = await v('celebrations:giphy:search', 'thumbs up')
  check('Giphy can be searched with words of your own', search.gifs.length > 0 && search.gifs[0].still.startsWith('mindflow://celebrate/'), `${search.gifs.length} found${search.why ? `, ${search.why}` : ''}`)
  const picked = search.gifs.length ? await v('celebrations:giphy:pick', search.gifs[0].id) : null
  check('one picked is downloaded, with what to pin', !!picked?.pin?.id && picked.media.url.endsWith('.mp4'))
  await v('settings:set', { celebrationSources: {}, celebrationPicks: { inbox: [GIF] }, giphyPins: picked ? { inbox: picked.pin } : {} })
  const mine = (await v('celebrations:picks')).inbox?.[0]?.url
  seen = await card('inbox')
  check('never chosen, a file of yours beats a pinned GIF', seen.img === mine && !seen.giphy, JSON.stringify({ seen, mine }))
  await v('settings:set', { celebrationSources: { inbox: 'giphy' } })
  seen = await card('inbox')
  // With Motion off it is the GIF's still frame; with it on, the clip.
  const pinned = await v('celebrations:giphy:pinned', 'inbox')
  const isPinned = (seen) => !!pinned && (seen.video === pinned.url || seen.img === pinned.still)
  check('“Giphy” chosen: the pinned GIF plays, with “Powered by GIPHY”, the files kept', seen.giphy && isPinned(seen) && (await v('settings')).celebrationPicks.inbox?.length === 1, JSON.stringify({ seen, pinned }))
  // Offline: still the pinned one, from the cache.
  await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.giphy.com/*'] }, (_d, done) => done({ cancel: true })))
  seen = await card('inbox')
  check('offline, the pinned GIF still plays from the cache', seen.giphy && isPinned(seen), JSON.stringify(seen))
  await v('settings:set', { motion: true })
  seen = await card('inbox')
  check('…moving, with Motion on', seen.giphy && seen.video === pinned?.url, JSON.stringify(seen))
  if (SHOTS) await h.locator('[data-celebration] [role=status]').first().screenshot({ path: `${SHOTS}/card-pinned-paper.png` }).catch(() => undefined)
  await v('settings:set', { motion: false })
  await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null))
  await v('settings:set', { celebrationSources: { inbox: 'file' } })
  seen = await card('inbox')
  check('“Your file” chosen back: the file plays again', seen.img === mine, JSON.stringify(seen))
  // Nothing chosen and nothing pinned: Giphy, on from the start, a random one for your words.
  await v('settings:set', { celebrationSources: {}, celebrationPicks: {}, giphyPins: {} })
  seen = await card('streak')
  check('never chosen: a random GIF from Giphy (on from the start)', seen.giphy && (seen.video.endsWith('.mp4') || seen.img.endsWith('.gif')) && !isPinned(seen), JSON.stringify(seen))

  // --- 3. A task done: just the tick, unless you chose what plays -----------
  await h.mouse.click(5, 5)
  await h.keyboard.press('Escape')
  const taskCard = async () => {
    await wait(3300)
    await h.evaluate(() => (window.__cards = 0, new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[role=status]') || n.querySelector?.('[role=status]')) && n.closest?.('[data-celebration]')) window.__cards++ }).observe(document.body, { childList: true, subtree: true })))
    const task = await v('task:add', `Check ${Math.random().toString(36).slice(2, 6)}`)
    await v('task:done', task.id ?? task)
    await wait(2500)
    return h.evaluate(() => window.__cards)
  }
  check('main window: a task done with nothing chosen gets no card, though the rest play Giphy', (await taskCard()) === 0)
  await v('settings:set', { celebrationSources: { taskDone: 'giphy' } })
  check('main window: with “Giphy” chosen for “A task done”, its card plays', (await taskCard()) >= 1)
  await v('settings:set', { celebrationSources: {}, celebrationPicks: { taskDone: [GIF] } })
  check('main window: with a file chosen for “A task done”, its card plays', (await taskCard()) >= 1)

  // The Today sticky: one ticked is just the tick; the last one ticked, All done.
  for (const title of ['Water the plants', 'Post the letter', 'Call the bank']) await v('task:add', title, null, true)
  let sticky
  for (let i = 0; i < 40 && !(sticky = electron.windows().find((w) => w.url().includes('type=today'))); i++) await wait(200)
  await sticky.waitForSelector('[role=checkbox]')
  await wait(800)
  await sticky.evaluate(() => (window.__cards = 0, new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[role=status]') || n.querySelector?.('[role=status]'))) window.__cards++ }).observe(document.body, { childList: true, subtree: true })))
  // Each sound made is counted: the tick is drawn by the page's own synth, not a recording.
  await sticky.evaluate(() => {
    window.__sounds = 0
    const own = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () { window.__sounds++; return own.call(this) }
    const buffer = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function () { window.__sounds++; return buffer.call(this) }
  })
  const boxes = sticky.locator('[role=checkbox][aria-checked="false"]')
  const open = await boxes.count()
  await boxes.first().click()
  await wait(3000)
  check('Today sticky: one task ticked gets no card, even with a file chosen for “A task done”', (await sticky.evaluate(() => window.__cards)) === 0)
  check('…it gets the tick sound', (await sticky.evaluate(() => window.__sounds)) > 0, `${await sticky.evaluate(() => window.__sounds)} sounds`)
  check('…and its row is struck', (await sticky.locator('[role=checkbox][aria-checked="true"]').count()) >= 1)
  for (let i = 1; i < open; i++) {
    await sticky.locator('[role=checkbox][aria-checked="false"]').first().click()
    await wait(250)
  }
  await wait(4500)
  check('Today sticky: the whole list done gets its All done card', (await sticky.evaluate(() => window.__cards)) >= 1)
  await v('settings:set', { celebrationPicks: {} })

  // --- 4. Settings: the rows, previews, searching, pinning ------------------
  await c.go('settings')
  await h.getByText('Scenery', { exact: true }).first().click()
  await wait(1500)
  const list = h.locator('[data-celebration-picks]')
  await list.scrollIntoViewIfNeeded()
  const row = (kind) => h.locator(`[data-moment="${kind}"]`)
  const status = (kind) => row(kind).locator('[data-moment-status]').textContent()
  check('“What plays for each” lists every moment, each with its picture and a “Preview”', (await h.locator('[data-moment]').count()) === 14 && (await h.locator('[data-moment-thumb]').count()) === 14 && (await h.locator('[data-moment] button', { hasText: 'Preview' }).count()) === 14)
  check('no Giphy switch any more; its search words stay', (await h.getByText('Celebrate with a GIF from Giphy').count()) === 0 && (await h.getByText('Giphy search words', { exact: true }).count()) === 1)
  check('“A task done” says just the tick by default', (await status('taskDone')) === 'Just the tick, no card')
  check('the others say a random GIF for your words by default', /^A random GIF for “/.test(await status('inbox')), await status('inbox'))
  await h.waitForFunction(() => document.querySelector('[data-moment="inbox"] [data-moment-thumb] img')?.getAttribute('src')?.startsWith('mindflow://'), null, { timeout: 30000 }).catch(() => undefined)
  check('…and show one of today’s GIFs as their picture', (await row('inbox').locator('[data-moment-thumb] img').getAttribute('src').catch(() => '') ?? '').startsWith('mindflow://celebrate/'))
  await row('inbox').getByRole('button', { name: 'Vigil’s drawing', exact: true }).click()
  await wait(700)
  check('“Vigil’s drawing” chosen: the row says so, its picture is the drawing', (await status('inbox')) === 'Vigil’s paper drawing' && /\.webp|drawings/.test(await row('inbox').locator('[data-moment-thumb] img').getAttribute('src')))
  await row('inbox').locator('button', { hasText: 'Preview' }).click()
  await h.waitForSelector('[data-celebration] [role=status] [data-celebration-drawing]', { timeout: 6000 }).catch(() => undefined)
  check('“Preview” plays exactly that: the drawing card', (await h.locator('[data-celebration] [role=status] [data-celebration-drawing]').count()) === 1)
  if (SHOTS) {
    await v('settings:set', { motion: true })
    await h.evaluate(() => delete document.documentElement.dataset.motion)
    await h.mouse.click(5, 5)
    await h.keyboard.press('Escape')
    await wait(600)
    await row('inbox').locator('button', { hasText: 'Preview' }).click()
    await wait(650)
    await h.screenshot({ path: `${SHOTS}/card-drawing-paper.png` })
    await v('settings:set', { motion: false })
  }
  await row('inbox').getByRole('button', { name: 'Giphy', exact: true }).click()
  await h.waitForSelector('[data-giphy-search] [data-giphy-pin]', { timeout: 15000 }).catch(() => undefined)
  check('choosing “Giphy” opens a search right in the row, with results', (await row('inbox').locator('[data-giphy-pin]').count()) > 0)
  if (SHOTS) {
    await row('inbox').scrollIntoViewIfNeeded()
    await wait(900)
    await h.screenshot({ path: `${SHOTS}/giphy-search-paper.png` })
  }
  const first = row('inbox').locator('[data-giphy-pin]').first()
  const pinId = await first.getAttribute('data-giphy-pin')
  await first.click({ force: true })
  await wait(2500)
  check('pinning saves that GIF for the moment', (await v('settings')).giphyPins?.inbox?.id === pinId && (await v('settings')).celebrationSources?.inbox === 'giphy')
  check('…and the row says it is pinned', /pinned from Giphy$/.test(await status('inbox')), await status('inbox'))
  await row('inbox').getByRole('button', { name: 'Use a random one', exact: true }).click()
  await wait(700)
  check('“Use a random one instead” lets the pin go', !(await v('settings')).giphyPins?.inbox)
  await first.click({ force: true }).catch(() => undefined)
  await wait(2500)
  await row('inbox').getByRole('button', { name: 'Done', exact: true }).click()
  await wait(500)
  await v('settings:set', { celebrationPicks: { stickyDone: [GIF] }, celebrationSources: { ...(await v('settings')).celebrationSources, stickyDone: 'file', tasks: 'drawing' } })
  await wait(1500)
  const own = (await v('celebrations:picks')).stickyDone?.[0]?.url
  const thumbs = await row('stickyDone').evaluate((one) => ({ top: one.querySelector('[data-moment-thumb] img')?.getAttribute('src'), files: [...one.querySelectorAll('[data-moment-file]')].map((f) => ({ src: f.querySelector('img')?.getAttribute('src'), text: f.textContent })) }))
  check('“Your file”: its picture is the file itself, at the start of the row and by its name below', !!own && thumbs.top === own && thumbs.files.length === 1 && thumbs.files[0].src === own && thumbs.files[0].text.includes('cheer.webp'), JSON.stringify({ own, thumbs }))
  if (SHOTS) {
    await row('taskDone').evaluate((one) => one.scrollIntoView({ block: 'start' }))
    await wait(500)
    await h.screenshot({ path: `${SHOTS}/what-plays-paper.png` })
    // The same, dark.
    await c.theme('dark')
    await c.go('settings')
    await h.getByText('Scenery', { exact: true }).first().click()
    await wait(1500)
    await h.locator('[data-moment="taskDone"]').evaluate((one) => one.scrollIntoView({ block: 'start' }))
    await wait(500)
    await h.screenshot({ path: `${SHOTS}/what-plays-dark.png` })
    await v('settings:set', { motion: true })
    await h.evaluate(() => delete document.documentElement.dataset.motion)
    await h.locator('[data-moment="tasks"]').locator('button', { hasText: 'Preview' }).click()
    await wait(650)
    await h.screenshot({ path: `${SHOTS}/card-drawing-dark.png` })
    await v('settings:set', { motion: false })
    await h.getByText('What comes back to you', { exact: true }).first().click()
    await wait(800)
    await h.locator('[data-setting]').filter({ hasText: 'Hide from recordings' }).scrollIntoViewIfNeeded()
    await wait(400)
    await h.screenshot({ path: `${SHOTS}/recordings-dark.png` })
    await c.theme('paper')
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
