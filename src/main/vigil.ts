import { Notification, app, dialog, ipcMain, net, session, shell } from 'electron'
import { randomUUID } from 'crypto'
import { cp, mkdir, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

import { LABEL, LIST, atomically, changed, database, like, movedOn, type Change } from './captures'
import { advance, readTask } from './task-words'
import { dayKey, dayMonth, dayjs, daysFromToday, monthName, num, startOfDay } from './dates'
import { backupDir, checkMarkdown } from './backup'
import { SANDBOX } from './sandbox'
import { retireKinds, tagged as hasTag, withTag } from './kinds'
import { celebrateAfter, goalPassed, watches, type MomentKind } from './celebrate'
import { daysBetween, daysLeft, leftSaid } from './goal-days'

/**
 * Everything past the capture: nuggets and articles, the review queue, tasks,
 * tags, pins, privacy, the numbers, and the five settings the plan allows.
 *
 * Nuggets and articles share one table, `nuggets`, told apart by `tier`: they
 * carry the same prompt, schedule and surfacing fields, and an article is a
 * nugget with a title and more words. Every channel here starts `vigil:`, and
 * the preload passes only those through.
 */

const now = (): string => new Date().toISOString()
const ago = (days: number): string => dayjs().subtract(days, 'day').toISOString()
const body = <T extends { body?: unknown }>(row: T): T => ({ ...row, body: JSON.parse((row.body as string) ?? 'null') })

/** A document's words, whether it is Markdown or the editor's JSON. */
export function plain(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? (node.attrs?.label ?? '') :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join('\n')
  return value ? walk(value as { content?: unknown[] }) : ''
}

/** Markdown read as words, for a card's few lines: no marks, links as their words, pictures and tags of HTML out. */
const mdWords = (text: string): string =>
  plain(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\*\*|__|~~|==|`/g, '')
    .replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=$|[\s).,;:!?])/gm, '$1$2')
/** A stored body as words for a card: the editor's JSON walked, Markdown (bare, or saved as a JSON string) read without its marks. */
const cardWords = (raw: string): string => {
  let value: unknown = raw
  try { value = JSON.parse(raw) } catch { /* Markdown, as it is */ }
  const words = typeof value === 'string' ? mdWords(value) : plain(value)
  // A line that is only a file's path or name (a picture pasted from Obsidian
  // whose file did not come with it) says nothing on a card.
  return words.split('\n').filter((line) => line.includes('://') || !FILE_LINE.test(line.trim())).join('\n')
}
const FILE_LINE = /^(?:\.{0,2}\/)?(?:[^\n/]*\/)*[^\n/]+\.(?:png|jpe?g|gif|webp|heic|svg|pdf|mp4|mov|webm|m4a|mp3)$/i

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Doc[] }
/**
 * A document as Markdown, the way any editor would read it back: headings,
 * lists, quotes, code, links and emphasis kept. Markdown already is.
 */
export function markdown(value: unknown, nameOf: (id: string) => string | undefined = () => undefined): string {
  // A link names the file it leads to, with its own words after a bar when
  // they differ, so it opens in Obsidian or any other Markdown tool.
  const link = (id: string, label: string): string => {
    const name = nameOf(id.replace(/^[a-z]+:/, ''))
    return name ? (name === label ? `[[${name}]]` : `[[${name}|${label}]]`) : `[[${label}]]`
  }
  if (typeof value === 'string') return value.replace(/\[\[@([^|\]]+)\|([^\]]+)\]\]/g, (_, id: string, label: string) => link(id, label))
  if (!value) return ''
  const inline = (nodes: Doc[] = []): string =>
    nodes.map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'noteLink') return link(String(node.attrs?.id ?? ''), String(node.attrs?.label ?? ''))
      // A width goes after a bar, the way Obsidian writes one.
      if (node.type === 'image') return `![${node.attrs?.alt ?? ''}${node.attrs?.width ? `|${parseInt(String(node.attrs.width))}` : ''}](${node.attrs?.src ?? ''})`
      if (node.type === 'inlineMath') return `$${node.attrs?.latex ?? ''}$`
      if (node.type === 'emoji') return `:${node.attrs?.name ?? ''}:`
      let text = node.text ?? inline(node.content)
      for (const mark of node.marks ?? []) {
        if (mark.type === 'highlight') text = `==${text}==`
        else if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `*${text}*`
        else if (mark.type === 'strike') text = `~~${text}~~`
        else if (mark.type === 'code') text = `\`${text}\``
        else if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`
      }
      return text
    }).join('')
  // A caption is the italic line under its picture or video, as it is written by hand.
  const captioned = (text: string, node: Doc): string =>
    node.attrs?.caption ? `${text}\n\n*${String(node.attrs.caption).replace(/([*_])/g, '\\$1')}*` : text
  const block = (node: Doc, indent = ''): string => {
    const kids = node.content ?? []
    switch (node.type) {
      case 'heading': return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(kids)}`
      case 'paragraph': return indent + inline(kids)
      case 'blockquote': return kids.map((child) => block(child)).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n')
      case 'codeBlock': return `\`\`\`${node.attrs?.language ?? ''}\n${inline(kids)}\n\`\`\``
      case 'horizontalRule': return '---'
      case 'image': return captioned(inline([node]), node)
      // A picture from Obsidian not found here: pointed at again, the way Obsidian wrote it.
      case 'imagePlaceholder': return node.attrs?.embed ? `![[${node.attrs.embed}]]` : ''
      case 'blockMath': return `$$\n${node.attrs?.latex ?? ''}\n$$`
      case 'youtube': return captioned(`![](${node.attrs?.src ?? ''})`, node)
      case 'attachment': return captioned(`[${node.attrs?.name || 'Attachment'}](${node.attrs?.src ?? ''})`, node)
      // Markdown has no columns: each one's blocks in turn, between marks Vigil reads back.
      case 'columns': return ['<!-- columns -->', kids.map((column) => block(column)).join('\n\n<!-- column -->\n\n'), '<!-- /columns -->'].join('\n\n')
      // A link card as Obsidian's cardlink block, which is what it came in as.
      case 'bookmark': return ['```cardlink', ...Object.entries({ url: node.attrs?.href, title: node.attrs?.title, description: node.attrs?.description, host: node.attrs?.site, favicon: node.attrs?.icon, image: node.attrs?.image })
        .filter(([, value]) => value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), '```'].join('\n')
      // A callout as Obsidian writes one: its type, whether it folds, its title, then its lines.
      case 'callout': {
        const head = node.attrs?.type ? `[!${node.attrs.type}]${node.attrs.fold ?? ''}${node.attrs.title ? ` ${node.attrs.title}` : ''}` : `[!note] ${node.attrs?.icon ?? ''}`.trimEnd()
        return [head, ...kids.map((child) => block(child)).join('\n\n').split('\n')].map((line) => `> ${line}`.trimEnd()).join('\n')
      }
      // A table as GFM pipes: the first row is its header, and a cell's own
      // lines and bars are kept as <br> and \| so the row stays one line.
      case 'table': {
        const rows = kids.map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map((child) => block(child)).join('<br>').replace(/\n/g, '<br>').replace(/\|/g, '\\|')))
        const width = Math.max(...rows.map((row) => row.length))
        const line = (cells: string[]): string => `${indent}| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`
        return [line(rows[0] ?? []), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return kids.map((item, n) => {
          const mark = node.type === 'orderedList' ? `${n + 1}.` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}]` : '-'
          const [first, ...rest] = item.content ?? []
          // An item that starts with something other than words, a rule say, keeps it: "- ---".
          const lead = !first ? '' : first.type === 'paragraph' ? inline(first.content) : block(first).trim()
          return [`${indent}${mark} ${lead}`, ...rest.map((child) => block(child, indent + '  '))].join('\n')
        }).join('\n')
      default: return kids.length ? kids.map((child) => block(child, indent)).join('\n\n') : inline([node])
    }
  }
  return block(value as Doc).trim() + '\n'
}

/** `#tags` in a text, lower-cased, once each. A heading's `# ` is not one. */
const tagsIn = (text: string): string[] =>
  [...new Set([...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase()))]

// --- settings and the privacy gate ----------------------------------------

/**
 * The settings and their defaults. The plan budgeted five; the argument for
 * the rest is that you asked for them, and each is one value read in one place.
 */
/** A folder of the developer's own, used only while Vigil is run from its source: an installed app starts with none. */
function devFolder(path: string): string {
  const full = join(homedir(), path)
  return ownData() && existsSync(full) ? full : ''
}

/**
 * The developer's own Vigil: run from source, on the usual data folder. A
 * fresh or test folder (MINDFLOW_USER_DATA) and the sandbox start like a
 * stranger's copy, so a demo recorded from source shows none of their files.
 */
const ownData = (): boolean => !app.isPackaged && !process.env.MINDFLOW_USER_DATA && !process.argv.includes('--sandbox')

/** The files picked for each kind of moment, one of which plays at random. */
type Picks = Partial<Record<MomentKind, string[]>>

/** Saved picks as lists: a single path, as the one-file-per-kind version saved them, reads as a list of one. */
const asLists = (saved: unknown): Picks =>
  saved && typeof saved === 'object'
    ? Object.fromEntries(Object.entries(saved).map(([kind, files]) => [kind, (Array.isArray(files) ? files : [files]).filter((file) => typeof file === 'string')]))
    : {}

/**
 * The developer's own files for each moment, under the same rule as
 * devFolder: named in dev-picks.json at the top of the source (kept out of
 * git), as paths under the home folder for each kind of moment.
 */
function devPicks(): Picks {
  if (!ownData()) return {}
  let files: unknown = {}
  try {
    files = JSON.parse(readFileSync(join(app.getAppPath(), 'dev-picks.json'), 'utf8'))
  } catch {
    // No file of picks: the folder alone.
  }
  return Object.fromEntries(Object.entries(asLists(files)).map(([kind, list]) => [kind, list!.map(devFolder).filter(Boolean)]).filter(([, list]) => list.length))
}
const DEV_PICKS = devPicks()

/**
 * While run from source, the developer's files fill each kind with nothing
 * saved, or with only the first of them (the one file the one-per-kind
 * version saved). Anything chosen in Settings is kept, an emptied kind too.
 */
function withDevPicks(saved: Picks): Picks {
  const out = { ...saved }
  for (const [kind, list] of Object.entries(DEV_PICKS) as [MomentKind, string[]][]) {
    const mine = out[kind]
    if (!mine || (mine.length === 1 && mine[0] === list[0])) out[kind] = list
  }
  return out
}

const DEFAULTS = {
  // Pages sit in a centred column, as Notion lays them out, unless this is on.
  fullWidth: false,
  // The small sounds on complete, promote and grade.
  sounds: true,
  // How loud they are, from silent to full.
  volume: 1,
  // Things ease in and out rather than appearing at once.
  motion: true,
  // Where the box sits. Centred: opening the side panel grows it out on both
  // sides, so it stays centred where it was; off, it grows right. Up and down
  // it always grows from its top, so the writing stays where the eye is.
  boxCentred: true,
  // Raycast's way: the box puts itself away when you click into another app.
  boxAutoHide: true,
  // Where it turns up when summoned: where you left it, or always the top
  // middle or the middle of the screen. And on which screen: the one the
  // pointer is on, or the one it was last on.
  boxPlace: 'last' as 'last' | 'top' | 'centre',
  boxScreen: 'pointer' as 'pointer' | 'same',
  // Which of the nine packs they play through.
  soundPack: 'soft' as string,
  // The share of prompt opens that show a hint, and how many rot cards.
  hintRate: 0.1,
  rotCount: 3,
  retention: 0.9,
  newPerDay: 10,
  reviewsPerDay: 50,
  quietStart: '22:00',
  quietEnd: '07:00',
  safeMode: false,
  // The plan's fifth setting: how a task with a time tells you it is time.
  // Pull: it rises in Today. Quiet: the menu bar counts it. Alerts: a system
  // notification over your work, useful for "leave now", corrosive by default.
  notify: 'quiet' as 'pull' | 'quiet' | 'alerts',
  // Notes: a line ending in = shows its answer; the first line rides in the
  // top bar once scrolled away; the font notes are written in, and its size.
  calc: true,
  topTitle: true,
  // Misspelt words underlined as you write, in the languages picked; none
  // picked means the Mac's own.
  spellcheck: true,
  spellLanguages: [] as string[],
  noteFont: 'system' as string,
  // The font is the whole app's unless this says it is only for notes.
  fontNotesOnly: false,
  // Headings in a font of their own, the way Dia sets a serif over plain text; 'same' follows the text.
  headingFont: 'default' as string,
  // Pictures in notes framed like a postcard: a white border and a soft shadow.
  postcards: false,
  // Margin marks: a few things drawn as if by hand (a strike when a to-do is
  // done, a ring round today, an arrow when there is nothing yet).
  marks: true,
  // Blurring: private words blurred in lists, the window dimmed when you leave
  // it, words arriving from a soft blur. One switch turns all of it off.
  blur: true,
  // How big the whole interface is, Raycast's way: small, medium or large.
  interfaceSize: 'medium' as 'small' | 'medium' | 'large',
  textSize: 1,
  // Once a week, on this day (0 is Sunday), the box suggests walking the
  // inbox through its exits.
  weeklyReview: true,
  weeklyDay: 4,
  // Once a day the box offers a few minutes' tidy of the last days' captures:
  // tags and formatting only, nothing decided.
  dailyTidy: true,
  // A tag with an exam date says so in the box when its cards fall behind.
  examNudges: true,
  // Hints can be memories: this day last year, things from one source.
  memories: true,
  // The weather outside, kept with each capture as context. It asks a weather
  // service that guesses your town from your connection; off in Settings.
  weather: true,
  // A note's first picture, small, at the end of its row in every list.
  thumbnails: true,
  // Scenery: pictures from your own folders at the quiet moments. Where they
  // come from, the four places they may show, whether they follow the time of
  // day, how far they are dimmed, and a number "Show another" turns over.
  scenery: true,
  sceneryFolders: [devFolder('Documents/img/Elden Ring Environments')].filter(Boolean) as string[],
  sceneryRest: true,
  sceneryRecap: true,
  sceneryToday: true,
  sceneryFocus: true,
  sceneryTime: true,
  sceneryDim: 0.5,
  sceneryShuffle: 0,
  // Covers: soft grainy pictures from one folder, behind whatever has no
  // picture of its own (a tag, a text-only note), each thing always the same
  // one. Empty is none: the plain colour tiles.
  coversFolder: devFolder('Documents/img/gradients'),
  // Celebrations: a card on the rare milestones, playing something from this
  // folder (a GIF, a picture, a short clip). Empty is none: a grainy cover.
  celebrate: true,
  celebrationsFolder: devFolder('Downloads/memes'),
  // Files of its own for each kind of milestone, one played at random in
  // place of one from the folder. A file no longer there is passed over.
  celebrationPicks: DEV_PICKS,
  // A question you are holding comes back now and then as a hint card: still
  // open, how long, how many clues. Off in Settings.
  questionsBack: true,
  // Open goals in a slim strip at the top of Home and Today's page.
  goalStrip: true,
  // A goal with no log for a week says so in the box, more plainly as it goes on.
  goalNudges: true,
  // A goal's beacon, a small window of its own on every Space: 'always',
  // 'sometimes' (at a few moments a day, then tucked away) or 'off'. Each
  // goal can say otherwise; in its last week 'sometimes' stays.
  goalBeacon: 'sometimes' as 'always' | 'sometimes' | 'off',
  // Every bar that fills: plain, a lightsaber, or a dinosaur running along
  // it. The developer's own Vigil wears the saber.
  progressBars: (ownData() ? 'saber' : 'plain') as 'plain' | 'saber' | 'dino',
  // The focus pill: its ring alone, or the progress bars' dinosaur beside it,
  // running in place or along a line that fills with the session.
  focusBubble: 'circle' as 'circle' | 'runner' | 'progress',
  // Where a session's time shows: the floating bubble, a quiet footer under
  // the note being written in (the bubble then stays away), or both.
  focusShows: 'bubble' as 'bubble' | 'note' | 'both',
  // The menu bar's day, week, month and year as rows of dots instead of bars.
  tempusDots: false,
  // A plain-text copy of each capture beside the backups (never a private one).
  markdownCopies: true,
  // How far back the Recent panel reaches, in days.
  recentDays: 7,
  // The questions you keep in view, shown small while you capture and tidy.
  pinnedQuestions: true,
  // Headings fold away what is under them, as a view: the note never changes.
  foldHeadings: true,
  // What the main window's sidebar lists; the rest wait under More, a G away.
  sidebarShown: ['inbox', 'review', 'day', 'today', 'week', 'nuggets', 'articles', 'questions', 'goals'] as string[],
  // The box's tabs; Recent is a ⇧⌘Y or ⌘K away until shown.
  boxTabs: ['inbox', 'today', 'review', 'kept'] as string[],
  // Sticky notes on the desktop: shown or all put away (⌃⌥⌘N), and kept out of
  // screen shares and recordings while still there for you.
  stickiesShown: true,
  // A capture box and sticky notes are only any use if they are there after a restart.
  openAtLogin: true,
  stickiesUnshared: true,
  // Sticky notes over the desktop picture, softly blurred (see frost.ts); off, plain paper.
  stickiesFrosted: true,
  // Frosted by the Mac itself: real glass that blurs whatever is behind, sitting straight (no lean).
  stickiesGlass: true,
  // Now and then one sticky stirs, as paper does in a draught, so it never turns into wallpaper.
  stickiesStir: true,
  // Keys you changed: { the keys it came with: yours, or null for none }.
  keys: {} as Record<string, string | null>
}
export type Settings = typeof DEFAULTS

/**
 * The weather where you are, as a few words: "12°C, light rain". wttr.in
 * places you by your connection, so there is no key, no account and no
 * location permission. Asked at most every half hour; offline, or slow, it is
 * simply left out.
 */
let weather: { said: string; at: number } | null = null
async function weatherNow(): Promise<string | null> {
  if (weather && Date.now() - weather.at < 30 * 60000) return weather.said
  try {
    const answer = await net.fetch('https://wttr.in/?format=j1', { signal: AbortSignal.timeout(5000) })
    const now = ((await answer.json()) as { current_condition?: { temp_C?: string; weatherDesc?: { value?: string }[] }[] }).current_condition?.[0]
    if (!now?.temp_C) return null
    const sky = now.weatherDesc?.[0]?.value?.trim().toLowerCase()
    weather = { said: sky ? `${now.temp_C}°C, ${sky}` : `${now.temp_C}°C`, at: Date.now() }
    return weather.said
  } catch {
    return null
  }
}

/** Told when safe mode goes on or off, however it was flipped: the windows follow it. */
let safeModeTold: (on: boolean) => void = () => undefined
export const whenSafeMode = (tell: (on: boolean) => void): void => void (safeModeTold = tell)

/** Told when a goal is made, moved, settled or taken back, or its beacon setting changes: the beacons follow. */
let goalsTold: () => void = () => undefined
export const whenGoals = (tell: () => void): void => void (goalsTold = tell)
/** Each goal's beacon unless the goal says otherwise: 'always', 'sometimes' or 'off'. */
export const beaconDefault = (): 'always' | 'sometimes' | 'off' => settings().goalBeacon
export const tempusDots = (): boolean => settings().tempusDots === true

/** Told when where a session's time shows changes: the bubble comes or goes. */
let focusShowsTold: () => void = () => undefined
export const whenFocusShows = (tell: () => void): void => void (focusShowsTold = tell)
/** Whether the floating bubble shows during a session, or only the note's footer does. */
export const focusBubbleShown = (): boolean => settings().focusShows !== 'note'

/** Told when the stickies are shown or put away, or kept in or out of screen shares. */
let stickiesTold: () => void = () => undefined
export const whenStickies = (tell: () => void): void => void (stickiesTold = tell)
/** Open at login, as the setting says. Only the installed app: in development it would register Electron itself. */
export function atLogin(): void {
  // Never from the sandbox: its settings are practice, and the login item is your Mac's.
  if (SANDBOX) return
  if (process.platform === 'darwin' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings().openAtLogin !== false })
}
/** Stickies frosted over the desktop picture, unless turned off. */
export const stickyFrost = (): boolean => settings().stickiesFrosted !== false
/** Frosted by the Mac's own blur rather than the desktop picture. */
export const stickyGlass = (): boolean => settings().stickiesFrosted !== false && settings().stickiesGlass === true
export const stickyStir = (): boolean => settings().stickiesStir !== false
export const stickyPrefs = (): { shown: boolean; unshared: boolean } => ({ shown: settings().stickiesShown, unshared: settings().stickiesUnshared })
/** Every sticky shown or put away at once; they keep their places. */
export function showStickies(on = !settings().stickiesShown): boolean {
  database().prepare("insert or replace into settings (key, value) values ('stickiesShown', ?)").run(JSON.stringify(on))
  stickiesTold()
  changed()
  return on
}

/** Told when the keys change, so the two that work from anywhere are taken again. */
let keysTold: (keys: Settings['keys']) => void = () => undefined
export const whenKeys = (tell: (keys: Settings['keys']) => void): Settings['keys'] => ((keysTold = tell), settings().keys)

/**
 * The spellchecker on or off, in the languages picked. Only those this build
 * knows are passed on; the Mac ignores the list and picks its own languages
 * as you type, so there the picks only matter on another system.
 */
function spelling(): void {
  session.defaultSession.setSpellCheckerEnabled(settings().spellcheck)
  const picked = spellingLanguages()
  if (picked.length) session.defaultSession.setSpellCheckerLanguages(picked)
}
/** The languages picked, or with none picked the system's, each as this build names it ("en" for "en-ZA"). */
function spellingLanguages(): string[] {
  const known = new Set(session.defaultSession.availableSpellCheckerLanguages)
  const picked = settings().spellLanguages
  const mac = app.getPreferredSystemLanguages().map((one) => (known.has(one) ? one : one.split('-')[0]))
  return [...new Set(picked.length ? picked : mac)].filter((one) => known.has(one))
}

/** Whether milestones are celebrated, from which folder, and the files picked for each kind. */
export const celebrationPrefs = (): { on: boolean; folder: string; picks: Picks } => {
  const now = settings()
  return { on: now.celebrate !== false, folder: now.celebrationsFolder || '', picks: now.celebrationPicks ?? {} }
}

/** The Motion setting, for the window's own arrival. */
export const motionOn = (): boolean => settings().motion
export const blurOn = (): boolean => settings().blur !== false
/** Whether the box puts itself away when it loses the focus. */
export const boxAutoHide = (): boolean => settings().boxAutoHide !== false
/** Where the box goes: see boxCentred, boxPlace and boxScreen above. */
export const boxPlacement = (): { centred: boolean; place: 'last' | 'top' | 'centre'; screen: 'pointer' | 'same' } => {
  const now = settings()
  return { centred: now.boxCentred !== false, place: now.boxPlace ?? 'last', screen: now.boxScreen ?? 'pointer' }
}

function settings(): Settings {
  const rows = database().prepare('select key, value from settings').all() as { key: string; value: string }[]
  // A row that no longer reads (a damaged file) falls back to its default,
  // rather than every window failing to start.
  const read = (value: string): unknown => {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
  const all: Settings = { ...DEFAULTS, ...Object.fromEntries(rows.map((row) => [row.key, read(row.value)]).filter(([, value]) => value !== undefined)) }
  return { ...all, celebrationPicks: withDevPicks(asLists(all.celebrationPicks)) }
}

/**
 * What may surface unasked right now. Safe mode is a blackout on everything
 * the app volunteers; quiet hours only keep private items back. Search, lists
 * and a review you opened are never gated: you can hide what the app offers,
 * never what you asked for.
 */
export function gate(): { blackout: boolean; hidePrivate: boolean } {
  const { safeMode, quietStart, quietEnd } = settings()
  if (safeMode) return { blackout: true, hidePrivate: true }
  const time = new Date().toTimeString().slice(0, 5)
  const quiet =
    quietStart <= quietEnd ? time >= quietStart && time < quietEnd : time >= quietStart || time < quietEnd
  return { blackout: false, hidePrivate: quiet }
}
// An untriaged capture counts as private, the plan's fail-safe: you have not
// looked at it since you wrote it, so in quiet hours it is not volunteered.
// Taking an exit is what clears it, so the default resolves itself.

// --- spaced repetition ----------------------------------------------------

/** A stored card back as `ts-fsrs` wants it: its dates are Dates again. */
const cardOf = (state: string | null): Card => {
  if (!state) return createEmptyCard()
  const card = JSON.parse(state)
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined }
}
// The plan's learning steps, ten minutes then a day, and fuzz so cards learnt
// together spread over the days around their due date instead of landing at once.
const scheduler = (): ReturnType<typeof fsrs> =>
  fsrs(generatorParameters({ request_retention: settings().retention, learning_steps: ['10m', '1d'], enable_fuzz: true }))

/** When each of the four grades would bring an item back, for the buttons. */
const preview = (state: string | null, cap: (due: Date) => Date = (due) => due): Record<number, string> => {
  const record = scheduler().repeat(cardOf(state), new Date())
  return Object.fromEntries([1, 2, 3, 4].map((grade) => [grade, cap(record[grade as Grade].card.due).toISOString()]))
}

// --- tasks ----------------------------------------------------------------

/** What making a task gave back: the task, and whether it was already there. */
export type Made = { id: string; number: number; existed: boolean }

/**
 * A task from a line of text. The same task twice is one task: an open one
 * with the same name is returned instead, and what this one came from is
 * linked to it, so nothing is lost and nothing is doubled.
 */
function addTask(text: string, origin: string | null = null, today = false): Made {
  const db = database()
  const task = readTask(text)
  const title = task.title || text
  // The same name with no date or repeat of its own is the same task; one
  // that brings a date or a repeat is meant as a new one.
  const twin = task.due || task.recurrence || task.deadline || task.plan ? undefined
    : (db.prepare("select id, number from tasks where status = 'open' and lower(trim(title)) = lower(trim(?))").get(title) as { id: string; number: number } | undefined)
  if (twin) {
    if (origin) db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(twin.id, origin)
    // A reminder word said again ("!alert") is still heard.
    if (task.notify) db.prepare('update tasks set notify = ? where id = ?').run(task.notify, twin.id)
    return { ...twin, existed: true }
  }
  const id = randomUUID()
  // Typed into Today with no date, it is for today, as in Todoist: all day,
  // not dropped into a backlog the list you typed it in does not show.
  if (today && !task.due && !task.plan) Object.assign(task, { due: dayjs().hour(9).startOf('hour').toISOString(), allDay: true })
  const { number } = db
    .prepare(
      `insert into tasks (id, number, title, due_at, all_day, recurrence, repeat_until, origin_capture_id, created_at, deadline_at, priority, important, plan_for, deadline_timed, notify)
       values (?, (select coalesce(max(number), 0) + 1 from tasks), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning number`
    )
    .get(id, title, task.due, task.allDay ? 1 : 0, task.recurrence, task.until, origin, now(), task.deadline, task.priority, [1, 2].includes(task.priority) ? 1 : 0, task.plan, task.deadlineTimed ? 1 : 0, task.notify) as { number: number }
  return { id, number, existed: false }
}

// --- the registration -----------------------------------------------------

export function registerVigil(): void {
  // A picture folder in Finder, from its row in Settings: only one of the
  // folders Settings holds, never a path the window names.
  ipcMain.on('folder:show', (_event, path: unknown) => {
    const { sceneryFolders, coversFolder, celebrationsFolder } = settings()
    if (typeof path === 'string' && [...(sceneryFolders ?? []), coversFolder, celebrationsFolder].includes(path)) void shell.openPath(path)
  })
  const db = database()
  const column = (table: string, definition: string): void => {
    try {
      db.exec(`alter table ${table} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  // The tables first, so a new database gets every column added below.
  db.exec(`
    create table if not exists tasks (
      id text primary key, number integer, title text not null, notes text,
      status text not null default 'open', due_at text, all_day integer not null default 0,
      recurrence text, origin_capture_id text, created_at text not null, completed_at text
    );
    create table if not exists task_done (task_id text not null, done_at text not null);
    create table if not exists glosses (id text primary key, item_id text not null, body text not null, author text not null default 'user', created_at text not null);
    create table if not exists review_log (item_id text not null, grade integer not null, reviewed_at text not null, ms integer, first integer not null default 0);
    create table if not exists settings (key text primary key, value text not null);
  `)
  // Renamed in place, so what was typed as a source is kept as attribution.
  for (const table of ['captures', 'nuggets']) {
    try {
      db.exec(`alter table ${table} rename column cite to attribution`)
    } catch {
      // Already renamed, or never had it.
    }
  }
  column('captures', 'private integer not null default 0')
  column('captures', 'pinned_at text')
  column('nuggets', "tier text not null default 'nugget'")
  column('nuggets', "title text not null default ''")
  column('nuggets', 'prompt text')
  column('nuggets', 'private integer not null default 0')
  column('nuggets', 'pinned_at text')
  column('nuggets', 'state text')
  column('nuggets', 'due_at text')
  column('nuggets', 'suspended integer not null default 0')
  column('nuggets', 'origins text')
  column('nuggets', 'updated_at text')
  column('captures', 'remind_at text')
  column('nuggets', 'remind_at text')
  column('tasks', 'waiting_on text')
  column('hint_events', 'dwell_ms integer')
  column('captures', 'attribution text')
  column('captures', 'medium text')
  column('captures', 'exited_at text')
  column('captures', 'session_id text')
  column('captures', 'first_used_at text')
  column('captures', 'surfaced_at text')
  column('captures', 'device text')
  column('captures', 'original_body text')
  column('captures', 'elapsed_ms integer')
  column('captures', 'weather text')
  column('captures', 'surfacing_weight real not null default 1')
  column('captures', 'origin_id text')
  // Kept by the database, so no exit can forget them: when a capture left the
  // inbox, and when it was first used (opened, exited or given a who or where),
  // which time to first use is measured by. Not in its first minute: that is
  // still the capturing.
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  db.exec(`create trigger if not exists capture_exit after update of status on captures when new.status is not old.status begin
      update captures set exited_at = case when new.status = 'open' then null else ${stamp} end where id = new.id; end;
    drop trigger if exists capture_original;
    create trigger if not exists capture_used after update of status, attribution, medium on captures
      when new.first_used_at is null and julianday('now') - julianday(new.captured_at) > 1.0 / 1440 begin
      update captures set first_used_at = ${stamp} where id = new.id; end;`)
  column('nuggets', 'attribution text')
  column('nuggets', 'context text')
  column('nuggets', "mode text not null default 'encounter'")
  column('tasks', 'subtasks text')
  column('tasks', 'estimate integer')
  column('tasks', 'sort_order real')
  column('tasks', 'notified_at text')
  column('tasks', 'repeat_until text')
  // The day of the month a monthly series began on, kept once it first moves on.
  column('tasks', 'repeat_day integer')
  column('tasks', 'important integer not null default 0')
  column('tasks', 'deadline_at text')
  // "by 5pm" has a time that matters; "by friday" is only a day.
  column('tasks', 'deadline_timed integer not null default 0')
  column('tasks', 'blocker text')
  column('tasks', 'reschedules integer not null default 0')
  column('tasks', 'notify text')
  // Linear's four priorities, 1 Urgent to 4 Low, 0 for none. Important was
  // the one flag before them: it is High, and stays in step with them, so
  // nothing that reads it loses anything. Safe to run every start.
  column('tasks', 'priority integer not null default 0')
  db.exec('update tasks set priority = 2 where important = 1 and priority = 0')
  // A when with no day: "someday", a month ("2026-10") or a year ("2026").
  column('tasks', 'plan_for text')
  column('task_done', 'session_id text')
  column('nuggets', 'superseded_by text')
  column('nuggets', 'revisions integer not null default 0')
  column('nuggets', 'edited_since_review integer not null default 0')
  // What lineage looks up on every change: where each nugget and task came from.
  db.exec('create index if not exists nuggets_by_capture on nuggets(capture_id); create index if not exists tasks_by_capture on tasks(origin_capture_id); create index if not exists captures_by_origin on captures(origin_id)')
  // Every list of nuggets counts each one's lapses and clues, and review counts
  // today's grades: without these each count read the whole log, 100 ms a list.
  db.exec(`create index if not exists review_log_by_item on review_log(item_id);
    create index if not exists review_log_by_time on review_log(reviewed_at);
    create index if not exists glosses_by_item on glosses(item_id, created_at);
    create index if not exists hint_events_by_time on hint_events(shown_at)`)
  db.exec('create table if not exists task_links (task_id text not null, item_id text not null, primary key (task_id, item_id))')
  // A tag's colour, and whether it makes a task: the plan's labels, a colour
  // and a string with one behaviour you choose. Seeded with the four labels
  // the plan collapses into todo, because seeded beats empty.
  db.exec(`create table if not exists tag_meta (tag text primary key, color text, action integer not null default 0);
    insert or ignore into tag_meta (tag, color, action) values ('bug', 'red', 1), ('fix', 'orange', 1), ('feature', 'blue', 1), ('improvement', 'green', 1);`)
  column('tag_meta', 'alias_of text')
  // An exam or deadline on a tag: review paces everything carrying it to be ready by then.
  column('tag_meta', 'exam_at text')
  // Why the answer is so, one line under it in review.
  column('nuggets', 'why text')
  // A question held open: when it was settled, and how ('answered' or 'let go').
  // Open while both are empty, for years if that is what it takes.
  column('nuggets', 'closed_at text')
  column('nuggets', 'closed_how text')
  // A clue that came from a capture keeps which, so taking it back reopens it.
  column('glosses', 'source_id text')
  // A goal: the day it is for and the day it was set, as "2026-12-14". It is
  // settled as a question is, by closed_at and closed_how ('made it',
  // 'missed' or 'let go'); why it matters is its `why`, its logs are glosses.
  column('nuggets', 'goal_at text')
  column('nuggets', 'goal_from text')
  // How often its beacon shows; null follows Settings.
  column('nuggets', 'goal_beacon text')
  // Which day each gentle nudge was last given, so none comes twice in a day.
  db.exec('create table if not exists nudges (key text primary key, day text not null)')
  // When a capture's age starts counting: when it was written, or for one
  // imported, thirty days after it came in, so a vault does not arrive rotting.
  const AGED = "max(captured_at, coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', imported_at, '+30 days'), ''))"
  // Promote once read "Book:" or "Shopping list:" at the start of any note as
  // the person who said it, and saved it without asking. Those guesses go, so
  // they never reach the Who autocomplete, recaps or memories. Safe every start.
  db.exec(`update captures set attribution = null where kind != 'quote' and attribution is not null and substr(${LABEL}, 1, length(attribution) + 1) = attribution || ':';
    update nuggets set attribution = null where kind != 'quote' and attribution is not null and substr(title, 1, length(attribution) + 1) = attribution || ':'`)

  // One-time changes, counted in the file itself. Bits default private: the
  // plan's one fail-safe kind, where the screen-share risk actually lives.
  const version = (db.prepare('pragma user_version').get() as { user_version: number }).user_version
  if (version < 1) {
    db.exec("update captures set private = 1 where kind = 'bit'; update nuggets set private = 1 where kind = 'bit'; pragma user_version = 1")
  }
  // The eight kinds: a kind is what you can tell apart, at capture and at
  // review. Tip, idea and question failed that and become notes; a turn of
  // phrase is a quote. Keep-or-offload is gone: everything open waits.
  if (version < 2) {
    db.exec(`
      update captures set kind = 'quote' where kind = 'saying';
      update captures set kind = 'note' where kind in ('tip', 'idea', 'question', 'self');
      update nuggets set kind = 'quote' where kind = 'saying';
      update nuggets set kind = 'note' where kind in ('tip', 'idea', 'question', 'self');
      pragma user_version = 2`)
  }
  // The font pairing is the notes' own now, headings in Fraunces over the
  // Mac's text font, so a choice saved under the old meaning starts on it once.
  if (version < 3) {
    db.exec("delete from settings where key in ('noteFont', 'headingFont'); pragma user_version = 3")
  }
  // Goals arrived: a sidebar already set up shows them too, under Kept.
  if (version < 4) {
    const saved = db.prepare("select value from settings where key = 'sidebarShown'").get() as { value: string } | undefined
    let shown: unknown = null
    try { shown = saved && JSON.parse(saved.value) } catch { /* Unreadable: the default, which has them. */ }
    if (Array.isArray(shown) && !shown.includes('goals'))
      db.prepare("update settings set value = ? where key = 'sidebarShown'").run(JSON.stringify([...shown, 'goals']))
    db.exec('pragma user_version = 4')
  }
  // Seven kinds, not ten: a bit is a note tagged #bit (private), an excerpt a
  // long quote, a book a note tagged #book. What each was is kept in
  // kind_was, so it can be put back.
  column('captures', 'kind_was text')
  column('nuggets', 'kind_was text')
  if (version < 5) {
    for (const id of retireKinds(db)) checkMarkdown(id)
    db.exec('pragma user_version = 5')
  }

  // A write that may reach a milestone is looked at once it is done, and the
  // window it came from is the one that celebrates.
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (event, ...args) => {
      const result = run(...(args as never[]))
      if (watches(channel)) void Promise.resolve(result).then((done) => celebrateAfter(channel, event.sender, args, done), () => undefined)
      return result
    })
  const write = <T>(result: T, what?: Change): T => (changed(what), result)

  // --- settings and privacy
  handle('settings', () => settings())
  handle('settings:set', (patch: Partial<Settings>) => {
    const wasSafe = settings().safeMode
    for (const [key, value] of Object.entries(patch))
      db.prepare('insert or replace into settings (key, value) values (?, ?)').run(key, JSON.stringify(value))
    if (patch.safeMode !== undefined && patch.safeMode !== wasSafe) safeModeTold(patch.safeMode)
    if (patch.keys) keysTold(patch.keys)
    if ('stickiesShown' in patch || 'stickiesUnshared' in patch || 'stickiesFrosted' in patch || 'stickiesGlass' in patch) stickiesTold()
    if ('spellcheck' in patch || 'spellLanguages' in patch) spelling()
    if ('openAtLogin' in patch) atLogin()
    if ('goalBeacon' in patch || 'tempusDots' in patch) goalsTold()
    if ('focusShows' in patch) focusShowsTold()
    return write(settings())
  })
  // Spelling: the languages there are and the ones in use, and a word kept as
  // spelt right. One session serves every window, so it is set once.
  spelling()
  handle('spelling:languages', () => ({ all: session.defaultSession.availableSpellCheckerLanguages, on: spellingLanguages() }))
  handle('spelling:learn', (word: string) => session.defaultSession.addWordToSpellCheckerDictionary(word))
  handle('private', (table: 'captures' | 'nuggets', id: string, on: boolean) => {
    const result = db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set private = ? where id = ?`).run(on ? 1 : 0, id)
    // Made private, its plain-text backup copy goes at once.
    if (table !== 'nuggets') checkMarkdown(id)
    return write(result)
  })
  // Where the backups go, for Settings to say plainly.
  handle('backups:where', () => backupDir().replace(homedir(), '~'))

  // A few capture fields set one at a time from the properties column.
  const CAPTURE_FIELDS = { attribution: 'attribution', medium: 'medium', capturedAt: 'captured_at', origin: 'origin_id' } as const
  // Many at once, from a selection: a tag added to each, or one date for all,
  // for filling in when a batch of old things was really written.
  handle('captures:bulk', (ids: string[], change: { tag?: string; capturedAt?: string }) => {
    // One write for the lot: a hundred rows are one change, not a hundred.
    atomically(() => { for (const id of ids) {
      if (change.capturedAt) db.prepare('update captures set captured_at = ? where id = ?').run(change.capturedAt, id)
      if (!change.tag) continue
      const tag = `#${change.tag.replace(/^#/, '')}`
      // Gone meanwhile, from another window: nothing to tag.
      const row = db.prepare('select body from captures where id = ?').get(id) as { body: string } | undefined
      if (!row) continue
      // On the first line, where a row reads its tags: added at the end it
      // was there but never showed. #bit makes it private, as typed does.
      db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(withTag(JSON.parse(row.body ?? 'null'), tag)), id)
      if (tag.toLowerCase() === '#bit') (db.prepare('update captures set private = 1 where id = ?').run(id), checkMarkdown(id))
    } })
    return write(ids.length)
  })
  // One task from several captures: each is linked from it, so the task can
  // say why it exists, and each has taken its exit.
  // Only captures still in the inbox take it: one already promoted, resolved
  // or let go keeps the exit it took, and `resolved` says which did, so the
  // undo opens those and no others.
  handle('tasks:from', (ids: string[], text: string) => {
    const open = ids.filter((id) => (db.prepare('select status from captures where id = ?').get(id) as { status: string } | undefined)?.status === 'open')
    if (!open.length) return null
    const task = addTask(String(text), open[0])
    for (const id of open) {
      db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, id)
      db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    }
    // A new one's notes list each capture as a link, so what it is made of is one click away.
    if (!task.existed && open.length > 1) {
      const rows = open.map((id) => db.prepare(`select id, number, ${LABEL} as label from captures where id = ?`).get(id) as { id: string; number: number | null; label: string })
      const line = (content: unknown[]): unknown => ({ type: 'paragraph', content })
      const notes = { type: 'doc', content: [
        line([{ type: 'text', text: `Made from ${rows.length} captures:` }]),
        { type: 'bulletList', content: rows.map((row) => ({ type: 'listItem', content: [line([{ type: 'noteLink', attrs: { id: row.id, label: row.label || 'Untitled', key: row.number ? `MF-${row.number}` : '' } }])] })) }
      ] }
      db.prepare('update tasks set notes = ? where id = ? and notes is null').run(JSON.stringify(notes), task.id)
    }
    return write({ ...task, resolved: open })
  })
  handle('capture:set', (id: string, field: keyof typeof CAPTURE_FIELDS, value: string | number | null) => {
    const column = CAPTURE_FIELDS[field]
    if (!column) return null
    return write(db.prepare(`update captures set ${column} = ? where id = ?`).run(value, id))
  })
  // A capture made while a session runs belongs to it: what you noticed while
  // doing the work is the work's record too.
  // The weather too, when that is on: filled in when it comes back, so the
  // capture itself never waits on it.
  handle('capture:session', (id: string) => {
    db.prepare("update captures set session_id = (select id from sessions where ended_at is null and task_id != '' order by started_at desc limit 1) where id = ?").run(id)
    if (settings().weather)
      void weatherNow().then((said) => said && write(db.prepare('update captures set weather = ? where id = ? and weather is null').run(said, id)))
  })

  // What you have typed before in a field, most used first: the autocomplete
  // for attribution and medium. Never a preset list: seeding "book, podcast"
  // would lean you toward medium, the less useful half.
  // Spellings that differ only in their capitals are one name, counted
  // together and offered in the spelling used most ("marcus aurelius" once and
  // "Marcus Aurelius" three times is Marcus Aurelius, used four times).
  handle('values', (field: 'attribution' | 'medium') => {
    const rows = db.prepare(`select ${field} as v, count(*) n from captures where ${field} is not null and trim(${field}) != '' group by v`).all() as { v: string; n: number }[]
    const names = new Map<string, { v: string; best: number; n: number }>()
    for (const { v, n } of rows) {
      const key = v.trim().toLowerCase()
      const one = names.get(key)
      // On a tie, the spelling with more capitals: a name is usually written with them.
      const caps = (word: string): number => (word.match(/\p{Lu}/gu) ?? []).length
      if (!one) names.set(key, { v: v.trim(), best: n, n })
      else {
        one.n += n
        if (n > one.best || (n === one.best && caps(v) > caps(one.v))) Object.assign(one, { v: v.trim(), best: n })
      }
    }
    return [...names.values()].sort((a, b) => b.n - a.n).slice(0, 50).map((one) => one.v)
  })

  // --- the capture exits
  // Promote: a nugget made from the capture, which stays as it was. A word
  // comes with its prompt, the one kind with a natural question and answer.
  const promote = (id: string, line?: string): string | null => {
    const capture = db.prepare(`select kind, body, private, attribution, status, ${LABEL} as title from captures where id = ?`).get(id) as Record<string, string> | undefined
    if (!capture) return null
    // An exit is taken from the inbox only: promoted twice is two nuggets.
    if (capture.status !== 'open') return 'not-open'
    // A quote's whole claim is "someone said this", so it does not become a
    // nugget until it says who. A name in its words ("…" - Alan Kay) is only
    // offered as the answer when asked, never saved without asking.
    if (capture.kind === 'quote' && !capture.attribution) return 'needs-source'
    // Nor until it says something in your own words: someone else's sentence
    // kept with nothing of yours beside it is a quote you collected, not one
    // you understood. Those words become its first gloss.
    if (capture.kind === 'quote' && !line?.trim()) return 'needs-words'
    // A word is tested on its meaning, so it needs one: after a dash or colon
    // on its first line, or on the lines below. Without it, asked for here,
    // and the answer is written under the word.
    let body = capture.body
    let prompt: string | null = null
    if (capture.kind === 'word') {
      let parsed: unknown = ''
      try { parsed = JSON.parse(capture.body) } catch { parsed = capture.body }
      const [first = '', ...rest] = words(parsed).trim().split('\n')
      const [, term = first, after = ''] = /^(.+?)\s+[-—–:]\s+(.+)$/.exec(first) ?? /^(.+?):\s*(.+)$/.exec(first) ?? []
      const meaning = [after, ...rest].join(' ').trim()
      if (!meaning && !line?.trim()) return 'needs-meaning'
      if (!meaning && line?.trim()) {
        const more = line.trim()
        body = JSON.stringify(typeof parsed === 'string' || !parsed
          ? `${String(parsed ?? '').trim()}\n\n${more}`
          : { ...(parsed as Doc), content: [...((parsed as Doc).content ?? []), { type: 'paragraph', content: [{ type: 'text', text: more }] }] })
      }
      prompt = `What does "${term.trim()}" mean?`
    }
    const nugget = randomUUID()
    db.prepare(
      `insert into nuggets (id, capture_id, kind, title, body, prompt, private, attribution, mode, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nugget, id, capture.kind, capture.title, body, prompt,
      capture.private, capture.attribution || null, 'encounter', now(), now())
    // A kind's own fields (a book's rating, a word's language) travel with it.
    db.prepare('update nuggets set fields = (select fields from captures where id = ?) where id = ?').run(id, nugget)
    // A word's line was its meaning, written into it above; anything else's is a gloss.
    if (line?.trim() && capture.kind !== 'word') db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)').run(randomUUID(), nugget, line.trim(), now())
    // The capture is kept as it was, only marked: the nugget is a copy, edited
    // on its own, and each points at the other.
    db.prepare("update captures set status = 'promoted' where id = ?").run(id)
    return write(nugget)
  }
  handle('promote', promote)
  // Promotion taken back: the nugget it made goes (with its glosses), and the
  // capture is open again, as if it had never been kept.
  // A source asked for only to promote it (`forgetWho`) goes too: it had none before.
  handle('promote:undo', (captureId: string, nuggetId: string, forgetWho = false) => {
    db.prepare('delete from glosses where item_id = ?').run(nuggetId)
    db.prepare('delete from nuggets where id = ? and capture_id = ?').run(nuggetId, captureId)
    db.prepare("update captures set status = 'open' where id = ?").run(captureId)
    if (forgetWho) db.prepare('update captures set attribution = null where id = ?').run(captureId)
    return write(true)
  })
  // Where something came from, what it became, and what links to it: the
  // lineage both ways, and the backlinks an @ link leaves.
  handle('lineage', (id: string) => {
    const links = (table: string, title: string): { type: string; id: string; title: string }[] =>
      db.prepare(`select ${table === 'captures' ? "'capture'" : 'tier'} as type, id, ${title} as title, private from ${table} where body like ? or body like ? or body like ? or body like ?`).all(`%"id":"${id}"%`, `%"id":"%:${id}"%`, `%[[@%${id}|%`, `%[[@%${id}#%`) as never
    return {
      from: [
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where id in (select capture_id from nuggets where id = ? union select origin_capture_id from tasks where id = ?
          union select origin_id from captures where id = ? union select item_id from task_links where task_id = ?)`).all(id, id, id, id) as never[]),
        ...(db.prepare('select tier as type, id, title, private from nuggets where id = (select origin_id from captures where id = ?)').all(id) as never[]),
        ...(JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])
          .map((origin) => db.prepare('select tier as type, id, title, private from nuggets where id = ?').get(origin) as never)
          .filter(Boolean)
      ],
      became: [
        ...(db.prepare("select tier as type, id, title, private from nuggets where capture_id = ? or origins like ?").all(id, `%"${id}"%`) as never[]),
        // Its own task, or one it became part of with others.
        ...(db.prepare("select 'task' as type, id, title, 0 as private from tasks where origin_capture_id = ? or id in (select task_id from task_links where item_id = ?)").all(id, id) as never[]),
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where origin_id = ?`).all(id) as never[]),
        // Kept as a clue in a question someone is holding.
        ...(db.prepare('select tier as type, id, title, private from nuggets where id in (select item_id from glosses where source_id = ?)').all(id) as never[])
      ],
      linked: [...links('captures', LABEL), ...links('nuggets', 'title')].filter((row) => row.id !== id)
    }
  })
  // Backlinks the way Obsidian lists them under a note: every note that links
  // here, with the sentence it does it in; and every note that names this
  // one without linking it yet, which one press turns into a link.
  type Mention = { type: string; id: string; title: string; snippet: string; private: number }
  const everything = (): { type: string; id: string; title: string; body: string; private: number }[] => [
    ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private from captures where status != 'discarded'`).all() as never[]),
    ...(db.prepare("select tier as type, id, title, body, private from nuggets where superseded_by is null").all() as never[])
  ]
  const around = (text: string, at: number, length: number): string => {
    const start = Math.max(0, text.lastIndexOf('\n', at) + 1, at - 80)
    const end = Math.min(text.length, at + length + 80)
    const line = text.slice(start, end).split('\n')[0]
    return `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${line}${end < text.length && !text.slice(at, end).includes('\n') ? '…' : ''}`
  }
  // The words as read: inline pieces run together, links as their names,
  // blocks on their own lines.
  const words = (value: unknown): string => {
    // An imported page's [[@link|name]] reads as its name.
    if (typeof value === 'string') return value.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
    const walk = (node: Doc): string =>
      node.type === 'noteLink' ? String(node.attrs?.label ?? '') :
      node.text ?? (node.content ?? []).map(walk).join(node.content?.every((child) => child.type === 'text' || child.type === 'noteLink' || child.type === 'hardBreak') ? '' : '\n')
    return value ? walk(value as Doc) : ''
  }
  const titleOf = (id: string): { title: string; key: string; link: string } | null => {
    const capture = db.prepare(`select ${LABEL} as title, number from captures where id = ?`).get(id) as { title: string; number: number } | undefined
    if (capture) return { title: capture.title, key: `MF-${capture.number}`, link: id }
    const nugget = db.prepare('select title, tier from nuggets where id = ?').get(id) as { title: string; tier: string } | undefined
    return nugget ? { title: nugget.title, key: '', link: `${nugget.tier}:${id}` } : null
  }
  handle('mentions', (id: string) => {
    const me = titleOf(id)
    const name = me?.title.trim() ?? ''
    // A name worth looking for: not empty, not "Untitled", not one tiny word.
    const findable = name.length >= 4 && !/^untitled$/i.test(name)
    const pattern = findable ? new RegExp(`(?<![\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i') : null
    const linked: Mention[] = []
    const unlinked: Mention[] = []
    for (const row of everything()) {
      if (row.id === id || !row.body) continue
      // A link as the editor keeps it, or as an imported page still holds it.
      const links = new RegExp(`"id":"(?:[a-z]+:)?${id}"|\\[\\[@(?:[a-z]+:)?${id}\\|`).test(row.body)
      const text = words(JSON.parse(row.body))
      if (links) {
        const label = /"label":"([^"]*)"/.exec(row.body.slice(Math.max(0, row.body.search(new RegExp(`"id":"(?:[a-z]+:)?${id}"`)))))?.[1] ??
          new RegExp(`\\[\\[@(?:[a-z]+:)?${id}\\|([^\\]]+)\\]\\]`).exec(row.body)?.[1] ?? name
        const at = text.indexOf(label)
        const snippet = at >= 0 ? around(text, at, label.length) : text.slice(0, 160)
        // A line that is only the link and tags says nothing the row does not: none then.
        const bare = !snippet.replace(label, '').replace(/(?:^|\s)#[a-z][\w-]*/gi, '').replace(row.title ?? '', '').replace(/[\s….,:;·-]/g, '')
        linked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: bare ? '' : snippet })
        continue
      }
      const hit = pattern?.exec(text)
      if (hit) unlinked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: around(text, hit.index, hit[0].length) })
    }
    // And the other way, as Obsidian's Outgoing links has it: what this note
    // links to, and the notes it names without linking them yet.
    const all = everything()
    const mine = all.find((row) => row.id === id)
    const body = mine?.body ?? ''
    const text = body ? words(JSON.parse(body)) : ''
    const out: Mention[] = []
    const named: Mention[] = []
    for (const row of all) {
      if (row.id === id) continue
      if (new RegExp(`"id":"(?:[a-z]+:)?${row.id}"|\\[\\[@(?:[a-z]+:)?${row.id}\\|`).test(body)) {
        out.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: '' })
        continue
      }
      const title = row.title?.trim() ?? ''
      if (named.length >= 20 || title.length < 4 || /^untitled$/i.test(title)) continue
      const hit = new RegExp(`(?<![\\w])${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').exec(text)
      if (hit) named.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: around(text, hit.index, hit[0].length) })
    }
    return { linked, unlinked: unlinked.slice(0, 20), out, named, me: mine?.type ?? 'capture' }
  })
  // Turn the first plain mention of a note in another into a real link.
  handle('mention:link', (sourceType: string, sourceId: string, targetId: string) => {
    const me = titleOf(targetId)
    if (!me) return false
    const table = sourceType === 'capture' ? 'captures' : 'nuggets'
    const row = db.prepare(`select body from ${table} where id = ?`).get(sourceId) as { body: string } | undefined
    if (!row?.body) return false
    const stored = JSON.parse(row.body) as Doc | string | null
    // A body kept as plain text becomes a document, a paragraph a line.
    const doc: Doc = typeof stored === 'string'
      ? { type: 'doc', content: stored.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }
      : stored ?? { type: 'doc', content: [] }
    const lower = me.title.toLowerCase()
    const whole = new RegExp(`(?<![\\w])${me.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i')
    let done = false
    const walk = (node: Doc): void => {
      if (done || !node.content) return
      const next: Doc[] = []
      for (const child of node.content) {
        // The name as a whole word, as the mention was found: never inside "paragraph".
        const at = !done && child.type === 'text' && !child.marks?.some((mark) => mark.type === 'code') ? (child.text ?? '').search(whole) : -1
        if (at < 0) {
          next.push(child)
          walk(child)
          continue
        }
        const text = child.text ?? ''
        if (at > 0) next.push({ ...child, text: text.slice(0, at) })
        // A nugget or article is linked as `tier:id`, the way @ links them.
        next.push({ type: 'noteLink', attrs: { id: me.link, label: me.title, key: me.key } })
        if (at + lower.length < text.length) next.push({ ...child, text: text.slice(at + lower.length) })
        done = true
      }
      node.content = next
    }
    walk(doc)
    if (!done) return false
    // Captures keep no edit time; nuggets do.
    if (table === 'captures') db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(doc), sourceId)
    else db.prepare('update nuggets set body = ?, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), sourceId)
    return write(true)
  })

  // What @ offers besides captures: nuggets and articles by name.
  handle('items:find', (query: unknown) =>
    db.prepare("select id, tier, coalesce(nullif(title, ''), label('', body)) as name, coalesce(nullif(title, ''), label('', body)) as title from nuggets where (name like ? escape '\\' or coalesce(aliases, '') like ? escape '\\') and superseded_by is null order by updated_at desc limit 6").all(`%${like(String(query))}%`, `%${like(String(query))}%`))
  // A page of your own from nothing: notes on linear algebra, say. An article
  // with no nuggets behind it, there to be written in.
  handle('article:new', () => {
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'article', 'note', 'Untitled', 'null', ?, ?)").run(id, now(), now())
    return write(id)
  })
  // Resolve elsewhere: the capture becomes a task, and remembers it did.
  handle('toTask', (id: string) => {
    const capture = db.prepare(`select ${LABEL} as title, status from captures where id = ?`).get(id) as { title: string; status: string } | undefined
    if (!capture) return null
    // From the inbox only: a capture that took another exit keeps it.
    if (capture.status !== 'open') return 'not-open'
    const task = addTask(capture.title, id)
    db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    return write({ ...task, resolved: [id] })
  })

  // Three open captures, leaning old: the rot sampler. Random, so a sample and
  // never a queue to finish. Gated: nothing in safe mode, no private ones in
  // quiet hours.
  ipcMain.handle('captures:rot', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return []
    // Not one whose nugget was a hint in the last three days, and the same the
    // other way: the same thing twice in a row is a nag, not a surprise.
    const rot = db
      .prepare(
        // Fair by kind, as the hints are: each kind's own best first, then taken
        // in turns, so a pile of bits cannot fill every card.
        `select * from (select ${LIST}, body, back_at as backAt, row_number() over (partition by kind order by (julianday('now') - julianday(${AGED}) + 1) * (abs(random()) % 1000) desc) as turn
         from captures where status = 'open' and archived_at is null and back_at is null and ${AGED} < ? ${hidePrivate ? 'and 0' : ''}
         and id not in (select nugget_id from hint_events where shown_at >= ? union select capture_id from nuggets where capture_id is not null and id in (select nugget_id from hint_events where shown_at >= ?)))
         order by turn, abs(random()) limit ${Math.max(0, Math.min(10, settings().rotCount))}`
      )
      // Only what has sat a day: anything newer is in the list right below,
      // and a card for it would only say the same thing twice.
      .all(ago(1), ago(3), ago(3))
      .map(body)
    for (const row of rot) db.prepare('update captures set surfaced_at = ? where id = ?').run(now(), row.id as string)
    return rot
  })

  // One hint: a nugget or article, picked at random but leaning towards the
  // ones not seen for longest and the ones voted up. Logged, so a stop rate can
  // be worked out. Gated like everything else that arrives unasked.
  ipcMain.handle('hints:next', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return null
    // A third of the time, a note-to-self on rotation: the one that has gone
    // longest unseen, unconditionally. Otherwise a weighted random encounter.
    const pushed = Math.random() < 1 / 3
      ? (db.prepare(`select id, capture_id as captureId, kind, tier, title, body from nuggets where mode = 'pushed' and tier not in ('question', 'goal') and suspended = 0 and archived_at is null and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
          order by coalesce(last_visited_at, '') limit 1`).get(ago(3)) as Record<string, string> | undefined)
      : undefined
    // Half the time, or always while there are few nuggets, an old capture
    // still open: the link you meant to read, the thing you meant to look up.
    // Never one a rot card showed in the last three days.
    const few = (db.prepare('select count(*) n from nuggets where suspended = 0').get() as { n: number }).n < 20
    // Fair by kind: a kind is drawn first, each with the same chance, and
    // then one of its captures, so three hundred bits do not crowd out the
    // dozen links and words. Within a kind, older and voted-up come first.
    const candidates = `from captures where status = 'open' and archived_at is null and coalesce(surfaced_at, '') < ?
      and ${AGED} < ? and private = 0 ${hidePrivate ? 'and 0' : ''}
      and id not in (select nugget_id from hint_events where shown_at >= ?)
      and ${LABEL} not like 'http%'`
    // A bare address says nothing at a glance: a link comes up as a hint once
    // it has a name, its page's or yours.
    const kinds = (db.prepare(`select distinct kind ${candidates}`).all(ago(3), ago(7), ago(3)) as { kind: string }[]).map((row) => row.kind)
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    const old = !pushed && kind && (few || Math.random() < 0.5)
      ? (db.prepare(`select id, id as captureId, kind, title, body ${candidates} and kind = ?
          order by (julianday('now') - julianday(${AGED})) * surfacing_weight * (abs(random()) % 1000) desc limit 1`).get(ago(3), ago(7), ago(3), kind) as Record<string, string> | undefined)
      : undefined
    // Nuggets the same way: a kind drawn first, then one of its own.
    const kept = `from nuggets where suspended = 0 and archived_at is null and mode != 'pushed' and tier not in ('question', 'goal') and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0`
    const keptKinds = (db.prepare(`select distinct kind ${kept}`).all(ago(3)) as { kind: string }[]).map((row) => row.kind)
    const keptKind = keptKinds[Math.floor(Math.random() * keptKinds.length)]
    const hint = pushed ?? old ?? (keptKind === undefined ? undefined : db
      .prepare(
        `select id, capture_id as captureId, kind, tier, title, body ${kept} and kind is ?
         order by (julianday('now') - julianday(coalesce(last_visited_at, '2000-01-01'))) * surfacing_weight * (abs(random()) % 1000) desc
         limit 1`
      )
      .get(ago(3), keptKind) as Record<string, string> | undefined)
    if (!hint) return null
    if (!old) db.prepare('update nuggets set last_visited_at = ? where id = ?').run(now(), hint.id)
    // A capture's id goes in the same column: either way, what was shown.
    const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(hint.id, now())
    return { ...body(hint), event: Number(lastInsertRowid) }
  })
  // The Luhmann move: two unrelated things side by side, for the connection
  // you would never have gone looking for.
  handle('random', () => db.prepare("select id, kind, title, body from nuggets where archived_at is null and superseded_by is null and private = 0 and tier not in ('question', 'goal') order by random() limit 2").all().map(body))
  // Dwell: how long the hint was in front of you before the window went. The
  // signal every hint produces, where a vote is the rare one.
  ipcMain.handle('hints:dwell', (_event, event: number, ms: number) =>
    void db.prepare('update hint_events set dwell_ms = ? where rowid = ? and dwell_ms is null').run(Math.round(ms), event))
  // The hint rate, tuned by its own instrument: if hints have stopped stopping
  // you (under one in ten over the last month, with enough shown to tell),
  // half as many are shown. Legible: it says so, rather than going quiet.
  handle('hints:rate', () => {
    const { hintRate } = settings()
    const { shown, stopped } = db.prepare(
      "select count(*) shown, sum(reaction = 'up' or dwell_ms >= 4000) stopped from hint_events where shown_at >= ?"
    ).get(ago(30)) as { shown: number; stopped: number | null }
    const low = shown >= 20 && (stopped ?? 0) / shown < 0.1
    return { rate: low ? hintRate / 2 : hintRate, tuned: low, shown, stopped: stopped ?? 0 }
  })
  // Up makes it come back more, down less. Never a schedule, never a grade.
  ipcMain.handle('hints:react', (_event, event: number, id: string, reaction: 'up' | 'down') => {
    // Up: this one comes back half as often again; down, two-thirds as often.
    // A hint is a nugget or an old capture, so whichever it is.
    for (const table of ['nuggets', 'captures'])
      db.prepare(`update ${table} set surfacing_weight = surfacing_weight * ? where id = ?`).run(reaction === 'up' ? 1.5 : 1 / 1.5, id)
    db.prepare('update hint_events set reaction = ? where rowid = ?').run(reaction, event)
  })

  // --- nuggets and articles
  // A nugget with no name of its own is named from its words, or for what it holds.
  const ITEM = `id, tier, kind, coalesce(nullif(title, ''), label('', body)) as title, prompt, private, pinned_at as pinnedAt, due_at as dueAt, suspended,
    state is not null as reviewed, created_at as createdAt, updated_at as updatedAt, capture_id as captureId, remind_at as remindAt,
    (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) as lapses, attribution, context, mode, superseded_by as supersededBy, archived_at as archivedAt, revisions, why,
    closed_at as closedAt, closed_how as closedHow, (select count(*) from glosses where item_id = nuggets.id) as clues,
    goal_at as goalAt, goal_from as goalFrom, goal_beacon as beacon, (select max(created_at) from glosses where item_id = nuggets.id) as lastLog`
  handle('items', (tier: string) =>
    db.prepare(`select ${ITEM} from nuggets where tier = ? order by created_at desc`).all(tier)
  )
  handle('item', (id: string) => {
    // Its own title, not the name lists give it: an untitled article's title
    // box stays empty rather than showing its first line as if it were set.
    const row = db.prepare(`select ${ITEM}, title as own, body, origins from nuggets where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const glosses = db.prepare(`select id, body, author, created_at as createdAt, source_id as sourceId,
      (select 'MF-' || number from captures where id = glosses.source_id) as sourceKey from glosses where item_id = ? order by created_at`).all(id)
    return { ...body(row), title: row.own, origins: JSON.parse((row.origins as string) ?? '[]'), glosses }
  })
  handle('item:save', (id: string, patch: { body?: unknown; base?: unknown; title?: string; prompt?: string | null; kind?: string; suspended?: boolean; attribution?: string | null; context?: string | null; mode?: string; why?: string | null }) => {
    // Words written since this editor last looked are never written over: it
    // is told what is there now, as a capture's editor is.
    const moved = patch.body !== undefined && patch.base !== undefined ? movedOn('nuggets', id, patch.base) : null
    if (moved) patch = { ...patch, body: undefined }
    const allowed = ['body', 'title', 'prompt', 'kind', 'suspended', 'attribution', 'context', 'mode', 'why']
    const sets = Object.entries(patch).filter(([key, value]) => value !== undefined && allowed.includes(key))
    // A meaningful change to something you are tested on brings it back sooner,
    // a 30% cut to what is left of its interval, never a reset: fixing a
    // sentence should not cost months. Once per review, not once per save, or
    // typing would shrink it to nothing. "Meaningful" is more than a few
    // letters: what differs once the shared start and end are taken off.
    const before = db.prepare('select body, prompt, state, due_at, edited_since_review, updated_at from nuggets where id = ?').get(id) as
      { body: string; prompt: string | null; state: string | null; due_at: string | null; edited_since_review: number; updated_at: string | null } | undefined
    const changed = (a: string, b: string): boolean => {
      let start = 0
      while (start < a.length && a[start] === b[start]) start++
      let end = 0
      while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
      return Math.max(a.length, b.length) - start - end > 12
    }
    if (before?.state && !before.edited_since_review && before.due_at && new Date(before.due_at).getTime() > Date.now() &&
      ((patch.body !== undefined && changed(plain(JSON.parse(before.body ?? 'null')), plain(patch.body))) ||
        (patch.prompt !== undefined && changed(before.prompt ?? '', patch.prompt ?? '')))) {
      const left = new Date(before.due_at).getTime() - Date.now()
      db.prepare('update nuggets set due_at = ?, edited_since_review = 1 where id = ?').run(new Date(Date.now() + left * 0.7).toISOString(), id)
    }
    // Rewritten, counted: the one sign an item got better. Once per sitting,
    // not once per autosave: only when the last change is ten minutes old.
    if (before && patch.body !== undefined && changed(plain(JSON.parse(before.body ?? 'null')), plain(patch.body)) &&
      Date.now() - new Date(before.updated_at ?? 0).getTime() > 600000)
      db.prepare('update nuggets set revisions = revisions + 1 where id = ?').run(id)
    for (const [key, value] of sets) {
      const stored = key === 'body' ? JSON.stringify(value) : key === 'suspended' ? (value ? 1 : 0) : value
      db.prepare(`update nuggets set ${key} = ?, updated_at = ? where id = ?`).run(stored as string, now(), id)
    }
    // #bit written in makes it private, once, as it would a capture.
    if (patch.body !== undefined && !moved && hasTag(JSON.stringify(patch.body), 'bit') && !hasTag(before?.body, 'bit'))
      db.prepare('update nuggets set private = 1 where id = ?').run(id)
    // Said to be this item, so lists of captures do not read every body again.
    return write(moved ? { conflict: true, body: moved.body } : true, { kind: 'item', id })
  })
  // An article from nuggets: their bodies in order, the first one's title, and
  // the derivation edge kept so the article knows what it was made from.
  handle('article', (ids: string[]) => {
    const parts = ids.map((id) => db.prepare('select title, body from nuggets where id = ?').get(id) as { title: string; body: string })
    // Each body, then your glosses on it: the words already in your own voice
    // are where an article starts.
    const glossed = (id: string): string[] =>
      (db.prepare("select body from glosses where item_id = ? and author = 'user' order by created_at").all(id) as { body: string }[]).map((row) => row.body)
    const text = parts.map((part, at) => [plain(JSON.parse(part.body)), ...glossed(ids[at])].join('\n\n')).join('\n\n')
    const id = randomUUID()
    db.prepare(
      `insert into nuggets (id, tier, kind, title, body, origins, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?, ?)`
    ).run(id, parts[0]?.title ?? 'Untitled', JSON.stringify(text), JSON.stringify(ids), now(), now())
    return write(id)
  })
  // A nugget from selected words: the excerpt, with the note it came from and
  // that note's source carried down.
  handle('nugget:from', (text: string, origin: { captureId?: string; attribution?: string | null }) => {
    const id = randomUUID()
    const attribution = origin.attribution ?? (origin.captureId ? (db.prepare('select attribution from captures where id = ?').get(origin.captureId) as { attribution: string | null } | undefined)?.attribution : null)
    db.prepare("insert into nuggets (id, capture_id, kind, title, body, attribution, created_at, updated_at) values (?, ?, 'note', ?, ?, ?, ?, ?)")
      .run(id, origin.captureId ?? null, text.split('\n')[0].slice(0, 160), JSON.stringify(text), attribution ?? null, now(), now())
    // A long quote (what was an excerpt) is a container: once something is
    // pulled out of it, it has done its job. A short one is the line itself.
    if (origin.captureId) db.prepare("update captures set status = 'promoted' where id = ? and kind = 'quote' and status = 'open' and (kind_was = 'excerpt' or length(words(id, body)) > 600)").run(origin.captureId)
    return write(id)
  })
  // Wrong, and corrected: the correction becomes its own nugget, the wrong one
  // leaves review at once and points to it. Nothing is deleted: the wrong
  // version beside the right one teaches more than either alone.
  handle('supersede', (id: string, truth: string) => {
    const old = db.prepare('select kind, attribution, private from nuggets where id = ?').get(id) as { kind: string; attribution: string | null; private: number }
    const fixed = randomUUID()
    db.prepare('insert into nuggets (id, kind, title, body, attribution, private, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(fixed, old.kind, truth.split('\n')[0].slice(0, 160), JSON.stringify(truth), old.attribution, old.private, now(), now())
    db.prepare('update nuggets set superseded_by = ?, suspended = 1 where id = ?').run(fixed, id)
    return write(fixed)
  })
  // Two captures that are the same thought: this one's words join the other's,
  // and this one is discarded, so it is still there to restore.
  // Gives back what its undo needs: the other's words as they were before,
  // and as they were made, and this one's status.
  handle('capture:merge', (id: string, intoNumber: number) => {
    const from = db.prepare('select body, status from captures where id = ?').get(id) as { body: string; status: string } | undefined
    const into = db.prepare('select id, body from captures where number = ?').get(intoNumber) as { id: string; body: string } | undefined
    if (!from || !into || into.id === id) return null
    const a = JSON.parse(into.body ?? 'null'), b = JSON.parse(from.body ?? 'null')
    const joined = a && b && typeof a === 'object' && typeof b === 'object'
      ? { ...a, content: [...(a.content ?? []), ...(b.content ?? [])] }
      : `${plain(a)}\n\n${plain(b)}`
    db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(joined), into.id)
    db.prepare("update captures set status = 'discarded' where id = ?").run(id)
    checkMarkdown(id)
    return write({ into: into.id, was: a, joined, status: from.status })
  })
  // A merge taken back: the other's words as they were, unless they were
  // written in since (then nothing of theirs is lost: they stay as they are),
  // and this one back to the status it had.
  handle('capture:merge:undo', (id: string, merged: { into: string; was: unknown; joined: unknown; status: string }) => {
    if (!movedOn('captures', merged.into, merged.joined)) db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(merged.was), merged.into)
    db.prepare('update captures set status = ? where id = ?').run(merged.status, id)
    checkMarkdown(id)
    return write(true)
  })
  // A gloss is a row, never an edit: past-you stays readable beside present-you.
  // Any item's: a nugget, an article or a capture, so its id is all it needs.
  // Gives back the new row's id, so the toast can take it back.
  handle('gloss', (itemId: string, text: string) => {
    const id = randomUUID()
    db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)').run(id, itemId, text, now())
    return write(id)
  })
  // The timeline of what you thought of it, newest first: what every surface
  // shows the latest of, and a detail panel shows whole.
  handle('glosses', (itemId: string) =>
    db.prepare('select id, body, author, created_at as createdAt from glosses where item_id = ? order by created_at desc').all(itemId)
  )

  // --- questions: what you keep circling and cannot name yet. Held open on
  // purpose, for years if need be: no prompt, no review, no rot, no exit
  // asked of them. Each holds clues, dated, a gloss row each, so past-you
  // stays readable beside present-you. They end when you have got it (an
  // article, seeded with the clues) or let them go; both stay readable.
  const capturedWords = (id: string): { title: string; text: string; private: number } | undefined => {
    const row = db.prepare(`select ${LABEL} as title, body, private from captures where id = ?`).get(id) as { title: string; body: string; private: number } | undefined
    return row && { title: row.title, text: plain(JSON.parse(row.body ?? 'null')).trim() || row.title, private: row.private }
  }
  // A new question, from nothing or from a capture whose words become its first clue.
  handle('question:new', (title: string, captureId?: string) => {
    // Held from the inbox only, like every exit.
    if (captureId && (db.prepare('select status from captures where id = ?').get(captureId) as { status: string } | undefined)?.status !== 'open') return null
    const from = captureId ? capturedWords(captureId) : undefined
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, capture_id, private, created_at, updated_at) values (?, 'question', 'note', ?, 'null', ?, ?, ?, ?)")
      .run(id, (title || from?.title || 'Untitled').trim().slice(0, 300), captureId ?? null, from?.private ?? 0, now(), now())
    if (from && captureId) {
      db.prepare('insert into glosses (id, item_id, body, created_at, source_id) values (?, ?, ?, ?, ?)').run(randomUUID(), id, from.text, now(), captureId)
      db.prepare("update captures set status = 'promoted' where id = ?").run(captureId)
    }
    return write(id)
  })
  // Taken back: the question and its clues go, and a capture it came from is open again.
  handle('question:drop', (id: string) => {
    const row = db.prepare("select capture_id from nuggets where id = ? and tier = 'question'").get(id) as { capture_id: string | null } | undefined
    if (!row) return write(false)
    for (const clue of db.prepare('select source_id from glosses where item_id = ? and source_id is not null').all(id) as { source_id: string }[])
      db.prepare("update captures set status = 'open' where id = ?").run(clue.source_id)
    if (row.capture_id) db.prepare("update captures set status = 'open' where id = ?").run(row.capture_id)
    db.prepare('delete from glosses where item_id = ?').run(id)
    db.prepare('delete from nuggets where id = ?').run(id)
    return write(true)
  })
  // A clue: your words, or a capture's, dated. A capture given as a clue has
  // taken its exit, kept in the question.
  handle('clue', (id: string, text: string, sourceId?: string) => {
    const words = sourceId ? capturedWords(sourceId)?.text : String(text ?? '').trim()
    if (!words) return null
    const clue = randomUUID()
    db.prepare('insert into glosses (id, item_id, body, created_at, source_id) values (?, ?, ?, ?, ?)').run(clue, id, words, now(), sourceId ?? null)
    db.prepare('update nuggets set updated_at = ? where id = ?').run(now(), id)
    if (sourceId) db.prepare("update captures set status = 'promoted' where id = ?").run(sourceId)
    return write(clue)
  })
  handle('clue:drop', (clue: string) => {
    const row = db.prepare('select source_id from glosses where id = ?').get(clue) as { source_id: string | null } | undefined
    if (row?.source_id) db.prepare("update captures set status = 'open' where id = ?").run(row.source_id)
    return write(db.prepare('delete from glosses where id = ?').run(clue))
  })
  // Got it: an article seeded with the question, what you wrote in it and
  // every clue, oldest first so it reads as it happened, made from the
  // question so each points at the other. Or let go, with no article.
  // `again` is an undo putting back how it was settled: no second article.
  handle('question:close', (id: string, how: 'answered' | 'let go', again = false) => {
    const question = db.prepare("select title, body from nuggets where id = ? and tier = 'question'").get(id) as { title: string; body: string } | undefined
    if (!question) return null
    let article: string | null = null
    if (how === 'answered' && !again) {
      const clues = db.prepare('select body, created_at from glosses where item_id = ? order by created_at').all(id) as { body: string; created_at: string }[]
      const day = (at: string): string => dayMonth(at, 'always')
      const own = plain(JSON.parse(question.body ?? 'null')).trim()
      const text = [`> ${question.title}`, own, clues.length ? '## Clues' : '', ...clues.map((clue) => `- **${day(clue.created_at)}** · ${clue.body.replace(/\n+/g, ' ')}`)]
        .filter(Boolean).join('\n\n')
      article = randomUUID()
      db.prepare("insert into nuggets (id, tier, kind, title, body, origins, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?, ?)")
        .run(article, question.title, JSON.stringify(text), JSON.stringify([id]), now(), now())
    }
    db.prepare('update nuggets set closed_at = ?, closed_how = ? where id = ?').run(now(), how, id)
    return write({ article })
  })
  // Held again: open once more, and an article it had just started goes.
  handle('question:reopen', (id: string, article?: string | null) => {
    if (article) db.prepare("delete from nuggets where id = ? and tier = 'article' and origins = ?").run(article, JSON.stringify([id]))
    return write(db.prepare('update nuggets set closed_at = null, closed_how = null where id = ?').run(id))
  })
  // Now and then, a question still open comes back: things come back to you.
  // Gated like a nudge (never in quiet hours or safe mode), off in Settings,
  // at most one a day, and never the same one twice in a fortnight.
  handle('question:back', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate || !settings().questionsBack) return null
    const row = db.prepare(`select id, title, created_at as createdAt, (select count(*) from glosses where item_id = nuggets.id) as clues from nuggets
      where tier = 'question' and closed_at is null and archived_at is null and private = 0 and id not in (select nugget_id from hint_events where shown_at >= ?)
      order by random() limit 1`).get(ago(14)) as { id: string; title: string; createdAt: string; clues: number } | undefined
    if (!row || nudgedToday('question')) return null
    const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(row.id, now())
    return { ...row, event: Number(lastInsertRowid) }
  })

  // --- goals: a day you are working toward, and the road to it. A goal
  // lives beside the questions, a nugget row with its own tier: dated logs
  // (glosses, kept by the same 'clue' channel), never reviewed, never rotting.
  // It ends when you say how it went: made it, missed, or let go.
  const isDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d\d-\d\d$/.test(day)
  handle('goal:new', (title: string, target: string, from?: string | null, why?: string | null) => {
    if (!isDay(target)) return null
    const start = isDay(from) ? from : dayKey()
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, why, goal_at, goal_from, created_at, updated_at) values (?, 'goal', 'note', ?, 'null', ?, ?, ?, ?, ?)")
      .run(id, String(title ?? '').trim().slice(0, 300) || 'Untitled', why?.trim() || null, target, start > target ? target : start, now(), now())
    goalPassed(id)
    goalsTold()
    return write(id)
  })
  // Its dates moved: the start never after the target. Milestones it has
  // already passed on the new dates are marked, so none floods in.
  handle('goal:dates', (id: string, dates: { target?: string; from?: string }) => {
    const row = db.prepare("select goal_at, goal_from from nuggets where id = ? and tier = 'goal'").get(id) as { goal_at: string; goal_from: string } | undefined
    if (!row) return null
    const target = isDay(dates.target) ? dates.target : row.goal_at
    const from = isDay(dates.from) ? dates.from : row.goal_from
    db.prepare('update nuggets set goal_at = ?, goal_from = ?, updated_at = ? where id = ?').run(target, from > target ? target : from, now(), id)
    goalPassed(id)
    goalsTold()
    return write(true)
  })
  handle('goal:close', (id: string, how: 'made it' | 'missed' | 'let go') => {
    if (!['made it', 'missed', 'let go'].includes(how)) return null
    const done = db.prepare("update nuggets set closed_at = ?, closed_how = ? where id = ? and tier = 'goal'").run(now(), how, id).changes > 0
    goalsTold()
    return write(done)
  })
  handle('goal:reopen', (id: string) => {
    const done = db.prepare("update nuggets set closed_at = null, closed_how = null where id = ? and tier = 'goal'").run(id).changes > 0
    goalsTold()
    return write(done)
  })
  // How often this goal's beacon shows; null goes back to the Settings default.
  handle('goal:beacon:set', (id: string, mode: 'always' | 'sometimes' | 'off' | null) => {
    const done = db.prepare("update nuggets set goal_beacon = ? where id = ? and tier = 'goal'").run(['always', 'sometimes', 'off'].includes(mode ?? '') ? mode : null, id).changes > 0
    goalsTold()
    return write(done)
  })
  // Taken back: the goal and its logs go, and a capture logged in it is open again.
  handle('goal:drop', (id: string) => {
    if (!db.prepare("select 1 from nuggets where id = ? and tier = 'goal'").get(id)) return write(false)
    for (const log of db.prepare('select source_id from glosses where item_id = ? and source_id is not null').all(id) as { source_id: string }[])
      db.prepare("update captures set status = 'open' where id = ?").run(log.source_id)
    db.prepare('delete from glosses where item_id = ?').run(id)
    db.prepare('delete from nuggets where id = ?').run(id)
    goalsTold()
    return write(true)
  })

  // --- review
  // Due items with a prompt, most at risk first, inside the day's two limits so
  // the queue can always be finished.
  // The new-item cap, tuned by its own instrument: when reviews more than a
  // day overdue outnumber a day's limit, the queue is not being finished, and
  // half as many new ones come in until it is. Said in Settings, never silent.
  const newCap = (): { cap: number; tuned: boolean; behind: number } => {
    const { newPerDay, reviewsPerDay } = settings()
    const behind = (db.prepare(`select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and state is not null and due_at <= ?`)
      .get(ago(1)) as { n: number }).n
    const tuned = behind > reviewsPerDay
    return { cap: tuned ? Math.floor(newPerDay / 2) : newPerDay, tuned, behind }
  }
  handle('review:tuning', newCap)
  reviewQueue = () => {
    const { reviewsPerDay } = settings()
    const newPerDay = newCap().cap
    // Today on your calendar, not London's: a day's limits start at your midnight.
    const today = new Date(startOfDay()).toISOString()
    const done = db.prepare('select sum(first) as fresh, count(*) - sum(first) as old from review_log where reviewed_at >= ?').get(today) as { fresh: number | null; old: number | null }
    // Most at risk: the lowest chance of recall now, by the card's own memory.
    const risk = scheduler()
    const exam = examOf()
    // Everything tested, so a card with an exam ahead can be called in for the
    // last look even when its own schedule would wait past the date.
    const tested = (db
      .prepare(`select ${ITEM}, body, state, (select body from glosses where item_id = nuggets.id and author = 'user' order by created_at desc limit 1) as gloss
        from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null`)
      .all() as Record<string, unknown>[])
      .map((row) => ({ row, exam: exam(row) }))
    const swept = ({ row, exam }: { row: Record<string, unknown>; exam: Exam | null }): boolean => {
      if (!exam || Date.now() < exam.sweep) return false
      const last = cardOf(row.state as string).last_review
      // A card buried today waits for tomorrow, which falls before the exam
      // ends; only one whose own day would come after it is called in early.
      const due = row.dueAt ? new Date(String(row.dueAt)).getTime() : 0
      return (!last || last.getTime() < exam.sweep) && (due <= Date.now() || due > startOfDay(1, exam.day))
    }
    const nearest = (a: { exam: Exam | null }, b: { exam: Exam | null }): number => (a.exam?.day ?? Infinity) - (b.exam?.day ?? Infinity)
    const due = tested
      .filter((one) => one.row.state && (String(one.row.dueAt) <= now() || swept(one)))
      .map((one) => ({ ...one, recall: risk.get_retrievability(cardOf(one.row.state as string), new Date(), false) }))
      // Nearest exam first, then most at risk.
      .sort((a, b) => nearest(a, b) || a.recall - b.recall)
    // Cards with an exam ahead are not held back by the daily limit: the date is.
    const room = Math.max(0, reviewsPerDay - (done.old ?? 0))
    const examDue = due.filter((one) => one.exam)
    const otherDue = due.filter((one) => !one.exam).slice(0, Math.max(0, room - examDue.length))
    // New cards with an exam are paced: an even share a day of what is unseen,
    // so all of it has been met before the last few days' sweep.
    const unseen = tested.filter((one) => !one.row.state && (!one.row.dueAt || String(one.row.dueAt) <= now())).sort((a, b) => nearest(a, b) || String(a.row.createdAt).localeCompare(String(b.row.createdAt)))
    const metToday = new Set((db.prepare('select item_id from review_log where first = 1 and reviewed_at >= ?').all(today) as { item_id: string }[]).map((row) => row.item_id))
    const examFresh = examDates().flatMap(({ tag }) => {
      const mine = unseen.filter((one) => one.exam?.tag === tag)
      if (!mine.length) return []
      const one = mine[0].exam!
      const met = tested.filter((other) => other.exam?.tag === tag && metToday.has(other.row.id as string)).length
      const days = Math.max(1, Math.ceil(dayjs(one.sweep).diff(dayjs(), 'day', true)))
      return mine.slice(0, Math.max(0, Math.ceil((mine.length + met) / days) - met))
    })
    const fresh = unseen.filter((one) => !one.exam).slice(0, Math.max(0, newPerDay - (done.fresh ?? 0)))
    return [...examDue, ...examFresh, ...otherDue, ...fresh].map(({ row, exam }) => ({
      ...body(row), state: undefined, exam: exam?.tag ?? null, intervals: preview(row.state as string | null, (when) => capped(when, exam))
    }))
  }
  handle('review:queue', () => reviewQueue())
  // Bury: not today. The timing is wrong, the item is fine, and the schedule is
  // left as it was; it is simply back tomorrow.
  handle('review:bury', (id: string) => {
    const tomorrow = new Date(startOfDay(1)).toISOString()
    return write(db.prepare('update nuggets set due_at = ? where id = ?').run(tomorrow, id))
  })
  // The same cards a session would start with, exam sweep and limits included.
  handle('review:counts', () => reviewQueue().length)
  // Only a graded review moves a schedule: not opening, not searching.
  handle('review:grade', (id: string, grade: Grade, ms: number) => {
    const row = db.prepare(`select ${ITEM}, body, state from nuggets where id = ?`).get(id) as Record<string, unknown> & { state: string | null }
    const { card } = scheduler().next(cardOf(row.state), new Date(), grade)
    // The card keeps its own schedule; only the day it is asked for is
    // brought inside an exam's date.
    const due = capped(card.due, examOf()(row))
    db.prepare('update nuggets set state = ?, due_at = ?, edited_since_review = 0 where id = ?').run(JSON.stringify(card), due.toISOString(), id)
    db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)').run(id, grade, now(), ms, row.state ? 0 : 1)
    return write(due.toISOString())
  })
  // A card's own past: each review, its grade, and when it is next due.
  handle('review:history', (id: string) => ({
    reviews: db.prepare('select reviewed_at as at, grade from review_log where item_id = ? order by reviewed_at').all(id) as { at: string; grade: number }[],
    dueAt: (db.prepare('select due_at from nuggets where id = ?').get(id) as { due_at: string | null } | undefined)?.due_at ?? null
  }))
  // Where a card came from, to reread after missing it: the capture it was
  // kept from, or the first nugget an article was made of.
  handle('review:source', (id: string) => {
    const capture = db.prepare(`select 'capture' as type, c.id, label(c.title, c.body) as title, c.body from captures c join nuggets n on n.capture_id = c.id where n.id = ?`).get(id) as Record<string, unknown> | undefined
    if (capture) return body(capture)
    const origin = (JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])[0]
    const nugget = origin && (db.prepare('select tier as type, id, title, body from nuggets where id = ?').get(origin) as Record<string, unknown> | undefined)
    return nugget ? body(nugget) : null
  })

  // --- exams: a date on a tag. Intervals are capped so nothing falls past
  // it, new cards are paced to all be met in time, and the last few days are
  // a sweep that brings every card round once more.
  const SWEEP_DAYS = 3
  type Exam = { tag: string; day: number; sweep: number }
  /** Tags with a date not yet over, nearest first. The day counts from its midnight. */
  const examDates = (): Exam[] =>
    (db.prepare('select tag, exam_at from tag_meta where exam_at is not null').all() as { tag: string; exam_at: string }[])
      .map((row) => {
        const day = startOfDay(0, row.exam_at)
        return { tag: row.tag, day, sweep: startOfDay(-SWEEP_DAYS, row.exam_at) }
      })
      .filter((one) => startOfDay(1, one.day) > Date.now())
      .sort((a, b) => a.day - b.day)
  /** A reader of which exam, if any, a nugget is for: the nearest among its tags. */
  const examOf = (): ((row: Record<string, unknown>) => Exam | null) => {
    const exams = examDates()
    if (!exams.length) return () => null
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    return (row) => {
      const words = typeof row.body === 'string' ? JSON.parse(row.body ?? 'null') : row.body
      const tags = new Set(tagsIn(`${row.title ?? ''} ${plain(words)}`).map((tag) => alias.get(tag) ?? tag))
      return exams.find((one) => tags.has(one.tag)) ?? null
    }
  }
  /** A due date brought inside the exam: before the sweep, to its start; during it, to the day. */
  const capped = (due: Date, exam: Exam | null): Date => {
    if (!exam) return due
    const limit = Date.now() < exam.sweep ? exam.sweep : exam.day
    return limit > Date.now() && due.getTime() > limit ? new Date(limit) : due
  }
  // How ready each exam is: solid (likely still known on the day), learning,
  // struggling (missed last time, or often), and not yet seen.
  const readiness = (): { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }[] => {
    const exams = examDates()
    if (!exams.length) return []
    const exam = examOf()
    const { retention } = settings()
    const rows = (db.prepare(`select ${ITEM}, body, state, (select grade from review_log where item_id = nuggets.id order by reviewed_at desc limit 1) as last
      from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null`).all() as Record<string, unknown>[])
      .map((row) => ({ row, exam: exam(row) }))
    const startOfToday = startOfDay()
    const risk = scheduler()
    return exams.map(({ tag, day, sweep }) => {
      const mine = rows.filter((one) => one.exam?.tag === tag).map(({ row }) => row)
      const unseen = mine.filter((row) => !row.state).length
      const struggling = mine.filter((row) => row.state && (row.last === 1 || Number(row.lapses) >= 3)).length
      const solid = mine.filter((row) => row.state && row.last !== 1 && Number(row.lapses) < 3 &&
        risk.get_retrievability(cardOf(row.state as string), new Date(Math.max(day, Date.now())), false) >= retention).length
      // Behind: reviews left from before today, and in the sweep, anything still unseen.
      const late = mine.filter((row) => row.state && row.dueAt && new Date(String(row.dueAt)).getTime() < startOfToday).length
      const behind = late + (Date.now() >= sweep ? unseen : 0)
      const days = Math.max(0, daysFromToday(day))
      // Paced like the queue: everything met by the sweep, then within the days left.
      const pace = Date.now() < sweep ? Math.ceil(dayjs(sweep).diff(dayjs(), 'day', true)) : days
      return { tag, at: new Date(day).toISOString(), days, total: mine.length, solid, learning: mine.length - unseen - struggling - solid, struggling, unseen, behind, perDay: Math.ceil((late + unseen) / Math.max(1, pace)) }
    })
  }
  handle('exams', readiness)

  // --- gentle nudges, at most one of each a day, never in quiet hours or safe mode
  const nudgedToday = (key: string): boolean => {
    const day = dayKey()
    if ((db.prepare('select day from nudges where key = ?').get(key) as { day: string } | undefined)?.day === day) return true
    db.prepare('insert or replace into nudges (key, day) values (?, ?)').run(key, day)
    return false
  }
  /** The open goal most in need of a word, as a nudge, or null; marks it nudged. */
  const quietGoal = (): { kind: 'goal'; view: string; id: string; label: string; text: string } | null => {
    const today = dayKey()
    for (const goal of openGoals().filter((one) => !one.private)) {
      const left = daysLeft(goal.goalAt, today)
      if (left < 0) continue
      const quiet = daysBetween(dayKey(goal.lastLog ?? goal.createdAt), today)
      if (quiet < 7) continue
      // Every week at first; every three days after a fortnight, or within a fortnight of the day; every day in the last week.
      const every = left <= 7 ? 1 : quiet >= 14 || left <= 14 ? 3 : 7
      const last = (db.prepare('select day from nudges where key = ?').get(`goal:${goal.id}`) as { day: string } | undefined)?.day
      if (last && daysBetween(last, today) < every) continue
      db.prepare('insert or replace into nudges (key, day) values (?, ?)').run(`goal:${goal.id}`, today)
      const name = `“${goal.title.length > 60 ? `${goal.title.slice(0, 60)}…` : goal.title}”`
      const said = left === 0 ? 'is today' : `is ${left === 1 ? 'tomorrow' : `${num(left)} days away`}`
      const weeks = quiet >= 14 ? `${Math.floor(quiet / 7)} weeks` : 'a week'
      const text = left <= 14
        ? `${name} ${said}, and the last log was ${quiet >= 14 ? `${weeks} ago` : 'a week ago'}. Worth a look today.`
        : quiet >= 14
          ? `${weeks[0].toUpperCase()}${weeks.slice(1)} without a word on ${name}. ${leftSaid(left)}. Where does it stand?`
          : `No log on ${name} for a week. ${leftSaid(left)}. A line on where it stands keeps it alive.`
      return { kind: 'goal', view: 'goals', id: goal.id, label: 'Goal', text }
    }
    return null
  }
  handle('nudge', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) return null
    const { examNudges, weeklyReview, weeklyDay, dailyTidy } = settings()
    if (examNudges)
      for (const exam of readiness())
        if (exam.behind > 0 && !nudgedToday(`exam:${exam.tag}`))
          return { kind: 'exam', view: 'review', label: `Exam · #${exam.tag}`,
            text: `#${exam.tag} is ${exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${num(exam.days)} days`}, and ${num(exam.behind)} ${exam.behind === 1 ? 'card is' : 'cards are'} behind. About ${exam.perDay} a day catches you up.` }
    // The deciding pass, on its day. No count: what it holds is what you set
    // aside, and the point of setting it aside was to stop carrying it.
    if (weeklyReview && dayjs().day() === weeklyDay) {
      if (decideList().length && !nudgedToday('weekly'))
        return { kind: 'weekly', view: 'decide', label: 'Deciding day',
          text: 'Deciding day. What you said you would come back to is here, with a few that have waited longest. Keep, act on or let go of each.' }
    }
    // A goal gone quiet: a week with no log, then sooner and more plainly as
    // the quiet stretches or the day comes near. One goal a day at most.
    if (settings().goalNudges) {
      const goal = quietGoal()
      if (goal) return goal
    }
    // The tidy pass, most mornings: only once there is something from before today.
    if (dailyTidy && tidyList().some((one) => (one.capturedAt as string) < dayjs().startOf('day').toISOString()) && !nudgedToday('tidy'))
      return { kind: 'tidy', view: 'tidy', label: 'Daily tidy',
        text: 'A few minutes to tidy the last few days: a tag here, a bold line there. Nothing to decide.' }
    return null
  })

  // --- memories, the way Photos brings them: a day in an earlier year, or
  // things that share a source. Each says which it is.
  handle('memory', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || !settings().memories) return null
    const year = dayjs().year()
    const today = dayKey()
    const lastYear = `${year - 1}${today.slice(4)}`
    // Never a private one, and in quiet hours nothing you have not dealt with.
    const from = `select id, id as captureId, kind, ${LABEL} as title, body, captured_at as at, attribution, surfacing_weight as weight from captures
      where status != 'discarded' and archived_at is null and private = 0 and not exists (select 1 from nuggets where capture_id = captures.id and private = 1) ${hidePrivate ? "and status != 'open'" : ''} and id not in (select nugget_id from hint_events where shown_at >= ?)`
    // Weighted by your thumbs: down makes a memory come up less, up more.
    const pick = <T,>(rows: T[]): T | undefined => {
      const weight = (row: T): number => Number((row as { weight?: number }).weight ?? 1)
      let left = Math.random() * rows.reduce((sum, row) => sum + weight(row), 0)
      return rows.find((row) => (left -= weight(row)) < 0) ?? rows[rows.length - 1]
    }
    const age = (at: string): number => year - dayjs(at).year()
    const kinds: (() => (Record<string, unknown> & { body?: unknown; memory: string }) | undefined)[] = [
      () => {
        const row = pick(db.prepare(`${from} and strftime('%m-%d', captured_at, 'localtime') = ? and strftime('%Y', captured_at, 'localtime') < ?`).all(ago(30), today.slice(5), String(year)) as Record<string, string>[])
        return row && { ...row, memory: age(row.at) === 1 ? 'A year ago today' : `${age(row.at)} years ago today` }
      },
      () => {
        const row = pick(db.prepare(`${from} and date(captured_at, 'localtime') between date(?, '-3 days') and date(?, '+3 days') and date(captured_at, 'localtime') != ?`).all(ago(30), lastYear, lastYear, lastYear) as Record<string, string>[])
        return row && { ...row, memory: 'This time last year' }
      },
      () => {
        const row = pick(db.prepare(`${from} and strftime('%W', captured_at, 'localtime') = strftime('%W', 'now', 'localtime') and cast(strftime('%Y', captured_at, 'localtime') as integer) <= ?`).all(ago(30), year - 2) as Record<string, string>[])
        return row && { ...row, memory: `This week in ${dayjs(row.at).year()}` }
      },
      () => {
        const source = pick(db.prepare("select attribution from captures where status != 'discarded' and archived_at is null and private = 0 and coalesce(attribution, '') != '' group by attribution having count(*) >= 2").all() as { attribution: string }[])
        const rows = source ? (db.prepare(`${from} and attribution = ?`).all(ago(30), source.attribution) as Record<string, string>[]) : []
        const row = pick(rows)
        return row && { ...row, memory: `From ${row.attribution}${rows.length > 1 ? `, one of ${num(rows.length)}` : ''}` }
      }
    ]
    // Each kind in a random order, the first that has one.
    for (const kind of kinds.sort(() => Math.random() - 0.5)) {
      const found = kind()
      if (!found) continue
      delete found.weight
      const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(String(found.id), now())
      return { ...body(found), event: Number(lastInsertRowid) }
    }
    return null
  })

  // Whether any capture is still old enough to rot: none, and the rot area says so.
  handle('rot:left', () => (db.prepare(`select count(*) n from captures where status = 'open' and archived_at is null and ${AGED} < ?`).get(ago(1)) as { n: number }).n)
  // How many rot cards would come up now: none in safe mode or quiet hours,
  // when the cards themselves hold back. For the box's "3 old" chip.
  handle('rot:waiting', () => {
    const { blackout, hidePrivate } = gate()
    return blackout || hidePrivate ? 0 : Math.min(settings().rotCount, (db.prepare(`select count(*) n from captures where status = 'open' and archived_at is null and ${AGED} < ?`).get(ago(1)) as { n: number }).n)
  })

  // --- the two passes: a daily tidy that only makes things findable, and a
  // weekly one that decides. Tidied is when the tidy pass last moved on from
  // it; back is the soft "come back to this" mark, a date and never a count;
  // passed is when the deciding pass last showed it and you left it open.
  column('captures', 'tidied_at text')
  column('captures', 'back_at text')
  column('captures', 'passed_at text')
  // The last week's captures not yet tidied, oldest first, the way they were
  // written. Not an import: a vault arriving is not something you caught.
  const tidyList = (): Record<string, unknown>[] =>
    db.prepare(`select ${LIST}, body, back_at as backAt from captures where status = 'open' and archived_at is null and tidied_at is null
      and imported_at is null and captured_at >= ? order by captured_at`).all(ago(7)).map(body)
  // What deciding walks: everything marked to come back to; anything never
  // tidied, a week on; and, so nothing rots unseen, the few tidied ones open
  // longest that it has not shown for two months. A dozen of each at most.
  const decideList = (): Record<string, unknown>[] => {
    const rows = [
      ...db.prepare(`select ${LIST}, body, back_at as backAt, 'back' as why from captures where status = 'open' and archived_at is null and back_at is not null order by back_at`).all(),
      ...db.prepare(`select ${LIST}, body, back_at as backAt, 'untidied' as why from captures where status = 'open' and archived_at is null and back_at is null and tidied_at is null
        and ${AGED} < ? and coalesce(passed_at, '') < ? order by captured_at limit 12`).all(ago(7), ago(21)),
      ...db.prepare(`select ${LIST}, body, back_at as backAt, 'longest' as why from captures where status = 'open' and archived_at is null and back_at is null and tidied_at is not null
        and ${AGED} < ? and coalesce(passed_at, '') < ? order by captured_at limit 5`).all(ago(30), ago(60))
    ] as Record<string, unknown>[]
    return rows.map(body)
  }
  handle('pass:tidy', tidyList)
  handle('pass:decide', decideList)
  // How many each would walk, for whether to offer it at all; never shown as a number to clear.
  handle('pass:waiting', () => ({ tidy: tidyList().length, decide: decideList().length }))
  // Moved on from in the tidy pass: findable now. Not a change to undo.
  handle('pass:tidied', (id: string) => write(db.prepare('update captures set tidied_at = ? where id = ? and tidied_at is null').run(now(), id)))
  // Come back to this on deciding day, or not after all; `at` puts back what it was.
  handle('pass:back', (id: string, on: boolean, at?: string | null) =>
    write(db.prepare('update captures set back_at = ? where id = ?').run(on ? at ?? now() : null, id)))
  // Left open on purpose in the deciding pass: findable is enough. It stops
  // asking to be come back to, and is not shown again for two months.
  handle('pass:keep', (id: string) =>
    write(db.prepare('update captures set back_at = null, tidied_at = coalesce(tidied_at, ?), passed_at = ? where id = ? returning 1').get(now(), now(), id)))
  handle('pass:unkeep', (id: string, was: { backAt: string | null; tidiedAt: string | null; passedAt: string | null }) =>
    write(db.prepare('update captures set back_at = ?, tidied_at = ?, passed_at = ? where id = ?').run(was.backAt, was.tidiedAt, was.passedAt, id)))
  // Shown and stepped past: it waits its turn again rather than leading every week.
  handle('pass:seen', (id: string) => write(db.prepare('update captures set passed_at = ? where id = ? and back_at is null').run(now(), id)))
  handle('pass:state', (id: string) =>
    db.prepare('select back_at as backAt, tidied_at as tidiedAt, passed_at as passedAt from captures where id = ?').get(id) ?? null)
  // A tag put on or taken off one capture, in its words, since that is where
  // tags live: added at the end of its first line, where its row reads them;
  // taken off wherever it is written. Gives the words as they now are.
  handle('pass:tag', (id: string, raw: string, on: boolean) => {
    const tag = String(raw).replace(/^#/, '').toLowerCase()
    if (!/^[a-z][\w-]*$/.test(tag)) return null
    const row = db.prepare('select body from captures where id = ?').get(id) as { body: string } | undefined
    if (!row) return null
    let doc = JSON.parse(row.body ?? 'null')
    const written = new RegExp(`(^|\\s)#${tag.replace(/-/g, '\\-')}(?![\\w-])`, 'gi')
    type Node = { type?: string; text?: string; content?: Node[] }
    if (on) {
      if (tagsIn(`${plain(doc)}`).includes(tag)) return doc
      const first = (doc?.content ?? []).findIndex((block: Node) => ['paragraph', 'heading'].includes(block.type ?? '') && block.content?.length)
      doc = doc && typeof doc === 'object'
        ? first >= 0
          ? { ...doc, content: doc.content.map((block: Node, index: number) => (index === first ? { ...block, content: [...(block.content ?? []), { type: 'text', text: ` #${tag}` }] } : block)) }
          : { ...doc, content: [{ type: 'paragraph', content: [{ type: 'text', text: `#${tag}` }] }, ...(doc.content ?? [])] }
        : String(doc ?? '').replace(/^([^\n]*)/, (line) => `${line} #${tag}`.trim())
    } else {
      const strip = (node: Node): Node => ({
        ...node,
        ...(node.text !== undefined ? { text: node.text.replace(written, '') } : {}),
        ...(node.content ? { content: node.content.map(strip).filter((one) => one.text !== '') } : {})
      })
      doc = doc && typeof doc === 'object' ? strip(doc) : String(doc ?? '').replace(written, '')
    }
    db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(doc), id)
    return write(doc)
  })

  // --- the recap, Wrapped's way: a month or a year in what you did here
  handle('recap', (period: 'month' | 'year') => {
    let start = dayjs().startOf(period)
    let end = dayjs()
    let finished = false
    // Early in a month there is little to say yet: the month before, whole,
    // if anything was caught in it; otherwise this month so far.
    if (period === 'month' && end.date() < 7) {
      const before = start.subtract(1, 'month')
      if ((db.prepare('select count(*) n from captures where captured_at >= ? and captured_at < ?').get(before.toISOString(), start.toISOString()) as { n: number }).n) {
        end = start
        start = before
        finished = true
      }
    }
    const [since, until] = [start.toISOString(), end.toISOString()]
    const rows = db.prepare(`select ${LABEL} as title, body, status, attribution, private, captured_at as at from captures where captured_at >= ? and captured_at < ?`).all(since, until) as { title: string; body: string; status: string; attribution: string | null; private: number; at: string }[]
    // Counted whole, but a private one never named: its tags and source stay out.
    const open = rows.filter((row) => !row.private)
    const top = (values: string[], limit = 5): { name: string; n: number }[] =>
      [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, n]) => ({ name, n }))
    const busiestDay = top(rows.map((row) => dayKey(row.at)), 1)[0] ?? null
    const busiestMonth = period === 'year' ? top(rows.map((row) => String(dayjs(row.at).month())), 1)[0] ?? null : null
    const reviewed = db.prepare(`select coalesce(nullif(n.title, ''), label('', n.body)) as title, count(*) n from review_log r join nuggets n on n.id = r.item_id
      where r.reviewed_at >= ? and r.reviewed_at < ? and n.private = 0
      group by r.item_id order by n desc limit 1`).get(since, until) as { title: string; n: number } | undefined
    // The books begun in it, finished or still going, each with the lines kept
    // from it: a quote whose where begins with the book's name. A book is
    // anything tagged #book, named without its tags.
    const lines = db.prepare(`select count(*) n from captures where kind = 'quote' and private = 0 and status != 'discarded'
      and captured_at >= ? and captured_at < ? and lower(coalesce(medium, '')) like lower(?) || '%'`)
    const books = (db.prepare(`select ${LABEL} as title, title as own, body, attribution as by, json_extract(fields, '$.status') as state from captures
      where body like '%#book%' and private = 0 and status != 'discarded' and captured_at >= ? and captured_at < ? order by captured_at`).all(since, until) as { title: string; own: string | null; body: string | null; by: string | null; state: string | null }[])
      .filter((book) => hasTag(`${book.own ?? ''} ${book.body ?? ''}`, 'book'))
      .map((book) => ({ ...book, title: book.title.replace(/(?:^|\s)#[a-z][\w-]*/gi, '').trim() }))
      .filter((book) => book.title && (book.state === 'Finished' || book.state === 'Reading'))
      .map((book) => ({ title: book.title, by: book.by, finished: book.state === 'Finished', lines: (lines.get(since, until, book.title) as { n: number }).n }))
    // What was caught, by kind, and the same for the span before it, for the
    // shape of it: counts only, so a private one counts here as everywhere.
    const byKind = db.prepare('select kind, count(*) n from captures where captured_at >= ? and captured_at < ? group by kind order by n desc')
    const before = start.subtract(1, period)
    const kindsBefore = byKind.all(before.toISOString(), start.toISOString()) as { kind: string; n: number }[]
    return {
      label: start.format(period === 'year' ? 'YYYY' : 'MMMM YYYY'),
      // A month already over has no "yet" about it.
      finished,
      captures: rows.length,
      words: rows.reduce((sum, row) => sum + plain(JSON.parse(row.body ?? 'null')).split(/\s+/).filter(Boolean).length, 0),
      busiestDay,
      busiestMonth: busiestMonth && { name: monthName(Number(busiestMonth.name)), n: busiestMonth.n },
      tags: top(open.flatMap((row) => tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`))),
      sources: top(open.map((row) => row.attribution ?? '').filter(Boolean)),
      kept: rows.filter((row) => row.status === 'promoted').length,
      resolved: rows.filter((row) => row.status === 'resolved').length,
      discarded: rows.filter((row) => row.status === 'discarded').length,
      reviews: (db.prepare('select count(*) n from review_log where reviewed_at >= ? and reviewed_at < ?').get(since, until) as { n: number }).n,
      mostReviewed: reviewed ?? null,
      books,
      kinds: byKind.all(since, until) as { kind: string; n: number }[],
      before: kindsBefore.length ? { label: before.format(period === 'year' ? 'YYYY' : 'MMMM YYYY'), kinds: kindsBefore } : null,
      // The days anything was reviewed on: a habit, counted, never a streak to keep.
      reviewDays: (db.prepare("select count(distinct date(reviewed_at, 'localtime')) n from review_log where reviewed_at >= ? and reviewed_at < ?").get(since, until) as { n: number }).n
    }
  })

  // --- tasks
  const TASK = `id, number, title, status, due_at as dueAt, all_day as allDay, recurrence, origin_capture_id as captureId,
    created_at as createdAt, completed_at as completedAt, waiting_on as waitingOn, estimate, sort_order as sortOrder, repeat_until as repeatUntil,
    important, deadline_at as deadline, deadline_timed as deadlineTimed, blocker, reschedules, notify, priority, plan_for as planFor`
  // Where an open task came from, for grouping by note: the capture it was
  // made from, or else the first thing linked to it.
  const FROM = `coalesce(origin_capture_id, (select item_id from task_links where task_id = tasks.id limit 1))`
  handle('tasks', () => db.prepare(`select ${TASK}, subtasks, ${FROM} as fromId,
    coalesce((select case when private then 'Private note' else ${LABEL} end from captures where id = ${FROM}), (select title from nuggets where id = ${FROM})) as fromTitle
    from tasks order by status, case priority when 0 then 5 else priority end, coalesce(sort_order, 1e12), due_at is null, due_at, created_at`).all()
    .map((row) => ({ ...(row as object), subtasks: JSON.parse(((row as { subtasks: string | null }).subtasks) ?? '[]') })))
  handle('task', (id: string) => {
    const row = db.prepare(`select ${TASK}, notes, subtasks from tasks where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const done = db.prepare('select done_at as at, s.recap from task_done d left join sessions s on s.id = d.session_id where d.task_id = ? order by done_at desc').all(id)
    // What the task is about, linked from nuggets and articles: shown as a
    // checklist on it, and the material comes up first when you open it.
    const linked = db.prepare(`select n.id, n.tier, n.kind, n.title from task_links l join nuggets n on n.id = l.item_id where l.task_id = ?
      union all select c.id, 'capture', c.kind, label(c.title, c.body) from task_links l join captures c on c.id = l.item_id where l.task_id = ?`).all(id, id)
    return { ...row, notes: JSON.parse((row.notes as string) ?? 'null'), subtasks: JSON.parse((row.subtasks as string) ?? '[]'), done, linked }
  })
  handle('task:add', (text: string, origin?: string, today = false) => write(addTask(String(text), origin ?? null, today)))
  // Study this: a task made from a nugget or an article, linked to it, so the
  // reading has a when and the material is waiting when the task opens.
  handle('study', (itemId: string, text: string) => {
    const task = addTask(text)
    db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, itemId)
    return write(task)
  })
  const TASK_COLUMNS = { title: 'title', recurrence: 'recurrence', waitingOn: 'waiting_on', estimate: 'estimate', sortOrder: 'sort_order', important: 'important', deadline: 'deadline_at', blocker: 'blocker', reschedules: 'reschedules', notify: 'notify', priority: 'priority', plan: 'plan_for' } as const
  handle('task:save', (id: string, patch: { title?: string; notes?: unknown; due?: string | null; recurrence?: string | null; status?: string; waitingOn?: string | null; subtasks?: unknown; estimate?: number | null; sortOrder?: number | null; important?: number; deadline?: string | null; blocker?: string | null; reschedules?: number; notify?: string | null; priority?: number; plan?: string | null; notifiedAt?: string | null }) => {
    // What a move changes on its own (the reschedule count, whether it was told
    // about), given back so its undo can put both back exactly.
    const before = db.prepare('select reschedules, notified_at as notifiedAt from tasks where id = ?').get(id) as { reschedules: number; notifiedAt: string | null } | undefined
    // A deadline moved by whole days keeps its time; one picked as a day has none.
    const clock = (iso: string | null | undefined): string => (iso ? new Date(iso).toTimeString().slice(0, 5) : '')
    if (patch.deadline !== undefined) {
      const was = (db.prepare('select deadline_at from tasks where id = ?').get(id) as { deadline_at: string | null } | undefined)?.deadline_at
      if (clock(was) !== clock(patch.deadline)) db.prepare('update tasks set deadline_timed = 0 where id = ?').run(id)
    }
    const deadlineWas = patch.deadline !== undefined ? (db.prepare('select deadline_at from tasks where id = ?').get(id) as { deadline_at: string | null } | undefined)?.deadline_at : undefined
    for (const [key, column] of Object.entries(TASK_COLUMNS))
      if (patch[key as keyof typeof patch] !== undefined) db.prepare(`update tasks set ${column} = ? where id = ?`).run(patch[key as keyof typeof patch] as string | number | null, id)
    // Important and priority are one thing said two ways: Urgent and High are
    // important, and marking important is High unless it is Urgent already.
    if (patch.priority !== undefined) db.prepare('update tasks set important = ? where id = ?').run([1, 2].includes(patch.priority) ? 1 : 0, id)
    else if (patch.important !== undefined)
      db.prepare('update tasks set priority = case when ? then (case when priority in (1, 2) then priority else 2 end) else (case when priority in (1, 2) then 0 else priority end) end where id = ?').run(patch.important ? 1 : 0, id)
    // A day and a vaguer when do not sit together: the newer one wins.
    if (patch.plan) db.prepare('update tasks set due_at = null where id = ?').run(id)
    if (patch.due) db.prepare('update tasks set plan_for = null where id = ?').run(id)
    // Waiting on someone needs a day to chase them, or it becomes a second
    // rot pool: three days out, if it has no date of its own.
    if (patch.waitingOn) db.prepare('update tasks set due_at = ? where id = ? and due_at is null').run(dayjs().add(3, 'day').toISOString(), id)
    if (patch.subtasks !== undefined) db.prepare('update tasks set subtasks = ? where id = ?').run(JSON.stringify(patch.subtasks), id)
    if (patch.notes !== undefined) db.prepare('update tasks set notes = ? where id = ?').run(JSON.stringify(patch.notes), id)
    if (patch.due !== undefined) {
      // Pushed later is a reschedule, counted: after three the task asks to be
      // made smaller or dropped. A new time is also a new moment to be told about.
      const was = (db.prepare('select due_at from tasks where id = ?').get(id) as { due_at: string | null }).due_at
      // An undo says the count itself; it is not one more reschedule.
      const later = patch.reschedules === undefined && was && patch.due && patch.due > was ? 1 : 0
      // A series moved by hand begins again from its new day.
      db.prepare('update tasks set due_at = ?, notified_at = null, reschedules = reschedules + ?, repeat_day = null where id = ?').run(patch.due, later, id)
    }
    // A new due-by date is a new moment to be told about, as a new day is.
    if (patch.deadline !== undefined && patch.deadline !== deadlineWas) db.prepare('update tasks set notified_at = null where id = ?').run(id)
    if (patch.status !== undefined) db.prepare('update tasks set status = ?, completed_at = ? where id = ?').run(patch.status, patch.status === 'done' ? now() : null, id)
    if (patch.notifiedAt !== undefined) db.prepare('update tasks set notified_at = ? where id = ?').run(patch.notifiedAt, id)
    return write(before ?? true)
  })
  // Done. A routine moves to its next date instead: from the due date when the
  // calendar matters, from today when only the gap does ("every!"), and never
  // onto a day already gone, so a missed week does not stack up.
  // A session can close it, and the row says which: its recap is the
  // completion note. A routine closes many times, so it is a row, not a field.
  // It gives back what it was, so a routine ticked by mistake can be put back.
  const finish = (id: string, session: string | null = null): { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null } => {
    const task = db.prepare('select due_at, deadline_at, recurrence, repeat_until, repeat_day, notified_at from tasks where id = ?').get(id) as { due_at: string | null; deadline_at: string | null; recurrence: string | null; repeat_until: string | null; repeat_day: number | null; notified_at: string | null }
    const doneAt = now()
    const was = { dueAt: task.due_at, doneAt, notifiedAt: task.notified_at, deadlineAt: task.deadline_at }
    db.prepare('insert into task_done (task_id, done_at, session_id) values (?, ?, ?)').run(id, doneAt, session)
    const close = (): typeof was => write((db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(doneAt, id), was))
    if (!task.recurrence) return close()
    const fromToday = task.recurrence.includes('!') || !task.due_at
    // Counted from today, but at the time of day it had: "every! 3 days" at
    // 9 stays at 9, rather than taking the minute it was ticked.
    const at = dayjs(task.due_at ?? undefined)
    const base = fromToday && task.due_at ? dayjs().hour(at.hour()).minute(at.minute()).startOf('minute').toDate() : new Date()
    // The day it began on, so the 31st is the 31st again after a short month.
    const day = task.repeat_day ?? (task.due_at ? dayjs(task.due_at).date() : undefined)
    if (day && task.repeat_day === null) db.prepare('update tasks set repeat_day = ? where id = ?').run(day, id)
    let next = advance(fromToday ? base : new Date(task.due_at!), task.recurrence, day)
    // A rule that cannot move the date on is no series: done, rather than a loop that never ends.
    if (next.getTime() <= (fromToday ? base : new Date(task.due_at!)).getTime()) return close()
    while (next.getTime() < Date.now()) next = advance(next, task.recurrence, day)
    // Past its end, the series is over: this one was the last.
    if (task.repeat_until && next.toISOString() > task.repeat_until) return close()
    // A deadline moves with the date it belongs to, the same distance on.
    const deadline = task.deadline_at && task.due_at ? new Date(new Date(task.deadline_at).getTime() + next.getTime() - new Date(task.due_at).getTime()).toISOString() : task.deadline_at
    db.prepare('update tasks set due_at = ?, deadline_at = ?, notified_at = null where id = ?').run(next.toISOString(), deadline, id)
    return write(was)
  }
  handle('task:done', (id: string) => finish(id))
  // Done by mistake: open again, on the date it had, and that time it was
  // done no longer counted. The same for a one-off and a routine.
  handle('task:undone', (id: string, was: { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null }) => {
    db.prepare('delete from task_done where task_id = ? and done_at = ?').run(id, was.doneAt)
    db.prepare("update tasks set status = 'open', completed_at = null, due_at = ?, notified_at = ? where id = ?").run(was.dueAt, was.notifiedAt, id)
    if (was.deadlineAt !== undefined) db.prepare('update tasks set deadline_at = ? where id = ?').run(was.deadlineAt, id)
    return write(true)
  })
  // A task made by mistake, from wherever it was made: a new one goes with
  // its links; one it joined loses only the links this added. What was
  // resolved to make it is open again.
  handle('task:unmake', (id: string, existed: boolean, links: string[], reopen: string[]) => {
    if (existed) for (const item of links) db.prepare('delete from task_links where task_id = ? and item_id = ?').run(id, item)
    else for (const table of ['tasks where id', 'task_links where task_id', 'task_done where task_id']) db.prepare(`delete from ${table} = ?`).run(id)
    // Only what is still resolved: one taken elsewhere since keeps that.
    for (const capture of reopen) db.prepare("update captures set status = 'open' where id = ? and status = 'resolved'").run(capture)
    return write(true)
  })
  // How many reviews fall on each of the days ahead, today with what is
  // late, so a week of tasks can be planned around the reviewing.
  handle('review:load', (days: number) => {
    const load = Array<number>(days).fill(0)
    const rows = db.prepare(`select due_at from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and superseded_by is null and (due_at is null or due_at < ?)`)
      .all(new Date(startOfDay(days)).toISOString()) as { due_at: string | null }[]
    // Counted in calendar days, so a clock change never moves one.
    for (const { due_at } of rows) load[Math.max(0, daysFromToday(due_at ?? 0))] += 1
    // Today is what a session would really ask, with the daily limits, not
    // every card never seen.
    if (days > 0) load[0] = reviewQueue().length
    return load
  })

  // --- tags, worked out from the words every time so they cannot go stale
  let tagsOf = new Map<string, { title: string; body: string; tags: string[] }>()
  const tagged = (): { tag: string; id: string; type: string; title: string; private: boolean }[] => {
    const rows = [
      ...(db.prepare(`select id, 'capture' as type, ${LABEL} as title, body, private from captures where status != 'discarded' and archived_at is null`).all() as Record<string, string>[]),
      ...(db.prepare('select id, tier as type, title, body, private from nuggets where archived_at is null and superseded_by is null').all() as Record<string, string>[]),
      ...(db.prepare("select id, 'task' as type, title, notes as body, 0 as private from tasks").all() as Record<string, string>[])
    ]
    // An alias counts as the tag it stands for, without the words changing.
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    // Each note's tags kept with the words they came from, per note: an
    // autosave reads one body again, not every body there is.
    const was = tagsOf
    tagsOf = new Map()
    return rows.flatMap((row) => {
      const key = `${row.type}:${row.id}`
      let kept = was.get(key)
      if (kept?.title !== row.title || kept.body !== row.body)
        kept = { title: row.title, body: row.body, tags: tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`) }
      tagsOf.set(key, kept)
      return [...new Set(kept.tags.map((tag) => alias.get(tag) ?? tag))].map((tag) => ({ tag, id: row.id, type: row.type, title: row.title, private: !!Number(row.private) }))
    })
  }
  handle('tags', () => {
    const counts = new Map<string, number>()
    for (const { tag } of tagged()) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    const meta = new Map((db.prepare('select tag, color, action, exam_at from tag_meta').all() as { tag: string; color: string | null; action: number; exam_at: string | null }[]).map((row) => [row.tag, row]))
    return [...counts].map(([tag, count]) => ({ tag, count, color: meta.get(tag)?.color ?? null, action: !!meta.get(tag)?.action, examAt: meta.get(tag)?.exam_at ?? null })).sort((a, b) => b.count - a.count)
  })
  handle('tag:meta', () => db.prepare('select tag, color, action from tag_meta').all())
  handle('tag:set', (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null }) => {
    db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
    if (patch.examAt !== undefined) db.prepare('update tag_meta set exam_at = ? where tag = ?').run(patch.examAt, tag)
    if (patch.color !== undefined) db.prepare('update tag_meta set color = ? where tag = ?').run(patch.color, tag)
    if (patch.action !== undefined) db.prepare('update tag_meta set action = ? where tag = ?').run(patch.action ? 1 : 0, tag)
    if (patch.aliasOf !== undefined) {
      db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
      db.prepare('update tag_meta set alias_of = ? where tag = ?').run(patch.aliasOf?.replace(/^#/, '').toLowerCase() || null, tag)
    }
    return write(true)
  })
  handle('tag', (tag: string) => tagged().filter((row) => row.tag === tag))
  // A tag as something to read: the whole of everything carrying it, newest
  // first, each with its other tags. Captures and kept things; a task's notes
  // are not reading.
  handle('tag:read', (tag: string) => {
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    const rows = [
      ...db.prepare(`select id, 'capture' as type, kind, status, '' as title, ${LABEL} as label, body, private, captured_at as at from captures where status != 'discarded' and archived_at is null`).all(),
      ...db.prepare("select id, tier as type, kind, 'open' as status, title, label('', body) as label, body, private, created_at as at from nuggets where archived_at is null and superseded_by is null").all()
    ] as Record<string, string>[]
    return rows.flatMap((row) => {
      const parsed = JSON.parse(row.body ?? 'null')
      const tags = [...new Set(tagsIn(`${row.title} ${plain(parsed)}`).map((one) => alias.get(one) ?? one))]
      return tags.includes(tag) ? [{ ...row, at: row.at, body: parsed, private: !!Number(row.private), tags: tags.filter((one) => one !== tag) }] : []
    }).sort((a, b) => String(b.at).localeCompare(String(a.at)))
  })
  // Rename everywhere at once; renaming onto a tag that exists is a merge. The
  // words themselves change, since the words are where tags live.
  handle('tag:rename', (from: string, to: string) => {
    const clean = to.trim().replace(/^#/, '').toLowerCase()
    if (!/^[a-z][\w-]*$/.test(clean)) return null
    const pattern = new RegExp(`(^|\\s|")#${from.replace(/[-]/g, '\\-')}(?![\\w-])`, 'gi')
    for (const [table, text] of [['captures', 'body'], ['nuggets', 'body'], ['tasks', 'notes'], ['captures', 'title'], ['nuggets', 'title'], ['tasks', 'title']]) {
      for (const row of db.prepare(`select id, ${text} as v from ${table} where ${text} like ?`).all(`%#${from}%`) as { id: string; v: string }[])
        db.prepare(`update ${table} set ${text} = ? where id = ?`).run(row.v.replace(pattern, `$1#${clean}`), row.id)
    }
    return write(clean)
  })

  // --- pins: parked on the home screen, three at most
  handle('pins', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return []
    const privacy = hidePrivate ? 'and private = 0' : ''
    return db
      .prepare(
        `select id, 'capture' as type, kind, ${LABEL} as title, pinned_at as pinnedAt, private from captures where pinned_at is not null and archived_at is null ${hidePrivate ? "and private = 0 and status != 'open'" : ''}
         union all select id, tier as type, kind, title, pinned_at, private from nuggets where pinned_at is not null and archived_at is null ${privacy}
         order by pinnedAt desc limit 3`
      )
      .all()
  })
  // A reminder is a pin with a date: when it comes round, it pins itself.
  handle('remind', (table: 'captures' | 'nuggets', id: string, at: string | null) =>
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set remind_at = ? where id = ?`).run(at, id))
  )
  // Within the three pins: a reminder that comes round while three are pinned
  // waits for a free place, rather than pushing one off or being lost.
  const pins = (): number =>
    (db.prepare('select (select count(*) from captures where pinned_at is not null) + (select count(*) from nuggets where pinned_at is not null) n').get() as { n: number }).n
  setInterval(() => {
    let fired = 0
    for (const table of ['captures', 'nuggets'])
      for (let due; pins() < 3 && (due = db.prepare(`select id from ${table} where remind_at <= ? and archived_at is null order by remind_at limit 1`).get(now()) as { id: string } | undefined); fired++)
        db.prepare(`update ${table} set pinned_at = ?, remind_at = null where id = ?`).run(now(), due.id)
    if (fired) changed()
  }, 60_000)
  // Three pins at most, across both tables: a fourth is refused rather than
  // quietly pushing the oldest off, so a pin always means what you think.
  handle('pin', (table: 'captures' | 'nuggets', id: string, on: boolean) => {
    const others = (db.prepare(`select (select count(*) from captures where pinned_at is not null and id != ?)
      + (select count(*) from nuggets where pinned_at is not null and id != ?) n`).get(id, id) as { n: number }).n
    if (on && others >= 3) return false
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set pinned_at = ? where id = ?`).run(on ? now() : null, id))
    return true
  })

  // --- the same idea again: a vote, not a duplicate
  // Trigrams, not a model: enough to notice "you have written this before"
  // while the new one still lands, because different wording is data too.
  const grams = (text: string): Set<string> => {
    const clean = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, '')} `
    return new Set(Array.from({ length: Math.max(0, clean.length - 2) }, (_, index) => clean.slice(index, index + 3)))
  }
  handle('similar', (text: string) => {
    if (text.trim().length < 12) return null
    const mine = grams(text)
    let best: { id: string; number: number; title: string; score: number } | null = null
    for (const row of db.prepare(`select id, number, ${LABEL} as title from captures where status != 'discarded'`).all() as { id: string; number: number; title: string }[]) {
      const theirs = grams(row.title)
      const shared = [...mine].filter((gram) => theirs.has(gram)).length
      const score = shared / (mine.size + theirs.size - shared || 1)
      if (score > (best?.score ?? 0.55)) best = { ...row, score }
    }
    return best
  })

  // --- sessions: effort against a task, with a recap of what actually happened
  db.exec('create table if not exists sessions (id text primary key, task_id text not null, started_at text not null, ended_at text, recap text)')
  handle('sessions', (taskId: string) =>
    db.prepare('select id, started_at as startedAt, ended_at as endedAt, recap, goal, paused_ms as pausedMs, paused_at as pausedAt from sessions where task_id = ? order by started_at desc').all(taskId)
  )
  // A focus session: a goal, an optional length, and pauses that do not count.
  column('sessions', 'goal text')
  column('sessions', 'planned_ms integer')
  column('sessions', 'paused_ms integer not null default 0')
  column('sessions', 'paused_at text')
  // A timer still running when Vigil quit would ring "Time's up" days later.
  // One already past its length ends quietly at start: a timer goes, as it
  // always does, and a focus session is kept, ended when its plan ran out.
  // Said once, the first time a window asks.
  let missed: string | null = null
  for (const row of db.prepare(`select id, task_id, started_at, paused_ms, planned_ms from sessions where ended_at is null and paused_at is null and planned_ms > 0
      and (julianday('now') - julianday(started_at)) * 86400000 - paused_ms > planned_ms`).all() as { id: string; task_id: string; started_at: string; paused_ms: number; planned_ms: number }[]) {
    if (row.task_id === '') db.prepare('delete from sessions where id = ?').run(row.id)
    else db.prepare('update sessions set ended_at = ? where id = ?').run(new Date(new Date(row.started_at).getTime() + row.paused_ms + row.planned_ms).toISOString(), row.id)
    missed = `Your ${Math.max(1, Math.round(row.planned_ms / 60000))}-minute ${row.task_id === '' ? 'timer' : 'focus session'} ended while Vigil was closed`
  }
  handle('focus:missed', () => {
    const said = missed
    missed = null
    return said
  })
  // One at a time: starting another ends the one running, recap and all kept.
  handle('session:start', (taskId: string, goal?: string, plannedMs?: number | null) => {
    // A timer from the box keeps running underneath: only a focus session ends.
    db.prepare("update sessions set ended_at = ? where ended_at is null and task_id != ''").run(now())
    const id = randomUUID()
    db.prepare('insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, ?, ?, ?, ?)').run(id, taskId, now(), goal?.trim() || null, plannedMs ?? null)
    return write(id)
  })
  /** The session running now, with its task's name, for the floating timer. */
  handle('focus:now', () =>
    db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, 'Timer') as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
      s.paused_ms as pausedMs, s.paused_at as pausedAt from sessions s left join tasks t on t.id = s.task_id
      where s.ended_at is null and (t.id is not null or s.task_id = '') order by s.started_at desc limit 1`).get() ?? null)
  // A timer from the box ("5m tea"): a session with no task behind it, so the
  // floating timer shows it as it shows any other. Ending it deletes it: a
  // kettle is not effort worth a record.
  // One timer at a time; a focus session running carries on underneath it.
  handle('timer:start', (goal: string, ms: number) => {
    db.prepare("delete from sessions where task_id = '' and ended_at is null").run()
    const id = randomUUID()
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, '', ?, ?, ?)").run(id, now(), goal.trim() || null, ms)
    return write(id)
  })
  handle('session:pause', (id: string) => write(db.prepare('update sessions set paused_at = ? where id = ? and paused_at is null').run(now(), id)))
  handle('session:resume', (id: string) => {
    const at = db.prepare('select paused_at from sessions where id = ?').get(id) as { paused_at: string | null } | undefined
    if (!at?.paused_at) return
    db.prepare('update sessions set paused_ms = paused_ms + ?, paused_at = null where id = ?').run(Date.now() - new Date(at.paused_at).getTime(), id)
    return write(true)
  })
  // Called off: no record that it happened.
  handle('session:cancel', (id: string) => write(db.prepare('delete from sessions where id = ?').run(id)))
  // Ending asks for the recap, and the recap can become a nugget: the loop that
  // turns doing the work into something worth keeping.
  handle('session:end', (id: string, recap: string, keep: boolean, close = false) => {
    // Ended while paused: the pause up to now does not count either.
    const at = now()
    db.prepare('update sessions set ended_at = ?, recap = ?, paused_ms = paused_ms + coalesce(round((julianday(?) - julianday(paused_at)) * 86400000), 0), paused_at = null where id = ?').run(at, recap, at, id)
    if (close) finish((db.prepare('select task_id from sessions where id = ?').get(id) as { task_id: string }).task_id, id)
    if (keep && recap.trim())
      db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(
        randomUUID(), recap.split('\n')[0].slice(0, 120), JSON.stringify(recap), now(), now())
    return write(true)
  })
  // "How did it go?", answered after the session has already ended (from the
  // pill, or the task's log): the recap set on its own. Gives back the one it
  // had, so the toast can put it back.
  handle('session:recap', (id: string, recap: string) => {
    const was = (db.prepare('select recap from sessions where id = ?').get(id) as { recap: string | null } | undefined)?.recap ?? ''
    db.prepare('update sessions set recap = ? where id = ?').run(recap, id)
    return write(was)
  })

  // --- a time of day means something happens at that time
  // Pull: it is already first in Today. Quiet: the menu bar counts it. Alerts:
  // a notification, once per due time. All-day tasks never alert.
  setInterval(() => {
    // Not over a shared screen, nor in quiet hours: held, and shown once they
    // end if the time is still within the hour.
    const { blackout, hidePrivate } = gate()
    if (!Notification.isSupported() || blackout || hidePrivate) return
    // A task's own level wins over the setting: most never set one.
    const due = db.prepare(
      `select id, title from tasks where status = 'open' and ${ALERT_AT} <= ? and ${ALERT_AT} > ? and notified_at is null and coalesce(notify, ?) = 'alerts'`
    ).all(now(), new Date(Date.now() - 3600000).toISOString(), settings().notify) as { id: string; title: string }[]
    for (const task of due) {
      new Notification({ title: task.title, body: 'Due now', silent: false }).show()
      db.prepare('update tasks set notified_at = ? where id = ?').run(now(), task.id)
    }
  }, 30_000)

  // --- the numbers: observations with a comparison, never a score to keep up
  handle('stats', () => {
    const one = <T>(sql: string, ...args: (string | number)[]): T => db.prepare(sql).get(...args) as T
    const all = <T>(sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args) as T[]
    return {
      exits: all<{ status: string; n: number }>('select status, count(*) n from captures group by status'),
      kinds: all<{ kind: string; n: number }>('select kind, count(*) n from captures group by kind order by n desc'),
      week: one<{ n: number }>('select count(*) n from captures where captured_at >= ?', ago(7)).n,
      lastWeek: one<{ n: number }>('select count(*) n from captures where captured_at >= ? and captured_at < ?', ago(14), ago(7)).n,
      nuggets: one<{ n: number }>("select count(*) n from nuggets where tier = 'nugget'").n,
      articles: one<{ n: number }>("select count(*) n from nuggets where tier = 'article'").n,
      recall: one<{ n: number }>("select count(*) n from nuggets where coalesce(prompt, '') != ''").n,
      days: all<{ day: string }>("select distinct date(opened_at, 'localtime') day from app_opens where opened_at >= ?", ago(84)).map((row) => row.day),
      hints: one<{ shown: number; up: number; down: number }>(
        "select count(*) shown, sum(reaction = 'up') up, sum(reaction = 'down') down from hint_events where shown_at >= ?", ago(30)),
      reviews: one<{ n: number; recalled: number }>('select count(*) n, sum(grade > 1) recalled from review_log where reviewed_at >= ?', ago(30)),
      hours: all<{ hour: number; n: number }>("select cast(strftime('%H', captured_at, 'localtime') as integer) hour, count(*) n from captures group by hour"),
      firstUse: one<{ days: number | null }>(
        `select avg(julianday(first_used_at) - julianday(captured_at)) days from captures where first_used_at >= ?`, ago(90)).days,
      tasksDone: one<{ n: number }>('select count(*) n from task_done where done_at >= ?', ago(7)).n,
      // Wrapped: what the week was, in the work itself.
      sessions: one<{ n: number; minutes: number | null }>(
        "select count(*) n, sum((julianday(ended_at) - julianday(started_at)) * 1440 - paused_ms / 60000.0) minutes from sessions where ended_at is not null and started_at >= ?", ago(7)),
      // Private notes' tags are not counted: a tag can say as much as a title.
      tagsWeek: (db.prepare('select title, body from captures where captured_at >= ? and private = 0').all(ago(7)) as { title: string; body: string }[])
        .flatMap((row) => tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`))
        .reduce<Record<string, number>>((counts, tag) => ({ ...counts, [tag]: (counts[tag] ?? 0) + 1 }), {}),
      retention: settings().retention,
      estimates: one<{ estimated: number | null; spent: number | null }>(
        `select sum(t.estimate) estimated, sum((select sum((julianday(s.ended_at) - julianday(s.started_at)) * 1440 - s.paused_ms / 60000.0) from sessions s where s.task_id = t.id and s.ended_at is not null)) spent
         from tasks t where t.estimate is not null and t.status = 'done' and t.completed_at >= ?`, ago(30)),
      // Lead measures: the doing, this week, day by day. No target; the trend.
      lead: {
        exits: one<{ n: number }>("select count(*) n from captures where exited_at >= ?", ago(7)).n,
        glosses: one<{ n: number }>("select count(*) n from glosses where author = 'user' and created_at >= ?", ago(7)).n,
        reviewDays: one<{ n: number }>("select count(distinct date(reviewed_at, 'localtime')) n from review_log where reviewed_at >= ?", ago(7)).n,
        articles: one<{ n: number }>("select count(*) n from nuggets where tier = 'article' and created_at >= ?", ago(7)).n
      },
      // Wrapped, for the day and for the year: what happened, set down plainly.
      day: (() => {
        const since = dayjs().startOf('day').toISOString()
        return one<{ captured: number; exits: number; tasks: number; reviews: number }>(
          `select (select count(*) from captures where captured_at >= ?) captured, (select count(*) from captures where exited_at >= ?) exits,
            (select count(*) from task_done where done_at >= ?) tasks, (select count(*) from review_log where reviewed_at >= ?) reviews`, since, since, since, since)
      })(),
      year: (() => {
        const since = dayjs().startOf('year').toISOString()
        return {
          ...one<{ captured: number; nuggets: number; articles: number }>(
            `select (select count(*) from captures where captured_at >= ?) captured,
              (select count(*) from nuggets where tier = 'nugget' and created_at >= ?) nuggets,
              (select count(*) from nuggets where tier = 'article' and created_at >= ?) articles`, since, since, since),
          month: one<{ month: string | null }>(
            "select strftime('%m', captured_at, 'localtime') month from captures where captured_at >= ? group by month order by count(*) desc limit 1", since)?.month ?? null
        }
      })(),
      // Leeches, named: a card forgotten four times wants rewriting, not hiding.
      // Private cards never by name, and none at all in safe mode or quiet hours, as the recap.
      leeches: gate().hidePrivate ? [] : all<{ title: string }>(
        "select title from nuggets where private = 0 and (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) >= 4").map((row) => row.title),
      // A hint "stopped you" if you voted it up, or it stayed on screen four
      // seconds or more: the rare signal and the universal one together.
      stopped: one<{ n: number }>("select count(*) n from hint_events where shown_at >= ? and (reaction = 'up' or dwell_ms >= 4000)", ago(30)).n,
      unprocessed: one<{ now: number; weekAgo: number }>(
        "select coalesce(sum(status = 'open'), 0) now, coalesce(sum(captured_at < ? and (status = 'open' or exited_at >= ?)), 0) weekAgo from captures", ago(7), ago(7))
    }
  })

  // --- export: everything as plain text and JSON, in a folder you choose
  handle('export', async () => {
    const { filePaths } = await dialog.showOpenDialog({ title: 'Export everything to…', properties: ['openDirectory', 'createDirectory'] })
    if (!filePaths[0]) return null
    const folder = join(filePaths[0], SANDBOX ? `Vigil sandbox export ${dayKey()}` : `vigil-${dayKey()}`)
    await mkdir(join(folder, 'markdown'), { recursive: true })
    // Every table, so nothing stays behind in the app: sessions, settings and all.
    const tables = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as { name: string }[]).map((row) => row.name)
    const data = Object.fromEntries(tables.map((table) => [table, db.prepare(`select * from ${table}`).all()]))
    await writeFile(join(folder, 'vigil.json'), JSON.stringify(data, null, 2))
    // Real Markdown with what is known about each one up top, named so a
    // folder listing reads like the notes do.
    const front = (fields: Record<string, unknown>): string =>
      `---\n${Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n`
    // Every property a note has, an imported note's frontmatter among them.
    const properties = (fields: string | null): Record<string, unknown> => {
      try {
        return fields ? (JSON.parse(fields) as Record<string, unknown>) : {}
      } catch {
        return {}
      }
    }
    const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    // Pictures point at the assets copied beside the notes, not the app's own store.
    const local = (text: string): string => text.replace(/mindflow:\/\/assets\//g, '../assets/')
    const taken = new Set<string>()
    // Two notes with the same name each keep their own file.
    const unique = (name: string): string => {
      let one = name
      for (let n = 2; taken.has(one); n++) one = `${name} ${n}`
      taken.add(one)
      return one
    }
    // Every file named first, so a link can point at the file it leads to.
    const captureRows = data.captures as Record<string, string & number>[]
    const nuggetRows = data.nuggets as Record<string, string>[]
    const names = new Map<string, string>()
    // Each capture by the name the app shows it by: its own title (a vault note's), else its first line.
    const labels = new Map((db.prepare(`select id, ${LABEL} as label from captures`).all() as { id: string; label: string }[]).map((row) => [row.id, row.label]))
    for (const row of captureRows) {
      const name = slug(labels.get(row.id) ?? '')
      names.set(row.id, unique(`MF-${row.number}${name ? ` ${name}` : ''}`))
    }
    for (const row of nuggetRows) names.set(row.id, unique(`${row.tier}-${slug(row.title) || row.id.slice(0, 8)}`))
    const nameOf = (id: string): string | undefined => names.get(id)
    for (const row of captureRows) {
      const body = JSON.parse(row.body ?? 'null')
      await writeFile(join(folder, 'markdown', `${names.get(row.id)}.md`),
        front({ id: `MF-${row.number}`, private: row.private ? true : null, kind: row.kind, status: row.status, captured: row.captured_at, who: row.attribution, where: row.medium, ...properties(row.fields), tags: tagsIn(plain(body)) }) + local(markdown(body, nameOf)))
    }
    for (const row of nuggetRows) {
      const body = JSON.parse(row.body ?? 'null')
      const text = local(markdown(body, nameOf))
      // A heading of its own already names it; otherwise the title does.
      const heading = /^#\s/.test(text) ? '' : `# ${row.title}\n\n`
      await writeFile(join(folder, 'markdown', `${names.get(row.id)}.md`),
        front({ kind: row.tier, private: row.private ? true : null, created: row.created_at, updated: row.updated_at, who: row.attribution, question: row.prompt, ...properties(row.fields), tags: tagsIn(plain(body)) }) + heading + text)
    }
    // The pictures and files the notes point at.
    await cp(join(app.getPath('userData'), 'assets'), join(folder, 'assets'), { recursive: true }).catch(() => undefined)
    return folder
  })

  // --- related: the notes that share tags with this one
  // Each note's tags in a table of this connection's own, kept true by
  // triggers as notes are written, so asking is one indexed query rather than
  // reading every note. Temporary: nothing on disk, built on first use.
  db.function('note_tags', (title, body) => {
    let words = ''
    try {
      words = plain(JSON.parse(String(body ?? 'null')))
    } catch {
      words = String(body ?? '')
    }
    return JSON.stringify(tagsIn(`${title ?? ''} ${words}`))
  })
  let indexed = false
  const index = (): void => {
    if (indexed) return
    indexed = true
    const fill = (type: string, row: string): string => `insert into temp.note_tag select ${row}.id, ${type}, value from json_each(note_tags(${row}.title, ${row}.body))`
    db.exec(`create temp table note_tag (id text not null, type text not null, tag text not null);
      insert into temp.note_tag select c.id, 'capture', j.value from captures c, json_each(note_tags(c.title, c.body)) j;
      insert into temp.note_tag select n.id, n.tier, j.value from nuggets n, json_each(note_tags(n.title, n.body)) j;
      create index temp.note_tag_by_tag on note_tag(tag);
      create index temp.note_tag_by_id on note_tag(id);
      create temp trigger note_tag_capture_in after insert on main.captures begin ${fill("'capture'", 'new')}; end;
      create temp trigger note_tag_capture_edit after update of title, body on main.captures begin delete from temp.note_tag where id = old.id; ${fill("'capture'", 'new')}; end;
      create temp trigger note_tag_capture_out after delete on main.captures begin delete from temp.note_tag where id = old.id; end;
      create temp trigger note_tag_nugget_in after insert on main.nuggets begin ${fill('new.tier', 'new')}; end;
      create temp trigger note_tag_nugget_edit after update of title, body, tier on main.nuggets begin delete from temp.note_tag where id = old.id; ${fill('new.tier', 'new')}; end;
      create temp trigger note_tag_nugget_out after delete on main.nuggets begin delete from temp.note_tag where id = old.id; end;`)
  }
  // Ranked by the tags they share, a rare tag worth more than a common one
  // (one on 3 notes says more than one on 300), then the newest. An alias
  // counts as its tag. Notes linked either way are left out after: the panel
  // lists them above already.
  const RELATED = `
    with mine as (select distinct coalesce(m.alias_of, t.tag) as tag from note_tag t left join tag_meta m on m.tag = t.tag where t.id = :id),
    spelled as (select tag as raw, tag from mine union select m.tag, m.alias_of from tag_meta m join mine on mine.tag = m.alias_of),
    alive as (
      select distinct t.id, t.type, s.tag from note_tag t join spelled s on s.raw = t.tag
      where case when t.type = 'capture'
        then exists (select 1 from captures c where c.id = t.id and c.status != 'discarded' and c.archived_at is null)
        else exists (select 1 from nuggets n where n.id = t.id and n.archived_at is null and n.superseded_by is null) end
    ),
    spread as (select tag, count(*) as n from alive group by tag)
    select a.type, a.id, sum(1.0 / ln(1 + s.n)) as score, json_group_array(json_array(s.tag, s.n)) as shared
      from alive a join spread s using (tag) where a.id != :id group by a.id order by score desc limit 60`
  let related: ReturnType<typeof db.prepare> | undefined
  let detail: ReturnType<typeof db.prepare> | undefined
  handle('related', (id: string) => {
    index()
    // Prepared on first use: some columns it reads are added after this runs.
    related ??= db.prepare(RELATED)
    detail ??= db.prepare(`select id, ${LABEL} as title, body, private, coalesce(edited_at, captured_at) as at from captures where id in (select value from json_each(?))
      union all select id, title, body, private, coalesce(updated_at, created_at) from nuggets where id in (select value from json_each(?))`)
    const ranked = related.all({ id }) as { type: string; id: string; score: number; shared: string }[]
    const ids = JSON.stringify([id, ...ranked.map((row) => row.id)])
    const rows = new Map((detail.all(ids, ids) as { id: string; title: string; body: string | null; private: number; at: string }[]).map((row) => [row.id, row]))
    const mine = rows.get(id)?.body ?? ''
    const { hidePrivate } = gate()
    return ranked
      .map((one) => ({ ...one, ...rows.get(one.id)! }))
      // Linked either way, an id in the other's words; private, when hidden.
      .filter((row) => row.title !== undefined && !(row.body ?? '').includes(id) && !mine.includes(row.id) && !(hidePrivate && row.private))
      // Equal scores, the newest first.
      .sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)))
      .slice(0, 12)
      .map((row) => {
        const text = cardWords(row.body ?? '')
        // A few words after the name, tags out: the card names them below.
        const excerpt = text.replace(/(?:^|\s)#[a-z][\w-]*/gi, ' ').split('\n').map((line) => line.trim()).filter((line) => line && line !== row.title.trim()).join(' ').slice(0, 220)
        // Rarest first, the ones that say the most.
        const shared = (JSON.parse(row.shared) as [string, number][]).sort((a, b) => a[1] - b[1]).map(([tag]) => tag)
        return { type: row.type, id: row.id, title: row.title, excerpt, private: !!row.private, at: row.at, shared }
      })
  })
}

