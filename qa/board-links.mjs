// A link on a board's card opens as it does in the note, as its hover says (15 Nov: a PDF's link there opened
// nothing, and ⌥-click on a web page's went to the browser instead of the reader): a click on a web page's link
// opens the browser, ⌥-click the reader beside, ⌘-click the browser; a click on a PDF's link opens the reader at
// its page. The browser is a stand-in: nothing leaves the machine.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/board-links.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const text = (words, href) => ({ type: 'text', text: words, ...(href ? { marks: [{ type: 'link', attrs: { href } }] } : {}) })
const card = (...parts) => ({ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: parts }] })
const ESSAY = 'https://example.com/essay'
const PAPER = 'haligtree://assets/probe-paper.pdf#page=3&name=Probe%20paper'

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.reload(); await wait(2000)
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  // Nothing leaves the machine: the page's own requests to the internet are refused, as qa/final-editor.mjs does.
  await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true })))
  const opened = () => electron.evaluate(() => globalThis.__opened.length)
  await h.evaluate(() => {
    window.__told = []
    for (const name of ['haligtree:web', 'haligtree:pdf']) window.addEventListener(name, (event) => window.__told.push(`${name} ${event.detail?.page ?? event.detail?.href ?? ''}`))
  })
  const told = () => h.evaluate(() => window.__told.splice(0).join(', '))

  const id = await v('article:new')
  await v('item:save', id, { title: 'Reading board', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('To read')] },
    { type: 'taskList', content: [card(text('The '), text('essay', ESSAY), text(' and '), text('the paper', PAPER), text(' next'))] },
    { type: 'heading', attrs: { level: 2 }, content: [text('Read')] },
    { type: 'taskList', content: [card(text('Nothing yet'))] }
  ] } })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await send('view', 'articles'); await wait(1200)
  await send('article', id); await wait(1800)
  const WEB = `[data-board] a[href="${ESSAY}"]`
  const PDF = '[data-board] a[href*="probe-paper.pdf"]'
  check('the board shows the card with both links', (await h.locator(`${WEB}, ${PDF}`).count()) >= 2, String(await h.locator('[data-board]').count()))

  let hit = ''
  const hands = []
  const press = async (selector, modifiers = []) => {
    const target = h.locator(selector).first()
    await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const box = await target.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await h.mouse.move(box.x, box.y, { steps: 3 }); await wait(200)
    hit = await h.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return one ? `${one.tagName.toLowerCase()} "${(one.textContent ?? '').slice(0, 30)}"` : 'nothing' }, [box.x, box.y])
    // The pointer over it, as a person sees it: the hand.
    hands.push(`${selector.slice(10, 40)} ${await h.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [box.x, box.y])}`)
    for (const key of modifiers) await h.keyboard.down(key)
    await h.mouse.down(); await h.mouse.up()
    for (const key of modifiers) await h.keyboard.up(key)
    await wait(1200)
  }
  const back = async () => {
    for (let i = 0; i < 3 && (await h.evaluate(() => document.querySelectorAll('[data-pane]').length)) > 1; i++) { await h.keyboard.press('Control+w'); await wait(400) }
    await h.mouse.move(4, 4)
    await h.waitForFunction(() => !document.querySelector('[data-toast-lane] [role=status]'), null, { timeout: 9000 }).catch(() => {})
    await send('article', id); await wait(1500)
  }

  let was = await opened(); await told(); await press(WEB)
  check('board: a click on a web link opens the browser', (await opened()) === was + 1 && !(await told()), `pressed ${hit}`)
  await back(); was = await opened(); await press(WEB, ['Alt'])
  const reader = await told()
  check('board: ⌥-click on a web link opens it in the reader, not the browser', (await opened()) === was && reader.includes(`haligtree:web ${ESSAY}`), `${reader} pressed ${hit}`)
  await back(); was = await opened(); await told(); await press(WEB, ['Meta'])
  check('board: ⌘-click on a web link opens the browser', (await opened()) === was + 1, `pressed ${hit}`)
  await back(); was = await opened(); await told(); await press(PDF)
  const paper = await told()
  check('board: a click on a PDF link opens the reader at its page', paper.includes('haligtree:pdf 3') && (await opened()) === was, `${paper || 'nothing'} pressed ${hit}`)
  check('board: the pointer is the hand over every link on a card', hands.length >= 4 && hands.every((one) => one.endsWith(' pointer')), hands.join(', '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
