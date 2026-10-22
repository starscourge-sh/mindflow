// The focus timer and website blocking behind one switch (Settings, Tasks).
// A new book starts with it off, and then nothing of either shows: "5m tea"
// in quick capture is only words, ⌘K has no "Start focus…", a task's menu
// has no "Start a focus session", What Haligtree can do has no timer cards
// but one line saying where to turn it on, and Settings shows only the
// switch. Turned on, all of it is back. A book that already ran a session,
// with no answer saved yet, comes up with it on.
//
// The block page: a blocked tab is sent to Haligtree's own page on this Mac,
// which while the round runs says so, and once it ends sends a refresh (and
// its own two-second ask) on to the page that was asked for.
//
//   npx electron-vite build --outDir out-fu
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-fu/main/index.js MINDFLOW_QA_AWAY=1 node qa/focus-setting.mjs
import { mkdtempSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const root = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'vigil-focusset-'))
if (root.includes('Application Support')) throw new Error('never the real data folder')
process.env.QA_DATA = root
process.env.QA_ARGS = ''
const { check, done } = checks()
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'

const launch = async () => {
  const c = await sandbox({ seeded: false, width: 1200, height: 800 })
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })
  await c.h.reload()
  await c.page.reload().catch(() => {})
  await c.h.waitForTimeout(1500)
  return c
}
// What the box says it will do with these words, and whether the timer word is lit.
const boxReads = async (c, words) => {
  await c.page.evaluate(() => window.api.showPrompt())
  await c.page.waitForTimeout(500)
  await c.page.click(EDITOR).catch(() => {})
  await c.page.keyboard.press('Meta+A')
  await c.page.keyboard.press('Backspace')
  await c.page.keyboard.type(words, { delay: 15 })
  await c.page.waitForTimeout(600)
  const lit = await c.page.locator(`${EDITOR} .box-token[data-box-token="timer"]`).count()
  const will = await c.page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  await c.page.keyboard.press('Meta+A')
  await c.page.keyboard.press('Backspace')
  return { lit, will }
}
// ⌘K in the main window, with these words typed: the page's words.
const palette = async (c, words) => {
  await c.h.bringToFront()
  await c.h.click('main', { position: { x: 5, y: 5 } }).catch(() => {})
  await c.h.keyboard.press('Meta+k')
  await c.h.waitForTimeout(500)
  await c.h.keyboard.type(words, { delay: 15 })
  await c.h.waitForTimeout(700)
  const text = await c.h.evaluate(() => document.body.innerText)
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  return text
}
// A task's right-click menu on Today, as words.
const taskMenu = async (c, name) => {
  await c.go('today')
  await c.h.waitForTimeout(600)
  await c.h.click(`text=${name}`, { button: 'right' })
  await c.h.waitForTimeout(500)
  const text = await c.h.evaluate(() => [...document.querySelectorAll('[role="menu"]')].map((one) => one.innerText).join(' | '))
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  return text
}
const powers = async (c) => {
  await c.go('powers')
  await c.h.waitForTimeout(800)
  return c.h.evaluate(() => ({ text: document.body.innerText, off: !!document.querySelector('[data-powers-focus-off]') }))
}
const settingsTasks = async (c) => {
  await c.h.evaluate(() => localStorage.setItem('settings:section', 'Tasks'))
  await c.go('home')
  await c.go('settings')
  await c.h.waitForTimeout(800)
  return c.h.$$eval('section[data-group]', (all) => all.map((one) => one.dataset.group))
}

