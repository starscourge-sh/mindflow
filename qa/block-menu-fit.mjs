// A tall block's grip menu in quick capture fits whole, light and dark: a table filling a short box (QC2's frame of
// 15 Nov, its "Delete" cut by the menu's own scroll fade 9px from the box's foot) opens its menu where every line
// shows, nothing scrolled out of sight, inside the window, titled "Table". Frames under FRAMES (a folder).
//   QA_DATA=<a sandbox copy> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [FRAMES=<dir>] node qa/block-menu-fit.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const FRAMES = process.env.FRAMES ?? ''
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const { page, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const BOX = page.url()
const box = (fn, arg) => electron.evaluate(({ BrowserWindow }, [code, a, url]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url), a), [fn, arg, BOX])
const shot = async (name) => {
  if (!FRAMES) return
  const png = await electron.evaluate(async ({ BrowserWindow }, url) => (await BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url).webContents.capturePage()).toPNG().toString('base64'), BOX)
  writeFileSync(join(FRAMES, `${name}.png`), Buffer.from(png, 'base64'))
}
const TABLE = '<p>Cost clean-up, done this week.</p><table><tbody><tr><th><p>Service</p></th><th><p>State</p></th><th><p>Note</p></th></tr><tr><td><p>NAT gateways in FastCatVPC</p></td><td><p>removed</p></td><td><p>saves 32 a month</p></td></tr><tr><td><p>Elastic IPs in FastCatVPC</p></td><td><p>removed</p></td><td><p>two left unattached</p></td></tr><tr><td><p>Load balancer</p></td><td><p>kept</p></td><td><p>serves the API</p></td></tr></tbody></table><p></p>'
try {
  await c.v('settings:set', { hintRate: 0, motion: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  // The box as QC2 had it: short, its table low enough that no menu fits under it.
  await box('const b = win.getBounds(); win.setBounds({ ...b, width: 640, height: 560 })', 0)
  await wait(400)
  for (const look of ['paper', 'dark']) {
    await page.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, look)
    await page.$eval(EDITOR, (root, html) => root.editor.commands.setContent(html), TABLE)
    await wait(400)
    await page.locator(`${EDITOR} td`, { hasText: 'NAT gateways' }).first().hover()
    await wait(300)
    await page.locator('.tiptap-drag-handle-grip').click()
    await wait(500)
    await shot(`${look}-table-menu`)
    const fits = await page.evaluate(() => {
      const menu = document.querySelector('.tiptap-block-menu')
      const list = menu?.querySelector('.tiptap-block-menu-list')
      if (!menu || !list) return null
      const box = menu.getBoundingClientRect()
      const rows = [...list.querySelectorAll('[role=menuitem]')]
      const last = rows.at(-1)?.getBoundingClientRect()
      return { title: menu.querySelector('[data-kind-heading]')?.textContent ?? '', rows: rows.length, last: rows.at(-1)?.textContent.trim(), scrolls: list.scrollHeight - list.clientHeight, top: Math.round(box.top), bottom: Math.round(box.bottom), h: innerHeight, lastBottom: last && Math.round(last.bottom), listBottom: Math.round(list.getBoundingClientRect().bottom) }
    })
    check(`${look}: the table's grip menu fits whole in a short quick capture, its last line ("Delete") in sight, nothing scrolled away`, !!fits && fits.rows >= 5 && fits.scrolls <= 1 && fits.top >= 0 && fits.bottom <= fits.h && fits.lastBottom <= fits.listBottom, JSON.stringify(fits))
    check(`${look}: and it is titled for what it is on ("Table")`, fits?.title === 'Table', fits?.title)
    await page.keyboard.press('Escape')
    await wait(300)
  }
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
