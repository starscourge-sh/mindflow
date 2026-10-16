import { execFile } from 'child_process'
import { app, ipcMain, net, shell } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

import { changed, database, setting } from './captures'
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

/** The browsers whose address can be read, by their bundle id, with how to ask each. */
const BROWSERS: Record<string, { name: string; kind: 'safari' | 'chromium' }> = {
  'com.apple.Safari': { name: 'Safari', kind: 'safari' },
  'com.apple.SafariTechnologyPreview': { name: 'Safari Technology Preview', kind: 'safari' },
  'com.google.Chrome': { name: 'Google Chrome', kind: 'chromium' },
  'com.google.Chrome.beta': { name: 'Google Chrome Beta', kind: 'chromium' },
  'company.thebrowser.Browser': { name: 'Arc', kind: 'chromium' },
  'com.brave.Browser': { name: 'Brave', kind: 'chromium' },
  'com.microsoft.edgemac': { name: 'Microsoft Edge', kind: 'chromium' },
  'com.vivaldi.Vivaldi': { name: 'Vivaldi', kind: 'chromium' },
  'com.operasoftware.Opera': { name: 'Opera', kind: 'chromium' },
  'org.chromium.Chromium': { name: 'Chromium', kind: 'chromium' }
}

const TEST = !!(process.env.MINDFLOW_USER_DATA || process.env.MINDFLOW_QA_AWAY)
/** “Allow 5 min”: how long a site is let through, this round only. */
const ALLOW_MS = 5 * 60_000

/** A browser's front tab: its address, or that the Mac refused to let Vigil read it. */
type Tab = { url: string | null; denied?: boolean }
type Layer = { front: () => Promise<string | null>; tab: (app: string, patient: boolean) => Promise<Tab>; away: (app: string) => Promise<boolean> }

