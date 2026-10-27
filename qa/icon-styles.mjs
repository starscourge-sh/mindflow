// Settings, Appearance: "Icons" (Lines or Emoji, for the sidebar and the Map; menus keep their lines) and "Coloured icons" (off: the sidebar's pages and tag icons
// in one colour, menu emoji greyed). Checked on a real right-click menu and the sidebar, with pictures.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/icon-styles.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
let opened = false
const menu = async () => {
  if (!opened) (await h.locator('aside').getByText('Inbox', { exact: true }).first().click(), await wait(1200), (opened = true))
  await h.locator('[data-pane] .list-edge [data-row], [data-pane] [data-row]').first().click({ button: 'right' }); await wait(500)
  return h.evaluate(() => [...document.querySelectorAll('[role=menu] [data-menu-icon]')].map((one) => one.getAttribute('data-menu-icon') === 'emoji' ? one.textContent : 'svg'))
}
const colours = () => h.evaluate(() => [...document.querySelectorAll('aside [data-side-row] svg')].slice(0, 6).map((one) => getComputedStyle(one).color))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const lines = await menu()
  check('menus draw lines to start', lines.length > 3 && lines.every((one) => one === 'svg'), JSON.stringify(lines))
  await h.keyboard.press('Escape')
  const before = await colours()
  check('the sidebar\'s pages in their own colours to start', new Set(before).size > 2, JSON.stringify(before))
  await v('settings:set', { menuIcons: 'emoji' }); await wait(500)
  const emoji = await menu()
  check('"Emoji": menus keep their lines', emoji.length > 3 && emoji.every((one) => one === 'svg'), JSON.stringify(emoji))
  await shot('menu-emoji')
  const side = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row] .mf-emoji-icon')].map((one) => one.textContent).slice(0, 8))
  check('"Emoji": the sidebar\'s pages and tags carry emoji too', side.length >= 5, JSON.stringify(side))
  await h.keyboard.press('Escape')
  await c.send('view', 'map'); await wait(3500)
  await h.evaluate(() => document.querySelectorAll('[data-pane] canvas').length)
  check('"Emoji": the Map\'s key shows the kinds as emoji', await h.evaluate(() => document.querySelectorAll('.mf-emoji-icon').length > 8))
  // Close in, where the dots are big enough to carry their kind.
  await h.locator('[data-pane] input[placeholder="Find a note"]').fill('Hamlet'); await wait(400)
  await h.keyboard.press('Enter'); await wait(1500)
  await shot('map-emoji')
  opened = false
  await h.keyboard.press('Escape')
  await v('settings:set', { iconColour: false }); await wait(500)
  const after = await colours()
  // One colour, at the strengths a row gives it (the page you are on fuller): no colour of its own left in any.
  const chroma = await h.evaluate((list) => list.map((one) => { const d = document.createElement('i'); d.style.color = `oklch(from ${one} l c h)`; document.body.append(d); const c = Number(getComputedStyle(d).color.match(/oklch\([\d.]+ ([\d.]+)/)?.[1] ?? 1); d.remove(); return c }), after)
  check('"Coloured icons" off: the pages in one colour', chroma.every((one) => one < 0.04), JSON.stringify(chroma))
  const grey = await h.evaluate(() => getComputedStyle(document.querySelector('aside .mf-emoji-icon')).filter)
  check('and the sidebar\'s emoji greyed', /grayscale/.test(grey), grey)
  await shot('menu-emoji-mono')
  await h.keyboard.press('Escape')
  await c.send('view', 'settings'); await wait(1500)
  await h.locator('[data-pane] input[placeholder^="Search"]').first().fill('icons'); await wait(900)
  await shot('settings-icons')
  check('the settings show both', await h.evaluate(() => !!document.querySelector('[data-menu-icons-sample=emoji]') && !!document.querySelector('[data-icon-colour-sample]')))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
