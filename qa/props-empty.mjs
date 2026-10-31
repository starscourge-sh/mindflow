// A kind's own fields show in the property strip only once they hold words:
// a Lookup with only a meaning shows no Example or Language, "Add property"
// offers them first (with what each does), and one brought in stays while you
// are on the note, empty or not. A quote and a link the same. Look Up's Keep
// fills Example when the dictionary gave one, and a Wikipedia-only Keep
// fills neither Example nor Language.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/props-empty.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { openProbePdf, pickInPdf } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// A dictionary that knows "quiet", with an example; Wikipedia knows "worth" only.
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/dict/quiet')) return res.end(JSON.stringify([{ word: 'quiet', meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Making little or no noise.', example: 'A quiet engine hummed below.' }] }] }]))
  if (req.url.startsWith('/wiki/worth')) return res.end(JSON.stringify({ type: 'standard', title: 'Worth', description: 'Value', extract: 'Worth is the value of something.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Worth' } } }))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${server.address().port}/dict/`
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
let base
/** The app's dark or light look, as the theme probes set it. */
const theme = async (one) => { base = await h.evaluate(([t, was]) => { const r = document.documentElement; was ??= r.className; r.className = t === 'dark' ? 'dark' : was.replace(/dark/, ''); return was }, [one, base]); await wait(300) }
const STRIP = '[data-property-strip]'
/** The rows the visible strip shows, by key. */
const rows = () => h.evaluate((sel) => {
  const strip = [...document.querySelectorAll(sel)].find((one) => one.offsetParent !== null)
  return strip ? [...strip.querySelectorAll('[data-property]')].map((one) => one.dataset.property) : null
}, STRIP)
const addProperty = async () => {
  await h.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-add-property]`)].find((one) => one.offsetParent !== null)?.click(), STRIP)
  await wait(400)
}
const offered = () => h.evaluate(() => [...document.querySelectorAll('[data-name-options] [role="option"]')].map((one) => one.dataset.fieldOption ? `field:${one.dataset.fieldOption}` : `name:${one.dataset.nameOption}`))
const make = async (kind, title, fields = {}) => {
  const id = await h.evaluate(([kind, title]) => window.api.captures.create({ kind, title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] }, markdown: title }), [kind, title])
  for (const [key, value] of Object.entries(fields)) await v('notes:fields:set', 'captures', id, key, value)
  return id
}
const open = async (id) => { await send('capture', id); await wait(1500) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const word = await make('word', 'Heliocentrism', { definition: 'The sun at the centre.' })
  const other = await make('note', 'Somewhere else')
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)
  await open(word)

  // 1. Only the meaning: no Example or Language rows.
  const first = await rows()
  check('1. a word with only a meaning shows Meaning, not Example or Language', first?.includes('definition') && !first.includes('example') && !first.includes('language'), JSON.stringify(first))
  await shot('word-meaning-only-light')

  // 2. "Add property" offers them first, with their does line.
  await addProperty()
  const menu = await offered()
  check('2. "Add property" offers Example and Language first', menu[0] === 'field:example' && menu[1] === 'field:language' && menu.slice(2).length > 0 && menu.slice(2).every((one) => one.startsWith('name:')), menu.join(','))
  const does = await h.evaluate(() => document.querySelector('[data-field-option="example"]')?.textContent ?? '')
  check('2. Example is offered by its own label with what it does', /^Example/.test(does) && /sentence that uses it/.test(does), does)
  await shot('add-menu-light')
  await theme('dark')
  await shot('add-menu-dark')
  await theme('light')

  // 3. Picking Example brings its row, its editor open and focused.
  await h.dispatchEvent('[data-field-option="example"]', 'mousedown')
  await wait(700)
  const brought = await h.evaluate(() => ({ row: !!document.querySelector('[data-property="example"]'), focused: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') }))
  check('3. picking Example shows its row, ready to type in', brought.row && brought.focused === 'TEXTAREA' && brought.label === 'Example', JSON.stringify(brought))
  // Left empty: it stays while you are on the note.
  await h.keyboard.press('Escape'); await wait(500)
  check('3. left empty, Example stays while on the note', (await rows())?.includes('example'), JSON.stringify(await rows()))
  // Typed in: kept and shown.
  await h.click('[data-property="example"]'); await wait(500)
  await h.keyboard.type('The old model put the earth in the middle.')
  await h.keyboard.press('Enter'); await wait(700)
  const fields = await v('notes:fields', 'captures', word)
  check('3. a value typed in is kept', fields.example === 'The old model put the earth in the middle.', JSON.stringify(fields))
  // Language brought in and left empty: gone once you leave the note and come back.
  await addProperty()
  await h.dispatchEvent('[data-field-option="language"]', 'mousedown'); await wait(500)
  await h.keyboard.press('Escape'); await wait(400)
  check('3. Language brought in shows while on the note', (await rows())?.includes('language'))
  await open(other)
  await open(word)
  const back = await rows()
  check('3. left empty, Language waits again after leaving; Example (filled) stays', !back?.includes('language') && back?.includes('example'), JSON.stringify(back))
  await shot('word-with-example-light')
  await theme('dark')
  await shot('word-with-example-dark')
  await theme('light')

  // 4. A quote and a link: nothing of their own until filled, all offered first.
  const quote = await make('quote', 'All that is gold does not glitter')
  await open(quote)
  const quoteRows = await rows()
  check('4. a quote shows no Page or Year while empty', !quoteRows?.includes('location') && !quoteRows?.includes('year'), JSON.stringify(quoteRows))
  await addProperty()
  const quoteMenu = await offered()
  check('4. a quote offers Page or place and Year first', quoteMenu[0] === 'field:location' && quoteMenu[1] === 'field:year', quoteMenu.join(','))
  await h.keyboard.press('Escape'); await wait(300)
  const link = await make('link', 'https://example.com/a', { site: 'example.com' })
  await open(link)
  const linkRows = await rows()
  check('4. a link shows its Site (filled) but not Title, Status or Rating', linkRows?.includes('site') && !linkRows.includes('title') && !linkRows.includes('status') && !linkRows.includes('rating'), JSON.stringify(linkRows))
  await addProperty()
  const linkMenu = await offered()
  check('4. a link offers Title, Status and Rating first, not Site', linkMenu.slice(0, 3).join(',') === 'field:title,field:status,field:rating' && !linkMenu.includes('field:site'), linkMenu.join(','))
  await h.keyboard.press('Escape'); await wait(300)

  // 5. Look Up: the dictionary's example kept as Example; no Language for an English word.
  const lookups = async (re) => h.evaluate(async (src) => (await window.api.captures.find(src)).filter((one) => one.type === 'capture' && new RegExp(`^${src}`, 'i').test(one.label)).map((one) => one.id), re)
  await openProbePdf(c)
  await pickInPdf(h, 2, 7, 1); await wait(400)
  await h.keyboard.press('l'); await wait(1500)
  await h.click('[data-look-keep]'); await wait(900)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)
  const [quiet] = await lookups('quiet')
  const quietFields = quiet ? await v('notes:fields', 'captures', quiet) : {}
  check('5. a dictionary keep saves its example, no language', quietFields.example === 'A quiet engine hummed below.' && quietFields.definition === 'Making little or no noise.' && !('language' in quietFields), JSON.stringify(quietFields))
  if (quiet) {
    await open(quiet)
    const quietRows = await rows()
    check('5. its strip shows Example filled, no Language', quietRows?.includes('example') && !quietRows.includes('language'), JSON.stringify(quietRows))
  }

  // 6. Wikipedia only: neither Example nor Language.
  await openProbePdf(c)
  await pickInPdf(h, 17, 22, 2); await wait(400)
  await h.keyboard.press('l'); await wait(1500)
  await h.click('[data-look-keep]'); await wait(900)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)
  const [worth] = await lookups('worth')
  const worthFields = worth ? await v('notes:fields', 'captures', worth) : {}
  check('6. a Wikipedia-only keep sets the meaning, not Example or Language', worthFields.definition === 'Worth is the value of something.' && !('example' in worthFields) && !('language' in worthFields), JSON.stringify(worthFields))
  if (worth) {
    await open(worth)
    const worthRows = await rows()
    check('6. its strip shows Meaning, Created and Updated only', JSON.stringify(worthRows) === JSON.stringify(['definition', 'created', 'updated']), JSON.stringify(worthRows))
    await shot('wikipedia-only-light')
    await theme('dark')
    await shot('wikipedia-only-dark')
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
  server.closeAllConnections?.()
  server.close()
}
done()