// One small script: the app in front (NSWorkspace, which needs no
// permission), a browser's front tab's address, or that tab sent away. The
// browser is only spoken to while it is still the app in front.
const SCRIPT = `function run(argv) {
  ObjC.import('AppKit')
  var front = $.NSWorkspace.sharedWorkspace.frontmostApplication
  var id = front ? ObjC.unwrap(front.bundleIdentifier) || '' : ''
  var want = argv[0]
  if (want === 'front') return JSON.stringify({ app: id })
  if (id !== argv[1]) return JSON.stringify({ app: id, gone: true })
  try {
    var win = Application(id).windows[0]
    var tab = argv[2] === 'safari' ? win.currentTab : win.activeTab
    if (want === 'away') { tab.url = 'about:blank'; return JSON.stringify({ app: id, sent: true }) }
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
  front: async () => {
    const said = await ask(['front'], 2500)
    return typeof said?.app === 'string' ? said.app : null
  },
  // The first ask of a browser may bring the Mac's "allow Vigil to control" question: waited on, not cut off.
  tab: async (one, patient) => {
    const said = await ask(['tab', one, BROWSERS[one].kind], patient ? 90_000 : 2500)
    return { url: typeof said?.url === 'string' ? said.url : null, denied: said?.denied === true }
  },
  away: async (one) => (await ask(['away', one, BROWSERS[one].kind], 2500))?.sent === true
}
type Fake = { app: string; url?: string | null; denied?: boolean }
const fake = (): Fake | null => (globalThis as { siteBlockFake?: Fake | null }).siteBlockFake ?? null
const fakeLayer: Layer = {
  front: async () => fake()?.app ?? null,
  tab: async (one) => (fake()?.app === one ? { url: fake()?.url ?? null, denied: fake()?.denied === true } : { url: null }),
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
    const until = row.plannedMs ? new Date(row.startedAt).getTime() + row.pausedMs + row.plannedMs : null
    return { id: row.id, until: until && until > Date.now() ? until : null }
  }
  return null
}

/** What the blocker is told to do, as Settings keeps it. */
const prefs = (): { on: boolean; list: string[] } => {
  const list = setting<unknown>('blockSites', [])
  return { on: setting<unknown>('siteBlock', true) !== false, list: Array.isArray(list) ? list.filter((one): one is string => typeof one === 'string') : [] }
}

/** The notice, said near the pill: a site sent away, and until when. */
export type BlockNotice = { kind: 'blocked'; id: string; site: string; until: string | null }

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
    const { on, list } = prefs()
    const round = on && list.length ? runningRound() : null
    if (!round) return
    if (round.id !== roundOf) (roundOf = round.id, (allowed = new Map()))
    const front = await layer.front()
    const browser = front ? BROWSERS[front] : undefined
    if (!front || !browser) return
    const tab = await layer.tab(front, !asked.has(front))
    asked.add(front)
    if (tab.denied) return void (!denied.has(browser.name) && (denied.add(browser.name), changed()))
    if (denied.delete(browser.name)) changed()
    const site = blockedSite(tab.url, list)
    if (!site || (allowed.get(site) ?? 0) > Date.now()) return
    if (!(await layer.away(front))) return
    db.prepare('insert into session_blocks (session_id, site, count) values (?, ?, 1) on conflict (session_id, site) do update set count = count + 1').run(round.id, site)
    notify({ kind: 'blocked', id: site, site, until: round.until ? new Date(round.until).toISOString() : null })
  }
  // One look at a time, each a second after the last ended: never a pile of waiting asks.
  const loop = (): void => void setTimeout(() => void tick().catch(() => undefined).finally(loop), 1000)
  loop()

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))
  // For Settings: the browsers the Mac would not let Vigil read.
  handle('site-block:state', () => ({ denied: [...denied] }))
  handle('site-block:allow', (site: string) => {
    if (typeof site !== 'string' || !site) return false
    allowed.set(site, Date.now() + ALLOW_MS)
    return true
  })
  // The Mac's Privacy & Security, at Automation: where a browser is allowed again.
  handle('site-block:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'))
  // How often each site was sent away in a session, most first.
  handle('site-block:session', (sessionId: string) =>
    db.prepare('select site, count from session_blocks where session_id = ? order by count desc, site').all(String(sessionId)))
  handle('site-block:sessions', (ids: string[]) => {
    const list = Array.isArray(ids) ? ids.map(String).slice(0, 200) : []
    if (!list.length) return {}
    const rows = db.prepare(`select session_id as id, site, count from session_blocks where session_id in (${list.map(() => '?').join(',')}) order by count desc, site`).all(...list) as { id: string; site: string; count: number }[]
    const out: Record<string, { site: string; count: number }[]> = {}
    for (const row of rows) (out[row.id] ??= []).push({ site: row.site, count: row.count })
    return out
  })
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
      await mkdir(dir, { recursive: true }).catch(() => undefined)
      if (!found) return (await writeFile(none, '').catch(() => undefined), null)
      await writeFile(kept, found.bytes).catch(() => undefined)
      await writeFile(`${kept}.type`, found.type).catch(() => undefined)
      return `data:${found.type};base64,${found.bytes.toString('base64')}`
    })().finally(() => fetching.delete(host)))
  return fetching.get(host)!
}

async function fetchIcon(host: string): Promise<{ bytes: Buffer; type: string } | null> {
  const image = async (url: string): Promise<{ bytes: Buffer; type: string } | null> => {
    try {
      const answer = await net.fetch(url, { signal: AbortSignal.timeout(5000) })
      const type = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!answer.ok || !/^image\//.test(type)) return null
      const bytes = Buffer.from(await answer.arrayBuffer())
      return bytes.length > 0 && bytes.length < 256_000 ? { bytes, type } : null
    } catch {
      return null
    }
  }
  const direct = await image(`https://${host}/favicon.ico`)
  if (direct) return direct
  try {
    const page = await net.fetch(`https://${host}/`, { signal: AbortSignal.timeout(5000) })
    const html = (await page.text()).slice(0, 200_000)
    const link = [...html.matchAll(/<link\b[^>]*>/gi)].map((one) => one[0]).find((tag) => /rel=["'][^"']*\bicon\b/i.test(tag))
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1]
    return href ? await image(new URL(href, page.url || `https://${host}/`).href) : null
  } catch {
    return null
  }
}
