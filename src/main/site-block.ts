import { execFile } from 'child_process'
import { app, ipcMain, net, shell } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

import { changed, database } from './captures'
import type { Nudge } from './nudge'
import { blockPrefs } from './vigil'
import { dueAt } from './session-log'
import { blockedSite, hostOf } from './site-hosts'

/**
 * Websites blocked while a focus round runs. About once a second, while a
 * session is running (not paused, not a break), the app in front is looked
 * at; if it is a browser Vigil can read, so is the address of its tab, and a
 * blocked site is sent away (the tab goes to a blank page) with Vigil's own
 * notice under the pill: "“x.com” is blocked until 21:49", with “Allow 5 min”.
 *
 * The address is read with AppleScript, which the Mac asks you to allow once
 * for each browser. Refused, that browser is simply not blocked, and Settings
 * says so with the way to the right Privacy pane. Firefox cannot be read this
 * way at all. Tests never touch a real browser: the layer below is swapped
 * for one that reads globalThis.siteBlockFake and keeps what it was asked to do.
 */

type Kind = 'safari' | 'chromium'
/**
 * The browsers whose address can be read, by their bundle id, with how to ask
 * each. Every test build of a browser speaks its browser's AppleScript. A
 * Chrome web app (com.google.Chrome.app.*) has no AppleScript of its own, so
 * it cannot be read and is left out.
 */
const BROWSERS: Record<string, { name: string; kind: Kind }> = {
  'com.apple.Safari': { name: 'Safari', kind: 'safari' },
  'com.apple.SafariTechnologyPreview': { name: 'Safari Technology Preview', kind: 'safari' },
  // Orion (Kagi) answers as Safari does.
  'com.kagi.kagimacOS': { name: 'Orion', kind: 'safari' },
  'com.google.Chrome': { name: 'Google Chrome', kind: 'chromium' },
  'com.google.Chrome.beta': { name: 'Google Chrome Beta', kind: 'chromium' },
  'com.google.Chrome.dev': { name: 'Google Chrome Dev', kind: 'chromium' },
  'com.google.Chrome.canary': { name: 'Google Chrome Canary', kind: 'chromium' },
  'company.thebrowser.Browser': { name: 'Arc', kind: 'chromium' },
  // Dia, Arc's makers' newer browser: asked the same way; if it does not answer, it is simply not blocked.
  'company.thebrowser.dia': { name: 'Dia', kind: 'chromium' },
  'com.brave.Browser': { name: 'Brave', kind: 'chromium' },
  'com.brave.Browser.beta': { name: 'Brave Beta', kind: 'chromium' },
  'com.brave.Browser.nightly': { name: 'Brave Nightly', kind: 'chromium' },
  'com.microsoft.edgemac': { name: 'Microsoft Edge', kind: 'chromium' },
  'com.microsoft.edgemac.Beta': { name: 'Microsoft Edge Beta', kind: 'chromium' },
  'com.microsoft.edgemac.Dev': { name: 'Microsoft Edge Dev', kind: 'chromium' },
  'com.microsoft.edgemac.Canary': { name: 'Microsoft Edge Canary', kind: 'chromium' },
  'com.vivaldi.Vivaldi': { name: 'Vivaldi', kind: 'chromium' },
  'com.vivaldi.Vivaldi.snapshot': { name: 'Vivaldi Snapshot', kind: 'chromium' },
  'com.operasoftware.Opera': { name: 'Opera', kind: 'chromium' },
  'com.operasoftware.OperaGX': { name: 'Opera GX', kind: 'chromium' },
  'org.chromium.Chromium': { name: 'Chromium', kind: 'chromium' }
}
/** The browsers named, each with how to ask it, for the script. */
const kindsOf = (ids: Iterable<string>): string => JSON.stringify(Object.fromEntries([...ids].filter((id) => BROWSERS[id]).map((id) => [id, BROWSERS[id].kind])))

const TEST = !!(process.env.MINDFLOW_USER_DATA || process.env.MINDFLOW_QA_AWAY)
/** “Allow 5 min”: how long a site is let through, this round only. The card is told it with each notice. */
const ALLOW_MINUTES = 5

/** A browser's front tab: its address, or that the Mac refused to let Vigil read it. */
type Tab = { url: string | null; denied?: boolean }
/** The app in front, and its front tab if it is one of the browsers asked about. */
type Look = { app: string | null; tab: Tab | null }
type Layer = { look: (browsers: string, patient: boolean) => Promise<Look>; away: (app: string) => Promise<boolean> }

