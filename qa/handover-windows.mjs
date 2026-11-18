// The handover's window asks walked as a person does (asks 3, 6, 7, 16, 20, 21): a small note window opens with the
// keys, never smaller than about 500 by 280, opaque and as tall as its card, whole after its corner is moved, thrown
// by ⌘ and two fingers; quick capture's search takes a click on its box's row and backs out with Esc from anywhere.
//   QA_DATA=<copy of sandbox-seed.noindex/c-tip> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/handover-windows.mjs
// Merges the 17 Nov handover's handover-swipe.mjs and the small-window lines of handover-left.mjs and handover-editor.mjs.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron } = c
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

  // Ask 20: never smaller than about 500 by 280.
  await resize(300, 150)
  await wait(500)
  const least = await bounds()
  check('20: made as small as it goes, it stays about 500 by 280', least.width >= 500 && least.height >= 280, JSON.stringify(least))

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
