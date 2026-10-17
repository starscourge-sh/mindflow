// The rest of the tasks share, at the main window's smallest (560x400),
// 900x640 and full-screen sizes, and the box at 280 tall and its largest:
// the task's panel, the sidebar's Customize, Recent and a page's peek, the
// session bubble and the notch with a long task, every quick capture tab,
// the kind picker, the gear menu, a word's meaning and an attachment.
// PART=welcome runs the welcome instead (no --sandbox: a first run).
// Each: no sideways scroll, nothing cut off without an ellipsis or fade,
// no menu or popover off the window.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_MAC_DICT=on node qa/ui-tasks-more.mjs
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 PART=welcome node qa/ui-tasks-more.mjs
// SHOTS=<folder> keeps a picture of each; THEME=dark runs it dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const welcome = process.env.PART === 'welcome'
const c = await sandbox({ width: 1000, height: 700, seeded: !welcome })
const { h, page, v, go, size, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name, target = h) => { if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {}) }
const LONG = 'Email the department about the extension for the Comparative Literature 302 essay on the Romantic sublime'

/** What a window breaks: sideways scroll, words cut off with no ellipsis or fade, and any menu or popover past its edge. */
const audit = (target) => target.evaluate(() => {
  const out = { sideways: document.scrollingElement.scrollWidth > innerWidth + 1, clipped: [], off: [] }
  for (const el of document.querySelectorAll('p, span, div, button, a, h1, h2, h3, label')) {
    if (el.children.length || !el.textContent.trim() || el.closest('.sr-only, [aria-hidden=true], .ProseMirror') || el.classList.contains('sr-only')) continue
    const s = getComputedStyle(el)
    if (s.overflow !== 'hidden' && s.overflowX !== 'hidden') continue
    const faded = [s.maskImage, s.webkitMaskImage].some((m) => m?.includes('gradient'))
    if (el.clientWidth && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && !/\d/.test(s.webkitLineClamp) && !faded) out.clipped.push(el.textContent.slice(0, 40))
  }
  // A scrolling box whose top is cut off even scrolled all the way up (centred content taller than the box).
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollTop > 0 || el.scrollHeight <= el.clientHeight + 2 || !el.firstElementChild) continue
    if (el.firstElementChild.getBoundingClientRect().top < el.getBoundingClientRect().top - 2) out.clipped.push(`top out of reach: ${el.className.toString().slice(0, 50)}`)
  }
  // A field showing words it cannot fit, cut mid-letter instead of ending in an ellipsis.
  for (const el of document.querySelectorAll('input[type=text], input:not([type])')) {
    if (el === document.activeElement || !el.clientWidth || !el.value) continue
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') out.clipped.push(`field: ${el.value.slice(0, 40)}`)
  }
  for (const el of document.querySelectorAll('[role=menu], [role=dialog], [role=tooltip], [data-radix-popper-content-wrapper] > *')) {
    const r = el.getBoundingClientRect()
    if (r.width && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) out.off.push(`${el.getAttribute('role') ?? 'popover'} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}`)
  }
  return out
})
const look = async (tag, target = h) => {
  const a = await audit(target)
  await shoot(tag.replace(/[^\w-]+/g, '-'), target)
  check(`${tag}: no sideways scroll`, !a.sideways)
  check(`${tag}: nothing cut off without an ellipsis or fade`, !a.clipped.length, a.clipped.slice(0, 4).join(' | '))
  check(`${tag}: no menu or popover past the window's edge`, !a.off.length, a.off.join(' | '))
}
const SIZES = process.env.QUICK ? [[900, 640]] : [[560, 400], [900, 640], [1920, 1200], [2560, 1440]]

