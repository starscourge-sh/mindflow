// The sandbox's Renaissance thread: three articles, the quotes, words, link,
// question, tasks, goal and postcard around them; every picture loads, every
// link resolves, every picture is credited, Review, search and the Map find it.
// SHOT=<dir> also takes an article, the Map and Review, light and dark.
//
//   npx electron-vite build --outDir out-ren
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-ren/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-renaissance.mjs
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const started = Date.now()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
try {
  check('the sandbox is set out', (await v('sandbox:state')).seeded, `${Date.now() - started}ms to open and seed`)
  const articles = await v('items', 'article')
  const titles = ['How Florence learned perspective', 'Leonardo kept a commonplace book', "Michelangelo's Sistine ceiling: a reading note"]
  const mine = titles.map((title) => articles.find((one) => one.title === title))
  check('three Renaissance articles', mine.every(Boolean), mine.map((one) => one?.title ?? 'missing').join(' | '))

  // Links and pictures, read from each article's saved words.
  const walk = (node, out) => { if (!node || typeof node !== 'object') return out; out.push(node); (node.content ?? []).forEach((kid) => walk(kid, out)); return out }
  for (const article of mine.filter(Boolean)) {
    const full = await v('item', article.id)
    const nodes = walk(typeof full.body === 'string' ? JSON.parse(full.body) : full.body, [])
    const links = nodes.filter((one) => one.type === 'noteLink').map((one) => String(one.attrs.id))
    const images = nodes.filter((one) => one.type === 'image')
    const graph = await v('notes:graph', article.id)
    const resolved = new Set(graph.out.map((one) => one.id))
    const broken = links.filter((id) => !resolved.has(id.includes(':') ? id.split(':')[1] : id))
    check(`${article.title}: ${links.length} links, all resolve`, links.length >= 4 && !broken.length, broken.join(', '))
    check(`${article.title}: pictures, each captioned and credited`, images.length >= 2 && images.every((one) => one.attrs.src.startsWith('haligtree://assets/') && /Public domain|CC0/.test(one.attrs.caption ?? '')), images.map((one) => one.attrs.caption?.slice(0, 40)).join(' | '))
    check(`${article.title}: headings and a table or list`, nodes.some((one) => one.type === 'heading') && nodes.some((one) => ['table', 'orderedList', 'bulletList'].includes(one.type)))
    check(`${article.title}: no link left as raw text`, !JSON.stringify(full.body).includes('[[@'))
    check(`${article.title}: links back in`, graph.in.length >= 1, `${graph.in.length} in`)
  }

  // The pictures load in the article itself.
  const florence = mine[0]
  await c.send('article', florence.id)
  await h.waitForTimeout(1800)
  const loaded = await h.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.ProseMirror img')]
    await Promise.all(imgs.map((img) => img.complete ? null : new Promise((done) => { img.onload = img.onerror = done })))
    return imgs.map((img) => img.naturalWidth)
  })
  check('the article pictures load', loaded.length >= 2 && loaded.every((w) => w > 200), loaded.join(', '))
  if (SHOT) {
    await h.screenshot({ path: join(SHOT, 'article-light.png') })
    await h.mouse.move(1000, 700); await h.mouse.wheel(0, 900); await h.waitForTimeout(600)
    await h.screenshot({ path: join(SHOT, 'article-light-2.png') })
  }

  // The notes around them.
  const captures = await h.evaluate(() => window.api.captures.list())
  const rows = captures.rows ?? captures
  const quotes = rows.filter((one) => one.kind === 'quote' && ['Giorgio Vasari', 'Leonardo da Vinci'].includes(one.attribution))
  check('five quotes from Vasari and Leonardo, each citing its translator', quotes.length === 5 && quotes.every((one) => /tr\. (Gaston du C\. de Vere|Jean Paul Richter)/.test(one.medium ?? '')), `${quotes.length}`)
  check('a postcard can say "From Giorgio Vasari"', rows.filter((one) => one.attribution === 'Giorgio Vasari' && one.status !== 'discarded').length >= 2)
  const words = rows.filter((one) => one.kind === 'word' && /^(Sfumato|Chiaroscuro|Contrapposto)/.test(one.label ?? ''))
  check('three words: sfumato, chiaroscuro, contrapposto', words.length === 3, words.map((one) => one.label.split(':')[0]).join(', '))
  check('a museum link card', rows.some((one) => one.kind === 'link' && (one.label ?? '').includes('Libyan Sibyl')))
  const lastYear = rows.find((one) => (one.label ?? '').startsWith('Florence, Santa Maria Novella'))
  const yearsBack = lastYear ? (Date.now() - new Date(lastYear.capturedAt)) / 86400000 : 0
  check('a note from this time last year', yearsBack > 362 && yearsBack < 370, `${Math.round(yearsBack)} days ago`)

  const question = (await v('items', 'question')).find((one) => one.title.startsWith('Why did linear perspective'))
  check('the question holds four clues', question && (await v('item', question.id)).glosses.length === 4)
  const goal = (await v('items', 'goal')).find((one) => one.title.startsWith("Read Vasari's Lives"))
  check('the reading goal has three logs', goal && (await v('item', goal.id)).glosses.length === 3)
  const tasks = await v('tasks')
  const seminar = tasks.find((one) => one.title.startsWith('Read the Brancacci Chapel notes'))
  check('a task made from the seminar note, due in two days', seminar && Math.round((new Date(seminar.dueAt).setHours(12) - new Date().setHours(12)) / 86400000) === 2)
  check('a study task from the article', tasks.some((one) => one.title.startsWith('Reread How Florence learned perspective')))

  // Gems come back in Review: one due today, the rest in the deck.
  const gems = (await v('items', 'nugget')).filter((one) => ['The wall appears to be pierced', 'Perspective is the guide and the gateway', 'Memory cannot retain them all'].includes(one.title))
  check('three gems with a question each', gems.length === 3 && gems.every((one) => one.prompt), gems.map((one) => one.title).join(' | '))
  const queue = await v('review:queue')
  check("Vasari's line waits in Review today", queue.some((one) => one.title === 'The wall appears to be pierced'), `${queue.length} due`)

  // Search finds the thread.
  for (const words of ['perspective florence', 'sfumato', 'sistine', 'vasari brunelleschi']) {
    const found = await h.evaluate((q) => window.api.captures.find(q), words)
    check(`search "${words}" finds it`, found.length >= 1, found.slice(0, 3).map((one) => one.label?.slice(0, 30)).join(' | '))
  }

  // The Map draws the cluster: the three articles linked to each other.
  const map = await v('notes:graph:all')
  const ids = new Set(mine.map((one) => one.id))
  const between = map.edges.filter((edge) => ids.has(edge.source ?? edge[0] ?? edge.a) && ids.has(edge.target ?? edge[1] ?? edge.b))
  check('the Map holds all three articles, linked', mine.every((one) => map.nodes.some((node) => node.id === one.id)) && between.length >= 2, `${between.length} links between them, ${map.nodes.length} notes on the map`)

  // Every new picture credited beside it.
  const sources = readFileSync('src/renderer/src/assets/sandbox/SOURCES.txt', 'utf8')
  const files = ['masaccio-trinity', 'tribute-money', 'ideal-city', 'vitruvian-man', 'codex-atlanticus', 'delphic-sibyl', 'libyan-sibyl-study']
  check('every picture has a credit with its source and licence', files.every((name) => new RegExp(`${name}\\.webp[\\s\\S]{0,400}(PD-Art|CC0)[\\s\\S]{0,300}https://`).test(sources)))

  if (SHOT) {
    await c.go('map'); await h.waitForTimeout(2500)
    await h.screenshot({ path: join(SHOT, 'map-light.png') })
    await c.go('review'); await h.waitForTimeout(1500)
    // Past the cards before it ("Not today", B), so Vasari's line is the one showing.
    for (let i = 0; i < 12 && !(await h.evaluate(() => document.body.innerText.includes("Masaccio's painted vault"))); i++) { await h.keyboard.press('b'); await h.waitForTimeout(500) }
    await h.screenshot({ path: join(SHOT, 'review-light.png') })
    await h.keyboard.press('Space'); await h.waitForTimeout(700)
    await h.screenshot({ path: join(SHOT, 'review-light-answer.png') })
    await c.theme('dark')
    await c.send('article', florence.id); await h.waitForTimeout(1800)
    await h.screenshot({ path: join(SHOT, 'article-dark.png') })
    await c.send('article', mine[2].id); await h.waitForTimeout(1800)
    await h.mouse.move(1000, 700); await h.mouse.wheel(0, 1400); await h.waitForTimeout(600)
    await h.screenshot({ path: join(SHOT, 'ceiling-dark.png') })
    await c.go('map'); await h.waitForTimeout(2500)
    await h.screenshot({ path: join(SHOT, 'map-dark.png') })
    await c.go('review'); await h.waitForTimeout(1500)
    await h.screenshot({ path: join(SHOT, 'review-dark.png') })
    await h.keyboard.press('Space'); await h.waitForTimeout(700)
    await h.screenshot({ path: join(SHOT, 'review-dark-answer.png') })
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed`)
process.exit(failed.length ? 1 : 0)
