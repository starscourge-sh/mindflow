// Blocking websites in a focus session, with the browser stubbed (no real
// browser is ever spoken to in a test run): Settings' “Block” field adds a
// typed site as a chip, removes one with × or two Backspaces, puts it back
// with ⌘Z, adds “Social media” in one click and opens it to its sites. While
// a round runs, a blocked address in the browser in front is sent away and
// Haligtree's notice says until when, with “Allow 5 min”; never on a break, a
// pause, a plain timer, another app, or with the switch off. A browser the
// Mac refused is said in Settings with the way to its Privacy pane. The
// session keeps how often each site was sent away, said on the day's page.
//
//   npx electron-vite build --outDir out-siteblock
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-siteblock/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/site-block.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

// Each window keeps the place it was given while really parked, so where the notice sits can be checked.
process.env.HALIGTREE_QA_VIRTUAL = '1'
const SHOT = process.env.SHOT ?? 'scratchpad/site-block'
mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 860 })
const { electron, h, v } = c
const list = async () => (await v('settings')).blockSites ?? []
const fake = (one) => electron.evaluate((_, f) => void (globalThis.siteBlockFake = f), one)
const sentAway = () => electron.evaluate(() => (globalThis.siteBlockAway ?? []).map((one) => one.url))
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const theme = async (win, name) => {
  await h.evaluate((t) => localStorage.setItem('theme', t), name)
  for (const one of [h, win]) await one.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
  await win.waitForTimeout(500)
}
const field = '[data-site-input]'
const tipText = () => h.evaluate(() => [...document.querySelectorAll('[role=tooltip], [data-slot=tooltip-content]')].map((one) => one.textContent).join(' | '))
const picked = () => h.$$eval('[data-site-chip][data-picked]', (all) => all.map((one) => one.dataset.siteChip))
const typeIn = async (text) => { await h.click(field); await h.keyboard.type(text); await h.waitForTimeout(250) }