// One small script, one run per look: the app in front (NSWorkspace, which
// needs no permission) and, if it is one of the browsers named (a JSON map of
// bundle id to kind), its front tab's address, or that tab sent away. The
// browser is only spoken to while it is the app in front.
const SCRIPT = `function run(argv) {
  ObjC.import('AppKit')
  var front = $.NSWorkspace.sharedWorkspace.frontmostApplication
  var id = front ? ObjC.unwrap(front.bundleIdentifier) || '' : ''
  var kind = JSON.parse(argv[1])[id]
  if (!kind) return JSON.stringify({ app: id })
  try {
    var win = Application(id).windows[0]
    var tab = kind === 'safari' ? win.currentTab : win.activeTab
    if (argv[0] === 'away') { tab.url = 'about:blank'; return JSON.stringify({ app: id, sent: true }) }
    return JSON.stringify({ app: id, url: tab.url() })
  } catch (e) {
    var n = e.errorNumber
    return JSON.stringify({ app: id, url: null, denied: n === -1743 || n === -1744 })
  }
}`
const ask = (args: string[], timeout: number): Promise<Record<string, unknown> | null> =>
  new Promise((done) => execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT, ...args], { timeout }, (error, out) => {
    if (error) return done(null)
    try {
      done(JSON.parse(out.trim()))
    } catch {
      done(null)
    }
  }))

const realLayer: Layer = {
  // The first ask of a browser may bring the Mac's "allow Vigil to control" question: waited on, not cut off.
  look: async (browsers, patient) => {
    const said = await ask(['tab', browsers], patient ? 90_000 : 2500)
    const app = typeof said?.app === 'string' ? said.app : null
    return { app, tab: said && ('url' in said || said.denied) ? { url: typeof said.url === 'string' ? said.url : null, denied: said.denied === true } : null }
  },
  away: async (one) => (await ask(['away', kindsOf([one])], 2500))?.sent === true
}
type Fake = { app: string; url?: string | null; denied?: boolean }
const fake = (): Fake | null => (globalThis as { siteBlockFake?: Fake | null }).siteBlockFake ?? null
const fakeLayer: Layer = {
  // Each look counted, so a test can see one run a tick.
  look: async (browsers) => {
    const now = fake()
    const store = globalThis as { siteBlockLooks?: number }
    store.siteBlockLooks = (store.siteBlockLooks ?? 0) + 1
    return { app: now?.app ?? null, tab: now && now.app in JSON.parse(browsers) ? { url: now.url ?? null, denied: now.denied === true } : null }
  },
  away: async (one) => {
    const store = globalThis as { siteBlockAway?: { app: string; url: string | null | undefined; at: number }[] }
    ;(store.siteBlockAway ??= []).push({ app: one, url: fake()?.url, at: Date.now() })
    const now = fake()
    if (now?.app === one) now.url = 'about:blank'
    return true
  }
}
const layer = TEST ? fakeLayer : realLayer

/** The focus round running now, if one is: its session, and when it ends (null with no length). */
type Round = { id: string; until: number | null }
function runningRound(): Round | null {
  const rows = database().prepare(`select id, task_id as taskId, started_at as startedAt, planned_ms as plannedMs, paused_ms as pausedMs, paused_at as pausedAt, rounds, kind
    from sessions where ended_at is null order by started_at desc`).all() as { id: string; taskId: string; startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null; rounds: string | null; kind: string | null }[]
  for (const row of rows) {
    if (row.pausedAt || row.kind === 'break') continue
    // A plain timer ("5m tea") is not focus; Pomodoro rounds are, but only their work stretches.
    if (row.taskId === '') {
      let phase = ''
      try {
        phase = row.rounds ? String(JSON.parse(row.rounds).phase ?? '') : ''
      } catch {
        phase = ''
      }
      if (phase !== 'work') continue
    }
    const until = dueAt(row.startedAt, row.pausedMs, row.plannedMs)
    return { id: row.id, until: until && until > Date.now() ? until : null }
  }
  return null
}

/** The notice, said near the pill: a site sent away, and until when. */
type BlockNotice = Extract<Nudge, { kind: 'blocked' }>

