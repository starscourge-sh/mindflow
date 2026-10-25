// Each goal's card on the desktop shows that goal alone, and "Show all goals
// on one sticky" shows every open goal together, each in its own colour, with
// a legend whose entries bring one goal forward. Windows stay parked off
// screen (HALIGTREE_QA_VIRTUAL) and are never focused; the run is silent.
//
//   npx electron-vite build --outDir out-goal-stickies
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-goal-stickies/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-stickies.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const SHOTS = process.env.QA_SHOTS ?? 'scratchpad/stickies'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const c = await sandbox()
const { electron, h, v } = c
try {
  await v('settings:set', { stickiesGlass: false })
  const winOf = async (part, glass = false) => {
    for (let i = 0; i < 60; i++) {
      const found = electron.windows().find((one) => !one.isClosed() && one.url().includes('view=sticky') && one.url().includes(part) && one.url().includes('glass=1') === glass)
      if (found) return (await found.waitForLoadState('domcontentloaded'), found)
      await wait(250)
    }
    return null
  }
  const goals = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt)
  const marks = await v('milestones', null, null)
  const markOf = (one) => (one.note?.startsWith('goal:') ? one.note.slice(5) : null)
  check('the sandbox has open goals, three with a day marked for each', goals.length >= 3 && goals.filter((g) => marks.some((m) => markOf(m) === g.id)).length >= 3, goals.map((g) => g.title).join(' | '))
  check('each goal has a colour of its own', new Set(goals.map((g) => g.goalColor)).size === goals.length && goals.every((g) => g.goalColor), goals.map((g) => g.goalColor).join(','))

  // --- each goal's own card: the sandbox puts up only Dune's, so three are set to "Always" here (no more than three go out on their own, qa/goal-cards-many.mjs)
  const carded = [...goals.filter((g) => /^(Finish Dune|Get to Mars)/.test(g.title)), ...goals.filter((g) => !/^(Finish Dune|Get to Mars)/.test(g.title))].slice(0, 3)
  for (const goal of carded) await v('goal:beacon:set', goal.id, 'always')
  await wait(4500)
  for (const goal of carded) {
    const win = await winOf(`type=goal&id=${goal.id}`)
    if (!win) { check(`${goal.title}: a card of its own`, false); continue }
    await win.waitForSelector('[data-goal-card]', { timeout: 8000 }).catch(() => {})
    await wait(600)
    const seen = await win.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-goal-card]')].map((one) => one.getAttribute('data-goal-card')),
      text: document.body.innerText,
      next: document.querySelector('[data-goal-next]')?.getAttribute('data-goal-next') ?? null,
      ringed: [...document.querySelectorAll('[data-road-marked]')].map((one) => one.getAttribute('data-road-marked'))
    }))
    const others = goals.filter((g) => g.id !== goal.id)
    const own = marks.filter((m) => markOf(m) === goal.id).map((m) => m.id)
    const strangers = marks.filter((m) => markOf(m) !== goal.id)
    check(`${goal.title}: its card holds that goal alone`, seen.cards.length === 1 && seen.cards[0] === goal.id && others.every((g) => !seen.text.includes(g.title)), JSON.stringify(seen.cards))
    check(`${goal.title}: its next marked day is its own`, own.length ? own.includes(seen.next) : seen.next === null, String(seen.next))
    check(`${goal.title}: the road rings only its own marked days`, seen.ringed.every((id) => own.includes(id)) && strangers.every((m) => !seen.text.includes(m.title)), JSON.stringify(seen.ringed))
  }
  const cardsUp = electron.windows().filter((one) => one.url().includes('view=sticky') && one.url().includes('type=goal&')).length
  check('one card per goal set to “Always”, no shared stack', cardsUp === carded.length && !electron.windows().some((one) => one.url().includes('id=stack')), String(cardsUp))

  // --- where it is offered: ⌘K, the Goals page, a goal's menu
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('all goals on one', { delay: 10 }); await wait(500)
  const offered = await h.evaluate(() => document.body.innerText.includes('Stick all goals on the desktop'))
  check('⌘K offers “Stick all goals on the desktop”', offered)
  await h.keyboard.press('Escape'); await wait(300); await h.keyboard.press('Escape'); await wait(300)
  await c.go('goals'); await wait(800)
  await h.locator('text=Get to Mars before the dust storm').first().click({ button: 'right' }).catch(() => {})
  await wait(500)
  const inMenu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].some((one) => one.textContent.includes('Stick all goals on the desktop')))
  check("a goal's menu offers “Stick all goals on the desktop”", inMenu)
  await h.keyboard.press('Escape'); await wait(300)
  const button = h.locator('[data-all-goals-sticky]')
  check('the Goals page offers “All on one sticky”', (await button.count()) === 1)
  await button.click(); await wait(1500)

  // --- the goals together
  const all = await winOf('type=goals&id=all')
  check('the goals sticky is up', !!all)
  await all.waitForSelector('[data-goals-lane]', { timeout: 8000 }).catch(() => {})
  await wait(800)
  const read = () => all.evaluate(() => ({
    lanes: [...document.querySelectorAll('[data-goals-lane]')].map((one) => ({ id: one.getAttribute('data-goals-lane'), color: one.getAttribute('data-color'), opacity: Number(getComputedStyle(one).opacity), ink: getComputedStyle(one.querySelector('span:nth-child(2)')).backgroundColor })),
    keys: [...document.querySelectorAll('[data-goals-key]')].map((one) => ({ id: one.getAttribute('data-goals-key'), ink: getComputedStyle(one.querySelector('span')).backgroundColor, name: one.textContent, pressed: one.getAttribute('aria-pressed') })),
    items: [...document.querySelectorAll('[data-goals-item]')].map((one) => ({ goal: one.getAttribute('data-goals-item'), mark: one.getAttribute('data-goals-item-mark'), ink: getComputedStyle(one.querySelector('span')).backgroundColor })),
    marks: [...document.querySelectorAll('[data-goals-mark]')].map((one) => one.getAttribute('data-goals-mark')),
    focus: document.querySelector('[data-goals-focus]')?.getAttribute('data-goals-focus') ?? null
  }))
  let seen = await read()
  const ids = goals.map((g) => g.id).sort().join()
  check('a lane for every open goal, in its colour', seen.lanes.map((l) => l.id).sort().join() === ids && seen.lanes.every((l) => l.color === goals.find((g) => g.id === l.id).goalColor), JSON.stringify(seen.lanes.map((l) => [l.id.slice(0, 4), l.color])))
  check('a legend entry per goal, named, its dot the lane’s colour', seen.keys.map((k) => k.id).sort().join() === ids && seen.keys.every((k) => k.ink === seen.lanes.find((l) => l.id === k.id).ink && k.name === goals.find((g) => g.id === k.id).title), JSON.stringify(seen.keys.map((k) => [k.name, k.ink])))
  check('the colours differ goal to goal', new Set(seen.keys.map((k) => k.ink)).size === goals.length)
  check('every goal’s marked days are on its lane', marks.filter((m) => markOf(m) && ids.includes(markOf(m))).every((m) => seen.marks.includes(m.id)) && seen.marks.every((id) => markOf(marks.find((m) => m.id === id))), JSON.stringify(seen.marks))
  check('what comes next lists items of the goals, each in its goal’s colour', seen.items.length >= 2 && new Set(seen.items.map((i) => i.goal)).size >= 2 && seen.items.every((i) => i.ink === seen.lanes.find((l) => l.id === i.goal).ink && (!i.mark || markOf(marks.find((m) => m.id === i.mark)) === i.goal)), JSON.stringify(seen.items))
  for (const theme of ['light', 'dark']) {
    for (const win of electron.windows().filter((one) => one.url().includes('view=sticky') && /type=goals?&/.test(one.url()))) {
      await win.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    }
    await wait(900)
    await all.screenshot({ path: join(SHOTS, `goals-all-${theme}.png`) })
    for (const goal of carded) {
      const win = await winOf(`type=goal&id=${goal.id}`)
      await win.screenshot({ path: join(SHOTS, `goal-${goal.title.split(' ').slice(0, 3).join('-').toLowerCase().replace(/[^a-z-]/g, '')}-${theme}.png`) })
    }
  }

  // --- a legend entry brings one goal forward
  const dune = goals.find((g) => g.title.startsWith('Finish Dune'))
  await all.locator(`[data-goals-key="${dune.id}"]`).click(); await wait(600)
  seen = await read()
  check('clicking a legend entry brings that goal forward and dims the rest', seen.focus === dune.id && seen.lanes.every((l) => (l.id === dune.id ? l.opacity === 1 : l.opacity < 0.3)) && seen.keys.find((k) => k.id === dune.id).pressed === 'true', JSON.stringify(seen.lanes.map((l) => [l.id.slice(0, 4), l.opacity])))
  check('focused, what comes next is that goal’s alone', seen.items.length >= 1 && seen.items.every((i) => i.goal === dune.id), JSON.stringify(seen.items))
  for (const theme of ['light', 'dark']) {
    await all.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(700)
    await all.screenshot({ path: join(SHOTS, `goals-all-focused-${theme}.png`) })
  }
  await all.locator(`[data-goals-key="${dune.id}"]`).click(); await wait(600)
  seen = await read()
  check('clicked again, every goal is back', !seen.focus && seen.lanes.every((l) => l.opacity === 1))
  await all.locator(`[data-goals-key="${dune.id}"]`).click(); await wait(400)
  await all.keyboard.press('Escape'); await wait(500)
  check('Esc brings every goal back too', !(await read()).focus)

  // --- a goal's colour, changed on the goal
  const mars = goals.find((g) => g.title.startsWith('Get to Mars'))
  await c.send('goal', mars.id); await wait(1200)
  const swatch = h.locator('[data-goal-swatch="pink"]')
  check("a goal's page offers its colour", (await swatch.count()) === 1)
  await swatch.click(); await wait(1400)
  seen = await read()
  const marsCard = await winOf(`type=goal&id=${mars.id}`)
  const flag = await marsCard.evaluate(() => getComputedStyle(document.querySelector('[data-goal-flag]')).color)
  check('picked pink, its lane and its card wear it', seen.lanes.find((l) => l.id === mars.id).color === 'pink' && flag === seen.lanes.find((l) => l.id === mars.id).ink, `${seen.lanes.find((l) => l.id === mars.id).color} ${flag}`)
  await h.keyboard.press('Meta+z'); await wait(1200)
  check('⌘Z puts its colour back', (await read()).lanes.find((l) => l.id === mars.id).color === mars.goalColor)

  // --- sticky rules kept: on top, every Space, never focused, its place remembered
  const rules = await electron.evaluate(({ BrowserWindow, app }) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => /view=sticky&type=goals?&/.test(w.webContents.getURL()))
    const fs = process.getBuiltinModule('fs')
    const kept = JSON.parse(fs.readFileSync(`${app.getPath('userData')}/stickies.json`, 'utf8'))
    return { n: wins.length, top: wins.every((w) => w.isAlwaysOnTop()), spaces: wins.every((w) => w.isVisibleOnAllWorkspaces()), focused: wins.some((w) => w.isFocused()), kept: kept.filter((one) => one.type === 'goal' || one.type === 'goals').map((one) => [one.type, !!one.bounds]) }
  })
  check('the goal stickies float on every Space and none took focus', rules.n === carded.length + 1 && rules.top && rules.spaces && !rules.focused, JSON.stringify(rules))
  check('their places are kept', rules.kept.length === carded.length + 1 && rules.kept.every(([, b]) => b), JSON.stringify(rules.kept))

  // --- as glass: made again in place, the same cards
  await v('settings:set', { stickiesGlass: true, stickiesFrosted: true }); await wait(3000)
  const glassAll = await winOf('type=goals&id=all', true)
  const glassMars = await winOf(`type=goal&id=${mars.id}`, true)
  check('as glass, the goals sticky and the cards are made again', !!glassAll && glassAll.url().includes('glass=1') && !!glassMars)
  for (const theme of ['light', 'dark']) {
    for (const win of [glassAll, glassMars].filter(Boolean)) await win.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(900)
    await glassAll?.screenshot({ path: join(SHOTS, `goals-all-glass-${theme}.png`) })
    await glassMars?.screenshot({ path: join(SHOTS, `goal-get-to-mars-glass-${theme}.png`) })
  }
  await v('settings:set', { stickiesGlass: false }); await wait(3000)

  // --- taken down with its X twice, then put back
  const paper = await winOf('type=goals&id=all')
  await paper.waitForSelector('[data-goals-takedown]', { timeout: 8000 })
  await paper.locator('[data-goals-sticky]').hover()
  await paper.locator('[data-goals-takedown]').click(); await wait(300)
  await paper.locator('[data-goals-takedown]').click(); await wait(1500)
  check('its X, pressed twice, takes the goals sticky down', !electron.windows().some((one) => one.url().includes('type=goals&')))
  await h.evaluate(() => window.api.putStickyBack()); await wait(1500)
  check('and it can be put back', !!(await winOf('type=goals&id=all')))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
  done()
}
