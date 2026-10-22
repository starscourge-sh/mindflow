// The ribbon divider: a rule drawn as a strip of the theme's colours.
// "/" then "Ribbon" puts one in, its colours come from the theme, it survives
// a reload, Markdown writes it as ---, a right-click swaps it with the plain
// line, === makes one, and the Read view of a tag draws it the same.
// Screenshots under a heading, above a picture, in four themes.
//   npx electron-vite build --outDir out-rib
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-rib/main/index.js HALIGTREE_QA_AWAY=1 node qa/ribbon-rule.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/ribbon-shots'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, send, theme, close, errors } = c
const wait = (ms) => h.waitForTimeout(ms)

const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const json = () => h.$eval(ED, (el) => el.editor.getJSON())
const rules = async () => (await json()).content.filter((n) => n.type === 'horizontalRule').map((n) => n.attrs?.variant ?? null)
const ribbonBg = () => h.evaluate((sel) => {
  const hr = document.querySelector(`${sel} [data-variant="ribbon"] > hr`)
  if (!hr) return null
  const s = getComputedStyle(hr)
  return { color: s.backgroundColor, image: s.backgroundImage, height: hr.getBoundingClientRect().height, radius: s.borderRadius }
}, ED)

try {
  // A landscape, so the shot sits the way the reference does: heading, strip, picture.
  const src = await h.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600; canvas.height = 900
    const g = canvas.getContext('2d')
    const sky = g.createLinearGradient(0, 0, 0, 900)
    sky.addColorStop(0, '#2a3a6b'); sky.addColorStop(0.55, '#c98b8b'); sky.addColorStop(1, '#f1c28a')
    g.fillStyle = sky; g.fillRect(0, 0, 1600, 900)
    const ridge = (y, amp, color, seed) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, 900)
      for (let x = 0; x <= 1600; x += 20) g.lineTo(x, y + Math.sin(x / 180 + seed) * amp + Math.sin(x / 63 + seed * 2) * amp * 0.3)
      g.lineTo(1600, 900); g.closePath(); g.fill()
    }
    ridge(560, 60, '#4b4a78', 1); ridge(650, 45, '#34335a', 3); ridge(740, 35, '#1f1f3a', 5)
    return canvas.toDataURL('image/jpeg', 0.88)
  })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), {
    type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Mountains at dusk' }] },
      p('Notes from the ridge walk #ribbonprobe'),
      { type: 'image', attrs: { src } },
      p('The light went first from the valleys, then from the peaks.'),
      p(''),
    ]
  })
  await send('capture', id)
  await wait(1500)
  await h.locator(ED).waitFor({ timeout: 8000 })

  // A celebration up takes the first Escape: put it away first.
  await wait(2500)
  const away = h.locator('[data-celebration] button').first()
  if (await away.count()) { await away.click().catch(() => {}); await wait(600) }

  // 1. "/" then "Ribbon", typed under the tag line.
  await h.locator(`${ED} > p`, { hasText: 'Notes from the ridge' }).first().click({ position: { x: 5, y: 5 } })
  await wait(300)
  await h.keyboard.press('End')
  await h.keyboard.press('Enter')
  await h.keyboard.type('/Ribbon')
  await wait(500)
  const first = await h.evaluate(() => document.querySelector('.tiptap-slash-menu .is-selected')?.textContent ?? '')
  await h.keyboard.press('Enter')
  await wait(400)
  check('"/" then "Ribbon" inserts a ribbon divider', (await rules()).includes('ribbon'), `top row "${first}", rules ${JSON.stringify(await rules())}`)

  // Heading, ribbon, picture: the order of the reference.
  await h.$eval(ED, (el) => {
    const e = el.editor
    const content = e.getJSON().content.filter((n, i, all) => n.type !== 'paragraph' || n.content?.length || i === all.length - 1)
    const rule = content.findIndex((n) => n.type === 'horizontalRule')
    const [moved] = content.splice(rule, 1)
    content.splice(content.findIndex((n) => n.type === 'image'), 0, moved)
    e.commands.setContent({ type: 'doc', content })
  })
  await wait(400)

  // 2. Its colours are the theme's: different in Paper and Tokyo Night, never transparent.
  const looks = {}
  for (const name of ['paper', 'dark', 'gruvbox', 'tokyonight']) {
    await theme(name)
    await send('capture', id)
    await wait(1500)
    await h.locator(ED).waitFor({ timeout: 8000 })
    await h.evaluate(() => document.activeElement?.blur())
    looks[name] = await ribbonBg()
    await h.locator(`${ED} > h1`).first().scrollIntoViewIfNeeded()
    await h.screenshot({ path: `${SHOTS}/ribbon-${name}.png` })
    const rule = h.locator(`${ED} [data-variant="ribbon"]`).first()
    const box = (await rule.count()) ? await rule.boundingBox() : null
    if (box) await h.screenshot({ path: `${SHOTS}/ribbon-${name}-close.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 120), width: box.width + 80, height: 420 } })
  }
  const opaque = (look) => !!look && look.color !== 'rgba(0, 0, 0, 0)' && look.color !== 'transparent' && /gradient/.test(look.image)
  check('the ribbon is drawn, a gradient and not transparent, in every theme', Object.values(looks).every(opaque), JSON.stringify(Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, v?.color]))))
  check('Paper and Tokyo Night give it different colours', looks.paper && looks.tokyonight && looks.paper.image !== looks.tokyonight.image, `${looks.paper?.color} vs ${looks.tokyonight?.color}`)
  check('a sharp strip about 6px tall, in every theme', Object.values(looks).every((look) => look && look.height >= 5 && look.height <= 7 && parseFloat(look.radius) === 0), JSON.stringify(Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, `${v?.height}px r${v?.radius}`]))))

  // 3. It survives a reload (the theme switch above reloaded too).
  await h.reload(); await wait(1500)
  await send('capture', id); await wait(1500)
  await h.locator(ED).waitFor({ timeout: 8000 })
  check('it survives a reload', (await rules()).includes('ribbon'), JSON.stringify(await rules()))
  const saved = await h.evaluate((id) => window.api.haligtree('capture', id).catch(() => null), id)
  if (saved) check('the saved note keeps the style', JSON.stringify(saved).includes('"variant":"ribbon"'))

  // 4. Markdown export writes ---; HTML keeps the class.
  const md = await h.$eval(ED, (el) => el.editor.storage.markdown.manager.serialize(el.editor.getJSON()))
  check('Markdown export gives ---', /^---$/m.test(md) && !/===/.test(md), md.split('\n').slice(0, 4).join(' | '))
  const html = await h.$eval(ED, (el) => el.editor.getHTML())
  check('HTML export keeps the class', /data-variant="ribbon"/.test(html) && /class="mf-ribbon"/.test(html))

  // 5. Right-click swaps it, each way.
  const swap = async (label) => {
    const rule = h.locator(`${ED} [data-type="horizontalRule"]`).first()
    await rule.scrollIntoViewIfNeeded()
    const box = await rule.boundingBox()
    await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    await wait(500)
    const item = h.locator('.tiptap-block-menu [role="menuitem"]', { hasText: new RegExp(`^${label}$`) }).first()
    const shown = await item.count()
    if (shown) await item.click()
    else await h.keyboard.press('Escape')
    await wait(400)
    return shown
  }
  const offeredPlain = await swap('Plain line')
  check('right-click on a ribbon offers "Plain line" and makes it one', offeredPlain && (await rules())[0] === null, JSON.stringify(await rules()))
  const offeredRibbon = await swap('Ribbon')
  check('right-click on a plain line offers "Ribbon" and makes it one', offeredRibbon && (await rules())[0] === 'ribbon', JSON.stringify(await rules()))

  // 6. === on an empty line, and not in code or a highlight.
  await h.$eval(ED, (el) => el.editor.chain().focus('end').run())
  await h.keyboard.press('Enter')
  await h.keyboard.type('===')
  await wait(300)
  check('=== on an empty line makes a ribbon', (await rules()).filter((v) => v === 'ribbon').length === 2, JSON.stringify(await rules()))
  await h.keyboard.type('a ==marked== word')
  await wait(300)
  check('==marked== is still a highlight', (await h.$eval(ED, (el) => el.innerHTML)).includes('<mark'))
  await h.keyboard.press('Enter')
  await h.keyboard.type('```')
  await h.keyboard.press('Enter').catch(() => {})
  await h.keyboard.type('===')
  await wait(300)
  const code = await h.$eval(ED, (el) => el.editor.getJSON().content.filter((n) => n.type === 'codeBlock').map((n) => n.content?.[0]?.text ?? ''))
  check('=== inside code stays text', code.some((t) => t.includes('===')) && (await rules()).length === 3 - 1, JSON.stringify(code))

  // 7. The tag's Read view draws it the same way.
  await c.go('tags')
  await h.locator('[data-row]', { hasText: 'ribbonprobe' }).first().click()
  await wait(2500)
  const inRead = await h.evaluate(() => {
    const hr = document.querySelector('.tiptap.ProseMirror[contenteditable="false"] [data-variant="ribbon"] > hr')
    if (!hr) return null
    const s = getComputedStyle(hr)
    return { image: s.backgroundImage.slice(0, 40), mask: s.webkitMaskImage, height: hr.getBoundingClientRect().height }
  })
  check('the tag stream draws the ribbon, not the pen line', inRead && /gradient/.test(inRead.image) && inRead.mask === 'none', JSON.stringify(inRead))
  const article = h.locator('.tiptap.ProseMirror[contenteditable="false"] [data-variant="ribbon"]').first()
  if (await article.count()) {
    await article.scrollIntoViewIfNeeded()
    await h.screenshot({ path: `${SHOTS}/ribbon-tag-read.png` })
  }
  check('no page errors', !errors.some((e) => /PAGEERROR/.test(e)), errors.filter((e) => /PAGEERROR/.test(e)).join(' | '))
} finally {
  await close()
}
done()
