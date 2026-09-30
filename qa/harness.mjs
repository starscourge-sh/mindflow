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
import { _electron as electron } from 'playwright'

const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'

export async function open() {
  const app = await electron.launch({ args: ['.'] })
  const page = await app.firstWindow()
  const logs = []
  page.on('console', (message) => logs.push(message.text()))
  page.on('pageerror', (error) => logs.push(`PAGE ERROR: ${error.message}`))
  await page.waitForSelector(EDITOR, { timeout: 15000 })

  const api = {
    page,
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
      await page.click(EDITOR)
      // Vim follows the page switch, so it may or may not be on. Insert mode
      // is where typing works either way.
      if (await page.locator(`${EDITOR}[data-vim-mode="normal"]`).count()) {
        await page.keyboard.press('i')
      }
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.press('Backspace')
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
      const lines = page.locator(`${EDITOR} li > p, ${EDITOR} li > div > p, ${EDITOR} > p`)
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

            if (kind === 'taskItem') {
              const ticked = child.querySelector('input')?.checked ? 'x' : ' '
              const text = child.querySelector('div > p')?.textContent?.trim() ?? ''
              out.push(`${pad}[${ticked}] "${text}"`)
              // Anything nested under the item, which is what a broken convert
              // hides inside one.
              const nested = child.querySelector(':scope > div')
              if (nested) out.push(...walk(nested, depth + 1).filter((l) => !l.includes('"' + text + '"')))
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