try {
  if (welcome) {
    if (process.env.THEME) await c.theme(process.env.THEME)
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    // Each chapter at every size, pressed on as a reader would.
    for (let step = 0; step < 14; step++) {
      const chapter = (await h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')).replace(/\W+/g, '-').slice(0, 30) || `step-${step}`
      for (const [w, hh] of SIZES) {
        await size(w, hh); await wait(400)
        await look(`welcome ${step} ${chapter} ${w}x${hh}`)
        // Nothing drawn over the chapter's own words.
        const over = await h.evaluate(() => {
          const words = document.querySelector('.mf-welcome main h1')?.parentElement?.getBoundingClientRect()
          if (!words) return []
          return [...document.querySelectorAll('.mf-welcome main [data-flow]')].map((one) => one.getBoundingClientRect())
            .filter((r) => r.width && r.left < words.right - 2 && r.right > words.left + 2 && r.top < words.bottom - 2 && r.bottom > words.top + 2).map((r) => `${Math.round(r.top)}`)
        })
        check(`welcome ${step} ${w}x${hh}: no picture over the words`, !over.length, over.join())
      }
      await size(1000, 700)
      const nextOne = await h.$('footer button:has-text("Skip trying it"), footer button:has-text("Next"), footer button:has-text("Show me")')
      if (!nextOne) break
      await nextOne.click(); await wait(1500)
    }
  } else {
    await v('settings:set', { sounds: false, hintRate: 0, motion: false, celebrate: false })
    await v('onboarding:set', { pageHints: false }).catch(() => {})
    const made = await v('task:add', `${LONG} today`)
    const id = made?.id ?? made
    await v('task:save', id, { estimate: 90, important: 1, subtasks: [{ text: 'Find the extension form on the faculty website and fill it in', done: false }, { text: 'Ask the tutor', done: true }] })
    await h.reload(); await wait(2500)
    if (process.env.THEME) await c.theme(process.env.THEME)
    await h.getByRole('button', { name: /Got it/ }).first().click().catch(() => {})
    await go('today')

    for (const [w, hh] of SIZES) {
      await size(w, hh)
      for (const side of ['open', 'closed']) {
        const at = `${w}x${hh} ${side}`
        // The sidebar as this pass wants it, whatever the last page left.
        await go('home'); await go('today')
        const showing = await h.evaluate(() => !!document.querySelector('aside[data-chrome][data-book-tint]'))
        if (showing !== (side === 'open')) { await h.keyboard.press('Meta+b'); await wait(500) }
        if (side === 'open') {
          // Customize, beside the sidebar, from a part's heading's right-click menu.
          await h.locator('aside[data-chrome] button:has-text("Upcoming"), aside[data-chrome] button[aria-label*="Upcoming"]').first().click({ button: 'right', timeout: 3000 }).catch(async () => shoot(`${at}-no-row`))
          await wait(400)
          const item = h.getByRole('menuitem', { name: /Customize the sidebar/ })
          check(`${at}: Customize opens`, await item.count())
          if (await item.count()) { await item.first().click(); await wait(800); await look(`${at} customize`) }
          await h.keyboard.press('Escape'); await wait(300)
          // A page's peek, by pointing at its row.
          const row = h.locator('aside[data-chrome] button:has-text("Upcoming"), aside[data-chrome] button[aria-label*="Upcoming"]').first()
          if (await row.count()) { await row.hover(); await wait(1600); await look(`${at} peek`) }
          await h.mouse.move(w / 2, hh - 20); await wait(300)
        }
        // The task's panel.
        await go('today'); await h.locator(`text=${LONG.slice(0, 30)}`).first().click(); await wait(900)
        await look(`${at} task panel`)
        await h.keyboard.press('Escape'); await wait(300)
      }
    }

    // The session bubble, free and in the notch, with a long task.
    await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
    for (const sits of ['free', 'notch']) {
      await v('settings:set', { focusShows: 'bubble', pillSits: sits, countIn: false })
      const session = await v('session:start', id, LONG, 25 * 60000)
      await h.evaluate(() => window.api.showFocus(true))
      let pill
      for (let i = 0; i < 50 && !pill; i++) (pill = electron.windows().find((one) => one.url().includes('view=focus')), pill || (await wait(200)))
      await pill.waitForTimeout(2500)
      await look(`bubble ${sits}`, pill)
      await pill.hover('body').catch(() => {}); await pill.waitForTimeout(700)
      await look(`bubble ${sits} pointed at`, pill)
      await v('session:cancel', session); await wait(800)
    }

    // The box at 280 tall and at its largest.
    const boxSize = (bw, bh) => electron.evaluate(({ BrowserWindow }, [bw, bh]) => { const win = BrowserWindow.getAllWindows().find((one) => !/[?&]view=/.test(one.webContents.getURL())); win.showInactive(); win.setMinimumSize(200, 200); win.setMaximumSize(4000, 4000); win.setBounds({ width: bw, height: bh }); win.setMinimumSize(bw, bh); win.setMaximumSize(bw, bh) }, [bw, bh])
    await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
    for (const [bw, bh] of [[1080, 280], [1080, 816], [640, 280]]) {
      // Just the box, without its side panel, at 640.
      if (bw === 640) { await page.keyboard.press('Meta+\\'); await page.waitForTimeout(600) }
      await boxSize(bw, bh); await page.waitForTimeout(600)
      const at = `box ${bw}x${bh}`
      // The tabs live in the side panel, shown once the box is wide enough for it.
      const writing = await page.evaluate(() => document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')?.getBoundingClientRect().height ?? 0)
      check(`${at}: the writing keeps room for a line (${Math.round(writing)}px)`, writing >= 24)
      for (let tab = 1; tab <= 5; tab++) { await page.keyboard.press(`Control+${tab}`); await page.waitForTimeout(600); await look(`${at} tab ${tab}`, page) }
      const kind = page.getByRole('button', { name: /^Note/ }).first()
      if (await kind.count()) { await kind.click(); await page.waitForTimeout(600); await look(`${at} kind picker`, page); await kind.click({ force: true }).catch(() => {}); await page.waitForTimeout(300) }
      const gear = page.getByRole('button', { name: 'Actions' }).first()
      if (await gear.count()) { await gear.click(); await page.waitForTimeout(600); await look(`${at} gear menu`, page); await page.mouse.click(5, 5); await page.waitForTimeout(300) }
      // A word's meaning.
      await page.click('.tiptap.ProseMirror.mindflow-editor:not(.is-line)').catch(() => {})
      await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
      await page.keyboard.type('serendipity', { delay: 20 }); await page.waitForTimeout(2500)
      await look(`${at} word meaning`, page)
      // An attachment: a picture pasted in.
      await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
      await page.evaluate(async () => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 1600, height: 900 })
        canvas.getContext('2d').fillRect(0, 0, 1600, 900)
        const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
        const data = new DataTransfer()
        data.items.add(new File([blob], 'a-very-long-screenshot-name-from-the-lecture-on-the-romantic-sublime.png', { type: 'image/png' }))
        document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      })
      await page.waitForTimeout(1500)
      await look(`${at} attachment`, page)
      await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    }
  }
} catch (error) {
  check('ran to the end', false, error.stack)
} finally {
  await c.close()
  done()
}
