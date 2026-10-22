// Blocked tabs put back, and sessions kept to their own book, with the
// browser stubbed (no real browser is ever spoken to) and a temporary data
// folder of books. A tab sent away keeps the address it was on: “Allow 5 min”
// puts it straight back there, a new tab when it was closed or moved on, and
// the card says so when even that could not be done. When the allowance ends
// the site is sent away again, with its new address kept. A break, the session
// ended or abandoned, a quit, a switch and the next launch after a crash each
// put every blank tab back. Switching books with a session running asks “End
// it” or “Keep it running”; kept, the next book's pill names it and a click
// goes back, and nothing is ever written into the wrong book.
//
//   npx electron-vite build --outDir out-siteback
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-siteback/main/index.js HALIGTREE_QA_AWAY=1 node qa/site-block-back.mjs
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.setMaxListeners(40)
const root = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'haligtree-siteback-'))
if (root.includes('Application Support')) throw new Error('never the real data folder')
process.env.QA_DATA = root
const { check, done } = checks()
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const tabsFile = join(root, 'site-block-tabs.json')

const launch = (args = '') => ((process.env.QA_ARGS = args), sandbox({ seeded: false }))
const tools = (c) => ({
  fake: (one) => c.electron.evaluate((_, f) => void (globalThis.siteBlockFake = f), one),
  sentAway: () => c.electron.evaluate(() => (globalThis.siteBlockAway ?? []).map((one) => one.url)),
  back: () => c.electron.evaluate(() => globalThis.siteBlockBack ?? []),
  windowOf: async (part) => {
    for (let i = 0; i < 50; i++) {
      const found = c.electron.windows().find((one) => one.url().includes(part))
      if (found) return found
      await wait(200)
    }
    return null
  }
})
// The restart is caught, not made, as books.mjs does.
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c) => {
  for (let i = 0; i < 60 && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await wait(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const rows = (file) => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare('select id, goal, ended_at as endedAt from sessions order by started_at').all()
  } finally {
    db.close()
  }
}
const lastBack = async (t, url) => (await t.back()).filter((one) => one.url === url).at(-1)

let book, kept
// --- 1. My book: allowed, re-blocked, a closed tab, a browser gone, a break, an end, a crash.
{
  const c = await launch()
  const t = tools(c)
  try {
    book = await c.v('books:create', 'Second book')
    // Welcomed already, as a real My book is: the welcome is not over the switch.
    await c.v('onboarding:set', { welcomed: new Date().toISOString() })
    await c.v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', focusTools: true, siteBlock: true, blockSites: ['x.com', 'youtube.com', 'reddit.com', 'facebook.com'], quietStart: '03:00', quietEnd: '03:01' })
    const task = await c.v('task:add', 'Write the essay plan')
    const session = await c.v('session:start', task?.id ?? task, 'Write the essay plan', 40 * 60_000)

    await t.fake({ app: 'com.google.Chrome', url: 'https://www.x.com/home?tab=1', win: 3, tab: 42 })
    await wait(2600)
    check('x.com in Chrome is sent away', (await t.sentAway()).includes('https://www.x.com/home?tab=1'))
    const kept1 = existsSync(tabsFile) ? JSON.parse(readFileSync(tabsFile, 'utf8')) : []
    check('its address is written down beside the books, for a run after a crash', JSON.stringify(kept1).includes('https://www.x.com/home?tab=1'), JSON.stringify(kept1))
    const card = await t.windowOf('view=nudge')
    await card?.waitForTimeout(700)
    await card?.click('[data-nudge-allow]')
    await wait(600)
    const first = await lastBack(t, 'https://www.x.com/home?tab=1')
    check('“Allow 5 min” puts that very tab back on the exact address', first && first.app === 'com.google.Chrome' && first.win === 3 && first.tab === 42 && first.open === true && first.result === 'restored', JSON.stringify(first))
    check('the stub tab shows the page again, no refresh', (await c.electron.evaluate(() => globalThis.siteBlockFake.url)) === 'https://www.x.com/home?tab=1')
    check('and the card says nothing went wrong', !(await card?.$('[data-nudge-missed]')))

    // Six minutes on: the allowance is over, and x.com is sent away again, its new address kept.
    await c.electron.evaluate((_, code) => new Function(`(${code})(${6 * 60_000})`)(), shiftClock.toString())
    await t.fake({ app: 'com.google.Chrome', url: 'https://x.com/explore', win: 3, tab: 42 })
    await wait(2600)
    check('once the allowance ends, x.com is sent away again', (await t.sentAway()).includes('https://x.com/explore'))
    const again = await c.v('site-block:allow', 'x.com')
    const second = await lastBack(t, 'https://x.com/explore')
    check('allowed again, it goes back to the newer address', second?.result === 'restored' && second.tab === 42 && again && !again.missed, JSON.stringify(second))

    // The tab closed meanwhile: a new tab in the browser's front window.
    await t.fake({ app: 'com.apple.Safari', url: 'https://m.youtube.com/watch?v=7', win: 9, tab: 2 })
    await wait(2600)
    await t.fake({ app: 'com.apple.Safari', url: 'https://example.org/', back: 'opened' })
    const opened = await c.v('site-block:allow', 'youtube.com')
    const third = await lastBack(t, 'https://m.youtube.com/watch?v=7')
    check('a tab closed meanwhile: opened in a new tab in Safari, with its address', third?.result === 'opened' && third.app === 'com.apple.Safari' && third.open && !opened.missed, JSON.stringify(third))

    // The browser quit meanwhile: the card says so, in plain words.
    await t.fake({ app: 'company.thebrowser.Browser', url: 'https://old.reddit.com/r/books', win: 1, tab: 'arc-5' })
    await wait(2600)
    await t.fake({ app: 'com.apple.TextEdit', back: 'missed' })
    const notice = await t.windowOf('view=nudge')
    await wait(700)
    await notice?.click('[data-nudge-allow]')
    await wait(700)
    const missedLine = await notice?.$eval('[data-nudge-missed]', (one) => ({ text: one.textContent, size: parseFloat(getComputedStyle(one).fontSize) })).catch(() => null)
    check('Arc gone: the card says Haligtree could not open the page again, at a readable size', missedLine?.text?.includes('could not open the page again') && missedLine.size >= 13, JSON.stringify(missedLine))
    check('the ask to Arc carried its address', (await lastBack(t, 'https://old.reddit.com/r/books'))?.app === 'company.thebrowser.Browser')

    // A break: sites open again, and the blank tab goes back.
    await t.fake({ app: 'com.microsoft.edgemac', url: 'https://www.facebook.com/groups/1', win: 2, tab: 11 })
    await wait(2600)
    check('facebook.com in Edge is sent away', (await t.sentAway()).includes('https://www.facebook.com/groups/1'))
    await t.fake({ app: 'com.microsoft.edgemac', url: 'about:blank', win: 2, tab: 11 })
    await c.v('break:start', session, 5 * 60_000)
    await wait(2600)
    const onBreak = await lastBack(t, 'https://www.facebook.com/groups/1')
    check('a break puts the blank tab back on its page, without opening new tabs', onBreak?.result === 'restored' && onBreak.open === false && onBreak.tab === 11, JSON.stringify(onBreak))

    // The session ended (as the pill or the notch ends it: the same save).
    const rounds = [
      ['ended', (id) => c.v('session:end', id, '', false), 'https://www.youtube.com/shorts/a', 'com.brave.Browser'],
      ['abandoned', (id) => c.v('session:abandon', id), 'https://www.youtube.com/shorts/b', 'company.thebrowser.dia'],
      ['paused', (id) => c.v('session:pause', id), 'https://www.youtube.com/shorts/c', 'com.google.Chrome']
    ]
    for (const [how, end, url, app] of rounds) {
      const id = await c.v('session:start', task?.id ?? task, 'Write the essay plan', 40 * 60_000)
      await t.fake({ app, url, win: 1, tab: 1 })
      await wait(2600)
      await end(id)
      await wait(2600)
      check(`the session ${how}: its blank tab goes back (${app})`, (await lastBack(t, url))?.result === 'restored', JSON.stringify(await lastBack(t, url)))
      if (how === 'paused') await c.v('session:end', id, '', false)
    }
    check('nothing left written down once all are back', !existsSync(tabsFile))

    // A crash: one tab left blank, the app gone without a word.
    const crash = await c.v('session:start', task?.id ?? task, 'Write the essay plan', 40 * 60_000)
    kept = crash
    await t.fake({ app: 'com.google.Chrome', url: 'https://www.reddit.com/r/crash', win: 1, tab: 77 })
    await wait(2600)
    check('before the crash, its address is written down', existsSync(tabsFile) && readFileSync(tabsFile, 'utf8').includes('r/crash'))
  } catch (error) {
    check('part 1 ran to the end', false, String(error).slice(0, 400))
  }
  try {
    c.electron.process().kill('SIGKILL')
  } catch {}
  await c.close()
}
await wait(1200)

// --- 2. The next launch, into the second book: the tab left blank goes back; a quit puts them back first.
{
  const c = await launch(`--book=${book}`)
  const t = tools(c)
  try {
    await wait(3000)
    const after = await lastBack(t, 'https://www.reddit.com/r/crash')
    check('the next launch after a crash puts the blank tab back, in another book too', after?.result === 'restored' && after.tab === 77, JSON.stringify(after))
    await c.v('settings:set', { countIn: false, focusShows: 'bubble', focusTools: true, siteBlock: true, blockSites: ['x.com'], quietStart: '03:00', quietEnd: '03:01' })
    const task = await c.v('task:add', 'Plan the trip')
    const id = await c.v('session:start', task?.id ?? task, 'Plan the trip', 30 * 60_000)
    await t.fake({ app: 'com.google.Chrome', url: 'https://x.com/quit', win: 1, tab: 5 })
    await wait(2600)
    await c.electron.evaluate(({ app }) => {
      app.quit = () => void (globalThis.__quit = true)
      app.emit('before-quit', { preventDefault() {} })
    })
    await wait(800)
    check('a quit puts every blank tab back before Haligtree goes', (await lastBack(t, 'https://x.com/quit'))?.result === 'restored', JSON.stringify(await t.back()))
    check('and then quits', await c.electron.evaluate(() => globalThis.__quit === true))
    await c.v('session:end', id, '', false)
  } catch (error) {
    check('part 2 ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}
await wait(1200)

// --- 3. My book again, its session still running: the switch asks.
{
  const c = await launch()
  const t = tools(c)
  try {
    await stub(c)
    await t.fake({ app: 'com.apple.TextEdit' })
    const ask = () => c.h.evaluate((one) => window.dispatchEvent(new CustomEvent('haligtree:book-switch', { detail: one })), book)
    await ask()
    await c.h.waitForTimeout(700)
    const words = await c.h.$eval('[data-book-running]', (one) => one.textContent).catch(() => '')
    check('switching with a session running asks “End it” or “Keep it running”, naming the book', words.includes('A focus session is running in My book') && words.includes('End it') && words.includes('Keep it running'), words)
    await c.h.keyboard.press('Escape')
    await c.h.waitForTimeout(500)
    check('Esc stays: no switch, the session still running', !(await c.electron.evaluate(() => globalThis.__relaunched)) && (await c.v('focus:now'))?.id === kept)
    await ask()
    await c.h.waitForTimeout(700)
    await c.h.click('[data-running-choice="keep"]')
    const args = await relaunched(c)
    check('Keep it running switches to the book', (args ?? []).includes(`--book=${book}`), JSON.stringify(args))
    check('with the session still open in My book, and its book remembered', JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')).kept === 'default')
  } catch (error) {
    check('part 3 ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}
await wait(1200)
const bookDb = join(root, 'books', book, 'haligtree.db')
const bookBefore = rows(bookDb).length

// --- 4. The second book: its pill names My book's session; a click goes back; nothing written here.
{
  const c = await launch(`--book=${book}`)
  const t = tools(c)
  try {
    const pill = await t.windowOf('view=focus')
    let said = ''
    for (let i = 0; i < 30 && !said; i++) {
      said = await pill?.$eval('[data-focus-elsewhere]', (one) => one.textContent).catch(() => '')
      if (!said) await wait(300)
    }
    check('the pill names the book the session runs in, with its goal and time', said.includes('In My book') && said.includes('Write the essay plan') && /\d{2}:\d{2}/.test(said), said)
    check('this book itself has no session running', !(await c.v('focus:now')))
    await stub(c)
    await pill.click('[data-focus-elsewhere]')
    const args = await relaunched(c)
    check('a click on it goes back to My book', !!args && !(args ?? []).some((one) => one.startsWith('--book=b-')), JSON.stringify(args))
    check('and the second book was never written a session by it', rows(bookDb).length === bookBefore, `${rows(bookDb).length} vs ${bookBefore}`)
  } catch (error) {
    check('part 4 ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}
await wait(1200)

// --- 5. My book: the session ran on there; End it ends it, saved here.
{
  const c = await launch()
  try {
    check('back in My book, its own session is still running', (await c.v('focus:now'))?.id === kept)
    check('and the note of where it was kept is forgotten', !JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')).kept || (await c.v('books:elsewhere')) === null)
    await stub(c)
    await c.h.evaluate((one) => window.dispatchEvent(new CustomEvent('haligtree:book-switch', { detail: one })), book)
    await c.h.waitForTimeout(700)
    await c.h.click('[data-running-choice="end"]')
    const args = await relaunched(c)
    check('End it ends the session, then switches', !!args && !(await c.v('focus:now')), JSON.stringify(args))
    await c.close()
    await wait(800)
    const mine = rows(join(root, 'haligtree.db')).find((one) => one.id === kept)
    check('the ended session is saved in My book, where it ran', !!mine?.endedAt, JSON.stringify(mine))
    check('and never in the second book', !rows(bookDb).some((one) => one.id === kept))
  } catch (error) {
    check('part 5 ran to the end', false, String(error).slice(0, 400))
    await c.close()
  }
}
done()