try {
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', blockSites: [], focusTools: true, siteBlock: true, quietStart: '03:00', quietEnd: '03:01' })
  await c.go('settings')
  await h.click('[data-section="Tasks"]')
  await h.waitForTimeout(600)
  check('Settings, Tasks has the “Block” field', !!(await h.$(field)))

  // --- The words around it.
  const row = (title) => h.$eval(`[data-setting-title="${title}"]`, (one) => ({ text: one.textContent, off: one.querySelector('[data-setting-off]')?.textContent ?? '', more: one.querySelector('[data-setting-more]')?.getAttribute('aria-label') ?? '' })).catch(() => ({ text: '', off: '', more: '' }))
  const blockRow = await row('Block websites in focus sessions')
  check('the note says sites open again on breaks, not “Breaks are free.”', /open again/i.test(blockRow.text) && !blockRow.text.includes('free'), blockRow.text)
  check('with nothing blocked, the strong line says to add a site (no Firefox there)', blockRow.off === 'Add a site below to start.', blockRow.off)
  await h.hover('[data-setting-title="Block websites in focus sessions"] [data-setting-more]')
  await h.waitForTimeout(900)
  check('Firefox is said in the “?” instead', (await tipText()).includes('Not in Firefox'), await tipText())
  await h.mouse.move(5, 5)
  await h.waitForTimeout(300)

  // --- “Social media” in sight before clicking in.
  check('while nothing is blocked, “Block “Social media”” shows under the field without clicking in', await h.isVisible('[data-site-starter="@social"]'))
  await theme(h, 'paper')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/empty-paper.png` })
  await theme(h, 'dark')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/empty-dark.png` })

  // --- Part of a name lights the known site that starts so, never a made-up one.
  const firstFor = async (word) => {
    await h.fill(field, '')
    await typeIn(word)
    const lit = await h.$eval('[data-site-offer][aria-selected="true"]', (one) => one.dataset.siteOffer).catch(() => '')
    const all = await h.$$eval('[data-site-offer]', (list) => list.map((one) => one.dataset.siteOffer))
    return { lit, first: all[0], all }
  }
  for (const [word, site] of [['you', 'youtube.com'], ['insta', 'instagram.com'], ['face', 'facebook.com'], ['red', 'reddit.com'], ['tik', 'tiktok.com'], ['thr', 'threads.net'], ['link', 'linkedin.com'], ['x', 'x.com'], ['twi', 'twitter.com'], ['net', 'netflix.com'], ['spot', 'spotify.com'], ['amaz', 'amazon.com'], ['whats', 'web.whatsapp.com']]) {
    const got = await firstFor(word)
    check(`typing “${word}” lights ${site} first`, got.first === site && got.lit === site, `lit ${got.lit}: ${got.all.join(' | ')}`)
  }
  const own = await firstFor('you')
  check('and still offers “Block website: you.com” after it', own.all[1] === 'you.com', own.all.join(' | '))
  const plain = await firstFor('wikipedia')
  check('a name Haligtree does not know is offered as typed: wikipedia.com', plain.first === 'wikipedia.com', plain.all.join(' | '))
  await firstFor('you')
  await theme(h, 'paper')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/typing-paper.png` })
  await h.fill(field, '')
  await typeIn('link.com')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(400)
  check('Return adds it as a chip', JSON.stringify(await list()) === '["link.com"]' && !!(await h.$('[data-site-chip="link.com"]')))
  check('with a letter tile in place of a picture (no fetching in tests)', !!(await h.$('[data-site-chip="link.com"] [data-site-icon="letter"]')))
  await typeIn('https://www.YouTube.com/watch?v=1')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(400)
  check('a pasted address becomes its site: youtube.com', JSON.stringify(await list()) === '["link.com","youtube.com"]', JSON.stringify(await list()))
  await typeIn('not a site')
  check('words that are not a site say so', ((await h.$eval('[data-site-why]', (one) => one.textContent).catch(() => '')) || '').includes('is not a website'))
  await h.fill(field, '')

  // --- × and ⌘Z.
  await h.evaluate(() => { window.__toasts = []; addEventListener('haligtree:toast', (event) => window.__toasts.push(event.detail.text)) })
  await h.click('[data-site-chip="link.com"] [data-site-remove]')
  await h.waitForTimeout(400)
  check('× takes a chip off', JSON.stringify(await list()) === '["youtube.com"]')
  check('saying so with an undo', (await h.evaluate(() => window.__toasts ?? [])).some((one) => String(one).includes('no longer blocked')), JSON.stringify(await h.evaluate(() => window.__toasts ?? [])))
  await h.click(field)
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(400)
  check('⌘Z in the field puts it back', JSON.stringify(await list()) === '["link.com","youtube.com"]', JSON.stringify(await list()))

  // --- Backspace twice.
  await h.click(field)
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(200)
  check('Backspace on an empty line picks the last chip', !!(await h.$('[data-site-chip="youtube.com"][data-picked]')) && (await list()).length === 2)
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(400)
  check('a second Backspace takes it off', JSON.stringify(await list()) === '["link.com"]')
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(400)
  check('⌘Z puts that one back too', JSON.stringify(await list()) === '["link.com","youtube.com"]')

  // --- The usual list keys on the chips.
  await h.click(field)
  await h.keyboard.press('ArrowLeft')
  await h.waitForTimeout(150)
  check('← on an empty line picks the last chip', JSON.stringify(await picked()) === '["youtube.com"]', JSON.stringify(await picked()))
  await h.keyboard.press('ArrowLeft')
  await h.waitForTimeout(150)
  check('← again moves to the one before', JSON.stringify(await picked()) === '["link.com"]', JSON.stringify(await picked()))
  await h.keyboard.press('ArrowRight')
  await h.keyboard.press('ArrowRight')
  await h.waitForTimeout(150)
  check('→ past the last comes back to the line', (await picked()).length === 0, JSON.stringify(await picked()))
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(150)
  check('⌘A on an empty line picks them all', (await picked()).length === 2, JSON.stringify(await picked()))
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(400)
  check('Backspace takes off what is picked', (await list()).length === 0, JSON.stringify(await list()))
  check('saying how many', (await h.evaluate(() => window.__toasts ?? [])).some((one) => String(one).includes('2 are no longer blocked')), JSON.stringify(await h.evaluate(() => window.__toasts ?? [])))
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(400)
  check('⌘Z puts them both back', JSON.stringify(await list()) === '["link.com","youtube.com"]', JSON.stringify(await list()))
  await h.click('[data-site-chip="link.com"] > span:not([data-site-icon])')
  await h.waitForTimeout(200)
  check('a click on a chip picks it', JSON.stringify(await picked()) === '["link.com"]', JSON.stringify(await picked()))
  await h.click('[data-site-chip="youtube.com"] > span:not([data-site-icon])', { modifiers: ['Shift'] })
  await h.waitForTimeout(200)
  check('⇧-click adds one', (await picked()).length === 2, JSON.stringify(await picked()))
  await h.click('[data-site-chip="link.com"] > span:not([data-site-icon])', { button: 'right' })
  await h.waitForTimeout(500)
  const pairLines = await h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent))
  check('right-click on a picked pair offers “Stop blocking these 2”', pairLines.some((one) => one.includes('Stop blocking these 2')), pairLines.join(' | '))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.click(field)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  const ring = await h.$eval('[data-site-chip="link.com"] [data-site-remove]', (one) => getComputedStyle(one).borderRadius)
  check('the × has rounded corners, so its focus ring follows the chip', parseFloat(ring) >= 5, ring)

  // --- Right-click.
  await h.click('[data-site-chip="link.com"] span:not([data-site-icon])', { button: 'right' })
  await h.waitForTimeout(500)
  const lines = await h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent))
  check('right-click on a chip offers “Copy site” and “Stop blocking”', lines.some((one) => one.includes('Copy site')) && lines.some((one) => one.includes('Stop blocking “link.com”')), lines.join(' | '))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // --- Social media.
  await h.click(field)
  await h.waitForTimeout(300)
  const social = await h.$('[data-site-offer="@social"]')
  check('an empty line offers “Block Social media”', !!social)
  await social?.click()
  await h.waitForTimeout(400)
  check('one click adds it as one chip, with youtube.com folded into it', JSON.stringify(await list()) === '["link.com","@social"]', JSON.stringify(await list()))
  check('the chip says it is on, and 8', ((await h.$eval('[data-site-chip="@social"]', (one) => one.textContent).catch(() => '')) || '').includes('Blocking: Social media(8)'))
  await h.click('[data-site-open]')
  await h.waitForTimeout(500)
  const members = await h.$$eval('[data-site-member]', (all) => all.map((one) => one.dataset.siteMember))
  check('it opens to its eight sites', members.length === 8 && members.includes('threads.net'), members.join(' '))
  await h.click('[data-site-member="reddit.com"]')
  await h.waitForTimeout(300)
  check('clicking one lets it through', (await list()).includes('-reddit.com'))
  check('and the chip says 7 of 8', ((await h.$eval('[data-site-chip="@social"]', (one) => one.textContent).catch(() => '')) || '').includes('7 of 8'))
  const through = await h.$eval('[data-site-member="reddit.com"]', (one) => ({ text: one.textContent, struck: [one, ...one.querySelectorAll('*')].some((el) => getComputedStyle(el).textDecorationLine.includes('line-through')) }))
  check('a site let through is never struck out', !through.struck)
  check('it says “allowed” after its name', through.text.trim().endsWith('allowed'), through.text)
  await h.mouse.move(5, 5)
  await theme(h, 'paper')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/settings-paper.png` })
  await theme(h, 'dark')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/settings-dark.png` })
  await h.click('[data-site-member="reddit.com"]')
  await h.waitForTimeout(300)
  check('and again blocks it', !(await list()).includes('-reddit.com'))
  // Settled, with the field let go: the × of the collection's chip says its name in quotes.
  await h.click('[data-site-open]')
  await h.mouse.move(5, 5)
  await h.waitForTimeout(800)
  await h.hover('[data-site-chip="@social"] [data-site-remove]')
  await h.waitForTimeout(1400)
  check('its × says “Stop blocking “Social media”” with the quotes', (await tipText()).includes('Stop blocking “Social media”'), `tip: ${await tipText()}`)
  await h.mouse.move(5, 5)
  await h.waitForTimeout(300)

  // --- A round running.
  const made = await v('task:add', 'Write the essay plan')
  const task = made?.id ?? made
  const session = await v('session:start', task, 'Write the essay plan', 25 * 60_000)
  await fake({ app: 'com.google.Chrome', url: 'https://www.x.com/home' })
  await wait(2600)
  check('in a round, x.com in Chrome is sent away', (await sentAway()).includes('https://www.x.com/home'), JSON.stringify(await sentAway()))
  const card = await windowOf('view=nudge')
  card?.on('pageerror', (error) => c.errors.push('NUDGE ' + error.message))
  await card?.waitForTimeout(700)
  const said = await card?.$eval('[data-nudge="blocked"]', (one) => one.textContent).catch(() => '')
  check('Haligtree says “x.com” is blocked until the round ends', /“x\.com” is blocked until \d{1,2}:\d{2}/.test(said ?? ''), said)
  check('with “Allow 5 min”', (said ?? '').includes('Allow 5 min'))
  check('and a soft sound', (await card.evaluate(() => [...(window.haligtreeHeard ?? [])])).includes('cue:nope'))
  for (const one of ['paper', 'dark']) {
    await theme(card, one)
    await card.screenshot({ path: `${SHOT}/notice-${one}.png` })
  }
  check('its count is kept against the session', (await v('site-block:session', session))?.[0]?.count >= 1, JSON.stringify(await v('site-block:session', session)))

  // --- A task falling due meanwhile: its card goes to the top right in a window of its own, and the notice stays put.
  const boundsOf = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => one.webContents.getURL().includes('view=nudge'))
    .map((one) => ({ at: one.webContents.getURL().includes('at=pill') ? 'pill' : 'corner', ...one.getBounds() })))
  const noticeWas = (await boundsOf()).find((one) => one.at === 'pill')
  await v('settings:set', { notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  const due = await v('task:add', 'Return the library book')
  await v('task:save', due?.id ?? due, { due: new Date(Date.now() - 2 * 60000).toISOString() })
  await v('alerts:check')
  await wait(1500)
  const both = await boundsOf()
  const corner = both.find((one) => one.at === 'corner')
  const noticeNow = both.find((one) => one.at === 'pill')
  check('a task due meanwhile gets a card window of its own', !!corner && !!noticeNow, JSON.stringify(both))
  check('and the blocked notice does not move', noticeWas && noticeNow && noticeWas.x === noticeNow.x && noticeWas.y === noticeNow.y, `${JSON.stringify(noticeWas)} then ${JSON.stringify(noticeNow)}`)
  check('the task card sits apart from it, at the right', corner && noticeNow && corner.x > noticeNow.x, JSON.stringify(both))

  // --- Allow 5 min.
  await card.click('[data-nudge-allow]')
  await card.waitForTimeout(500)
  const allowed = await card.$eval('[data-nudge="blocked"]', (one) => one.textContent).catch(() => '')
  check('“Allow 5 min” says until when', allowed.includes('is allowed until'), allowed)
  // The Mac's own clock: "7:54" on a 24-hour Mac (no leading zero), "7:54 AM" on a 12-hour one.
  const fiveOn = await card.evaluate(() => new Date(Date.now() + 5 * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  check('the time it says is the one main lets it through until (5 minutes on)', allowed.includes(fiveOn) && allowed.startsWith('Let through for 5 minutes'), `${allowed} vs ${fiveOn}`)
  await card.screenshot({ path: `${SHOT}/allowed-dark.png` })
  const before = (await sentAway()).length
  await fake({ app: 'com.google.Chrome', url: 'https://x.com/explore' })
  await wait(2600)
  check('then x.com stays open', (await sentAway()).length === before)
  await fake({ app: 'com.google.Chrome', url: 'https://m.youtube.com/watch?v=2' })
  await wait(2600)
  check('while another blocked site (a part of youtube.com) is still sent away', (await sentAway()).includes('https://m.youtube.com/watch?v=2'))
  // One look a second, one run of the script each (it used to be two).
  await fake({ app: 'com.google.Chrome', url: 'https://en.wikipedia.org/wiki/Essay' })
  await electron.evaluate(() => void (globalThis.siteBlockLooks = 0))
  await wait(4200)
  const looks = await electron.evaluate(() => globalThis.siteBlockLooks)
  check('one look of the browser a second, not two', looks >= 2 && looks <= 5, `${looks} in 4.2 s`)
  // The test builds and other Chromium browsers are read too.
  for (const [app, url] of [['com.operasoftware.OperaGX', 'https://www.tiktok.com/@a'], ['com.google.Chrome.canary', 'https://www.tiktok.com/@b'], ['com.microsoft.edgemac.Beta', 'https://www.tiktok.com/@c']]) {
    await fake({ app, url })
    await wait(2600)
    check(`${app}: a blocked site is sent away`, (await sentAway()).includes(url), JSON.stringify((await sentAway()).slice(-2)))
  }

  // --- Where it does nothing.
  const quiet = async (name, url, app = 'com.apple.Safari') => {
    const was = (await sentAway()).length
    await fake({ app, url })
    await wait(2600)
    check(name, (await sentAway()).length === was)
  }
  await quiet('a site not on the list stays open', 'https://en.wikipedia.org/wiki/Essay')
  await quiet('nor another app, whatever it shows', 'https://instagram.com/', 'com.apple.TextEdit')
  await v('session:pause', session)
  await quiet('nor while the session is paused', 'https://instagram.com/')
  await v('session:resume', session)
  await v('settings:set', { siteBlock: false })
  await quiet('nor with the switch off', 'https://www.tiktok.com/')
  await v('settings:set', { focusTools: true, siteBlock: true })
  await fake({ app: 'com.apple.Safari', url: 'https://www.tiktok.com/' })
  await wait(2600)
  check('on again, Safari is blocked too', (await sentAway()).includes('https://www.tiktok.com/'))
  await v('break:start', session, 5 * 60_000)
  await quiet('nor on a break', 'https://facebook.com/')
  await v('timer:start', 'Tea', 5 * 60_000)
  await quiet('nor in a plain timer', 'https://facebook.com/')
  const rounds = await v('rounds:start', 'Reading', { rounds: 2, workMs: 25 * 60_000, breakMs: 5 * 60_000, longMs: 15 * 60_000 })
  await fake({ app: 'company.thebrowser.Browser', url: 'https://facebook.com/' })
  await wait(2600)
  check('a Pomodoro work stretch blocks, in Arc too', (await sentAway()).includes('https://facebook.com/'))
  await v('rounds:next', rounds, { round: 1, phase: 'break', ms: 5 * 60_000 })
  await quiet('and its break does not', 'https://facebook.com/', 'company.thebrowser.Browser')
  await v('session:cancel', rounds)

  // --- The Mac refused.
  await v('session:again')
  await fake({ app: 'com.apple.Safari', url: null, denied: true })
  await wait(2600)
  await c.go('settings')
  await h.click('[data-section="Tasks"]')
  await h.waitForTimeout(800)
  const access = await h.$eval('[data-setting-title="Browser access"]', (one) => one.textContent).catch(() => '')
  check('a refused browser is said in Settings', access.includes('did not let Haligtree read Safari'), access)
  const accessRow = await row('Browser access')
  check('the problem comes first, then the fix naming the browser', accessRow.text.indexOf('did not let') < accessRow.text.indexOf('Turn on Haligtree for Safari in Privacy & Security, under Automation.') && !accessRow.text.includes('for it in'), accessRow.text)
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/refused-dark.png` })
  await h.click('[data-setting-title="Browser access"] button')
  await h.waitForTimeout(300)
  check('with the way to the Automation pane', (await electron.evaluate(() => globalThis.opened ?? [])).some((one) => String(one).includes('Privacy_Automation')))
  check('and no dialog or error', !c.errors.length, c.errors.join(' | '))
  await fake({ app: 'com.apple.Safari', url: 'https://example.org/' })
  await wait(2600)
  await h.waitForTimeout(600)
  check('allowed again, the row goes', !(await h.$('[data-setting-title="Browser access"]')))

  // --- The day's page.
  const now = await v('focus:now')
  if (now?.id) await v('session:end', now.id, '', false)
  await v('session:end', session, '', false)
  await c.go('day')
  await h.waitForTimeout(1200)
  const tally = await h.$eval(`[data-day-session="${session}"] [data-session-blocked]`, (one) => one.textContent).catch(() => '')
  check('the day’s page says which sites the session kept you off', tally.includes('Kept you off') && tally.includes('x.com'), tally)

  // --- The session sheet.
  await c.send('task', task)
  await h.waitForTimeout(1200)
  const start = await h.$('text=Start a new focus session') ?? await h.$('text=Start a focus session')
  await start?.click()
  await h.waitForTimeout(600)
  check('the session sheet has the same “Block” field', !!(await h.$('form [data-site-field]')))
  const boxed = await h.$eval('form [data-site-field]', (one) => one.closest('section')?.querySelector('h2')?.textContent ?? '').catch(() => '')
  // With sites on the list, the box says they are on: “Blocking” (“Sites to block” only over the offers).
  check('in a box titled “Blocking”, as “Goal” and “How long” are titled', boxed === 'Blocking', boxed)
  check('with no grey “Block” word inside the field', !((await h.$eval('form [data-site-field]', (one) => one.textContent)) || '').startsWith('Block'))
  const span = await h.$eval('[data-start-span]', (one) => ({ text: one.textContent, lines: Math.round(one.querySelector('span').getBoundingClientRect().height / parseFloat(getComputedStyle(one).lineHeight)), size: parseFloat(getComputedStyle(one).fontSize), color: getComputedStyle(one).color, muted: getComputedStyle(document.body).getPropertyValue('--muted-foreground') })).catch(() => null)
  check('the start form says “If you start now” and the times', /^If you start now\d{1,2}:\d{2}/.test(span?.text ?? ''), span?.text)
  check('on one line, at a readable size', span?.lines === 1 && span.size >= 13, JSON.stringify(span))
  // In the narrow session panel and at its widest: the group's name on one line, its count with it,
  // the ⌄ and × each a whole button's room, and the sites in an even grid.
  await v('settings:set', { blockSites: ['@social', '-reddit.com'] })
  await h.waitForTimeout(500)
  await h.click('form [data-site-open]')
  await h.waitForTimeout(700)
  const sized = (w) => electron.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setBounds({ x: 40, y: 40, width: w, height: 860 }), w)
  for (const [label, w] of [['narrowest', 1100], ['widest', 700]]) {
    await sized(w)
    await h.waitForTimeout(900)
    const got = await h.evaluate(() => {
      const chip = document.querySelector('form [data-site-chip="@social"]')
      const name = chip?.querySelector('[data-site-group-name]')
      const count = chip?.querySelector('[data-site-group-count]')
      const box = (el) => el?.getBoundingClientRect()
      const line = name ? parseFloat(getComputedStyle(name).lineHeight) : 0
      const open = chip?.querySelector('[data-site-chevron]')
      const remove = chip?.querySelector('[data-site-remove]')
      const members = [...document.querySelectorAll('form [data-site-member]')].map((one) => box(one))
      const rows = [...new Set(members.map((one) => Math.round(one.top)))].sort((x, y) => x - y)
      const gaps = rows.slice(1).map((top, i) => top - rows[i])
      const lefts = [...new Set(members.map((one) => Math.round(one.left)))]
      const widths = [...new Set(members.map((one) => Math.round(one.width)))]
      return {
        panel: Math.round(box(chip?.closest('form'))?.width ?? 0),
        nameLines: name ? Math.round(box(name).height / line) : 0, nameCut: name ? name.scrollWidth > name.clientWidth : true,
        count: count?.textContent ?? '', countOneLine: count ? box(count).height <= parseFloat(getComputedStyle(count).lineHeight) + 1 : false,
        open: Math.round(box(open)?.width ?? 0), remove: Math.round(box(remove)?.width ?? 0),
        overlap: open && remove && count ? box(open).right > box(remove).left || box(count).right > box(open).left || count.scrollWidth > count.clientWidth : true,
        inside: chip ? box(chip).right <= box(chip.parentElement).right + 0.5 : false,
        members: members.length, gaps, columns: lefts.length, widths
      }
    })
    check(`${label} (${got.panel}px): “Social media” on one line, not cut`, got.nameLines === 1 && !got.nameCut, JSON.stringify(got))
    check(`${label}: its count “7 of 8” with it, on one line`, got.count.startsWith('7 of 8') && got.countOneLine, got.count)
    check(`${label}: ⌄ and × each 24px, apart from each other and the count, inside the field`, got.open >= 24 && got.remove >= 24 && !got.overlap && got.inside, JSON.stringify({ open: got.open, remove: got.remove, overlap: got.overlap, inside: got.inside }))
    check(`${label}: the eight sites in an even grid`, got.members === 8 && Math.max(...got.gaps) - Math.min(...got.gaps) <= 1 && got.widths.length === 1, `rows ${got.gaps.join(',')} columns ${got.columns} widths ${got.widths.join(',')}`)
    await (await h.$('form:has([data-site-field])'))?.screenshot({ path: `${SHOT}/sheet-${label}.png` })
  }
  await sized(1100)
  await h.waitForTimeout(600)
  await theme(h, 'paper')
  await (await h.$('form:has([data-site-field])'))?.screenshot({ path: `${SHOT}/sheet-paper.png` })
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 400))
} finally {
  await c.close()
}
done()
