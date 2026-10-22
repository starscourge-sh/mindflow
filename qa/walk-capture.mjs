// Quick capture, the Inbox and the note window, walked as a person on
// sandbox data: every tab of the box, the Tasks list's Mac gestures, throwing
// the box with ⌘ and two fingers, Esc, the pill; the Inbox page's Tidy,
// Decide, sorting, the Bin and Archive; a note opened in its own window. A
// picture of each screen goes to SHOTS.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_VIRTUAL=1 SHOTS=<dir> node qa/walk-capture.mjs
// ONLY_PAGE=1 skips the box and walks the Inbox page, the Bin, Archived and the note window alone.
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_VIRTUAL ??= '1'
const SHOTS = process.env.SHOTS ?? mkdtempSync(join(tmpdir(), 'walk-capture-'))
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`))
const c = await sandbox({ width: 1100, height: 760 })
const { h, page: box, v, electron, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { for (let t = 0; t < ms; t += 150) { const got = await test().catch(() => null); if (got) return got; await wait(150) } return null }
const boxWin = (code, arg) => electron.evaluate(({ BrowserWindow }, [code, a]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => /renderer\/index.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('view=')), a), [code, arg])
// The box's own picture, from Electron: a parked window's page shot comes out washed over.
const shotBox = async (name) => {
  const png = await boxWin('return win.webContents.capturePage().then((one) => one.toPNG().toString("base64"))')
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(png, 'base64'))
}
const shot = async (name, w = h) => { try { await w.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 15000 }) } catch (e) { console.log('no shot', name) } }
const toasts = (w) => w.evaluate(() => [...document.querySelectorAll('[role=status][aria-live], [data-sonner-toast]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))
const menu = (w) => w.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const step = async (name, run) => { try { await run() } catch (error) { await shot(`err-${name.replace(/\W+/g, '-')}`); check(`${name}: ran`, false, String(error?.message ?? error).split('\n').filter((line) => /intercept|visible|stable|waiting for|Timeout/.test(line)).slice(-4).join(' / ')) } ; await box.keyboard.press('Escape').catch(() => {}) }
const showBox = async () => { await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && /index.html/.test(w.webContents.getURL())); win?.show(); win?.focus() }); await box.bringToFront(); await wait(700) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await showBox()

  // Edge cases in the lists: one unbroken very long word, a title that is only an emoji.
  const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(6)))
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('🌋'))
  await wait(800)
  await step('edges', async () => {
    await box.keyboard.press('Control+1')
    await wait(800)
    await shotBox('09-box-edges')
    const wide = await box.evaluate(() => [...document.querySelectorAll('[data-row]')].filter((one) => one.scrollWidth > one.clientWidth + 2 || one.getBoundingClientRect().right > window.innerWidth + 1).length)
    check('a very long word and an emoji-only title stay inside the box’s Inbox', !wide, `${wide} rows past their edge`)
    await go('inbox')
    const page = await h.evaluate(() => [...document.querySelectorAll('[data-page] [data-row]')].filter((one) => one.getBoundingClientRect().right > window.innerWidth + 1).length)
    check('and inside the Inbox page', !page, `${page} rows past the edge`)
    await shot('09-inbox-edges')
  })

  if (!process.env.ONLY_PAGE) await step('tabs', async () => {
    for (const [i, name] of ['inbox', 'tasks', 'review', 'saved', 'recent'].entries()) {
      await box.keyboard.press(`Control+${i + 1}`)
      await wait(700)
      await shotBox(`10-box-${name}`)
      if (name === 'inbox') {
        // The same "Go through…" menu as the Inbox page, with the same names; no Tidy or Deciding day buttons of its own.
        const loose = await box.evaluate(() => [...document.querySelectorAll('button')].filter((one) => /^(Tidy|Deciding day|Decide)$/.test(one.textContent.trim())).length)
        check('the box has no Tidy or Deciding day buttons of its own', !loose, `${loose} found`)
        await box.getByRole('button', { name: 'Go through…' }).first().click()
        await wait(500)
        const items = await menu(box)
        console.log('  box go through:', items.join(' | '))
        check('the box’s “Go through…” offers Tidy, Decide and Read through, named as on the Inbox page', items.some((one) => one.startsWith('Tidy recent captures')) && items.some((one) => one.startsWith('Decide what to keep')) && items.some((one) => one.startsWith('Read through')), items.join(' | '))
        await shotBox('10-box-go-through')
        await box.keyboard.press('Escape')
        await wait(300)
      }
      const text = await box.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700))
      console.log(`  box ${name}: ${text}`)
    }
  })

  if (!process.env.ONLY_PAGE) await step('tasks list', async () => {
    await box.keyboard.press('Control+2')
    await wait(700)
    const rows = box.locator('[data-task-row], [data-row]')
    console.log('  task rows', await rows.count())
    await box.locator('.tiptap.ProseMirror').first().blur().catch(() => {})
    await rows.first().click({ position: { x: 60, y: 10 } }).catch((e) => console.log('  click', e.message.split('\n')[0]))
    await wait(300)
    await box.keyboard.press('Meta+a')
    await wait(400)
    await shotBox('11-tasks-all')
    // The picked tasks' bar stays on one line in the box's panel.
    const tops = await box.evaluate(() => [...document.querySelectorAll('button')].filter((one) => /^(Complete|Today|Tomorrow|Next week|Bin|Move to the Bin)/.test(one.textContent.trim()) && one.closest('span.flex')).map((one) => Math.round(one.getBoundingClientRect().top)))
    check('the picked tasks’ bar is on one line in the box', tops.length >= 4 && new Set(tops).size === 1, tops.join(','))
    console.log('  after ⌘A:', await box.evaluate(() => document.querySelector('[data-picked], [data-chosen]')?.textContent ?? 'no pick bar'), (await box.evaluate(() => document.body.innerText.match(/\d+ (picked|selected|chosen)/)?.[0])))
    await rows.nth(1).click({ button: 'right' }).catch(() => {})
    await wait(500)
    console.log('  right-click selection menu:', (await menu(box)).join(' | '))
    const icon = await box.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((one) => one.textContent.startsWith('Clear the date'))?.querySelector('svg')?.getAttribute('class') ?? '')
    check('“Clear the date” shows a crossed-out calendar, not the Bin’s can', /calendar-x/.test(icon) && !/trash/.test(icon), icon)
    await shotBox('11-tasks-menu')
    await box.keyboard.press('Escape')
    await wait(300)
    await box.keyboard.press('Escape')
    await wait(300)
    console.log('  after Esc:', await box.evaluate(() => document.body.innerText.match(/\d+ (picked|selected|chosen)/)?.[0] ?? 'none picked'))
  })

  if (!process.env.ONLY_PAGE) await step('throw', async () => {
    const before = await boxWin('return win.getBounds()')
    await box.evaluate(async () => {
      for (let n = 0; n < 6; n++) { window.dispatchEvent(new WheelEvent('wheel', { deltaX: -40, deltaY: 0, metaKey: true, cancelable: true, bubbles: true })); await new Promise((r) => setTimeout(r, 16)) }
    })
    await wait(1500)
    const after = await boxWin('return win.getBounds()')
    console.log('  throw', JSON.stringify(before), '->', JSON.stringify(after))
    check('⌘ and two fingers throw the box', after.x !== before.x || after.y !== before.y)
  })

  if (!process.env.ONLY_PAGE) await step('esc', async () => {
    await showBox()
    await box.locator('.tiptap.ProseMirror').first().click()
    await box.keyboard.type('half a thought')
    await box.keyboard.press('Escape')
    await wait(900)
    const shown = await boxWin('return win.isVisible()')
    console.log('  after Esc visible:', shown)
    await showBox()
    const kept = await box.evaluate(() => document.querySelector('.tiptap.ProseMirror')?.textContent)
    check('Esc puts the box away and keeps what was typed', kept?.includes('half a thought'), kept)
    await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
  })

  if (!process.env.ONLY_PAGE) await step('pill', async () => {
    // "5m tea" in the box is a timer, not a capture: the pill comes up with its name.
    await showBox()
    // A task opened from the Tasks list is on the left: ⌘[ goes back to the note being written.
    for (let i = 0; i < 3 && (await box.getByText('Back to your note').count()); i++) (await box.keyboard.press('Meta+BracketLeft'), await wait(600))
    check('⌘[ in the box comes back from a task to your note', !(await box.getByText('Back to your note').count()))
    await box.locator('.tiptap.ProseMirror').first().click()
    await box.keyboard.type('5m tea', { delay: 20 })
    await wait(500)
    await shotBox('12-box-timer-words')
    await box.keyboard.press('Meta+Enter')
    const pill = await waitFor(async () => electron.windows().find((w) => w.url().includes('view=focus')), 8000)
    check('“5m tea” in the box starts a timer, and the pill shows', !!pill)
    if (pill) {
      await pill.waitForTimeout(1500)
      await shot('12-pill', pill)
      const said = await pill.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
      console.log('  pill:', said.slice(0, 200))
      check('the pill names what the time is for', /tea/i.test(said), said.slice(0, 120))
    }
    await v('session:cancel').catch(() => {})
    await wait(800)
  })

  // --- the Inbox page -------------------------------------------------------
  await step('inbox page', async () => {
    await go('inbox')
    await shot('20-inbox')
    for (const [w, hh] of [[900, 700], [1600, 1000]]) { await c.size(w, hh); await shot(`20-inbox-${w}`) }
    await c.size(1100, 760)
    console.log('  inbox:', (await h.evaluate(() => document.querySelector('[data-page]')?.innerText.replace(/\s+/g, ' ').slice(0, 900))))
  })

  await step('inbox gestures', async () => {
    const rows = h.locator('[data-page] [data-row]:visible')
    const picked = () => h.evaluate(() => document.body.innerText.match(/\d+ (picked|selected|chosen)[^\n]*/)?.[0] ?? 'none')
    await rows.nth(0).click({ modifiers: ['Meta'] })
    await wait(300)
    await rows.nth(2).click({ modifiers: ['Shift'] })
    await wait(400)
    await shot('21-inbox-picked')
    console.log('  ⌘-click then ⇧-click:', await picked())
    await rows.nth(1).click({ button: 'right' })
    await wait(500)
    console.log('  selection menu:', (await menu(h)).join(' | '))
    await shot('21-inbox-menu')
    await h.keyboard.press('Escape')
    await wait(300)
    console.log('  after Esc on the menu:', await picked())
    await h.keyboard.press('Escape')
    await wait(300)
    console.log('  after a second Esc:', await picked())
    await h.keyboard.press('Meta+a')
    await wait(400)
    console.log('  ⌘A:', await picked())
    await h.keyboard.press('Escape')
    await wait(300)
    const label = await rows.nth(0).innerText()
    await rows.nth(0).click({ modifiers: ['Meta'] })
    await wait(300)
    await h.keyboard.press('Backspace')
    await wait(900)
    const gone = !(await h.locator('[data-page]').first().innerText()).includes(label.split('\n')[0])
    console.log('  ⌫ on one:', gone ? 'gone' : 'still there', 'toasts:', (await toasts(h)).join(' | '))
    await h.keyboard.press('Meta+z')
    await wait(1000)
    console.log('  ⌘Z:', (await h.locator('[data-page]').first().innerText()).includes(label.split('\n')[0]) ? 'back' : 'not back', 'toasts:', (await toasts(h)).join(' | '))
    // One click opens it; Esc comes back to the list.
    await rows.nth(0).click()
    await wait(900)
    await shot('21-inbox-open')
    // Esc never goes back (qa/esc.mjs); ⌘[ and the top bar's ← do.
    await h.keyboard.press('Escape')
    await h.keyboard.press('Meta+BracketLeft')
    await wait(900)
    check('⌘[ after opening a note comes back to the Inbox list', await h.getByRole('button', { name: 'Go through…' }).count() > 0)
  })

  await step('tidy', async () => {
    await go('inbox')
    await h.getByRole('button', { name: 'Go through…' }).first().click()
    await wait(500)
    console.log('  go through menu:', (await menu(h)).join(' | '))
    await shot('22-go-through')
    await h.locator('[role=menuitem]', { hasText: 'Tidy' }).first().click()
    await wait(1200)
    await shot('22-tidy')
    console.log('  tidy:', (await h.evaluate(() => document.querySelector('[data-pass]')?.innerText.replace(/\s+/g, ' ').slice(0, 600))))
    await h.keyboard.press('Escape')
    await wait(500)
    await h.keyboard.press('Escape')
    await wait(500)
  })

  await step('decide', async () => {
    await go('inbox')
    await h.getByRole('button', { name: 'Go through…' }).first().click()
    await wait(500)
    const decide = h.locator('[role=menuitem]', { hasText: 'Decide' }).first()
    console.log('  decide buttons', await decide.count())
    if (await decide.count()) { await decide.click(); await wait(1200); await shot('23-decide'); console.log('  decide:', (await h.evaluate(() => document.querySelector('[data-pass]')?.innerText.replace(/\s+/g, ' ').slice(0, 600)))) }
    await h.keyboard.press('Escape'); await wait(400); await h.keyboard.press('Escape')
  })

  await step('sorting', async () => {
    await go('inbox')
    const sort = h.locator('[data-page] [data-display]').first()
    console.log('  sort button', await sort.count(), await sort.textContent().catch(() => ''))
    await sort.click()
    await wait(500)
    console.log('  display panel:', await h.evaluate(() => document.querySelector('[role=dialog], [data-radix-popper-content-wrapper]')?.textContent?.replace(/\s+/g, ' ').slice(0, 400)))
    await shot('24-sort')
    await h.getByText('A to Z', { exact: true }).first().click()
    await wait(800)
    await h.keyboard.press('Escape')
    await wait(400)
    const titles = await h.locator('[data-page] [data-row]:visible').evaluateAll((all) => all.slice(0, 5).map((one) => one.innerText.split('\n')[0]))
    console.log('  A to Z:', titles.join(' | '))
    check('A to Z puts the shown rows in order', titles.every((one, i) => !i || titles[i - 1].localeCompare(one, undefined, { sensitivity: 'base' }) <= 0), titles.join(' | '))
    await shot('24-sorted')
    await h.locator('[data-page] [data-display]').first().click()
    await wait(400)
    await h.getByText('Newest', { exact: true }).first().click()
    await h.keyboard.press('Escape')
  })

  await step('bin', async () => {
    await go('discarded')
    await shot('25-bin')
    const row = h.locator('[data-bin-row]:visible').first()
    await row.click({ button: 'right' })
    await wait(500)
    const items = await menu(h)
    check('a Bin row’s menu has “Select all ⌘A”', items.includes('Select all⌘A'), items.join(' | '))
    console.log('  bin menu:', items.join(' | '))
    check('a right-click in the Bin offers “Restore” and “Delete for good…”', items.some((one) => one.startsWith('Restore')) && items.some((one) => one.startsWith('Delete for good')))
    await h.keyboard.press('Escape')
  })

  await step('archive', async () => {
    // Archive one from the Inbox's row menu, as the Archived page's example says, then find it there.
    await go('inbox')
    const row = h.locator('[data-page] [data-row]:visible').nth(1)
    const title = (await row.innerText()).split('\n')[0]
    await row.click({ button: 'right' })
    await wait(400)
    await h.locator('[role=menu] [role=menuitem]', { hasText: /^Archive$/ }).first().click()
    await wait(900)
    console.log('  archived toast:', (await toasts(h)).join(' | '))
    await go('archived')
    await shot('25-archive')
    const text = await h.locator('[data-page]').first().innerText()
    check('what was archived is on the Archived page', text.includes(title), title)
    const example = await h.evaluate(() => document.querySelector('[data-example-frame]')?.textContent ?? '')
    check('the Archived page’s example names the menu line as it reads', !example || example.includes('choose “Archive”'), example.slice(0, 160))
    const kept = h.locator('[data-page] [data-row]:visible', { hasText: title }).first()
    await kept.click({ button: 'right' })
    await wait(500)
    const archivedItems = await menu(h)
    console.log('  archived menu:', archivedItems.join(' | '))
    check('the Archived row menu has “Select all ⌘A”, even with one row', archivedItems.includes('Select all⌘A'), archivedItems.slice(-3).join(' | '))
    await h.keyboard.press('Escape')
  })

  await step('note window', async () => {
    await go('inbox')
    const row = h.locator('[data-page] [data-row]:visible').first()
    await row.click({ button: 'right' })
    await wait(400)
    const items = await menu(h)
    console.log('  row menu:', items.join(' | '))
    check('the row menu shows ⌫ for “Move to the Bin”, as the selection menu does', items.includes('Move to the Bin⌫'), items.find((one) => one.startsWith('Move to the Bin')))
    await h.locator('[role=menu] [role=menuitem]', { hasText: 'Open in…' }).first().hover()
    await wait(600)
    console.log('  open in:', (await menu(h)).join(' | '))
    const own = h.locator('[role=menu] [role=menuitem]', { hasText: /window/i }).first()
    if (await own.count()) {
      await own.click()
      const note = await waitFor(async () => electron.windows().find((w) => w.url().includes('note.html')), 8000)
      if (note) { await note.waitForTimeout(1500); await shot('30-note-window', note); console.log('  note window:', (await note.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)))) }
      check('a note opens in its own window', !!note)
    } else await h.keyboard.press('Escape')
  })

  // Each look at the two sizes: nothing past an edge on the Inbox page or in the box.
  for (const [theme, style] of [['midnight', 'brutal'], ['paper', 'paper'], ['dark', 'soft']]) {
    await step(`look ${theme} ${style}`, async () => {
      await h.evaluate((one) => localStorage.setItem('style', one), style)
      await c.theme(theme)
      await go('inbox')
      for (const [w, hh] of [[900, 700], [1600, 1000]]) {
        await c.size(w, hh)
        await shot(`40-inbox-${theme}-${style}-${w}`)
        const over = await h.evaluate(() => [...document.querySelectorAll('[data-page] button, [data-page] [data-row]')].filter((one) => { const r = one.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1 }).map((one) => one.textContent.trim().slice(0, 30)))
        check(`nothing past the right edge of the Inbox, ${theme} ${style} at ${w}`, !over.length, over.join(' | '))
      }
      await c.size(1100, 760)
      await showBox()
      await box.keyboard.press('Control+1')
      await wait(700)
      await shotBox(`40-box-${theme}-${style}`)
    })
  }

  console.log('errors:', c.errors.join(' | ') || 'none')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
