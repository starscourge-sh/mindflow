// A walk through the main pages and lists as a person meets them, a picture of
// each: the Day page (Today), Inbox, the Inbox with sorted too, Pages, Gems, a tag page, Tags, Review, Map,
// the Inbox's Graph, Questions, Goals, Calendar, Today, Upcoming, the Bin,
// Archived, the sidebar's foot menu, ⌘K and Switch book. MODE picks the walk:
//   basic  (the default) large and light, then small and dark; one ⌘A, ⌫ and
//          ⌘Z on the Inbox and with "Show sorted too" on, grouped by kind.
//   looks  Soft, Brutal and Paper, each at 900x700 (a dark theme) and
//          1600x1000 (Paper's light theme).
//   keys   the Mac gestures on every list: ↑ ↓, Enter, Esc, ⌘-click, ⇧-click
//          across kinds, ⌘C, Delete, ⌘⌫ and ⌘Z; a row's right-click menu the
//          same wherever it shows; Esc and the back button leave a page.
//   edges  long, emoji-only and untitled notes, a broken picture, hundreds of
//          rows, offline, the smallest window, reduced motion and Motion off.
//   empty  (run without the sandbox) a new book: every page empty, then with one note.
// Every screen is checked for text past an edge, a page that scrolls sideways,
// a button whose label wraps or is cut, an em dash and the word "Discard".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> [MODE=looks] node qa/walk-pages.mjs
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> MODE=empty node qa/walk-pages.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'

const MODE = process.env.MODE ?? 'basic'
const SHOTS = `${process.env.SHOTS ?? '/tmp/walk-pages'}/${MODE}`
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1600, height: 1000, seeded: MODE !== 'empty' })
const { h, v, go, size, electron } = c
const shot = async (name) => { await h.waitForTimeout(500); await h.screenshot({ path: `${SHOTS}/${name}.png` }).catch((e) => console.log('no shot', name, e.message)) }
const esc = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
// Everything is the Inbox with "Show sorted too" on: its page is named so.
const page = (id) => `[data-page="${({ all: 'inbox' })[id] ?? id}"]`

