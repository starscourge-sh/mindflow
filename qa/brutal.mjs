// The Brutal theme, page by page: anything soft left over (a blurred shadow,
// a rounded corner) is listed by its classes, and every page is saved as a
// picture for looking at.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-brutal/main/index.js SHOTS=<dir> THEME=brutal node qa/brutal.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const theme = process.env.THEME ?? 'brutal'
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/brutal`
const pages = (process.env.PAGES ?? 'home,inbox,review,today,goals,questions,nuggets,articles,week,weekpage,monthpage,yearpage,day,tags,stats,settings,powers,map').split(',')
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1000, height: 700 })
const { h, go } = c
await c.theme(theme)
await c.size(1000, 700)

/** What is still soft on a page: blurred shadows and rounded corners, by class. */
const soft = (page) => page.evaluate(() => {
  const out = { blurred: {}, rounded: {} }
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').split(/\s+/).slice(0, 6).join('.')}`
  const blurred = (shadow) => shadow !== 'none' && shadow.split(/,(?![^(]*\))/).some((one) => {
    if (/inset/.test(one)) return false
    const lengths = one.replace(/(rgba?|oklab|oklch|color-mix|color)\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []
    return parseFloat(lengths[2] ?? '0') > 0
  })
  for (const el of document.querySelectorAll('body *')) {
    const box = el.getBoundingClientRect()
    if (!box.width || !box.height) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity === '0') continue
    if (blurred(style.boxShadow)) out.blurred[name(el)] = (out.blurred[name(el)] ?? 0) + 1
    if (el.classList.contains('app-container')) continue
    if (style.borderRadius && !/^0px( 0px)*$/.test(style.borderRadius)) out.rounded[name(el)] = (out.rounded[name(el)] ?? 0) + 1
  }
  return out
})

const report = {}
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const want = (name) => !only.length || only.includes(name)
for (const page of pages) {
  if (!want(page)) continue
  await go(page)
  await h.waitForTimeout(500)
  await h.screenshot({ path: `${dir}/${page}-${theme}.png` })
  const found = await soft(h)
  if (Object.keys(found.blurred).length || Object.keys(found.rounded).length) report[page] = found
}
// Menus, the palette, a dialog and the welcome, each opened and photographed.
const surface = async (name, open) => {
  if (!want(name)) return
  await go('home'); await h.waitForTimeout(300)
  try { await open() } catch (error) { console.log(name, 'did not open:', error.message.split('\n')[0]); return }
  await h.waitForTimeout(700)
  await h.screenshot({ path: `${dir}/${name}-${theme}.png` })
  const found = await soft(h)
  if (Object.keys(found.blurred).length || Object.keys(found.rounded).length) report[name] = found
  await h.keyboard.press('Escape'); await h.waitForTimeout(300); await h.keyboard.press('Escape')
}
await surface('row-menu', async () => { await go('inbox'); await h.click('text=Kessel Run maths', { button: 'right', timeout: 5000 }) })
await surface('palette', async () => { await h.keyboard.press('Meta+k') })
await surface('options-menu', async () => { await h.click('text=Vigil sandbox') })
await surface('dialog', async () => { await go('goals'); await h.click('text=New goal') })
await surface('welcome', async () => { await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome'))); await h.waitForSelector('.mf-welcome', { timeout: 5000 }) })
if (want('pill')) {
  await h.evaluate(() => window.api.vigil('timer:start', 'Write the brief', 600000))
  await h.evaluate(() => window.api.showFocus(true))
  await h.waitForTimeout(2500)
}
// The windows of their own: the stickies, the beacon, and the box.
for (const win of c.electron.windows()) {
  const url = win.url()
  const kind = url.includes('view=sticky') ? `sticky-${new URL(url).searchParams.get('type')}` : url.includes('view=focus') ? 'pill' : url.includes('view=home') ? null : 'box'
  if (!kind || (!want(kind) && !want(kind.split('-')[0]))) continue
  if (kind === 'box') continue
  await win.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme).catch(() => {})
  await win.waitForTimeout(600)
  await win.screenshot({ path: `${dir}/${kind}-${theme}.png` }).catch(() => {})
  const found = await soft(win).catch(() => null)
  if (found && (Object.keys(found.blurred).length || Object.keys(found.rounded).length)) report[kind] = found
}
// The box: the first window, shown, with a thought being typed into it.
if (want('box')) {
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  await c.page.waitForTimeout(800)
  await c.page.keyboard.type('Ring the plumber about the boiler', { delay: 10 }).catch(() => {})
  await c.page.waitForTimeout(600)
  await c.page.screenshot({ path: `${dir}/box-${theme}.png` })
  const found = await soft(c.page)
  if (Object.keys(found.blurred).length || Object.keys(found.rounded).length) report.box = found
}
console.log(JSON.stringify(report, null, 1))
console.log('ERRORS', JSON.stringify(c.errors.slice(0, 20)))
await c.close()
process.exit(0)
