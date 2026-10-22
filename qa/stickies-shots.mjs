// Pictures of the stickies, for looking at: the five paper colours, a to-do
// list, Today, and one asking "Take down?", as paper and as glass, in a light
// and a dark theme and in Brutal. Each sticky's own page is captured and laid
// on a desk-like backdrop (the windows themselves stay parked off screen).
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-stickies/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_VIRTUAL=1 node qa/stickies-shots.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const SHOTS = process.env.QA_SHOTS ?? 'scratchpad/round/stickies'
mkdirSync(SHOTS, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
try {
  await electron.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate
    Menu.buildFromTemplate = (template) => { globalThis.qaMenu = template; const menu = build(template); menu.popup = () => {}; return menu }
  })
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  const stickyWins = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => ({ id: w.id, url: w.webContents.getURL() })))
  await wait(2500)
  for (let i = 0; i < 20 && (await stickyWins()).length; i++) {
    for (const one of await stickyWins()) { const u = new URL(one.url); await h.evaluate(([t, id]) => window.api.stick(t, id, false), [u.searchParams.get('type'), u.searchParams.get('id')]) }
    await wait(600)
  }
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const todo = (...items) => ({ type: 'taskList', content: items.map(([text, checked]) => ({ type: 'taskItem', attrs: { checked }, content: [para(text)] })) })
  const notes = [
    ['Plain', [para('Plain'), para('The theme’s own paper, warmed a little.')]],
    ['Butter', [para('Butter'), todo(['Call the plumber', true], ['Book the dentist', false], ['Return the library books', false])]],
    ['Rose', [para('Rose'), para('“The best way out is always through.”')]],
    ['Sage', [para('Sage'), para('Water the potatoes on Thursday, then the beans.')]],
    ['Sky', [para('Sky'), para('Ideas for the trip: the coast road, the old lighthouse.')]]
  ]
  const ids = []
  for (const [title, content] of notes) ids.push(await h.evaluate(([title, body]) => window.api.captures.create({ title, body }), [title, { type: 'doc', content }]))
  for (const id of ids) await h.evaluate((id) => window.api.stick('capture', id, true), id)
  await h.evaluate(() => window.api.stick('today', 'today', true))
  await wait(3000)
  const tint = async (id, label) => {
    const win = (await stickyWins()).find((w) => w.url.includes(`id=${id}&`))
    await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).webContents.emit('context-menu', {}, { isEditable: false, selectionText: '', editFlags: {} }), win.id)
    await electron.evaluate((_, label) => globalThis.qaMenu.find((one) => one.label === label)?.click(), label)
  }

  /** Every sticky's page, captured and laid out in a row on a desk-like backdrop. */
  const shot = async (name) => {
    await wait(1200)
    const png = await electron.evaluate(async ({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible() && w.webContents.getURL().includes('view=sticky'))
      const cards = await Promise.all(wins.map(async (w) => ({ b: w.getBounds(), src: (await w.webContents.capturePage()).toDataURL() })))
      const html = `<body style="margin:0;padding:24px;display:flex;flex-wrap:wrap;gap:12px;width:1000px;background:linear-gradient(135deg,#5b6b7d,#8a7f73 60%,#3f4a3c)">
        ${cards.map(({ b, src }) => `<img src="${src}" style="width:${b.width}px;height:${b.height}px">`).join('')}</body>`
      const view = new BrowserWindow({ show: false, paintWhenInitiallyHidden: true, width: 1048, height: 900, useContentSize: true })
      try {
        await view.loadURL('about:blank')
        await view.webContents.executeJavaScript(`document.documentElement.innerHTML = ${JSON.stringify(html)}; new Promise((r) => setTimeout(r, 400))`)
        return (await view.webContents.capturePage()).toPNG().toString('base64')
      } finally { view.destroy() }
    })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'))
    console.log('shot', name)
  }
  const look = async (theme, style) => {
    await h.evaluate(([theme, style]) => { localStorage.setItem('theme', theme); localStorage.setItem('style', style) }, [theme, style])
    for (const p of electron.windows().filter((p) => p.url().includes('view=sticky'))) await p.reload().catch(() => {})
    await wait(1500)
  }
  for (const glass of [false, true]) {
    await v('settings:set', { stickiesGlass: glass })
    await wait(2500)
    for (const [i, label] of ['Plain', 'Butter', 'Rose', 'Sage', 'Sky'].entries()) await tint(ids[i], label)
    for (const [theme, style] of [['paper', 'soft'], ['github', 'soft'], ['paper', 'brutal']]) {
      await look(theme, style)
      // One asking "Take down?", as on hover.
      const ask = electron.windows().find((p) => p.url().includes(`id=${ids[2]}&`))
      await ask?.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true })))
      await shot(`look-${glass ? 'glass' : 'paper'}-${theme}-${style}`)
      await ask?.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    }
  }
  await look('paper', 'soft')
} catch (error) {
  console.log('FAIL', error?.stack ?? error)
} finally {
  await c.close()
}