// What a person would see go wrong on a screen, read off the page.
const audit = (where) => h.evaluate((where) => {
  const out = []
  const visible = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
  for (const one of document.querySelectorAll('body *')) {
    if (one.closest('svg, canvas, [aria-hidden=true], [data-rolling], .ProseMirror')) continue
    const r = one.getBoundingClientRect()
    if (!visible(r)) continue
    const text = [...one.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (text && (r.right > innerWidth + 1 || r.left < -1)) out.push(`past the edge “${text.slice(0, 40)}”`)
  }
  for (const one of document.querySelectorAll('button, [role=tab], [role=menuitem]')) {
    const r = one.getBoundingClientRect()
    if (!visible(r)) continue
    const label = one.innerText.replace(/\s+/g, ' ').trim()
    if (!label || label.length > 40) continue
    const line = parseFloat(getComputedStyle(one).lineHeight) || 20
    // A short label on two lines, or cut off with no title to read the rest.
    if (one.children.length <= 3 && !label.includes('\n') && r.height > line * 2.2 && r.width < 200) out.push(`label wraps “${label}” (${Math.round(r.width)}x${Math.round(r.height)})`)
    if (one.scrollWidth > one.clientWidth + 2 && getComputedStyle(one).overflow !== 'visible') out.push(`label cut “${label}”`)
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('the page scrolls sideways')
  const words = document.body.innerText
  if (/—/.test(words)) out.push(`an em dash: “${(/.{0,30}—.{0,30}/.exec(words) ?? [''])[0]}”`)
  if (/\bDiscard/.test(words) && !document.querySelector('[data-page=settings]')) out.push('says “Discard”')
  return [...new Set(out)].map((one) => `${where}: ${one}`)
}, where)
const seen = new Set()
const look = async (where, name) => { await shot(name); for (const one of await audit(where)) seen.add(one) }

const read = (root) => h.evaluate((root) => ({
  rows: (document.querySelector(root) ?? document).querySelectorAll('[data-row][data-id]').length,
  toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
}), root)
const PAGES = [['home', 'home'], ['today page', 'day'], ['inbox', 'inbox'], ['inbox sorted too', 'all'], ['pages', 'articles'], ['gems', 'nuggets'], ['tags', 'tags'], ['review', 'review'], ['map', 'map'],
  ['questions', 'questions'], ['goals', 'goals'], ['calendar', 'calendar'], ['today', 'today'], ['upcoming', 'upcoming'], ['bin', 'discarded'], ['archived', 'archived']]
const style = async (name, theme) => {
  await h.evaluate(([s, t]) => { localStorage.setItem('style', s); localStorage.setItem('theme', t) }, [name, theme])
  await h.reload(); await h.waitForTimeout(1800)
}
const firstTag = async () => {
  const listed = await v('tags').catch(() => [])
  return (Array.isArray(listed) ? listed[0]?.tag ?? listed[0]?.name : undefined) ?? (await h.evaluate(() => window.api.captures.list())).flatMap((one) => one.label.match(/#(\w+)/g) ?? [])[0]?.slice(1)
}

// Every page, the tag page, the Graph, the foot menu, Switch book and ⌘K, pictured and audited.
async function walk(t, tag) {
  for (const [name, id] of PAGES) { await go(id); await look(`${t} ${name}`, `${t}-${name}`) }
  if (tag) { await c.send('tag', tag); await h.waitForTimeout(1200); await look(`${t} tag page`, `${t}-tag-page`) }
  await go('inbox')
  const graph = h.locator(`${page('inbox')} button`, { hasText: /^Graph$/ }).first()
  if (await graph.count()) { await graph.click(); await h.waitForTimeout(1200); await look(`${t} graph`, `${t}-graph`); await graph.click() }
  await go('home')
  await h.locator('button[aria-label$=" menu"]').last().click().catch(() => {})
  await h.waitForTimeout(500); await look(`${t} foot menu`, `${t}-foot-menu`)
  await h.locator('[data-peek="switch"]').click().catch(() => {})
  await h.waitForTimeout(700); await look(`${t} switch book`, `${t}-switch-book`)
  await esc(); await esc()
  await h.keyboard.press('Meta+k'); await h.waitForTimeout(500); await look(`${t} ⌘K`, `${t}-cmdk`)
  await h.keyboard.type('bin'); await h.waitForTimeout(400); await look(`${t} ⌘K typed`, `${t}-cmdk-typed`)
  await esc(); await esc()
}

// The rows of a list as drawn, in order, and which are picked.
const ROW = '[data-row][data-id], button[data-pick], div[data-pick]'
const rowsOf = (root) => h.evaluate(([root, ROW]) => [...new Set([...(document.querySelector(root) ?? document).querySelectorAll(ROW)]
  .filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example], .note-pane, [data-beside], [role=dialog]')).map((one) => one.dataset.id ?? one.dataset.pick))], [root, ROW])
const pickedOf = (root) => h.evaluate(([root, ROW]) => [...new Set([...(document.querySelector(root) ?? document).querySelectorAll(ROW)]
  .filter((one) => (one.closest('[data-picked]') ?? (one.hasAttribute('data-picked') ? one : null)) && !one.closest('.note-pane')).map((one) => one.dataset.id ?? one.dataset.pick))], [root, ROW])
const rowAt = (root, id) => h.locator(`${root} [data-row][data-id="${id}"], ${root} [data-pick="${id}"]`).first()
// Where the keys are: the row under the cursor, the note open beside the list, the page.
const where = () => h.evaluate(() => ({
  cursor: (document.querySelector('[data-cursor]:not([data-cursor=false])')?.closest('[data-id], [data-pick]') ?? document.querySelector('[data-cursor]:not([data-cursor=false])'))?.getAttribute('data-id') ?? document.querySelector('[data-cursor]:not([data-cursor=false])')?.getAttribute('data-pick') ?? null,
  open: !!document.querySelector('.note-pane, [role=dialog], [data-editor-page]') || !!document.activeElement?.closest('[contenteditable=true]'),
  page: document.querySelector('[data-page]')?.getAttribute('data-page') ?? '',
  toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
}))
const menuOf = async (root, id) => {
  await rowAt(root, id).click({ button: 'right', position: { x: 30, y: 8 } }).catch(() => {})
  await h.waitForSelector('[role=menu] [role=menuitem]', { timeout: 4000 }).catch(() => {})
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  await esc()
  return lines
}

async function keys(name, id, { root = page(id), open = () => go(id), bin = false } = {}) {
  await open()
  const shown = await rowsOf(root)
  if (shown.length < 3) return check(`${name}: has rows to try`, false, `${shown.length}`)
  const row = []
  // A click, then ↓ and ↑ move the cursor; Enter opens; Esc lets go.
  await rowAt(root, shown[0]).click({ position: { x: 30, y: 8 } }); await h.waitForTimeout(500)
  await h.evaluate(() => document.activeElement?.closest('[contenteditable=true]') && document.activeElement.blur())
  const start = await where()
  await h.keyboard.press('ArrowDown'); await h.waitForTimeout(350)
  const down = await where()
  await h.keyboard.press('ArrowUp'); await h.waitForTimeout(350)
  const up = await where()
  row.push(`↓:${down.cursor !== start.cursor ? 'moves' : 'stays'} ↑:${up.cursor === start.cursor ? 'back' : 'no'}`)
  check(`${name}: ↓ moves the cursor and ↑ brings it back`, down.cursor && down.cursor !== start.cursor && up.cursor === start.cursor, `${start.cursor} → ${down.cursor} → ${up.cursor}`)
  await esc(); await esc()
  await open()
  // ⌘-click two, ⌘C copies their names.
  const list = await rowsOf(root)
  for (const one of [list[0], list[2]]) { await rowAt(root, one).click({ position: { x: 30, y: 8 }, modifiers: ['Meta'] }); await h.waitForTimeout(300) }
  const two = await pickedOf(root)
  await electron.evaluate(({ clipboard }) => clipboard.writeText(''))
  await h.keyboard.press('Meta+c'); await h.waitForTimeout(400)
  const copied = await electron.evaluate(({ clipboard }) => clipboard.readText())
  row.push(`⌘-click:${two.length} ⌘C:${copied.split('\n').filter(Boolean).length} lines`)
  check(`${name}: ⌘-click picks two and ⌘C copies two lines`, two.length === 2 && copied.split('\n').filter(Boolean).length === 2, `${two.length} picked, “${copied.slice(0, 60)}”`)
  // Delete, as Finder: to the Bin with Undo (in the Bin it asks first).
  await h.keyboard.press('Delete'); await h.waitForTimeout(800)
  let now = await where()
  const asked = await h.evaluate(() => document.querySelector('[data-bin-ask]')?.innerText.replace(/\s+/g, ' ') ?? '')
  if (bin) {
    row.push(`Delete:${asked ? 'asks' : 'nothing'}`)
    check(`${name}: Delete asks first`, !!asked, asked)
    await h.locator('[data-bin-ask] button', { hasText: /Keep/ }).first().click().catch(() => {}); await esc()
  } else {
    const gone = !(await rowsOf(root)).includes(list[0])
    row.push(`Delete:${gone ? 'gone' : 'stayed'}`)
    check(`${name}: Delete moves the two to the Bin, said once`, gone && /Bin/.test(now.toast) && now.toast.split(' | ').length === 1, now.toast)
    await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
    check(`${name}: ⌘Z brings them back`, (await rowsOf(root)).includes(list[0]))
    // ⌘⌫ on the row under the cursor (nothing picked).
    await esc()
    await rowAt(root, list[1]).click({ position: { x: 30, y: 8 }, modifiers: ['Meta'] }); await h.waitForTimeout(300)
    await h.keyboard.press('Meta+Backspace'); await h.waitForTimeout(800)
    now = await where()
    const cmdGone = !(await rowsOf(root)).includes(list[1])
    row.push(`⌘⌫:${cmdGone ? 'gone' : 'stayed'}`)
    check(`${name}: ⌘⌫ moves it to the Bin`, cmdGone && /Bin/.test(now.toast), now.toast)
    await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  }
  await esc()
  // ⇧-click from the first row to one further down, across kinds where the list has them.
  await open()
  const again = await rowsOf(root)
  const far = Math.min(again.length - 1, 7)
  await rowAt(root, again[0]).click({ position: { x: 30, y: 8 }, modifiers: ['Meta'] }); await h.waitForTimeout(300)
  await rowAt(root, again[far]).click({ position: { x: 30, y: 8 }, modifiers: ['Shift'] }); await h.waitForTimeout(400)
  const run = await pickedOf(root)
  const kinds = await h.evaluate(([root, ids]) => new Set(ids.map((id) => document.querySelector(`${root} [data-id="${id}"]`)?.closest('[data-island]')?.getAttribute('data-island') ?? '')).size, [root, run])
  row.push(`⇧-click:${run.length} of ${far + 1}${kinds > 1 ? ` across ${kinds} kinds` : ''}`)
  check(`${name}: ⇧-click picks the run between${kinds > 1 ? ', across kinds' : ''}`, run.length === far + 1, `${run.length} of ${far + 1}`)
  await esc(); await esc()
  check(`${name}: Esc lets them go`, !(await pickedOf(root)).length)
  table.push([name, row.join('  ')])
}
const table = []

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.evaluate(() => localStorage.setItem('saber-offered', new Date().toISOString()))
  const tag = await firstTag()
  // The audit sees what it should: a planted label past the edge is reported.
  await h.evaluate(() => { const one = document.createElement('div'); one.id = 'walk-plant'; one.textContent = 'planted past the edge'; one.style.cssText = `position:fixed;top:40px;left:${innerWidth - 20}px;white-space:nowrap`; document.body.append(one) })
  check('the audit reports a label past the edge', (await audit('plant')).some((one) => one.includes('planted past the edge')))
  await h.evaluate(() => document.getElementById('walk-plant')?.remove())

  if (MODE === 'basic') {
    // ⌘A on the lists grouped by kind (a choice in Display; they group by date to start): the whole list, one ⌘A, one ⌫, one ⌘Z.
    await h.evaluate(() => { for (const key of ['view:captures:Inbox', 'view:captures:All captures']) localStorage.setItem(key, JSON.stringify({ sort: 'newest', group: 'kind', filter: {} })) })
    await h.reload(); await h.waitForTimeout(1800)
    for (const [name, id] of [['Inbox', 'inbox'], ['Everything', 'all']]) {
      await go(id)
      const root = page(id)
      const more = await h.evaluate((root) => document.querySelectorAll(`${root} [data-island-more]`).length, root)
      const before = (await read(root)).rows
      // A kind folded: its rows are still the list's.
      await h.locator(`${root} [data-island-head]`).last().click().catch(() => {})
      await h.waitForTimeout(400)
      const total = await h.evaluate((root) => [...document.querySelectorAll(`${root} [data-island-head]`)].reduce((sum, one) => sum + Number(one.dataset.total || 0), 0), root)
      await h.evaluate(() => document.activeElement?.blur?.())
      await h.keyboard.press('Meta+a'); await h.waitForTimeout(450)
      const said = (await read(root)).toast
      const picked = Number((/(\d[\d,]*) selected/.exec(said) ?? [])[1]?.replace(/,/g, '') ?? 0)
      check(`${name}: one ⌘A picks all ${total}, past “Show N more” (${more} islands cut) and a folded kind`, more > 0 && picked === total, `${before} rows drawn, ${picked} picked; “${said}”`)
      await shot(`${name.toLowerCase()}-all-picked`)
      await h.keyboard.press('Backspace'); await h.waitForTimeout(1200)
      const left = await h.evaluate((root) => document.querySelectorAll(`${root} [data-island-head]`).length, root)
      check(`${name}: one ⌫ after it empties the list`, left === 0, `${left} kinds left`)
      await shot(`${name.toLowerCase()}-emptied`)
      await h.keyboard.press('Meta+z'); await h.waitForTimeout(1500)
      check(`${name}: ⌘Z brings every one back`, (await h.evaluate((root) => [...document.querySelectorAll(`${root} [data-island-head]`)].reduce((sum, one) => sum + Number(one.dataset.total || 0), 0), root)) === total)
      await h.locator(`${root} [data-island-head][aria-expanded=false]`).first().click().catch(() => {})
      await esc()
    }
    for (const [theme, label, w, hh] of [['light', 'large', 1600, 1000], ['dark', 'small', 900, 700]]) {
      await c.theme(theme)
      await size(w, hh)
      const t = `${label}-${theme}`
      for (const [name, id] of PAGES) {
        await go(id); await look(`${t} ${name}`, `${t}-${name}`)
        // On a dark page a row with no picture shows its kind's icon in the page's muted ink, never dark on dark.
        if (theme === 'dark' && ['questions', 'writing'].includes(name)) {
          const ink = await h.evaluate((id) => {
            const lead = document.querySelector(`[data-page="${id}"] [data-lead-paper]`)
            const probe = document.createElement('span'); probe.style.color = 'var(--muted-foreground)'; document.body.append(probe)
            const want = getComputedStyle(probe).color; probe.remove()
            return lead ? { got: getComputedStyle(lead.querySelector('svg')).color, want } : null
          }, id)
          check(`${name}, dark: a row's icon with no picture reads in muted ink`, !ink || ink.got === ink.want, JSON.stringify(ink))
        }
      }
    }
  }

  if (MODE === 'looks') {
    for (const name of ['soft', 'brutal', 'paper']) {
      for (const [theme, w, hh] of [['github', 900, 700], ['paper', 1600, 1000]]) {
        await style(name, theme)
        await size(w, hh)
        await walk(`${name}-${theme}-${w}`, tag)
      }
    }
  }

  if (MODE === 'keys') {
    await size(1400, 900)
    for (let i = 1; i <= 6; i++) await v('task:add', `Walk keys ${i} in ${i + 3} days`).catch(() => {})
    // Something archived, for Archived.
    const toArchive = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open').slice(-4)
    for (const one of toArchive) await h.evaluate((id) => window.api.haligtree('notes:archive', 'captures', [id], true), one.id).catch(() => {})
    for (const [name, id] of [['Inbox', 'inbox'], ['Everything', 'all'], ['Archived', 'archived'], ['Gems', 'nuggets'], ['Pages', 'articles'], ['Questions', 'questions'], ['Goals', 'goals'], ['Tasks', 'today'], ['Upcoming', 'upcoming']])
      await keys(name, id).catch((e) => check(`${name}: ran`, false, e.message.split('\n')[0]))
    // The Bin needs a few things in it.
    const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open').slice(0, 4)
    for (const one of caps) await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), one.id)
    await keys('Bin', 'discarded', { bin: true }).catch((e) => check('Bin: ran', false, e.message.split('\n')[0]))
    await keys(`Tag #${tag}`, 'tags', { root: '[data-tag-stream]', open: async () => { await c.send('tag', tag); await h.waitForTimeout(1200) } }).catch((e) => check('Tag page: ran', false, e.message.split('\n')[0]))
    // One capture's right-click menu, the same in the Inbox, Everything and its tag page.
    const one = (await h.evaluate(() => window.api.captures.list())).find((cap) => cap.status === 'open' && /#[\w-]+/.test(cap.label))
    if (one) {
      const tagOf = /#([\w-]+)/.exec(one.label)[1]
      await go('inbox'); const inInbox = await menuOf(page('inbox'), one.id)
      await go('all'); const inAll = await menuOf(page('all'), one.id)
      await c.send('tag', tagOf); await h.waitForTimeout(1200); const inTag = await menuOf('[data-tag-stream]', `capture:${one.id}`)
      const plain = (lines) => lines.filter((line) => !/^(Select|Unselect|Select all|Read from here)/.test(line)).join(' / ')
      console.log(`NOTE menu Inbox: ${plain(inInbox)}\nNOTE menu Everything: ${plain(inAll)}\nNOTE menu Tag: ${plain(inTag)}`)
      check('a capture\'s right-click menu is the same in the Inbox and Everything', plain(inInbox) === plain(inAll))
      check('…and on its tag page', plain(inTag) === plain(inInbox))
    }
    // "Start here", pinned: its menu on Home's cards and in Pinned is the one it has in the Inbox.
    const start = (await h.evaluate(() => window.api.captures.list())).find((cap) => cap.label.startsWith('Start here'))
    if (start) {
      await go('inbox'); const inInbox = (await menuOf(page('inbox'), start.id)).join(' / ')
      await go('home')
      await h.locator(`${page('home')} :text-is("Start here")`).first().click({ button: 'right' }).catch(() => {})
      await h.waitForSelector('[role=menu] [role=menuitem]', { timeout: 4000 }).catch(() => {})
      const onHome = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter((line) => !/^(Select|Unselect|Select all)/.test(line)).join(' / '))
      await esc()
      await h.locator('aside :text-is("Start here")').first().click({ button: 'right' }).catch(() => {})
      await h.waitForSelector('[role=menu] [role=menuitem]', { timeout: 4000 }).catch(() => {})
      const inPinned = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).join(' / '))
      await esc()
      const bare = (line) => line.split(' / ').filter((one) => !/^(Select|Unselect|Select all)/.test(one)).join(' / ')
      check('a pinned capture\'s menu on Home is the one it has in the Inbox', bare(onHome) === bare(inInbox), onHome)
      check('…and in the sidebar\'s Pinned', bare(inPinned) === bare(inInbox), inPinned)
    }
    // Esc and the back button leave what was just opened.
    for (const id of ['inbox', 'nuggets', 'articles', 'questions', 'goals']) {
      await go('home'); await go(id)
      const list = await rowsOf(page(id))
      if (!list.length) continue
      await rowAt(page(id), list[0]).dblclick({ position: { x: 30, y: 8 } }).catch(() => {})
      await h.waitForTimeout(900)
      const opened = await where()
      await h.evaluate(() => document.activeElement?.blur?.())
      await h.keyboard.press('Escape'); await h.waitForTimeout(500)
      const after = await where()
      await h.locator('button[aria-label="Back"], button[aria-label^="Back"]').first().click().catch(() => {})
      await h.waitForTimeout(800)
      const back = await where()
      console.log(`NOTE ${id}: opened ${JSON.stringify(opened)} esc ${JSON.stringify(after)} back ${JSON.stringify(back)}`)
    }
    for (const [name, row] of table) console.log(`${name} | ${row}`)
  }

  if (MODE === 'edges') {
    await size(1400, 900)
    const long = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4)
    const ids = {}
    const doc = (text, extra = []) => ({ type: 'doc', content: [...(text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : []), ...extra] })
    ids.long = await h.evaluate((b) => window.api.captures.create({ body: b }), doc(`A very long title that goes on and on, about everything and nothing at all, until the row has no room left for it whatever the width ${long} #${tag}`))
    ids.emoji = await h.evaluate((b) => window.api.captures.create({ body: b }), doc('🌋'))
    ids.none = await h.evaluate((b) => window.api.captures.create({ body: b }), doc(''))
    ids.broken = await h.evaluate((b) => window.api.captures.create({ body: b }), doc('A picture whose file is gone', [{ type: 'image', attrs: { src: 'file:///nowhere/at/all.png' } }]))
    const art = await v('article:new')
    await v('item:save', art, { title: `Writing with a title that will not fit ${long}` }).catch(() => {})
    await v('task:add', `🌋 ${long} today`).catch(() => {})
    await v('question:new', `Why ${long}?`).catch(() => {})
    await h.waitForTimeout(800)
    for (const [name, id] of [['inbox', 'inbox'], ['inbox sorted too', 'all'], ['pages', 'articles'], ['questions', 'questions'], ['tasks', 'today'], ['today page', 'day'], ['home', 'home']]) { await go(id); await look(`long ${name}`, `long-${name}`) }
    await c.send('tag', tag); await h.waitForTimeout(1200); await look('long tag page', 'long-tag-page')
    // Opened: the untitled, the emoji and the broken picture.
    for (const which of ['none', 'emoji', 'broken']) { await c.send('capture', ids[which]); await h.waitForTimeout(1200); await look(`open ${which}`, `open-${which}`); await esc() }
    // Opened from Everything, grouped by kind: its "N / M" counts the whole list, as the header does.
    await c.send('capture', ids.none); await h.waitForTimeout(1200)
    const steps = await h.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, ''); return { step: (/(\d+)\/(\d+)(?!\d)/.exec(t) ?? [])[2], items: (/([\d,]+)items/.exec(t) ?? [])[1]?.replace(/,/g, '') } })
    check('a note opened from Everything steps through the whole list', steps.step && steps.step === steps.items, JSON.stringify(steps))
    await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), ids.long)
    await go('discarded'); await look('long bin', 'long-bin')
    // Hundreds.
    for (let i = 1; i <= 300; i++) await h.evaluate((n) => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Batch note ${n}` }] }] } }), i)
    await h.waitForTimeout(1000)
    const t0 = Date.now(); await go('inbox'); const took = Date.now() - t0
    await look('hundreds inbox', 'hundreds-inbox')
    const drawn = (await read(page('inbox'))).rows
    check('hundreds: the Inbox draws a few a kind, not all of them', drawn < 100, `${drawn} rows drawn in ${took}ms`)
    await go('all'); await look('hundreds everything', 'hundreds-everything')
    // Offline: pictures from the web fail, the pages still read.
    await electron.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }))
    for (const [name, id] of [['home', 'home'], ['today page', 'day'], ['inbox', 'inbox'], ['gems', 'nuggets'], ['map', 'map']]) { await go(id); await look(`offline ${name}`, `offline-${name}`) }
    await electron.evaluate(({ session }) => session.defaultSession.disableNetworkEmulation())
    // The smallest window.
    const min = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.getMinimumSize())
    await size(min?.[0] ?? 560, min?.[1] ?? 400)
    for (const [name, id] of PAGES) { await go(id); await look(`smallest ${name}`, `smallest-${name}`) }
    await h.keyboard.press('Meta+k'); await h.waitForTimeout(500); await look('smallest ⌘K', 'smallest-cmdk'); await esc()
    // Reduced motion, then Motion off: the lists still open, pick and fold.
    await size(1400, 900)
    await h.emulateMedia({ reducedMotion: 'reduce' })
    for (const motion of [true, false]) {
      await v('settings:set', { motion })
      await go('inbox')
      const head = h.locator(`${page('inbox')} [data-island-head]`).first()
      await head.click(); await h.waitForTimeout(300)
      const folded = await head.getAttribute('aria-expanded')
      await head.click(); await h.waitForTimeout(300)
      await h.evaluate(() => document.activeElement?.blur?.())
      await h.keyboard.press('Meta+a'); await h.waitForTimeout(300)
      const said = (await read(page('inbox'))).toast
      check(`reduced motion${motion ? '' : ', Motion off'}: a kind folds and ⌘A picks`, folded === 'false' && /selected/.test(said), `${folded}; “${said}”`)
      await esc()
      await look(`motion ${motion ? 'reduced' : 'off'}`, `motion-${motion ? 'reduced' : 'off'}`)
    }
    await v('settings:set', { motion: true })
  }

  if (MODE === 'empty') {
    // A new book opens on the welcome: skipped, as a person who has seen it would.
    await h.locator('button', { hasText: /^Skip the welcome$/ }).first().click({ timeout: 5000 }).catch(() => {})
    await h.waitForTimeout(1200)
    // Skipping goes to the welcome's last page; "Start without the tour" there closes it.
    await h.getByRole('button', { name: /Start without the tour|Skip the tips/ }).first().click({ timeout: 5000 }).catch(() => {})
    await h.waitForTimeout(1200)
    for (const [name, id] of PAGES) { await go(id); await look(`empty ${name}`, `empty-${name}`) }
    await h.keyboard.press('Meta+k'); await h.waitForTimeout(500); await look('empty ⌘K', 'empty-cmdk'); await esc()
    // One note, one task.
    await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The only note #first' }] }] } }))
    await v('task:add', 'The only task today').catch(() => {})
    await h.waitForTimeout(800)
    for (const [name, id] of PAGES) { await go(id); await look(`one ${name}`, `one-${name}`) }
    await c.send('tag', 'first'); await h.waitForTimeout(1200); await look('one tag page', 'one-tag-page')
  }
  for (const one of seen) console.log('EDGE ', one)
} catch (e) {
  console.log('ERROR', e.message)
  results.push(false)
} finally {
  for (const one of c.errors.slice(0, 10)) console.log('ERR', one)
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
