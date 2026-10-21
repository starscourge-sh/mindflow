// The final pass over everything outside the main window's pages: quick
// capture (its tabs, the kind picker, a row's menu, the offers, a toast,
// expanded), the session bubble (normal and under the notch), the stickies
// (a note, a goal, all goals, Today, a goal tucked to a tab), the welcome,
// every Settings section, the note window, the drawing window, the picture
// viewer and the menu bar menu. Each is measured (final-measure.mjs) in each
// of the three styles, in Paper and in Dark, quick capture at its smallest and
// largest and the main window at 900x700 and 1600x1000. Fails on clipped
// text, a child poking past its scroller, a control whose words wrap, and a
// control under 24px to press.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/final-outside.mjs
// LOOKS=soft/paper,brutal/dark picks looks; ONLY=box,pill,... picks surfaces;
// SHOTS=<dir> keeps a picture of each.
import { mkdirSync } from 'fs'
import { measure } from './final-measure.mjs'

process.env.MINDFLOW_QA_NOTCH ??= '1'
const { sandbox } = await import('./sandbox-lib.mjs')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const LOOKS = (process.env.LOOKS ?? 'soft/paper,soft/dark,brutal/paper,brutal/dark,paper/paper,paper/dark').split(',').map((one) => one.split('/'))
const ONLY = process.env.ONLY?.split(',')
const want = (name) => !ONLY || ONLY.includes(name)