// --- 1. A new book: off, and nothing of it shows.
{
  const c = await launch()
  try {
    const settings = await c.v('settings')
    check('a new book starts with the focus timer off', settings.focusTools === false, String(settings.focusTools))

    const box = await boxReads(c, '5m tea')
    check('“5m tea” in quick capture is only words: no timer lit', box.lit === 0 && !box.will.includes('timer'), JSON.stringify(box))

    const k = await palette(c, 'start focus')
    check('⌘K has no “Start focus…”', !k.includes('Start focus'), k.slice(0, 200))

    const task = await c.v('task:add', 'Write the essay plan')
    const menu = await taskMenu(c, 'Write the essay plan')
    check('a task’s right-click menu has no “Start a focus session”', menu.includes('Mark it done') && !menu.includes('Start a focus session'), menu.slice(0, 200))

    const p = await powers(c)
    check('What Haligtree can do: no timer cards', !p.text.includes('Timers in plain words') && !p.text.includes('Focus rounds') && !p.text.includes('The five-second rule'))
    check('and one line saying where to turn it on', p.off && p.text.includes('Turn them on in Settings, under Tasks'))

    const groups = await settingsTasks(c)
    check('Settings, Tasks: the switch, no blocking or breaks', groups.includes('Focus timer') && !groups.includes('Blocking websites') && !groups.includes('Breaks and sleep'), groups.join(' | '))

    // --- Turned on: all of it is back.
    await c.h.click('[data-setting]:has-text("Focus timer and site blocking") button[role="switch"]')
    await c.h.waitForTimeout(900)
    check('the switch turns it on', (await c.v('settings')).focusTools === true)
    const after = await c.h.$$eval('section[data-group]', (all) => all.map((one) => one.dataset.group))
    check('on: Blocking websites and Breaks and sleep are back in Settings', after.includes('Blocking websites') && after.includes('Breaks and sleep'), after.join(' | '))
    const box2 = await boxReads(c, '5m tea')
    check('on: “5m tea” lights as a timer', box2.lit === 1 && box2.will.includes('timer'), JSON.stringify(box2))
    const k2 = await palette(c, 'start focus')
    check('on: ⌘K offers “Start focus…”', k2.includes('Start focus'))
    const menu2 = await taskMenu(c, 'Write the essay plan')
    check('on: the task’s menu offers “Start a focus session”', menu2.includes('Start a focus session'), menu2.slice(0, 200))
    const p2 = await powers(c)
    check('on: the timer cards are back, the line gone', p2.text.includes('Timers in plain words') && !p2.off)

    // --- The block page.
    await c.v('settings:set', { countIn: false, siteBlock: true, blockSites: ['x.com'] })
    await c.v('session:start', task?.id ?? task, 'Write the essay plan', 30 * 60_000)
    await c.electron.evaluate((_, f) => void (globalThis.siteBlockFake = f), { app: 'com.google.Chrome', url: 'https://x.com/home?tab=1', win: 1, tab: 7 })
    await wait(2600)
    const sent = await c.electron.evaluate(() => (globalThis.siteBlockAway ?? []).at(-1))
    check('a blocked tab is sent to Haligtree’s own page, carrying its address', /^http:\/\/127\.0\.0\.1:\d+\/vigil-blocked\?/.test(sent?.page ?? '') && sent.page.includes(encodeURIComponent('https://x.com/home?tab=1')), sent?.page)
    const during = await fetch(sent.page, { redirect: 'manual' })
    const page = await during.text()
    check('while the round runs, the page says it is blocked and until when', during.status === 200 && page.includes('is blocked until') && page.includes('a refresh then takes you there'), String(during.status))
    const state = await (await fetch(sent.page.replace('/vigil-blocked?', '/vigil-blocked/state?'))).json()
    check('its two-second ask hears “still blocked”', state.blocked === true, JSON.stringify(state))
    const other = await fetch(sent.page.replace(encodeURIComponent('https://x.com/home?tab=1'), encodeURIComponent('https://example.org/')), { redirect: 'manual' })
    check('a page that is not blocked is sent straight on', other.status === 302 && other.headers.get('location') === 'https://example.org/')
    const bad = await fetch(sent.page.replace(encodeURIComponent('https://x.com/home?tab=1'), encodeURIComponent('javascript:alert(1)')), { redirect: 'manual' })
    check('an address that is not a web page is refused', bad.status === 404)

    // The page itself, open in a hidden window as a browser tab would have it: it asks, and goes on by itself.
    await c.electron.evaluate(({ BrowserWindow }, url) => {
      const tab = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      globalThis.blockTab = tab
      // Where it goes once it may: kept, and the load itself stopped (no real site is ever opened).
      tab.webContents.on('will-navigate', (event, to) => void ((globalThis.blockTabTo = to), event.preventDefault()))
      void tab.loadURL(url)
    }, sent.page)
    await wait(1500)
    const shown = await c.electron.evaluate(() => globalThis.blockTab.webContents.executeJavaScript('document.querySelector("h1").textContent'))
    check('the page, drawn, names the site and the time', /“x\.com” is blocked until \d/.test(shown), shown)
    const focus = await c.v('focus:now')
    await c.v('session:end', focus.id, '', false)
    await wait(3200)
    const went = await c.electron.evaluate(() => { const to = globalThis.blockTabTo; globalThis.blockTab.destroy(); return to })
    check('the round over, the open page goes on to the address by itself, no refresh', went === 'https://x.com/home?tab=1', String(went))
    const refresh = await fetch(sent.page, { redirect: 'manual' })
    check('the round over, a refresh goes on to the page asked for', refresh.status === 302 && refresh.headers.get('location') === 'https://x.com/home?tab=1', `${refresh.status} ${refresh.headers.get('location')}`)
    const ask = await (await fetch(sent.page.replace('/vigil-blocked?', '/vigil-blocked/state?'))).json()
    check('and the page’s own ask hears it may go on', ask.blocked === false)
    const back = await c.electron.evaluate(() => (globalThis.siteBlockBack ?? []).at(-1))
    check('the tab is put back too', back?.url === 'https://x.com/home?tab=1' && back.result === 'restored', JSON.stringify(back))
    check('no page errors', c.errors.filter((one) => one.includes('PAGEERROR')).length === 0, c.errors.join(' | '))
  } catch (error) {
    check('part 1 ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}
await wait(1200)

// --- 2. A book that already ran sessions, never asked: on.
{
  const db = new DatabaseSync(join(root, 'mindflow.db'))
  db.prepare("delete from settings where key = 'focusTools'").run()
  const sessions = db.prepare('select count(*) as n from sessions').get().n
  db.close()
  check('the book has a session from before', sessions > 0, String(sessions))
  const c = await sandbox({ seeded: false })
  try {
    check('a book that ran sessions comes up with the focus timer on', (await c.v('settings')).focusTools === true)
  } catch (error) {
    check('part 2 ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}
done()
