// The two passes and the tag reading page, driven in the real app.
import { start, done } from './shots-lib.mjs'
const T = process.env.THEME ?? 'dark'
const c = await start()
const { page, electron } = c
const log = (...a) => console.log(...a)
const step = async (name, fn) => { try { await fn() } catch (e) { log('STEP FAIL', name, e.message.slice(0, 300)) } }
await c.v('settings:set', { safeMode: false, motion: true, quietStart: '03:00', quietEnd: '03:01', weeklyDay: new Date().getDay(), dailyTidy: true, hintRate: 0 })
await c.theme(T)
await page.evaluate(() => { window.__toasts = []; window.addEventListener('vigil:toast', (e) => window.__toasts.push(e.detail.text + (e.detail.undo ? ' [undo]' : ''))) })
const toasts = () => page.evaluate(() => window.__toasts.splice(0))
const shown = () => electron.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.getURL().includes('home')) w.webContents.send('window:shown') })
const doc = (...blocks) => ({ type: 'doc', content: blocks })
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const ul = (...items) => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) })

let ids = []
await step('seed', async () => {
  ids.push(await page.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(p('Perfectionism is procrastination in a nicer coat #writing'), ul('ship the ugly draft', 'edit later'), p('Remember the essay on drafts'))))
  ids.push(await page.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(p('Groceries for the weekend'), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p('oat milk')] }, { type: 'taskItem', attrs: { checked: false }, content: [p('bread')] }] })))
  ids.push(await page.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(p('A thought about tags and capture #writing #pkm #productivity #content #perfectionism'))))
  log('tidy list', (await c.v('pass:tidy')).length, 'decide list', (await c.v('pass:decide')).length, 'waiting', JSON.stringify(await c.v('pass:waiting')))
  log('nudge', JSON.stringify(await c.v('nudge')))
})

await step('box panel', async () => {
  await electron.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.getURL().includes('home')) w.setBounds({ width: 1100, height: 760 }) })
  await page.waitForTimeout(400)
  await page.mouse.click(5, 5); await page.keyboard.press('Meta+\\'); await page.waitForTimeout(700)
  await page.keyboard.press('Control+1'); await page.waitForTimeout(500)
  await shown(); await page.waitForTimeout(1500)
  await c.shot(page, `tp-${T}-box-panel`)
  const card = page.locator('[data-card]').first()
  if (await card.count()) {
    await card.focus({ focusVisible: true }); await page.waitForTimeout(300)
    await c.shot(page, `tp-${T}-rot-focus`)
    await page.keyboard.press('t'); await page.waitForTimeout(300); await page.keyboard.type('wri'); await page.waitForTimeout(300)
    await c.shot(page, `tp-${T}-rot-tagging`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    const id = await card.getAttribute('data-id')
    await page.locator(`[data-card][data-id="${id}"]`).focus(); await page.keyboard.press('c'); await page.waitForTimeout(600)
    log('rot set aside', JSON.stringify(await c.v('pass:state', id)), await toasts())
  }
})