export function registerSiteBlock({ notify }: { notify: (notice: BlockNotice) => void }): void {
  const db = database()
  db.exec('create table if not exists session_blocks (session_id text not null, site text not null, count integer not null default 0, primary key (session_id, site))')
  db.exec('delete from session_blocks where session_id not in (select id from sessions)')

  // Let through for a while, this round only: the site, until when.
  let allowed = new Map<string, number>()
  let roundOf: string | null = null
  // Browsers the Mac refused, by name, for Settings; and those asked at least once.
  const denied = new Set<string>()
  const asked = new Set<string>()

  const tick = async (): Promise<void> => {
    const { siteBlock, blockSites: list } = blockPrefs()
    const round = siteBlock && list.length ? runningRound() : null
    if (!round) return
    if (round.id !== roundOf) (roundOf = round.id, (allowed = new Map()))
    // One look a tick, at the browsers already asked once. One not asked yet
    // is looked at again on its own, waiting for the Mac's question if it comes.
    const look = await layer.look(kindsOf(asked), false)
    const front = look.app
    const browser = front ? BROWSERS[front] : undefined
    if (!front || !browser) return
    let tab = look.tab
    if (!tab) {
      const first = await layer.look(kindsOf([front]), true)
      asked.add(front)
      if (first.app !== front || !first.tab) return
      tab = first.tab
    }
    if (tab.denied) return void (!denied.has(browser.name) && (denied.add(browser.name), changed()))
    if (denied.delete(browser.name)) changed()
    const site = blockedSite(tab.url, list)
    if (!site || (allowed.get(site) ?? 0) > Date.now()) return
    if (!(await layer.away(front))) return
    db.prepare('insert into session_blocks (session_id, site, count) values (?, ?, 1) on conflict (session_id, site) do update set count = count + 1').run(round.id, site)
    notify({ kind: 'blocked', id: site, site, until: round.until ? new Date(round.until).toISOString() : null, allowMinutes: ALLOW_MINUTES })
  }
  // One look at a time, each a second after the last ended: never a pile of waiting asks.
  const loop = (): void => void setTimeout(() => void tick().catch(() => undefined).finally(loop), 1000)
  loop()

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))
  // For Settings: the browsers the Mac would not let Vigil read.
  handle('site-block:state', () => ({ denied: [...denied] }))
  // Let through for a while: gives back until when, for the card to say.
  handle('site-block:allow', (site: string) => {
    if (typeof site !== 'string' || !site) return null
    const until = Date.now() + ALLOW_MINUTES * 60_000
    allowed.set(site, until)
    return new Date(until).toISOString()
  })
  // The Mac's Privacy & Security, at Automation: where a browser is allowed again.
  handle('site-block:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'))
  // How often each site was sent away in a session, most first.
  handle('site-block:session', (sessionId: string) =>
    db.prepare('select site, count from session_blocks where session_id = ? order by count desc, site').all(String(sessionId)))
  handle('site-block:icon', (site: string) => iconOf(site))
}

/**
 * A site's small picture, fetched once from the site itself (its
 * favicon.ico, or the icon its front page names) and kept in Vigil's folder.
 * Never in a test run, and a site with none is asked again only after a week.
 * Null: the field draws the site's first letter instead.
 */
const fetching = new Map<string, Promise<string | null>>()
async function iconOf(site: string): Promise<string | null> {
  const host = hostOf(String(site ?? ''))
  if (!host || TEST) return null
  const dir = join(app.getPath('userData'), 'site-icons')
  const kept = join(dir, `${host}.icon`)
  const none = join(dir, `${host}.none`)
  try {
    const [bytes, type] = await Promise.all([readFile(kept), readFile(`${kept}.type`, 'utf8')])
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    // Not kept yet.
  }
  try {
    if (Date.now() - (await stat(none)).mtimeMs < 7 * 86_400_000) return null
  } catch {
    // Never missed.
  }
  if (!fetching.has(host))
    fetching.set(host, (async () => {
      const found = await fetchIcon(host)
      // Not reached at all (offline): nothing kept, so it is asked again next time.
      if (!found) return null
      await mkdir(dir, { recursive: true }).catch(() => undefined)
      if (found === 'none') return (await writeFile(none, '').catch(() => undefined), null)
      await writeFile(kept, found.bytes).catch(() => undefined)
      await writeFile(`${kept}.type`, found.type).catch(() => undefined)
      return `data:${found.type};base64,${found.bytes.toString('base64')}`
    })().finally(() => fetching.delete(host)))
  return fetching.get(host)!
}

/** The site's picture; 'none' when the site answered but has none; null when it could not be reached. */
async function fetchIcon(host: string): Promise<{ bytes: Buffer; type: string } | 'none' | null> {
  // Answered but not a picture: null. Not reached at all: it throws.
  const image = async (url: string): Promise<{ bytes: Buffer; type: string } | null> => {
    const answer = await net.fetch(url, { signal: AbortSignal.timeout(5000) })
    const type = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!answer.ok || !/^image\//.test(type)) return null
    const bytes = Buffer.from(await answer.arrayBuffer())
    return bytes.length > 0 && bytes.length < 256_000 ? { bytes, type } : null
  }
  try {
    const direct = await image(`https://${host}/favicon.ico`)
    if (direct) return direct
    const page = await net.fetch(`https://${host}/`, { signal: AbortSignal.timeout(5000) })
    const html = (await page.text()).slice(0, 200_000)
    const link = [...html.matchAll(/<link\b[^>]*>/gi)].map((one) => one[0]).find((tag) => /rel=["'][^"']*\bicon\b/i.test(tag))
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1]
    return (href && (await image(new URL(href, page.url || `https://${host}/`).href))) || 'none'
  } catch {
    return null
  }
}
