// Escape, everywhere it can be pressed in the main window: it closes the
// topmost passing thing (a menu, a dialog, a search's words, a selection, the
// editor's hold on the keys), one per press, and never goes back. Each case
// reaches a starting state, presses Escape, and checks two things: what
// should have closed did, and the page (section, open note, tab) is exactly
// where it was. ⌘[ is Back; Escape is not.
//
//   npx electron-vite build --outDir out-esc
//   QA_ARGS=--sandbox QA_ENTRY=out-esc/main/index.js node qa/esc.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-esc-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const c = await sandbox({ width: 1440, height: 900 })
const { h, send } = c
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const results = []
const wait = (ms = 900) => h.waitForTimeout(ms)

/** Where you are, read off the screen. */
const state = () => h.evaluate(() => {
  const page = document.querySelector('[class*="@container/page"]')
  const pane = page?.querySelector('.note-pane')
  const words = (pane?.querySelector('textarea.font-heading, input.font-heading')?.value || pane?.querySelector('input')?.value || pane?.querySelector('.ProseMirror')?.firstElementChild?.textContent || '').trim()
  const tabs = page ? [...page.querySelectorAll('[role="tab"][aria-selected="true"], header [aria-pressed="true"]')].map((one) => (one.textContent ?? '').trim() || one.getAttribute('aria-label')) : []
  const title = [...(page?.querySelectorAll('h1, h2, h3') ?? [])].map((one) => (one.textContent ?? '').trim()).find(Boolean) ?? ''
  return {
    view: document.querySelector('header h1')?.textContent ?? '',
    open: page?.querySelector('[data-open][data-id]')?.getAttribute('data-id')?.slice(0, 8) ?? (words ? 'pane' : '-'),
    note: words.slice(0, 28),
    tab: tabs.join('|'),
    title: title.slice(0, 60),
    spread: !!document.querySelector('button[aria-label="Back beside the note"]')
  }
})
const letters = (text) => [...new Set(text.replace(/\s/g, ''))].sort().join('')
const same = (a, b) => a.view === b.view && a.open === b.open && a.note === b.note && letters(a.tab) === letters(b.tab) && letters(a.title) === letters(b.title) && a.spread === b.spread
const show = (s) => `${s.view || '?'}${s.open !== '-' ? ` open:${s.note || s.open}` : ''}${s.tab ? ` tab:${s.tab}` : ''}${s.spread ? ' spread' : ''}`

const blur = () => h.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
const click = async (selector, text) => {
  const done = await h.evaluate(([s, t]) => {
    const found = [...document.querySelectorAll(s)].find((one) => !t || (one.textContent ?? '').includes(t) || (one.textContent ?? '').replace(/(.)\1/g, '$1').includes(t) || one.getAttribute('aria-label') === t)
    found?.click()
    return !!found
  }, [selector, text])
  if (!done) throw new Error(`nothing to click: ${selector} ${text ?? ''}`)
  await wait()
}
const side = (label) => click(`aside nav button[aria-label="${label}"]`)
const nth = async (selector, n) => {
  const done = await h.evaluate(([s, i]) => { const found = document.querySelectorAll(s)[i]; found?.click(); return !!found }, [selector, n])
  if (!done) throw new Error(`no ${selector} #${n}`)
  await wait()
}
const row = (n) => nth('[class*="@container/page"] [data-id]', n)
const go = async (id) => { await send('view', id); await wait() }
const press = async (key) => { await h.keyboard.press(key); await wait(500) }
const esc = () => press('Escape')
const is = (fn) => h.evaluate(fn)
const inEditor = () => is(() => !!document.activeElement?.closest?.('.ProseMirror'))
const editNote = async () => { await h.locator('.note-pane .ProseMirror').first().click(); await h.keyboard.press('Meta+ArrowDown'); await wait(300) }

/**
 * One place: get there, press Escape (as many times as `presses`), then the
 * page must not have moved, and `check` (if any) says the right thing closed.
 */
