// A link inside an article in the reader opens as a link in a note does (15 Nov: a click on one went nowhere, the
// window kept in the app by main and nothing opened instead): a click opens the browser, ⌥-click the linked page in
// the reader beside, ⌘-click the browser. The site is faked in the main process's fetch, as in qa/web-reader.mjs;
// the browser is a stand-in and the page's own requests to the internet are refused: nothing leaves the machine.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/reader-link-click.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const SITE = 'https://93.184.216.34'
const para = (n) => `<p>Paragraph ${n} of the probe article walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article and not a scrap.</p>`
const pages = {
  '/article': `<html><head><title>The Garden Essay | Probe Times</title><meta property="og:site_name" content="Probe Times"></head><body><article><h1>The Garden Essay</h1>${para(1)}<p>Read <a href="/second">the second essay</a> next, it is kind.</p>${para(2)}${para(3)}</article></body></html>`,
  '/second': `<html><head><title>A Second Essay</title></head><body><article><h1>A Second Essay</h1>${para(5)}${para(6)}${para(7)}</article></body></html>`
}

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.reload(); await wait(2000)
  await electron.evaluate(({ shell, session }, [site, pages]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      const path = new URL(url).pathname
      return pages[path] ? new Response(pages[path], { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
    }
    globalThis.__opened = []
    shell.openExternal = async (url) => void globalThis.__opened.push(url)
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }))
  }, [SITE, pages])
  const opened = () => electron.evaluate(() => globalThis.__opened.length)
  await h.evaluate(() => {
    window.__told = []
    window.addEventListener('haligtree:web', (event) => window.__told.push(`haligtree:web ${event.detail?.href ?? ''}`))
  })
  const told = () => h.evaluate(() => window.__told.splice(0).join(', '))
  const LINK = '[data-pane] .web-reader-body a[href]'
  const home = async () => {
    for (let i = 0; i < 3 && (await h.evaluate(() => document.querySelectorAll('[data-pane]').length)) > 1; i++) { await h.keyboard.press('Control+w'); await wait(400) }
    await h.mouse.move(4, 4)
    await h.waitForFunction(() => !document.querySelector('[data-toast-lane] [role=status]'), null, { timeout: 9000 }).catch(() => {})
    await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/article`)
    await h.waitForSelector(LINK, { timeout: 20000 }); await wait(600); await told()
  }
  let hit = ''
  const press = async (modifiers = []) => {
    const link = h.locator(LINK).first()
    await link.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const r = await link.evaluate((el) => { const one = el.getClientRects()[0]; return [one.left + one.width / 2, one.top + one.height / 2] })
    await h.mouse.move(r[0], r[1], { steps: 3 }); await wait(200)
    hit = await h.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return `${one?.tagName.toLowerCase()} "${(one?.textContent ?? '').slice(0, 24)}" (${one ? getComputedStyle(one).cursor : ''})` }, r)
    for (const key of modifiers) await h.keyboard.down(key)
    await h.mouse.down(); await h.mouse.up()
    for (const key of modifiers) await h.keyboard.up(key)
    await wait(1500)
  }
  const panes = () => h.evaluate(() => document.querySelectorAll('[data-pane]').length)

  await home()
  check('the reader shows the article with its link', (await h.locator(LINK).count()) > 0)
  let was = await opened(); await press()
  check('reader: a click on a link in the article opens the browser', (await opened()) === was + 1 && !(await told()), `pressed ${hit}`)
  await home(); was = await opened(); await press(['Alt'])
  const reader = await told()
  check('reader: ⌥-click on it opens the linked page in the reader beside', (await opened()) === was && reader.includes(`haligtree:web ${SITE}/second`) && (await panes()) === 2, `${reader || 'nothing told'}, ${await panes()} panes, pressed ${hit}`)
  await home(); was = await opened(); await press(['Meta'])
  check('reader: ⌘-click on it opens the browser', (await opened()) === was + 1, `pressed ${hit}`)
  check('reader: the pointer over the link is the hand', hit.endsWith('(pointer)'), hit)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
