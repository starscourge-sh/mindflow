// The welcome's arrival, after Dia's onboarding (welcome-scene.tsx, main: makeScene): first on a first run, the window
// made in the middle of the screen at the welcome's size, unseen until the fog is whole, then growing to the whole
// usable screen as the welcome ends; then played again from that window, as a person plays it from the Haligtree menu:
//   - a scene window over the whole screen, above everything, its clock started at once;
//   - the main window left exactly where it was, and nothing of the welcome shown in it, until the fog is whole over it;
//     then put in the middle of the screen at the welcome's size (floated first under AeroSpace) and its full-screen
//     button off;
//   - the scene drawn in to it on the beat and handed over (the scene window letting every click through), and the
//     scene window gone by the first words, which come in the window;
//   - the window keeps the welcome's size while the welcome plays, and as it ends it grows back to where it stood,
//     its full-screen button on and tiled again under AeroSpace, and the app comes up in it.
// `esc`: Esc over the scene goes straight to the first page in the window. `still`: with Motion off there is no scene,
// the window is put in the middle at once and grows back at the end all the same.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-arrival.mjs [dark|light] [esc|still]
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
process.env.HALIGTREE_QA_ARRIVAL = '1'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const THEME = process.argv[2] ?? 'dark'
const WAY = process.argv[3] ?? 'play'
// A stand-in AeroSpace that writes down what it is asked.
const stand = mkdtempSync(join(process.env.QA_DATA, 'aerospace-'))
writeFileSync(join(stand, 'aerospace'), '#!/bin/bash\nS="$(dirname "$0")"\necho "$*" >> "$S/calls.log"\ncase "$1" in list-workspaces) echo 1 ;; esac\nexit 0\n')
chmodSync(join(stand, 'aerospace'), 0o755)
process.env.HALIGTREE_AEROSPACE = join(stand, 'aerospace')
const calls = () => { try { return readFileSync(join(stand, 'calls.log'), 'utf8').split('\n').filter(Boolean) } catch { return [] } }

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${THEME}${WAY === 'play' ? '' : ` ${WAY}`}: ${name}${detail ? `  (${detail})` : ''}`)
}
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, close, electron } = c
const steps = async () => ((await electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null))?.steps ?? []).map((one) => one.what)
const homeOf = () => electron.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  return win ? { ...win.getBounds(), full: win.isFullScreenable(), id: win.getMediaSourceId().split(':')[1] } : null
})
const sceneOf = () => electron.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=scene'))
  return win ? { ...win.getBounds(), top: win.isAlwaysOnTop(), through: globalThis.haligtreeThrough?.(win.id) ?? null } : null
})
const arrival = () => electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null)
const box = (a, b) => `${a?.x},${a?.y} ${a?.width}x${a?.height} against ${b.x},${b.y} ${b.width}x${b.height}`
const same = (a, b) => !!a && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1)
const until = async (ok, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ok()) return true; await h.waitForTimeout(80) } return false }
try {
  // A first run (an empty book): its welcome plays by itself, in a window made in the middle of the screen for it.
  {
    const area0 = await electron.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
    // Up to 25 s: a launch on a busy machine (load 50) took more than ten to draw the scene's first frame.
    const t0 = await (async () => { for (let i = 0; i < 300; i++) { const one = await electron.evaluate(() => globalThis.haligtreeArrival?.().t0 ?? 0); if (one) return one; await h.waitForTimeout(80) } return 0 })()
    check('a first run: its scene starts by itself', t0 > 0)
    await h.waitForTimeout(Math.max(0, t0 + 4600 - Date.now()))
    check('a first run: its window is in the middle at the welcome\'s size once the fog is whole', (await steps()).includes('placed'), (await steps()).join(' > '))
    await h.waitForTimeout(Math.max(0, t0 + 18400 - Date.now()))
    check('a first run: the first words come in its window', await h.evaluate(() => !!document.querySelector('[data-thesis]')))
    await h.click('[data-skip]')
    await h.waitForTimeout(900)
    await h.getByRole('button', { name: 'Open my book' }).click()
    check('a first run: as it ends, its window grows to the whole usable screen', await until(async () => (await steps()).includes('grown') && same(await homeOf(), area0), 4000), box(await homeOf(), area0))
    check('a first run: its full-screen button on, tiled under AeroSpace', (await homeOf())?.full === true && calls().some((one) => one.startsWith('layout tiling')), calls().join(' | '))
    await until(() => h.evaluate(() => !document.querySelector('.mf-welcome')), 4000)
  }
  // Played again, from that window, in the look asked.
  await c.theme(THEME)
  if (WAY === 'still') {
    await h.evaluate(() => window.api.haligtree('settings:set', { motion: false }))
    // Told to the page as any change of Settings is: the welcome asks it as it opens.
    await h.waitForFunction(() => document.documentElement.dataset.motion === 'off', null, { timeout: 5000 })
  }
  const before = await homeOf()
  const { display, area } = await electron.evaluate(({ screen, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    const d = screen.getDisplayMatching(win.getBounds())
    return { display: d.bounds, area: d.workArea }
  })
  // The welcome's window, as main places it (welcomePlace).
  const width = Math.min(area.width - 64, Math.max(1100, Math.min(1280, Math.round(area.width * 0.62))))
  const height = Math.min(area.height - 64, Math.max(748, Math.round(width * 0.68)))
  const middle = { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height }

  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  if (WAY === 'still') {
    await h.waitForTimeout(1500)
    check('Motion off: no scene window', !(await sceneOf()))
    check('Motion off: the window is put in the middle at the welcome\'s size at once', same(await homeOf(), middle), box(await homeOf(), middle))
    check('Motion off: the first page is up', await until(() => h.evaluate(() => !!document.querySelector('[data-thesis]')), 3000))
  } else {
    check('a scene window comes, over the whole screen and above everything', await until(async () => { const s = await sceneOf(); return !!s && same(s, display) && s.top }, 4000), JSON.stringify(await sceneOf()))
    check('its clock starts within 1.5 s of the ask', await until(async () => (await arrival())?.t0 > 0, 1500))
    const t0 = (await arrival())?.t0 ?? Date.now()
    const at = (ms) => h.waitForTimeout(Math.max(0, t0 + ms - Date.now()))
    await at(1800)
    check('while the fog comes, the window stays where it was', same(await homeOf(), before), box(await homeOf(), before))
    check('and nothing of the welcome shows in it yet', await h.evaluate(() => getComputedStyle(document.querySelector('.mf-welcome')).visibility === 'hidden'))
    if (WAY === 'esc') {
      await at(2400)
      const s = c.electron.windows().find((one) => one.url().includes('view=scene'))
      await s?.keyboard.press('Escape')
      check('Esc over the scene: the first page in the window at once', await until(() => h.evaluate(() => !!document.querySelector('[data-thesis]')), 1500))
      check('Esc over the scene: the scene window goes', await until(async () => !(await sceneOf()), 1500))
      check('Esc over the scene: the window is in the middle at the welcome\'s size', same(await homeOf(), middle), box(await homeOf(), middle))
    } else {
      await at(4300)
      const placed = await homeOf()
      check('the fog whole, the window is put in the middle at the welcome\'s size', same(placed, middle), box(placed, middle))
      check('its full-screen button off while the welcome plays', placed?.full === false)
      check('floated under AeroSpace first', calls().some((one) => one === `layout floating --window-id ${placed?.id}`), calls().join(' | '))
      check('the scene plays on in it, under the scene window', await h.evaluate(() => getComputedStyle(document.querySelector('.mf-welcome')).visibility === 'visible' && !!document.querySelector('[data-welcome-scene="window"]')))
      // The fog drawn by the GPU, never its plain stand-in ground (15 Nov: in the user's dev app, StrictMode's second
      // mount found the canvas's context lost, and both windows showed a flat beige, then a flat grey).
      const drawn = () => {
        const stage = document.querySelector('[data-scene-stage]')
        const canvas = stage?.querySelector('canvas')
        return { ground: stage?.style.background ?? 'none', canvas: canvas ? `${canvas.width}x${canvas.height}` : 'none' }
      }
      const sceneSaid = await c.electron.windows().find((one) => one.url().includes('view=scene'))?.evaluate(drawn)
      const homeSaid = await h.evaluate(drawn)
      check('the fog is drawn by the GPU in the scene window, not its plain ground', sceneSaid?.ground === '' && sceneSaid.canvas !== 'none' && !sceneSaid.canvas.startsWith('2x'), JSON.stringify(sceneSaid))
      check('and in the welcome\'s window', homeSaid.ground === '' && homeSaid.canvas !== 'none', JSON.stringify(homeSaid))
      await at(13800)
      check('drawn in on the beat: handed over to the window', (await arrival())?.steps?.some((one) => one.what === 'handover'))
      // On this screen's shape, whatever it is (16:9 left a bare band at the window's top and foot, 15 Nov).
      const covered = await h.evaluate(() => {
        const stage = document.querySelector('[data-welcome-scene="window"] [data-scene-stage]')?.getBoundingClientRect()
        const room = document.querySelector('.mf-welcome')?.getBoundingClientRect()
        return stage && room ? { ok: stage.left <= room.left + 0.5 && stage.top <= room.top + 0.5 && stage.right >= room.right - 0.5 && stage.bottom >= room.bottom - 0.5, stage: [stage.left, stage.top, stage.right, stage.bottom].map(Math.round), room: [room.left, room.top, room.right, room.bottom].map(Math.round), screen: [screen.width, screen.height] } : null
      })
      check('the scene covers the window to its edges on this screen\'s shape', covered?.ok === true, JSON.stringify(covered))
      check('the scene window then lets every click through', (await sceneOf())?.through === true, JSON.stringify(await sceneOf()))
      await at(18400)
      check('the scene window is gone by the first words', !(await sceneOf()))
      check('the first words come in the window', await h.evaluate(() => !!document.querySelector('[data-thesis]')))
      // The gold gradient behind the page on this path too (20 Nov, the user: "missing its previous background … the gold
      // gradient"): the page has come in and covers the whole window, its gradient drawn, the haze gone from behind it;
      // and the pixels behind the words are the gradient, not the bare page (the window read off a screenshot, sampled
      // across its right half, where nothing is written).
      await h.waitForTimeout(1500)
      const beside = await h.evaluate(() => {
        const plate = document.querySelector('[data-plate]')?.getBoundingClientRect()
        const canvas = document.querySelector('[data-plate] canvas')?.getBoundingClientRect()
        return {
          covers: !!plate && plate.left <= 1 && plate.right >= innerWidth - 1 && plate.top <= 1 && plate.bottom >= innerHeight - 1,
          gradient: !!canvas && canvas.width > innerWidth / 2,
          fog: !!document.querySelector('[data-welcome-scene="window"]'),
          page: getComputedStyle(document.body).backgroundColor,
          margin: !!document.querySelector('[data-margin]')
        }
      })
      const shot = await h.screenshot({ type: 'png' })
      const seen = await electron.evaluate(({ nativeImage }, b64) => {
        const image = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))
        const { width, height } = image.getSize()
        const bits = image.toBitmap()
        const sum = [0, 0, 0]
        let n = 0
        for (let y = Math.round(height * 0.2); y < height * 0.8; y += 23) for (let x = Math.round(width * 0.55); x < width * 0.95; x += 29) {
          const at = (y * width + x) * 4
          sum[0] += bits[at + 2]; sum[1] += bits[at + 1]; sum[2] += bits[at]; n++
        }
        return sum.map((one) => Math.round(one / n))
      }, shot.toString('base64'))
      const bare = (beside.page.match(/\d+/g) ?? []).slice(0, 3).map(Number)
      const off = Math.max(...seen.map((one, i) => Math.abs(one - (bare[i] ?? one))))
      check('the page has come in and covers the window, the gold gradient behind it and the haze gone', beside.covers && beside.gradient && !beside.fog, JSON.stringify(beside))
      check('behind the words is the gradient, not the bare page', off >= 4, `seen rgb(${seen.join(', ')}) against the page's ${beside.page}`)
      check('no red margin line down the page', !beside.margin)
      // QA_SHOTS: a picture of each page as it stands over the fog, for reading by eye beside Dia's (its panel and its sky).
      if (process.env.QA_SHOTS) {
        mkdirSync(process.env.QA_SHOTS, { recursive: true })
        for (let page = 1; page <= 10; page++) {
          // Catch's "Your turn" waits for a capture of your own: its "Skip trying it" goes on (the loop stood there before).
          const trying = () => h.evaluate(() => !![...document.querySelectorAll('.mf-welcome footer button')].find((one) => /skip trying it/i.test(one.textContent ?? '')))
          for (let i = 0; i < 4; i++) {
            const ready = await h.evaluate(() => { const next = [...document.querySelectorAll('.mf-welcome footer button')].at(-1); return !!next && !next.closest('[inert]') && !next.hasAttribute('disabled') })
            if (ready || (await trying())) break
            await h.keyboard.press('Escape'); await h.waitForTimeout(700)
          }
          await h.waitForTimeout(600)
          const label = await h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
          await h.screenshot({ path: join(process.env.QA_SHOTS, `${THEME}-${String(page).padStart(2, '0')}-${label.replace(/[^a-z]+/gi, '-').slice(0, 30)}.png`) })
          const last = await h.evaluate(() => !!document.querySelector('.mf-welcome [data-recommended]') || /open my book/i.test([...document.querySelectorAll('.mf-welcome footer button')].at(-1)?.textContent ?? ''))
          if (last) break
          await h.evaluate(() => { const all = [...document.querySelectorAll('.mf-welcome footer button')]; (all.find((one) => /skip trying it/i.test(one.textContent ?? '')) ?? all.at(-1))?.click() })
          await h.waitForTimeout(1200)
        }
      }
      check('the window keeps the welcome\'s size', same(await homeOf(), middle), box(await homeOf(), middle))
    }
  }
  // Through the pages to the end, and into the book.
  await h.click('[data-skip]')
  await h.waitForTimeout(900)
  check('the window keeps the welcome\'s size to its last page', same(await homeOf(), middle), box(await homeOf(), middle))
  await h.getByRole('button', { name: 'Open my book' }).click()
  check('as it ends, the window grows back to where it stood', await until(async () => same(await homeOf(), before) && (await steps()).includes('grown'), 4000), box(await homeOf(), before))
  check('its full-screen button on again', (await homeOf())?.full === true)
  const id = (await homeOf())?.id
  check('floated for it and tiled again under AeroSpace', calls().filter((one) => one === `layout floating --window-id ${id}`).length >= 1 && calls().filter((one) => one === `layout tiling --window-id ${id}`).length >= 2, calls().filter((one) => one.startsWith('layout')).join(' | '))
  check('the app comes up in it, the welcome gone', await until(() => h.evaluate(() => !document.querySelector('.mf-welcome') && !document.documentElement.hasAttribute('data-welcoming')), 4000))
  console.log(`steps: ${(await steps()).join(' > ')}`)
} catch (error) {
  failed++
  console.log(`FAIL  ${THEME}: the run broke  (${error.message.split('\n')[0]})`)
} finally {
  await close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
