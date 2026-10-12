// A task done, with “Giphy” chosen for “A task done”, in the sandbox:
// a GIF from Giphy shows in the celebration card with "Powered by GIPHY";
// with Reduce motion it is a still frame; Settings shows the day's results to
// star. Then, in fresh folders, with Giphy's addresses blocked and with no key,
// the card still comes, playing what it would anyway, with no Giphy mark.
// The key is read from MINDFLOW_GIPHY_KEY only, never written down here.
// SHOTS=dir keeps pictures.
//
//   npx electron-vite build --outDir out-giphy
//   QA_ARGS=--sandbox QA_ENTRY=out-giphy/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_GIPHY_KEY=… node qa/giphy.mjs
import { mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const KEY = process.env.MINDFLOW_GIPHY_KEY
if (!KEY) throw new Error('Set MINDFLOW_GIPHY_KEY')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push({ name, ok: !!ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

/** One run in a fresh folder: Giphy on, a task added and done, and what the card shows. */
async function run({ key, block, label }) {
  const data = mkdtempSync(join(tmpdir(), 'mindflow-giphy-'))
  process.env.QA_DATA = data
  process.env.MINDFLOW_GIPHY_KEY = key
  const c = await sandbox({ width: 1100, height: 760 })
  const { h, v, electron } = c
  const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
  try {
    if (block) {
      await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.giphy.com/*'] }, (_d, done) => done({ cancel: true })))
      // Giphy is on from the start, so a few were fetched ahead while the sandbox was set out: let them go, as if never online.
      await h.waitForTimeout(6000)
      const cache = join(await electron.evaluate(({ app }) => app.getPath('userData')), 'giphy-cache')
      for (const name of existsSync(cache) ? readdirSync(cache) : []) if (name !== 'results.json') rmSync(join(cache, name), { force: true })
    }
    // A build with Vigil's own key (from .env.local) is never without one: no key to test.
    if (label === 'nokey' && !(await v('celebrations:giphy:search', 'x')).why) {
      console.log('SKIP  nokey: this build has a key of its own built in')
      return
    }
    await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, celebrate: true, celebrationSources: { taskDone: 'giphy' }, quietStart: '00:00', quietEnd: '00:00' })
    await c.go('home')
    const done = async () => {
      const task = await v('task:add', `Giphy check ${Math.random().toString(36).slice(2, 6)}`)
      await v('task:done', task.id ?? task)
      return h.waitForSelector('[data-celebration] [role=status]', { timeout: 9000 }).then(() => true, () => false)
    }
    const card = await done()
    check(`${label}: a task done shows a card`, card)
    await h.waitForTimeout(1500)
    const seen = await h.evaluate(() => {
      const box = document.querySelector('[data-celebration] [role=status]')
      const video = box?.querySelector('video')
      return { mark: !!box?.querySelector('[data-giphy-attribution]'), text: box?.textContent ?? '', video: video?.currentSrc ?? '', playing: video ? !video.paused && video.readyState >= 2 : false, img: box?.querySelector('img')?.src ?? '', height: box?.firstElementChild?.getBoundingClientRect().height ?? 0 }
    })
    await shot(`${label}-card`)
    const cache = join(await electron.evaluate(({ app }) => app.getPath('userData')), 'giphy-cache')
    const files = existsSync(cache) ? readdirSync(cache) : []
    if (label === 'giphy') {
      check('giphy: the card plays a GIF from Giphy', seen.mark && seen.video.startsWith('mindflow://celebrate/') && seen.playing, JSON.stringify({ ...seen, text: undefined }))
      check('giphy: "Powered by GIPHY" is on it', seen.text.includes('Powered by GIPHY'))
      check('giphy: it is sized to its own shape', seen.height >= 130 && seen.height <= 222, `${seen.height}px`)
      check('giphy: the list and the clip are kept in the cache', files.includes('results.json') && files.some((f) => f.endsWith('.mp4')), files.length + ' files')
      // Reduce motion: its still frame.
      await h.mouse.click(5, 5)
      await h.keyboard.press('Escape')
      await h.waitForTimeout(600)
      await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
      await h.waitForTimeout(3200)
      check('giphy: another task done, Motion off', await done())
      await h.waitForTimeout(1200)
      const calm = await h.evaluate(() => {
        const box = document.querySelector('[data-celebration] [role=status]')
        return { video: !!box?.querySelector('video'), img: box?.querySelector('img')?.src ?? '', mark: !!box?.querySelector('[data-giphy-attribution]') }
      })
      check('giphy: with Motion off it is a still frame, still with the mark', !calm.video && calm.img.endsWith('.gif') && calm.mark, JSON.stringify(calm))
      await shot('giphy-still')
      await h.keyboard.press('Escape')
      await h.evaluate(() => delete document.documentElement.dataset.motion)
      // Settings: the fields, and the day's results to star.
      await c.go('settings')
      await h.getByText('Scenery', { exact: true }).first().click()
      await h.waitForTimeout(800)
      const show = h.getByRole('button', { name: 'Show them' })
      await show.scrollIntoViewIfNeeded()
      check('settings: the Giphy rows are there', (await h.getByText('Giphy search words', { exact: true }).count()) === 1 && (await h.getByText('Giphy key').count()) >= 1)
      check('settings: the key field hides what is typed', (await h.locator('input[type=password][placeholder="Optional: your own key"]').count()) === 1)
      await show.click()
      await h.waitForSelector('[data-giphy-picker] img', { timeout: 20000 })
      await h.waitForTimeout(1200)
      const count = await h.locator('[data-giphy-picker] img').count()
      check('settings: the day\'s results show to star', count >= 5, `${count}`)
      const first = h.locator('[data-giphy-star]').first()
      const id = await first.getAttribute('data-giphy-star')
      await first.hover()
      await first.click()
      await h.waitForTimeout(500)
      const stars = (await v('settings')).giphyStars
      check('settings: a star is saved', stars.includes(id), JSON.stringify(stars))
      await h.locator('[data-giphy-picker]').scrollIntoViewIfNeeded()
      await shot('giphy-settings')
    } else {
      check(`${label}: it falls back quietly, no Giphy mark`, card && !seen.mark && !seen.text.includes('GIPHY'))
      check(`${label}: nothing from Giphy was kept`, !files.some((f) => f.endsWith('.mp4')), files.join(','))
    }
    check(`${label}: no page errors`, c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
  } finally {
    await c.close()
  }
}

await run({ key: KEY, block: false, label: 'giphy' })
await run({ key: KEY, block: true, label: 'offline' })
await run({ key: '', block: false, label: 'nokey' })

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
