// A list row's picture tile, when its note's pictures are deleted in the editor, fades from the picture to the
// note's own icon over about 300ms; it never changes in one frame. The row is filmed every 50ms.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [SHOTS=<dir>] node qa/row-thumb-fade.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await s.go('articles')
  const groups = await v('groups', 'article')
  const history = groups.find((one) => one.name === 'History')
  const renaissance = groups.find((one) => one.name === 'Renaissance')
  for (const one of [history, renaissance]) {
    const side = h.locator(`[data-side-folder="${one.id}"]`).first()
    if (await side.count()) { await side.click(); await wait(700) }
  }
  const row = h.locator('[data-id]').filter({ hasText: 'Sistine' }).first()
  await row.waitFor({ timeout: 8000 })
  const id = await row.getAttribute('data-id')
  const tile = row.locator('[data-row-mark]').first()
  await tile.scrollIntoViewIfNeeded()
  check('the row shows its note\'s picture to begin with', (await tile.locator('img').count()) > 0)
  if (shots) await h.screenshot({ path: `${shots}/row-before.png` })
  // The note opened in the editor beside the list, its pictures deleted there, one by one.
  await row.click()
  await wait(1500)
  if (shots) await h.screenshot({ path: `${shots}/opened.png` })
  const count = await h.evaluate(() => { let n = 0; document.querySelector('.ProseMirror')?.editor?.state.doc.descendants((node) => void (/image/i.test(node.type.name) && n++)); return n })
  check('the note opens in the editor with its pictures', count > 0, `${count} pictures`)
  const back = h.locator(`[data-id="${id}"] [data-row-mark]`).first()
  check('the row stays on show beside the open note', (await back.count()) > 0 && (await back.isVisible()))
  // Each deletion filmed twice: every frame the window paints, read in the window (the old picture's opacity over
  // what replaces it), and a picture of the tile every 50ms.
  const sampler = () => h.evaluate((id) => {
    const tile = document.querySelector(`[data-id="${id}"] [data-row-mark]`)
    const out = (window.__tile = [])
    const start = performance.now()
    const tick = () => {
      const leaving = tile.querySelector('[data-picture-leaving]')
      // The row's own picture: the tile's own <img> (a paper cover's is inside its cover). Found by its fade-in class
      // before, which went when a row's picture stopped fading in (it is decoded before the row is drawn).
      const own = [...tile.querySelectorAll('img')].find((img) => !img.hasAttribute('data-picture-leaving') && !img.closest('svg') && img.parentElement === tile)
      const anim = leaving?.getAnimations()[0]
      out.push({ t: Math.round(performance.now() - start), at: anim ? Math.round(anim.currentTime) + '/' + anim.effect.getComputedTiming().duration + ' ' + anim.effect.getComputedTiming().easing : null, leaving: leaving ? +getComputedStyle(leaving).opacity : null, own: own?.getAttribute('src')?.slice(-12) ?? null, icon: !!tile.querySelector('svg') })
      if (performance.now() - start < 3000) requestAnimationFrame(tick)
    }
    tick()
  }, id)
  const film = async (name) => {
    for (let at = 0; at < 40; at++) {
      if (shots) await back.screenshot({ path: `${shots}/${name}-${String(at).padStart(2, '0')}.png` }).catch(() => {})
      await wait(50)
    }
  }
  const runs = []
  for (let left = count; left > 0; left--) {
    // The picture picked in the editor as a click picks it (the whole picture), then deleted with ⌫.
    const picked = await h.evaluate(() => {
      const editor = document.querySelector('.ProseMirror')?.editor
      if (!editor) return false
      let pos = -1
      editor.state.doc.descendants((node, at) => void (pos < 0 && /image/i.test(node.type.name) && (pos = at)))
      if (pos < 0) return false
      editor.chain().focus().setNodeSelection(pos).run()
      return editor.state.selection.node?.type.name ?? false
    })
    if (left === count) check('a picture is picked in the editor', !!picked, String(picked))
    await wait(200)
    await sampler()
    const filming = film(left === 1 ? 'removed' : 'changed')
    await h.keyboard.press('Backspace')
    await filming
    runs.push(await h.evaluate(() => window.__tile))
  }
  for (const [at, run] of runs.entries()) {
    const kind = at === runs.length - 1 ? 'its last picture deleted' : 'a picture deleted, another left'
    const said = run.filter((f, i) => i === 0 || f.leaving !== run[i - 1].leaving || f.own !== run[i - 1].own).map((f) => `${f.t}ms ${f.leaving === null ? 'no old' : 'old ' + f.leaving.toFixed(2)} ${f.own ? 'pic' : f.icon ? 'icon' : '-'} ${f.at}`).join(', ')
    console.log(kind + ': ' + said)
    const goneAt = run.findIndex((f, i) => i > 0 && f.own !== run[0].own)
    const mid = run.filter((f) => f.leaving !== null && f.leaving > 0.1 && f.leaving < 0.9)
    check(`${kind}: the tile changes`, goneAt > 0, `at frame ${goneAt}`)
    check(`${kind}: the first frame without the old picture still shows it over the new, at full strength`, goneAt > 0 && run[goneAt].leaving !== null && run[goneAt].leaving > 0.8, JSON.stringify(run[goneAt]))
    check(`${kind}: it fades out over several frames, then is gone`, mid.length >= 3 && run.at(-1).leaving === null, `${mid.length} frames part-way, ends ${JSON.stringify(run.at(-1))}`)
  }
  if (shots) await h.screenshot({ path: `${shots}/row-after.png` })
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
