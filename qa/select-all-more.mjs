// ⌘A and picking on the pages that mix kinds: Home, a tag, and ⌘K's results;
// and proof that ⌘A reaches the list before the app menu's Edit > Select All.
// Off screen, in a fresh sandbox. SHOTS=dir keeps pictures in several themes.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=… node qa/select-all-more.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'mindflow-select-more-'))
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const picked = () => h.evaluate(() => document.querySelectorAll('[data-picked]').length)
const bar = () => h.evaluate(() => document.querySelector('[data-pick-bar]')?.textContent ?? '')
const toastText = () => h.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
const blur = () => h.evaluate(() => { document.activeElement?.blur?.(); getSelection()?.removeAllRanges() })
const openTasks = async () => (await v('tasks')).filter((task) => task.status === 'open').length
// A key as the window gets it from the system: through Electron's own input path,
// so a key the page leaves alone goes on to the app menu, as a real press does.
const realKey = (code, modifiers = []) => electron.evaluate(({ BrowserWindow }, [code, modifiers]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers })
  win.webContents.sendInputEvent({ type: 'char', keyCode: code.toLowerCase(), modifiers })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers })
}, [code, modifiers])
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { safeMode: false, motion: false, quietStart: '03:00', quietEnd: '03:01' })
  await c.theme('paper')

  // The menu: what Edit > Select All is, and that ⌘A goes to the list before it.
  const menu = await electron.evaluate(({ Menu }) => {
    const all = (items) => items.flatMap((one) => [one, ...(one.submenu ? all(one.submenu.items) : [])])
    const app = Menu.getApplicationMenu()
    return app ? all(app.items).filter((one) => /select ?all/i.test(one.role ?? '') || /select all/i.test(one.label ?? '')).map((one) => `${one.label} role=${one.role} key=${one.accelerator ?? '(role default ⌘A)'}`) : []
  })
  console.log('      app menu:', menu.join(' | ') || 'none')
  await c.go('inbox')
  await h.waitForTimeout(1200)
  await blur()
  await realKey('A', ['meta'])
  await h.waitForTimeout(500)
  const words = await h.evaluate(() => getSelection()?.toString().length ?? 0)
  check('a real ⌘A on the Inbox picks the rows, and the menu does not also select the page', (await picked()) > 0 && words === 0, `${await picked()} picked, ${words} characters selected`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  // And if the menu bar hears ⌘A first: its Select All asks the page, so the list still takes it.
  const menuSelectAll = () => electron.evaluate(({ BrowserWindow, Menu }) => {
    const all = (items) => items.flatMap((one) => [one, ...(one.submenu ? all(one.submenu.items) : [])])
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    all(Menu.getApplicationMenu().items).find((one) => one.label === 'Select All').click(undefined, win, win.webContents)
  })
  await blur()
  await menuSelectAll()
  await h.waitForTimeout(500)
  check('the menu bar’s Select All on the Inbox picks the rows, not the page’s words', (await picked()) > 0 && (await h.evaluate(() => getSelection()?.toString().length ?? 0)) === 0, `${await picked()} picked`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  // While writing, the menu bar's Select All still selects the words, never the rows.
  await h.locator('[data-row]').first().click()
  await h.waitForTimeout(1200)
  await h.locator('.ProseMirror').first().click()
  await menuSelectAll()
  await h.waitForTimeout(500)
  check('in a note, the menu bar’s Select All selects its words, not the rows', (await picked()) === 0 && (await h.evaluate(() => getSelection()?.toString().length ?? 0)) > 0)
  await h.keyboard.press('ArrowRight')
  await blur()

  // Home: ⌘A picks every card on show; ⌘-click takes one back (⇧-click picks a run, as Finder does: pick-range.ts); Make tasks; ⌘Z.
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    await c.go('home')
    await h.waitForTimeout(1500)
    await blur()
    await h.keyboard.press('Meta+a')
    await h.waitForTimeout(400)
    const n = Number((await bar()).match(/(\d+) selected/)?.[1])
    check(`${theme}: Home: ⌘A picks every card on show`, n > 3 && (await picked()) > 3, `${n} selected, ${await picked()} marked`)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/home-all-${theme}.png` })
    await h.locator('[data-picked][data-drag-open]').first().click({ modifiers: ['Meta'] })
    await h.waitForTimeout(300)
    check(`${theme}: Home: ⌘-click takes one back`, Number((await bar()).match(/(\d+) selected/)?.[1]) === n - 1)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    check(`${theme}: Home: Escape lets them go`, !(await bar()) && (await picked()) === 0)
  }
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const t0 = await openTasks()
  const make = h.locator('[data-pick-bar]').getByRole('button', { name: /^Make (\d+ tasks|it a task)$/ })
  check('Home: the bar offers “Make N tasks”', (await make.count()) > 0, await bar())
  await make.first().click()
  await h.waitForTimeout(1500)
  check('Home: tasks made, said with a count and Undo', (await openTasks()) > t0 && /tasks? made|Now a task|Skipped/.test(await toastText()) && (await toastText()).includes('Undo'), await toastText())
  await blur()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1200)
  check('Home: ⌘Z takes them back', (await openTasks()) === t0, `${await openTasks()} of ${t0}`)

  // A tag, as a list: ⌘A, the tracks marked, ⇧-click.
  const tags = (await v('tags')).sort((a, b) => b.count - a.count)
  await h.evaluate(() => localStorage.setItem('tag:view', 'list'))
  await c.theme('paper')
  await c.send('tag', tags[0].tag)
  await h.waitForTimeout(1800)
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  const tn = Number((await bar()).match(/(\d+) selected/)?.[1])
  check(`#${tags[0].tag}: ⌘A picks every note in it`, tn > 1 && (await picked()) > 1, `${tn} selected, ${await picked()} marked, tag has ${tags[0].count}`)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/tag-all-paper.png` })
  await h.locator('[data-picked][data-pick]').first().click({ modifiers: ['Meta'] })
  await h.waitForTimeout(300)
  check(`#${tags[0].tag}: ⌘-click takes one back`, Number((await bar()).match(/(\d+) selected/)?.[1]) === tn - 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check(`#${tags[0].tag}: Escape lets them go`, (await picked()) === 0)

  // ⌘K: ⌘A selects the words first, then every result; Escape lets them go, then closes.
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('the', { delay: 20 })
  await h.waitForTimeout(1200)
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(200)
  const first = await h.evaluate(() => ({ text: getSelection()?.toString() || (document.activeElement?.selectionEnd ?? 0) - (document.activeElement?.selectionStart ?? 0), picked: document.querySelectorAll('[data-picked]').length }))
  check('⌘K: the first ⌘A selects the words', first.picked === 0 && first.text, JSON.stringify(first))
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  const sn = Number((await bar()).match(/(\d+) selected/)?.[1])
  check('⌘K: the next ⌘A picks every result', sn > 1 && (await picked()) > 0, `${sn} selected`)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/search-all-paper.png` })
  await h.locator('[data-picked][data-row]').first().click({ modifiers: ['Meta'] })
  await h.waitForTimeout(300)
  check('⌘K: ⌘-click takes one back', Number((await bar()).match(/(\d+) selected/)?.[1]) === sn - 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check('⌘K: Escape lets them go and search stays open', (await picked()) === 0 && (await h.evaluate(() => !!document.querySelector('[role="dialog"], input[placeholder*="search" i]'))))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // The picked tint in every theme: the Inbox with a few rows picked.
  if (SHOTS) {
    await c.go('inbox')
    await h.waitForTimeout(1200)
    for (const theme of ['paper', 'light', 'github', 'adwaita', 'everforest', 'rose-pine', 'gruvbox', 'catppuccin', 'dark', 'midnight', 'dracula', 'tokyonight', 'obsidian-nord', 'kanagawa']) {
      await c.theme(theme)
      await c.go('inbox')
      await h.waitForTimeout(800)
      await h.locator('[data-row]').first().waitFor({ timeout: 8000 }).catch(() => undefined)
      await blur()
      for (const key of ['j', 'x', 'j', 'j', 'x']) await h.keyboard.press(key)
      await h.waitForTimeout(300)
      const list = await h.locator('[data-row]').first().evaluate((one) => { const box = one.parentElement.parentElement.getBoundingClientRect(); return { x: box.x, y: Math.max(0, one.getBoundingClientRect().y - 8), width: box.width, height: 260 } })
      await h.screenshot({ path: `${SHOTS}/tint-${theme}.png`, clip: list })
      await h.keyboard.press('Escape')
    }
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
