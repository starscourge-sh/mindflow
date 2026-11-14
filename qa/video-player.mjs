// A video wears the sound player (sound-player.tsx, VideoPlayer): in a note and in Files' viewer, the same round play,
// the same line with its playhead, the same time words and speeds, the same keys; its poster before it plays; its bar
// stepping away while it plays and the pointer is still; a portrait one whole; one that will not play says so. Files'
// Videos tab puts the one last watched in front with how far it got, the others begun under "Carry on watching", and
// every video as a wide tile with its note and length. Real input throughout (pointer and keys).
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] [PART=note|files] node qa/video-player.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.env.SHOTS
const PART = process.env.PART ?? 'all'
const here = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'video-player-'))
const film = (name, size, seconds) => {
  const out = join(here, name)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=15:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', out])
  return out
}
const files = {
  lecture: film('Lecture clip.mp4', '320x180', 12),
  seminar: film('Seminar talk.mp4', '320x180', 10),
  portrait: film('Portrait clip.mp4', '180x320', 6),
  sound: (() => { const out = join(here, 'Voice note.m4a'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'aac', out]); return out })(),
  broken: (() => { const out = join(here, 'Broken film.mov'); writeFileSync(out, Buffer.alloc(4096, 7)); return out })()
}

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const frames = async (name, count = 10) => { if (!SHOTS) return; const t0 = Date.now(); for (let at = 0; at < count; at++) { await h.screenshot({ path: `${SHOTS}/${name}-${String(at).padStart(2, '0')}-${Date.now() - t0}ms.png` }); const next = (at + 1) * 50 - (Date.now() - t0); if (next > 0) await wait(next) } }
const style = (name) => h.evaluate((one) => { localStorage.setItem('style', one); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
const pickNext = (paths) => electron.evaluate(({ dialog }, list) => { dialog.showOpenDialog = async () => ({ canceled: !list.length, filePaths: list }) }, paths)
const box = (selector) => h.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }, selector)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('media'); await wait(900)
  if (SHOTS) {
    await h.evaluate(() => [...document.querySelectorAll('[data-page=media] [data-media-kinds] button')].find((one) => /^Videos/.test(one.textContent.trim()))?.click()); await wait(800)
    await shot('files-videos-before')
  }
  // ── Added through "Choose files…" (the picker's stand-in) ──
  await pickNext(Object.values(files))
  if (!(await h.locator('[data-media-choose]').count())) await h.locator('[data-media-add]').click()
  await h.locator('[data-media-choose]').click(); await wait(2500)
  const all = await v('media:list')
  const of = (path) => all.find((one) => path.endsWith(one.name))
  const [lecture, seminar, portrait, sound, broken] = [files.lecture, files.seminar, files.portrait, files.sound, files.broken].map(of)
  check('the films, a recording and a broken film were added', [lecture, seminar, portrait, sound, broken].every(Boolean), JSON.stringify(all.map((one) => one.name)))
  // The seminar was begun earlier, elsewhere (its place told to main as a player tells it): 4 s of 10.
  await v('media:place', seminar.src, 10, 4)

  const attach = (one) => ({ type: 'attachment', attrs: { src: one.src, name: one.name, size: one.size } })
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const noteId = await h.evaluate((content) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content } }).then((made) => made.id ?? made),
    [para('Seminar pack'), attach(lecture), para('A recording beside it'), attach(sound), para('Upright'), attach(portrait), para('Broken'), attach(broken), para('End')])
  await wait(400)
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id } })), noteId); await wait(2500)

  if (PART === 'all' || PART === 'note') {
    const VIDEO = `[data-pane] .tiptap-attachment.is-video [data-video-player]:has(video[src="${lecture.src}"])`
    const looks = await h.evaluate((sel) => {
      const player = document.querySelector(sel)
      const audio = document.querySelector('[data-pane] .tiptap-attachment.is-audio [data-sound-player]')
      const part = (root, one) => { const el = root?.querySelector(one); if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), radius: s.borderRadius, size: s.fontSize } }
      return {
        player: !!player, bar: !!player?.querySelector('[data-sound-player][data-inline]'), stock: !!player?.querySelector('video[controls], input[type=range]'),
        play: part(player, '[data-sound-play]'), playA: part(audio, '[data-sound-play]'),
        head: part(player, '[data-playhead]'), headA: part(audio, '[data-playhead]'),
        time: part(player, '[data-sound-time]'), timeA: part(audio, '[data-sound-time]'),
        timeWords: player?.querySelector('[data-sound-time]')?.textContent, speed: player?.querySelector('[data-speed]')?.textContent,
        pip: !!player?.querySelector('[data-video-pip]'), full: !!player?.querySelector('[data-video-full]')
      }
    }, VIDEO)
    check('a video in a note is drawn by the sound player (its bar is [data-sound-player], one line)', looks.player && looks.bar && !looks.stock, JSON.stringify(looks))
    check('the same round play as a recording\'s (size and corners)', looks.play && looks.playA && looks.play.w === looks.playA.w && looks.play.h === looks.playA.h && looks.play.radius === looks.playA.radius, JSON.stringify([looks.play, looks.playA]))
    check('the same playhead and the same time words', looks.head && looks.headA && looks.head.w === looks.headA.w && looks.time?.size === looks.timeA?.size, JSON.stringify([looks.head, looks.headA, looks.time, looks.timeA]))
    check('at rest it says its length (0:12) and 1×', looks.timeWords === '0:12' && /^1×/.test(looks.speed ?? ''), `${looks.timeWords} ${looks.speed}`)
    check('picture in picture and full screen are kept', looks.pip && looks.full)
    const poster = await h.evaluate(async (sel) => {
      const video = document.querySelector(`${sel} video`)
      const own = video?.getAttribute('poster')
      let drawn = 0
      if (own) { const img = new Image(); img.src = own; await img.decode().catch(() => undefined); drawn = img.naturalWidth }
      const bg = getComputedStyle(document.querySelector(`${sel} .mf-video-picture`)).backgroundColor
      return { own: !!own, drawn, paused: video?.paused, bg }
    }, VIDEO)
    check('before it plays, its poster frame shows (Quick Look\'s), not a black box', poster.own && poster.drawn > 8 && poster.paused && !/rgb\(0, 0, 0\)/.test(poster.bg), JSON.stringify(poster))
    await shot('note-rest')
    if (SHOTS) for (const name of ['light', 'dark']) { await c.look(name); await wait(300); await h.locator(VIDEO).scrollIntoViewIfNeeded(); await shot(`note-rest-${name}`) }
    // The theme's crossfade takes the page's clicks while it runs: let it end.
    await c.look('light'); await wait(1500)

    // ── Played by a click on its picture; its keys heard at once ──
    const pic = await box(`${VIDEO} .mf-video-picture`)
    await h.mouse.move(pic.x + pic.w / 2, pic.y + pic.h / 3)
    await h.mouse.click(pic.x + pic.w / 2, pic.y + pic.h / 3); await wait(700)
    const after = await h.evaluate((sel) => ({ playing: !document.querySelector(`${sel} video`).paused, focused: document.activeElement === document.querySelector(sel), state: document.querySelector(sel).dataset.state }), VIDEO)
    check('a click on its picture plays it, and the player has the keys', after.playing && after.focused && after.state === 'playing', JSON.stringify(after))
    await frames('note-playing')
    await h.keyboard.press('Space'); await wait(300)
    check('Space pauses it', after.playing && await h.evaluate((sel) => document.querySelector(`${sel} video`).paused, VIDEO))
    const t0 = await h.evaluate((sel) => document.querySelector(`${sel} video`).currentTime, VIDEO)
    await h.keyboard.press('ArrowRight'); await wait(300)
    const t1 = await h.evaluate((sel) => document.querySelector(`${sel} video`).currentTime, VIDEO)
    check('→ moves on five seconds, as a recording\'s does', Math.abs(t1 - t0 - 5) < 0.6, `${t0.toFixed(2)} → ${t1.toFixed(2)}`)
    await h.keyboard.press('ArrowLeft'); await wait(300)
    const t2 = await h.evaluate((sel) => document.querySelector(`${sel} video`).currentTime, VIDEO)
    check('← goes back five', Math.abs(t2 - t0) < 0.6, `${t1.toFixed(2)} → ${t2.toFixed(2)}`)
    const words = await h.evaluate((sel) => document.querySelector(`${sel} [data-sound-time]`).textContent, VIDEO)
    check('started, the time says how far in', /^0:0\d$/.test(words), words)
    // ── The speed steps 1×, 1.5×, 2× and back, as a recording's ──
    const speeds = []
    for (let at = 0; at < 3; at++) { await h.locator(`${VIDEO} [data-speed]`).click({ force: true }); await wait(150); speeds.push(await h.evaluate((sel) => `${document.querySelector(`${sel} [data-speed] span`).textContent}@${document.querySelector(`${sel} video`).playbackRate}`, VIDEO)) }
    check('the speed steps 1.5×, 2×, 1× (the sound player\'s three)', speeds.join(' ') === '1.5×@1.5 2×@2 1×@1', speeds.join(' '))
    // ── Scrubbing: the playhead held and dragged, the bar held in sight ──
    const wave = await box(`${VIDEO} [data-wave]`)
    await h.mouse.move(wave.x + wave.w * 0.25, wave.y + wave.h / 2)
    await h.mouse.down(); await wait(100)
    await h.mouse.move(wave.x + wave.w * 0.5, wave.y + wave.h / 2, { steps: 5 }); await wait(150)
    const held = await h.evaluate((sel) => ({ scrubbing: document.querySelector(sel).hasAttribute('data-scrubbing'), at: document.querySelector(`${sel} video`).currentTime }), VIDEO)
    await shot('note-scrubbing')
    await h.mouse.up(); await wait(200)
    check('dragged along its line it scrubs (to half way: 0:06)', held.scrubbing && Math.abs(held.at - 6) < 0.8, JSON.stringify(held))
    check('let go, it is no longer held', !(await h.evaluate((sel) => document.querySelector(sel).hasAttribute('data-scrubbing'), VIDEO)))
    // ── Playing and still, the bar steps away; a move brings it back ──
    await h.mouse.click(pic.x + pic.w / 2, pic.y + pic.h / 3); await wait(200)
    const playingNow = await h.evaluate((sel) => !document.querySelector(`${sel} video`).paused, VIDEO)
    await wait(3000)
    const rest = await h.evaluate((sel) => Number(getComputedStyle(document.querySelector(`${sel} .mf-video-bar`)).opacity), VIDEO)
    await h.mouse.move(pic.x + pic.w / 2 + 30, pic.y + pic.h / 3 + 10, { steps: 3 }); await wait(80)
    const back = await h.evaluate((sel) => Number(getComputedStyle(document.querySelector(`${sel} .mf-video-bar`)).opacity), VIDEO)
    check('playing with the pointer still, its bar steps away; a move brings it back at once', playingNow && rest < 0.05 && back > 0.95, `playing ${playingNow}, still ${rest}, moved ${back}`)
    // ── Done: End, then it plays to its end and offers to play again ──
    await h.locator(VIDEO).focus()
    await h.keyboard.press('End'); await wait(900)
    const ended = await h.evaluate((sel) => ({ state: document.querySelector(sel).dataset.state, label: document.querySelector(`${sel} [data-sound-play]`).getAttribute('aria-label') }), VIDEO)
    check('at its end: done, with "Play again"', ended.state === 'ended' && ended.label === 'Play again', JSON.stringify(ended))
    await shot('note-done')
    // ── Its place is kept as it stops ──
    await h.keyboard.press('Home'); await wait(200)
    await h.keyboard.press('Space'); await wait(2600)
    await h.keyboard.press('Space'); await wait(700)
    const kept = (await v('media:list')).find((one) => one.src === lecture.src)
    check('paused part way, where it stopped is kept with its length', kept?.played > 1.5 && kept?.played < 4 && Math.abs((kept?.seconds ?? 0) - 12) < 0.5 && !!kept?.playedAt, JSON.stringify({ played: kept?.played, seconds: kept?.seconds }))
    // ── A portrait film stays whole; a broken one says so ──
    const upright = await h.evaluate((src) => {
      const player = document.querySelector(`[data-pane] [data-video-player]:has(video[src="${src}"]) .mf-video-picture`)
      player?.scrollIntoView({ block: 'center' })
      const r = player?.getBoundingClientRect()
      return r ? { w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight } : null
    }, portrait.src)
    await wait(300)
    await shot('note-portrait')
    check('a portrait film stays whole in the window, at its own shape', upright && upright.h <= upright.vh * 0.72 && Math.abs(upright.w / upright.h - 180 / 320) < 0.03, JSON.stringify(upright))
    await wait(1500)
    const shapes = await h.evaluate((id) => window.api.captures.get(id).then((one) => (one.body.content ?? []).filter((node) => node.type === 'attachment').map((node) => [node.attrs.name, node.attrs.shape ?? null])), noteId)
    check('each film\'s shape is kept on its block, so its room is right from the first frame next time', shapes.some(([name, shape]) => name === 'Portrait clip.mp4' && Math.abs(shape - 0.563) < 0.002) && shapes.some(([name, shape]) => name === 'Lecture clip.mp4' && Math.abs(shape - 1.778) < 0.002), JSON.stringify(shapes))
    const sorry = await h.evaluate((src) => document.querySelector(`[data-pane] [data-video-player]:has(video[src="${src}"]) [data-video-broken]`)?.textContent ?? '', broken.src)
    check('a film that will not play says so in words, with a way to its own app', /This video will not play here/.test(sorry) && /Open in its app/.test(sorry), sorry)
    if (SHOTS) { await h.evaluate((src) => document.querySelector(`[data-pane] [data-video-player]:has(video[src="${src}"])`)?.scrollIntoView({ block: 'center' }), broken.src); await wait(200); await shot('note-broken') }
  }

  if (PART === 'all' || PART === 'files') {
    // The lecture was watched last: in a note (part one), its place kept as that note was put away; else told here, 3 s of 12.
    if (PART === 'files') await v('media:place', lecture.src, 12, 3)
    await go('media'); await wait(600)
    await h.locator('[data-page=media] [data-media-kinds] button', { hasText: /^Videos/ }).first().click(); await wait(1800)
    const kept = (await v('media:list')).find((one) => one.src === lecture.src)
    const share = kept?.played / kept?.seconds
    const left = `${Math.ceil(kept?.seconds - kept?.played)} s left`
    const front = await h.evaluate(() => {
      const one = document.querySelector('[data-video-front]')
      return one && { src: one.dataset.src, words: one.innerText.replace(/\s+/g, ' '), progress: Number(one.querySelector('[data-video-progress]')?.dataset.videoProgress ?? -1) }
    })
    check('in front: the video last watched, its name, its note, its length and how much is left', front?.src === lecture.src && /Lecture clip/.test(front.words) && /Seminar pack/.test(front.words) && /0:12/.test(front.words) && front.words.includes(left), `${JSON.stringify(front)} want ${left}`)
    check('how far it got, as a line along its foot (where it was left)', share > 0.1 && Math.abs((front?.progress ?? -1) - share) < 0.01, `${front?.progress} want ${share?.toFixed(3)}`)
    const carry = await h.evaluate(() => [...document.querySelectorAll('[data-video-carry] [data-video-card]')].map((one) => ({ src: one.dataset.src, progress: Number(one.querySelector('[data-video-progress]')?.dataset.videoProgress ?? -1), words: one.innerText.replace(/\s+/g, ' ') })))
    check('"Carry on watching" holds the other one begun, with its line', carry.length === 1 && carry[0].src === seminar.src && Math.abs(carry[0].progress - 0.4) < 0.02 && /6 s left/.test(carry[0].words), JSON.stringify(carry))
    // The front and a carry-on tile have the grid's own right-click menu.
    const menus = []
    for (const sel of ['[data-video-front] .files-video-front-face', '[data-video-carry] [data-video-card]']) {
      await h.locator(sel).first().click({ button: 'right' }); await wait(400)
      menus.push(await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()).join(' | ')))
      await h.keyboard.press('Escape'); await wait(300)
    }
    check('the front and a carry-on tile right-click to the same menu as a tile', /Open note/.test(menus[0]) && /Put in a note/.test(menus[0]) && /Play it|Open note/.test(menus[1]) && /Put in a note/.test(menus[1]), menus.join(' // '))
    const grid = await h.evaluate(() => [...document.querySelectorAll('[data-video-card=grid]')].map((one) => ({ src: one.dataset.src, words: one.innerText.replace(/\s+/g, ' '), ratio: ((r) => r.width / r.height)(one.querySelector('.files-video-pic').getBoundingClientRect()) })))
    check('every video is a wide tile in the grid (the broken one too)', grid.length === 4 && grid.every((one) => Math.abs(one.ratio - 16 / 9) < 0.05), JSON.stringify(grid.map((one) => one.ratio.toFixed(2))))
    check('each tile says its note and its length once read', grid.filter((one) => one.src !== broken.src).every((one) => /Seminar pack|In no note/.test(one.words)) && /0:12/.test(grid.find((one) => one.src === lecture.src)?.words ?? '') && /0:06/.test(grid.find((one) => one.src === portrait.src)?.words ?? ''), JSON.stringify(grid.map((one) => one.words)))
    await shot('files-videos')
    if (SHOTS) {
      await h.evaluate(() => document.querySelector('[data-video-card=grid]')?.scrollIntoView({ block: 'center' })); await wait(400)
      await shot('files-videos-grid')
      await h.evaluate(() => document.querySelector('[data-video-front]')?.scrollIntoView({ block: 'start' })); await wait(300)
      for (const look of ['light', 'dark']) for (const st of ['soft', 'paper', 'brutal']) { await c.look(look); await style(st); await wait(500); await shot(`files-videos-${look}-${st}`) }
      await style('soft'); await c.look('light'); await wait(300)
      for (const kind of ['Audio', 'Images', 'Books']) { await h.locator('[data-page=media] [data-media-kinds] button', { hasText: new RegExp(`^${kind}`) }).first().click().catch(() => undefined); await wait(900); await shot(`files-sibling-${kind.toLowerCase()}`) }
      await h.locator('[data-page=media] [data-media-kinds] button', { hasText: /^Videos/ }).first().click(); await wait(1200)
    }
    // ── The front plays from where it was left, in the viewer, with the same player and its keys ──
    await h.locator('[data-video-front] .files-video-front-face').click(); await wait(1500)
    const look = await h.evaluate(() => {
      const video = document.querySelector('[data-file-look=video] video')
      return { open: !!video, playing: !!video && !video.paused, at: video?.currentTime ?? -1, player: !!document.querySelector('[data-file-look=video] [data-video-player] [data-sound-player][data-inline]'), stock: !!video?.hasAttribute('controls') }
    })
    check('the front opens the viewer, playing from where it was left', look.open && look.playing && look.at >= kept.played - 0.2, `${JSON.stringify(look)} left at ${kept.played}`)
    check('the viewer\'s player is the same sound player', look.player && !look.stock, JSON.stringify(look))
    await frames('look-playing')
    await h.keyboard.press('Space'); await wait(300)
    const paused = await h.evaluate(() => document.querySelector('[data-file-look=video] video').paused)
    const u0 = await h.evaluate(() => document.querySelector('[data-file-look=video] video').currentTime)
    await h.keyboard.press('ArrowLeft'); await wait(300)
    const u1 = await h.evaluate(() => document.querySelector('[data-file-look=video] video').currentTime)
    check('in the viewer, Space pauses and ← goes back five', paused && u0 - u1 > 2.5, `${paused} ${u0.toFixed(2)} → ${u1.toFixed(2)}`)
    await shot('look-paused')
    await h.keyboard.press('Escape'); await wait(500)
    check('Esc puts the viewer away', !(await h.evaluate(() => !!document.querySelector('[data-file-look]'))))
  }
  console.log('errors', c.errors.slice(0, 5))
} catch (error) {
  check('ran without throwing', false, error.stack ?? error)
} finally {
  await c.close()
  rmSync(here, { recursive: true, force: true })
  done()
}
