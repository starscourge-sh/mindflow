// The lightsaber, every way in and out of the sandbox (and another book):
// each one runs the one shared saber (window.vigilSaber gets a line), plays
// the same recording (window.vigilHeard), and its blade lasts no longer than
// the sound, within 50ms. The blade is read every 30ms to see the curve: lit
// fast first then settling (ease-out), put away slow first (ease-in). With
// Motion off there is no blade but the same length; with Sounds off, no sound.
//
//   npx electron-vite build --outDir out-saber && QA_ENTRY=out-saber/main/index.js node qa/saber.mjs
import { execSync } from 'child_process'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

// Nothing plays the saber's sound or draws its overlay but the one shared function.
const callers = execSync(String.raw`grep -rnE "\bhum\(|'vigil:going'" src/renderer/src || true`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const stray = callers.filter((line) => !line.startsWith('src/renderer/src/lib/sandbox.ts') && !line.startsWith('src/renderer/src/lib/sound.ts') && !line.includes("addEventListener('vigil:going'") && !line.includes("removeEventListener('vigil:going'"))
check('only lib/sandbox.ts plays the hum or raises the overlay', stray.length === 0, stray.join(' | '))

// A restart is caught, never made.
const stub = (c) => c.electron.evaluate(({ app }) => {
  const children = process.mainModule.require('child_process')
  children.spawn = () => ({ unref() {}, on() {}, kill() {} })
  app.relaunch = () => undefined
  app.quit = () => undefined
  app.exit = () => undefined
  // Nor does it wait for a new run to arrive and then shut the book (sandbox.ts whenArrived): with no
  // new run, it would shut the database ten seconds on and every trial after would see an empty app.
  const every = globalThis.setInterval
  globalThis.setInterval = (fn, ms, ...rest) => (ms === 80 && String(fn).includes('existsSync') ? every(() => undefined, 1e9) : every(fn, ms, ...rest))
})

/** Every 30ms, how far the blade is lit (0 put away, 1 all the way), by its animation's own clock. */
const sample = (h) => h.evaluate(() => {
  window.__frames = []
  clearInterval(window.__sampler)
  window.__sampler = setInterval(() => {
    const blade = document.querySelector('[data-going] .pb-blade > span')
    const run = blade?.getAnimations()[0]
    if (!blade || !run || run.currentTime === null) return
    const tx = new DOMMatrixReadOnly(getComputedStyle(blade).transform).m41
    window.__frames.push([Math.round(run.currentTime), Math.round((1 + tx / (blade.offsetWidth + 16)) * 1000) / 1000])
  }, 30)
})

/** One way in or out: fresh page, trigger, then what the saber says it did. */
async function trial(c, name, trigger, { up, blade = true, sound = true } = {}) {
  const { h } = c
  await h.reload()
  await h.waitForTimeout(1800)
  await sample(h)
  const swung = await h.evaluate(() => (window.vigilSaber ?? []).length)
  // Emptied rather than counted: the page keeps the last 50 sounds, so once it is full a count no longer marks where this trial's begin.
  const heard = await h.evaluate(() => (window.vigilHeard && (window.vigilHeard.length = 0), 0))
  await trigger()
  let entry = null
  for (let i = 0; i < 80 && !entry; i++) {
    await h.waitForTimeout(100)
    entry = await h.evaluate((n) => (window.vigilSaber ?? [])[n] ?? null, swung)
  }
  if (!entry) return check(`${name}: runs the shared saber`, false, 'no saber')
  await h.waitForTimeout(entry.soundMs + 400)
  entry = await h.evaluate((n) => window.vigilSaber[n], swung)
  const frames = await h.evaluate(() => (clearInterval(window.__sampler), window.__frames))
  const played = (await h.evaluate(() => [...(window.vigilHeard ?? [])])).slice(heard)
  const want = up ? 'saber-on' : 'saber-off'
  check(`${name}: runs the shared saber, ${up ? 'lit' : 'put away'}`, entry.up === up, `"${entry.text}"`)
  check(`${name}: ${sound ? `plays ${want}` : 'no sound'}`, sound ? played.includes(want) : !played.some((one) => one.startsWith('saber')), played.join(' ') || 'none')
  if (!blade) return check(`${name}: no blade, the same length`, !entry.blade && entry.bladeMs === null && entry.soundMs > 600, `${entry.soundMs}ms`)
  check(`${name}: sound ${entry.soundMs}ms >= blade ${entry.bladeMs}ms, within 50ms`, entry.blade && entry.bladeMs !== null && entry.soundMs + 50 >= entry.bladeMs && entry.bladeMs >= entry.soundMs - 50)
  const at = (share) => frames.reduce((best, one) => (Math.abs(one[0] - share * entry.soundMs) < Math.abs(best[0] - share * entry.soundMs) ? one : best), frames[0] ?? [0, NaN])
  const steady = frames.every((one, i) => i === 0 || (up ? one[1] >= frames[i - 1][1] - 0.005 : one[1] <= frames[i - 1][1] + 0.005))
  const curve = [0.1, 0.25, 0.5, 0.75].map((share) => `${Math.round(share * 100)}%:${at(share)[1]}`).join(' ')
  if (up) check(`${name}: ease-out, fast first`, frames.length >= 10 && at(0.25)[1] >= 0.7 && at(0.1)[1] >= 0.35 && steady, `${frames.length} frames, ${curve}`)
  // Put away fast first too now: no slow-starting curve anywhere (the motion pass of 15 October).
  else check(`${name}: ease-out, fast first`, frames.length >= 6 && at(0.25)[1] <= 0.5 && at(0.5)[1] <= 0.2 && steady, `${frames.length} frames, ${curve}`)
  return frames
}

const click = (h, selector, text) => h.evaluate(([s, t]) => {
  const found = [...document.querySelectorAll(s)].find((one) => (one.textContent ?? '').trim().includes(t))
  found?.click()
  return !!found
}, [selector, text])
const command = async (h, words) => {
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type(words, { delay: 20 })
  await h.waitForTimeout(700)
  await h.keyboard.press('Enter')
}
const vigilMenu = async (h, item) => {
  await h.locator('button[aria-label="Haligtree menu"]').first().click()
  await h.waitForTimeout(400)
  await h.getByRole('menuitem', { name: item }).first().click()
}
const hold = async (h, text) => {
  const box = await h.locator('button', { hasText: text }).first().boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.mouse.down()
  await h.waitForTimeout(1500)
  await h.mouse.up()
}
// Help, by its own button: a Settings page kept from before keeps the section it was on.
const settingsPage = async (c) => { await c.h.evaluate(() => localStorage.setItem('settings:section', 'Help')); await c.go('settings'); await c.h.waitForTimeout(600); await c.h.locator('[data-section="Help"]').first().click().catch(() => {}); await c.h.waitForTimeout(400) }
const toSandboxCard = (h) => h.locator('button', { hasText: /^(Back to my notes|Open the sandbox|Hold to reset)$/ }).first().scrollIntoViewIfNeeded()
const event = (h, name, detail = null) => h.evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(n, { detail: d })), [name, detail])
// What the menu bar does: the main window is shown and told (main/index.ts inHome).
const menuBar = (c, name) => c.electron.evaluate(({ BrowserWindow }, n) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  win.show()
  return win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('${n}'))`)
}, name)

// --- In the sandbox: every way out, and starting over --------------------------------------
{
  process.env.QA_ARGS = '--sandbox'
  const c = await sandbox({ width: 1100, height: 760 })
  try {
    await c.v('settings:set', { sounds: true, volume: 1, motion: true })
    await stub(c)
    await trial(c, 'pill, Back to my notes', () => click(c.h, '[data-sandbox-pill] button', 'notes'), { up: false })
    await trial(c, 'pill, Reset then Hold to start over', async () => { await click(c.h, '[data-sandbox-pill] button', 'Reset'); await c.h.waitForTimeout(400); await hold(c.h, 'Hold to start over') }, { up: true })
    await trial(c, '⌘K, Back to my notes', () => command(c.h, 'Back to my notes'), { up: false })
    await trial(c, 'Haligtree menu, Back to my notes', () => vigilMenu(c.h, 'Back to my notes'), { up: false })
    await trial(c, 'Settings, Back to my notes', async () => { await settingsPage(c); await toSandboxCard(c.h); await c.h.locator('button', { hasText: /^Back to my notes$/ }).first().click() }, { up: false })
    await trial(c, 'Settings, Hold to reset', async () => { await settingsPage(c); await toSandboxCard(c.h); await hold(c.h, 'Hold to reset') }, { up: true })
    await trial(c, 'menu bar, Back to my notes', () => menuBar(c, 'vigil:sandbox-leave'), { up: false })
    await trial(c, 'book switch, out of the sandbox', () => event(c.h, 'vigil:book-switch', 'default'), { up: false })
    // Cramped: the pill is only the flask, and its menu has the way out.
    await c.size(560, 700)
    await trial(c, 'cramped pill menu, Back to my notes', async () => { await c.h.locator('[data-sandbox-pill] button[aria-label="Sandbox"]').click(); await c.h.waitForTimeout(400); await c.h.getByRole('menuitem', { name: 'Back to my notes' }).click() }, { up: false })
    check('no page errors in the sandbox', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.filter((one) => one.startsWith('PAGEERROR')).join(' | '))
  } finally {
    await c.close()
  }
}

// --- In your own Haligtree: every way in, another book, Motion off and Sounds off --------------
{
  process.env.QA_ARGS = ''
  const c = await sandbox({ width: 1100, height: 760, seeded: false })
  try {
    await c.v('settings:set', { sounds: true, volume: 1, motion: true })
    await c.v('onboarding:set', { welcomed: new Date().toISOString() })
    // Made before the first restart is caught: that lets go of the menu bar, which a new book updates.
    const id = await c.v('books:create', 'Scratch')
    await stub(c)
    await trial(c, '⌘K, Open the sandbox', () => command(c.h, 'Open the sandbox examples'), { up: true })
    await trial(c, 'Haligtree menu, Open the sandbox', () => vigilMenu(c.h, 'Open the sandbox…'), { up: true })
    await trial(c, 'Settings, Open the sandbox', async () => { await settingsPage(c); await toSandboxCard(c.h); await c.h.locator('button', { hasText: /^Open the sandbox$/ }).first().click() }, { up: true })
    await trial(c, 'menu bar, Open the sandbox', () => menuBar(c, 'vigil:sandbox-enter'), { up: true })
    await trial(c, 'book switch, to the sandbox', () => event(c.h, 'vigil:book-switch', 'sandbox'), { up: true })
    await trial(c, 'book switch, to another book', () => event(c.h, 'vigil:book-switch', id), { up: true })
    await c.v('settings:set', { motion: false })
    await trial(c, 'Motion off', () => event(c.h, 'vigil:sandbox-enter'), { up: true, blade: false })
    await c.v('settings:set', { motion: true, sounds: false })
    const frames = await trial(c, 'Sounds off', () => event(c.h, 'vigil:sandbox-enter'), { up: true, sound: false })
    if (frames) console.log('  lit, by the ms:', frames.filter((_, i) => i % 3 === 0).map(([t, p]) => `${t}:${p}`).join(' '))
    await c.v('settings:set', { sounds: true })
    check('no page errors at home', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.filter((one) => one.startsWith('PAGEERROR')).join(' | '))
  } finally {
    await c.close()
  }
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
