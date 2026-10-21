// The three styles (Soft, Brutal, Paper), each worn in turn from the
// style picker in Settings: the root says which is on, the corners, shadows
// and fonts change as each promises, its own sound is heard, and on Home, a
// note, Today, the Calendar and Settings nothing spills past the window.
// SHOTS=<dir> also saves Home, a note, Today, the Calendar, quick capture, a
// sticky, the session bubble and Settings in Paper, on the Paper
// theme and GitHub Dark, at 1300x900.
//   npx electron-vite build --outDir out-styles
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-styles/main/index.js MINDFLOW_QA_AWAY=1 [SHOTS=<dir>] node qa/styles.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1300, height: 900 })
const { electron, h, v, go, send } = c

/** What a page looks like, measured: the root's style, a card's corner, the shadows on show, the fonts, and anything past the window's edges. */
const measure = (page) => page.evaluate(() => {
  const seen = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0' }
  const card = [...document.querySelectorAll('[class*="rounded-"][class*="bg-foreground/"]:not(button), .mf-island')].find((el) => seen(el) && !el.closest('[data-keep-soft]') && el.getBoundingClientRect().height > 24)
  // A shadow that is depth (offset or blurred), not a ring or an inner line.
  const depth = (shadow) => shadow !== 'none' && shadow.split(/,(?![^(]*\))/).some((one) => {
    if (/inset/.test(one)) return false
    const n = (one.replace(/(rgba?|oklab|oklch|color-mix|color)\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
    if (/rgba?\([^)]*,\s*0\)|transparent/.test(one)) return false
    return (n[0] ?? 0) !== 0 || (n[1] ?? 0) !== 0 || (n[2] ?? 0) > 0
  })
  let hard = 0, soft = 0
  const softAt = []
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el) || el.closest('[data-keep-soft], .mf-style-pick')) continue
    const s = getComputedStyle(el).boxShadow
    if (!depth(s)) continue
    const blurred = s.split(/,(?![^(]*\))/).some((one) => !/inset/.test(one) && parseFloat((one.replace(/(rgba?|oklab|oklch|color-mix|color)\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [])[2] ?? '0') > 0)
    if (blurred) { soft++; softAt.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/).slice(0, 5).join('.')} [${s.slice(0, 400)}]`) } else hard++
  }
  // Past the window: what is seen of an element, cut by every ancestor that clips, still outside.
  const spill = []
  const W = innerWidth, H = innerHeight
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el)) continue
    let { left, right, top, bottom } = el.getBoundingClientRect()
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      const s = getComputedStyle(up)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.contain.includes('paint')) {
        const r = up.getBoundingClientRect()
        if (s.overflowX !== 'visible') { left = Math.max(left, r.left); right = Math.min(right, r.right) }
        if (s.overflowY !== 'visible') { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom) }
      }
      if (s.position === 'fixed') break
    }
    if (right - left <= 0 || bottom - top <= 0) continue
    if (right > W + 1 || left < -1) spill.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/).slice(0, 4).join('.')} ${Math.round(left)}..${Math.round(right)}`)
  }
  const heading = [...document.querySelectorAll('h1, .tiptap.ProseMirror h1, h2')].find(seen)
  return {
    style: document.documentElement.dataset.style ?? 'soft',
    radius: card ? getComputedStyle(card).borderTopLeftRadius : null,
    hard, soft, softAt: softAt.slice(0, 4),
    heading: heading ? getComputedStyle(heading).fontFamily : null,
    body: getComputedStyle(document.body).fontFamily,
    spill: [...new Set(spill)].slice(0, 6),
    scrolls: document.documentElement.scrollWidth > W + 1
  }
})

const FONT = { soft: null, brutal: /Archivo Black/, paper: /Fraunces/ }
const pages = { home: () => go('home'), today: () => go('today'), calendar: () => go('calendar'), settings: async () => { await go('settings'); await wait(500); await h.evaluate(() => document.querySelector('.mf-style-pick')?.scrollIntoView({ block: 'center' })) } }
// More pages, measured in Paper too (and pictured as well): the newer ones included.
const more = Object.fromEntries(['inbox', 'review', 'goals', 'week', 'day', 'tags', 'stats', 'map', 'practices', 'sources'].map((id) => [id, () => go(id)]))
// Writing, a group of its own (group panels and subgroups), opened from the sidebar.
more.writing = async () => { await go('home'); await h.getByText('Writing', { exact: true }).first().click(); await wait(900) }

