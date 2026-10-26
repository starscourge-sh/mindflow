// A folder's icon can be a picture of your own, as in Notion: "Change icon…" has "Upload", a PNG, JPG, GIF or SVG
// is stored with the book's pictures, and it shows as the folder's icon in the sidebar and the list.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/folder-picture.mjs
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
// A two-frame 2x2 GIF: red, then blue.
const gif = join(mkdtempSync(join(tmpdir(), 'qa-gif-')), 'cherry.gif')
writeFileSync(gif, Buffer.from('R0lGODlhAgACAPABAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==', 'base64'))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('articles'); await wait(1200)
  const id = (await v('groups', 'article'))[0]?.id
  const row = h.locator(`[data-side-folder="${id}"]`).first()
  await row.click({ button: 'right' })
  await h.getByRole('menuitem', { name: /Change icon/ }).click()
  await wait(500)
  check('"Change icon…" offers "Upload"', (await h.locator('[data-folder-upload]').count()) === 1)
  await h.locator('[data-folder-upload] input[type=file]').setInputFiles(gif)
  await wait(1200)
  const icon = (await v('groups', 'article')).find((one) => one.id === id)?.icon
  check('the picture is stored with the book and set as the icon', /^haligtree:\/\/assets\/[0-9a-f]+\.gif$/.test(icon ?? ''), icon)
  const shown = await h.evaluate((id) => { const one = document.querySelector(`[data-folder-icon="${id}"] img[data-folder-picture]`); return one && { loaded: one.complete && one.naturalWidth > 0, w: Math.round(one.getBoundingClientRect().width) } }, id)
  check('it shows as the folder\'s icon in the sidebar, icon-sized', shown?.loaded && shown.w >= 12 && shown.w <= 20, JSON.stringify(shown))
  if (shots) await h.screenshot({ path: `${shots}/folder-picture.png`, clip: { x: 0, y: 0, width: 420, height: 500 } })
  // Pointed at, the folder's icon shows a little box round it: it can be clicked to change.
  const iconButton = h.locator(`[data-folder-icon="${id}"]`)
  const rest = await iconButton.evaluate((one) => getComputedStyle(one).boxShadow)
  await iconButton.hover(); await wait(300)
  const lit = await iconButton.evaluate((one) => ({ ring: getComputedStyle(one).boxShadow, bg: getComputedStyle(one).backgroundColor, cursor: getComputedStyle(one).cursor }))
  check('pointed at, the icon shows a box round it and a pointer', lit.ring !== rest && lit.ring !== 'none' && lit.bg !== 'rgba(0, 0, 0, 0)' && lit.cursor === 'pointer', JSON.stringify({ rest, lit }))
  if (shots) await h.screenshot({ path: `${shots}/folder-icon-hover.png`, clip: { x: 0, y: 0, width: 420, height: 500 } })
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