/** When a task's time comes: its timed date, or else a timed "by", as "by 5pm". All-day ones never come. */
const ALERT_AT = 'case when due_at is not null and all_day = 0 then due_at when deadline_timed = 1 then deadline_at end'

/** Today's review queue, set once the handlers are registered; the badge counts it too. */
let reviewQueue: () => unknown[] = () => []

/** What the menu bar says: reviews due, and whether safe mode is on. */
export function badge(): { due: number; tasks: number; safe: boolean } {
  const n = reviewQueue().length
  // Quiet push: a task whose time has come is counted in the menu bar, unless
  // it is set to pull, where it only rises in Today.
  // A task's own level wins: a pull one is never counted, a quiet or alert one always is.
  const tasks = (database()
    .prepare(`select count(*) n from tasks where status = 'open' and ${ALERT_AT} <= ? and coalesce(notify, ?) != 'pull'`).get(now(), settings().notify) as { n: number }).n
  return { due: n, tasks, safe: settings().safeMode }
}

/** An open goal, as the menu bar, nudges and milestones read it. */
export type OpenGoal = { id: string; title: string; goalAt: string; goalFrom: string; private: number; createdAt: string; lastLog: string | null; beacon: 'always' | 'sometimes' | 'off' | null }
/** The goals still open (not settled, not archived), nearest first. */
export function openGoals(): OpenGoal[] {
  return database().prepare(`select id, title, goal_at as goalAt, goal_from as goalFrom, private, created_at as createdAt, goal_beacon as beacon,
      (select max(created_at) from glosses where item_id = nuggets.id) as lastLog
    from nuggets where tier = 'goal' and closed_at is null and archived_at is null and goal_at is not null order by goal_at, created_at`).all() as OpenGoal[]
}