async function run(name, setup, { presses = 1, check, before: ready, open, loose } = {}) {
  if (only.length && !only.some((one) => name.includes(one))) return
  try {
    await go('home')
    await setup()
    await wait(400)
    const before = await state()
    if (open) await open()
    if (ready && !(await ready())) throw new Error('the starting state was not reached')
    for (let i = 0; i < presses; i++) await esc()
    const after = await state()
    // Spread out, the row under the cursor shows beside the list: a peek, not a page.
    const stayed = loose ? before.view === after.view && before.spread === after.spread : same(before, after)
    const closed = check ? await check() : true
    const ok = stayed && closed
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${stayed ? '' : `\n      moved    ${show(before)}  →  ${show(after)}`}${closed ? '' : '\n      the thing Escape should close is still there'}`)
  } catch (error) {
    results.push({ name, ok: false })
    console.log(`FAIL  ${name}  (${String(error.message ?? error).slice(0, 200)})`)
  }
}

try {
  // --- A note or capture open: Escape never puts it away --------------------------------
  await run('Inbox: a note open, nothing focused', async () => { await side('Inbox'); await row(0); await blur() }, { presses: 3 })
  await run('Inbox: writing in the note, Escape lets go of the editor', async () => { await side('Inbox'); await row(0); await editNote() },
    { before: inEditor, check: async () => !(await inEditor()) })
  await run('Inbox: writing in the note, Escape three times', async () => { await side('Inbox'); await row(0); await editNote() }, { presses: 3 })
  await run('Inbox: words selected in the note, Escape lets them go first', async () => { await side('Inbox'); await row(0); await editNote(); await h.keyboard.press('Meta+a'); await wait(200) },
    { before: () => is(() => !window.getSelection()?.isCollapsed), check: async () => (await inEditor()) && (await is(() => window.getSelection()?.isCollapsed)) })
  await run('Inbox: the side panel focused', async () => {
    await side('Inbox'); await row(0)
    await h.evaluate(() => [...document.querySelectorAll('[class*="@container/page"] button')].filter((one) => !one.closest('.ProseMirror') && one.closest('.note-pane, aside, [class*="props"]')).pop()?.focus())
  }, { presses: 2 })
  await run('Inbox: the title focused', async () => { await side('Inbox'); await row(0); await h.locator('.note-pane textarea.font-heading, .note-pane input.font-heading').first().focus().catch(() => {}) }, { presses: 2 })
  await run('Inbox: find in the note, Escape closes the find bar', async () => { await side('Inbox'); await row(0); await editNote() },
    { open: () => press('Meta+f'), before: () => is(() => !!document.querySelector('.tiptap-find-bar:not([inert])')), check: () => is(() => !document.querySelector('.tiptap-find-bar:not([inert])')) })
  await run('Nuggets: one open', async () => { await go('nuggets'); await row(0); await blur() }, { presses: 2 })
  await run('Nuggets: writing in one', async () => { await go('nuggets'); await row(0); await editNote() }, { presses: 2 })
  await run('Questions: one open', async () => { await go('questions'); await row(0); await blur() }, { presses: 2 })
  await run('Goals: one open', async () => { await go('goals'); await row(0); await blur() }, { presses: 2 })
  await run('Today: a task open', async () => { await side('Today'); await nth('[class*="@container/page"] button[data-row]', 0); await blur() }, { presses: 2 })
  await run('Week: a task open', async () => { await go('week'); await click('[data-day] button[data-cursor], [data-day] button'); await blur() }, { presses: 2 })
  await run('Matrix: a task open', async () => { await go('matrix'); await click('[data-quadrant] button'); await blur() }, { presses: 2 })
  await run('Tags: a tag picked', async () => { await go('tags'); await click('[class*="@container/page"] button', 'renaissance'); await blur() }, { presses: 2 })

  // --- Lists: Escape lets go of what is passing, and only that -----------------------------
  await run('Inbox: several selected, Escape lets them go', async () => { await side('Inbox'); await blur(); await press('j'); await press('x'); await press('j'); await press('x') },
    { before: () => is(() => /selected/.test(document.querySelector('[class*="@container/page"]')?.textContent ?? '')), check: () => is(() => !/\d+\s*selected/.test(document.querySelector('[class*="@container/page"]')?.textContent ?? '')) })
  await run('Inbox spread: Escape empties the search, then stays spread', async () => {
    await side('Inbox'); await click('button[aria-label="Spread the list over the page"]')
    await h.locator('[class*="@container/page"] input[placeholder^="Search in"]').first().fill('the'); await wait(400); await blur()
  }, { presses: 2, loose: true, check: () => is(() => !document.querySelector('[class*="@container/page"] input[placeholder^="Search in"]')?.value) })

  // --- Things held over the page: Escape closes them, and the page under them stays --------
  await run('⌘K: Escape closes the palette', async () => { await side('Inbox'); await row(0); await blur() },
    { open: () => press('Meta+k'), before: () => is(() => !!document.querySelector('[role="dialog"]')), check: () => is(() => !document.querySelector('[role="dialog"]')) })
  await run('?: Escape closes the shortcut sheet', async () => { await side('Inbox'); await blur() },
    { open: () => press('Shift+Slash'), before: () => is(() => !!document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')), check: () => is(() => !document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')) })
  await run('Your month, wrapped: Escape closes it', async () => { await go('stats'); await blur() }, {
    open: async () => { await press('Meta+k'); await h.keyboard.type('month, wrapped', { delay: 40 }); await wait(900); await h.keyboard.press('Enter'); await wait(1500) },
    // The month's wrap is the story of cards now (wrap-story.tsx), "September, wrapped".
    before: () => is(() => !!document.querySelector('[role="dialog"][data-wrap-story]')), check: () => is(() => !document.querySelector('[role="dialog"][data-wrap-story]'))
  })
  await run('Your year, wrapped: Escape closes it', async () => { await go('stats'); await blur() }, {
    open: async () => { await press('Meta+k'); await h.keyboard.type('year, wrapped', { delay: 40 }); await wait(900); await h.keyboard.press('Enter'); await wait(1500) },
    before: () => is(() => !!document.querySelector('[aria-label="Recap"]')), check: () => is(() => !document.querySelector('[aria-label="Recap"]'))
  })

  // --- The box: Escape puts the window away, and never goes back to the note ----------------
  const { page, electron } = c
  const boxShown = () => electron.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === u)?.isVisible(), page.url())
  const boxCase = async (name, setup, check) => {
    if (only.length && !only.some((one) => name.includes(one))) return
    try {
      await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(1200)
      await setup()
      await page.keyboard.press('Escape'); await page.waitForTimeout(900)
      const hid = !(await boxShown())
      await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(1200)
      const kept = await check()
      const ok = hid && kept
      results.push({ name, ok })
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${hid ? '' : '\n      the box stayed up'}${kept ? '' : '\n      it came back somewhere else'}`)
    } catch (error) {
      results.push({ name, ok: false })
      console.log(`FAIL  ${name}  (${String(error.message ?? error).slice(0, 200)})`)
    }
  }
  const reading = () => page.evaluate(() => [...document.querySelectorAll('button')].some((one) => (one.textContent ?? '').includes('Back to your note')))
  await boxCase('Box: writing, Escape puts it away', async () => { await page.locator('.tiptap.ProseMirror').first().click() }, async () => !(await reading()))
  await boxCase('Box: a task open in place of the note, Escape puts it away, the task still there', async () => {
    if (!(await page.locator('button[aria-label="Hide the side panel"]').count())) await page.click('button[aria-label="Show the side panel"]')
    await page.waitForTimeout(1200)
    await page.keyboard.press('Control+2'); await page.waitForTimeout(900)
    await page.evaluate(() => document.querySelector('[data-row]')?.click()); await page.waitForTimeout(1200)
    if (!(await reading())) throw new Error('no task opened in the box')
    await page.evaluate(() => document.activeElement?.blur())
  }, reading)
} finally {
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
if (failed.length) console.log(`Failed: ${failed.map((one) => one.name).join('; ')}`)
process.exit(failed.length ? 1 : 0)
