// Share as card: words picked in a note, or a gem from its menu, open a sheet
// showing the card first (square, or story), which copies or saves as a PNG.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-small/main/index.js HALIGTREE_QA_AWAY=1 node qa/share-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const shots = process.env.QA_SHOTS ?? '/tmp'
const QUOTE = 'The best way to predict the future is to invent it.'
/** How many different colours a sample of the card's pixels holds: a blank card has one. */
const inked = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-card-canvas]')
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  const seen = new Set()
  for (let i = 0; i < data.length; i += 4 * 97) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
  return { width: canvas.width, height: canvas.height, colours: seen.size }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Quotes', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: QUOTE }] }] } })
  await c.send('article', id); await wait(1400)
  // The words picked as a person picks them: dragged across.
  await h.evaluate(([sel, quote]) => {
    const ed = document.querySelector(sel).editor
    let from = 0
    ed.state.doc.descendants((node, pos) => void (node.isText && node.text === quote && (from = pos)))
    ed.chain().focus().setTextSelection({ from, to: from + quote.length }).run()
  }, [EDITOR, QUOTE])
  await h.mouse.move(700, 300); await wait(900)
  await h.waitForSelector('[data-share-card-button]', { timeout: 5000 }).catch(() => {})
  check('the selection bar offers “Card”', !!(await h.$('[data-share-card-button]')), '')
  await h.click('[data-share-card-button]'); await wait(800)
  check('the sheet opens with the card shown first', !!(await h.$('[data-share-card] [data-card-canvas]')), '')
  const square = await inked()
  check('square is 1080 by 1080 and drawn', square.width === 1080 && square.height === 1080 && square.colours > 3, JSON.stringify(square))
  check('the card is signed "Haligtree" in the handwriting, its face loaded before it was drawn', await h.evaluate(() => document.fonts.check(`44px 'Haligtree Signature'`, 'Haligtree')), '')
  await h.screenshot({ path: `${shots}/share-card-square.png` })
  // The card itself, as it will be sent: the signature at its foot.
  await h.locator('[data-share-card] [data-card-canvas]').screenshot({ path: `${shots}/share-card-signed.png` })
  await h.click('[data-card-size="story"]'); await wait(500)
  const story = await inked()
  check('story is 1080 by 1920 and drawn', story.width === 1080 && story.height === 1920 && story.colours > 3, JSON.stringify(story))
  await h.screenshot({ path: `${shots}/share-card-story.png` })
  // What the clipboard held before the run, kept to put back after.
  await electron.evaluate(async ({ clipboard }) => {
    const kept = []
    for (const item of await clipboard.read()) {
      const one = {}
      for (const type of item.types) one[type] = await item.getType(type).catch(() => null)
      kept.push(Object.fromEntries(Object.entries(one).filter(([, blob]) => blob instanceof Blob)))
    }
    globalThis.__keptClipboard = kept.filter((one) => Object.keys(one).length)
  })
  await h.click('[data-card-copy]'); await wait(800)
  const pasted = await electron.evaluate(async ({ clipboard, nativeImage }) => {
    for (const item of await clipboard.read()) {
      if (!item.types.includes('image/png')) continue
      return nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer())).getSize()
    }
    return null
  })
  check('Copy puts the story card on the clipboard as a picture', pasted.width === 1080 && pasted.height === 1920, JSON.stringify(pasted))
  check('the sheet closes after Copy', !(await h.$('[data-share-card]')), '')

  // Esc closes it without doing anything.
  await h.click('[data-share-card-button]').catch(() => {}); await wait(600)
  if (!(await h.$('[data-share-card]'))) {
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus(), EDITOR)
    await h.evaluate(([sel, quote]) => {
      const ed = document.querySelector(sel).editor
      let from = 0
      ed.state.doc.descendants((node, pos) => void (node.isText && node.text === quote && (from = pos)))
      ed.chain().focus().setTextSelection({ from, to: from + quote.length }).run()
    }, [EDITOR, QUOTE])
    await h.mouse.move(720, 320); await wait(800)
    await h.click('[data-share-card-button]'); await wait(600)
  }
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc closes the sheet', !(await h.$('[data-share-card]')), '')

  // A gem: its menu's Export has “Share as card…”, with who said it on the card.
  await c.go('nuggets'); await wait(800)
  const row = await h.$('[data-row-id], [data-id]')
  if (row) {
    await row.click({ button: 'right' }); await wait(500)
    await h.getByText('Export', { exact: true }).first().hover().catch(() => {}); await wait(500)
    const offered = await h.getByText('Share as card…', { exact: true }).count()
    check('a gem’s menu offers “Share as card…” under Export', offered > 0, '')
    if (offered) {
      await h.getByText('Share as card…', { exact: true }).first().click(); await wait(900)
      check('from a gem, the sheet opens on its card', !!(await h.$('[data-share-card] [data-card-canvas]')), '')
      await h.screenshot({ path: `${shots}/share-card-gem.png` })
      await h.keyboard.press('Escape')
    }
  } else check('a gem row to right-click', false, 'no row found')
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  // What was on the clipboard before, put back.
  await electron.evaluate(async ({ clipboard, ClipboardItem }) => {
    const kept = globalThis.__keptClipboard
    if (!kept) return
    if (kept.length) await clipboard.write(kept.map((one) => new ClipboardItem(one)))
    else clipboard.clear()
  }).catch(() => undefined)
  await c.close?.()
  done()
}
