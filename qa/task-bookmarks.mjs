// A task named by a link shows as a bookmark (the user, 20 Nov: "a bookmark (mindflow) like feature with tasks so that
// links don't look so horrible"): the page's own title as its name (YouTube by oEmbed), the site's icon in its row
// opening the address; the site and path while the title is coming, never the query. The link itself shows as the
// add bar's chip (the page's icon and title, task-site.tsx TaskLink), never its raw address.
// Words typed beside the link stay the name. The same on Tasks, Today in quick capture, the Calendar, the desk sticky,
// the Journal's "Today's tasks" and ⌘K. Main's link lookup is stood in for (task-details.mjs's way): nothing is
// asked of the web, and the Mac's clipboard is never touched (pastes are synthetic events).
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/task-bookmarks.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, go, both, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const YT = 'https://youtu.be/hi8meiPUt84?si=b8PFg1eTrFykzxCf'
const PAGE = 'https://example.com/essays/on-gardens?ref=newsletter'
const ADD = 'form input[data-task-input]'
// A site icon as a page would give one: YouTube's red play mark, drawn here (nothing asked of the web).
const PNG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="0" y="2" width="16" height="12" rx="3" fill="#e62117"/><path d="M6.5 5.5v5l4-2.5z" fill="#fff"/></svg>')}`
const paste = (text) => h.evaluate((t) => {
  const data = new DataTransfer()
  data.setData('text/plain', t)
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, text)
const row = (title) => h.locator('[data-task-row]', { hasText: title }).first()
try {
  // The stand-ins: YouTube answers as its oEmbed would (held until let go, to see the wait), any other page as a page.
  await electron.evaluate(({ ipcMain, shell }, png) => {
    globalThis.qaOpened = []
    shell.openExternal = async (url) => void globalThis.qaOpened.push(url)
    let go
    globalThis.qaLetYouTube = new Promise((resolve) => (go = resolve))
    globalThis.qaGoYouTube = () => go()
    ipcMain.removeHandler('fetch-link-metadata')
    ipcMain.handle('fetch-link-metadata', async (_event, href) => {
      if (/youtu/.test(href)) {
        await globalThis.qaLetYouTube
        return { href, title: 'Rick Astley - Never Gonna Give You Up', description: 'Rick Astley', image: '', icon: png, site: 'YouTube' }
      }
      return { href, title: 'On Gardens, an essay', description: '', image: '', icon: png, site: 'example.com' }
    })
  }, PNG)
  await go('today')

  // 1 A link pasted alone into the box, then ↵: a task, named by the site and path while its page is asked.
  await h.click(ADD)
  await paste(YT)
  await wait(300)
  await h.keyboard.press('Enter')
  await wait(1200)
  const coming = (await sql('select id, title, link, link_asked as asked from tasks where link = ?', YT))[0]
  check('1 a link pasted alone makes a task, its address kept beside the name', !!coming && coming.link === YT, JSON.stringify(coming))
  const shownWhile = await h.locator('[data-task-row] [data-title]').allInnerTexts()
  check('1 while the title is coming the row says the site and path, not the address', shownWhile.includes('youtu.be · hi8meiPUt84') && !shownWhile.some((one) => /https?:|si=/.test(one)), JSON.stringify(shownWhile.filter((one) => /youtu/.test(one))))
  await h.locator('[data-task-row]', { hasText: 'youtu.be' }).first().scrollIntoViewIfNeeded()
  check('1 its chip says the site while the page is asked, never the address', (await h.locator('[data-task-row]', { hasText: 'youtu.be · hi8meiPUt84' }).locator('[data-link-title]').first().innerText().catch(() => '')) === 'youtu.be')
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm1-coming`)
  await electron.evaluate(() => globalThis.qaGoYouTube())
  await wait(1500)
  const named = (await sql('select title, link_icon as icon, link_asked as asked from tasks where id = ?', coming.id))[0]
  check('2 the page answers (YouTube by oEmbed): its title names the task, its icon kept', named?.title === 'Rick Astley - Never Gonna Give You Up' && !!named.icon && named.asked === 1, JSON.stringify(named))
  const yt = row('Never Gonna Give You Up')
  check('2 the row shows the title and the link as a chip: the site\'s icon and the page\'s title, no address', (await yt.count()) === 1 && (await yt.locator('[data-task-link] img').count()) === 1
    && (await yt.locator('[data-link-title]').innerText()) === 'Rick Astley - Never Gonna Give You Up' && !/youtu\.be\//.test(await yt.innerText()), await yt.innerText().catch(() => ''))

  // 3 Words typed beside a link stay the name; the page's title never goes over them.
  await h.click(ADD)
  await h.keyboard.type(`read the essay ${PAGE}`, { delay: 5 })
  await h.keyboard.press('Enter')
  await wait(1500)
  const own = (await sql('select title, link, link_asked as asked from tasks where link = ?', PAGE))[0]
  check('3 words typed beside the link stay its name, the address out of it', own?.title === 'read the essay' && own.asked === 1, JSON.stringify(own))
  const essay = row('read the essay')
  check('3 its row has the chip, named by the page\'s own title', (await essay.locator('[data-task-link]').count()) === 1 && (await essay.locator('[data-link-title]').innerText()) === 'On Gardens, an essay')

  // 4 The icon opens the address; the row stays as it was (no task opened beside the list).
  await yt.locator('[data-task-link]').click()
  await wait(500)
  const opened = await electron.evaluate(() => globalThis.qaOpened)
  check('4 a press on the chip opens the address in the browser, and does not open the task', opened.includes(YT) && !(await h.$('[data-task-name]')), JSON.stringify(opened))

  // 5 Renamed as any task: the name changes, the bookmark stays; ⌘Z puts the name back.
  await yt.locator('[data-title]').click()
  await h.waitForSelector('[data-task-name]', { timeout: 5000 })
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm2-detail`)
  check('5 the open task shows the same chip under its name', (await h.locator('[data-task-link-row] [data-link-title]').innerText()) === 'Rick Astley - Never Gonna Give You Up')
  await h.click('[data-task-name] .ProseMirror')
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('Watch the Rick talk', { delay: 5 })
  await h.keyboard.press('Enter')
  await wait(900)
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Escape'); await wait(600)
  const renamed = (await sql('select title, link from tasks where id = ?', coming.id))[0]
  check('5 renamed: its own name, the link kept', renamed?.title === 'Watch the Rick talk' && renamed.link === YT, JSON.stringify(renamed))

  // 6 A page that cannot be read: the site and path stay its name, asked once.
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fetch-link-metadata')
    ipcMain.handle('fetch-link-metadata', (_event, href) => ({ href, title: href, description: '', image: '', icon: '', site: 'unreachable.example' }))
  })
  await h.click(ADD)
  await paste('https://unreachable.example/a/b?c=1')
  await h.keyboard.press('Enter')
  await wait(1500)
  const away = (await sql("select title, link_asked as asked from tasks where link = 'https://unreachable.example/a/b?c=1'"))[0]
  check('6 a page that does not answer leaves the site and path as its name', away?.title === 'unreachable.example · a/b' && away.asked === 1, JSON.stringify(away))

  // 7 Every other surface that lists tasks: the icon before the name, never the address as the name.
  const noAddress = async (page) => !(await page.evaluate(() => [...document.querySelectorAll('[data-task-title], [data-title], [data-cal-untimed], [data-cal-loose]')].some((el) => /https?:\/\//.test(el.textContent ?? ''))))
  await go('calendar')
  await wait(1200)
  check('7 Calendar: the task shows with its icon', (await h.locator(`[data-cal-untimed] [data-task-site="${YT}"], [data-cal-loose] [data-task-site="${YT}"], [data-cal-block] [data-task-site="${YT}"]`).count()) >= 1 && await noAddress(h))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm3-calendar`)
  // The Journal lists the day's first five by priority: this one made Urgent, so it is among them.
  await sql('update tasks set priority = 1, important = 1 where link = ?', YT)
  await go('day')
  await wait(1500)
  await h.locator(`[data-task-site="${YT}"]`).first().scrollIntoViewIfNeeded().catch(() => {})
  check('7 Journal\'s "Today\'s tasks": the task shows with its icon', (await h.locator(`[data-task-site="${YT}"]`).count()) >= 1 && await noAddress(h))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm4-journal`)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Rick talk', { delay: 20 }); await wait(1200)
  check('7 ⌘K: the task found shows its icon before its name', (await h.locator(`[data-search-at] [data-task-site="${YT}"], [data-row] [data-task-site="${YT}"]`).count()) >= 1)
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm5-cmdk`)
  await h.keyboard.press('Escape'); await wait(400)
  // Quick capture's Today (the box's side panel), then the desk sticky.
  await c.page.evaluate(() => window.api.showPrompt())
  await wait(1300)
  if (!(await c.page.locator('[aria-label="Hide the side panel"]').count())) await c.page.locator('[aria-label="Show the side panel"]').click().catch(() => {})
  await wait(900)
  const tab = c.page.locator('[data-box-panel] [role="tab"]', { hasText: /^Tasks/ }).first()
  if (await tab.count()) { await tab.click(); await wait(700) }
  check('7 quick capture\'s tasks: the task shows with its icon', (await c.page.locator(`[data-box-panel] [data-task-site="${YT}"], [data-box-panel] [data-task-link="${YT}"]`).count()) >= 1 && await noAddress(c.page))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/bm6-box`, c.page)
  await c.page.keyboard.press('Escape').catch(() => {})
  await go('today')
  await h.evaluate(() => window.api.stick('today', 'today', true))
  let sticky
  for (let n = 0; n < 40 && !sticky; n++) { sticky = electron.windows().find((one) => /view=sticky/.test(one.url()) && /type=today/.test(one.url())); if (!sticky) await wait(250) }
  await wait(1500)
  const iconSize = sticky && await sticky.locator(`[data-task-site="${YT}"] img`).evaluate((el) => Math.round(el.getBoundingClientRect().width)).catch(() => 0)
  check('7 the desk sticky: the task shows with its icon at its own size', !!sticky && iconSize >= 12 && iconSize <= 16 && await noAddress(sticky), `icon ${iconSize}px`)
  if (process.env.SHOTS && sticky) await both(`${process.env.SHOTS}/bm7-sticky`, sticky)

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
