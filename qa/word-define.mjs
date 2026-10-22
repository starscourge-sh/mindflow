// A word's meaning in quick capture, driven as a person would: common and rare
// words, plurals and other forms, names, slips of the key, two words, other
// languages, a slow and a missing connection, a word that grows into a
// sentence before its meaning lands, switching kind, Create while it is
// asked, Tab to keep and to leave out, Esc, the right-click menu, and the
// “Word meanings” setting. Read back through the page and the app's own API.
//
// The Mac's own Dictionary answers as it does for anyone (HALIGTREE_QA_MAC_DICT=on);
// the web dictionary behind it is a small local server (HALIGTREE_QA_DICT, honoured
// only on a QA data folder), so a slow or missing answer is the same every run.
//
//   npx electron-vite build --outDir out-define
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-define/main/index.js HALIGTREE_QA_AWAY=1 node qa/word-define.mjs
//
// SHOTS=dir saves light and dark pictures. ONLY=a,b runs the checks whose names hold them.
import { createServer } from 'http'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { open } from './harness.mjs'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-define-'))
process.env.HALIGTREE_QA_MAC_DICT = 'on'

// --- the web dictionary, played by a local server: only words the Mac does not know --
const hits = []
const ENTRIES = {
  glimmerwick: { delay: 1500, part: 'noun', definition: 'A made-up word for the last light of a candle.', example: 'The glimmerwick held until dawn.' },
  slowword: { delay: 2500, part: 'noun', definition: 'A word the dictionary takes its time over.', example: '' },
  // Each asked once only (an answer is kept, and a kept one comes at once).
  driftwordle: { delay: 2000, part: 'noun', definition: 'A word that drifts.', example: '' },
  lanternmoss: { delay: 2500, part: 'noun', definition: 'Moss that glows.', example: '' },
  emberquill: { delay: 2500, part: 'noun', definition: 'A pen dipped in fire.', example: '' }
}
const server = createServer((req, res) => {
  const word = decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop() ?? '')
  hits.push(word)
  const entry = ENTRIES[word]
  if (!entry) return (res.writeHead(404, { 'content-type': 'application/json' }), res.end('{"title":"No Definitions Found"}'))
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify([{ word, phonetic: '/ˈɡlɪmə/', phonetics: [], meanings: [{ partOfSpeech: entry.part, definitions: [{ definition: entry.definition, ...(entry.example ? { example: entry.example } : {}) }] }] }]))
  }, entry.delay)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
