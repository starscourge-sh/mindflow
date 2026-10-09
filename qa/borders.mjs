/**
 * No coloured side stripes on rounded boxes: a note with callouts of several
 * kinds and a quote, the box (with its hint card when there is one), and the
 * welcome's Write chapter, in light, dark, Paper, GitHub and Midnight.
 *
 *   npx electron-vite build --outDir out-borders
 *   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-borders/main/index.js MINDFLOW_QA_AWAY=1 QA_SHOTS=... node qa/borders.mjs
 */
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS ?? 'scratchpad/borders'
mkdirSync(SHOTS, { recursive: true })
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const callout = (icon, color, type, title, text) => ({ type: 'callout', attrs: { icon, color, type, title, fold: '' }, content: [para(text)] })
const NOTE = { type: 'doc', content: [
  para('Callouts and a quote'),
  callout('📝', 'blue', 'note', 'A note', 'Blue, the plain kind.'),
  callout('💡', 'green', 'tip', 'A tip', 'Green, for a hint.'),
  callout('⚠️', 'orange', 'warning', 'Careful', 'Orange, for a warning.'),
  callout('❓', 'purple', 'question', 'Why?', 'Purple, for a question.'),
  callout('⛔', 'red', '', '', 'Red, a plain callout with no title.'),
  { type: 'blockquote', content: [para('A plain quote, set off by its rule and its voice.'), para('It has a second line.')] }
] }

const s = await sandbox({ width: 1100, height: 900 })
const { h, page, v, electron, close } = s
const failures = []
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const id = await h.evaluate((md) => window.api.captures.create({ body: md }), NOTE)
  for (const theme of (process.env.QA_THEMES ?? 'light dark paper github midnight').split(' ')) {
    await s.theme(theme)
    await s.send('capture', id)
    await h.waitForSelector(EDITOR, { timeout: 10000 })
    await h.waitForTimeout(1200)
    const look = await h.evaluate(() => [...document.querySelectorAll('.tiptap-callout, .tiptap blockquote')].map((el) => {
      const cs = getComputedStyle(el)
      return { tag: el.className || el.tagName, left: cs.borderLeftWidth, right: cs.borderRightWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor }
    }))
    for (const one of look) {
      if (one.left !== one.right && one.radius !== '0px') failures.push(`${theme}: ${one.tag} has a side border with a radius`)
    }
    if (theme === 'light') console.log(JSON.stringify(look))
    await h.screenshot({ path: `${SHOTS}/note-${theme}.png` })
    // The box, where the hint card shows.
    await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); win?.setBounds({ x: 60, y: 60, width: 900, height: 600 }); win?.showInactive() })
    await page.evaluate((name) => localStorage.setItem('theme', name), theme)
    await page.reload()
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${SHOTS}/box-${theme}.png` }).catch(() => {})
    // The welcome's Write chapter, early, while the callout is on show.
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 5000 })
    await h.waitForTimeout(800)
    for (const wait of [700, 700, 700]) { await h.keyboard.press('ArrowRight'); await h.waitForTimeout(wait) }
    await h.waitForTimeout(2200)
    await h.screenshot({ path: `${SHOTS}/welcome-write-${theme}.png` })
    await h.reload()
    await h.waitForTimeout(1500)
  }
} catch (error) {
  failures.push(String(error))
}
console.log(failures.length ? failures.join('\n') : 'all passed', s.errors.slice(0, 5))
await close()
process.exit(failures.length ? 1 : 0)
