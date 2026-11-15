// A link card in a note opens as a link in its words does (15 Nov: ⌥-click on a card went to the browser, where the
// shortcuts list says ⌥-click opens "a link, row or card" to the side): a click opens the browser, ⌥-click the
// reader beside, ⌘-click the browser. The browser is a stand-in: nothing leaves the machine.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/link-card-click.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const ESSAY = 'https://example.com/essay'

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.reload(); await wait(2000)
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  const opened = () => electron.evaluate(() => globalThis.__opened.length)
  await h.evaluate(() => {
    window.__told = []
    window.addEventListener('haligtree:web', (event) => window.__told.push(`haligtree:web ${event.detail?.href ?? ''}`))
  })
  const told = () => h.evaluate(() => window.__told.splice(0).join(', '))
  const id = await h.evaluate((href) => window.api.captures.create({ body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Link card probe' }] },
    { type: 'bookmark', attrs: { href, title: 'The garden essay', description: 'An essay kept for later.', site: 'example.com', image: '' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Read it next.' }] }
  ] } }), ESSAY)
  const CARD = '.ProseMirror .node-bookmark .tiptap-bookmark-title'
  const back = async () => {
    for (let i = 0; i < 3 && (await h.evaluate(() => document.querySelectorAll('[data-pane]').length)) > 1; i++) { await h.keyboard.press('Control+w'); await wait(400) }
    await h.mouse.move(4, 4)
    await h.waitForFunction(() => !document.querySelector('[data-toast-lane] [role=status]'), null, { timeout: 9000 }).catch(() => {})
    await c.send('capture', id); await wait(1500)
  }
  await back()
  check('the note shows its link card', (await h.locator(CARD).count()) > 0)

  let hit = ''
  const press = async (modifiers = []) => {
    const target = h.locator(CARD).first()
    await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const box = await target.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } })
    await h.mouse.move(box.x, box.y, { steps: 3 }); await wait(200)
    hit = await h.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return one ? `${one.tagName.toLowerCase()}.${String(one.className).split(' ')[0]}` : 'nothing' }, [box.x, box.y])
    for (const key of modifiers) await h.keyboard.down(key)
    await h.mouse.down(); await h.mouse.up()
    for (const key of modifiers) await h.keyboard.up(key)
    await wait(1200)
  }
  let was = await opened(); await told(); await press()
  check('link card: a click opens the browser', (await opened()) === was + 1 && !(await told()), `pressed ${hit}`)
  await back(); was = await opened(); await press(['Alt'])
  const reader = await told()
  check('link card: ⌥-click opens it in the reader, not the browser', (await opened()) === was && reader.includes(`haligtree:web ${ESSAY}`), `${reader || 'nothing told'} pressed ${hit}`)
  await back(); was = await opened(); await told(); await press(['Meta'])
  check('link card: ⌘-click opens the browser', (await opened()) === was + 1, `pressed ${hit}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
