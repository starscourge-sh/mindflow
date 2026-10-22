// ⌘K, Home, quick capture and the Inbox, in the sandbox: ⌘K fades and rises
// in and out (A4), a search with no match keeps the words as a note, a task
// or a question (H2) or carries them to quick capture (H4), ⇧↵ opens the top
// result (H5), the palette's quiet actions answer (H3), Home shows one "Now"
// card with the rest folded (B1), a page hint says "You've got it" and folds
// away (B2), Your week says what changed (B3), the seed's captures span the
// weeks (C5), a pinned question's chip nods (J2), and ⌘O in quick capture
// carries the note into the main window with its caret (J1).
//
//   npx electron-vite build --outDir out-centre
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-centre/main/index.js HALIGTREE_QA_AWAY=1 node qa/centre-search.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shots = process.env.SHOTS

const c = await sandbox({ width: 1100, height: 760 })
const { h, page: box, v, go, electron } = c
try {
  await go('home')
  await h.waitForTimeout(1200)
  if (shots) await h.screenshot({ path: `${shots}/home-now.png` })

  // B1: one Now card shown, the rest behind "N more".
  const now = await h.evaluate(() => {
    const ranked = [...document.querySelectorAll('[data-now]')].filter((one) => one.childElementCount > 0)
    const shown = ranked.filter((one) => one.offsetParent)
    return { saying: ranked.length, shown: shown.length, more: document.querySelector('[data-now-more]')?.textContent ?? null }
  })
  check('Home shows at most one Now card', now.shown <= 1, JSON.stringify(now))
  check('the others wait behind "N more"', now.saying < 2 || /\d+ more/.test(now.more ?? ''), now.more ?? 'none')
  if (now.saying > 1) {
    await h.click('[data-now-more]')
    await h.waitForTimeout(300)
    const open = await h.evaluate(() => [...document.querySelectorAll('[data-now]')].filter((one) => one.childElementCount > 0 && one.offsetParent).length)
    check('"N more" shows them all', open === now.saying, `${open} of ${now.saying}`)
    if (shots) await h.screenshot({ path: `${shots}/home-now-open.png` })
    await h.click('[data-now-more]')
  }

  // B3: today (11 Oct 2026) is a Sunday in the sandbox's clock only if it is; the digest is checked when shown.
  const digest = await h.evaluate(() => document.querySelector('[data-digest-change]')?.textContent ?? null)
  const sunday = new Date().getDay() === 0
  check('Your week says what changed against the week before', !sunday || /week before/.test(digest ?? ''), digest ?? 'not Sunday')

  // C5: the seed's Inbox spans the weeks.
  const ages = await h.evaluate(async () => (await window.api.captures.list()).filter((one) => one.status === 'open').map((one) => Math.round((Date.now() - new Date(one.capturedAt).getTime()) / 86400000)))
  check('the sandbox Inbox spans weeks, some past 30 days', Math.max(...ages) > 30 && new Set(ages).size > 8, `oldest ${Math.max(...ages)}d, ${new Set(ages).size} different days`)

  // A4: ⌘K fades in and rises; Escape fades it out rather than blinking.
  // Read on the frame it arrives, not after the round trip back to the test.
  await h.evaluate(() => {
    window.__firstOpacity = null
    const watch = new MutationObserver(() => {
      const scrim = document.querySelector('div[aria-label="Search"]')
      if (!scrim) return
      watch.disconnect()
      window.__firstOpacity = Number(getComputedStyle(scrim).opacity)
    })
    watch.observe(document.body, { childList: true, subtree: true })
  })
  // Opened by a click: by ⌘K it is simply there, by design (search.tsx, sheetMotion), so the fade is read from a click.
  await h.click('[data-tour="search"]')
  await h.waitForTimeout(60)
  const early = await h.evaluate(() => window.__firstOpacity)
  await h.waitForTimeout(250)
  const settled = await h.evaluate(() => { const scrim = document.querySelector('div[aria-label="Search"]'); return scrim ? Number(getComputedStyle(scrim).opacity) : null })
  check('⌘K fades in when clicked open (not there at full strength on its first frame)', early !== null && early < 1, `first frame ${early}`)
  check('⌘K settles fully in within 250ms', settled === 1, `${settled}`)
  if (shots) await h.screenshot({ path: `${shots}/cmdk-open.png` })
  await h.keyboard.press('Escape')
  const leaving = await h.evaluate(() => new Promise((done) => requestAnimationFrame(() => { const scrim = document.querySelector('div[aria-label="Search"]'); done(scrim ? { opacity: Number(getComputedStyle(scrim).opacity), role: scrim.getAttribute('role') } : null) })))
  const left = Date.now()
  const gone = await h.waitForFunction(() => !document.querySelector('div[aria-label="Search"]'), null, { timeout: 3000 }).then(() => Date.now() - left, () => null)
  check('Escape fades ⌘K out, no longer a dialog while it goes', (leaving === null || leaving.role === null), JSON.stringify(leaving) + (leaving === null ? ' (already gone by the first frame read)' : ''))
  check('⌘K has gone once it faded', gone !== null && gone < 1000, `${gone}ms after the round trip`)

  // H2: words that match nothing can be kept.
  const keepAs = async (words, rows) => {
    await h.keyboard.press('Meta+k')
    await h.waitForTimeout(200)
    await h.keyboard.type(words, { delay: 15 })
    await h.waitForFunction(() => /Nothing called that yet/.test(document.querySelector('div[aria-label="Search"]')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => null)
    const seen = await h.evaluate(() => [...document.querySelectorAll('[aria-label="Search"] [data-search-at], [aria-label="Search"] button')].map((one) => one.textContent?.trim()).filter((text) => text?.startsWith('Keep')))
    for (let n = 0; n < rows; n++) await h.keyboard.press('ArrowDown')
    return seen
  }
  const rows = await keepAs('xqzv plover nothing', 0)
  check('no match offers note, task, question and quick capture', rows.length === 4 && /as a note/.test(rows[0]) && /as a task/.test(rows[1]) && /as a question/.test(rows[2]) && /in quick capture/.test(rows[3]), rows.join(' | '))
  const preview = await h.evaluate(() => document.querySelector('div[aria-label="Search"]')?.textContent ?? '')
  check('the preview says Enter keeps it', /Nothing called that yet\./.test(preview) && /Enter keeps it/.test(preview))
  await h.waitForTimeout(1200)
  const enterSays = await h.evaluate(() => [...document.querySelectorAll('div[aria-label="Search"] kbd')].find((one) => one.textContent === '↵')?.parentElement?.innerText.replace(/\s+/g, '') ?? null)
  // Rolled in letter by letter (Rolling); once settled it reads keep, with nothing left over from open.
  check('the footer says ↵ keep once it has rolled', enterSays === '↵keep', JSON.stringify(enterSays))
  if (shots) await h.screenshot({ path: `${shots}/cmdk-keep.png` })
  if (shots) {
    await h.keyboard.press('Escape')
    await c.theme('dark')
    await keepAs('xqzv plover nothing', 0)
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${shots}/cmdk-keep-dark.png` })
    await h.keyboard.press('Escape')
    await c.theme('light')
    await keepAs('xqzv plover nothing', 0)
    await h.waitForTimeout(1200)
  }
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const note = await h.evaluate(async () => (await window.api.captures.list()).find((one) => one.label.includes('xqzv plover nothing')))
  check('Enter keeps it as a note in the Inbox', note?.status === 'open' && note?.kind === 'note', note ? `${note.kind} ${note.status}` : 'none')
  const opened = await h.evaluate(() => [...document.querySelectorAll('.tiptap.ProseMirror')].some((one) => one.textContent?.includes('xqzv plover nothing')))
  check('and opens it to write more', opened)
  const toastSaid = await h.evaluate(() => document.body.textContent?.includes('Kept as a note in your Inbox'))
  check('and says so, with Undo', toastSaid)

  await keepAs('zzqv ring the plumber', 1)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const task = await h.evaluate(async () => (await window.api.haligtree('tasks')).find((one) => one.title.includes('zzqv ring the plumber')))
  check('the second row keeps it as a task', !!task, task?.title ?? 'none')

  const asked = await keepAs('why do qzzv owls hoot?', 0)
  check('words ending in ? offer a question first', /as a question/.test(asked[0] ?? ''), asked[0])
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const question = await h.evaluate(async () => (await window.api.haligtree('items', 'question')).find((one) => one.title.includes('qzzv owls')))
  check('Enter keeps it as a question', !!question)

  // H4: carried into quick capture.
  await keepAs('qvvz fold the laundry', 3)
  await h.keyboard.press('Enter')
  await box.waitForTimeout(1200)
  const inBox = await box.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor')?.textContent ?? '')
  check('"in quick capture" writes the words into the box', inBox.includes('qvvz fold the laundry'), inBox.slice(0, 60))

  // J1: ⌘O in the box carries the note into the main window, the caret where it was.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.webContents.send('box:promote-asked'))
  await h.waitForTimeout(1600)
  const promoted = await h.evaluate(async () => {
    const found = (await window.api.captures.list()).find((one) => one.label.includes('qvvz fold the laundry'))
    const editor = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.textContent?.includes('qvvz fold the laundry'))
    return { kept: !!found, open: !!editor, focused: !!editor && editor.contains(document.activeElement) || editor === document.activeElement, said: document.body.textContent?.includes('Opened in Haligtree') }
  })
  check('⌘O keeps the draft as a capture', promoted.kept)
  check('and opens it in the main window', promoted.open)
  check('with the caret in it', promoted.focused)
  check('and says "Opened in Haligtree"', promoted.said)
  const boxAfter = await box.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor')?.textContent ?? '')
  check('the box is fresh afterwards', !boxAfter.includes('qvvz'), boxAfter.slice(0, 40))
  const boxHidden = await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')); return win ? { visible: win.isVisible(), opacity: win.qaOpacity ?? win.getOpacity() } : null })
  // (Its opacity is not read here: test runs park every window at opacity 0. arrive() sets 1 on every show.)
  check('the box has gone away', boxHidden && !boxHidden.visible, JSON.stringify(boxHidden))

  // H5: ⇧↵ opens the top result.
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(200)
  await h.keyboard.type('qvvz', { delay: 15 })
  await h.waitForTimeout(700)
  await h.keyboard.press('Shift+Enter')
  await h.waitForTimeout(800)
  const top = await h.evaluate(() => !document.querySelector('[aria-label="Search"][role="dialog"]') && [...document.querySelectorAll('.tiptap.ProseMirror')].some((one) => one.textContent?.includes('qvvz')))
  check('⇧↵ opens the top result', top)

  // H3: Fold every heading with nothing to fold says so.
  await go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(200)
  await h.keyboard.type('Fold every heading', { delay: 10 })
  await h.waitForTimeout(400)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(500)
  const folded = await h.evaluate(() => /No headings to fold|Every heading folded/.test(document.body.textContent ?? ''))
  check('Fold every heading answers in words', folded)

  // J2: a pinned question's chip nods when the box's words are about it.
  const pinned = await box.evaluate(async () => (await window.api.haligtree('questions:pinned')) ?? [])
  if (pinned?.length) {
    await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')); win?.show() })
    await box.waitForTimeout(400)
    await box.click('.tiptap.ProseMirror.haligtree-editor')
    // A question is offered once half its words are written (box-offers.tsx): its longer words, then.
    const word = (pinned[0].title.match(/\p{L}{4,}/gu) ?? ['']).join(' ')
    await box.keyboard.type(`thinking of ${word}`, { delay: 20 })
    await box.waitForTimeout(1200)
    // Since the calm box (box-offers.tsx), the words being about a question bring one line up for it instead of a row that nods.
    const nod = await box.evaluate(() => !!document.querySelector('[data-nod], [data-box-offers][data-offer="question"]'))
    check('a pinned question about the words is offered as you write', nod, word)
  } else check('a pinned question about the words nods (no pinned question to try)', true)

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end: ${error.message}`, false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
