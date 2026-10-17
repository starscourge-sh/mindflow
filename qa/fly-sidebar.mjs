// A capture promoted to a gem from the Inbox lands on Gems in the sidebar:
// with Gems in view, scrolled out of the sidebar's list, its fold shut, and the
// sidebar hidden. By a key nothing flies (fly-home.ts): the place it went nods.
// Checks that the right place answers each time: the row itself, a bar at the
// list's edge on the row's side, the fold's heading, or the button that
// brings the sidebar back. Prints PASS or FAIL for each.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-fly/main/index.js SHOT=<dir> node qa/fly-sidebar.mjs
import { writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1000, height: 460 })
const { h, go, electron } = c
const SHOT = process.env.SHOT
const frame = async (name) => {
  const png = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home')).webContents.capturePage()).toPNG().toString('base64'))
  if (SHOT) writeFileSync(`${SHOT}/${name}.png`, Buffer.from(png, 'base64'))
}
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const run = async (name, setup) => {
  // A plain note of its own for each run, so the seed's few plain notes never run out.
  await h.evaluate((text) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), `Fly probe note ${name}`)
  await go('inbox'); await h.waitForTimeout(800)
  await setup()
  await h.evaluate(() => {
    window.__track = []
    window.__nodded = new Set()
    const t = setInterval(() => {
      for (const el of document.body.children) if (el.style?.zIndex === '60' && el.style.position === 'fixed') { const r = el.getBoundingClientRect(); window.__track.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]) }
      for (const el of document.querySelectorAll('[data-home~="nugget"], [data-home-near~="nugget"], [data-home-away]')) if (el.getAnimations().length) window.__nodded.add(el.hasAttribute('data-home-away') ? 'away' : el.hasAttribute('data-home-near') ? 'near' : 'row')
    }, 8)
    setTimeout(() => clearInterval(t), 1500)
  })
  await h.evaluate((note) => (window.__flyNote = note, document.activeElement?.blur()), `Fly probe note ${name}`)
  // The first plain note in the list: one whose promotion asks nothing.
  const at = await h.evaluate(() => [...document.querySelectorAll('[class*="@container/page"] [data-id]')].findIndex((row) => row.textContent.trim().startsWith(window.__flyNote)))
  // The list starts with no row picked: the first J picks the top one.
  for (let i = 0; i <= at; i++) await h.keyboard.press('j')
  await h.waitForTimeout(200); await h.keyboard.press('p')
  for (const at of [250, 450, 620]) { await h.waitForTimeout(at === 250 ? 250 : at === 450 ? 200 : 170); await frame(`${name}-${at}`) }
  await h.waitForTimeout(900)
  await h.keyboard.press('Escape')
  const out = await h.evaluate(() => {
    const list = document.querySelector('aside .overflow-y-auto')?.getBoundingClientRect()
    const ideas = document.querySelector('[data-home~="nugget"]')?.getBoundingClientRect()
    return { last: window.__track.at(-1), frames: window.__track.length, list: list && [Math.round(list.left), Math.round(list.top), Math.round(list.right), Math.round(list.bottom)], ideas: ideas && [Math.round(ideas.left), Math.round(ideas.top)], near: [...document.querySelectorAll('[data-home-near~="nugget"]')].map((el) => { const r = el.getBoundingClientRect(); return [el.textContent.trim(), Math.round(r.left), Math.round(r.top)] }), away: !!document.querySelector('[data-home-away]'), win: [innerWidth, innerHeight], nodded: [...window.__nodded] }
  })
  console.log(name, JSON.stringify(out))
  return out
}
try {
  await h.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true }))
  const shown = await run('fly-shown', async () => { await c.size(1000, 900); await h.evaluate(() => document.querySelector('aside [data-home~="nugget"]')?.scrollIntoView({ block: 'center' })) })
  check('Gems in view: its row nods', shown.nodded.includes('row'), JSON.stringify(shown.nodded))
  const scrolled = await run('fly-scrolled', async () => { await c.size(1000, 460); await h.evaluate(() => (document.querySelector('aside .overflow-y-auto').scrollTop = 0)) })
  check('Gems scrolled out below: a bar lights the list\'s bottom edge', scrolled.frames > 0 && scrolled.last && Math.abs(scrolled.last[1] - scrolled.list[3]) <= 6, JSON.stringify(scrolled.last))
  const up = await run('fly-scrolled-up', async () => { await c.size(1000, 380); await h.evaluate(() => { const l = document.querySelector('aside .overflow-y-auto'); l.scrollTop = l.scrollHeight }) })
  check('Gems scrolled out above: a bar lights the list\'s top edge', up.frames > 0 && up.last && Math.abs(up.last[1] - up.list[1]) <= 6, JSON.stringify(up.last))
  const folded = await run('fly-folded', async () => { await c.size(1000, 700); await h.evaluate(() => [...document.querySelectorAll('aside button[aria-expanded="true"]')].find((b) => b.textContent.trim().startsWith('Saved'))?.click()); await h.waitForTimeout(500) })
  await h.evaluate(() => [...document.querySelectorAll('aside button[aria-expanded="false"]')].find((b) => b.textContent.trim().startsWith('Saved'))?.click())
  check('Saved folded shut: its heading nods', folded.nodded.includes('near'), JSON.stringify(folded.nodded))
  const collapsed = await run('fly-collapsed', async () => { await c.size(1000, 700); await h.keyboard.press('Meta+b'); await h.waitForTimeout(500) })
  await h.keyboard.press('Meta+b')
  check('Sidebar hidden: the button that brings it back nods', collapsed.away && collapsed.nodded.includes('away'), JSON.stringify(collapsed.nodded))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 200))
} finally { await c.close() }
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.length && results.every(Boolean) ? 0 : 1)
