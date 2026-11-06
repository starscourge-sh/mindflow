// One progress style everywhere (the user, 6 Nov: "I want my book to be the plain lines like you used on the Goals
// page, but remember it is an option"). Settings › Appearance › Progress bars offers "Plain line" (the Goals page's
// line: 1px, the page's ink at 35% over a track at 8%), new books start on it, and every bar in every page follows
// the one choice, Goals' own included. Frames of each page under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/progress-one-style.mjs
import { readFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 6000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
// Every bar on the page: its style, its height, its track and its fill, as drawn.
const bars = () => h.evaluate(() => [...document.querySelectorAll('[role=progressbar][data-style]')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => {
  const fill = one.querySelector(':scope > span > span')
  return { label: one.getAttribute('aria-label'), style: one.dataset.style, height: one.getBoundingClientRect().height, track: getComputedStyle(one).backgroundColor, fill: fill ? getComputedStyle(fill).backgroundColor : '' }
}))
// What the Goals page's ink and track come to in this theme.
const goalsLine = () => h.evaluate(() => {
  const probe = document.createElement('span')
  document.body.append(probe)
  probe.style.background = 'color-mix(in oklab, var(--foreground) 35%, transparent)'
  const ink = getComputedStyle(probe).backgroundColor
  probe.style.background = 'color-mix(in oklab, var(--foreground) 8%, transparent)'
  const track = getComputedStyle(probe).backgroundColor
  probe.remove()
  return { ink, track }
})
const PAGES = ['home', 'goals', 'queue', 'tasks', 'review', 'powers', 'articles']
try {
  // New books start on the plain line (the main process's own default, read from the build).
  const entry = process.env.QA_ENTRY ?? 'out/main/index.js'
  check('a new book starts on "Plain line"', /progressBars:\s*"line"/.test(readFileSync(entry, 'utf8')))

  await v('settings:set', { progressBars: 'line' })
  await h.waitForTimeout(400)
  check('the window wears the plain line', (await h.evaluate(() => document.documentElement.dataset.bars)) === 'line')
  const want = await goalsLine()
  const seen = {}
  for (const page of PAGES) {
    await c.go(page)
    await waitFor(async () => (await bars()).length > 0, 4000)
    await h.waitForTimeout(600)
    seen[page] = await bars()
    if (shots) await c.both(join(shots, `progress-line-${page}`))
  }
  const every = Object.values(seen).flat()
  console.log('bars seen:', Object.entries(seen).map(([page, list]) => `${page} ${list.length}`).join(', '))
  check('bars were found on Home, Goals and Queue', seen.home.length > 0 && seen.goals.length > 0 && seen.queue.length > 0, JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, l]) => [k, l.length]))))
  const off = every.filter((one) => one.style !== 'line')
  check('every bar on every page is the plain line', !off.length, JSON.stringify(off.slice(0, 6)))
  check('every plain line is 1px, as Goals draws it', every.every((one) => Math.abs(one.height - 1) < 0.01), JSON.stringify(every.filter((one) => Math.abs(one.height - 1) >= 0.01).slice(0, 4)))
  check('every plain line has the Goals track', every.every((one) => one.track === want.track), `${want.track} vs ${JSON.stringify([...new Set(every.map((one) => one.track))])}`)
  // A goal near its day warms its own line; every other bar is in the Goals ink.
  const plain = every.filter((one) => !/of the time gone/.test(one.label ?? ''))
  check('every bar that is not a goal\'s is in the Goals ink', plain.length > 0 && plain.every((one) => one.fill === want.ink), `${want.ink} vs ${JSON.stringify([...new Set(plain.map((one) => `${one.label}: ${one.fill}`))].slice(0, 6))}`)

  // The one choice reaches Goals too: the dinosaur picked, Goals' bars run as every other does.
  await v('settings:set', { progressBars: 'dino' })
  for (const page of ['goals', 'home', 'queue']) {
    await c.go(page)
    await waitFor(async () => (await bars()).length > 0, 4000)
    const list = await bars()
    check(`"Dino run" reaches ${page}`, list.length > 0 && list.every((one) => one.style === 'dino'), JSON.stringify(list.map((one) => one.style)))
  }
  await v('settings:set', { progressBars: 'saber' })
  await c.go('goals')
  await waitFor(async () => (await bars()).length > 0, 4000)
  check('"Lightsaber" reaches Goals', (await bars()).every((one) => one.style === 'saber'), JSON.stringify((await bars()).map((one) => one.style)))

  // The setting itself: four choices, each a live sample; picking one in place changes the bars.
  await v('settings:set', { progressBars: 'line' })
  await h.evaluate(() => localStorage.setItem('settings:section', 'Appearance'))
  await c.go('home')
  await c.go('settings')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-loop-bar]')), 6000)
  const choices = await h.evaluate(() => {
    const sample = document.querySelector('[data-loop-bar="line"]')
    const row = sample?.closest('[role=radiogroup], [role=group], [data-setting]')
    return { samples: [...document.querySelectorAll('[data-loop-bar]')].map((one) => one.dataset.loopBar), words: row?.textContent ?? '' }
  })
  check('Progress bars offers Plain line, Plain bar, Lightsaber and Dino run, each with its sample', ['line', 'plain', 'saber', 'dino'].every((one) => choices.samples.includes(one)) && /Plain line/.test(choices.words) && /Plain bar/.test(choices.words), JSON.stringify(choices))
  // Picked by a click in place: the setting is saved and the window's bars follow.
  await h.evaluate(() => document.querySelector('[data-loop-bar="plain"]')?.scrollIntoView({ block: 'center' }))
  await h.locator('button:has([data-loop-bar="plain"])').click()
  await waitFor(async () => (await v('settings')).progressBars === 'plain' && (await h.evaluate(() => document.documentElement.dataset.bars)) === 'plain', 3000)
  check('clicking "Plain bar" picks it, and the window follows', (await v('settings')).progressBars === 'plain' && (await h.evaluate(() => document.documentElement.dataset.bars)) === 'plain')
  await h.locator('button:has([data-loop-bar="line"])').click()
  await waitFor(async () => (await v('settings')).progressBars === 'line', 3000)
  check('clicking "Plain line" puts it back', (await v('settings')).progressBars === 'line')
  if (shots) {
    await h.evaluate(() => document.querySelector('[data-loop-bar="line"]')?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(1500)
    await c.both(join(shots, 'progress-setting'))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
