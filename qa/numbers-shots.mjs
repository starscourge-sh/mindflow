// Numbers with their thousands marked: a big note's word count, the inbox count, Stats and Review.
import { start, done } from './shots-lib.mjs'
const c = await start()
const { page } = c
await c.v('settings:set', { safeMode: false, motion: false, hintRate: 0, rotCount: 0, scenery: false })
await c.theme('dark')
console.log('electron says', await page.evaluate(() => [new Date(2025, 8, 5).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), navigator.language]))
// Enough captures to pass a thousand.
const have = (await page.evaluate(() => window.api.captures.list())).length
for (let i = have; i < 1050; i++) await page.evaluate((i) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `filler ${i}` }] }] } }), i)
// A big note in the box: the word count at its foot.
const editor = page.locator('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
await editor.click()
await page.evaluate((text) => {
  const target = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
  const data = new DataTransfer(); data.setData('text/plain', text)
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, Array.from({ length: 300 }, () => 'word '.repeat(100)).join('\n\n'))
await page.waitForTimeout(1500)
await c.shot(page, 'num-bignote')
console.log('word count:', await page.evaluate(() => document.querySelector('.tiptap-word-count')?.textContent))
await page.evaluate(() => { const t = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)'); t.focus(); document.execCommand('selectAll'); document.execCommand('delete') })
const home = await c.showHome(1180, 900)
for (const view of ['inbox', 'stats', 'review']) {
  await c.send('view', view); await home.waitForTimeout(2500)
  await c.shot(home, `num-${view}`)
  console.log(view, JSON.stringify((await home.evaluate(() => document.querySelector('main')?.innerText ?? '')).replace(/\n(?=\S\n)/g, '').match(/[^\n]*\d,\d{3}[^\n]*/g)))
}
done(c)