server.unref()
process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${server.address().port}/api/v2/entries/en/`

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
let qa = await open()
let { page } = qa
if (!(await page.evaluate(() => window.api.haligtree('onboarding:state').then((s) => !!s?.welcomed)))) {
  await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false }))
  const child = qa.electron.process()
  await qa.close?.()
  try { child.kill('SIGKILL') } catch {}
  await new Promise((done) => setTimeout(done, 1500))
  qa = await open()
  page = qa.page
}
const errors = []
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`))
const results = []
const wait = (ms = 300) => page.waitForTimeout(ms)
const v = (channel, ...args) => page.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
const define = () => page.evaluate(() => document.querySelector('[data-define]')?.getAttribute('data-define') ?? null)
const said = () => page.evaluate(() => document.querySelector('[data-define]')?.textContent ?? '')
const source = () => page.evaluate(() => document.querySelector('[data-define]')?.getAttribute('data-source') ?? null)
const text = () => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', EDITOR)
const shown = () => qa.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=prompt') || (!w.webContents.getURL().includes('view=') && w.isVisible())))
const setMeanings = (mode) => v('settings:set', { wordMeanings: mode })
async function fresh() {
  await page.evaluate(() => window.api.showPrompt())
  await wait(200)
  await page.keyboard.press('Meta+n')
  await wait(300)
  await qa.reset()
  await page.evaluate(() => delete document.documentElement.dataset.motion)
}
const type = async (words) => (await page.keyboard.type(words, { delay: 20 }), wait(200))
const until = async (test, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await test()) return true; await wait(100) } return false }
const expect = (truth, words) => { if (!truth) throw new Error(words) }
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
async function check(name, run) {
  if (only.length && !only.some((one) => name.includes(one))) return
  try {
    await setMeanings('one-word')
    await fresh()
    await run()
    results.push(`ok   ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}
/** Every frame: whether a meaning (or its wait) is drawn, where, and the first line of the writing. */
const watch = () => page.evaluate((s) => {
  window.__frames = []
  const t0 = performance.now()
  window.__t0 = t0
  const look = () => {
    const d = document.querySelector('[data-define]')
    const p = document.querySelector(`${s} > *`)?.getBoundingClientRect()
    const r = d && getComputedStyle(d).visibility !== 'hidden' ? d.getBoundingClientRect() : null
    window.__frames.push({ t: Math.round(performance.now() - t0), state: d?.getAttribute('data-define') ?? null, seen: !!r, top: r ? Math.round(r.top) : null, left: r ? Math.round(r.left + parseFloat(d.style.paddingLeft || '0')) : null, word: p ? [Math.round(p.top), Math.round(p.left)] : null })
    if (performance.now() - t0 < 5000 && !window.__stop) requestAnimationFrame(look)
  }
  window.__stop = false
  look()
}, EDITOR)
const frames = () => page.evaluate(() => (window.__stop = true, window.__frames))

// --- the Mac's own Dictionary -------------------------------------------------------
for (const [word, holds] of [['serendipity', 'chance'], ['ephemera', 'short time'], ['running', 'runner'], ['cats', 'mammal'], ['London', 'capital'], ['Shakespeare', 'playwright'], ['saudade', 'longing'], ['über', 'outstanding']]) {
  await check(`mac: "${word}" answered from the Mac's Dictionary`, async () => {
    await type(word)
    expect(await until(async () => (await define()) === 'ghost'), `no meaning: ${await define()}`)
    expect((await source()) === 'mac', `came from ${await source()}`)
    expect((await said()).toLowerCase().includes(holds), `it says: ${(await said()).slice(0, 160)}`)
  })
}
await check('mac: quick, with no wait shown, no beam, and the writing never moves', async () => {
  await watch()
  await type('lugubrious')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await wait(400)
  const all = await frames()
  const waits = all.filter((one) => one.state === 'looking' && one.seen).length
  expect(waits === 0, `the wait showed for ${waits} frames on a quick answer`)
  const words = [...new Set(all.filter((one) => one.word && one.state).map((one) => one.word.join(',')))]
  expect(words.length === 1, `the writing moved: ${words}`)
  const places = [...new Set(all.filter((one) => one.seen).map((one) => `${one.top},${one.left}`))]
  expect(places.length === 1, `the meaning moved: ${places}`)
  const beam = await page.evaluate(() => document.querySelector('.mf-beam')?.getAttribute('data-beam') ?? null)
  expect(beam !== 'working', 'the beam turned for a word')
})
await check('mac: a slip of the key offers its fix, in one click', async () => {
  await type('recieve')
  expect(await until(async () => (await define()) === 'fix'), `no fix: ${await define()}`)
  expect((await said()).includes('receive'), `it offers: ${await said()}`)
  await page.click('[data-define="fix"] button')
  await wait()
  expect((await text()) === 'receive', `the words are now: ${await text()}`)
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning after the fix')
})
await check('two words, a sentence or a timer are never looked up', async () => {
  const before = hits.length
  await type('two words')
  await wait(1200)
  expect(!(await define()), `said: ${await define()}`)
  await qa.reset()
  await type('5m tea')
  await wait(1200)
  expect(!(await define()) && hits.length === before, `looked up: ${await define()} ${hits.slice(before)}`)
})
await check('not in any dictionary: nothing said for a guessed Word, said plainly for a picked one', async () => {
  await type('qwzxv')
  await wait(2000)
  expect(!(await define()), `said for a guess: ${await define()}`)
  await page.keyboard.press('Meta+4')
  expect(await until(async () => (await define()) === 'none'), `nothing said once Word was picked: ${await define()}`)
  expect((await said()).includes('Not in the dictionary'), `it says: ${await said()}`)
})

