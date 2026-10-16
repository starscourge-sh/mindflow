// Blocking websites in a focus session, with the browser stubbed (no real
// browser is ever spoken to in a test run): Settings' “Block” field adds a
// typed site as a chip, removes one with × or two Backspaces, puts it back
// with ⌘Z, adds “Social media” in one click and opens it to its sites. While
// a round runs, a blocked address in the browser in front is sent away and
// Vigil's notice says until when, with “Allow 5 min”; never on a break, a
// pause, a plain timer, another app, or with the switch off. A browser the
// Mac refused is said in Settings with the way to its Privacy pane. The
// session keeps how often each site was sent away, said on the day's page.
//
//   npx electron-vite build --outDir out-siteblock
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-siteblock/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/site-block.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/site-block'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
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
const typeIn = async (text) => { await h.click(field); await h.keyboard.type(text); await h.waitForTimeout(250) }

try {
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', blockSites: [], siteBlock: true, quietStart: '03:00', quietEnd: '03:01' })
  await c.go('settings')
  await h.click('[data-section="Tasks"]')
  await h.waitForTimeout(600)
  check('Settings, Tasks has the “Block” field', !!(await h.$(field)))

  // --- Typing a site.
  await typeIn('link')
  const offers = await h.$$eval('[data-site-offer]', (all) => all.map((one) => one.textContent))
  check('typing “link” offers “Block website: link.com” first', offers[0]?.includes('Block website: link.com'), offers.join(' | '))
  check('and the usual site that starts so, linkedin.com', offers.some((one) => one.includes('linkedin.com')))
  await theme(h, 'paper')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/typing-paper.png` })
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
  await h.evaluate(() => { window.__toasts = []; addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text)) })
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
  check('the chip says 8', ((await h.$eval('[data-site-chip="@social"]', (one) => one.textContent).catch(() => '')) || '').includes('Social media8'))
  await h.click('[data-site-open]')
  await h.waitForTimeout(500)
  const members = await h.$$eval('[data-site-member]', (all) => all.map((one) => one.dataset.siteMember))
  check('it opens to its eight sites', members.length === 8 && members.includes('threads.net'), members.join(' '))
  await h.click('[data-site-member="reddit.com"]')
  await h.waitForTimeout(300)
  check('clicking one lets it through', (await list()).includes('-reddit.com'))
  check('and the chip says 7 of 8', ((await h.$eval('[data-site-chip="@social"]', (one) => one.textContent).catch(() => '')) || '').includes('7 of 8'))
  await h.mouse.move(5, 5)
  await theme(h, 'paper')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/settings-paper.png` })
  await theme(h, 'dark')
  await (await h.$('section[data-group="Blocking websites"]')).screenshot({ path: `${SHOT}/settings-dark.png` })
  await h.click('[data-site-member="reddit.com"]')
  await h.waitForTimeout(300)
  check('and again blocks it', !(await list()).includes('-reddit.com'))

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
  check('Vigil says “x.com” is blocked until the round ends', /“x\.com” is blocked until \d{1,2}:\d{2}/.test(said ?? ''), said)
  check('with “Allow 5 min”', (said ?? '').includes('Allow 5 min'))
  check('and a soft sound', (await card.evaluate(() => [...(window.vigilHeard ?? [])])).includes('cue:nope'))
  for (const one of ['paper', 'dark']) {
    await theme(card, one)
    await card.screenshot({ path: `${SHOT}/notice-${one}.png` })
  }
  check('its count is kept against the session', (await v('site-block:session', session))?.[0]?.count >= 1, JSON.stringify(await v('site-block:session', session)))

  // --- Allow 5 min.
  await card.click('[data-nudge-allow]')
  await card.waitForTimeout(500)
  const allowed = await card.$eval('[data-nudge="blocked"]', (one) => one.textContent).catch(() => '')
  check('“Allow 5 min” says until when', allowed.includes('is allowed until'), allowed)
  const fiveOn = await card.evaluate(() => new Date(Date.now() + 5 * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
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
  await v('settings:set', { siteBlock: true })
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
  check('a refused browser is said in Settings', access.includes('did not let Vigil read Safari'), access)
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
  await theme(h, 'paper')
  await (await h.$('form:has([data-site-field])'))?.screenshot({ path: `${SHOT}/sheet-paper.png` })
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 400))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
