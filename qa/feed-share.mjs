// Read later, Save as image, Share to X, the capture box's Feed preview,
// "From the archives" and Home's "Today's feed" card.
// Sandbox run (QA_ARGS=--sandbox): Read later puts a post in the queue with
// an Undo and holds after a reload; Save as image writes a PNG at 2x; Share
// to X opens X's compose address with the post's words and copies a picture;
// the box shows the typed words as a post while the pointer rests on Create;
// Home's card counts the day's posts. A second run, a fresh book of imported
// notes (QA_ARGS empty), shows them "From the archives" and never on a rot card.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed7'
mkdirSync(SHOTS, { recursive: true })
const out = mkdtempSync(join(tmpdir(), 'feed-share-'))
const { check, done } = checks()
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const paint = (h, name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
const pngSize = (path) => { const b = readFileSync(path); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), png: b.slice(1, 4).toString() === 'PNG' } }

if (process.env.QA_ARGS) {
  const s = await sandbox({ width: 1400, height: 950 })
  const { h, page, v, go, electron, errors, close } = s
  try {
    // Stand-ins for the save dialog and the browser: no window opens, nothing leaves.
    await electron.evaluate(({ dialog, shell }, dir) => {
      globalThis.__opened = []
      globalThis.__saveAt = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${dir}/card-${++globalThis.__saveAt}.png` })
      shell.openExternal = async (url) => void globalThis.__opened.push(url)
    }, out)
    await go('feed')
    await h.waitForTimeout(1200)
    const post = h.locator('li[data-feed-post="nugget"], li[data-feed-post="capture"]').filter({ has: h.locator('[data-read-later]') }).first()
    const id = await post.getAttribute('data-feed-id')
    const later = post.locator('[data-read-later]')
    const before = await later.boundingBox()
    await later.click()
    await h.waitForTimeout(700)
    const inQueue = async () => (await v('queue')).queue.some((row) => row.itemId === id)
    check('Read later puts the post in the queue', await inQueue(), id)
    check('Read later shows as chosen', (await later.getAttribute('data-read-later')) === 'in')
    check('the toast says "In your queue"', await h.locator('text=In your queue').first().isVisible().catch(() => false))
    const after = await later.boundingBox()
    check('the row keeps its place', before && after && Math.abs(before.x - after.x) < 1, JSON.stringify([before, after]))
    await h.locator('button:has-text("Undo")').first().click()
    await h.waitForTimeout(800)
    check('Undo takes it back out of the queue', !(await inQueue()))
    check('and it no longer shows as chosen', (await later.getAttribute('data-read-later')) === 'out')
    await later.click()
    await h.waitForTimeout(700)
    await h.reload()
    await h.waitForTimeout(2000)
    await go('feed')
    await h.waitForTimeout(1200)
    check('chosen survives a reload', (await h.locator(`li[data-feed-id="${id}"] [data-read-later]`).first().getAttribute('data-read-later')) === 'in')

    // Reading: on a row's hover, and in the reader's foot.
    await h.click('[data-tabs="feed"] [data-tab="reading"]')
    await h.waitForTimeout(900)
    const row = h.locator('[data-reading-row]').first()
    await row.hover()
    await h.waitForTimeout(300)
    const rowLater = h.locator('.group\\/row').first().locator('[data-read-later]')
    check('a Reading row shows Read later on hover', (await rowLater.evaluate((el) => getComputedStyle(el).opacity)) === '1')
    await row.click()
    await h.waitForTimeout(1200)
    check("the reader's foot has Read later", await h.locator('[data-reading-actions] [data-read-later]').isVisible())
    await h.keyboard.press('Escape')
    await h.waitForTimeout(600)
    await h.click('[data-tabs="feed"] [data-tab="notes"]')
    await h.waitForTimeout(900)

    // The ⋯ menu, then Save as image in light and dark.
    const quote = h.locator('li[data-feed-kind="quote"]').first()
    const withPicture = h.locator('li[data-feed-post]').filter({ has: h.locator('[data-feed-picture]') }).first()
    const saveFrom = async (one, theme) => {
      await paint(h, theme)
      await h.waitForTimeout(400)
      await one.scrollIntoViewIfNeeded()
      await one.locator('[data-feed-actions] [data-menu="post"]').click()
      await h.waitForTimeout(400)
      if (theme === 'light' && one === quote) await h.screenshot({ path: `${SHOTS}/menu.png` })
      await h.locator('[role="menu"] [data-menu-item="save-image"]').click()
      await h.waitForTimeout(1800)
      return electron.evaluate(() => globalThis.__saveAt)
    }
    for (const [one, name] of [[quote, 'quote'], [withPicture, 'picture']]) for (const theme of ['light', 'dark']) {
      const n = await saveFrom(one, theme)
      const file = `${out}/card-${n}.png`
      let ok = false
      try { ok = statSync(file).size > 8000 } catch {}
      const size = ok ? pngSize(file) : { w: 0, h: 0, png: false }
      check(`Save as image writes a PNG (${name}, ${theme})`, ok && size.png, file)
      check(`at 2x: 1200px wide (${name}, ${theme})`, size.w === 1200 && size.h > 300, JSON.stringify(size))
      if (ok) copyFileSync(file, `${SHOTS}/card-${name}-${theme}.png`)
    }
    await paint(h, 'light')

    // Share to X: X's compose address with the quote and its author, and a picture on the clipboard.
    await electron.evaluate(({ clipboard }) => clipboard.writeText('nothing'))
    const words = await quote.locator('blockquote').textContent()
    const who = await quote.locator('[data-feed-author]').textContent().catch(() => '')
    await quote.locator('[data-feed-actions] [data-menu="post"]').click()
    await h.waitForTimeout(300)
    await h.locator('[role="menu"] [data-menu-item="share-x"]').click()
    await h.waitForTimeout(1800)
    const opened = await electron.evaluate(() => globalThis.__opened)
    const url = opened.at(-1) ?? ''
    const text = url.startsWith('https://x.com/intent/post?text=') ? decodeURIComponent(url.slice('https://x.com/intent/post?text='.length)) : ''
    check('Share to X opens X\'s compose address', !!text, url.slice(0, 80))
    check('with the quote and its author, 280 at most', text.length <= 280 && text.includes(words.trim().split(/\s+/).slice(0, 4).join(' ')) && (!who || text.includes(who.trim())), text)
    check('and a picture on the clipboard', await electron.evaluate(({ clipboard }) => clipboard.has('image/png')))
    check('the toast says where the picture is', await h.locator('text=the picture is copied, paste it in').first().isVisible().catch(() => false))

    // Home's card: the day's count.
    const feed = await v('feed')
    await go('home')
    await h.waitForTimeout(1200)
    const said = await h.locator('[data-todays-feed-count]').textContent().catch(() => '')
    check("Home's card says the day's count", said.startsWith(`${feed.posts.length} posts today`), said)
    const card = h.locator('[data-todays-feed]')
    await card.scrollIntoViewIfNeeded().catch(() => {})
    if (await card.isVisible().catch(() => false)) await card.screenshot({ path: `${SHOTS}/home-card.png` })
    else await h.screenshot({ path: `${SHOTS}/home-card.png` })
    // Read to the end, the card goes.
    await go('feed')
    await h.waitForTimeout(900)
    await h.locator('[data-feed-end]').scrollIntoViewIfNeeded()
    await h.waitForTimeout(600)
    await go('home')
    await h.waitForTimeout(900)
    check("the card goes once the day's Feed is read to its end", (await h.locator('[data-todays-feed]').count()) === 0)

    // The box: the typed words as a post, while the pointer rests on Create.
    await electron.evaluate(({ BrowserWindow }, url) => { const box = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url); box?.setBounds({ x: 60, y: 60, width: 900, height: 640 }); box?.show() }, page.url())
    await page.waitForTimeout(800)
    await page.click(EDITOR)
    await page.keyboard.type('A preview of the feed\nIt shows the typed words as a post.', { delay: 3 })
    await page.waitForTimeout(500)
    await page.locator('[data-zen-row] button').last().hover()
    await page.waitForTimeout(900)
    const preview = await page.locator('[data-capture-preview]').textContent().catch(() => '')
    check('the box shows how it will look in the Feed', preview.includes('A preview of the feed') && preview.includes('typed words as a post'), preview)
    await page.screenshot({ path: `${SHOTS}/capture-preview.png` })
    await page.mouse.move(10, 10)
    await page.waitForTimeout(300)
    check('and it goes when the pointer leaves', (await page.locator('[data-capture-preview]').count()) === 0)
    await page.click(EDITOR)
    await page.keyboard.press('Meta+A')
    await page.keyboard.press('Backspace')
    check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } finally {
    await close()
  }
} else {
  // A fresh book whose notes came from an import.
  const s = await sandbox({ width: 1200, height: 900, seeded: false })
  const { h, v, go, electron, errors, close } = s
  try {
    const file = join(out, 'old-notes.md')
    const notes = Array.from({ length: 12 }, (_, at) => `# Archive note ${at + 1}\n\nWritten long ago in another app, note ${at + 1}, with enough words to be worth a second look today.`).join('\n\n')
    writeFileSync(file, notes)
    await electron.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    }, file)
    await h.evaluate(() => window.api.importFrom('files'))
    await h.waitForTimeout(1500)
    const feed = await v('feed')
    const archives = feed.posts.filter((post) => post.archive)
    check('imported notes come up in the Feed from day one', archives.length >= 3, `${archives.length} of ${feed.posts.length}`)
    await go('feed')
    await h.waitForTimeout(1200)
    const label = await h.locator('li[data-feed-archive] [data-feed-context]').first().textContent().catch(() => '')
    check('labelled "From the archives"', label === 'From the archives', label)
    const rot = await v('captures:rot').catch(() => [])
    check('never on a rot card', !(Array.isArray(rot) ? rot : []).some((one) => /Archive note/.test(JSON.stringify(one))), JSON.stringify(rot).slice(0, 120))
    check('and no rot cards waiting', (await v('rot:waiting').catch(() => 0)) === 0)
    await go('home')
    await h.waitForTimeout(1200)
    const said = await h.locator('[data-todays-feed-count]').textContent().catch(() => '')
    check("Home's card counts the archives", said === `${feed.posts.length} ${feed.posts.length === 1 ? 'post' : 'posts'} today, ${archives.length} from the archives`, said)
    await h.screenshot({ path: `${SHOTS}/home-archives.png` })
    check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } finally {
    await close()
  }
}
done()