// --- the web, behind it --------------------------------------------------------------
await check('web: a slow answer shows two faint lines in place, after a moment, then the meaning there', async () => {
  await watch()
  await page.keyboard.type('glimmerwick', { delay: 20 })
  // The last key: the pause (450ms) and the quiet first moment (300ms) both come after it.
  const typed = await page.evaluate(() => performance.now() - window.__t0)
  expect(await until(async () => (await define()) === 'ghost', 5000), `no meaning: ${await define()}`)
  await wait(300)
  const all = await frames()
  const seen = all.find((one) => one.state === 'looking' && one.seen)
  expect(seen, 'no wait shown on a slow answer')
  expect(seen.t - typed >= 700, `the wait showed ${Math.round(seen.t - typed)}ms after the last key`)
  const meaning = all.find((one) => one.state === 'ghost' && one.seen)
  expect(Math.abs(meaning.top - seen.top) <= 2 && Math.abs(meaning.left - seen.left) <= 2, `the wait (${seen.top},${seen.left}) is not where the meaning came (${meaning.top},${meaning.left})`)
  const off = all.filter((one) => one.seen && (one.top < 0 || one.top > 2000 || one.left < 0))
  expect(!off.length, `drawn off the page: ${JSON.stringify(off[0])}`)
  expect((await source()) === 'web' && (await said()).includes('Free Dictionary'), `source: ${await source()}`)
  expect(!(await said()).includes('Looking up'), 'still says Looking up')
})
await check('web: a word that grows into a sentence first: its late meaning never lands', async () => {
  await type('slowword')
  await wait(700)
  await type(' is not a word I know')
  await wait(3200)
  expect(!(await define()), `a stale meaning landed: ${await define()}`)
})
await check('web: Create while it is asked keeps the word alone, and says nothing later', async () => {
  await type('slowword')
  await wait(800)
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(3200)
  const saved = ((await page.evaluate(() => window.api.captures.list())) ?? []).find((one) => (one.label ?? '').includes('slowword'))
  expect(saved, 'not saved')
  const fields = await v('notes:fields', 'captures', saved.id)
  expect(!fields.definition, `saved with a meaning not taken: ${JSON.stringify(fields)}`)
  expect(!(await define()), `the meaning landed in the next capture: ${await define()}`)
})
await check('offline: the Mac still answers', async () => {
  await qa.electron.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }))
  try {
    await type('halcyon')
    expect(await until(async () => (await define()) === 'ghost'), `no meaning offline: ${await define()}`)
    expect((await source()) === 'mac', `came from ${await source()}`)
  } finally {
    await qa.electron.evaluate(({ session }) => session.defaultSession.disableNetworkEmulation())
  }
})

// --- what Create keeps ---------------------------------------------------------------
await check('keep: Tab saves it with the word, Tab again leaves it out, and it says which', async () => {
  await type('mellifluous')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  expect((await said()).includes('Tab to save it with the word'), `it says: ${await said()}`)
  await page.keyboard.press('Tab')
  await wait()
  expect((await define()) === 'kept' && (await said()).includes('Saved with the word'), `after Tab: ${await define()} ${await said()}`)
  await page.keyboard.press('Tab')
  await wait()
  expect((await define()) === 'ghost', `Tab again did not leave it out: ${await define()}`)
  expect((await text()) === 'mellifluous', `Tab changed the words: ${await text()}`)
  await page.keyboard.press('Tab')
  await wait()
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(1500)
  const saved = ((await page.evaluate(() => window.api.captures.list())) ?? []).find((one) => (one.label ?? '').includes('mellifluous'))
  const fields = await v('notes:fields', 'captures', saved.id)
  expect(saved.kind === 'word' && /sweet|musical|pleasant/i.test(fields.definition ?? ''), `saved: ${saved.kind} ${JSON.stringify(fields)}`)
})
await check('undo: ⌘Z takes the word back and its meaning goes with it', async () => {
  await type('halcyon')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await page.keyboard.press('Meta+z')
  await wait(800)
  expect(!(await text()).includes('halcyon') && !(await define()), `after ⌘Z: "${await text()}" ${await define()}`)
})
await check('kind: picking Note puts it away, picking Word brings it back', async () => {
  await type('halcyon')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await page.keyboard.press('Meta+1')
  await wait(700)
  expect(!(await define()), `still shown as a Note: ${await define()}`)
  await page.keyboard.press('Meta+4')
  expect(await until(async () => (await define()) === 'ghost'), 'not back as a Word')
})

