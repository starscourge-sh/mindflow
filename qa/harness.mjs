/**
 * Drive the real app and report what it does.
 *
 * Playwright's Electron driver launches the built app, so this is the same
 * code a user runs - not jsdom, and not the extensions in isolation. Structure
 * is read back as the editor's own HTML, which says everything these checks
 * need (what is nested in what) without a test hook in the shipped code.
 *
 *   npm run build && node qa/harness.mjs
 */
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { execFile } from 'child_process'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'
import { createRequire } from 'module'
import { isRealFolder } from '../src/main/real-folder.ts'
import { _electron as electron } from 'playwright'
import { paste as pasteEvent } from './pasteboard.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
/** Every line of the document, in the order they are read. */
const LINES = `${EDITOR} li > p, ${EDITOR} li > div > p, ${EDITOR} > p, ${EDITOR} > h1, ${EDITOR} > h2`

/**
 * One pass and fail count for a probe: `check(name, ok, detail)` prints a
 * PASS or FAIL line and returns whether it passed; `done()` prints
 * "N/M passed" and ends the run, failing it when any check failed.
 */
/**
 * Whether the welcome wears its paper background, the one with leaves
 * (WELCOME_BACKGROUND in welcome.tsx). With the gradient there are none, so the
 * leaf checks have nothing to look at.
 */
export const welcomeHasLeaves = () =>
  /WELCOME_BACKGROUND:[^=]*=\s*'paper'/.test(readFileSync(new URL('../src/renderer/src/components/haligtree/welcome.tsx', import.meta.url), 'utf8'))

/**
 * A build can run only where it finds its libraries: one copied or built outside a worktree (15 Nov 2026, a helper's
 * scratch out-base) dies on its first `require`, before the app's own handlers exist, and Electron then shows its raw
 * error box on the screen of whoever is at the Mac. Every dependency the app declares must resolve from the build.
 */
export function launchable(entry) {
  const missing = Object.keys(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies ?? {}).filter((name) => {
    try {
      createRequire(resolve(entry)).resolve(`${name}/package.json`)
      return false
    } catch {
      try {
        createRequire(resolve(entry)).resolve(name)
        return false
      } catch {
        return true
      }
    }
  })
  if (missing.length) throw new Error(`The build at ${entry} cannot find ${missing.slice(0, 3).join(', ')}: it sits outside a worktree, and would crash with an error box on the real screen. Build it inside a worktree.`)
}

