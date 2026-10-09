// A capture promoted to an idea from the Inbox flies to Ideas in the sidebar:
// with Ideas in view, scrolled out of the sidebar's list, and the sidebar hidden.
// Frames and where the square ended up, against what of the sidebar is seen.
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
const run = async (name, setup) => {
  await go('inbox'); await h.waitForTimeout(800)
  await setup()
  await h.evaluate(() => {
    window.__track = []
    const t = setInterval(() => {
      for (const el of document.body.children) if (el.style?.zIndex === '60' && el.style.position === 'fixed') { const r = el.getBoundingClientRect(); window.__track.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]) }
    }, 8)
    setTimeout(() => clearInterval(t), 1500)
  })
  await h.evaluate(() => document.activeElement?.blur())
  // The first plain note in the list: one whose promotion asks nothing.
  const at = await h.evaluate(() => [...document.querySelectorAll('[class*="@container/page"] [data-id]')].findIndex((row) => /^(Tasks, said|Kessel Run|Mission log|Every great trick)/.test(row.textContent.trim())))
  for (let i = 0; i < at; i++) await h.keyboard.press('j')
  await h.waitForTimeout(200); await h.keyboard.press('p')
  for (const at of [250, 450, 620]) { await h.waitForTimeout(at === 250 ? 250 : at === 450 ? 200 : 170); await frame(`${name}-${at}`) }
  await h.waitForTimeout(900)
  await h.keyboard.press('Escape')
  const out = await h.evaluate(() => {
    const list = document.querySelector('aside .overflow-y-auto')?.getBoundingClientRect()
    const ideas = document.querySelector('[data-home~="nugget"]')?.getBoundingClientRect()
    return { last: window.__track.at(-1), frames: window.__track.length, list: list && [Math.round(list.left), Math.round(list.top), Math.round(list.right), Math.round(list.bottom)], ideas: ideas && [Math.round(ideas.left), Math.round(ideas.top)], near: [...document.querySelectorAll('[data-home-near~="nugget"]')].map((el) => { const r = el.getBoundingClientRect(); return [el.textContent.trim(), Math.round(r.left), Math.round(r.top)] }), away: !!document.querySelector('[data-home-away]'), win: [innerWidth, innerHeight] }
  })
  console.log(name, JSON.stringify(out))
}
try {
  await h.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true }))
  await run('fly-shown', async () => { await c.size(1000, 900); await h.evaluate(() => (document.querySelector('aside .overflow-y-auto').scrollTop = 0)) })
  await run('fly-scrolled', async () => { await c.size(1000, 460); await h.evaluate(() => (document.querySelector('aside .overflow-y-auto').scrollTop = 0)) })
  await run('fly-scrolled-up', async () => { await c.size(1000, 380); await h.evaluate(() => { const l = document.querySelector('aside .overflow-y-auto'); l.scrollTop = l.scrollHeight }) })
  await run('fly-folded', async () => { await c.size(1000, 700); await h.evaluate(() => [...document.querySelectorAll('aside button[aria-expanded="true"]')].find((b) => b.textContent.trim().startsWith('Saved'))?.click()); await h.waitForTimeout(500) })
  await h.evaluate(() => [...document.querySelectorAll('aside button[aria-expanded="false"]')].find((b) => b.textContent.trim().startsWith('Saved'))?.click())
  await run('fly-collapsed', async () => { await c.size(1000, 700); await h.keyboard.press('Meta+b'); await h.waitForTimeout(500) })
  await h.keyboard.press('Meta+b')
  console.log('errors', c.errors.length, c.errors.slice(0, 3))
} finally { await c.close() }
process.exit(0)
