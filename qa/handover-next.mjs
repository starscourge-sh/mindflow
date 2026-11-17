// Three things still wrong on the build the user runs, each driven once.
// 1. "Bring it back" on the third showing of an old draft put nothing in the box.
// 2. Settings › Your book: the reader card leads, and the open book does not look like the ones on the shelf.
// 3. ⌘W that folds a pane away plays one sound, the paper, not the paper and the ordinary fold.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-next/main/index.js HALIGTREE_QA_AWAY=1 node qa/handover-next.mjs
// No --sandbox: the sandbox refuses a new book, and the shelf check needs a second one. QA_DATA is a temp folder.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1180, height: 820, seeded: false })
const { page, h, v, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  // A fresh book opens on the welcome, and ⌘W would close that instead of the pane.
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })

  await page.evaluate(() => {
    localStorage.setItem('capture-leftover', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The old version fee should stop' }] }] }))
    localStorage.setItem('capture-leftover-at', String(Date.now()))
    localStorage.setItem('capture-leftover-shown', '2')
    localStorage.removeItem('capture-draft')
    localStorage.removeItem('capture-draft-at')
  })
  await page.evaluate(() => window.api.hidePrompt())
  await wait(400)
  await page.evaluate(() => window.api.showPrompt())
  await wait(1100)
  const offered = await page.evaluate(() => ({
    chip: document.querySelector('[data-leftover]')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    shown: localStorage.getItem('capture-leftover-shown')
  }))
  check('the third showing still offers the draft', /Bring it back/.test(offered.chip) && offered.shown === '3', JSON.stringify(offered))
  await page.click('[data-leftover]')
  await wait(500)
  const back = await page.evaluate((sel) => ({
    text: document.querySelector(sel)?.innerText ?? '',
    chip: !!document.querySelector('[data-leftover]'),
    left: localStorage.getItem('capture-leftover')
  }), EDITOR)
  check('Bring it back puts the draft in the box', /The old version fee should stop/.test(back.text) && !back.chip && back.left === null, JSON.stringify(back))
  if (shots) await page.screenshot({ path: `${shots}/bring-it-back.png` })

  const made = await v('books:create', 'The other shelf')
  await wait(700)
  // Skip jumps to the last page. The second press leaves. Until then the shot is the welcome, not the shelf.
  for (let press = 0; press < 2; press++) {
    const bye = h.locator('[data-skip]')
    if (!(await bye.count())) break
    await bye.first().click().catch(() => {})
    await wait(500)
  }
  for (let i = 0; i < 24; i++) {
    if (!(await h.evaluate(() => !!document.querySelector('[role="dialog"]')))) break
    await wait(200)
  }
  await go('settings')
  await h.locator('button', { hasText: 'Your book' }).first().click().catch(() => {})
  await wait(600)
  const books = await h.evaluate(() => {
    const groups = [...document.querySelectorAll('[data-group]')].filter((el) => el.getClientRects().length)
    const top = (name) => {
      const el = groups.find((one) => one.getAttribute('data-group') === name)
      return el ? Math.round(el.getBoundingClientRect().top) : null
    }
    const now = document.querySelector('[data-book-role="now"]')
    const shelf = document.querySelector('[data-book-role="shelf"]')
    const edge = (el) => {
      const title = el?.querySelector('.text-body')
      return title ? Math.round(title.getBoundingClientRect().left) : null
    }
    return {
      card: top('Your card'),
      list: top('Books'),
      badge: now?.querySelector('[data-setting-badge]')?.textContent ?? '',
      nowBg: now ? getComputedStyle(now).backgroundColor : '',
      shelfBg: shelf ? getComputedStyle(shelf).backgroundColor : '',
      nowLeft: edge(now),
      shelfLeft: edge(shelf),
      shelfBadge: shelf?.querySelector('[data-setting-badge]')?.textContent ?? '',
      nowTitle: now?.getAttribute('data-setting-title') ?? '',
      shelfTitle: shelf?.getAttribute('data-setting-title') ?? ''
    }
  })
  check('the reader card sits above the books', books.card !== null && books.list !== null && books.card < books.list, JSON.stringify(books))
  check('the open book is washed and badged, and a shelf book is indented without that badge', books.badge === 'Open now' && books.nowTitle === 'My book' && books.shelfTitle === 'The other shelf' && books.nowBg !== books.shelfBg && books.shelfBadge === '' && books.shelfLeft > books.nowLeft + 8, JSON.stringify({ made, ...books }))
  await h.evaluate(() => document.querySelector('[data-book-role="now"]')?.scrollIntoView({ block: 'center' }))
  await wait(300)
  if (shots) await h.screenshot({ path: `${shots}/books.png` })

  // Two panes, the way a split is kept, then File > Close. The key itself is not the bug. The sound on that close is.
  await h.evaluate(() => localStorage.setItem('split', JSON.stringify({ panes: [{ key: 'left', trail: { views: [{ id: 'inbox' }], at: 0 } }, { key: 'right', trail: { views: [{ id: 'calendar' }], at: 0 } }], front: 'right', sizes: [0.5, 0.5] })))
  await h.reload()
  await wait(1500)
  const again = h.getByText('Skip the welcome')
  if (await again.count()) await again.first().click().catch(() => {})
  for (let i = 0; i < 4; i++) {
    if (!(await h.evaluate(() => !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]')))) break
    await h.keyboard.press('Escape')
    await wait(300)
  }
  const before = await h.evaluate(() => document.querySelectorAll('[data-split-area] [data-pane]').length)
  await h.evaluate(() => { if (window.haligtreeCued) window.haligtreeCued.length = 0 })
  const sent = await electron.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows().map((w) => w.webContents.getURL())
    const home = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
    home?.webContents.send('menu:close')
    return { sent: !!home, wins }
  })
  await wait(700)
  const heard = await h.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]')
    return {
      panes: document.querySelectorAll('[data-split-area] [data-pane]').length,
      keys: [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => el.getAttribute('data-pane')),
      cues: [...(window.haligtreeCued ?? [])].filter((one) => one === 'fold' || String(one).startsWith('paper:')),
      dialog: dialog ? (dialog.getAttribute('role') || dialog.className || dialog.tagName) : null,
      split: localStorage.getItem('split')?.slice(0, 180) ?? null
    }
  })
  check('folding a pane away plays one sound, the paper', before === 2 && heard.panes === 1 && heard.cues.join() === 'paper:fold', JSON.stringify({ before, sent: sent.sent, panes: heard.panes, cues: heard.cues, dialog: heard.dialog, keys: heard.keys }))
} catch (error) {
  check('the run finished', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
} finally {
  await c.close?.()
}
done()