// --- people who don't want it ------------------------------------------------------
await check('Esc hides it for this word and keeps the box up; the next Esc puts the box away', async () => {
  await type('halcyon')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await page.keyboard.press('Escape')
  await wait(500)
  expect(!(await define()), `still shown: ${await define()}`)
  expect(await page.evaluate(() => document.visibilityState === 'visible' && document.hasFocus()), 'the box went away on the first Esc')
  await type('s')
  await page.keyboard.press('Backspace')
  await wait(1200)
  expect(!(await define()), 'came back for the same word')
})
await check('right-click: the menu offers what a person looks for, and “Stop looking words up” turns it off with Undo', async () => {
  await type('halcyon')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await page.click('[data-define] [data-meaning] > button', { button: 'right' })
  await wait(400)
  const lines = await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map((one) => one.textContent.trim()))
  for (const want of ['Save the meaning', 'Copy the meaning', 'Open in Dictionary', 'Hide for this word', 'Stop looking words up']) expect(lines.some((one) => one.startsWith(want)), `no “${want}” in ${JSON.stringify(lines)}`)
  await page.click('[role=menuitem]:has-text("Stop looking words up")')
  await wait(600)
  expect((await v('settings'))?.wordMeanings === 'off', `setting: ${(await v('settings'))?.wordMeanings}`)
  expect(!(await define()), 'still shown once off')
  const toast = await page.evaluate(() => document.querySelector('[role=status][aria-live]')?.textContent ?? '')
  expect(toast.includes('“Word meanings”') && toast.includes('Undo'), `the toast says: ${toast}`)
  await page.click('[role=status] button:has-text("Undo")')
  await wait(400)
  expect((await v('settings'))?.wordMeanings === 'one-word', 'Undo did not bring it back')
})
await check('“Stop showing these” on the meaning itself turns meanings off, with Undo and Settings named', async () => {
  await type('halcyon')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning')
  await page.click('[data-define] [data-define-stop]')
  await wait(600)
  expect((await v('settings'))?.wordMeanings === 'off', `setting: ${(await v('settings'))?.wordMeanings}`)
  const toast = await page.evaluate(() => document.querySelector('[role=status][aria-live]')?.textContent ?? '')
  expect(toast.includes('Settings') && toast.includes('Undo'), `the toast says: ${toast}`)
  await page.click('[role=status] button:has-text("Undo")')
  await wait(400)
  expect((await v('settings'))?.wordMeanings === 'one-word', 'Undo did not bring it back')
})
await check('setting: “Never” asks nothing; “Only when you pick Word” waits for Word', async () => {
  await setMeanings('off')
  await wait(300)
  await type('halcyon')
  await wait(1200)
  expect(!(await define()), `asked with it off: ${await define()}`)
  await setMeanings('word-kind')
  await fresh()
  await setMeanings('word-kind')
  await wait(300)
  await type('halcyon')
  await wait(1200)
  expect(!(await define()), `asked for a guessed Word: ${await define()}`)
  await page.keyboard.press('Meta+4')
  expect(await until(async () => (await define()) === 'ghost'), 'nothing once Word was picked')
})
await check('motion off: the wait is still, and the meaning simply appears', async () => {
  await page.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await type('driftwordle')
  expect(await until(async () => (await define()) === 'looking' && (await page.evaluate(() => getComputedStyle(document.querySelector('[data-define]')).visibility)) === 'visible', 3000), 'no wait shown')
  const moving = await page.evaluate(() => getComputedStyle(document.querySelector('.mf-define-wait > span')).animationName)
  expect(moving === 'none', `the wait moves with Motion off: ${moving}`)
})