/** Flip safe mode from outside a window: the menu bar. */
export function toggleSafeMode(): boolean {
  const on = !settings().safeMode
  database().prepare("insert or replace into settings (key, value) values ('safeMode', ?)").run(JSON.stringify(on))
  safeModeTold(on)
  changed()
  return on
}

/** The session running now, if any, for the menu bar. */
export function activeSession(): { title: string; startedAt: string } | null {
  return (database()
    .prepare('select t.title, s.started_at as startedAt from sessions s join tasks t on t.id = s.task_id where s.ended_at is null order by s.started_at desc limit 1')
    .get() as { title: string; startedAt: string } | undefined) ?? null
}

// --- Home: what comes back to you, read in one go -------------------------

/** One thing on a Home shelf: a capture, nugget, article or question. */
type Shelved = { type: string; id: string; title: string; kind: string; private: number; at: string; who?: string | null }
/** A decision or experiment whose day has come: `at` is that day, the rest what it says when it comes back. */
type Returning = Shelved & { call: string; reopen: string; question: string; outcome: string }

/**
 * Home's shelves in one read, and nothing written while reading: unlike a
 * hint or a memory card, looking at Home never counts as being shown
 * something. Opens are kept by `home:opened`, one row per note.
 */
export function registerHome(): void {
  const db = database()
  db.exec('create table if not exists note_opens (id text primary key, type text not null, at text not null)')
  ipcMain.handle('vigil:home:opened', (_event, type: string, id: string) =>
    void db.prepare('insert into note_opens (id, type, at) values (?, ?, ?) on conflict(id) do update set at = excluded.at, type = excluded.type').run(id, type, now()))

  // Every note in view, as a shelf shows it: newest change first.
  const NOTES = `select id, 'capture' as type, ${LABEL} as title, kind, private, coalesce(edited_at, captured_at) as at, captured_at as made, body, attribution as who from captures where status != 'discarded' and archived_at is null
    union all select id, tier, coalesce(nullif(title, ''), label('', body)), kind, private, coalesce(updated_at, created_at), created_at, body, attribution from nuggets where archived_at is null and superseded_by is null`
  // Who said it, only for a quote: its card signs it.
  const strip = ({ type, id, title, kind, private: hidden, at, who }: Shelved): Shelved => ({ type, id, title, kind, private: hidden, at, ...(kind === 'quote' && who ? { who } : {}) })

  // A decision on its look-again day, or an experiment past its run-until and
  // not finished: each comes back with what it needs to be settled in place.
  // Oldest due first; a date said in words before dates were dates never counts.
  const returning = (): Returning[] => {
    const end = dayjs().endOf('day').toISOString()
    const rows = db.prepare(`select id, 'capture' as type, ${LABEL} as title, kind, private, fields from captures where status != 'discarded' and archived_at is null and kind in ('decision', 'experiment') and fields is not null
      union all select id, tier, coalesce(nullif(title, ''), label('', body)), kind, private, fields from nuggets where archived_at is null and superseded_by is null and kind in ('decision', 'experiment') and fields is not null`).all() as (Shelved & { fields: string })[]
    return rows.flatMap(({ fields, ...row }) => {
      let f: Record<string, string> = {}
      try { f = JSON.parse(fields) } catch { return [] }
      const at = row.kind === 'decision' ? (f.state === 'Decided' || !f.state ? f.revisit : null) : f.status !== 'Finished' ? f.until : null
      if (!at || !/^\d{4}-\d\d-\d\dT/.test(at) || at > end) return []
      return [{ ...row, at, call: f.call ?? '', reopen: f.reopen ?? '', question: f.question ?? '', outcome: f.outcome ?? '' }]
    }).sort((a, b) => a.at.localeCompare(b.at))
  }
  ipcMain.handle('vigil:returning', () => returning().filter((one) => !(gate().hidePrivate && one.private)))
  // In the box, as a hint would come: each at most once a day, never private, never in quiet hours.
  ipcMain.handle('vigil:returning:hint', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) return null
    const shown = new Set((db.prepare('select nugget_id as id from hint_events where shown_at >= ?').all(new Date(startOfDay()).toISOString()) as { id: string }[]).map((row) => row.id))
    const one = returning().find((row) => !row.private && !shown.has(row.id))
    if (!one) return null
    db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(one.id, now())
    return one
  })

  ipcMain.handle('vigil:home', () => {
    const { blackout, hidePrivate } = gate()
    const all = db.prepare(NOTES).all() as (Shelved & { made: string; body: string | null })[]
    const byId = new Map(all.map((row) => [row.id, row]))
    // Asked for, so private ones show (blurred); offered, so they wait out quiet hours.
    const offered = (row: Shelved): boolean => !(hidePrivate && row.private)
    const opened = (db.prepare('select id, at from note_opens order by at desc limit 24').all() as { id: string; at: string }[])
      .flatMap((open) => { const row = byId.get(open.id); return row && row.type !== 'question' && row.type !== 'goal' ? [{ ...strip(row), at: open.at }] : [] })
    const edited = [...all].filter((row) => row.type !== 'question' && row.type !== 'goal').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 16).map(strip)

    // A note caught on this day in an earlier year: the first of them, so it holds all day.
    const today = dayKey()
    const memory = blackout ? null : all
      .filter((row) => row.type === 'capture' && offered(row) && !row.private && dayKey(row.made).slice(5) === today.slice(5) && dayKey(row.made).slice(0, 4) < today.slice(0, 4))
      .sort((a, b) => a.made.localeCompare(b.made))[0]
    const years = memory ? dayjs().year() - dayjs(memory.made).year() : 0

    // Due for review now, and kept things longest unseen: the hints' pool, read without picking.
    const due = (db.prepare("select id from nuggets where tier = 'nugget' and suspended = 0 and archived_at is null and superseded_by is null and due_at is not null and due_at <= ? order by due_at limit 12").all(now()) as { id: string }[])
      .flatMap(({ id }) => { const row = byId.get(id); return row && offered(row) ? [strip(row)] : [] })
    // Unseen means old too: made over three weeks ago and not opened for as long, so nothing new reads "not seen in a while".
    const unseen = blackout ? [] : (db.prepare("select id from nuggets where tier not in ('question', 'goal') and suspended = 0 and archived_at is null and superseded_by is null and private = 0 and created_at < ? and coalesce(last_visited_at, '') < ? and id not in (select id from note_opens where at >= ?) order by coalesce(last_visited_at, '') limit 8").all(ago(21), ago(21), ago(21)) as { id: string }[])
      .flatMap(({ id }) => { const row = byId.get(id); return row && !due.some((one) => one.id === id) ? [strip(row)] : [] })
    const article = all.filter((row) => row.type === 'article' && offered(row)).sort((a, b) => b.made.localeCompare(a.made))[0]

    // Questions still held, each with its newest clue.
    const questions = (db.prepare(`select n.id, (select body from glosses where item_id = n.id order by created_at desc limit 1) as clue,
        (select created_at from glosses where item_id = n.id order by created_at desc limit 1) as clueAt
      from nuggets n where tier = 'question' and closed_at is null and archived_at is null order by coalesce(clueAt, n.created_at) desc limit 12`).all() as { id: string; clue: string | null; clueAt: string | null }[])
      .flatMap((one) => { const row = byId.get(one.id); return row ? [{ ...strip(row), clue: one.clue, at: one.clueAt ?? row.at }] : [] })

    // The two tags used most in the last two months, each with what carries it.
    const lately = all.filter((row) => row.made >= ago(60) || row.at >= ago(60))
    const tagged = new Map<string, Shelved[]>()
    for (const row of lately) {
      let text = row.body ?? ''
      try { text = plain(JSON.parse(text)) } catch { /* Markdown, as it is */ }
      for (const tag of tagsIn(`${row.title} ${text}`)) tagged.set(tag, [...(tagged.get(tag) ?? []), strip(row)])
    }
    const colours = new Map((db.prepare('select tag, color from tag_meta').all() as { tag: string; color: string | null }[]).map((row) => [row.tag, row.color]))
    const tags = [...tagged].filter(([, rows]) => rows.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 2)
      .map(([tag, rows]) => ({ tag, color: colours.get(tag) ?? null, cards: rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12) }))

    const monday = dayjs().startOf('week').toISOString()
    const week = all.filter((row) => row.made >= monday && row.type !== 'question' && row.type !== 'goal').sort((a, b) => b.made.localeCompare(a.made)).slice(0, 16).map(strip)

    // A few words after the first line, for the cards that have no picture: only for what is shown.
    const excerpts = new Map<string, string>()
    const excerpt = <T extends Shelved>(card: T): T & { excerpt: string } => {
      if (!excerpts.has(card.id)) {
        const raw = byId.get(card.id)?.body ?? ''
        const text = cardWords(raw)
        const lines = text.split('\n').map((line) => line.replace(/^[#>*\-\s]+/, '').trim()).filter(Boolean)
        // Never the title again: drop the lines the title already says (a
        // name can be made from the first line or two), then any of its words.
        const flat = (words: string): string => words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const name = flat(card.title)
        while (lines.length && name.includes(flat(lines[0]))) lines.shift()
        let rest = lines.join(' ')
        if (name && flat(rest).startsWith(name)) rest = rest.slice(card.title.length).trim()
        excerpts.set(card.id, rest.replace(/^[:;,.\s]+/, '').slice(0, 220))
      }
      return { ...card, excerpt: card.private ? '' : excerpts.get(card.id)! }
    }
    const each = <T extends Shelved>(list: T[]): (T & { excerpt: string })[] => list.map(excerpt)
    return {
      opened: each(opened), edited: each(edited), due: each(due), unseen: each(unseen), questions, week: each(week),
      returning: returning().filter(offered),
      tags: tags.map((one) => ({ ...one, cards: each(one.cards) })),
      memory: memory ? excerpt({ ...strip(memory), memory: years === 1 ? 'A year ago today' : `${years} years ago today` }) : null,
      article: article ? excerpt(strip(article)) : null
    }
  })
}