await step('tidy', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'tidy' } })))
  await page.waitForTimeout(1500)
  await c.shot(page, `tp-${T}-tidy-1`)
  // Walk to our first seeded one.
  for (let i = 0; i < 30; i++) {
    const text = await page.locator('[data-pass] .ProseMirror').first().innerText().catch(() => '')
    if (text.includes('Perfectionism')) break
    await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  }
  const before = JSON.stringify((await page.evaluate((id) => window.api.captures.get(id), ids[0])).body)
  await page.keyboard.type('zq'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(100)
  await page.keyboard.press('Shift+Enter'); await page.waitForTimeout(700)
  await page.keyboard.press('b'); await page.waitForTimeout(700)
  const afterBold = JSON.stringify((await page.evaluate((id) => window.api.captures.get(id), ids[0])).body)
  log('typing blocked', !afterBold.includes('zq'), 'bold saved', afterBold.includes('"bold"'), 'unchanged before bold', before === afterBold)
  await page.keyboard.press('t'); await page.waitForTimeout(300); await page.keyboard.type('pk'); await page.waitForTimeout(400)
  await c.shot(page, `tp-${T}-tidy-tagging`)
  await page.keyboard.press('Enter'); await page.waitForTimeout(800)
  await page.keyboard.type('fresh'); await page.keyboard.press(' '); await page.waitForTimeout(800)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('f'); await page.waitForTimeout(600)
  await page.keyboard.press('c'); await page.waitForTimeout(600)
  await c.shot(page, `tp-${T}-tidy-marked`)
  const now = await page.evaluate((id) => window.api.captures.get(id), ids[0])
  log('tags now', JSON.stringify(now.body).match(/#[a-z][\w-]*/g), 'details', JSON.stringify(now.body).includes('details'))
  log('toasts', await toasts())
  await page.keyboard.press('Enter'); await page.waitForTimeout(800)
  log('state after j', JSON.stringify(await c.v('pass:state', ids[0])))
  // Groceries: cross off.
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('x'); await page.waitForTimeout(800)
  log('ticked', JSON.stringify((await page.evaluate((id) => window.api.captures.get(id), ids[1])).body).includes('"checked":true'))
  await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  await c.shot(page, `tp-${T}-tidy-3`)
  for (let i = 0; i < 40; i++) { if (await page.getByText('All tidy').count()) break; await page.keyboard.press('Enter'); await page.waitForTimeout(250) }
  await page.waitForTimeout(1500)
  await c.shot(page, `tp-${T}-tidy-end`)
  log('scan tidy', JSON.stringify((await c.scan(page)).slice(0, 6)))
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
})

await step('decide', async () => {
  log('decide list', (await c.v('pass:decide')).map((x) => x.why).join(','))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'decide' } })))
  await page.waitForTimeout(1500)
  await c.shot(page, `tp-${T}-decide-1`)
  const first = (await c.v('pass:decide'))[0]
  await page.keyboard.press('o'); await page.waitForTimeout(800)
  log('kept open', JSON.stringify(await c.v('pass:state', first.id)), await toasts())
  await page.keyboard.press('r'); await page.waitForTimeout(900)
  log('resolve toasts', await toasts())
  await c.shot(page, `tp-${T}-decide-2`)
  log('scan decide', JSON.stringify((await c.scan(page)).slice(0, 6)))
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
})

await step('home', async () => {
  const home = await c.showHome(1100, 760)
  await c.send('view', 'inbox'); await page.waitForTimeout(1200)
  await c.shot(home, `tp-${T}-home-inbox`)
  await c.send('view', 'tags'); await home.waitForTimeout(1000)
  const tags = await c.v('tags')
  log('top tags', tags.slice(0, 5).map((t) => `${t.tag}:${t.count}`).join(' '))
  const big = tags[0]
  await home.locator('[data-row]', { hasText: big.tag }).first().click(); await home.waitForTimeout(2500)
  await c.shot(home, `tp-${T}-tag-read`)
  log('entries', await home.locator('article').count())
  await home.mouse.wheel(0, 1500); await home.waitForTimeout(1500)
  await c.shot(home, `tp-${T}-tag-read-scrolled`)
  log('entries after scroll', await home.locator('article').count())
  log('scan tag', JSON.stringify((await c.scan(home)).slice(0, 8)))
  await home.getByRole('tab', { name: 'Manage' }).click(); await home.waitForTimeout(800)
  await c.shot(home, `tp-${T}-tag-manage`)
  await home.getByRole('tab', { name: 'Read' }).click(); await home.waitForTimeout(800)
  await home.locator('article [role="link"]').first().click(); await home.waitForTimeout(1200)
  await c.shot(home, `tp-${T}-tag-open`)
  // The pass over the main window.
  await home.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'decide' } })))
  await home.waitForTimeout(1500)
  await c.shot(home, `tp-${T}-home-decide`)
  await home.keyboard.press('Escape')
})
done(c)