/** The main window, on Settings › Writing, with “Word meanings” in view. */
const settingsPage = async () => {
  const home = qa.electron.windows().find((w) => w.url().includes('view=home'))
  if (!home) return null
  await qa.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'view', 'settings'))
  await home.waitForTimeout(1200)
  await home.click('[data-section="Writing"]')
  await home.waitForTimeout(600)
  const row = home.locator('[data-setting-title="Word meanings"]')
  await row.scrollIntoViewIfNeeded()
  return { home, row }
}
await check('settings: “Word meanings” shows each choice in small, and picking one keeps it', async () => {
  const found = await settingsPage()
  expect(found, 'no main window')
  const tiles = await found.row.locator('[data-choice]').evaluateAll((all) => all.map((one) => one.getAttribute('data-choice') + ':' + one.getAttribute('aria-checked')))
  expect(tiles.join() === 'one-word:true,word-kind:false,off:false', `tiles: ${tiles}`)
  await found.row.locator('[data-choice="word-kind"]').click()
  await wait(400)
  expect((await v('settings'))?.wordMeanings === 'word-kind', 'not kept')
})

const settingsGet = await v('settings').catch(() => null)
if (!settingsGet) results.push('note settings:get unavailable')

// --- pictures ----------------------------------------------------------------------
if (process.env.SHOTS) {
  mkdirSync(process.env.SHOTS, { recursive: true })
  await setMeanings('one-word')
  for (const theme of ['light', 'github']) {
    const name = theme === 'light' ? 'light' : 'dark'
    await page.evaluate((one) => localStorage.setItem('theme', one), theme)
    await page.reload()
    await page.waitForSelector(EDITOR)
    // Solid and at full strength, as on screen: a window parked off screen counts as left.
    await setMeanings('one-word')
    await v('settings:set', { boxDim: false })
    await page.evaluate(() => (document.documentElement.dataset.solid = ''))
    // The theme glides in: pictures once it has.
    await wait(3000)
    await fresh()
    await type('serendipity')
    await until(async () => (await define()) === 'ghost')
    await wait(900)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await wait(250)
    await page.screenshot({ path: `${process.env.SHOTS}/after-meaning-${name}.png` })
    await page.keyboard.press('Tab')
    await wait(500)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await wait(250)
    await page.screenshot({ path: `${process.env.SHOTS}/after-kept-${name}.png` })
    await fresh()
    await type(name === 'light' ? 'lanternmoss' : 'emberquill')
    await until(async () => (await define()) === 'looking' && (await page.evaluate(() => getComputedStyle(document.querySelector('[data-define]')).visibility)) === 'visible', 3000)
    await wait(250)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await wait(250)
    await page.screenshot({ path: `${process.env.SHOTS}/after-waiting-${name}.png` })
    await fresh()
    await type('recieve')
    await until(async () => (await define()) === 'fix')
    await wait(500)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await wait(250)
    await page.screenshot({ path: `${process.env.SHOTS}/after-fix-${name}.png` })
    await fresh()
    await type('halcyon')
    await until(async () => (await define()) === 'ghost')
    await wait(600)
    await page.click('[data-define] [data-meaning] > button', { button: 'right' })
    await wait(500)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await wait(250)
    await page.screenshot({ path: `${process.env.SHOTS}/after-menu-${name}.png` })
    await page.keyboard.press('Escape')
    await wait(300)
    const found = await settingsPage()
    if (found) await found.row.screenshot({ path: `${process.env.SHOTS}/after-setting-${name}.png` })
  }
}

console.log(results.join('\n'))
const passed = results.filter((one) => one.startsWith('ok')).length
console.log(`\n${passed}/${results.filter((one) => !one.startsWith('note')).length} passed${errors.length ? `\n${errors.join('\n')}` : ''}`)
await qa.close?.()
try { qa.electron.process().kill('SIGKILL') } catch {}
process.exit(passed === results.filter((one) => !one.startsWith('note')).length && !errors.length ? 0 : 1)
