// What a picture shows, and pictures alike (rows 7 and 36 of "What macOS Gives Haligtree"; every Mac, Vision on this
// Mac, read in quiet minutes, here at once by the probes' own turn): in Files' Images, the Mac's words for the pictures
// as chips that pick the pictures showing it; a picture's right-click “More like this” lists the closest first; two
// screenshots of the same page, one word apart, are gathered under “Near copies”, and one click keeps the newest and
// moves the other to the Bin, with Undo. The pictures are drawn by the app in a hidden window; nothing leaves the Mac.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/mac-picture-sight.mjs
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, electron } = c
const dir = mkdtempSync(join(process.env.QA_DATA ?? tmpdir(), 'sight-'))
const page = (word) => `<!doctype html><body style="margin:0;padding:40px;background:#f4f4f6;font:20px -apple-system,sans-serif;color:#222;width:1000px">
<div style="background:#fff;border-radius:10px;padding:30px;box-shadow:0 2px 8px #0002"><h2 style="margin:0 0 12px">Quarterly notes</h2>
<p>Meeting moved to Thursday. Bring the ${word} figures and the draft of the summary.</p><p>Budget review, staffing, timeline for spring.</p></div></body>`
const shapes = `<!doctype html><body style="margin:0;width:1000px;height:640px;background:radial-gradient(circle at 30% 40%,#f5b041,#c0392b 40%,#1b2631 80%)">
<div style="position:absolute;left:600px;top:200px;width:260px;height:260px;border-radius:50%;background:#2e86c1"></div></body>`
const draw = (html, file) => electron.evaluate(async ({ BrowserWindow }, html) => {
  const win = new BrowserWindow({ show: false, width: 1080, height: 700, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((next) => setTimeout(next, 300))
  const shot = await win.webContents.capturePage()
  win.destroy()
  return shot.toPNG().toString('base64')
}, html).then((png) => (writeFileSync(join(dir, file), Buffer.from(png, 'base64')), join(dir, file)))

try {
  await v('settings:set', { sounds: true, celebrate: false })
  const files = [await draw(page('March'), 'notes-1.png'), await draw(page('April'), 'notes-2.png'), await draw(shapes, 'shapes.png')]
  for (const fixture of ['notebook-page.png', 'long-note-pic.jpg']) copyFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), join(dir, fixture)), files.push(join(dir, fixture))
  const added = await v('media:add', files.map((path) => ({ path })))
  check('five pictures added to Files', added.added.length === 5, JSON.stringify(added).slice(0, 200))
  const looked = await v('pictures:sight-now')
  const sight = await v('pictures:sight')
  console.log(`(looked at ${looked}; words: ${JSON.stringify(Object.values(sight.labels)).slice(0, 300)}; near copies: ${JSON.stringify(sight.near.map((group) => group.length))})`)
  check('the two screenshots of one page are gathered as near copies, and nothing else is', sight.near.length === 1 && sight.near[0].length === 2, JSON.stringify(sight.near))

  await c.go('media')
  await h.getByText('Images', { exact: true }).first().click()
  await h.waitForTimeout(800)
  const chips = await h.$$eval('[data-media-seeing]', (all) => all.map((one) => one.getAttribute('data-media-seeing')))
  check('Images shows the Mac’s words for its pictures as chips, each held by two or more', chips.length > 0, JSON.stringify(chips))
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'sight-chips'))
  if (chips.length) {
    const before = await h.$$eval('[data-media-grid] [data-media][data-src]', (all) => all.length)
    await h.click(`[data-media-seeing="${chips[0]}"] button, [data-media-seeing="${chips[0]}"] > *`)
    await h.waitForTimeout(600)
    const after = await h.$$eval('[data-media-grid] [data-media][data-src]', (all) => all.length)
    check(`a chip picks the pictures showing it (“${chips[0]}”: ${after} of ${before})`, after > 0 && after < before, `${after} of ${before}`)
    await h.click(`[data-media-seeing="${chips[0]}"] button, [data-media-seeing="${chips[0]}"] > *`)
    await h.waitForTimeout(400)
  }

  // More like this, from a screenshot's right-click: its near copy first after it.
  const first = sight.near[0]?.[0] ?? ''
  const tile = h.locator(`[data-media-grid] [data-media][data-src="${first}"]`).first()
  await tile.click({ button: 'right' })
  await h.locator('[role=menuitem]', { hasText: 'More like this' }).last().click({ timeout: 6000 })
  await h.waitForTimeout(700)
  const hash = (src) => src?.match(/[a-f0-9]{64}/)?.[0] ?? ''
  const order = await h.$$eval('[data-media-grid] [data-media][data-src]', (all) => all.map((one) => one.getAttribute('data-src')?.match(/[a-f0-9]{64}/)?.[0] ?? ''))
  check('“More like this” shows the picture, then its near copy first', order[0] === hash(first) && order[1] === hash(sight.near[0][1]) && !!(await h.$('[data-media-like]')), JSON.stringify(order.slice(0, 3)))
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'sight-like'))
  await h.click('[data-media-like] > *')
  await h.waitForTimeout(400)

  // Near copies: gathered, one clean-up, Undo.
  await h.click('[data-media-near] > *')
  await h.waitForTimeout(600)
  const button = await h.$eval('[data-media-bin-near]', (one) => one.textContent).catch(() => '')
  check('“Near copies” shows the two, with “Keep the newest of each, move 1 to the Bin”', button === 'Keep the newest of each, move 1 to the Bin' && (await h.$$eval('[data-media-grid] [data-media][data-src]', (all) => all.length)) === 2, button)
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'sight-near'))
  await h.click('[data-media-bin-near]')
  await h.waitForTimeout(800)
  const notice = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((el) => el.textContent).join(' | '))
  const binned = (await v('media:list')).filter((one) => sight.near[0].includes(one.src))
  check('one moved to the Bin, said with Undo', /Moved to the Bin/.test(notice) && /Undo/.test(notice) && binned.length === 1, `${notice} | ${binned.length} left`)
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await h.waitForTimeout(800)
  check('Undo brings it back', (await v('media:list')).filter((one) => sight.near[0].includes(one.src)).length === 2)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
