// A walk through the main pages and lists as a person meets them, a picture of
// each: Home, Inbox, Everything, Writing, Gems, a tag page, Tags, Review, Map,
// the Inbox's Graph, Questions, Goals, Calendar, Today, Upcoming, the Bin,
// Archived, the sidebar's foot menu, ⌘K and Switch book; large and light, then
// small and dark. On the lists grouped by kind it checks one ⌘A picks every row
// (those behind "Show N more" and in a folded kind too) and ⌘Z brings back what
// one ⌫ took. Also lists text cut off or running past the page's edge.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/walk-pages.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/tmp/walk-pages'
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, size } = c
const shot = async (name) => { await h.waitForTimeout(500); await h.screenshot({ path: `${SHOTS}/${name}.png` }).catch((e) => console.log('no shot', name, e.message)) }
const esc = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
// Words past the right edge of the window, or a label cut short with no room given.
const overflow = (where) => h.evaluate((where) => {
  const out = []
  for (const one of document.querySelectorAll('[data-page] *')) {
    const r = one.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    if (one.children.length === 0 && one.textContent.trim() && r.right > innerWidth + 1) out.push(`${where}: past the edge “${one.textContent.trim().slice(0, 40)}”`)
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`${where}: the page scrolls sideways`)
  return out
}, where)
const read = (root) => h.evaluate((root) => ({
  rows: (document.querySelector(root) ?? document).querySelectorAll('[data-row][data-id]').length,
  toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
}), root)
const PAGES = [['home', 'home'], ['inbox', 'inbox'], ['everything', 'all'], ['writing', 'articles'], ['gems', 'nuggets'], ['tags', 'tags'], ['review', 'review'], ['map', 'map'],
  ['questions', 'questions'], ['goals', 'goals'], ['calendar', 'calendar'], ['today', 'today'], ['upcoming', 'upcoming'], ['bin', 'discarded'], ['archived', 'archived']]
const seen = new Set()
try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const listed = await v('tags').catch(() => [])
  const tag = (Array.isArray(listed) ? listed[0]?.tag ?? listed[0]?.name ?? listed[0] : undefined) ?? (await h.evaluate(() => window.api.captures.list())).flatMap((one) => one.label.match(/#(\w+)/g) ?? [])[0]?.slice(1)

  // ⌘A on the lists grouped by kind: the whole list, one ⌘A, one ⌫, one ⌘Z.
  for (const [name, id] of [['Inbox', 'inbox'], ['Everything', 'all']]) {
    await go(id)
    const root = `[data-page="${id}"]`
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
      await go(id); await shot(`${t}-${name}`)
      for (const one of await overflow(`${t} ${name}`)) seen.add(one)
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
    // A tag page.
    await c.send('tag', tag); await h.waitForTimeout(1200); await shot(`${t}-tag-page`)
    for (const one of await overflow(`${t} tag page`)) seen.add(one)
    // The Inbox's Graph.
    await go('inbox')
    await h.locator('[data-page="inbox"] button', { hasText: /^Graph$/ }).first().click().catch(() => {})
    await h.waitForTimeout(1200); await shot(`${t}-graph`)
    await h.locator('[data-page="inbox"] button', { hasText: /^Graph$/ }).first().click().catch(() => {})
    // The sidebar's foot menu, ⌘K, Switch book.
    await go('home')
    await h.locator('button[aria-label$=" menu"]').last().click().catch(() => {})
    await h.waitForTimeout(500); await shot(`${t}-foot-menu`)
    await h.locator('[data-peek="switch"]').click().catch(() => {})
    await h.waitForTimeout(700); await shot(`${t}-switch-book`)
    await esc(); await esc()
    await h.keyboard.press('Meta+k'); await shot(`${t}-cmdk`)
    await h.keyboard.type('bin'); await shot(`${t}-cmdk-typed`)
    await esc(); await esc()
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