try {
  await v('settings:set', { sounds: true })
  // A note to open.
  const noteId = await h.evaluate(() => window.api.captures.create({ title: 'The lighthouse road', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'The lighthouse road' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Ideas for the trip: the coast road, the old lighthouse, and the bakery by the harbour that opens at six.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Packing' }] },
    { type: 'taskList', content: ['Boots', 'Rain coat', 'Map'].map((text, i) => ({ type: 'taskItem', attrs: { checked: i === 0 }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) }
  ] } }))
  pages.note = () => send('capture', noteId).then(() => wait(1200))

  // --- Three to pick from.
  await go('settings')
  const offered = await h.$$eval('.mf-style-pick [role=radio]', (all) => all.map((one) => one.textContent.trim()))
  check('the picker offers Soft, Brutal and Paper', JSON.stringify(offered) === JSON.stringify(['Soft', 'Brutal', 'Paper']), offered.join(', '))

  // --- Each style chosen from the picker, as a person would.
  for (const style of ['brutal', 'paper', 'soft']) {
    await go('settings')
    await h.evaluate(() => { if (window.vigilHeard) window.vigilHeard.length = 0 })
    const picker = h.locator(`.mf-style-${style}`).first()
    await picker.scrollIntoViewIfNeeded()
    await picker.click()
    await wait(700)
    const sound = { soft: 'tick', brutal: 'slam', paper: 'leaf' }[style]
    const heard = await h.evaluate(() => [...(window.vigilHeard ?? [])])
    check(`${style}: choosing it plays its own sound`, heard.includes(`click:${sound}`), heard.join(', '))
    check(`${style}: picker shows it chosen`, (await picker.getAttribute('aria-checked')) === 'true')
    for (const [name, open] of Object.entries(style === 'paper' ? { ...pages, ...more } : pages)) {
      await open()
      await wait(500)
      const m = await measure(h)
      check(`${style} ${name}: the root wears it`, m.style === style, m.style)
      if (m.radius !== null) check(`${style} ${name}: a card's corner`, style === 'soft' ? m.radius !== '0px' : m.radius === '0px', m.radius)
      if (style === 'paper') check(`${style} ${name}: no shadows`, m.hard + m.soft === 0, `${m.hard} hard, ${m.soft} soft ${m.softAt.join(' | ')}`)
      if (style === 'brutal') check(`${style} ${name}: shadows are hard`, m.soft === 0 && m.hard > 0, `${m.hard} hard, ${m.soft} soft ${m.softAt.join(' | ')}`)
      if (FONT[style] && m.heading) check(`${style} ${name}: heading font`, FONT[style].test(m.heading), m.heading.slice(0, 60))
      check(`${style} ${name}: nothing past the window`, !m.spill.length && !m.scrolls, m.spill.join(' | '))
    }
  }

  // --- Pictures: every screen in Paper, light and dark.
  if (SHOTS) {
    await h.evaluate((id) => window.api.stick('capture', id, true), noteId)
    await v('session:start', (await v('tasks')).find((one) => one.status === 'open' && one.title)?.id ?? null, 'Write the brief', 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    await wait(2500)
    const win = (part) => electron.windows().find((one) => one.url().includes(part))
    for (const style of ['paper']) for (const theme of ['paper', 'github']) {
      await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
      await h.reload(); await wait(1800)
      for (const other of electron.windows().filter((one) => one !== h)) await other.reload().catch(() => {})
      await wait(1500)
      const tag = `${style}-${theme === 'github' ? 'dark' : 'paper'}`
      for (const [name, open] of Object.entries({ ...pages, ...more })) { await open(); await wait(700); await h.screenshot({ path: `${SHOTS}/${tag}-${name}.png` }) }
      await win('view=sticky')?.screenshot({ path: `${SHOTS}/${tag}-sticky.png` }).catch((e) => console.log('sticky', e.message))
      await win('view=focus')?.screenshot({ path: `${SHOTS}/${tag}-bubble.png` }).catch((e) => console.log('bubble', e.message))
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
      await c.page.waitForTimeout(700)
      await c.page.keyboard.type('Ring the plumber about the boiler #home', { delay: 5 }).catch(() => {})
      await c.page.waitForTimeout(500)
      await c.page.screenshot({ path: `${SHOTS}/${tag}-capture.png` })
      await c.page.keyboard.press('Meta+a').catch(() => {}); await c.page.keyboard.press('Backspace').catch(() => {})
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
    }
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
