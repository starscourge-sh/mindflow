// The block page and its notice, with the browser stubbed and the page itself
// opened in a real (hidden) Chromium window. The page never reloads itself
// while the round runs: it asks quietly. A browser that keeps reporting the
// old address after the tab was sent away (as Dia and Arc can) does not get
// the tab sent away again and again, which reloaded it every second. The
// "Website blocked" notice comes once per site per round: never again after
// it is closed, nor when the tab really goes back to the site later.
//
//   npx electron-vite build --outDir out-b
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/blocked-page.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const c = await sandbox({ seeded: false })
const { electron, v } = c
const fake = (one) => electron.evaluate((_, f) => void (globalThis.siteBlockFake = f), one)
const away = () => electron.evaluate(() => (globalThis.siteBlockAway ?? []).map((one) => ({ url: one.url, page: one.page })))
// Every "blocked" notice main sends to a card window, counted from the moment the card window exists.
const watchNotices = () => electron.evaluate(({ BrowserWindow }) => {
  globalThis.qaNotices ??= []
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.getURL().includes('view=nudge') || win.webContents.qaWatched) continue
    win.webContents.qaWatched = true
    const send = win.webContents.send.bind(win.webContents)
    win.webContents.send = (channel, ...args) => (channel === 'nudge' && args[0]?.kind === 'blocked' && globalThis.qaNotices.push(args[0].site), send(channel, ...args))
  }
})
const notices = () => electron.evaluate(() => globalThis.qaNotices ?? [])

try {
  await v('settings:set', { sounds: false, countIn: false, focusTools: true, siteBlock: true, blockSites: ['x.com'], quietStart: '03:00', quietEnd: '03:01' })
  const task = await v('task:add', 'Write the essay plan')
  await v('session:start', task?.id ?? task, 'Write the essay plan', 25 * 60_000)

  // A browser that keeps saying the tab is still on x.com after it was sent away.
  await fake({ app: 'company.thebrowser.dia', url: 'https://x.com/home', win: 1, tab: 7 })
  await electron.evaluate(() => void (globalThis.qaStale = setInterval(() => { if (globalThis.siteBlockFake) globalThis.siteBlockFake.url = 'https://x.com/home' }, 100)))
  // The tab itself: the block page in a real Chromium window, put on each page Haligtree sends it to.
  await electron.evaluate(({ BrowserWindow }) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    globalThis.qaTab = win
    globalThis.qaLoads = 0
    globalThis.qaShown = 0
    win.webContents.on('did-start-navigation', (_e, url, inPage, main) => main && !inPage && globalThis.qaLoads++)
    globalThis.qaFollow = setInterval(() => {
      const all = globalThis.siteBlockAway ?? []
      if (all.length > globalThis.qaShown) (globalThis.qaShown = all.length), void win.loadURL(all.at(-1).page)
    }, 100)
  })
  for (let i = 0; i < 75 && !(await away()).length; i++) await wait(200)
  await wait(1500)
  await watchNotices()
  const first = await away()
  check('x.com is sent away to the block page', first.length >= 1 && /^http:\/\/127\.0\.0\.1:\d+\/haligtree-blocked/.test(first[0].page), JSON.stringify(first))
  const card = electron.windows().find((one) => one.url().includes('view=nudge'))
  check('the notice shows', !!(await card?.$('[data-nudge="blocked"]').catch(() => null)))

  // 20 seconds of the browser still reporting x.com.
  await wait(20_000)
  const after = await away()
  const loads = await electron.evaluate(() => globalThis.qaLoads)
  const text = await electron.evaluate(() => Promise.race([globalThis.qaTab.webContents.executeJavaScript('document.body.innerText'), new Promise((go) => setTimeout(() => go('(no page)'), 3000))]))
  check('in 20 s, the tab is sent away once, not again and again', after.length === 1, `${after.length} times`)
  check('and the block page loaded once, never reloading itself', loads === 1, `${loads} loads`)
  check('it still says x.com is blocked', text.includes('is blocked until'), text.slice(0, 120))
  const cat = await electron.evaluate(() => globalThis.qaTab.webContents.executeJavaScript("(() => { const one = document.querySelector('main > img'); return one ? { ok: one.complete && one.naturalWidth > 0, above: one.getBoundingClientRect().bottom <= document.querySelector('h1').getBoundingClientRect().top } : null })()"))
  check('the cat sits at the top, above the words', cat?.ok && cat.above, JSON.stringify(cat))
  if (process.env.SHOTS) {
    const png = await electron.evaluate(async () => (await globalThis.qaTab.webContents.capturePage()).toPNG().toString('base64'))
    ;(await import('fs')).writeFileSync(`${process.env.SHOTS}/blocked-page.png`, Buffer.from(png, 'base64'))
  }
  check('the notice came once', (await notices()).length === 0, `${(await notices()).length} more`)

  // Closed: it stays closed.
  const before = (await notices()).length
  await card?.click('[data-nudge="blocked"] button[aria-label="Got it"]', { timeout: 3000 }).catch(() => null)
  await wait(1500)
  await watchNotices()
  // The tab really goes back to x.com (the page leaves): sent away again, and no notice this time.
  await electron.evaluate(() => void globalThis.qaTab.loadURL('about:blank'))
  await wait(3500)
  await watchNotices()
  const again = await away()
  check('the tab really back on x.com is sent away again', again.length === 2, `${again.length} times`)
  check('with no notice again this round', (await notices()).length === before, `${(await notices()).length - before} more`)
  check('no errors', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 400))
} finally {
  await electron.evaluate(() => {
    clearInterval(globalThis.qaStale)
    clearInterval(globalThis.qaFollow)
    globalThis.qaTab?.destroy()
  }).catch(() => null)
  await c.close()
}
done()