const c = await sandbox({ width: 900, height: 700 })
const { electron, page, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
let failed = 0, checked = 0
const found = []
const win = (match) => electron.windows().find((one) => !one.isClosed() && match(one.url()))
const waitWin = async (match, tries = 40) => { for (let i = 0; i < tries; i++) { const w = win(match); if (w) return w; await wait(250) } return null }
/** Measure one window as it is, and say so. */
async function look(target, name, opts) {
  if (!target) { failed++; checked++; console.log(`FAIL  ${name}: no window`); return }
  const faults = await target.evaluate(measure, opts ?? {}).catch((error) => [{ kind: 'error', what: String(error).slice(0, 200), detail: '' }])
  checked++
  if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name.replace(/[^\w-]+/g, '_')}.png` }).catch(() => {})
  if (faults.length) failed++
  console.log(`${faults.length ? 'FAIL' : 'PASS'}  ${name}`)
  for (const f of faults) (console.log(`        ${f.kind}: ${f.what}  ${f.detail}${f.n > 1 ? `  x${f.n}` : ''}`), found.push({ at: name, ...f }))
}
/** One plain check, counted with the rest. */
const verdict = (ok, name, detail = '') => { checked++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const boxDo = (code, arg) => electron.evaluate(({ BrowserWindow }, [code, a, url]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url), a), [code, arg, page.url()])
const homeSize = (w, hh) => c.size(w, hh)
const wear = async (style, theme) => {
  for (const one of electron.windows()) {
    await one.evaluate(([s, t]) => { localStorage.setItem('style', s); localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, [style, theme]).catch(() => {})
  }
  await wait(700)
}
const esc = async (p) => { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, celebrate: false, countIn: false, focusShows: 'bubble', postcards: false })
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  const captures = await h.evaluate(() => window.api.captures.list?.() ?? [])
  const someCapture = (Array.isArray(captures) ? captures : []).find((one) => one?.id)?.id
  // A small picture for the viewer and the drawing's stand-in.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  for (const [style, theme] of LOOKS) {
    const tag = `${style}/${theme}`
    await wear(style, theme)

    if (want('box')) {
      await page.evaluate(() => window.api.showPrompt())
      await page.waitForTimeout(900)
      await wear(style, theme)
      // The side panel and its four tabs, at the box's usual size.
      const tabs = page.locator('[role=tab]')
      for (let i = 0; i < await tabs.count(); i++) {
        await tabs.nth(i).click().catch(() => {})
        await page.waitForTimeout(500)
        const name = (await tabs.nth(i).textContent()).replace(/\d+/g, '')
        await look(page, `${tag} box ${name}`)
        // Tasks: every list chip whole beside the view button, the rest under "More".
        if (name.startsWith('Tasks')) {
          const lists = await page.evaluate(() => {
            const later = document.querySelector('[data-later-lists]')
            const strip = later?.parentElement
            const chips = strip?.querySelector('[data-hover-quiet]')
            const view = [...(strip?.children ?? [])].at(-1)?.getBoundingClientRect()
            const last = later?.getBoundingClientRect()
            return later && chips && view && last ? { cut: chips.scrollWidth - chips.clientWidth, clear: Math.round(view.left - last.right), names: [...chips.querySelectorAll('button')].map((one) => one.textContent.trim()), later: later.textContent.trim() } : null
          })
          verdict(!!lists && lists.cut <= 1 && lists.clear >= 0, `${tag} box Tasks: every list chip whole, "More" clear of the view button`, JSON.stringify(lists))
          await page.locator('[data-later-lists]').click().catch(() => {})
          await page.waitForTimeout(400)
          await look(page, `${tag} box Tasks later menu`)
          await page.getByRole('menuitem', { name: /This month/ }).click().catch(() => {})
          await page.waitForTimeout(400)
          const shown = await page.evaluate(() => document.querySelector('[data-later-lists]')?.textContent.trim() ?? '')
          verdict(/^This month/.test(shown), `${tag} box Tasks: a later list picked names itself on the chip`, shown)
          await page.locator('[data-hover-quiet] button').first().click().catch(() => {})
          await page.waitForTimeout(300)
        }
        // A row's own menu.
        const row = page.locator('[data-row][data-id]').first()
        if (await row.count()) {
          await row.click({ button: 'right' }).catch(() => {})
          await page.waitForTimeout(400)
          if (await page.locator('[role=menu]').count()) await look(page, `${tag} box ${name} row menu`)
          await esc(page)
        }
      }
      // The kind picker.
      const kind = page.locator('[data-under-toast] button').first()
      if (await kind.count()) {
        await kind.click().catch(() => {})
        await page.waitForTimeout(400)
        await look(page, `${tag} box kind picker`)
        await esc(page)
      }
      // The offers under the writing.
      await page.click('.tiptap').catch(() => {})
      await page.keyboard.type('Does the spinning top ever fall over?')
      await page.waitForTimeout(900)
      await look(page, `${tag} box offers`)
      // Sent: the toast.
      await page.keyboard.press('Meta+Enter')
      await page.waitForTimeout(500)
      await look(page, `${tag} box toast`)
      // Sent, the box may put itself away: back for the rest.
      await page.evaluate(() => window.api.showPrompt())
      await page.waitForTimeout(900)
      // Expanded: the box at its largest.
      await page.keyboard.press('Control+Shift+F')
      await page.waitForTimeout(900)
      await look(page, `${tag} box expanded ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`)
      await page.keyboard.press('Control+Shift+F')
      await page.waitForTimeout(600)
      // The box alone at its smallest: panel hidden, held 280 tall.
      await page.keyboard.press('Meta+\\')
      await page.waitForTimeout(700)
      await boxDo('const b = win.getBounds(); win.setMinimumSize(200, a); win.setMaximumSize(b.width, a); win.setBounds({ ...b, height: a })', 280)
      await page.waitForTimeout(500)
      await look(page, `${tag} box smallest ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`)
      await boxDo('const b = win.getBounds(); win.setMaximumSize(10000, 10000); win.setMinimumSize(1, 1)')
      await page.keyboard.press('Meta+\\')
      await page.waitForTimeout(600)
      await page.keyboard.press('Meta+n').catch(() => {})
      await esc(page)
    }

    if (want('pill')) {
      for (const sits of ['below', 'notch']) {
        await v('settings:set', { pillSits: sits })
        const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
        const id = await v('session:start', task.id, 'Warm up', 25 * 60000)
        await h.evaluate(() => window.api.showFocus(true))
        const pill = await waitWin((u) => u.includes('view=focus'))
        await pill?.waitForTimeout(1500)
        if (pill) await wear(style, theme)
        await look(pill, `${tag} bubble ${sits}`)
        if (pill) {
          await pill.hover(sits === 'notch' ? '[data-island]' : 'body', { position: { x: 160, y: 12 } }).catch(() => {})
          await pill.waitForTimeout(800)
          await look(pill, `${tag} bubble ${sits} open`)
          await pill.mouse.move(1, 300).catch(() => {})
        }
        await v('session:cancel', id)
        await wait(800)
      }
      await v('settings:set', { pillSits: 'below' })
      await h.evaluate(() => window.api.showFocus(false))
    }

    if (want('stickies')) {
      if (someCapture) await h.evaluate((id) => window.api.stick('capture', id, true), someCapture)
      await h.evaluate(() => window.api.stick('goals', 'all', true))
      await wait(1800)
      await wear(style, theme)
      for (const one of electron.windows().filter((w) => w.url().includes('view=sticky'))) {
        const type = new URL(one.url()).searchParams.get('type')
        await look(one, `${tag} sticky ${type}`)
      }
      // The picture viewer, from a sticky.
      const sticky = win((u) => u.includes('view=sticky'))
      if (sticky && want('look')) {
        await sticky.evaluate((src) => window.api.look([{ src, width: 1200, height: 800, caption: 'A long caption for the picture, to see it is not cut short where it matters' }], 0), PNG)
        const viewer = await waitWin((u) => u.includes('view=look'))
        await viewer?.waitForTimeout(800)
        await look(viewer, `${tag} picture viewer`)
        if (viewer) await viewer.keyboard.press('Escape').catch(() => {})
        await wait(600)
      }
      if (someCapture) await h.evaluate((id) => window.api.stick('capture', id, false), someCapture)
      await h.evaluate(() => window.api.stick('goals', 'all', false))
    }

    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await homeSize(w, hh)
      if (want('settings')) {
        await c.go('settings')
        for (const name of await h.$$eval('[data-section]', (all) => all.map((one) => one.dataset.section))) {
          await h.click(`[data-section="${name}"]`).catch(() => {})
          await wait(500)
          // Down the whole section: each screenful measured.
          const steps = await h.evaluate(() => { const s = document.querySelector('[data-setting]')?.closest('.overflow-y-auto'); return s ? Math.max(1, Math.ceil(s.scrollHeight / s.clientHeight)) : 1 })
          for (let i = 0; i < Math.min(steps, 8); i++) {
            await h.evaluate((i) => { const s = document.querySelector('[data-setting]')?.closest('.overflow-y-auto'); if (s) s.scrollTop = i * s.clientHeight * 0.9 }, i)
            await wait(250)
            await look(h, `${tag} settings ${name} ${w}x${hh} #${i + 1}`, { root: "section:has(> nav[data-sections])" })
          }
        }
      }
      if (want('welcome')) {
        await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
        await h.waitForSelector('.mf-welcome', { timeout: 6000 }).catch(() => {})
        await wait(800)
        let last = ''
        for (let i = 0; i < 14; i++) {
          const chapter = await h.evaluate(() => document.querySelector('.mf-welcome h1, .mf-welcome h2')?.textContent?.slice(0, 30) ?? '')
          // The last chapter, once: pressing on there changes nothing.
          if (chapter === last) break
          last = chapter
          await look(h, `${tag} welcome ${w}x${hh} ${i + 1} ${chapter}`, { root: ".mf-welcome" })
          await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome-step', { detail: 1 })))
          await wait(1200)
          if (!(await h.$('.mf-welcome'))) break
        }
        await h.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })).catch(() => {})
        await h.reload()
        await wait(1500)
      }
    }

    if (want('note') && someCapture) {
      await v('notes:window', 'capture', someCapture)
      const note = await waitWin((u) => u.includes('note='))
      await note?.waitForTimeout(1500)
      await look(note, `${tag} note window`)
      // One row of controls: Open in the main window sits in the header's row, clear of the traffic lights.
      const row = await note?.evaluate(() => {
        const open = document.querySelector('[data-open-in-vigil]')?.getBoundingClientRect()
        const head = document.querySelector('[data-note-head]')?.getBoundingClientRect()
        return open && head ? { inHead: open.top >= head.top - 1 && open.bottom <= head.bottom + 1, top: Math.round(head.top), left: Math.round(open.left) } : null
      })
      verdict(!!row && row.inHead && row.top <= 16 && row.left >= 70, `${tag} note window: "Open in" is in the header row, level with the traffic lights`, JSON.stringify(row))
      await note?.close().catch(() => {})
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('note=')).forEach((w) => w.destroy()))
    }

    if (want('drawing')) {
      await h.evaluate((src) => window.api.openDrawing('qa-final-drawing', { elements: [], appState: {} }, 'A note with a rather long name for its drawing window', src), PNG)
      const drawing = await waitWin((u) => u.includes('drawing='))
      await drawing?.waitForTimeout(2500)
      await look(drawing, `${tag} drawing window`)
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('drawing=')).forEach((w) => w.destroy()))
    }
  }

  // The wheel never changes a value: over the theme dial in Settings and over
  // a sideways row of chips, scrolling scrolls the page and the theme stays.
  if (want('wheel')) {
    await homeSize(1000, 760)
    await c.go('settings')
    await h.click('[data-section="Appearance"]').catch(() => {})
    await wait(600)
    const dial = h.locator('[data-theme-dial]').first()
    await dial.scrollIntoViewIfNeeded()
    await h.evaluate(() => { const s = document.querySelector('[data-setting]')?.closest('.overflow-y-auto'); if (s) s.scrollTop -= 120 })
    await wait(400)
    const before = await h.evaluate(() => ({ theme: localStorage.getItem('theme'), top: document.querySelector('[data-setting]')?.closest('.overflow-y-auto')?.scrollTop ?? 0 }))
    const at = await dial.boundingBox()
    await h.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
    for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 60); await wait(60) }
    await wait(900)
    const after = await h.evaluate(() => ({ theme: localStorage.getItem('theme'), top: document.querySelector('[data-setting]')?.closest('.overflow-y-auto')?.scrollTop ?? 0 }))
    checked++
    const ok = after.theme === before.theme && after.top > before.top + 50
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'}  the wheel over the theme dial scrolls the page and leaves the theme (${JSON.stringify(before)} -> ${JSON.stringify(after)})`)
    // Over quick capture's sideways chips, the list scrolls down, not the row along.
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(900)
    await page.locator('[role=tab]').first().click().catch(() => {})
    await page.waitForTimeout(500)
    const row = await page.evaluate(() => {
      const one = [...document.querySelectorAll('*')].find((el) => el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflowX !== 'visible' && el.querySelector('button[aria-pressed]') && el.getBoundingClientRect().height < 60)
      if (!one) return null
      one.setAttribute('data-qa-sideways', '')
      const r = one.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: one.scrollLeft }
    })
    if (row) {
      await page.mouse.move(row.x, row.y)
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 80); await page.waitForTimeout(60) }
      await page.waitForTimeout(500)
      const left = await page.evaluate(() => document.querySelector('[data-qa-sideways]')?.scrollLeft ?? 0)
      checked++
      if (left !== row.left) failed++
      console.log(`${left === row.left ? 'PASS' : 'FAIL'}  the wheel over a sideways row of chips leaves the row where it was (${row.left} -> ${left})`)
    }
  }

  if (want('tray')) {
    const items = await electron.evaluate(() => globalThis.trayMenu ?? [])
    const long = items.filter((one) => (one.label ?? '').length > 44).map((one) => one.label)
    checked++
    if (long.length) failed++
    console.log(`${long.length ? 'FAIL' : 'PASS'}  menu bar menu: every line short enough to read whole (${items.length} lines)${long.length ? `  ${long.join(' | ')}` : ''}`)
  }
} catch (error) {
  failed++
  console.log('FAIL  ran without error', String(error.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
const kinds = found.reduce((all, f) => ((all[f.kind] = (all[f.kind] ?? 0) + 1), all), {})
console.log(`\n${checked - failed}/${checked} passed  ${JSON.stringify(kinds)}${c.errors.length ? `  errors: ${c.errors.slice(0, 3).join(' | ')}` : ''}`)
process.exit(failed ? 1 : 0)