export function checks() {
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(!!ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`)
    return !!ok
  }
  const done = () => {
    const passed = results.filter(Boolean).length
    console.log(`${passed}/${results.length} passed`)
    process.exit(passed === results.length ? 0 : 1)
  }
  return { check, done, results }
}

/**
 * Every app this run started: killed outright however the run ends (done, failed, interrupted), told once. Under
 * qa/batch.mjs (several probes in one launch) the batch keeps its own watch over the run's signals; the run's end
 * still kills every app it started.
 */
const started = new Set()
const endAll = () => { for (const child of started) try { child.kill('SIGKILL') } catch {} }
let told = false
const killedAtEnd = (child) => {
  started.add(child)
  child.once('exit', () => started.delete(child))
  if (told) return
  told = true
  process.on('exit', endAll)
  if (globalThis.qaBatch) return
  // SIGALRM is what 'perl -e "alarm 280; exec"' sends when a run takes too long; SIGHUP a closed terminal.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGALRM', 'SIGHUP']) process.on(signal, () => { endAll(); process.exit(1) })
  process.on('uncaughtException', (error) => { console.error(error); endAll(); process.exit(1) })
  process.on('unhandledRejection', (error) => { console.error(error); endAll(); process.exit(1) })
}

/**
 * The app, started for this probe, and the helpers below. Under qa/batch.mjs (several probes in one launch) the
 * batch hands over its running app instead, put back as it started between two probes.
 */
export async function open() {
  return helpers(globalThis.qaBatch ? await globalThis.qaBatch.open() : await boxOf(await launch()))
}

/**
 * The built app started on a data folder of its own (QA_DATA, or a fresh one), its windows parked and floated.
 * `timing`: started by Electron itself, as a person's launch is: Playwright's own loader holds the app's `ready` back
 * until Playwright has attached, and turns off Chromium's throttling of hidden pages (qa/start-time.mjs).
 */
export async function launch({ timing = false } = {}) {
  // A fresh folder for the app's data, so a run never touches your real captures.
  // QA_DATA points a run at a copy of real data, to see it with a real corpus.
  const data = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
  // Never your real notes, under the app's new name or its first: the app
  // refuses them too (src/main/real-folder.ts), this says why before it starts.
  if (isRealFolder(data, join(homedir(), 'Library', 'Application Support'))) throw new Error(`QA_DATA is your real data folder (${data}): point it at a copy`)
  // QA_ENTRY runs a build kept apart from out/, so one test's build does not
  // pull the app out from under another test running at the same time.
  // QA_ARGS adds launch flags, such as --sandbox for the practice copy.
  const extra = (process.env.QA_ARGS ?? '').split(' ').filter(Boolean)
  // Never Electron's own welcome window on someone's screen: a run whose
  // build is missing stops here instead of opening a bare Electron.
  const entry = process.env.QA_ENTRY ?? join(process.cwd(), 'out/main/index.js')
  // QA_APP runs a packaged app instead, by the path of its program (…/Haligtree.app/Contents/MacOS/Haligtree):
  // its own Electron and the code inside it, to check what only a packaged app does (where its files are loaded from).
  const packaged = process.env.QA_APP
  if (packaged ? !existsSync(packaged) : !existsSync(entry)) throw new Error(`No build at ${packaged ?? entry}: build first (npx electron-vite build --outDir out-x)`)
  if (!packaged) launchable(entry)
  const how = packaged ? { executablePath: packaged, args: extra } : timing ? { executablePath: createRequire(import.meta.url)('electron'), args: [entry, ...extra] } : { args: [entry, ...extra] }
  const app = await electron.launch({ ...how, env: { HALIGTREE_QA_AWAY: '1', ...process.env, HALIGTREE_USER_DATA: data } })
  // Never left running: the app keeps its windows when asked to close (a
  // window put away, not quit), so a plain kill can leave it stuck exiting.
  const child = app.process()
  killedAtEnd(child)
  // A tiling window manager (AeroSpace) would tile the test windows into the
  // workspace in use: float each of this run's windows as it appears, so the
  // app can park it past the screen's edge.
  if (process.env.HALIGTREE_QA_AWAY !== '0') {
    const floated = new Set()
    // One ask at a time, and none that hangs: a stuck AeroSpace once piled up
    // thousands of waiting calls until no process could start.
    let asking = false
    const float = setInterval(() => {
      if (asking) return
      asking = true
      execFile('aerospace', ['list-windows', '--all', '--format', '%{window-id}|%{app-pid}'], { timeout: 2000 }, (error, out) => {
        asking = false
        if (error) return clearInterval(float)
        for (const line of out.split('\n')) {
          const [id, pid] = line.split('|')
          if (Number(pid) !== child.pid || floated.has(id)) continue
          floated.add(id)
          execFile('aerospace', ['layout', '--window-id', id, 'floating'], () => {})
        }
      })
    }, 250)
    float.unref()
    child.once('exit', () => clearInterval(float))
  }
  return app
}

/**
 * An app just started, and its box (the window with no view of its own): { app, page, logs }. Anything that fails on
 * the way kills the app, so no window is left behind.
 */
export async function boxOf(app) {
  try {
    // The box: the window with no view of its own. On a second run over the
    // same data the main window, left open last time, can come up first.
    // Waited for generously: the box is made only once the main window is on
    // screen (up to four seconds on), and probes run side by side load the Mac.
    await app.firstWindow({ timeout: 60000 })
    const isBox = (one) => /\.html|^https?:/.test(one.url()) && !/[?&]view=/.test(one.url())
    let page = app.windows().find(isBox)
    for (let i = 0; !page && i < 300; i++) (await new Promise((done) => setTimeout(done, 100)), (page = app.windows().find(isBox)))
    if (!page) throw new Error('no box window')
    const logs = watch(page)
    await page.waitForSelector(EDITOR, { timeout: 30000 })
    return { app, page, logs }
  } catch (error) {
    try { app.process().kill('SIGKILL') } catch {}
    throw error
  }
}

/**
 * ⌘A until the whole note with the keys is picked: in a note each press picks a step more (lib/grow-selection.ts),
 * the line, its block, its list, its section, then the whole note. With no note in focus (a field, a list) one press.
 */
export async function pickAll(page) {
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('ControlOrMeta+a')
    if (await page.evaluate(() => (document.activeElement?.closest('.tiptap')?.editor?.state.selection.toJSON().type ?? 'all') === 'all')) return
  }
}

/** The box's console and its page errors, as they come, for `logs` and `drain()`. */
export function watch(page) {
  const logs = []
  page.on('console', (message) => logs.push(message.text()))
  page.on('pageerror', (error) => logs.push(`PAGE ERROR: ${error.message}`))
  return logs
}

/** The helpers every probe drives the app with. */
function helpers({ app, page, logs }) {
  const api = {
    page,
    /** The Electron app itself, for reaching the main process. */
    electron: app,
    logs,
    /** Console output since the last call, for debugging a case. */
    drain() {
      return logs.splice(0, logs.length)
    },

    /** Empty the document and leave the caret in it, ready to type. */
    async reset() {
      // The app restores a draft, so without this each case starts on the last
      // one's leftovers.
      await page.evaluate(() => localStorage.clear())
      // Collapse whatever the last case left selected: the selection toolbar
      // floats over the text, and the click below lands on it instead.
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(120)
      // A word left alone in the box has its meaning shown under it (word-define.tsx), over the middle of the note,
      // where the click below lands: Esc, the meaning's own while it is up, puts it away first (qa/vim-more.mjs in a
      // batch, 18 Nov, waited out its 30 s on the meaning of "hello").
      if (await page.evaluate(() => !!document.querySelector('[data-define]') && !!document.activeElement?.closest('.ProseMirror'))) {
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => !document.querySelector('[data-define]'), null, { timeout: 2000 }).catch(() => {})
      }
      await page.click(EDITOR)
      // Vim follows the page switch, so it may or may not be on. Insert mode
      // is where typing works either way.
      if (await page.locator(`${EDITOR}[data-vim-mode="normal"]`).count()) {
        await page.keyboard.press('i')
      }
      await pickAll(page)
      await page.keyboard.press('Backspace')

      // Wait until it is genuinely empty. Without this a case starts typing
      // into the tail of the last one and its text arrives interleaved.
      await page.waitForFunction(
        (selector) => (document.querySelector(selector)?.textContent ?? '').trim() === '',
        EDITOR,
        { timeout: 5000 }
      )
    },

    /** Type lines, pressing Enter between them. */
    async type(lines) {
      for (let i = 0; i < lines.length; i++) {
        if (i) await page.keyboard.press('Enter')
        // Slowly enough that the input rules keep up. At a few milliseconds
        // the characters and the rule that turns "- " into a bullet arrive out
        // of order, and a letter lands in the middle of the word before.
        await page.keyboard.type(lines[i], { delay: 30 })
      }
      await page.waitForTimeout(80)
    },

    /**
     * Paste text, the way a real note arrives.
     *
     * Typing exercises the input rules; pasting exercises the markdown parser,
     * and the two build different documents from the same characters.
     */
    async paste(text) {
      const editor = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
      await page.evaluate((editor) => document.querySelector(editor)?.focus(), editor)
      await pasteEvent(page, text, editor)
      await page.waitForTimeout(300)
    },

    /**
     * Drag the block on one line onto another, by its handle.
     *
     * Hovering the line is what reveals the handle, so that comes first, and
     * the drop aims at the half of the target the block should end up on.
     */
    async drag(fromIndex, toIndex, { alt = false } = {}) {
      const lines = page.locator(LINES)
      await lines.nth(fromIndex).hover()
      await page.waitForTimeout(150)

      const grip = page.locator('.tiptap-drag-handle-grip')
      await grip.waitFor({ state: 'visible', timeout: 4000 })

      const target = await lines.nth(toIndex).boundingBox()
      const from = await grip.boundingBox()
      if (!target || !from) throw new Error('no box to drag between')

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      if (alt) await page.keyboard.down('Alt')
      await page.mouse.down()
      // Which half of the target decides which side of it the block lands, so
      // a drag upwards aims high and a drag downwards aims low. Several steps
      // because one jump is not a drag - the handle needs movement to start one.
      const edge = toIndex < fromIndex ? 0.2 : 0.8
      await page.mouse.move(target.x + 40, target.y + target.height * edge, { steps: 12 })
      await page.waitForTimeout(120)
      await page.mouse.up()
      if (alt) await page.keyboard.up('Alt')
      await page.waitForTimeout(250)
    },

    /**
     * Drag a block to somewhere off-screen, holding at the edge so the
     * document scrolls under it. This is the move a long note needs and the
     * one that cannot be done with a single jump.
     */
    async dragToEdge(fromIndex, { up = false, hold = 1500 } = {}) {
      const lines = page.locator(LINES)
      await lines.nth(fromIndex).hover()
      await page.waitForTimeout(150)

      const grip = page.locator('.tiptap-drag-handle-grip')
      await grip.waitFor({ state: 'visible', timeout: 4000 })
      const from = await grip.boundingBox()
      const box = await page.locator('.haligtree-editor-content').boundingBox()
      if (!from || !box) throw new Error('no box to drag in')

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      const edge = up ? box.y + 20 : box.y + box.height - 20
      await page.mouse.move(box.x + 60, edge, { steps: 10 })

      // Held at the edge, nudging, because the scroll runs off dragover.
      const until = Date.now() + hold
      while (Date.now() < until) {
        await page.mouse.move(box.x + 60, edge + (Date.now() % 2 ? 1 : -1))
        await page.waitForTimeout(30)
      }
      // Back inside before letting go: on the very edge the pointer is over
      // the scroll boundary rather than over a line to drop against.
      await page.mouse.move(box.x + 60, up ? box.y + 80 : box.y + box.height - 80, { steps: 5 })
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(250)
    },

    /** How far the document has scrolled. */
    scrollTop() {
      return page.$eval('.haligtree-editor-content', (box) => box.scrollTop)
    },

    async press(...keys) {
      for (const key of keys) {
        await page.keyboard.press(key)
        // A command re-renders the document; clicking or pressing again before
        // that settles acts on the shape that was there a moment ago.
        await page.waitForTimeout(140)
      }
    },

    /** Click the nth line of the document, the way a person would. */
    async line(index) {
      const lines = page.locator(LINES)
      await lines.nth(index).click()
      // The click and the selection it causes are not the same tick: press a
      // key too soon and it lands wherever the caret was before.
      await page.waitForTimeout(120)
    },

    /**
     * The document, as a shape that is easy to read in a report.
     *
     * A task item is reported as one line rather than the label, checkbox,
     * span and div it is really made of: what these checks are about is which
     * list holds what, and that detail buries it.
     */
    async shape() {
      return page.$eval(EDITOR, (root) => {
        const walk = (element, depth) => {
          const out = []
          for (const child of element.children) {
            const pad = '  '.repeat(depth)
            const kind = child.getAttribute('data-type')

            // A task item is an `li` holding a checkbox; nothing marks it with
            // a data-type, so that is what it is recognised by.
            if (child.tagName === 'LI' && child.querySelector(':scope > label > input')) {
              const ticked = child.querySelector(':scope > label > input')?.checked
              const body = child.querySelector(':scope > div')
              const text = body?.querySelector(':scope > p')?.textContent?.trim() ?? ''
              out.push(`${pad}[${ticked ? 'x' : ' '}] "${text}"`)
              // Everything else under the item - which is where a broken
              // convert hides a whole list.
              if (body) {
                for (const part of body.children) {
                  if (part.tagName === 'P') continue
                  out.push(...walk({ children: [part] }, depth + 1))
                }
              }
              continue
            }

            const tag = child.tagName.toLowerCase()
            const name = kind ? `${tag}[${kind}]` : tag
            const text = child.firstElementChild ? '' : ` "${(child.textContent ?? '').trim()}"`
            out.push(`${pad}${name}${text}`)
            out.push(...walk(child, depth + 1))
          }
          return out
        }
        return walk(root, 0).join('\n')
      })
    },

    /** Where the caret is, as the text of the line it is on. */
    async caretLine() {
      return page.evaluate(() => {
        const node = window.getSelection()?.anchorNode
        const element = node?.nodeType === 3 ? node.parentElement : node
        return element?.closest('li, p, h1, h2, h3')?.textContent?.trim() ?? null
      })
    },

    async close() {
      // Electron can sit on the close; the harness should not hang a test run.
      await Promise.race([app.close(), new Promise((done) => setTimeout(done, 4000))])
    }
  }

  return api
}
