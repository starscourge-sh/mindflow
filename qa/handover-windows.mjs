// The handover's window asks walked as a person does (asks 3, 6, 7, 16, 20, 21): a small note window opens with the
// keys, never smaller than about 500 by 280, opaque and as tall as its card, a page in it as small as its words with
// its thought bar under them and its property picker clear of the bar, whole after its corner is moved, thrown by ⌘
// and two fingers, following AeroSpace's workspaces; quick capture's search takes a click on its box's row and backs
// out with Esc from anywhere.
//   QA_DATA=<copy of sandbox-seed.noindex/c-tip> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/handover-windows.mjs
// Merges the 17 Nov handover's handover-swipe.mjs and the small-window lines of handover-left.mjs and handover-editor.mjs.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Each window keeps the place the app gives it while really parked off screen, so a throw can be read (index.ts).
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
// Following AeroSpace's workspaces, through a stand-in whose calls the probe writes down (a test run never calls the real one).
process.env.HALIGTREE_QA_FOLLOW ??= '1'
process.env.HALIGTREE_AEROSPACE ??= '/qa/stand-in/aerospace'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron } = c
// The stand-in: AeroSpace's answers (you are on workspace 2), and its calls written down instead of run.
await electron.evaluate(() => {
  globalThis.qaAero = []
  const cp = process.getBuiltinModule('child_process')
  const exec = cp.execFile
  cp.execFile = function (file, args, ...rest) {
    if (!String(file).endsWith('/aerospace')) return exec.call(this, file, args, ...rest)
    globalThis.qaAero.push(args.join(' '))
    const out = args[0] === 'list-workspaces' ? '2\n' : args[0] === 'list-windows' ? (globalThis.qaRows ?? '') : ''
    setTimeout(() => rest.find((one) => typeof one === 'function')?.(null, out, ''), 5)
    return { kill() {} }
  }
})
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const bounds = () => electron.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('small='))
  if (!win) return null
  const b = win.getBounds()
  return { ...b, focused: win.isFocused(), spaces: win.isVisibleOnAllWorkspaces() }
})
const resize = (w, hh) => electron.evaluate(({ BrowserWindow }, [w, hh]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('small='))
  const b = win.getBounds()
  win.emit('will-resize', {}, { ...b, width: w, height: hh })
  win.setBounds({ ...b, width: w, height: hh })
}, [w, hh])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Corner', body: { type: 'doc', content: [p('still here after a corner drag'), p('a second line'), p('')] } })
  await v('small:open', `article:${id}`)
  let mini = null
  for (let i = 0; i < 60 && !mini; i++) (mini = electron.windows().find((w) => decodeURIComponent(w.url()).includes(`small=article:${id}`)) ?? null, mini || (await wait(200)))
  check('a small note window opened', !!mini)
  await mini.waitForSelector('.tiptap', { timeout: 15000 })
  await wait(900)

  // Ask 6: it takes the keys as it opens. Not read here: a test run's windows never take the Mac's keys from the person
  // at it (HALIGTREE_QA_AWAY), so isFocused() says no either way.

  // Asks 3 and 16: opaque paper, as tall as its card: no room under the thought bar.
  const card = await mini.evaluate(() => {
    const container = document.querySelector('.app-container')?.getBoundingClientRect()
    const bg = getComputedStyle(document.documentElement).backgroundColor
    return { card: Math.round(container?.height ?? 0), window: window.innerHeight, bg }
  })
  check('3, 16: the window is as tall as its card, on opaque paper', Math.abs(card.card - card.window) <= 2 && !/rgba\(0, 0, 0, 0\)|transparent/.test(card.bg), JSON.stringify(card))
  if (shots) for (const look of ['light', 'dark']) {
    await mini.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, look)
    await wait(500)
    await mini.screenshot({ path: `${shots}/03-small-${look}.png` })
  }
  // Ask 3: as small as its words, as Raycast Notes keeps a note: the page's own row of controls straight under the
  // window's (no "Back to your note": nothing is behind it), its thought bar straight under the last line, nothing
  // under the bar (shot 03-a: a tall top, the bar half way down, room under it).
  const fit = await mini.evaluate(() => {
    const box = (el) => el?.getBoundingClientRect()
    const last = box([...document.querySelectorAll('.ProseMirror > *')].filter((el) => getComputedStyle(el).position !== 'absolute').at(-1))
    const dock = box(document.querySelector('[data-thought-dock]'))
    const head = box(document.querySelector('[data-reading-pane] [data-note-head]'))
    const back = [...document.querySelectorAll('button')].some((one) => /Back to your note/.test(one.textContent ?? ''))
    return { inner: window.innerHeight, last: Math.round(last?.bottom ?? 0), dockTop: Math.round(dock?.top ?? 0), dockFoot: Math.round(dock?.bottom ?? 0), head: Math.round(head?.top ?? 0), back }
  })
  check('3: a three-line page: its thought bar straight under the last line, nothing under the bar', fit.dockTop > fit.last && fit.dockTop - fit.last <= 32 && fit.inner - fit.dockFoot <= 2, JSON.stringify(fit))
  check('3: its own row of controls straight under the window\'s, and no "Back to your note"', !fit.back && fit.head > 0 && fit.head <= 64, JSON.stringify(fit))
  // Ask 3 (shot 03-c): the property picker hangs clear of the thought bar, under its field or over it, wherever it has
  // room, in a window made short by hand as the user's was.
  await resize(560, 380)
  await wait(700)
  await mini.click('[data-add-property]')
  await mini.waitForSelector('[data-name-options] [role=option]', { timeout: 8000 }).catch(() => {})
  await wait(900)
  const picker = await mini.evaluate(() => {
    const list = document.querySelector('[data-name-options]')?.getBoundingClientRect()
    const bar = document.querySelector('[data-composer]')?.getBoundingClientRect()
    return list && bar ? { top: Math.round(list.top), foot: Math.round(list.bottom), bar: Math.round(bar.top), inner: window.innerHeight, rows: document.querySelectorAll('[data-name-options] [role=option]').length } : null
  })
  check('3: the property picker never runs under the thought bar or past the window', !!picker && picker.rows > 0 && picker.foot <= picker.bar && picker.top >= 40, JSON.stringify(picker))
  if (shots) await mini.screenshot({ path: `${shots}/03-small-picker.png` })
  await mini.keyboard.press('Escape')
  await wait(1200)

  // Ask 20: never smaller than about 500 by 280: the window's own least size (a parked test window keeps whatever place
  // it is asked for as its own, so the Mac's hold on its size is read from the window).
  const least = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('small='))?.getMinimumSize())
  check('20: made as small as it goes, it stays about 500 by 280', !!least && least[0] >= 500 && least[1] >= 280, JSON.stringify(least))

  // Ask 21: its corner moved out in steps, the page is still drawn, its words there.
  for (const [w, hh] of [[560, 340], [640, 420], [760, 560]]) (await resize(w, hh), await wait(120))
  await wait(600)
  const grown = await mini.evaluate(() => ({ words: document.querySelector('.tiptap')?.innerText ?? '', tall: Math.round(document.querySelector('.tiptap')?.getBoundingClientRect().height ?? 0), card: Math.round(document.querySelector('.app-container')?.getBoundingClientRect().height ?? 0), window: window.innerHeight }))
  check('21: its corner moved out, the note is still on the page, filling the window', grown.words.includes('still here') && grown.tall > 20 && Math.abs(grown.card - grown.window) <= 2, JSON.stringify(grown))
  if (shots) await mini.screenshot({ path: `${shots}/21-small-grown.png` })

  // Ask 6: ⌘ and two fingers throw it, as they throw quick capture.
  // Both ways: a test run's window is parked at the screen's edge, where a throw that way goes nowhere, and which way
  // the fingers went is read the way the Mac scrolls.
  const before = await bounds()
  const places = []
  for (const dx of [900, -900]) {
    await mini.evaluate((dx) => window.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: 8, metaKey: true, bubbles: true, cancelable: true })), dx)
    await wait(1100)
    places.push(await bounds())
  }
  check('6: ⌘ and two fingers throw the small window', places.some((one) => Math.abs(one.x - before.x) + Math.abs(one.y - before.y) > 40), JSON.stringify({ before, places }))

  // Ask 3 (shots 03-c, 03-d): it follows you through AeroSpace's workspaces, as the stickies do (qa/sticky-follow.mjs):
  // hidden by AeroSpace in the screen's corner on the workspace you left (moved with no hand on it), it is moved to the
  // one in view, and the place you left it is kept. AeroSpace's calls are played by the stand-in, never the Mac's.
  await wait(1200)
  const own = await electron.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('small='))
    return { id: win.id, media: win.getMediaSourceId().split(':')[1], pid: process.pid, screen: screen.getDisplayMatching(win.getBounds()).bounds }
  })
  const kept = () => electron.evaluate(({ app }) => JSON.parse(process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getPath('userData'), 'small-windows.json'), 'utf8'))[0]?.bounds)
  const left = await kept()
  await electron.evaluate((_, rows) => void ((globalThis.qaRows = rows), (globalThis.qaAero = [])), `${own.media}|${own.pid}|1\n999|${own.pid}|1\n`)
  await electron.evaluate(({ BrowserWindow }, [id, x, y]) => { const win = BrowserWindow.fromId(id); win.setPosition(x, y); win.emit('moved') }, [own.id, own.screen.x + own.screen.width - 1, own.screen.y + own.screen.height - 1])
  await wait(1500)
  const asked = await electron.evaluate(() => globalThis.qaAero)
  check('3: hidden by AeroSpace on the workspace you left, the small window is moved to the one in view, it alone', asked.includes(`move-node-to-workspace --window-id ${own.media} 2`) && !asked.some((one) => one.includes('--window-id 999')), asked.join(' | '))
  const after = await kept()
  check('3: and the place you left it is kept, not the corner it was hidden in', JSON.stringify(after) === JSON.stringify(left), JSON.stringify({ after, left }))

  // Ask 7: the search (⌘K, the main window's, shown over another app): its box's row is no window drag, and Esc backs out
  // with the keys anywhere.
  await h.bringToFront()
  await h.keyboard.press('Meta+k')
  await h.waitForSelector('[aria-label="Search"][role="dialog"] input', { timeout: 8000 }).catch(() => {})
  await wait(500)
  const row = await h.evaluate(() => {
    const label = document.querySelector('[aria-label="Search"][role="dialog"] label')
    if (!label) return null
    const style = getComputedStyle(label)
    return { region: style.getPropertyValue('-webkit-app-region') || style.webkitAppRegion, carry: style.getPropertyValue('--mf-drag').trim() }
  })
  check('7: the search box\'s row is never the window\'s drag', !!row && row.region === 'no-drag' && row.carry === '0', JSON.stringify(row))
  // As over another app: the press on the row was the window's drag, so the box never had the keys.
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  const open = await h.evaluate(() => !!document.querySelector('[aria-label="Search"][role="dialog"]'))
  await h.keyboard.press('Escape')
  await wait(700)
  const shut = await h.evaluate(() => !document.querySelector('[aria-label="Search"][role="dialog"]'))
  check('7: Esc with the keys outside the box closes the search', open && shut, JSON.stringify({ open, shut }))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await c.close()
}
done()
