import { parseDate } from 'chrono-node'
import { Notification, app, dialog, ipcMain, net, session, shell } from 'electron'
import { randomUUID } from 'crypto'
import { cp, mkdir, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createEmptyCard, default_w, forgetting_curve, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

import { rollOver } from './held'
import { KEPT_IN, LABEL, LIST, atomically, changed, database, like, movedOn, type Change } from './captures'
import { docList, tasksSaid } from './day-lines'
import { advance, leadingTag, readTask } from './task-words'
import { clock, dayKey, dayMonth, dayjs, daysFromToday, monthName, num, startOfDay } from './dates'
import { backUpWatched, backupDir, backupStatus, checkMarkdown, chooseFolder } from './backup'
import { SANDBOX } from './sandbox'
import { retireKinds, tagged as hasTag, withTag } from './kinds'
import { celebrateAfter, goalPassed, watches, type MomentKind } from './celebrate'
import type { MomentSource } from './moment-source'
import { keepPins, warmGiphy } from './giphy'
import { daysBetween, daysLeft, leftSaid } from './goal-days'
import { LEECH_AT, bucketOf, daysInARow, fitFirstDays, minutesFor, struggling, type Bucket } from './study'
import { syncLineCards } from './line-cards'
import { busy } from './busy'
import { LEARN_DECK, LEARN_EARLIER, LEARN_TAG } from './learn-deck'
import { ALERT_AT, againAlerts, dueAlerts } from './task-alerts'
import { eventFromBin, eventToBin, eventsInBin, forgetEvents } from './events'
import { forgetPractices, practiceFromBin, practiceToBin, practicesInBin } from './practices'
import type { Nudge } from './nudge'
import { isTagWord, nameWithoutTags, tagWritten, tagsIn, withoutTags } from './tag-words'
import { cut, fittedTitle, quoted } from './clip'
import { withAlways } from './site-hosts'
import { dueAt } from './session-log'
import { FIRST_SHOWN, writingFirst } from './sidebar-grows'
import { linkOf, watchName } from './renames'
import { APP_NAME } from './name'

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
  // A heading it lands on follows a #, a line #^ and its name, as Obsidian has them.
  const link = (id: string, label: string, at = ''): string => {
    const name = nameOf(id.replace(/^[a-z]+:/, ''))
    return name ? (name === label ? `[[${name}${at}]]` : `[[${name}${at}|${label}]]`) : `[[${label}${at}]]`
  }
  if (typeof value === 'string') return value.replace(/\[\[@([^|\]]+)\|([^\]]+)\]\]/g, (_, id: string, label: string) => link(id, label))
  if (!value) return ''
  const inline = (nodes: Doc[] = []): string =>
    nodes.map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'noteLink') return link(String(node.attrs?.id ?? ''), String(node.attrs?.text || node.attrs?.label || ''), node.attrs?.block ? `#^${node.attrs.block}` : node.attrs?.heading ? `#${node.attrs.heading}` : '')
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
  // A line a link lands on ends in its `^id`, as Obsidian writes one.
  const named = (node: Doc): string => (node.attrs?.blockId ? ` ^${node.attrs.blockId}` : '')
  const block = (node: Doc, indent = ''): string => {
    const kids = node.content ?? []
    switch (node.type) {
      case 'heading': return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(kids)}${named(node)}`
      case 'paragraph': return indent + inline(kids) + named(node)
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
          const lead = !first ? '' : first.type === 'paragraph' ? inline(first.content) + named(first) : block(first).trim()
          return [`${indent}${mark} ${lead}`, ...rest.map((child) => block(child, indent + '  '))].join('\n')
        }).join('\n')
      default: return kids.length ? kids.map((child) => block(child, indent)).join('\n\n') : inline([node])
    }
  }
  return block(value as Doc).trim() + '\n'
}


// --- settings and the privacy gate ----------------------------------------

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
/** A GIF from Giphy pinned for a moment: enough to download it again and show it. */
export type Pin = { id: string; title: string; mp4: string; still: string; width: number; height: number }
type Pins = Partial<Record<MomentKind, Pin>>
/** Saved pins, each one whole, or passed over. */
const asPins = (saved: unknown): Pins =>
  saved && typeof saved === 'object'
    ? Object.fromEntries(Object.entries(saved).filter(([, pin]) => pin && typeof pin === 'object' && typeof (pin as Pin).id === 'string' && typeof (pin as Pin).mp4 === 'string'))
    : {}

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

/** A focus session, on a task or bare (kind 'focus'), as SQL on the sessions table. */
const FOCUSED = "(task_id != '' or kind = 'focus')"
/** A plain timer, a break or a set of rounds: no task and not a bare session. */
const TIMER = "(task_id = '' and coalesce(kind, '') != 'focus')"

/**
 * The settings and their defaults. The plan budgeted five; the argument for
 * the rest is that you asked for them, and each is one value read in one place.
 */
const DEFAULTS = {
  // Pages sit in a centred column, as Notion lays them out, unless this is on.
  fullWidth: false,
  // The small sounds on complete, promote and grade.
  sounds: true,
  // How loud they are, from silent to full.
  volume: 1,
  // A clock ticking while a focus session runs (never in a break), and how
  // loud, under the Volume above. On to start; anyone who turned it off keeps
  // their own saved choice. Off, its last ten seconds are silent too.
  sessionTick: true,
  sessionTickVolume: 0.5,
  // Which tick, from the recordings in Settings.
  sessionTickSound: 'wall' as 'old' | 'wall' | 'watch' | 'desk',
  // Now and then a light glides across the session bubble, in case it was forgotten.
  sessionGleam: true,
  // The bubble's soft smoke kept on all session, faint, stronger under the pointer.
  sessionSmoke: true,
  // Things ease in and out rather than appearing at once.
  motion: true,
  // Where the box sits. Centred: opening the side panel grows it out on both
  // sides, so it stays centred where it was; off, it grows right. Up and down
  // it always grows from its top, so the writing stays where the eye is.
  boxCentred: true,
  // Raycast's way, off to start: the box puts itself away when you click into
  // another app. Off, it stays up beside what you are reading until Esc or the key.
  boxAutoHide: false,
  // Left for another app, the box dims as every window does; off, it stays at full strength.
  boxDim: true,
  // Quick capture's buttons out of sight until pointed at (⌥⌘,). Off to start, so nobody is left looking for them.
  boxHideButtons: false,
  // The Dock's icon: the leaves in bronze or gold.
  appIcon: 'bronze' as 'bronze' | 'gold',
  // A single word's meaning, faint under it in quick capture, from the Mac's
  // own Dictionary: whenever the box holds one word, only once Word is picked,
  // or never. On to start: it is local and instant, takes no room, and is
  // kept only when taken with Tab.
  wordMeanings: 'one-word' as 'one-word' | 'word-kind' | 'off',
  // Where it turns up when summoned: where you left it, or always the top
  // middle or the middle of the screen. And on which screen: the one the
  // pointer is on, or the one it was last on.
  boxPlace: 'last' as 'last' | 'top' | 'centre',
  boxScreen: 'pointer' as 'pointer' | 'same',
  // Which of the nine packs they play through.
  soundPack: 'soft' as string,
  // The share of prompt opens that show a hint, and how many rot cards.
  hintRate: 0.1,
  rotCount: 2,
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
  // Pictures in notes framed like a postcard: a border and a soft shadow.
  postcards: true,
  // The postcard's border: 'auto' takes it from the theme.
  postcardBorder: 'auto' as 'auto' | 'white' | 'cream' | 'black' | 'accent',
  // A picture in a note tips toward the pointer. Off by default: a lot for a
  // page of notes. Focus and full screen tilt anyway.
  tiltPictures: false,
  // A picture's caption rides beside the pointer while it is on the picture.
  captionFollows: true,
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
  // A Mac notification at this time ("09:00") when cards are due; null is off.
  reviewReminder: null as string | null,
  // How long a new card lasts after each first grade, fitted to your own reviews (Settings, Fit to my memory); null is the defaults.
  fsrsFirst: null as number[] | null,
  // Hints can be memories: this day last year, things from one source.
  memories: true,
  // The weather outside, kept with each capture as context. It asks a weather
  // service that guesses your town from your connection; off in Settings.
  weather: true,
  // Tasks and notes hidden until a later day show in the lists anyway.
  showSnoozed: false,
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
  // A note's own cover: one of the paper drawings bundled with the app, or
  // 'gradients': the bundled gradients, or the Covers folder's when one is set.
  coverStyle: 'paper' as 'paper' | 'gradients',
  // Celebrations: a card on the rare milestones, playing something from this
  // folder (a GIF, a picture, a short clip). Empty is none: a grainy cover.
  celebrate: true,
  celebrationsFolder: devFolder('Downloads/memes'),
  // Files of its own for each kind of milestone, one played at random in
  // place of one from the folder. A file no longer there is passed over.
  celebrationPicks: DEV_PICKS,
  // Read back only: the picks chosen in Settings, without the developer's own (see settings()).
  ownPicks: {} as Picks,
  // What each kind of celebration plays: Vigil's drawing, your file or Giphy
  // (moment-source.ts). Never chosen, Giphy; a task done, just its tick.
  celebrationSources: {} as Partial<Record<MomentKind, MomentSource>>,
  // Giphy: a random GIF for these words when a moment has none pinned, found
  // with Vigil's key or your own, and the ones you starred to see more often.
  // Your key is kept here, in your settings, and nowhere else.
  giphyKey: '',
  giphyWords: 'ed edd n eddy celebrate',
  giphyStars: [] as string[],
  // One GIF from Giphy pinned for a kind of moment, kept downloaded so it plays offline too (giphy.ts).
  giphyPins: {} as Pins,
  // A question you are holding comes back now and then as a hint card: still
  // open, how long, how many clues. Off in Settings.
  questionsBack: true,
  // Open goals in a slim strip at the top of Home and Today's page.
  goalStrip: true,
  // Home's month calendar marks the days you opened Vigil; off until chosen.
  monthOpened: false,
  // The same calendar's other mark: how many things you captured each day, and the days with none.
  monthCaptures: false,
  // In the morning, Home offers about ten minutes sorting the Inbox ("Sort this out" over it).
  morningSort: true,
  // How many habits (routines) and goals can be active at once before the reviews say it is a lot.
  activeCap: 7,
  // A goal with no log for a week says so in the box, more plainly as it goes on.
  goalNudges: true,
  // A goal's beacon, a small window of its own on every Space: 'always',
  // 'sometimes' (at a few moments a day, then tucked away) or 'off'. Each
  // goal can say otherwise; in its last week 'sometimes' stays.
  goalBeacon: 'sometimes' as 'always' | 'sometimes' | 'off',
  // Tuck away by the clock: an always-on goal card shown in full before
  // goalShowUntil and after goalShowFrom, and in between peeking (a slim tab
  // at the screen's edge that opens when pointed at) or tucked out of sight.
  // During a focus session it tucks, peeks or stays as goalInFocus says. A
  // card out of sight for two days or more peeks out once a day (goalPeekOut).
  goalTuck: false,
  goalShowUntil: '09:00',
  goalShowFrom: '17:00',
  goalBetween: 'peek' as 'peek' | 'tuck',
  goalInFocus: 'tuck' as 'tuck' | 'peek' | 'stay',
  goalPeekOut: true,
  // Every bar that fills: plain, a lightsaber, or a dinosaur running along
  // it. The developer's own Vigil wears the saber.
  progressBars: (ownData() ? 'saber' : 'plain') as 'plain' | 'saber' | 'dino',
  // The focus pill: its ring alone, or the progress bars' dinosaur beside it,
  // running in place or along a line that fills with the session.
  focusBubble: 'circle' as 'circle' | 'runner' | 'progress',
  // Where a session's time shows: the floating bubble, a quiet footer under
  // the note being written in (the bubble then stays away), or both.
  focusShows: 'bubble' as 'bubble' | 'note' | 'both',
  // Where the session pill sits: tucked under the notch on a Mac that has
  // one, compact until pointed at, or wherever you dragged it.
  pillSits: 'free' as 'notch' | 'free',
  // The five-second rule: a session counts 5, 4, 3, 2, 1 with a tick before its clock starts.
  // On to start; anyone who turned it off keeps their own saved choice.
  countIn: true,
  // After a break runs out, the session before it starts again by itself, with no click. Off to start.
  autoNextRound: false,
  // The Mac going to sleep in a session: finished there, counted up to that
  // moment (the default, so a session left overnight is not nine hours of
  // focus), abandoned there, or left running on real time.
  sessionSleep: 'finish' as 'nothing' | 'abandon' | 'finish',
  // Websites sent away while a focus round runs (site-block.ts): on, with none to start.
  siteBlock: true,
  // The sites blocked: "x.com", a collection ("@social"), or one taken out of it ("-reddit.com").
  blockSites: [] as string[],
  // YouTube, X and LinkedIn blocked in every session whatever the list says
  // (site-hosts.ts, ALWAYS_BLOCKED). Off to start, on in the developer's own book.
  alwaysBlock: ownData(),
  // On Sundays, Home sums up the week: caught, kept, reviewed, finished.
  weeklyDigest: true,
  // After a month ends, its wrap is offered once, on the first open after the 1st; `wrapOffered` is the last month offered.
  wrapOffer: true,
  wrapOffered: '' as string,
  // Arc's Today tabs, for the Inbox: at the start of a day, a capture left
  // untouched this many days moves to Archived on its own (0: never). Off
  // until chosen: what is archived stops coming back as hints and memories.
  autoArchive: 0 as number,
  // Your Mac's calendar on Today and the week, read only; off until you ask for it.
  macCalendar: false,
  // When the working day ends, for Today's "4 h left today".
  dayEnd: '22:00',
  // About how long a working day is, in hours: a day's meetings and tasks are weighed against it.
  workHours: 8,
  /** Today's soft cap: the one big thing plus this many more (3 to 6). Past it Today says so, and never stops you. */
  todayCap: 3,
  /** Carried over this many times, a task asks to be scheduled, dropped or moved to Someday. */
  carryAsk: 5,
  /** Away this many days, Vigil opens with only capture and Today until the next start. */
  gapDays: 7,
  // Closing the day: offered once an evening, after this hour.
  closeDay: true,
  // Settings' theme tiles: pointing at one wears it for a moment. Off, so a pointer resting there as Settings opens changes nothing.
  themePreview: false,
  // The month calendar on Home: off until turned on in Settings.
  homeCalendar: false,
  // How much of the day, week, month and year has gone, on Home: off until turned on in Settings.
  homeTimeGone: false,
  // This season's habits, ticked on Close the day: their names, in order.
  habits: [] as string[],
  closeDayAt: '18:00',
  // Tomorrow's first task, picked when the day was closed: it leads Today and the day brief that day.
  frog: null as { id: string; day: string } | null,
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
  // What the main window's sidebar lists (the same as places.tsx, SHOWN); one switched off is not in it at all, still a G or ⌘K away.
  // Every page shown from the start, so you see them all and hide the ones you never use.
  sidebarShown: ['home', 'inbox', 'all', 'review', 'day', 'weekpage', 'monthpage', 'today', 'week', 'calendar', 'upcoming', 'matrix', 'routines', 'later', 'tomorrow', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'tags', 'stats', 'map', 'discarded', 'archived', 'powers'] as string[],
  // A book begun since the sidebar grows with you (sidebar-grows.ts): it opens with
  // the writing pages, Today and Calendar, and each other page joins once used.
  // An older book moves to it once (sidebarWritingOnce); the sandbox keeps every page shown.
  sidebarGrows: false,
  // Every page a growing sidebar has shown at some time: one hidden after that stays hidden.
  sidebarMet: [] as string[],
  // Pages lifted to just under Inbox (the welcome's Study lifts Review).
  sidebarRaised: [] as string[],
  // What "New" at the top of the main window and ⌘N there make: a blank page, or a capture in quick capture.
  newMakes: 'capture' as 'page' | 'capture',
  // The page the main window opens on: Home to start, or any section by its id.
  startPage: 'home',
  // The sidebar on the window's left, as in Finder, or its right.
  sidebarSide: 'left' as 'left' | 'right',
  // With the sidebar hidden, pointing at the window's edge slides it out over the page until you leave.
  sidebarPeek: true,
  // The box's tabs; Recent is a ⇧⌘Y or ⌘K away until shown.
  boxTabs: ['inbox', 'today', 'review', 'kept'] as string[],
  // The sidebar's places, the box's tabs and the pins (type:id) in your own order; empty is the usual one.
  sidebarOrder: [] as string[],
  boxTabsOrder: [] as string[],
  pinOrder: [] as string[],
  // Sticky notes on the desktop: shown or all put away (⌃⌥⌘N).
  stickiesShown: true,
  // Which windows show in screen shares, recordings and screenshots: every one
  // to start, so a screenshot taken during the welcome has Vigil in it. Hidden
  // (blank to a camera, still there for you) in Settings, all at once in ⌘K.
  inRecordings: { main: true, box: true, stickies: true, bubble: true } as Recordings,
  // A capture box and sticky notes are only any use if they are there after a restart.
  openAtLogin: true,
  // Read once only, by the move to inRecordings (App.tsx): sticky notes kept out while the rest showed.
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
/**
 * Every setting as the windows read it (one type for both sides): the
 * defaults above, and the few saved only once chosen, with no row until then.
 */
export type Settings = typeof DEFAULTS & {
  /** “I have N minutes”: the length last asked for. */
  fitMinutes?: number
  /** The playbook, “How I work”: the piece of writing it is. */
  playbook?: string
  /** The last season closed (or skipped) in Close the week, as "2026-Q4". */
  seasonClosed?: string
  /** Narrow, Wide or Full; unset, it follows fullWidth (see widthOf in reading.ts). */
  pageWidth?: 'narrow' | 'wide' | 'full'
  /** A link card's picture: filling its box (cover), or shown whole (contain). */
  linkPictures?: 'fill' | 'whole'
  /** The next marked days in the menu bar's menu, under the bars (read by milestones.ts). */
  milestonesInMenu?: boolean
  /** After `closeDayAt`, a “For tomorrow” box at the end of Today and Today's page. */
  tomorrowBox?: boolean
  /** The Calendar's second hour column: an IANA time zone ("America/New_York"); unset, none. */
  secondZone?: string
  /** The Calendar's layers switched off: "tasks", or "mac:<calendar name>" for one of your Mac's calendars. */
  calendarHidden?: string[]
}

/**
 * The weather where you are, as a few words: "12°C, light rain". wttr.in
 * places you by your connection, so there is no key, no account and no
 * location permission. Asked at most every half hour; offline, or slow, it is
 * simply left out.
 */
let weather: { said: string; at: number } | null = null
let asking: Promise<string | null> | null = null
async function weatherNow(): Promise<string | null> {
  if (weather && Date.now() - weather.at < 30 * 60000) return weather.said
  // Asked already and on its way (the app asked as it started): the same answer, not a second ask.
  return (asking ??= ask().finally(() => void (asking = null)))
}
async function ask(): Promise<string | null> {
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

/** Told of each in-app nudge (see nudge.ts): the card window shows it. */
/** Gives back whether the card could be shown (not with the screen locked): if not, the Mac's notification goes instead. */
let nudgeTold: (nudge: Nudge) => boolean = () => false
export const whenNudge = (tell: (nudge: Nudge) => boolean): void => void (nudgeTold = tell)

/** Told when a goal is made, moved, settled or taken back, or its beacon setting changes: the beacons follow. */
let goalsTold: () => void = () => undefined
export const whenGoals = (tell: () => void): void => void (goalsTold = tell)
/** The goal cards read the goals again now: one went to the Bin, the archive, or back. */
export const tellGoals = (): void => goalsTold()
/** Each goal's beacon unless the goal says otherwise: 'always', 'sometimes' or 'off'. */
export const beaconDefault = (): 'always' | 'sometimes' | 'off' => settings().goalBeacon
/** The goal cards' tuck-away rules (see goalTuck above). */
export const tuckRules = (): { on: boolean; showUntil: string; showFrom: string; between: 'peek' | 'tuck'; inFocus: 'tuck' | 'peek' | 'stay'; peekOut: boolean } => {
  const now = settings()
  return { on: now.goalTuck === true, showUntil: now.goalShowUntil, showFrom: now.goalShowFrom, between: now.goalBetween === 'tuck' ? 'tuck' : 'peek', inFocus: now.goalInFocus === 'peek' || now.goalInFocus === 'stay' ? now.goalInFocus : 'tuck', peekOut: now.goalPeekOut !== false }
}
export const tempusDots = (): boolean => settings().tempusDots === true

/** Told when where a session's time shows changes: the bubble comes or goes. */
/** The kinds of window that show in screen recordings, or not, each on its own. */
export type Recordings = { main: boolean; box: boolean; stickies: boolean; bubble: boolean }
let iconTold: () => void = () => undefined
export const whenIcon = (tell: () => void): void => void (iconTold = tell)
let recordingsTold: () => void = () => undefined
export const whenRecordings = (tell: () => void): void => void (recordingsTold = tell)
/** Which windows show in screen recordings; one never chosen shows. */
export const recordingPrefs = (): Recordings => {
  const saved = (settings().inRecordings ?? {}) as Partial<Recordings>
  return { main: saved.main !== false, box: saved.box !== false, stickies: saved.stickies !== false, bubble: saved.bubble !== false }
}
let focusShowsTold: () => void = () => undefined
export const whenFocusShows = (tell: () => void): void => void (focusShowsTold = tell)
/** Whether the floating bubble shows during a session, or only the note's footer does. */
export const focusBubbleShown = (): boolean => settings().focusShows !== 'note'
/** The pill tucked under the notch, where the Mac has one. */
export const pillInNotch = (): boolean => settings().pillSits === 'notch'
/** What a session does when the Mac sleeps in it (Settings, “When the Mac sleeps”). */
export const sleepChoice = (): Settings['sessionSleep'] => settings().sessionSleep
/** Whether websites are blocked in a focus round, and which (Settings, “Blocking websites”). */
export const blockPrefs = (): Pick<Settings, 'siteBlock' | 'blockSites'> => {
  const { siteBlock, blockSites, alwaysBlock } = settings()
  return { siteBlock, blockSites: alwaysBlock ? withAlways(blockSites) : blockSites }
}

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
export const stickyPrefs = (): { shown: boolean } => ({ shown: settings().stickiesShown })
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
export const celebrationPrefs = (): { on: boolean; folder: string; picks: Picks; pins: Pins; sources: Settings['celebrationSources']; giphyKey: string; giphyWords: string; giphyStars: string[] } => {
  const now = settings()
  return {
    on: now.celebrate !== false, folder: now.celebrationsFolder || '', picks: now.celebrationPicks ?? {}, pins: asPins(now.giphyPins),
    sources: now.celebrationSources && typeof now.celebrationSources === 'object' ? now.celebrationSources : {}, giphyKey: typeof now.giphyKey === 'string' ? now.giphyKey : '',
    giphyWords: typeof now.giphyWords === 'string' ? now.giphyWords : '', giphyStars: Array.isArray(now.giphyStars) ? now.giphyStars : []
  }
}

/** The Motion setting, for the window's own arrival. */
export const motionOn = (): boolean => settings().motion
export const appIcon = (): 'bronze' | 'gold' => settings().appIcon
export const blurOn = (): boolean => settings().blur !== false
/** Whether the box puts itself away when it loses the focus. */
export const boxAutoHide = (): boolean => settings().boxAutoHide === true
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
  // ownPicks: only what was chosen in Settings, without the developer's own files,
  // for the sandbox to carry (it is someone else's book, not the developer's).
  const chosen = rows.find((row) => row.key === 'celebrationPicks')
  all.appIcon = all.appIcon === 'gold' ? 'gold' : 'bronze'
  return { ...all, celebrationPicks: withDevPicks(asLists(all.celebrationPicks)), ownPicks: asLists(chosen ? read(chosen.value) : {}) }
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
  // A review dated after now (the clock set back, a time zone change, a copy
  // from another Mac) would be a negative gap the scheduler refuses, and the
  // whole Review list with it: it counts as reviewed just now instead.
  const last = card.last_review ? new Date(Math.min(Date.parse(card.last_review), Date.now())) : undefined
  return { ...card, due: new Date(card.due), last_review: last }
}
// The plan's learning steps, ten minutes then a day, and fuzz so cards learnt
// together spread over the days around their due date instead of landing at once.
const scheduler = (): ReturnType<typeof fsrs> =>
  fsrs(generatorParameters({ request_retention: settings().retention, learning_steps: ['10m', '1d'], enable_fuzz: true, w: weights() }))
/** The scheduler's parameters: its defaults, with how long a new card lasts fitted to you once Settings has done it. */
const weights = (): number[] => {
  const first = settings().fsrsFirst
  return Array.isArray(first) && first.length === 4 ? [...first, ...default_w.slice(4)] : [...default_w]
}

/** When each of the four grades would bring an item back, for the buttons. */
const preview = (state: string | null, cap: (due: Date) => Date = (due) => due): Record<number, string> => {
  const record = scheduler().repeat(cardOf(state), new Date())
  return Object.fromEntries([1, 2, 3, 4].map((grade) => [grade, cap(record[grade as Grade].card.due).toISOString()]))
}

// --- tasks ----------------------------------------------------------------

type Node = { type?: string; text?: string; content?: Node[] }
const plainOf = (node: Node): string => node.text ?? (node.content ?? []).map(plainOf).join('')
/** Whether a block holds anything: words, or a picture, file or other thing with no words. */
const filled = (node: Node): boolean => !!plainOf(node).trim() || (node.type !== 'text' && node.type !== 'paragraph' && node.type !== 'hardBreak' && !node.content) || (node.content ?? []).some(filled)
/**
 * What a capture holds beyond its name, as a task's notes: its pictures,
 * files and every line after the first, so a task made from it still has
 * everything that was in it. Null when the name is all there is.
 */
export function bodyAsNotes(captureId: string): string | null {
  const row = database().prepare(`select title, body, ${LABEL} as label from captures where id = ?`).get(captureId) as { title: string | null; body: string | null; label: string | null } | undefined
  if (!row?.body) return null
  let doc: Node | null = null
  try { doc = JSON.parse(row.body) as Node } catch { /* Markdown: line by line */ }
  const blocks: Node[] = doc?.type === 'doc' ? [...(doc.content ?? [])]
    : row.body.split('\n').map((line) => (line.trim() ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }))
  // With no title of its own, its first line of words is its name, which the task already has.
  if (!row.title?.trim()) {
    const first = blocks.findIndex((block) => !!plainOf(block).trim())
    const name = (row.label ?? '').trim().slice(0, 24)
    if (first >= 0 && ['paragraph', 'heading'].includes(blocks[first].type ?? '') && !(blocks[first].content ?? []).some((one) => one.type !== 'text' && one.type !== 'hardBreak')
      && (!name || plainOf(blocks[first]).includes(name) || name.includes(plainOf(blocks[first]).trim().slice(0, 24)))) blocks.splice(first, 1)
  }
  while (blocks.length && !filled(blocks[0])) blocks.shift()
  while (blocks.length && !filled(blocks[blocks.length - 1])) blocks.pop()
  return blocks.length ? JSON.stringify({ type: 'doc', content: blocks }) : null
}
/** A new task made from one capture carries what the capture held. */
const carryBody = (task: Made, captureId: string): void => {
  if (task.existed) return
  const notes = bodyAsNotes(captureId)
  if (notes) database().prepare('update tasks set notes = ? where id = ? and notes is null').run(notes, task.id)
}

/** What making a task gave back: the task, and whether it was already there. */
export type Made = { id: string; number: number; existed: boolean }

/**
 * A task from a line of text. The same task twice is one task: an open one
 * with the same name is returned instead, and what this one came from is
 * linked to it, so nothing is lost and nothing is doubled.
 */
function addTask(text: string, origin: string | null = null, today = false, plain: { from: number; to: number }[] = []): Made {
  const db = database()
  const task = readTask(text, new Date(), plain)
  // A #word at the front that is no tag in use and runs on into the sentence is its first word.
  const inUse = (tag: string): boolean => !!db.prepare(
    `select 1 from tag_meta where tag = ?1 union all select 1 from tasks where lower(title) like ?2
     union all select 1 from captures where status != 'discarded' and lower(body) like ?2 union all select 1 from nuggets where lower(body) like ?2 limit 1`
  ).get(tag, `%#${tag}%`)
  // A pasted paragraph is no title: its first line (cut near 500 letters)
  // names the task, and the words in full are kept in its notes.
  const said = leadingTag(task.title || text, inUse)
  const fitted = fittedTitle(said)
  const title = fitted ?? said
  const notes = fitted ? JSON.stringify({ type: 'doc', content: text.trim().split('\n').map((line) => (line.trim() ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) }) : null
  // The same name with no date or repeat of its own is the same task; one
  // that brings a date or a repeat is meant as a new one.
  const twin = task.due || task.recurrence || task.deadline || task.plan || task.snooze ? undefined
    : (db.prepare("select id, number from tasks where status = 'open' and lower(trim(title)) = lower(trim(?))").get(title) as { id: string; number: number } | undefined)
  if (twin) {
    if (origin) db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(twin.id, origin)
    // A reminder word said again ("!alert") is still heard.
    if (task.notify) db.prepare('update tasks set notify = ? where id = ?').run(task.notify, twin.id)
    // So is a priority said again ("call mum p1"): the open task takes it, as the box's This will line says.
    // And a length said again ("~30m").
    if (task.estimate) db.prepare('update tasks set estimate = ? where id = ?').run(task.estimate, twin.id)
    if (task.spans.some((span) => span.kind === 'priority'))
      db.prepare('update tasks set priority = ?, important = ? where id = ?').run(task.priority, [1, 2].includes(task.priority) ? 1 : 0, twin.id)
    return { ...twin, existed: true }
  }
  const id = randomUUID()
  // Typed into Today with no date, it is for today, as in Todoist: all day,
  // not dropped into a backlog the list you typed it in does not show.
  if (today && !task.due && !task.plan) Object.assign(task, { due: dayjs().hour(9).startOf('hour').toISOString(), allDay: true })
  const { number } = db
    .prepare(
      `insert into tasks (id, number, title, notes, due_at, all_day, recurrence, repeat_until, origin_capture_id, created_at, deadline_at, priority, important, plan_for, deadline_timed, notify, estimate)
       values (?, (select coalesce(max(number), 0) + 1 from tasks), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning number`
    )
    .get(id, title, notes, task.due, task.allDay ? 1 : 0, task.recurrence, task.until, origin, now(), task.deadline, task.priority, [1, 2].includes(task.priority) ? 1 : 0, task.plan, task.deadlineTimed ? 1 : 0, task.notify, task.estimate) as { number: number }
  // "show again monday", "get ready 1 week before".
  if (task.snooze || task.getReady) db.prepare('update tasks set snoozed_until = ?, get_ready = ? where id = ?').run(task.snooze, task.getReady, id)
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
  // Where a gem came from (a book, a site), as its capture had it: added later, empty on older ones.
  column('nuggets', 'medium text')
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
  // Tags the box was told to keep as plain text when it was sent ("#book"
  // that is only a word): they do nothing for this capture.
  column('captures', 'plain_tags text')
  // Where a capture was before the Bin (resolved, saved as a gem), so Restore puts it back there.
  column('captures', 'binned_was text')
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
  // The day a series was anchored to before a move by hand, for that move's undo.
  column('tasks', 'repeat_day_was integer')
  column('tasks', 'important integer not null default 0')
  column('tasks', 'deadline_at text')
  // "by 5pm" has a time that matters; "by friday" is only a day.
  column('tasks', 'deadline_timed integer not null default 0')
  column('tasks', 'blocker text')
  // The task in the way, when what blocks it is one of your own: its id. The
  // words in "blocker" stay as a plain note when it is not.
  column('tasks', 'blocked_by text')
  column('tasks', 'reschedules integer not null default 0')
  column('tasks', 'notify text')
  // Linear's four priorities, 1 Urgent to 4 Low, 0 for none. Important was
  // the one flag before them: it is High, and stays in step with them, so
  // nothing that reads it loses anything. Safe to run every start.
  column('tasks', 'priority integer not null default 0')
  // Carried over: how many days a task was left undone past its day, and the
  // last day that was counted, so each day counts once.
  column('tasks', 'rollovers integer not null default 0')
  column('tasks', 'rolled_on text')
  // A routine's times in a row passed over with Skip; a real tick sets it back to none.
  column('tasks', 'skips integer not null default 0')
  // Put on hold by a fresh start: out of every list until its day comes, or it is opened.
  column('tasks', 'held_at text')
  db.exec('update tasks set priority = 2 where important = 1 and priority = 0')
  // Tasks made before a front "#tag," lost its comma: the same words without it. Safe to run every start.
  for (const task of db.prepare("select id, title from tasks where title like '#%'").all() as { id: string; title: string }[]) {
    const fixed = leadingTag(task.title)
    if (fixed !== task.title) db.prepare('update tasks set title = ? where id = ?').run(fixed, task.id)
  }
  // A when with no day: "someday", a month ("2026-10") or a year ("2026").
  column('tasks', 'plan_for text')
  // Hidden until a day ("2026-11-03"), and how many days before its due-by date it comes up to get ready for.
  column('tasks', 'snoozed_until text')
  column('tasks', 'get_ready integer')
  column('task_done', 'session_id text')
  column('nuggets', 'superseded_by text')
  column('nuggets', 'revisions integer not null default 0')
  column('nuggets', 'edited_since_review integer not null default 0')
  // A card written inside a note ("question :: answer"): the note it lives in. See line-cards.ts.
  column('nuggets', 'line_of text')
  // Starred in Review (S): a card you want to come back to, with a round of its own.
  column('nuggets', 'starred_at text')
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
    insert or ignore into tag_meta (tag, color, action) values ('bug', 'red', 1), ('fix', 'orange', 1), ('feature', 'blue', 1), ('improvement', 'green', 1);
    insert or ignore into tag_meta (tag, color, action) values ('professional', 'blue', 1), ('digital-admin', 'purple', 1), ('physical-admin', 'orange', 1), ('calls', 'green', 1), ('orders', 'yellow', 1);`)
  column('tag_meta', 'alias_of text')
  // An exam or deadline on a tag: review paces everything carrying it to be ready by then.
  column('tag_meta', 'exam_at text')
  // How Review treats a tag's cards: null learns them, 'maintaining' brings no new ones, 'paused' none at all.
  column('tag_meta', 'priority text')
  // Where a task made by a tag lands: null with no date (as always), else that
  // many days from today ('0' today, '1' tomorrow, '7' a week on).
  column('tag_meta', 'lands text')
  // What stands behind a tag page's header: 'colour', 'picture' (one from its notes) or 'sketch'; null picks for itself.
  column('tag_meta', 'backdrop text')
  // Why the answer is so, one line under it in review.
  column('nuggets', 'why text')
  // A question held open: when it was settled, and how ('answered' or 'let go').
  // Open while both are empty, for years if that is what it takes.
  column('nuggets', 'closed_at text')
  column('nuggets', 'closed_how text')
  // A clue that came from a capture keeps which, so taking it back reopens it.
  column('glosses', 'source_id text')
  // Which question a capture went into, read with every list of captures (captures.ts, keptIn).
  db.exec('create index if not exists glosses_by_source on glosses(source_id)')
  // A goal: the day it is for and the day it was set, as "2026-12-14". It is
  // settled as a question is, by closed_at and closed_how ('made it',
  // 'missed' or 'let go'); why it matters is its `why`, its logs are glosses.
  column('nuggets', 'goal_at text')
  column('nuggets', 'goal_from text')
  // How often its beacon shows; null follows Settings.
  column('nuggets', 'goal_beacon text')
  // Its colour, the same names a tag's take: its items wear it where goals are shown together.
  column('nuggets', 'goal_color text')
  // Every open goal without one is given one, each a different colour while there are colours to go round.
  for (const { id } of db.prepare("select id from nuggets where tier = 'goal' and goal_color is null and closed_at is null order by goal_at, created_at").all() as { id: string }[])
    db.prepare('update nuggets set goal_color = ? where id = ?').run(freeGoalColor(), id)
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
  // A book starting now, empty and never opened before: its sidebar grows with it (set out below, once the older moves are done).
  const newBook = !SANDBOX && version === 0 && !db.prepare("select 1 from settings where key = 'sidebarAllOnce'").get()
    && !db.prepare('select 1 from captures limit 1').get() && !db.prepare('select 1 from nuggets limit 1').get()
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
  // The welcome's "Writing and reading" and "Study" sidebars once left out the
  // task pages altogether, so a replayed welcome took Today, This week and
  // Upcoming away. A sidebar with none of them gets them back, once.
  if (!db.prepare("select 1 from settings where key = 'sidebarTasksBack'").get()) {
    const saved = db.prepare("select value from settings where key = 'sidebarShown'").get() as { value: string } | undefined
    let shown: unknown = null
    try { shown = saved && JSON.parse(saved.value) } catch { /* Unreadable: the default, which has them. */ }
    if (Array.isArray(shown) && !['today', 'week', 'upcoming'].some((id) => shown.includes(id)))
      db.prepare("update settings set value = ? where key = 'sidebarShown'").run(JSON.stringify([...shown, 'today', 'week', 'upcoming']))
    db.prepare("insert or replace into settings (key, value) values ('sidebarTasksBack', 'true')").run()
  }
  // The Calendar page arrived: a sidebar already set up shows it too, once.
  if (!db.prepare("select 1 from settings where key = 'sidebarCalendarOnce'").get()) {
    const saved = db.prepare("select value from settings where key = 'sidebarShown'").get() as { value: string } | undefined
    let shown: unknown = null
    try { shown = saved && JSON.parse(saved.value) } catch { /* Unreadable: the default, which has it. */ }
    if (Array.isArray(shown) && !shown.includes('calendar'))
      db.prepare("update settings set value = ? where key = 'sidebarShown'").run(JSON.stringify([...shown, 'calendar']))
    db.prepare("insert or replace into settings (key, value) values ('sidebarCalendarOnce', 'true')").run()
  }
  // Every page shows in the sidebar now, so a sidebar set up before gets them all, once.
  // Only which ones show goes back to the default; your order (sidebarOrder) stays.
  if (!db.prepare("select 1 from settings where key = 'sidebarAllOnce'").get()) {
    db.prepare("delete from settings where key = 'sidebarShown'").run()
    db.prepare("insert or replace into settings (key, value) values ('sidebarAllOnce', 'true')").run()
  }
  // A new book: the first few pages, the rest joining as they are used, and "New" makes a blank page, as in Obsidian.
  // The Queue's own move (reading-queue.ts) is marked done, so it does not add its page.
  if (newBook) {
    const put = db.prepare('insert or replace into settings (key, value) values (?, ?)')
    for (const [key, value] of Object.entries({ sidebarGrows: true, sidebarShown: FIRST_SHOWN, sidebarMet: FIRST_SHOWN, newMakes: 'page', queueShownOnce: true })) put.run(key, JSON.stringify(value))
  }
  // A book made before writing came first moves to it once: its sidebar grows from
  // now on, Tasks' pages it has nothing on wait under "More", and what you hid or
  // ordered is kept (sidebar-grows.ts, writingFirst). The sandbox keeps every page.
  if (!SANDBOX && !db.prepare("select 1 from settings where key = 'sidebarWritingOnce'").get()) {
    const put = db.prepare('insert or replace into settings (key, value) values (?, ?)')
    if (!newBook) {
      const now = settings()
      const open = "from tasks where status = 'open'"
      const has = (where: string): boolean => !!db.prepare(`select 1 ${open} and ${where} limit 1`).get()
      const day = (ahead: number): string => { const at = new Date(); at.setHours(0, 0, 0, 0); at.setDate(at.getDate() + ahead); return at.toISOString() }
      // A Tasks page is in use when it would list something: a page whose use cannot be told stays shown.
      const used = [
        has('due_at is not null') && 'week',
        has('due_at is not null') && 'upcoming',
        has(`due_at >= '${day(1)}' and due_at < '${day(2)}'`) && 'tomorrow',
        has('(priority > 0 or important = 1 or deadline_at is not null)') && 'matrix',
        has('recurrence is not null') && 'routines',
        has('(due_at is null or plan_for is not null)') && 'later'
      ].filter(Boolean) as string[]
      const moved = writingFirst({ shown: now.sidebarShown, all: DEFAULTS.sidebarShown, order: now.sidebarOrder ?? [], used })
      for (const [key, value] of Object.entries(moved)) put.run(key, JSON.stringify(value))
    }
    put.run('sidebarWritingOnce', 'true')
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
    // A page shown in a growing sidebar has been met: hidden later, it is not brought back on its own.
    const grown = settings()
    if (grown.sidebarGrows && 'sidebarShown' in patch && !('sidebarMet' in patch))
      db.prepare("insert or replace into settings (key, value) values ('sidebarMet', ?)").run(JSON.stringify([...new Set([...grown.sidebarMet, ...grown.sidebarShown])]))
    // Snoozed things shown or hidden: every list looks again.
    if ('showSnoozed' in patch) changed()
    if (patch.safeMode !== undefined && patch.safeMode !== wasSafe) safeModeTold(patch.safeMode)
    if (patch.keys) keysTold(patch.keys)
    if ('stickiesShown' in patch || 'stickiesFrosted' in patch || 'stickiesGlass' in patch) stickiesTold()
    if ('spellcheck' in patch || 'spellLanguages' in patch) spelling()
    if ('openAtLogin' in patch) atLogin()
    if ('goalBeacon' in patch || 'tempusDots' in patch || Object.keys(patch).some((key) => /^goal(Tuck|Show|Between|InFocus|PeekOut)/.test(key))) goalsTold()
    if ('focusShows' in patch || 'pillSits' in patch) focusShowsTold()
    if ('inRecordings' in patch) recordingsTold()
    if ('appIcon' in patch) iconTold()
    // Celebrations turned on, or Giphy asked for other words: a few fetched now, so the next card has one ready.
    if ('giphyWords' in patch || 'giphyKey' in patch || patch.celebrate === true) warmGiphy(0)
    // A GIF pinned for a moment: kept downloaded straight away, so it plays offline.
    if ('giphyPins' in patch) keepPins(0)
    return write(settings())
  })
  // A page joins a growing sidebar the first time it is used: those never shown
  // before are added, and said back so their rows can rise in. One hidden after it showed stays hidden.
  handle('sidebar:earn', (ids: string[]) => {
    const now = settings()
    if (!now.sidebarGrows || !Array.isArray(ids)) return []
    const fresh = [...new Set(ids)].filter((id) => typeof id === 'string' && !now.sidebarMet.includes(id) && !now.sidebarShown.includes(id))
    if (!fresh.length) return []
    const put = db.prepare('insert or replace into settings (key, value) values (?, ?)')
    put.run('sidebarShown', JSON.stringify([...now.sidebarShown, ...fresh]))
    put.run('sidebarMet', JSON.stringify([...now.sidebarMet, ...fresh]))
    return write(fresh)
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
  // When the last copy was made and whether backups are failing now, for Settings.
  handle('backups:status', () => backupStatus())
  // A copy made now, from Settings, rather than waiting for tonight's.
  handle('backups:now', async () => {
    if (!SANDBOX) await busy(() => backUpWatched(db))
    return backupStatus()
  })
  // The backups' folder in Finder: only that folder, never a path the window names.
  handle('backups:show', () => void shell.openPath(backupDir()))
  // Another folder for the backups (null: back to the usual place), and a copy made there at once, so you know it works.
  handle('backups:choose', async (usual: boolean) => {
    if (SANDBOX) return backupStatus()
    if (usual) chooseFolder(null)
    else {
      const { filePaths } = await dialog.showOpenDialog({ title: 'Choose where backups go', buttonLabel: 'Back up here', properties: ['openDirectory', 'createDirectory'] })
      if (!filePaths[0]) return null
      chooseFolder(filePaths[0])
    }
    await busy(() => backUpWatched(db))
    return backupStatus()
  })

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
    if (open.length === 1) carryBody(task, open[0])
    for (const id of open) {
      db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, id)
      db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    }
    // A new one's notes list each capture as a link, so what it is made of is one click away.
    if (!task.existed && open.length > 1) {
      const rows = open.map((id) => db.prepare(`select id, number, ${LABEL} as label from captures where id = ?`).get(id) as { id: string; number: number | null; label: string })
      const line = (content: unknown[]): unknown => ({ type: 'paragraph', content })
      const notes = { type: 'doc', content: [
        line([{ type: 'text', text: `Made from ${num(rows.length)} captures:` }]),
        { type: 'bulletList', content: rows.map((row) => ({ type: 'listItem', content: [line([{ type: 'noteLink', attrs: { id: row.id, label: row.label || 'Untitled', key: row.number ? `V-${row.number}` : '' } }])] })) }
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
    db.prepare(`update captures set session_id = (select id from sessions where ended_at is null and ${FOCUSED} order by started_at desc limit 1) where id = ?`).run(id)
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
    const capture = db.prepare(`select kind, body, private, attribution, medium, status, ${LABEL} as title from captures where id = ?`).get(id) as Record<string, string> | undefined
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
    // A goal kept is a goal: on the Goals page, aiming for the day its words name, or a month on.
    if (capture.kind === 'goal') {
      const named = parseDate(capture.title ?? '', new Date(), { forwardDate: true })
      const target = dayKey(named && named.getTime() > Date.now() ? named : new Date(Date.now() + 30 * 86400000))
      const goal = randomUUID()
      db.prepare("insert into nuggets (id, capture_id, tier, kind, title, body, why, goal_at, goal_from, goal_color, private, created_at, updated_at) values (?, ?, 'goal', 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(goal, id, cut(String(capture.title ?? '').trim(), 300) || 'Untitled', capture.body ?? 'null', line?.trim() || null, target, dayKey(), freeGoalColor(), capture.private, now(), now())
      db.prepare("update captures set status = 'promoted' where id = ?").run(id)
      goalPassed(goal)
      goalsTold()
      return write(goal)
    }
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
      prompt = `What does “${term.trim()}” mean?`
    }
    const nugget = randomUUID()
    db.prepare(
      `insert into nuggets (id, capture_id, kind, title, body, prompt, private, attribution, mode, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nugget, id, capture.kind, capture.title, body, prompt,
      capture.private, capture.attribution || null, 'encounter', now(), now())
    // A kind's own fields (a book's rating, a word's language) travel with it, and where it came from.
    db.prepare('update nuggets set fields = (select fields from captures where id = ?), medium = ? where id = ?').run(id, capture.medium || null, nugget)
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
    // Words in a note made into something stay there marked as kept, with its id (extensions/kept.ts).
    const keptIn = `%"keptId":"${id}"%`
    const body = (db.prepare('select body from captures where id = ? union all select body from nuggets where id = ?').get(id, id) as { body: string | null } | undefined)?.body ?? ''
    const kept = [...new Set([...body.matchAll(/"keptId":"([^"]+)"/g)].map((one) => one[1]))]
    const once = (rows: never[]): never[] => rows.filter((row: { id: string }, at) => rows.findIndex((one: { id: string }) => one.id === row.id) === at)
    return {
      from: once([
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where id in (select capture_id from nuggets where id = ? union select origin_capture_id from tasks where id = ?
          union select origin_id from captures where id = ? union select item_id from task_links where task_id = ?) or (id != ? and body like ?)`).all(id, id, id, id, id, keptIn) as never[]),
        ...(db.prepare('select tier as type, id, title, private from nuggets where id = (select origin_id from captures where id = ?) or (id != ? and body like ?)').all(id, id, keptIn) as never[]),
        ...(JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])
          .map((origin) => db.prepare('select tier as type, id, title, private from nuggets where id = ?').get(origin) as never)
          .filter(Boolean)
      ]),
      became: once([
        ...(db.prepare("select tier as type, id, title, private from nuggets where capture_id = ? or origins like ?").all(id, `%"${id}"%`) as never[]),
        // Its own task, or one it became part of with others.
        ...(db.prepare("select 'task' as type, id, title, 0 as private from tasks where origin_capture_id = ? or id in (select task_id from task_links where item_id = ?)").all(id, id) as never[]),
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where origin_id = ?`).all(id) as never[]),
        // Kept as a clue in a question someone is holding.
        ...(db.prepare('select tier as type, id, title, private from nuggets where id in (select item_id from glosses where source_id = ?)').all(id) as never[]),
        // Its words marked as kept: what they became.
        ...(kept.flatMap((one) => [
          db.prepare('select tier as type, id, title, private from nuggets where id = ?').get(one),
          db.prepare("select 'task' as type, id, title, 0 as private from tasks where id = ?").get(one),
          db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where id = ?`).get(one)
        ]).filter(Boolean) as never[])
      ]),
      linked: [...links('captures', LABEL), ...links('nuggets', 'title')].filter((row) => row.id !== id)
    }
  })
  // Backlinks the way Obsidian lists them under a note: every note that links
  // here, with the sentence it does it in; and every note that names this
  // one without linking it yet, which one press turns into a link.
  type Mention = { type: string; id: string; title: string; snippet: string; private: number }
  const everything = (): { type: string; id: string; title: string; body: string; private: number }[] => [
    ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private from captures where status != 'discarded'`).all() as never[]),
    ...(db.prepare("select tier as type, id, title, body, private from nuggets where superseded_by is null and tier != 'card'").all() as never[])
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
    if (capture) return { title: capture.title, key: `V-${capture.number}`, link: id }
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
        const snippet = at >= 0 ? around(text, at, label.length) : cut(text, 160)
        // A line that is only the link and tags says nothing the row does not: none then.
        const bare = !withoutTags(snippet.replace(label, '')).replace(row.title ?? '', '').replace(/[\s….,:;·-]/g, '')
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
    // The words as they were and as they are now, for Undo to put back.
    return write({ was: row.body, linked: JSON.stringify(doc) })
  })
  // Undo for the above: the other note's words as they were, if nothing else changed them since.
  handle('mention:unlink', (sourceType: string, sourceId: string, was: string, linked: string) => {
    const table = sourceType === 'capture' ? 'captures' : 'nuggets'
    const row = db.prepare(`select body from ${table} where id = ?`).get(sourceId) as { body: string } | undefined
    if (!row || typeof was !== 'string') return false
    if (linked && row.body !== linked) return false
    db.prepare(`update ${table} set body = ? where id = ?`).run(was, sourceId)
    return write(true)
  })

  // What @ offers besides captures: nuggets and articles by name.
  handle('items:find', (query: unknown) =>
    db.prepare("select id, tier, coalesce(nullif(title, ''), label('', body)) as name, coalesce(nullif(title, ''), label('', body)) as title from nuggets where tier != 'card' and (name like ? escape '\\' or coalesce(aliases, '') like ? escape '\\') and superseded_by is null order by updated_at desc limit 6").all(`%${like(String(query))}%`, `%${like(String(query))}%`))
  // A page of your own from nothing: notes on linear algebra, say. An article
  // with no nuggets behind it, there to be written in.
  handle('article:new', () => {
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'article', 'note', 'Untitled', 'null', ?, ?)").run(id, now(), now())
    return write(id)
  })
  // Resolve elsewhere: the capture becomes a task, and remembers it did.
  // `plain`: words the box was told to keep as plain text ("tomorrow", "p1"),
  // by where they sit in its first line, with the words, so a name read a
  // little differently here still finds them.
  // A capture written as a list ("camping:" and its lines, a checklist) makes
  // a task a line, its indented lines their steps, the same as quick
  // capture's Create (main/day-lines.ts docList); `whole` keeps it one task,
  // as the box says when a tag makes the task. A page of mixed lines makes
  // nothing: it is given back to be sorted.
  handle('toTask', (id: string, plain?: { from: number; to: number; text: string }[], whole?: boolean) => {
    const capture = db.prepare(`select ${LABEL} as title, status, kind, body from captures where id = ?`).get(id) as { title: string; status: string; kind: string; body: string | null } | undefined
    if (!capture) return null
    // From the inbox only: a capture that took another exit keeps it.
    if (capture.status !== 'open') return 'not-open'
    let doc: unknown = null
    try { doc = JSON.parse(capture.body ?? 'null') } catch { /* Markdown or nothing: one task */ }
    const shaped = whole ? null : docList(doc, capture.kind === 'todo')
    if (shaped?.mixed) return { mixed: shaped.text }
    // Made by a tag that says where its tasks land, and given no day of its own: that day.
    const land = (task: Made, title: string): void => {
      if (task.existed) return
      const tags = tagsIn(title)
      const lands = tags.length
        ? (db.prepare(`select lands from tag_meta where action = 1 and lands is not null and tag in (${tags.map(() => '?').join(',')})`).all(...tags) as { lands: string }[])
          .map((row) => Number(row.lands)).find((days) => Number.isInteger(days) && days >= 0 && days <= 365)
        : undefined
      if (lands !== undefined)
        db.prepare('update tasks set due_at = ?, all_day = 1 where id = ? and due_at is null and plan_for is null and recurrence is null')
          .run(dayjs().add(lands, 'day').hour(9).startOf('hour').toISOString(), task.id)
    }
    if (shaped) {
      const made = shaped.list.map((line) => {
        const task = addTask(line.text, id)
        if (!task.existed && line.steps.length) db.prepare('update tasks set subtasks = ? where id = ?').run(JSON.stringify(line.steps), task.id)
        if (!task.existed && line.done) db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(now(), task.id)
        land(task, line.text)
        return task
      })
      db.prepare("update captures set status = 'resolved' where id = ?").run(id)
      return write({ ...made[0], resolved: [id], also: made.slice(1).map(({ id, existed }) => ({ id, existed })), said: tasksSaid(shaped.list), steps: shaped.list.reduce((sum, line) => sum + line.steps.length, 0) })
    }
    const kept = (Array.isArray(plain) ? plain : []).flatMap((one) => {
      if (typeof one?.text !== 'string' || !one.text) return []
      const from = capture.title.slice(one.from, one.from + one.text.length) === one.text ? one.from : capture.title.indexOf(one.text)
      return from < 0 ? [] : [{ from, to: from + one.text.length }]
    })
    const task = addTask(capture.title, id, false, kept)
    land(task, capture.title)
    carryBody(task, id)
    db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    return write({ ...task, resolved: [id] })
  })

  // Not hidden until a later day, nor back from it today (Home has that one): a letter to future
  // you ("@1y") never turns up early as an old card or a hint.
  const SHOWN = "coalesce(snoozed_until, '') < date('now', 'localtime')"
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
         from captures where status = 'open' and archived_at is null and back_at is null and ${AGED} < ? and ${SHOWN} ${hidePrivate ? 'and 0' : ''}
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
      ? (db.prepare(`select id, capture_id as captureId, kind, tier, title, body from nuggets where mode = 'pushed' and tier not in ('question', 'goal', 'card') and suspended = 0 and archived_at is null and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
          order by coalesce(last_visited_at, '') limit 1`).get(ago(3)) as Record<string, string> | undefined)
      : undefined
    // Half the time, or always while there are few nuggets, an old capture
    // still open: the link you meant to read, the thing you meant to look up.
    // Never one a rot card showed in the last three days.
    const few = (db.prepare('select count(*) n from nuggets where suspended = 0').get() as { n: number }).n < 20
    // Fair by kind: a kind is drawn first, each with the same chance, and
    // then one of its captures, so three hundred bits do not crowd out the
    // dozen links and words. Within a kind, older and voted-up come first.
    const candidates = `from captures where status = 'open' and archived_at is null and coalesce(surfaced_at, '') < ? and ${SHOWN}
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
    const kept = `from nuggets where suspended = 0 and archived_at is null and mode != 'pushed' and tier not in ('question', 'goal', 'card') and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0`
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
  handle('random', () => db.prepare("select id, kind, title, body from nuggets where archived_at is null and superseded_by is null and private = 0 and tier not in ('question', 'goal', 'card') order by random() limit 2").all().map(body))
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
  // `line`: one still called the “Untitled” it began with shows its first line in lists instead.
  const ITEM = `id, tier, kind, coalesce(nullif(title, ''), label('', body)) as title, case when trim(title) = 'Untitled' then label('', body) end as line, prompt, private, pinned_at as pinnedAt, due_at as dueAt, suspended,
    state is not null as reviewed, created_at as createdAt, updated_at as updatedAt, capture_id as captureId, remind_at as remindAt,
    (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) as lapses, attribution, medium, context, mode, superseded_by as supersededBy, archived_at as archivedAt, revisions, why,
    closed_at as closedAt, closed_how as closedHow, passage, (select count(*) from glosses where item_id = nuggets.id) as clues,
    goal_at as goalAt, goal_from as goalFrom, goal_beacon as beacon, goal_color as goalColor, (select max(created_at) from glosses where item_id = nuggets.id) as lastLog, line_of as lineOf, starred_at as starredAt, fields, unsorted`
  handle('items', (tier: string) =>
    db.prepare(`select ${ITEM} from nuggets where tier = ? and binned_at is null order by created_at desc`).all(tier)
  )

  // --- the weekly digest: the seven days to now, caught, kept, reviewed and finished. Nothing leaves the Mac.
  const digest = (from = ago(7)): { caught: number; kept: number; reviewed: number; finished: number; from: string } => {
    const n = (sql: string): number => (db.prepare(sql).get(from) as { n: number }).n
    return {
      caught: n('select count(*) n from captures where captured_at >= ?'),
      kept: n("select count(*) n from nuggets where created_at >= ? and tier in ('nugget', 'article')"),
      reviewed: n('select count(*) n from review_log where reviewed_at >= ?'),
      finished: n('select count(*) n from task_done where done_at >= ?'),
      from
    }
  }
  handle('digest:week', () => digest())

  // --- back after a long time away: when Vigil was last opened before this
  // start, read once, so the quiet first session lasts until the next start.
  const lastSeen = (db.prepare('select max(opened_at) as at from app_opens').get() as { at: string | null } | undefined)?.at ?? null
  let showAll = false
  handle('return:quiet', () => {
    const days = lastSeen ? Math.floor((Date.now() - Date.parse(lastSeen)) / 86_400_000) : 0
    return { days, quiet: !showAll && days >= Math.max(1, Number(settings().gapDays ?? 7)) }
  })
  handle('return:show-all', () => write((showAll = true)))

  // --- old captures put away on their own, once at the start of each day:
  // open, not pinned or waiting on a reminder, and untouched (neither written
  // nor edited, nor back from hiding, as a letter to future you comes back) for Settings' days. Each run is kept, so its Undo brings back
  // exactly what it moved and nothing archived by hand.
  db.exec('create table if not exists put_away (id text primary key, at text not null)')
  const putAwayOld = (): void => {
    const days = Number(settings().autoArchive ?? 0)
    const day = dayKey()
    // Never in the sandbox: its lived-in Inbox is there to be looked through.
    if (SANDBOX || !days || (db.prepare("select day from nudges where key = 'put-away'").get() as { day: string } | undefined)?.day === day) return
    db.prepare("insert or replace into nudges (key, day) values ('put-away', ?)").run(day)
    const ids = (db.prepare(`select id from captures where status = 'open' and archived_at is null and pinned_at is null and remind_at is null and max(${AGED}, coalesce(edited_at, ''), coalesce(snoozed_until, '')) < ?`).all(ago(days)) as { id: string }[]).map((row) => row.id)
    if (!ids.length) return
    const at = now()
    atomically(() => {
      for (const id of ids) {
        db.prepare("update captures set archived_at = ?, archived_was = json_object('pinned_at', pinned_at, 'remind_at', remind_at) where id = ?").run(at, id)
        db.prepare('insert or replace into put_away (id, at) values (?, ?)').run(id, at)
      }
    })
    changed()
  }
  // Once everything is set up (Archived's columns come later) and every quarter hour after; never in the way of starting.
  const tryPutAway = (): void => {
    try {
      putAwayOld()
    } catch (error) {
      console.error('Putting old captures away failed:', error)
    }
  }
  setTimeout(tryPutAway, 8_000)
  setInterval(tryPutAway, 15 * 60_000)
  // Chosen in Settings: the old ones go now, not at the next quarter hour.
  handle('putaway:now', () => tryPutAway())
  // Put away by hand: every open capture from before a day, into one folder
  // named for that day, in Archived and still found by search. Never sorted,
  // never deleted; Undo (putaway:undo with the run's time) brings them back.
  handle('putaway:before', (day: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { at: '', moved: 0, folder: '' }
    const folder = `Before ${dayjs(day).format('D MMMM YYYY')}`
    const ids = (db.prepare("select id from captures where status = 'open' and archived_at is null and pinned_at is null and remind_at is null and coalesce(snoozed_until, '') < ? and captured_at < ?")
      .all(dayKey(), dayjs(day).startOf('day').toISOString()) as { id: string }[]).map((row) => row.id)
    const at = now()
    atomically(() => {
      for (const id of ids) {
        db.prepare("update captures set archived_at = ?, archived_was = json_object('pinned_at', pinned_at, 'remind_at', remind_at) where id = ?").run(at, id)
        db.prepare('insert or replace into put_away (id, at, folder) values (?, ?, ?)').run(id, at, folder)
      }
    })
    return write({ at, moved: ids.length, folder })
  })
  // Today's run, if there was one: how many it moved, how many are still away, and after how many days.
  handle('putaway:today', () => {
    const last = db.prepare('select at, count(*) as n from put_away where at >= ? group by at order by at desc limit 1').get(dayjs().startOf('day').toISOString()) as { at: string; n: number } | undefined
    if (!last) return null
    const still = (db.prepare('select count(*) as n from put_away join captures using (id) where put_away.at = ? and captures.archived_at = ? and captures.status != \'discarded\'').get(last.at, last.at) as { n: number }).n
    return { at: last.at, moved: last.n, still, days: Number(settings().autoArchive ?? 0) }
  })
  // Undo: back in the Inbox, only those still archived by that run.
  handle('putaway:undo', (at: string) => write(atomically(() => {
    const back = db.prepare("update captures set archived_at = null, archived_was = null where archived_at = ? and id in (select id from put_away where at = ?)").run(String(at), String(at)).changes
    db.prepare('delete from put_away where at = ?').run(String(at))
    return back
  })))
  // The seven days before those, for what changed: the fourteen days to now, less the last seven.
  handle('digest:last', () => {
    const both = digest(ago(14))
    const week = digest()
    return { caught: both.caught - week.caught, kept: both.kept - week.kept, reviewed: both.reviewed - week.reviewed, finished: both.finished - week.finished }
  })
  // The same four for today alone, since midnight: Close the day's look back.
  handle('digest:day', () => digest(dayjs().startOf('day').toISOString()))
  // Sunday from six in the evening: the week, said once in a notification, unless quiet or off.
  setInterval(() => {
    const at = new Date()
    if (at.getDay() !== 0 || at.getHours() < 18 || settings().weeklyDigest === false || !Notification.isSupported()) return
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) return
    const day = dayKey()
    if ((db.prepare("select day from nudges where key = 'weekly-digest'").get() as { day: string } | undefined)?.day === day) return
    db.prepare("insert or replace into nudges (key, day) values ('weekly-digest', ?)").run(day)
    const week = digest()
    const note = new Notification({ title: `Your week in ${APP_NAME}`, body: `${num(week.caught)} caught, ${num(week.kept)} kept, ${num(week.reviewed)} reviewed, ${num(week.finished)} finished.`, silent: !settings().sounds })
    // Clicked, the week's mini wrap: a few cards of what it held.
    note.on('click', () => void ipcMain.emit('home:open', {}, 'wrap', `week:${dayKey(dayjs().startOf('week'))}`))
    note.show()
  }, 15 * 60_000)

  // --- the Bin: everything let go, of every kind, until it is restored or the Bin is emptied.
  // A capture discarded, a task closed without doing, and a gem, a piece of
  // writing, a question or a goal put in the Bin (archived too, so every list
  // that leaves out the archived leaves it out).
  column('nuggets', 'binned_at text')
  // `line`: a row with no name of its own (none, or the “Untitled” a new
  // article or question starts with) shows its first line of words instead.
  handle('bin:list', () => db.prepare(`select * from (
      select 'capture' as type, id, ${LABEL} as title, kind, coalesce(exited_at, captured_at) as at, null as line from captures where status = 'discarded'
      union all
      select 'task', id, title, 'todo', coalesce(completed_at, created_at), case when trim(title) in ('', 'Untitled') then label('', notes) end from tasks where status = 'dropped'
      union all
      select tier, id, coalesce(nullif(title, ''), label('', body)), kind, binned_at, case when trim(title) = 'Untitled' then label('', body) end from nuggets where binned_at is not null
    ) order by at desc limit 1000`).all().concat(eventsInBin(), practicesInBin()).sort((a, b) => String((b as { at: string }).at).localeCompare(String((a as { at: string }).at))))
  // One thing in the Bin, to look inside before it is restored or deleted:
  // its words whole, its tags, its kind, and when it was made and binned.
  // Read only: nothing here counts as opening it.
  handle('bin:peek', (type: string, id: string) => {
    // An event, a calendar or a practice: what it was set for, said a line each, its notes as its words.
    const facts: string[] = []
    if (type === 'event') {
      const one = db.prepare('select e.title, e.notes, e.start_at as startAt, e.end_at as endAt, e.all_day as allDay, e.place, e.people, e.repeat, e.created_at as madeAt, e.binned_at as binnedAt, c.name as calendar from events e left join calendars c on c.id = e.calendar_id where e.id = ?').get(id) as
        { title: string; notes: string | null; startAt: string; endAt: string; allDay: number; place: string | null; people: string | null; repeat: string | null; madeAt: string; binnedAt: string | null; calendar: string | null } | undefined
      if (!one) return null
      const day = dayjs(one.startAt)
      facts.push(one.allDay ? `${day.format('dddd D MMMM YYYY')}, all day` : `${day.format('dddd D MMMM YYYY')}, ${clock(one.startAt)} to ${clock(one.endAt)}`)
      if (one.repeat) facts.push('Repeats')
      if (one.place) facts.push(`At ${one.place}`)
      let people: string[] = []
      try { people = (JSON.parse(one.people ?? '[]') as string[]).filter(Boolean) } catch { /* none */ }
      if (people.length) facts.push(`With ${people.join(', ')}`)
      if (one.calendar) facts.push(`In the ${one.calendar} calendar`)
      let doc: unknown = one.notes
      try { doc = JSON.parse(one.notes ?? 'null') } catch { /* plain words */ }
      return { type, id, title: one.title, kind: 'event', body: doc, private: false, madeAt: one.madeAt, binnedAt: one.binnedAt, attribution: null, tags: tagsIn(`${one.title} ${plain(doc)}`), facts }
    }
    if (type === 'calendar') {
      const one = db.prepare('select name, created_at as madeAt, binned_at as binnedAt, (select count(*) from events where calendar_id = calendars.id and series_id is null) as n from calendars where id = ?').get(id) as { name: string; madeAt: string; binnedAt: string | null; n: number } | undefined
      if (!one) return null
      facts.push(`${num(one.n)} ${one.n === 1 ? 'event' : 'events'} in it, in the Bin with it`)
      return { type, id, title: one.name, kind: 'calendar', body: null, private: false, madeAt: one.madeAt, binnedAt: one.binnedAt, attribution: null, tags: [], facts }
    }
    if (type === 'practice') {
      const one = db.prepare('select name, days, at, target_min as minutes, load, last_note as note, created_at as madeAt, binned_at as binnedAt from practices where id = ?').get(id) as { name: string; days: string; at: string; minutes: number; load: string | null; note: string | null; madeAt: string; binnedAt: string | null } | undefined
      if (!one) return null
      let days: number[] = []
      try { days = JSON.parse(one.days) as number[] } catch { /* every day */ }
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      facts.push(`${days.length === 7 || !days.length ? 'Every day' : days.map((day) => names[day]).join(', ')} at ${one.at}, ${num(one.minutes)} minutes`)
      if (one.load) facts.push(`Working on ${one.load}`)
      return { type, id, title: one.name, kind: 'practice', body: one.note ?? null, private: false, madeAt: one.madeAt, binnedAt: one.binnedAt, attribution: null, tags: tagsIn(one.name), facts }
    }
    const row = (type === 'capture'
      ? db.prepare(`select ${LABEL} as title, kind, body, private, captured_at as madeAt, exited_at as binnedAt, attribution from captures where id = ?`).get(id)
      : type === 'task'
        ? db.prepare("select title, 'todo' as kind, notes as body, 0 as private, created_at as madeAt, completed_at as binnedAt, null as attribution from tasks where id = ?").get(id)
        : db.prepare("select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, kind, body, private, created_at as madeAt, binned_at as binnedAt, attribution from nuggets where id = ?").get(id)) as
      { title: string; kind: string; body: string | null; private: number; madeAt: string; binnedAt: string | null; attribution: string | null } | undefined
    if (!row) return null
    let doc: unknown = row.body
    try { doc = JSON.parse(row.body ?? 'null') } catch { /* Markdown, as it is */ }
    return { type, id, title: row.title ?? '', kind: row.kind, body: doc, private: !!row.private, madeAt: row.madeAt, binnedAt: row.binnedAt, attribution: row.attribution, tags: tagsIn(`${row.title ?? ''} ${plain(doc)}`), facts }
  })
  // What it was before the Bin (pinned, already archived), so taking it out puts both back.
  column('nuggets', 'binned_was text')
  // The exact words a gem was lifted from, as selected, so its card can show them and find them in the note.
  column('nuggets', 'passage text')
  // Brought in from Apple Notes or Obsidian and not yet kept, tagged, moved or binned (note-imports.ts).
  column('nuggets', 'unsorted integer not null default 0')
  // A goal in the Bin takes its desktop card with it at once.
  handle('bin:put', (id: string) => {
    // A calendar event goes by the same door (events.ts).
    if (eventToBin(id)) return write(true)
    if (practiceToBin(id)) return write(true)
    const done = write(db.prepare("update nuggets set binned_at = ?, binned_was = json_object('pinned_at', pinned_at, 'archived_at', archived_at), archived_at = coalesce(archived_at, ?), pinned_at = null where id = ?").run(now(), now(), id))
    goalsTold()
    return done
  })
  handle('bin:restore', (type: string, id: string) => {
    if (type === 'capture') db.prepare("update captures set status = coalesce(binned_was, 'open'), binned_was = null where id = ? and status = 'discarded'").run(id)
    else if (type === 'task') db.prepare("update tasks set status = 'open', completed_at = null where id = ? and status = 'dropped'").run(id)
    else if (type === 'event' || type === 'calendar') eventFromBin(id)
    else if (type === 'practice') practiceFromBin(id)
    else db.prepare("update nuggets set binned_at = null, archived_at = json_extract(binned_was, '$.archived_at'), pinned_at = coalesce(pinned_at, json_extract(binned_was, '$.pinned_at')), binned_was = null where id = ?").run(id)
    if (type !== 'capture' && type !== 'task') goalsTold()
    return write(true)
  })
  // For good: what is in the Bin, and what hangs off it.
  // One thing in the Bin let go for good, the way emptying lets them all go;
  // only one that is in the Bin, never anything still in use.
  handle('bin:forget', (type: string, id: string) => {
    if (type === 'event' || type === 'calendar') return write(forgetEvents(id) > 0)
    if (type === 'practice') return write(forgetPractices(id) > 0)
    const gone = atomically(() => {
      const there = type === 'capture' ? db.prepare("select 1 from captures where id = ? and status = 'discarded'").get(id)
        : type === 'task' ? db.prepare("select 1 from tasks where id = ? and status = 'dropped'").get(id)
          : db.prepare('select 1 from nuggets where id = ? and binned_at is not null').get(id)
      if (!there) return 0
      if (type === 'task') {
        for (const table of ['task_links', 'task_done']) db.prepare(`delete from ${table} where task_id = ?`).run(id)
        db.prepare('delete from tasks where id = ?').run(id)
        return 1
      }
      db.prepare('delete from glosses where item_id = ?').run(id)
      db.prepare('delete from task_links where item_id = ?').run(id)
      db.prepare(`delete from ${type === 'capture' ? 'captures' : 'nuggets'} where id = ?`).run(id)
      return 1
    })
    return write(gone > 0)
  })
  handle('bin:empty', () => {
    const gone = atomically(() => {
      const captures = (db.prepare("select id from captures where status = 'discarded'").all() as { id: string }[]).map((row) => row.id)
      const tasks = (db.prepare("select id from tasks where status = 'dropped'").all() as { id: string }[]).map((row) => row.id)
      const items = (db.prepare('select id from nuggets where binned_at is not null').all() as { id: string }[]).map((row) => row.id)
      for (const id of [...captures, ...items]) {
        db.prepare('delete from glosses where item_id = ?').run(id)
        db.prepare('delete from task_links where item_id = ?').run(id)
      }
      for (const id of captures) db.prepare('delete from captures where id = ?').run(id)
      for (const id of items) db.prepare('delete from nuggets where id = ?').run(id)
      for (const id of tasks) for (const table of ['task_links', 'task_done']) db.prepare(`delete from ${table} where task_id = ?`).run(id)
      for (const id of tasks) db.prepare('delete from tasks where id = ?').run(id)
      return captures.length + tasks.length + items.length + forgetEvents() + forgetPractices()
    })
    return write(gone)
  })
  handle('item', (id: string) => {
    // Its own title, not the name lists give it: an untitled article's title
    // box stays empty rather than showing its first line as if it were set.
    // Whether it is in the Bin too: a sticky of it says so and comes down (sticky-note.tsx).
    const row = db.prepare(`select ${ITEM}, title as own, body, origins, binned_at as binnedAt from nuggets where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const glosses = db.prepare(`select id, body, author, created_at as createdAt, source_id as sourceId,
      (select 'V-' || number from captures where id = glosses.source_id) as sourceKey from glosses where item_id = ? order by created_at`).all(id)
    return { ...body(row), title: row.own, origins: JSON.parse((row.origins as string) ?? '[]'), glosses }
  })
  handle('item:save', (id: string, patch: { body?: unknown; base?: unknown; title?: string; prompt?: string | null; kind?: string; suspended?: boolean; attribution?: string | null; medium?: string | null; context?: string | null; mode?: string; why?: string | null }) => {
    // Words written since this editor last looked are never written over: it
    // is told what is there now, as a capture's editor is.
    const moved = patch.body !== undefined && patch.base !== undefined ? movedOn('nuggets', id, patch.base) : null
    if (moved) patch = { ...patch, body: undefined }
    const allowed = ['body', 'title', 'prompt', 'kind', 'suspended', 'attribution', 'medium', 'context', 'mode', 'why']
    const sets = Object.entries(patch).filter(([key, value]) => value !== undefined && allowed.includes(key))
    // A meaningful change to something you are tested on brings it back sooner,
    // a 30% cut to what is left of its interval, never a reset: fixing a
    // sentence should not cost months. Once per review, not once per save, or
    // typing would shrink it to nothing. "Meaningful" is more than a few
    // letters: what differs once the shared start and end are taken off.
    const before = db.prepare("select body, prompt, state, due_at, edited_since_review, updated_at, coalesce(nullif(title, ''), label('', body)) as name from nuggets where id = ?").get(id) as
      { body: string; prompt: string | null; state: string | null; due_at: string | null; edited_since_review: number; updated_at: string | null; name: string } | undefined
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
    // A tag written in sorts an imported note: it has a place now.
    if (patch.body !== undefined && !moved && before) {
      const had = new Set(tagsIn(plain(JSON.parse(before.body ?? 'null'))))
      if (tagsIn(plain(patch.body)).some((tag) => !had.has(tag))) db.prepare('update nuggets set unsorted = 0 where id = ? and unsorted = 1').run(id)
    }
    // #bit written in makes it private, once, as it would a capture.
    if (patch.body !== undefined && !moved && hasTag(JSON.stringify(patch.body), 'bit') && !hasTag(before?.body, 'bit'))
      db.prepare('update nuggets set private = 1 where id = ?').run(id)
    // Its "question :: answer" lines kept as cards; a card's own body is only its answer.
    if (patch.body !== undefined && !moved) {
      const own = db.prepare('select tier, private from nuggets where id = ?').get(id) as { tier: string; private: number } | undefined
      if (own && own.tier !== 'card') syncLineCards(`nugget:${id}`, patch.body, own.private)
    }
    // Renamed: once the new name rests, every link to it says it (renames.ts).
    if (before && (patch.body !== undefined || patch.title !== undefined)) watchName(linkOf('nuggets', id), before.name ?? '')
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
  handle('nugget:from', (text: string, origin: { captureId?: string; attribution?: string | null; passage?: string | null }) => {
    const id = randomUUID()
    const attribution = origin.attribution ?? (origin.captureId ? (db.prepare('select attribution from captures where id = ?').get(origin.captureId) as { attribution: string | null } | undefined)?.attribution : null)
    db.prepare("insert into nuggets (id, capture_id, kind, title, body, attribution, passage, created_at, updated_at) values (?, ?, 'note', ?, ?, ?, ?, ?, ?)")
      .run(id, origin.captureId ?? null, cut(text.split('\n')[0], 160), JSON.stringify(text), attribution ?? null, origin.passage?.trim() || null, now(), now())
    // A long quote (what was an excerpt) is a container: once something is
    // pulled out of it, it has done its job. A short one is the line itself.
    if (origin.captureId) db.prepare("update captures set status = 'promoted' where id = ? and kind = 'quote' and status = 'open' and (kind_was = 'excerpt' or length(words(id, body)) > 600)").run(origin.captureId)
    return write(id)
  })
  // Taken back straight after: words lifted out of a note as a capture or an
  // idea (Undo on its toast). Called only with what that lift just made; a
  // nugget must still be a plain one to go.
  handle('lifted:undo', (type: 'capture' | 'nugget', id: string) => {
    if (type === 'capture') db.prepare('delete from captures where id = ?').run(id)
    else {
      const row = db.prepare("select capture_id from nuggets where id = ? and tier = 'nugget'").get(id) as { capture_id: string | null } | undefined
      if (!row) return write(false)
      db.prepare('delete from glosses where item_id = ?').run(id)
      db.prepare('delete from nuggets where id = ?').run(id)
      // A long quote marked done by this lift is open again, unless another idea came from it.
      if (row.capture_id && !db.prepare('select 1 from nuggets where capture_id = ?').get(row.capture_id))
        db.prepare("update captures set status = 'open' where id = ? and kind = 'quote' and status = 'promoted'").run(row.capture_id)
    }
    return write(true)
  })
  // Wrong, and corrected: the correction becomes its own nugget, the wrong one
  // leaves review at once and points to it. Nothing is deleted: the wrong
  // version beside the right one teaches more than either alone.
  handle('supersede', (id: string, truth: string) => {
    const old = db.prepare('select kind, attribution, medium, private from nuggets where id = ?').get(id) as { kind: string; attribution: string | null; medium: string | null; private: number }
    const fixed = randomUUID()
    db.prepare('insert into nuggets (id, kind, title, body, attribution, medium, private, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(fixed, old.kind, cut(truth.split('\n')[0], 160), JSON.stringify(truth), old.attribution, old.medium, old.private, now(), now())
    db.prepare('update nuggets set superseded_by = ?, suspended = 1 where id = ?').run(fixed, id)
    return write(fixed)
  })
  // A correction taken back with Undo: the new gem goes, and the old one is as it was, in review if it was.
  handle('unsupersede', (id: string, fixed: string, suspended: boolean) => {
    atomically(() => {
      db.prepare('delete from glosses where item_id = ?').run(fixed)
      db.prepare('delete from nuggets where id = ?').run(fixed)
      db.prepare('update nuggets set superseded_by = null, suspended = ? where id = ? and superseded_by = ?').run(suspended ? 1 : 0, id, fixed)
    })
    return write(true)
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
  // The weather now, for the line under Today's title: only when the weather
  // setting is on, and nothing at all when offline.
  handle('weather:now', () => (settings().weather ? weatherNow() : null))
  // Asked once as the app starts, so Today's line has it the first time it is drawn: asked
  // only then, the internet's answer came a second after the page and the line changed under you.
  setTimeout(() => void (settings().weather && weatherNow()), 0)
  // Reworded from the composer's history: the same row, its words put right.
  handle('gloss:edit', (gloss: string, text: string) => {
    const words = String(text ?? '').trim()
    if (!words) return write(false)
    return write(db.prepare('update glosses set body = ? where id = ?').run(words, gloss).changes > 0)
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
      .run(id, cut((title || from?.title || 'Untitled').trim(), 300), captureId ?? null, from?.private ?? 0, now(), now())
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
  // A log or clue deleted, kept whole for its undo: gives back the row it was.
  handle('clue:cut', (clue: string) => {
    const row = db.prepare('select id, item_id, body, created_at, source_id from glosses where id = ?').get(clue) as Record<string, string | null> | undefined
    if (!row) return write(null)
    if (row.source_id) db.prepare("update captures set status = 'open' where id = ?").run(row.source_id)
    db.prepare('delete from glosses where id = ?').run(clue)
    return write(row)
  })
  // ...and put back as it was: its own id and day, and the capture it came from taken out of the inbox again.
  handle('clue:put', (row: { id: string; item_id: string; body: string; created_at: string; source_id: string | null }) => {
    if (!row?.id || !row.item_id) return write(false)
    db.prepare('insert or ignore into glosses (id, item_id, body, created_at, source_id) values (?, ?, ?, ?, ?)').run(row.id, row.item_id, row.body, row.created_at, row.source_id ?? null)
    if (row.source_id) db.prepare("update captures set status = 'promoted' where id = ?").run(row.source_id)
    return write(true)
  })
  // Got it: an article seeded with the question, what you wrote in it and
  // every clue, oldest first so it reads as it happened, made from the
  // question so each points at the other. Or let go, with no article.
  // `again` is an undo putting back how it was settled: no second article.
  // `at`: an undo of a reopen, settled again on the day it first was.
  handle('question:close', (id: string, how: 'answered' | 'let go', again = false, at?: string | null) => {
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
    db.prepare('update nuggets set closed_at = ?, closed_how = ? where id = ?').run(again && at ? at : now(), how, id)
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
    db.prepare("insert into nuggets (id, tier, kind, title, body, why, goal_at, goal_from, goal_color, created_at, updated_at) values (?, 'goal', 'note', ?, 'null', ?, ?, ?, ?, ?, ?)")
      .run(id, cut(String(title ?? '').trim(), 300) || 'Untitled', why?.trim() || null, target, start > target ? target : start, freeGoalColor(), now(), now())
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
  // `at`: an undo of a reopen, settled again on the day it first was.
  handle('goal:close', (id: string, how: 'made it' | 'missed' | 'let go', at?: string | null) => {
    if (!['made it', 'missed', 'let go'].includes(how)) return null
    const done = db.prepare("update nuggets set closed_at = ?, closed_how = ? where id = ? and tier = 'goal'").run(at || now(), how, id).changes > 0
    goalsTold()
    return write(done)
  })
  handle('goal:reopen', (id: string) => {
    const done = db.prepare("update nuggets set closed_at = null, closed_how = null where id = ? and tier = 'goal'").run(id).changes > 0
    goalsTold()
    return write(done)
  })
  // Its colour, one of GOAL_COLORS.
  handle('goal:color:set', (id: string, color: string) => {
    if (!GOAL_COLORS.includes(color)) return write(false)
    const done = db.prepare("update nuggets set goal_color = ? where id = ? and tier = 'goal'").run(color, id).changes > 0
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
    const tagRule = tagRules()
    // Everything tested, so a card with an exam ahead can be called in for the
    // last look even when its own schedule would wait past the date.
    const tested = (db
      .prepare(`select ${ITEM}, body, state, (select body from glosses where item_id = nuggets.id and author = 'user' order by created_at desc limit 1) as gloss
        from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null`)
      .all() as Record<string, unknown>[])
      .map((row) => ({ row, exam: exam(row) }))
      // A paused tag's cards wait; a maintained tag's keep coming, but no new ones start.
      .filter((one) => {
        const rule = tagRule(one.row)
        return rule !== 'paused' && (!!one.row.state || rule !== 'maintaining')
      })
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
    keepForUndo(id, null)
    const tomorrow = new Date(startOfDay(1)).toISOString()
    return write(db.prepare('update nuggets set due_at = ? where id = ?').run(tomorrow, id))
  })
  // The last grade or Not today, kept so ⌘Z in Review can take it back: one
  // step, the way Anki's undo works. The card's schedule as it was, and the
  // review that was logged for it.
  let lastGrade: { id: string; state: string | null; due: string | null; edited: number; log: number | bigint | null } | null = null
  const keepForUndo = (id: string, log: number | bigint | null, was?: { state: string | null; due_at: string | null; edited_since_review: number }): void => {
    const row = was ?? (db.prepare('select state, due_at, edited_since_review from nuggets where id = ?').get(id) as { state: string | null; due_at: string | null; edited_since_review: number } | undefined)
    lastGrade = row ? { id, state: row.state, due: row.due_at, edited: row.edited_since_review, log } : null
  }
  handle('review:ungrade', (id: string) => {
    const was = lastGrade
    if (!was || was.id !== id) return false
    lastGrade = null
    db.prepare('update nuggets set state = ?, due_at = ?, edited_since_review = ? where id = ?').run(was.state, was.due, was.edited, id)
    if (was.log !== null) db.prepare('delete from review_log where rowid = ?').run(was.log)
    return write(true)
  })
  // The same cards a session would start with, exam sweep and limits included.
  handle('review:counts', () => reviewQueue().length)
  // Only a graded review moves a schedule: not opening, not searching.
  handle('review:grade', (id: string, grade: Grade, ms: number) => {
    const row = db.prepare(`select ${ITEM}, body, state from nuggets where id = ?`).get(id) as Record<string, unknown> & { state: string | null }
    const before = db.prepare('select state, due_at, edited_since_review from nuggets where id = ?').get(id) as { state: string | null; due_at: string | null; edited_since_review: number }
    const { card } = scheduler().next(cardOf(row.state), new Date(), grade)
    // The card keeps its own schedule; only the day it is asked for is
    // brought inside an exam's date.
    const due = capped(card.due, examOf()(row))
    db.prepare('update nuggets set state = ?, due_at = ?, edited_since_review = 0 where id = ?').run(JSON.stringify(card), due.toISOString(), id)
    const logged = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)').run(id, grade, now(), ms, row.state ? 0 : 1)
    keepForUndo(id, logged.lastInsertRowid, before)
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
    // A card written in a note comes from the note it is written in.
    const line = (db.prepare('select line_of from nuggets where id = ?').get(id) as { line_of: string | null } | undefined)?.line_of
    if (line) return lineSource(line)
    const capture = db.prepare(`select 'capture' as type, c.id, label(c.title, c.body) as title, c.body from captures c join nuggets n on n.capture_id = c.id where n.id = ?`).get(id) as Record<string, unknown> | undefined
    if (capture) return body(capture)
    const origin = (JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])[0]
    const nugget = origin && (db.prepare('select tier as type, id, title, body from nuggets where id = ?').get(origin) as Record<string, unknown> | undefined)
    return nugget ? body(nugget) : null
  })

  // --- a tag's priority in Review: the strongest rule among a card's tags, paused over maintaining
  const tagRules = (): ((row: Record<string, unknown>) => 'paused' | 'maintaining' | null) => {
    const rules = new Map((db.prepare('select tag, priority from tag_meta where priority is not null').all() as { tag: string; priority: 'paused' | 'maintaining' }[]).map((one) => [one.tag, one.priority]))
    return (row) => (rules.size ? ruleOf(rules, row) : null)
  }
  const ruleOf = (rules: Map<string, 'paused' | 'maintaining'>, row: Record<string, unknown>): 'paused' | 'maintaining' | null => {
    const words = typeof row.body === 'string' ? JSON.parse(row.body ?? 'null') : row.body
    const found = tagsIn(`${row.title ?? ''} ${row.prompt ?? ''} ${plain(words)}`).map((tag) => rules.get(tag)).filter(Boolean)
    return found.includes('paused') ? 'paused' : found.includes('maintaining') ? 'maintaining' : null
  }

  // --- a star on a card (S in Review), and how Review decides when it comes back
  handle('review:star', (id: string, on: boolean) => write(db.prepare('update nuggets set starred_at = ? where id = ?').run(on ? now() : null, id).changes > 0))
  handle('review:why', (id: string) => {
    const row = db.prepare('select state from nuggets where id = ?').get(id) as { state: string | null } | undefined
    if (!row) return null
    const card = cardOf(row.state)
    const reviews = (db.prepare('select count(*) n from review_log where item_id = ?').get(id) as { n: number }).n
    return {
      retention: settings().retention,
      reviews,
      seen: !!row.state,
      stability: row.state ? card.stability : null,
      difficulty: row.state ? card.difficulty : null,
      recall: row.state ? scheduler().get_retrievability(card, new Date(), false) : null,
      lastDays: card.last_review ? (Date.now() - card.last_review.getTime()) / 86400000 : null,
      fitted: !!settings().fsrsFirst
    }
  })
  // A card's own history as a line: how long it would hold after each review, replayed from its grades.
  handle('review:strength', (id: string) => {
    const log = db.prepare('select reviewed_at as at, grade from review_log where item_id = ? order by reviewed_at').all(id) as { at: string; grade: number }[]
    const run = scheduler()
    let card = createEmptyCard(log[0] ? new Date(log[0].at) : new Date())
    return log.map(({ at, grade }) => {
      card = run.next(card, new Date(at), grade as Grade).card
      return { at, grade, days: Math.round(card.stability * 10) / 10 }
    })
  })

  // --- days in a row with something reviewed, rest days banked (study.ts)
  handle('review:days', () => {
    const days = (db.prepare("select distinct date(reviewed_at, 'localtime') as day from review_log").all() as { day: string }[]).map((one) => one.day)
    return daysInARow(days, dayKey())
  })

  // --- fit the scheduler to you: after a thousand reviews, how long a new
  // card lasts after each first grade, from when you next remembered it or not.
  const FIT_AFTER = 1000
  handle('review:fit:state', () => ({ reviews: (db.prepare('select count(*) n from review_log').get() as { n: number }).n, after: FIT_AFTER, fitted: settings().fsrsFirst }))
  handle('review:fit', () => {
    const total = (db.prepare('select count(*) n from review_log').get() as { n: number }).n
    if (total < FIT_AFTER) return null
    const rows = db.prepare(`select item_id as id, grade, reviewed_at as at from review_log order by item_id, reviewed_at`).all() as { id: string; grade: number; at: string }[]
    const pairs: { first: number; days: number; recalled: boolean }[] = []
    for (let i = 0; i + 1 < rows.length; i++) {
      if (rows[i].id !== rows[i + 1].id || (i > 0 && rows[i - 1].id === rows[i].id)) continue
      pairs.push({ first: rows[i].grade, days: (new Date(rows[i + 1].at).getTime() - new Date(rows[i].at).getTime()) / 86400000, recalled: rows[i + 1].grade > 1 })
    }
    const fitted = fitFirstDays(pairs, [...default_w.slice(0, 4)], (t, s) => forgetting_curve([...default_w], t, s))
    db.prepare('insert or replace into settings (key, value) values (?, ?)').run('fsrsFirst', JSON.stringify(fitted))
    return write({ fitted, pairs: pairs.length, defaults: [...default_w.slice(0, 4)] })
  })

  // --- a pasted list of "term - meaning" lines, made into cards at once
  handle('cards:list', (pairs: { term: string; meaning: string }[]) => {
    const ids = (pairs ?? []).filter((one) => one.term?.trim() && one.meaning?.trim()).map(({ term, meaning }) => {
      const id = randomUUID()
      db.prepare("insert into nuggets (id, kind, title, body, prompt, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?)")
        .run(id, cut(term.trim(), 160), JSON.stringify(meaning.trim()), term.trim(), now(), now())
      return id
    })
    return write(ids)
  })
  handle('cards:list:undo', (ids: string[]) => {
    for (const id of ids ?? []) db.prepare("delete from nuggets where id = ? and tier = 'nugget' and state is null").run(id)
    return write(true)
  })

  // --- practise a tag without counting: its cards, in order, nothing scheduled
  handle('tag:cards', (tag: string) => {
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    return (db.prepare(`select ${ITEM}, body from nuggets where coalesce(prompt, '') != '' and archived_at is null and superseded_by is null order by created_at`).all() as Record<string, unknown>[])
      .filter((row) => tagsIn(`${row.title ?? ''} ${row.prompt ?? ''} ${plain(JSON.parse((row.body as string) ?? 'null'))}`).some((one) => (alias.get(one) ?? one) === tag))
      .map(body)
  })

  // --- cards written in notes: the note a card lives in, as a source to open or reread
  const lineSource = (line: string): Record<string, unknown> | null => {
    const [type, key] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]
    const row = type === 'day'
      ? (db.prepare("select 'day' as type, day as id, day as title, body from day_pages where day = ?").get(key) as Record<string, unknown> | undefined)
      : type === 'capture'
        ? (db.prepare(`select 'capture' as type, id, ${LABEL} as title, body from captures where id = ?`).get(key) as Record<string, unknown> | undefined)
        : (db.prepare("select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, body from nuggets where id = ?").get(key) as Record<string, unknown> | undefined)
    return row ? body(row) : null
  }

  // --- practice by focus: a short extra round of one kind of card, drawn
  // from all your gems, on top of the day's queue. Only a grade moves a
  // schedule: opening a round, or skipping a card in it, leaves every due date alone.
  const practice = (): { row: Record<string, unknown>; bucket: Bucket; recall: number; since: number }[] => {
    const { retention } = settings()
    const risk = scheduler()
    const rows = db.prepare(`select ${ITEM}, body, state, (select grade from review_log where item_id = nuggets.id order by reviewed_at desc limit 1) as last,
        (select body from glosses where item_id = nuggets.id and author = 'user' order by created_at desc limit 1) as gloss
      from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and superseded_by is null`).all() as Record<string, unknown>[]
    return rows.map((row) => {
      const card = row.state ? cardOf(row.state as string) : null
      const recall = card ? risk.get_retrievability(card, new Date(), false) : 0
      const since = card?.last_review ? (Date.now() - card.last_review.getTime()) / 86400000 : Infinity
      return { row, recall, since, bucket: bucketOf({ seen: !!card, last: (row.last as number | null) ?? null, lapses: Number(row.lapses), recall, daysSince: since }, retention) }
    })
  }
  handle('review:buckets', () => {
    const counts: Record<Bucket | 'starred', number> = { weak: 0, learning: 0, old: 0, fresh: 0, new: 0, starred: 0 }
    for (const one of practice()) {
      counts[one.bucket]++
      if (one.row.starredAt) counts.starred++
    }
    return counts
  })
  type Practised = ReturnType<typeof practice>[number]
  // Each round's order: the most missed, the least sure, the longest
  // untouched, the least sure of the known, the oldest new.
  const ROUND_ORDER: Record<Bucket, (a: Practised, b: Practised) => number> = {
    weak: (a, b) => Number(b.row.lapses) - Number(a.row.lapses) || a.recall - b.recall,
    learning: (a, b) => a.recall - b.recall,
    old: (a, b) => b.since - a.since,
    fresh: (a, b) => a.recall - b.recall,
    new: (a, b) => String(a.row.createdAt).localeCompare(String(b.row.createdAt))
  }
  const ROUND = 10
  handle('review:round', (bucket: Bucket | 'starred') => {
    if (bucket !== 'starred' && !ROUND_ORDER[bucket]) return []
    const exam = examOf()
    const mine = bucket === 'starred'
      ? practice().filter((one) => one.row.starredAt).sort((a, b) => String(b.row.starredAt).localeCompare(String(a.row.starredAt)))
      : practice().filter((one) => one.bucket === bucket).sort(ROUND_ORDER[bucket])
    return mine.slice(0, ROUND).map(({ row }) => ({
      ...body(row), state: undefined, exam: exam(row)?.tag ?? null, intervals: preview(row.state as string | null, (when) => capped(when, exam(row)))
    }))
  })

  // --- slipping: a gem missed again and again is usually asking the wrong
  // thing. Review offers to rewrite it, split it or set it aside; these are
  // the ones that have slipped, set aside or not.
  handle('review:slipping', () =>
    db.prepare(`select ${ITEM} from nuggets where coalesce(prompt, '') != '' and archived_at is null and superseded_by is null
      and (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) >= ? order by lapses desc, created_at`).all(LEECH_AT))
  // Split: this card asks something narrower (its own answer unchanged), and
  // the rest becomes a new card, carrying the same tags and pointing back here.
  handle('review:split', (id: string, narrower: string, question: string, answer: string) => {
    const old = db.prepare('select title, body, prompt, attribution, private from nuggets where id = ?').get(id) as
      { title: string; body: string; prompt: string | null; attribution: string | null; private: number } | undefined
    if (!old || !String(question ?? '').trim() || !String(answer ?? '').trim()) return write(null)
    const was = old.prompt
    if (narrower?.trim() && narrower.trim() !== old.prompt) db.prepare('update nuggets set prompt = ?, updated_at = ? where id = ?').run(narrower.trim(), now(), id)
    const tags = tagsIn(`${old.title} ${plain(JSON.parse(old.body ?? 'null'))}`)
    const words = [answer.trim(), tags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n')
    const fresh = randomUUID()
    db.prepare("insert into nuggets (id, kind, title, body, prompt, attribution, private, origins, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(fresh, cut(question.trim(), 160), JSON.stringify(words), question.trim(), old.attribution, old.private, JSON.stringify([id]), now(), now())
    return write({ fresh, was })
  })
  handle('review:unsplit', (id: string, fresh: string, was: string | null) => {
    db.prepare("delete from nuggets where id = ? and tier = 'nugget' and state is null").run(fresh)
    db.prepare('update nuggets set prompt = ? where id = ?').run(was, id)
    return write(true)
  })

  // --- blurting: everything you remember about a tag on a blank page, then
  // the tag's gems with the ones you left out lit. Those come up sooner in
  // Review (due now, if they were due later), and the blurt is kept on the day's page.
  handle('blurt:sooner', (ids: string[]) => {
    let moved = 0
    for (const id of ids ?? []) {
      const row = db.prepare("select due_at from nuggets where id = ? and coalesce(prompt, '') != '' and state is not null and suspended = 0").get(id) as { due_at: string | null } | undefined
      if (!row || (row.due_at && row.due_at <= now())) continue
      db.prepare('update nuggets set due_at = ? where id = ?').run(now(), id)
      moved++
    }
    return write(moved)
  })
  handle('blurt:keep', (tag: string, text: string, missed: string[]) => {
    const day = dayKey()
    const page = db.prepare('select body from day_pages where day = ?').get(day) as { body: string | null } | undefined
    let doc = JSON.parse(page?.body ?? 'null') as { type: string; content?: unknown[] } | string | null
    if (typeof doc === 'string') doc = { type: 'doc', content: doc.split('\n\n').map((one) => para(one)) }
    if (!doc?.content) doc = { type: 'doc', content: [] }
    const content = doc.content as { type: string; content?: unknown[] }[]
    // An empty first line is written over rather than left above the blurt.
    while (content.length && content[content.length - 1].type === 'paragraph' && !content[content.length - 1].content?.length) content.pop()
    const time = new Date().toTimeString().slice(0, 5)
    content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: `Blurt on #${tag}, ${time}` }] } as never)
    for (const line of String(text).split('\n').filter((one) => one.trim())) content.push(para(line))
    if (missed?.length) content.push(para(`Left out: ${missed.join('; ')}`))
    db.prepare(`insert into day_pages (day, body, reviewed, updated_at) values (?, ?, 0, ?)
      on conflict (day) do update set body = excluded.body, updated_at = excluded.updated_at`).run(day, JSON.stringify(doc), now())
    return write(day)
  })
  const para = (text: string): { type: string; content?: unknown[] } => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })

  // --- the deck that teaches Vigil: a tag of gems, each a question about
  // something the app does without showing it. Only ever added when asked.
  const learnCount = (): number => (db.prepare("select count(*) n from nuggets where body like ? and archived_at is null").get(`%#${LEARN_TAG}%`) as { n: number }).n
  // A card added before an answer was reworded takes the new words, if it still holds the old ones exactly.
  {
    const reword = db.prepare("update nuggets set body = ? where title = ? and body = ?")
    for (const { question, answer } of LEARN_DECK)
      for (const was of LEARN_EARLIER[question] ?? []) reword.run(JSON.stringify(`${answer}\n\n#${LEARN_TAG}`), question, JSON.stringify(`${was}\n\n#${LEARN_TAG}`))
  }
  handle('learn:count', learnCount)
  handle('learn:add', () => {
    if (learnCount()) return write(0)
    // The first one asked first: each a moment after the last, as the queue takes new cards oldest first.
    const start = Date.now()
    learnAdded = LEARN_DECK.map(({ question, answer }, at) => {
      const when = new Date(start + at * 1000).toISOString()
      const id = randomUUID()
      db.prepare("insert into nuggets (id, kind, title, body, prompt, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?)")
        .run(id, question, JSON.stringify(`${answer}\n\n#${LEARN_TAG}`), question, when, when)
      return id
    })
    return write(LEARN_DECK.length)
  })
  // The deck just added taken back with Undo: the cards it made, never one reviewed since.
  let learnAdded: string[] = []
  handle('learn:undo', () => {
    const ids = learnAdded
    learnAdded = []
    const gone = atomically(() => ids.filter((id) => db.prepare('delete from nuggets where id = ? and state is null').run(id).changes > 0).length)
    return write(gone)
  })

  // --- the review reminder, at the time set in Settings
  handle('review:reminder:now', () => remindNow())

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
      const weak = mine.filter((row) => row.state && struggling(row.last as number | null, Number(row.lapses))).length
      const solid = mine.filter((row) => row.state && !struggling(row.last as number | null, Number(row.lapses)) &&
        risk.get_retrievability(cardOf(row.state as string), new Date(Math.max(day, Date.now())), false) >= retention).length
      // Behind: reviews left from before today, and in the sweep, anything still unseen.
      const late = mine.filter((row) => row.state && row.dueAt && new Date(String(row.dueAt)).getTime() < startOfToday).length
      const behind = late + (Date.now() >= sweep ? unseen : 0)
      const days = Math.max(0, daysFromToday(day))
      // Paced like the queue: everything met by the sweep, then within the days left.
      const pace = Date.now() < sweep ? Math.ceil(dayjs(sweep).diff(dayjs(), 'day', true)) : days
      return { tag, at: new Date(day).toISOString(), days, total: mine.length, solid, learning: mine.length - unseen - weak - solid, struggling: weak, unseen, behind, perDay: Math.ceil((late + unseen) / Math.max(1, pace)) }
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
      const name = `${quoted(goal.title, 60)}`
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
          text: 'Deciding day: what you set aside waits for a keep or the Bin.' }
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
  // A book with no old captures at all (a new one) has nothing to have cleared: -1.
  handle('rot:left', () => {
    const ever = (db.prepare(`select count(*) n from captures where ${AGED} < ?`).get(ago(1)) as { n: number }).n
    return ever ? (db.prepare(`select count(*) n from captures where status = 'open' and archived_at is null and ${AGED} < ? and ${SHOWN}`).get(ago(1)) as { n: number }).n : -1
  })
  // How many rot cards would come up now: none in safe mode or quiet hours,
  // when the cards themselves hold back. For the box's "3 old" chip.
  handle('rot:waiting', () => {
    const { blackout, hidePrivate } = gate()
    return blackout || hidePrivate ? 0 : Math.min(settings().rotCount, (db.prepare(`select count(*) n from captures where status = 'open' and archived_at is null and ${AGED} < ? and ${SHOWN}`).get(ago(1)) as { n: number }).n)
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
    if (!isTagWord(tag)) return null
    // A capture, or a note in Writing being sorted (an import's), which a tag sorts.
    const table = db.prepare('select 1 from captures where id = ?').get(id) ? 'captures' : 'nuggets'
    const row = db.prepare(`select body from ${table} where id = ?`).get(id) as { body: string } | undefined
    if (!row) return null
    let doc = JSON.parse(row.body ?? 'null')
    const written = tagWritten(tag)
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
    if (table === 'nuggets') db.prepare(`update nuggets set body = ?, updated_at = ?${on ? ', unsorted = 0' : ''} where id = ?`).run(JSON.stringify(doc), now(), id)
    else db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(doc), id)
    return write(doc)
  })

  // --- the recap, Wrapped's way: a month or a year in what you did here
  // `from`: one week, month or year asked for by a day in it (a wrap offered for a month gone by, the Sunday digest's week).
  handle('recap', (period: 'week' | 'month' | 'year', from?: string) => {
    let start = dayjs(from && dayjs(from).isValid() ? from : undefined).startOf(period)
    let end = from && start.add(1, period).isBefore(dayjs()) ? start.add(1, period) : dayjs()
    let finished = !!from && !end.isBefore(start.add(1, period))
    // Early in a month there is little to say yet: the month before, whole,
    // if anything was caught in it; otherwise this month so far.
    if (!from && period === 'month' && end.date() < 7) {
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
      where body like '%#book%' and private = 0 and status != 'discarded' and coalesce(plain_tags, '') not like '%"book"%' and captured_at >= ? and captured_at < ? order by captured_at`).all(since, until) as { title: string; own: string | null; body: string | null; by: string | null; state: string | null }[])
      .filter((book) => hasTag(`${book.own ?? ''} ${book.body ?? ''}`, 'book'))
      .map((book) => ({ ...book, title: withoutTags(book.title).trim() }))
      .filter((book) => book.title && (book.state === 'Finished' || book.state === 'Reading'))
      .map((book) => ({ title: book.title, by: book.by, finished: book.state === 'Finished', lines: (lines.get(since, until, book.title) as { n: number }).n }))
    // What was caught, by kind, and the same for the span before it, for the
    // shape of it: counts only, so a private one counts here as everywhere.
    const byKind = db.prepare('select kind, count(*) n from captures where captured_at >= ? and captured_at < ? group by kind order by n desc')
    const before = start.subtract(1, period)
    const kindsBefore = byKind.all(before.toISOString(), start.toISOString()) as { kind: string; n: number }[]
    return {
      label: start.format(period === 'year' ? 'YYYY' : period === 'week' ? '[the week of] D MMMM' : 'MMMM YYYY'),
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
      before: kindsBefore.length ? { label: before.format(period === 'year' ? 'YYYY' : period === 'week' ? '[the week of] D MMMM' : 'MMMM YYYY'), kinds: kindsBefore } : null,
      // The days anything was reviewed on: a habit, counted, never a streak to keep.
      reviewDays: (db.prepare("select count(distinct date(reviewed_at, 'localtime')) n from review_log where reviewed_at >= ? and reviewed_at < ?").get(since, until) as { n: number }).n
    }
  })

  // --- tasks
  const TASK = `id, number, title, status, due_at as dueAt, all_day as allDay, recurrence, origin_capture_id as captureId,
    created_at as createdAt, completed_at as completedAt, waiting_on as waitingOn, estimate, sort_order as sortOrder, repeat_until as repeatUntil,
    important, deadline_at as deadline, deadline_timed as deadlineTimed, blocker, reschedules, notify, priority, plan_for as planFor, snoozed_until as snoozedUntil, get_ready as getReady, rollovers, skips, held_at as heldAt,
    blocked_by as blockedBy, (select b.title from tasks b where b.id = tasks.blocked_by) as blockedByTitle, (select b.status from tasks b where b.id = tasks.blocked_by) as blockedByStatus`
  // Where an open task came from, for grouping by note: the capture it was
  // made from, or else the first thing linked to it.
  const FROM = `coalesce(origin_capture_id, (select item_id from task_links where task_id = tasks.id limit 1))`
  // Each day a task is left undone past its day is one carry over, counted once a day;
  // and one held by a fresh start comes back by itself when a day after the fresh
  // start comes that it is for, or must be ready by. Late ones wait until opened.
  handle('tasks', () => (rollOver(db, dayKey()), db.prepare(`select ${TASK}, subtasks, ${FROM} as fromId,
    coalesce((select case when private then 'Private note' else ${LABEL} end from captures where id = ${FROM}), (select title from nuggets where id = ${FROM})) as fromTitle
    from tasks where held_at is null and (? or snoozed_until is null or snoozed_until <= date('now', 'localtime') or status = 'dropped')
    order by status, case priority when 0 then 5 else priority end, coalesce(sort_order, 1e12), due_at is null, due_at, created_at`).all(settings().showSnoozed ? 1 : 0)
    .map((row) => ({ ...(row as object), subtasks: JSON.parse(((row as { subtasks: string | null }).subtasks) ?? '[]') }))))
  // A fresh start: every open task on hold at once, nothing deleted; Undo takes back exactly that run.
  handle('tasks:fresh-start', () => {
    const at = now()
    return write({ at, held: db.prepare("update tasks set held_at = ? where status = 'open' and held_at is null").run(at).changes })
  })
  handle('tasks:fresh-undo', (at: string) => write(db.prepare('update tasks set held_at = null where held_at = ?').run(String(at)).changes))
  // What a fresh start holds, for its own list in Later.
  handle('tasks:held', () => db.prepare(`select ${TASK}, subtasks from tasks where held_at is not null and status = 'open' order by held_at desc, created_at`).all()
    .map((row) => ({ ...(row as object), subtasks: JSON.parse(((row as { subtasks: string | null }).subtasks) ?? '[]') })))
  // Which capture each task was made from, for a whole list in one read: one
  // task from one capture, one from several, or several from one. A capture in
  // the Bin has no family to show; a task there is said to be, so the notes it
  // was made from go out of sight with it.
  handle('tasks:sources', () => db.prepare(`select t.id as task, c.id as capture, t.status = 'dropped' as binned from tasks t join captures c on c.id = t.origin_capture_id
      where c.status != 'discarded'
    union select t.id, c.id, t.status = 'dropped' from task_links l join tasks t on t.id = l.task_id join captures c on c.id = l.item_id
      where c.status != 'discarded'`).all())
  handle('task', (id: string) => {
    // Opened, a task held by a fresh start is back: you went looking for it.
    if (db.prepare('update tasks set held_at = null where id = ? and held_at is not null').run(id).changes) changed()
    const row = db.prepare(`select ${TASK}, notes, subtasks, pickup from tasks where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    // Made from a capture before tasks carried what it held: given it now, once, so its pictures and words are here.
    if (row.notes == null && typeof row.captureId === 'string') {
      const notes = bodyAsNotes(row.captureId)
      if (notes) (db.prepare('update tasks set notes = ? where id = ? and notes is null').run(notes, id), (row.notes = notes))
    }
    const done = db.prepare('select done_at as at, s.recap from task_done d left join sessions s on s.id = d.session_id where d.task_id = ? order by done_at desc').all(id)
    // What the task is about, linked from nuggets and articles: shown as a
    // checklist on it, and the material comes up first when you open it.
    const linked = db.prepare(`select n.id, n.tier, n.kind, n.title from task_links l join nuggets n on n.id = l.item_id where l.task_id = ?
      union all select c.id, 'capture', c.kind, label(c.title, c.body) from task_links l join captures c on c.id = l.item_id where l.task_id = ?`).all(id, id)
    return { ...row, notes: JSON.parse((row.notes as string) ?? 'null'), subtasks: JSON.parse((row.subtasks as string) ?? '[]'), done, linked }
  })
  // A note hidden until a day, or back in sight (null).
  handle('capture:snooze', (id: string, day: string | null) => write(db.prepare('update captures set snoozed_until = ? where id = ?').run(day, id).changes > 0))
  // What is hidden until a later day, tasks and notes: counted for the box that shows them anyway, and kept off Home.
  handle('snoozed', () => (db.prepare(`select id from tasks where status = 'open' and snoozed_until > date('now', 'localtime')
    union all select id from captures where status != 'discarded' and snoozed_until > date('now', 'localtime')`).all() as { id: string }[]).map((one) => one.id))
  // The same, with the day each comes back and its name: for the calendar and a day still to come.
  handle('snoozed:back', () => db.prepare(`select 'task' as type, id, title, snoozed_until as day from tasks where status = 'open' and snoozed_until > date('now', 'localtime')
    union all select 'capture', id, case when private then 'Private note' else ${LABEL} end, snoozed_until from captures where status != 'discarded' and snoozed_until > date('now', 'localtime')`).all())
  // `plain`: places in the words kept as plain text in the box ("today" kept as a word), never read as a date.
  handle('task:add', (text: string, origin?: string, today = false, plain?: { from: number; to: number }[]) =>
    write(addTask(String(text), origin ?? null, today, (Array.isArray(plain) ? plain : []).filter((one) => Number.isInteger(one?.from) && Number.isInteger(one?.to)).map(({ from, to }) => ({ from, to })))))
  // Study this: a task made from a nugget or an article, linked to it, so the
  // reading has a when and the material is waiting when the task opens.
  // `plain`: where the note's own title sits in the words, read as words and never as a date.
  handle('study', (itemId: string, text: string, plain?: { from: number; to: number }) => {
    const task = addTask(text, null, false, plain && Number.isInteger(plain.from) && Number.isInteger(plain.to) ? [plain] : [])
    db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, itemId)
    return write(task)
  })
  const TASK_COLUMNS = { title: 'title', allDay: 'all_day', recurrence: 'recurrence', waitingOn: 'waiting_on', estimate: 'estimate', sortOrder: 'sort_order', important: 'important', deadline: 'deadline_at', blocker: 'blocker', blockedBy: 'blocked_by', reschedules: 'reschedules', notify: 'notify', priority: 'priority', plan: 'plan_for', until: 'repeat_until', snoozedUntil: 'snoozed_until', getReady: 'get_ready', rollovers: 'rollovers', skips: 'skips' } as const
  handle('task:save', (id: string, patch: { allDay?: number; title?: string; until?: string | null; notes?: unknown; due?: string | null; recurrence?: string | null; status?: string; waitingOn?: string | null; subtasks?: unknown; estimate?: number | null; sortOrder?: number | null; important?: number; deadline?: string | null; blocker?: string | null; blockedBy?: string | null; reschedules?: number; notify?: string | null; priority?: number; plan?: string | null; notifiedAt?: string | null; completedAt?: string | null; snoozedUntil?: string | null; getReady?: number | null; rollovers?: number; skips?: number }) => {
    // What a move changes on its own (the reschedule count, whether it was told
    // about), given back so its undo can put both back exactly.
    const before = db.prepare('select reschedules, notified_at as notifiedAt from tasks where id = ?').get(id) as { reschedules: number; notifiedAt: string | null } | undefined
    // A deadline moved by whole days keeps its time; one picked as a day has none.
    const clock = (iso: string | null | undefined): string => (iso ? new Date(iso).toTimeString().slice(0, 5) : '')
    if (patch.deadline !== undefined) {
      const was = (db.prepare('select deadline_at from tasks where id = ?').get(id) as { deadline_at: string | null } | undefined)?.deadline_at
      if (clock(was) !== clock(patch.deadline)) db.prepare('update tasks set deadline_timed = 0 where id = ?').run(id)
    }
    // A title past the limit is cut to fit; the words in full go to its notes when it has none.
    if (typeof patch.title === 'string') {
      const fitted = fittedTitle(patch.title)
      if (fitted) {
        if (patch.notes === undefined && !(db.prepare('select notes from tasks where id = ?').get(id) as { notes: string | null } | undefined)?.notes)
          patch = { ...patch, notes: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: patch.title.trim() }] }] } }
        patch = { ...patch, title: fitted }
      }
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
    // Given a day or a list while a fresh start holds it: you chose it again, so it is back.
    if (patch.due || patch.plan) db.prepare('update tasks set held_at = null where id = ?').run(id)
    if (patch.due) db.prepare('update tasks set plan_for = null where id = ?').run(id)
    // Back from hiding and then given a day or a list: the day it came back is done with.
    if ((patch.due || patch.plan) && patch.snoozedUntil === undefined) db.prepare("update tasks set snoozed_until = null where id = ? and snoozed_until <= date('now', 'localtime')").run(id)
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
      // A series moved by hand begins again from its new day; an undo of that
      // move (it says the count itself) puts back the day it was anchored to.
      if (patch.reschedules === undefined) db.prepare('update tasks set due_at = ?, notified_at = null, reschedules = reschedules + ?, repeat_day_was = repeat_day, repeat_day = null where id = ?').run(patch.due, later, id)
      else db.prepare('update tasks set due_at = ?, notified_at = null, repeat_day = coalesce(repeat_day_was, repeat_day), repeat_day_was = null where id = ?').run(patch.due, id)
    }
    // A new due-by date is a new moment to be told about, as a new day is.
    if (patch.deadline !== undefined && patch.deadline !== deadlineWas) db.prepare('update tasks set notified_at = null where id = ?').run(id)
    // An undo back to done says when it was done, so it keeps its place among the day's done lines.
    if (patch.status !== undefined) db.prepare('update tasks set status = ?, completed_at = ? where id = ?').run(patch.status, patch.status === 'done' ? (patch.completedAt ?? now()) : null, id)
    if (patch.notifiedAt !== undefined) db.prepare('update tasks set notified_at = ? where id = ?').run(patch.notifiedAt, id)
    return write(before ?? true)
  })
  // Done. A routine moves to its next date instead: from the due date when the
  // calendar matters, from today when only the gap does ("every!"), and never
  // onto a day already gone, so a missed week does not stack up.
  // A session can close it, and the row says which: its recap is the
  // completion note. A routine closes many times, so it is a row, not a field.
  // It gives back what it was, so a routine ticked by mistake can be put back.
  // Skipped, a routine moves on to its next date the same way, with nothing
  // counted as done; its skips in a row go up by one, and a tick clears them.
  const finish = (id: string, session: string | null = null, skip = false): { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null; skips?: number } => {
    const task = db.prepare('select due_at, deadline_at, recurrence, repeat_until, repeat_day, notified_at, skips from tasks where id = ?').get(id) as { due_at: string | null; deadline_at: string | null; recurrence: string | null; repeat_until: string | null; repeat_day: number | null; notified_at: string | null; skips: number }
    const doneAt = now()
    const was = { dueAt: task.due_at, doneAt, notifiedAt: task.notified_at, deadlineAt: task.deadline_at, skips: task.skips }
    if (skip && !task.recurrence) return was
    if (!skip) db.prepare('insert into task_done (task_id, done_at, session_id) values (?, ?, ?)').run(id, doneAt, session)
    db.prepare('update tasks set skips = ? where id = ?').run(skip ? task.skips + 1 : 0, id)
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
  handle('task:skip', (id: string) => finish(id, null, true))
  // Done by mistake: open again, on the date it had, and that time it was
  // done no longer counted. The same for a one-off and a routine.
  handle('task:undone', (id: string, was: { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null; skips?: number }) => {
    if (typeof was.skips === 'number') db.prepare('update tasks set skips = ? where id = ?').run(was.skips, id)
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
  // Tasks turned back into notes: the note each came from is back in the
  // Inbox, or a new note holds its words when it was never one. The task goes
  // to the Bin, its done days and focus sessions still its own, and the Undo
  // puts every row back as it was.
  type Kept = { task: Record<string, unknown>; links: Record<string, unknown>[]; done: Record<string, unknown>[]; reopened: string[]; made: string | null }
  handle('task:to-note', (ids: string[]) => {
    const kept: Kept[] = []
    atomically(() => { for (const id of ids) {
      const task = db.prepare('select * from tasks where id = ?').get(id) as Record<string, unknown> | undefined
      if (!task) continue
      const links = db.prepare('select * from task_links where task_id = ?').all(id) as Record<string, unknown>[]
      const done = db.prepare('select * from task_done where task_id = ?').all(id) as Record<string, unknown>[]
      const from = [...new Set([task.origin_capture_id, ...links.map((one) => one.item_id)].filter((one): one is string => typeof one === 'string'))]
      const reopened = from.filter((capture) => db.prepare("update captures set status = 'open' where id = ? and status = 'resolved'").run(capture).changes > 0)
      let made: string | null = null
      if (!reopened.length && !from.some((capture) => db.prepare("select 1 from captures where id = ? and status = 'open'").get(capture))) {
        made = randomUUID()
        const title = String(task.title)
        const body = { type: 'doc', content: [{ type: 'paragraph', content: title ? [{ type: 'text', text: title }] : [] }] }
        db.prepare("insert into captures (id, number, title, kind, body, captured_at, source, private) values (?, (select coalesce(max(number), 0) + 1 from captures), ?, 'note', ?, ?, '', 0)")
          .run(made, title, JSON.stringify(body), now())
      }
      db.prepare("update tasks set status = 'dropped', completed_at = ? where id = ?").run(now(), id)
      kept.push({ task, links, done, reopened, made })
    } })
    return write(kept)
  })
  handle('task:to-note:undo', (kept: Kept[]) => {
    const put = (table: string, row: Record<string, unknown>): void => {
      const keys = Object.keys(row)
      db.prepare(`insert or replace into ${table} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`).run(...(keys.map((key) => row[key]) as never[]))
    }
    atomically(() => { for (const one of kept) {
      put('tasks', one.task)
      for (const link of one.links) put('task_links', link)
      for (const done of one.done) put('task_done', done)
      for (const capture of one.reopened) db.prepare("update captures set status = 'resolved' where id = ? and status = 'open'").run(capture)
      if (one.made) db.prepare('delete from captures where id = ?').run(one.made)
    } })
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
  // What a tag holds is one list, whoever asks: the sidebar, the Tags page and
  // the tag's own page count the same things. Out of it: the Bin, the
  // archive, cards, and a note made into tasks that are all in the Bin (it
  // went there with them). Kept but not shown until asked (`later`): a task
  // done, a to-do note dealt with, and a note made into a task, which lives
  // on as that task, as Everything shows them.
  const madeInto = (status: string): string => `exists (select 1 from tasks t where t.status ${status} and (t.origin_capture_id = captures.id or t.id in (select task_id from task_links where item_id = captures.id)))`
  const TAG_CAPTURES = `status != 'discarded' and archived_at is null and not (status = 'resolved' and ${madeInto("= 'dropped'")} and not ${madeInto("!= 'dropped'")})`
  const CAPTURE_LATER = `select status = 'resolved' and (kind = 'todo' or ${madeInto("!= 'dropped'")})`
  let tagsOf = new Map<string, { title: string; body: string; tags: string[] }>()
  const tagged = (): { tag: string; id: string; type: string; title: string; private: boolean; later: boolean }[] => {
    const rows = [
      ...(db.prepare(`select id, 'capture' as type, ${LABEL} as title, body, private, (${CAPTURE_LATER}) as later from captures where ${TAG_CAPTURES}`).all() as Record<string, string>[]),
      ...(db.prepare("select id, tier as type, title, body, private, 0 as later from nuggets where archived_at is null and superseded_by is null and tier != 'card'").all() as Record<string, string>[]),
      // A task in the Bin is out of every tag, as a capture there is.
      ...(db.prepare("select id, 'task' as type, title, notes as body, 0 as private, status = 'done' as later from tasks where status != 'dropped'").all() as Record<string, string>[])
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
      return [...new Set(kept.tags.map((tag) => alias.get(tag) ?? tag))].map((tag) => ({ tag, id: row.id, type: row.type, title: row.title, private: !!Number(row.private), later: !!Number(row.later) }))
    })
  }
  // `count` is what the tag's page shows at first; `later`, the done ones it keeps under a click.
  handle('tags', () => {
    const counts = new Map<string, { count: number; later: number }>()
    for (const { tag, later } of tagged()) {
      const one = counts.get(tag) ?? { count: 0, later: 0 }
      one[later ? 'later' : 'count'] += 1
      counts.set(tag, one)
    }
    const meta = new Map((db.prepare('select tag, color, action, exam_at, priority, lands from tag_meta').all() as { tag: string; color: string | null; action: number; exam_at: string | null; priority: string | null; lands: string | null }[]).map((row) => [row.tag, row]))
    return [...counts].map(([tag, { count, later }]) => ({ tag, count, later, color: meta.get(tag)?.color ?? null, action: !!meta.get(tag)?.action, examAt: meta.get(tag)?.exam_at ?? null, priority: meta.get(tag)?.priority ?? null, lands: meta.get(tag)?.lands ?? null })).sort((a, b) => b.count - a.count || b.later - a.later)
  })
  handle('tag:meta', () => db.prepare('select tag, color, action, backdrop from tag_meta').all())
  handle('tag:set', (tag: string, patch: { backdrop?: string | null; color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }) => {
    db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
    if (patch.lands !== undefined) db.prepare('update tag_meta set lands = ? where tag = ?').run(/^\d{1,3}$/.test(patch.lands ?? '') ? patch.lands : null, tag)
    if (patch.priority !== undefined) db.prepare('update tag_meta set priority = ? where tag = ?').run(['maintaining', 'paused'].includes(patch.priority ?? '') ? patch.priority : null, tag)
    if (patch.examAt !== undefined) db.prepare('update tag_meta set exam_at = ? where tag = ?').run(patch.examAt, tag)
    if (patch.backdrop !== undefined) db.prepare('update tag_meta set backdrop = ? where tag = ?').run(['colour', 'picture', 'sketch'].includes(patch.backdrop ?? '') ? patch.backdrop : null, tag)
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
  // first, each with its other tags. The same things the tag's count counts,
  // tasks too; `later` marks the done ones the page keeps under a click.
  // Which notes carry it comes from the same list the count does, so the two
  // can never differ; a body is read only for a note that carries it, once.
  const readOf = new Map<string, { body: string; parsed: unknown }>()
  handle('tag:read', (tag: string) => {
    const tagsBy = new Map<string, string[]>()
    for (const one of tagged()) tagsBy.set(`${one.type}:${one.id}`, [...(tagsBy.get(`${one.type}:${one.id}`) ?? []), one.tag])
    const rows = [
      ...db.prepare(`select id, 'capture' as type, kind, status, '' as title, ${LABEL} as label, body, private, captured_at as at, coalesce(edited_at, captured_at) as changed, ${KEPT_IN} as keptIn, (${CAPTURE_LATER}) as later from captures where ${TAG_CAPTURES}`).all(),
      ...db.prepare("select id, tier as type, kind, 'open' as status, title, label('', body) as label, body, private, created_at as at, coalesce(updated_at, created_at) as changed, 0 as later from nuggets where archived_at is null and superseded_by is null and tier != 'card'").all(),
      ...db.prepare("select id, 'task' as type, 'task' as kind, status, title, title as label, notes as body, 0 as private, created_at as at, coalesce(completed_at, created_at) as changed, status = 'done' as later from tasks where status != 'dropped'").all()
    ] as Record<string, string>[]
    return rows.flatMap((row) => {
      const key = `${row.type}:${row.id}`
      const tags = tagsBy.get(key)
      if (!tags?.includes(tag)) return []
      let kept = readOf.get(key)
      if (kept?.body !== row.body) kept = { body: row.body, parsed: JSON.parse(row.body ?? 'null') }
      readOf.set(key, kept)
      return [{ ...row, at: row.at, body: kept.parsed, private: !!Number(row.private), later: !!Number(row.later), tags: tags.filter((one) => one !== tag) }]
    }).sort((a, b) => String(b.at).localeCompare(String(a.at)))
  })
  // Rename everywhere at once; renaming onto a tag that exists is a merge. The
  // words themselves change, since the words are where tags live.
  // What the last rename changed, word for word, so its Undo puts back
  // exactly that, a merge included.
  let lastRename: { from: string; rows: { table: string; text: string; id: string; was: string }[]; meta: { from: string; to: string } | null; aliases: string[] } | null = null
  handle('tag:rename', (from: string, to: string) => {
    const clean = to.trim().replace(/^#/, '').toLowerCase()
    if (!isTagWord(clean) || clean === from) return null
    const pattern = tagWritten(from, '(^|\\s|")')
    const rows: { table: string; text: string; id: string; was: string }[] = []
    for (const [table, text] of [['captures', 'body'], ['nuggets', 'body'], ['tasks', 'notes'], ['captures', 'title'], ['nuggets', 'title'], ['tasks', 'title']]) {
      for (const row of db.prepare(`select id, ${text} as v from ${table} where ${text} like ?`).all(`%#${from}%`) as { id: string; v: string }[]) {
        const next = row.v.replace(pattern, `$1#${clean}`)
        if (next === row.v) continue
        rows.push({ table, text, id: row.id, was: row.v })
        db.prepare(`update ${table} set ${text} = ? where id = ?`).run(next, row.id)
      }
    }
    // Its colour, and whether it makes tasks, go with it; a merge keeps the colour of the tag merged into.
    const target = db.prepare('select 1 from tag_meta where tag = ?').get(clean)
    const meta = !target && db.prepare('select 1 from tag_meta where tag = ?').get(from) ? { from, to: clean } : null
    if (meta) db.prepare('update tag_meta set tag = ? where tag = ?').run(clean, from)
    const aliases = (db.prepare('select tag from tag_meta where alias_of = ?').all(from) as { tag: string }[]).map((one) => one.tag)
    db.prepare('update tag_meta set alias_of = ? where alias_of = ?').run(clean, from)
    lastRename = { from, rows, meta, aliases }
    return write(clean)
  })
  handle('tag:rename:undo', () => {
    const last = lastRename
    if (!last) return false
    lastRename = null
    for (const row of last.rows) db.prepare(`update ${row.table} set ${row.text} = ? where id = ?`).run(row.was, row.id)
    if (last.meta) db.prepare('update tag_meta set tag = ? where tag = ?').run(last.meta.from, last.meta.to)
    for (const tag of last.aliases) db.prepare('update tag_meta set alias_of = ? where tag = ?').run(last.from, tag)
    return write(true)
  })

  // --- pins: parked in the sidebar, every one; quick capture shows the top three.
  // A pin is something you chose, so quiet hours hide only notes marked
  // private, never a pin just because it is not sorted yet.
  handle('pins', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return []
    const privacy = hidePrivate ? 'and private = 0' : ''
    return db
      .prepare(
        `select id, 'capture' as type, kind, ${LABEL} as title, pinned_at as pinnedAt, private from captures where pinned_at is not null and archived_at is null and status != 'discarded' ${privacy}
         union all select id, tier as type, kind, title, pinned_at, private from nuggets where pinned_at is not null and archived_at is null ${privacy}
         order by pinnedAt desc`
      )
      .all()
  })
  // A reminder is a pin with a date: when it comes round, it pins itself.
  handle('remind', (table: 'captures' | 'nuggets', id: string, at: string | null) =>
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set remind_at = ? where id = ?`).run(at, id))
  )
  setInterval(() => {
    let fired = 0
    for (const table of ['captures', 'nuggets'])
      for (let due; (due = db.prepare(`select id from ${table} where remind_at <= ? and archived_at is null order by remind_at limit 1`).get(now()) as { id: string } | undefined); fired++)
        db.prepare(`update ${table} set pinned_at = ?, remind_at = null where id = ?`).run(now(), due.id)
    if (fired) changed()
  }, 60_000)
  // No cap: the sidebar lists every pin, and quick capture keeps to the top three.
  handle('pin', (table: 'captures' | 'nuggets', id: string, on: boolean) => {
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

  // --- sessions: effort against a task, with a recap of what actually happened.
  // A bare session (Start focus, from ⌘K or anywhere) has no task: task_id ''
  // as a timer's, but kind 'focus', and kept, logged and counted as any
  // session is. Named while it runs or after, on the day's page (session:name).
  db.exec('create table if not exists sessions (id text primary key, task_id text not null, started_at text not null, ended_at text, recap text)')
  handle('sessions', (taskId: string) =>
    db.prepare('select id, started_at as startedAt, ended_at as endedAt, recap, goal, planned_ms as plannedMs, paused_ms as pausedMs, paused_at as pausedAt, abandoned_at as abandonedAt from sessions where task_id = ? order by started_at desc').all(taskId)
  )
  // A focus session: a goal, an optional length, and pauses that do not count.
  column('sessions', 'goal text')
  column('sessions', 'planned_ms integer')
  column('sessions', 'paused_ms integer not null default 0')
  column('sessions', 'paused_at text')
  // Pomodoro rounds ("4x25" in the box): where the set stands, as JSON, on the timer that runs them.
  column('sessions', 'rounds text')
  // What a timer row is for: 'break' for a break taken after a session, 'focus' for a bare session; null for any other.
  column('sessions', 'kind text')
  // A session abandoned: kept in its task's log and the day's, marked so, and
  // counted in no total. Looked for first, so an older database just gains it.
  if (!(db.prepare('pragma table_info(sessions)').all() as { name: string }[]).some((one) => one.name === 'abandoned_at'))
    db.exec('alter table sessions add column abandoned_at text')
  // The unfinished symphony: where to pick up, asked as a session ends, shown when its task next opens.
  column('tasks', 'pickup text')
  handle('session:pickup', (sessionId: string, text: string) => {
    const row = db.prepare('select task_id from sessions where id = ?').get(sessionId) as { task_id: string } | undefined
    if (!row?.task_id) return false
    db.prepare('update tasks set pickup = ? where id = ?').run(String(text).trim() || null, row.task_id)
    return write(true)
  })
  handle('task:pickup', (id: string, text: string | null) => write(db.prepare('update tasks set pickup = ? where id = ?').run(text?.trim() || null, id)))
  // A timer still running when Vigil quit would ring "Time's up" days later.
  // One already past its length ends quietly at start: a timer goes, as it
  // always does, and a focus session is kept, ended when its plan ran out.
  // Said once, the first time a window asks.
  let missed: string | null = null
  for (const row of db.prepare(`select id, task_id, kind, started_at, paused_ms, planned_ms from sessions where ended_at is null and paused_at is null and planned_ms > 0
      and (julianday('now') - julianday(started_at)) * 86400000 - paused_ms > planned_ms`).all() as { id: string; task_id: string; kind: string | null; started_at: string; paused_ms: number; planned_ms: number }[]) {
    const timer = row.task_id === '' && row.kind !== 'focus'
    if (timer) db.prepare('delete from sessions where id = ?').run(row.id)
    else db.prepare('update sessions set ended_at = ? where id = ?').run(new Date(dueAt(row.started_at, row.paused_ms, row.planned_ms) ?? Date.now()).toISOString(), row.id)
    missed = `Your ${Math.max(1, Math.round(row.planned_ms / 60000))}-minute ${timer ? 'timer' : 'focus session'} ended while ${APP_NAME} was closed`
  }
  handle('focus:missed', () => {
    const said = missed
    missed = null
    return said
  })
  // One at a time: starting another ends the one running, recap and all kept.
  const startOne = (taskId: string, goal?: string | null, plannedMs?: number | null): string => {
    // A timer from the box keeps running underneath: only a focus session ends.
    db.prepare(`update sessions set ended_at = ? where ended_at is null and ${FOCUSED}`).run(now())
    const id = randomUUID()
    const at = now()
    // The five-second rule: it starts held, and the pill lets it go after counting 5 to 1.
    // Only with the pill on screen: a count nobody can see would only hold the session up.
    const countIn = settings().countIn && focusBubbleShown() && !gate().blackout
    // No task: a bare session, kind 'focus' (see above).
    db.prepare('insert into sessions (id, task_id, started_at, goal, planned_ms, paused_at, kind) values (?, ?, ?, ?, ?, ?, ?)').run(id, taskId, at, goal?.trim() || null, plannedMs ?? null, countIn ? at : null, taskId ? null : 'focus')
    return id
  }
  handle('session:start', (taskId: string, goal?: string, plannedMs?: number | null) => write(startOne(taskId, goal, plannedMs)))
  // A bare session: no task to make first, the way Raycast's “Start focus” is.
  handle('focus:start', (plannedMs: number | null, goal?: string | null) => write(startOne('', goal, plannedMs)))
  // Its name, given while it runs (the bubble) or after (its line on the day's page). Empty is “Focus” again.
  handle('session:name', (id: string, name: string) => write(db.prepare("update sessions set goal = ? where id = ? and kind = 'focus'").run(String(name ?? '').trim() || null, String(id)).changes > 0))
  // More time: the running session or break gets `ms` more, from its planned
  // end or from now if already past it. Kept apart in extended_ms, so the
  // length it was planned at stays readable (planned_ms - extended_ms).
  column('sessions', 'extended_ms integer not null default 0')
  handle('session:extend', (id: string, ms: number) => extendRunning(ms, id))
  // The last session kept (not abandoned), to go again: its task, goal and the length it was first planned at.
  // A bare one counts too: Go again after it is another bare one, as long.
  const lastKept = (): { taskId: string; goal: string; plannedMs: number | null; title: string } | null =>
    (db.prepare(`select s.task_id as taskId, coalesce(s.goal, t.title, 'Focus') as goal, coalesce(t.title, s.goal, 'Focus') as title, case when s.planned_ms is null then null else s.planned_ms - s.extended_ms end as plannedMs
      from sessions s left join tasks t on t.id = s.task_id where s.ended_at is not null and s.abandoned_at is null and (t.status = 'open' or s.kind = 'focus') order by s.ended_at desc limit 1`).get() as { taskId: string; goal: string; plannedMs: number | null; title: string } | undefined) ?? null
  handle('session:last', () => lastKept())
  // Go again: the same session started over, same task and length; the break running, if any, ends.
  handle('session:again', () => {
    const last = lastKept()
    if (!last) return write(null)
    db.prepare("delete from sessions where task_id = '' and kind = 'break' and ended_at is null").run()
    // A bare one called “Focus” only for want of a name goes again unnamed.
    return write(startOne(last.taskId, last.taskId || last.goal !== 'Focus' ? last.goal : null, last.plannedMs))
  })
  // A break after a session: the session ends, kept, and a break timer starts, in one step, so the pill morphs from one to the other.
  handle('break:start', (sessionId: string | null, ms: number) => {
    const at = now()
    if (sessionId) db.prepare('update sessions set ended_at = ?, paused_ms = paused_ms + coalesce(round((julianday(?) - julianday(paused_at)) * 86400000), 0), paused_at = null where id = ? and ended_at is null').run(at, at, sessionId)
    db.prepare(`delete from sessions where ${TIMER} and ended_at is null`).run()
    const id = randomUUID()
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms, kind) values (?, '', ?, 'Break', ?, 'break')").run(id, at, ms)
    return write(id)
  })
  // Away: nobody touched the Mac for a long while (sleep is sleptThrough's,
  // in session-log.ts). A session past its time, or with none, ends when it
  // should have, not hours later: at the planned end, or when you left if
  // that was later. One still within its time is left alone: reading is work.
  // A timer or break simply goes. Gives back what ended, for the pill to say.
  handle('session:away', (id: string, from: number) => {
    const row = db.prepare('select task_id, goal, started_at, planned_ms, paused_ms, paused_at, kind from sessions where id = ? and ended_at is null').get(id) as { task_id: string; goal: string | null; started_at: string; planned_ms: number | null; paused_ms: number; paused_at: string | null; kind: string | null } | undefined
    if (!row || row.paused_at) return null
    const started = new Date(row.started_at).getTime()
    const due = dueAt(row.started_at, row.paused_ms, row.planned_ms)
    if (due !== null && Date.now() < due) return null
    const end = Math.max(started, due === null ? from : Math.max(due, from))
    const timer = row.task_id === '' && row.kind !== 'focus'
    if (timer) db.prepare('delete from sessions where id = ?').run(id)
    else db.prepare('update sessions set ended_at = ? where id = ?').run(new Date(end).toISOString(), id)
    return write({ id, endedAt: new Date(end).toISOString(), timer, kind: row.kind, how: 'idle' as const })
  })
  // It was not nothing after all (read on paper, thought it through): running again from where it was, if nothing else started.
  handle('session:unaway', (id: string) => {
    if (db.prepare(`select 1 from sessions where ended_at is null and ${FOCUSED}`).get()) return write(false)
    return write(db.prepare('update sessions set ended_at = null where id = ? and abandoned_at is null').run(id).changes > 0)
  })
  /** The session running now, with its task's name, for the floating timer. */
  handle('focus:now', () =>
    db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, case s.kind when 'focus' then 'Focus' else 'Timer' end) as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
      s.paused_ms as pausedMs, s.paused_at as pausedAt, s.rounds, s.kind, s.extended_ms as extendedMs,
      s.practice_id as practiceId, (select target_min from practices p where p.id = s.practice_id) as practiceTarget from sessions s left join tasks t on t.id = s.task_id
      where s.ended_at is null and (t.id is not null or s.task_id = '') order by s.started_at desc limit 1`).get() ?? null)
  // A timer from the box ("5m tea"): a session with no task behind it, so the
  // floating timer shows it as it shows any other. Ending it deletes it: a
  // kettle is not effort worth a record.
  // One timer at a time; a focus session running carries on underneath it.
  handle('timer:start', (goal: string, ms: number) => {
    db.prepare(`delete from sessions where ${TIMER} and ended_at is null`).run()
    const id = randomUUID()
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, '', ?, ?, ?)").run(id, now(), goal.trim() || null, ms)
    return write(id)
  })
  // Pomodoro rounds: one timer row that runs each stretch in turn, work and
  // break, so the pill stays the same pill from the first round to the last.
  handle('rounds:start', (goal: string, plan: { rounds: number; workMs: number; breakMs: number; longMs: number }) => {
    db.prepare(`delete from sessions where ${TIMER} and ended_at is null`).run()
    const id = randomUUID()
    const rounds = { rounds: plan.rounds, round: 1, phase: 'work', workMs: plan.workMs, breakMs: plan.breakMs, longMs: plan.longMs }
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms, rounds) values (?, '', ?, ?, ?, ?)").run(id, now(), goal.trim() || null, plan.workMs, JSON.stringify(rounds))
    return write(id)
  })
  // The next stretch, started now: what the pill asks for as one runs out.
  handle('rounds:next', (id: string, next: { round: number; phase: string; ms: number }) => {
    const row = db.prepare('select rounds from sessions where id = ? and ended_at is null').get(id) as { rounds: string | null } | undefined
    if (!row?.rounds) return false
    const rounds = { ...JSON.parse(row.rounds), round: next.round, phase: next.phase }
    db.prepare('update sessions set started_at = ?, planned_ms = ?, paused_ms = 0, paused_at = null, rounds = ? where id = ?').run(now(), next.ms, JSON.stringify(rounds), id)
    return write(true)
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
  // Abandoned: a session on a task ends, kept in the log marked abandoned and
  // counted for nothing. A plain timer has no log, so it simply goes.
  handle('session:abandon', (id: string) => {
    const row = db.prepare('select task_id, kind from sessions where id = ? and ended_at is null').get(id) as { task_id: string; kind: string | null } | undefined
    if (!row) return write(false)
    if (row.task_id === '' && row.kind !== 'focus') return (db.prepare('delete from sessions where id = ?').run(id), write('gone'))
    const at = now()
    db.prepare('update sessions set ended_at = ?, abandoned_at = ?, paused_ms = paused_ms + coalesce(round((julianday(?) - julianday(paused_at)) * 86400000), 0), paused_at = null where id = ?').run(at, at, at, id)
    return write('abandoned')
  })
  // Undo: running again, as long as no other session started meanwhile.
  handle('session:unabandon', (id: string) => {
    if (db.prepare(`select 1 from sessions where ended_at is null and ${FOCUSED}`).get()) return write(false)
    return write(db.prepare('update sessions set ended_at = null, abandoned_at = null where id = ? and abandoned_at is not null').run(id).changes > 0)
  })
  // Keep going, after ending early: the same session running again for the
  // time it had left, the minutes since it ended counted as a pause.
  handle('session:unend', (id: string) => {
    if (db.prepare(`select 1 from sessions where ended_at is null and ${FOCUSED}`).get()) return write(false)
    const at = now()
    return write(db.prepare('update sessions set paused_ms = paused_ms + max(0, round((julianday(?) - julianday(ended_at)) * 86400000)), ended_at = null where id = ? and ended_at is not null and abandoned_at is null').run(at, id).changes > 0)
  })
  // Ending asks for the recap, and the recap can become a nugget: the loop that
  // turns doing the work into something worth keeping.
  handle('session:end', (id: string, recap: string, keep: boolean, close = false) => {
    // Ended while paused: the pause up to now does not count either.
    const at = now()
    db.prepare('update sessions set ended_at = ?, recap = ?, paused_ms = paused_ms + coalesce(round((julianday(?) - julianday(paused_at)) * 86400000), 0), paused_at = null where id = ?').run(at, recap, at, id)
    if (close) finish((db.prepare('select task_id from sessions where id = ?').get(id) as { task_id: string }).task_id, id)
    if (keep && recap.trim())
      db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(
        randomUUID(), cut(recap.split('\n')[0], 120), JSON.stringify(recap), now(), now())
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
  // Held while the screen is shared or in quiet hours, and shown once that ends.
  let heldSince: number | null = null
  // Shown and not answered: asked once more after this long, or after “In 10 min”.
  column('tasks', 'alert_again_at text')
  const AGAIN = 10 * 60_000
  const checkAlerts = (): void => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) {
      heldSince ??= Date.now()
      return
    }
    // A task's own level wins over the setting: most never set one.
    const { notify, sounds } = settings()
    const told = Notification.isSupported()
    // Named as every list names it: "Send the invoice", never "#work Send the invoice".
    const named = (title: string): string => nameWithoutTags(title) || title
    for (const task of dueAlerts(db, Date.now(), notify, heldSince)) {
      db.prepare('update tasks set notified_at = ?, alert_again_at = ? where id = ?').run(now(), new Date(Date.now() + AGAIN).toISOString(), task.id)
      // One alert for one thing: Vigil's card, or the Mac's notification when the card cannot be seen.
      if (!nudgeTold({ kind: 'task', id: task.id, title: named(task.title), again: false }) && told) new Notification({ title: named(task.title), body: 'Due now', silent: !sounds }).show()
    }
    // The second time is the last: after it, the task waits in Today, quietly.
    for (const task of againAlerts(db, Date.now(), notify)) {
      db.prepare('update tasks set alert_again_at = null where id = ?').run(task.id)
      if (!nudgeTold({ kind: 'task', id: task.id, title: named(task.title), again: true }) && told) new Notification({ title: named(task.title), body: 'Still due', silent: !sounds }).show()
    }
    heldSince = null
  }
  setInterval(checkAlerts, 30_000)
  // The card's answers: later (asked once more then), or seen (not asked again).
  handle('alert:later', (id: string, ms: number) => write(db.prepare('update tasks set alert_again_at = ? where id = ?').run(new Date(Date.now() + Math.max(60_000, ms)).toISOString(), id).changes > 0))
  handle('alert:seen', (id: string) => write(db.prepare('update tasks set alert_again_at = null where id = ?').run(id).changes > 0))
  // For the QA runs: the alerts and the review reminder looked at now rather than within half a minute.
  handle('alerts:check', () => (checkAlerts(), remindNow()))
  handle('review:later', (ms: number) => write(db.prepare("insert or replace into nudges (key, day) values ('review-again', ?)").run(new Date(Date.now() + Math.max(60_000, ms)).toISOString()).changes > 0))
  handle('review:seen', () => write(db.prepare("delete from nudges where key = 'review-again'").run().changes > 0))
  setInterval(remindNow, 30_000)

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
      // A year of opens, a count a day, for the month calendar's marks on Home.
      opens: all<{ day: string; n: number }>("select date(opened_at, 'localtime') day, count(*) n from app_opens where opened_at >= ? group by day", ago(400)),
      hints: one<{ shown: number; up: number; down: number }>(
        "select count(*) shown, sum(reaction = 'up') up, sum(reaction = 'down') down from hint_events where shown_at >= ?", ago(30)),
      reviews: one<{ n: number; recalled: number }>('select count(*) n, sum(grade > 1) recalled from review_log where reviewed_at >= ?', ago(30)),
      hours: all<{ hour: number; n: number }>("select cast(strftime('%H', captured_at, 'localtime') as integer) hour, count(*) n from captures group by hour"),
      firstUse: one<{ days: number | null }>(
        `select avg(julianday(first_used_at) - julianday(captured_at)) days from captures where first_used_at >= ?`, ago(90)).days,
      tasksDone: one<{ n: number }>('select count(*) n from task_done where done_at >= ?', ago(7)).n,
      // Wrapped: what the week was, in the work itself.
      sessions: one<{ n: number; minutes: number | null }>(
        "select count(*) n, sum((julianday(ended_at) - julianday(started_at)) * 1440 - paused_ms / 60000.0) minutes from sessions where ended_at is not null and abandoned_at is null and started_at >= ?", ago(7)),
      // Private notes' tags are not counted: a tag can say as much as a title.
      tagsWeek: (db.prepare('select title, body from captures where captured_at >= ? and private = 0').all(ago(7)) as { title: string; body: string }[])
        .flatMap((row) => tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`))
        .reduce<Record<string, number>>((counts, tag) => ({ ...counts, [tag]: (counts[tag] ?? 0) + 1 }), {}),
      retention: settings().retention,
      estimates: one<{ estimated: number | null; spent: number | null }>(
        `select sum(t.estimate) estimated, sum((select sum((julianday(s.ended_at) - julianday(s.started_at)) * 1440 - s.paused_ms / 60000.0) from sessions s where s.task_id = t.id and s.ended_at is not null and s.abandoned_at is null)) spent
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
    // The beam turns in every window while it is written out.
    return busy(async () => {
      const folder = join(filePaths[0], SANDBOX ? `${APP_NAME} sandbox export ${dayKey()}` : `${APP_NAME.toLowerCase()}-${dayKey()}`)
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
      // Two notes with the same name each keep their own file; a Mac's disk
      // takes "Note" and "note" for one name, so case does not tell them apart.
      const unique = (name: string): string => {
        let one = name
        for (let n = 2; taken.has(one.toLowerCase()); n++) one = `${name} ${n}`
        taken.add(one.toLowerCase())
        return one
      }
      // Every file named first, so a link can point at the file it leads to.
      const captureRows = data.captures as Record<string, string & number>[]
      const nuggetRows = data.nuggets as Record<string, string>[]
      const names = new Map<string, string>()
      // Each capture by the name the app shows it by: its own title (a vault note's), else its first line.
      const labels = new Map((db.prepare(`select id, ${LABEL} as label from captures`).all() as { id: string; label: string }[]).map((row) => [row.id, row.label]))
      // Named by its title, as Obsidian names a note, so a link is plain [[Title]]
      // and reads there as here. Only what a file name or a link cannot hold is taken out.
      const titled = (text: string): string => text.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
      for (const row of captureRows) names.set(row.id, unique(titled(labels.get(row.id) ?? '') || `V-${row.number}`))
      for (const row of nuggetRows) names.set(row.id, unique(titled(row.title ?? '') || `${row.tier}-${slug(row.title) || row.id.slice(0, 8)}`))
      const nameOf = (id: string): string | undefined => names.get(id)
      for (const row of captureRows) {
        const body = JSON.parse(row.body ?? 'null')
        await writeFile(join(folder, 'markdown', `${names.get(row.id)}.md`),
          front({ id: `V-${row.number}`, private: row.private ? true : null, kind: row.kind, status: row.status, captured: row.captured_at, who: row.attribution, where: row.medium, ...properties(row.fields), tags: tagsIn(plain(body)) }) + local(markdown(body, nameOf)))
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
      // None kept yet is not a failure; any other is said, not dropped.
      const pictures = await cp(join(app.getPath('userData'), 'assets'), join(folder, 'assets'), { recursive: true }).then(() => true, (error: NodeJS.ErrnoException) => error?.code === 'ENOENT')
      return pictures ? folder : { folder, pictures: false }
    })
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
        else exists (select 1 from nuggets n where n.id = t.id and n.archived_at is null and n.superseded_by is null and n.tier != 'card') end
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
        const excerpt = cut(withoutTags(text, ' ').split('\n').map((line) => line.trim()).filter((line) => line && line !== row.title.trim()).join(' '), 220)
        // Rarest first, the ones that say the most.
        const shared = (JSON.parse(row.shared) as [string, number][]).sort((a, b) => a[1] - b[1]).map(([tag]) => tag)
        return { type: row.type, id: row.id, title: row.title, excerpt, private: !!row.private, at: row.at, shared }
      })
  })
}

/** Today's review queue, set once the handlers are registered; the badge counts it too. */
let reviewQueue: () => unknown[] = () => []

/** What the menu bar says: reviews due, and whether safe mode is on. */
export function badge(): { due: number; tasks: number; safe: boolean } {
  const n = reviewQueue().length
  // Quiet push: a task whose time has come is counted in the menu bar, unless
  // it is set to pull, where it only rises in Today.
  // A task's own level wins: a pull one is never counted, a quiet or alert one always is.
  // It counts what is due now (a time that has come), so the menu bar says "due now",
  // never a number to match against Today's; "Waiting on" ones are someone else's move.
  // One on hold or hidden until a later day is in no list, so it is not counted either.
  const tasks = (database()
    .prepare(`select count(*) n from tasks where status = 'open' and coalesce(waiting_on, '') = '' and held_at is null and (? or snoozed_until is null or snoozed_until <= date('now', 'localtime')) and ${ALERT_AT} <= ? and coalesce(notify, ?) != 'pull'`).get(settings().showSnoozed ? 1 : 0, now(), settings().notify) as { n: number }).n
  return { due: n, tasks, safe: settings().safeMode }
}

/**
 * The review reminder, once a day at the time set in Settings: a Mac
 * notification saying how many cards are due and about how long they take,
 * which opens Review. Silent in safe mode and quiet hours, and when nothing
 * is due; up to two hours late if Vigil was not running at the time. Gives
 * back what it said, or null.
 */
export function remindNow(): string | null {
  const { reviewReminder: at, sounds } = settings()
  if (!at || !/^\d{2}:\d{2}$/.test(at)) return null
  const [hours, minutes] = at.split(':').map(Number)
  const set = new Date().setHours(hours, minutes, 0, 0)
  const { blackout, hidePrivate } = gate()
  if (blackout || hidePrivate) return null
  const db = database()
  // Asked again: an hour after the first (or when “In an hour” runs out), once, the same day, while cards still wait.
  const again = db.prepare("select day from nudges where key = 'review-again'").get() as { day: string } | undefined
  if (again && Date.parse(again.day) <= Date.now()) {
    db.prepare("delete from nudges where key = 'review-again'").run()
    const waiting = reviewQueue().length
    if (!waiting || dayKey(again.day) !== dayKey()) return null
    const said = `${num(waiting)} ${waiting === 1 ? 'card' : 'cards'} still waiting`
    if (!nudgeTold({ kind: 'review', text: said, again: true }) && Notification.isSupported()) {
      const note = new Notification({ title: 'Still time to review', body: said, silent: !sounds })
      note.on('click', () => void ipcMain.emit('home:open', {}, 'view', 'review'))
      note.show()
    }
    return said
  }
  if (Date.now() < set || Date.now() - set > 2 * 3600000) return null
  const day = dayKey()
  if ((db.prepare("select day from nudges where key = 'review-reminder'").get() as { day: string } | undefined)?.day === day) return null
  const cards = reviewQueue().length
  if (!cards) return null
  db.prepare("insert or replace into nudges (key, day) values ('review-reminder', ?)").run(day)
  const ms = (db.prepare('select avg(ms) as ms from (select ms from review_log where ms is not null order by reviewed_at desc limit 200)').get() as { ms: number | null }).ms
  const time = minutesFor(cards, ms)
  const text = `${num(cards)} ${cards === 1 ? 'card' : 'cards'}, about ${num(time)} ${time === 1 ? 'minute' : 'minutes'}`
  // Vigil's card, with Review now and In an hour; left alone, it asks once more in an hour.
  db.prepare("insert or replace into nudges (key, day) values ('review-again', ?)").run(new Date(Date.now() + 3600_000).toISOString())
  // The Mac's own notification only when the card cannot be seen (the screen locked): one reminder, not two.
  if (!nudgeTold({ kind: 'review', text, again: false }) && Notification.isSupported()) {
    const note = new Notification({ title: 'Time to review', body: `${text}. They keep, if now is not a good time.`, silent: !sounds })
    // Opens Review in the main window, the way any other part of Vigil sends you there.
    note.on('click', () => void ipcMain.emit('home:open', {}, 'view', 'review'))
    note.show()
  }
  return text
}

/** The colours a goal can wear, in the order new goals are given them: the names a tag's colours use. */
export const GOAL_COLORS = ['blue', 'orange', 'green', 'purple', 'pink', 'yellow', 'red', 'brown']
/** The first colour no open goal wears yet; once all are worn, the one fewest wear. */
function freeGoalColor(): string {
  const worn = database().prepare("select goal_color as color, count(*) as n from nuggets where tier = 'goal' and closed_at is null and goal_color is not null group by goal_color").all() as { color: string; n: number }[]
  const count = (color: string): number => worn.find((one) => one.color === color)?.n ?? 0
  return [...GOAL_COLORS].sort((a, b) => count(a) - count(b))[0]
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
/**
 * Ten more minutes (or `ms`) on the session or break running with a length
 * (that one by `id`, or the newest): from its planned end, or from now once
 * past it. The pill's “+10 min”, its menu, ⌘K and ⌃⌥⌘= all come here, so each
 * is logged the same way. The new planned length, or false with nothing to extend.
 */
export function extendRunning(ms: number, id?: string): number | false {
  const db = database()
  const row = db.prepare(`select id, started_at, planned_ms, paused_ms, paused_at from sessions where ended_at is null and planned_ms > 0
    ${id ? 'and id = ?' : ''} order by started_at desc limit 1`).get(...(id ? [id] : [])) as { id: string; started_at: string; planned_ms: number; paused_ms: number; paused_at: string | null } | undefined
  if (!row || !(ms > 0)) return false
  const at = Date.now()
  const worked = at - new Date(row.started_at).getTime() - row.paused_ms - (row.paused_at ? at - new Date(row.paused_at).getTime() : 0)
  const planned = Math.max(row.planned_ms, worked) + ms
  db.prepare('update sessions set planned_ms = ?, extended_ms = extended_ms + ? where id = ?').run(planned, planned - row.planned_ms, row.id)
  changed()
  return planned
}

export function activeSession(): { title: string; startedAt: string } | null {
  return (database()
    .prepare("select coalesce(t.title, s.goal, 'Focus') as title, s.started_at as startedAt from sessions s left join tasks t on t.id = s.task_id where s.ended_at is null and (t.id is not null or s.kind = 'focus') order by s.started_at desc limit 1")
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
    union all select id, tier, coalesce(nullif(title, ''), label('', body)), kind, private, coalesce(updated_at, created_at), created_at, body, attribution from nuggets where archived_at is null and superseded_by is null and tier != 'card'`
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
    // Due is Review's own list, its daily limit and paused tags kept, so Home never offers a card Review would not.
    const due = (reviewQueue() as { id: string }[]).slice(0, 12)
      .flatMap(({ id }) => { const row = byId.get(id); return row && offered(row) ? [strip(row)] : [] })
    // Unseen means old too: made over three weeks ago and not opened for as long, so nothing new reads "not seen in a while".
    const unseen = blackout ? [] : (db.prepare("select id from nuggets where tier not in ('question', 'goal', 'card') and suspended = 0 and archived_at is null and superseded_by is null and private = 0 and created_at < ? and coalesce(last_visited_at, '') < ? and id not in (select id from note_opens where at >= ?) order by coalesce(last_visited_at, '') limit 8").all(ago(21), ago(21), ago(21)) as { id: string }[])
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
        // Tags out first (the learn deck's tag): the line-marker trim below would leave one as a bare word.
        const text = cardWords(raw).replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '')
        const lines = text.split('\n').map((line) => line.replace(/^[#>*\-\s]+/, '').trim()).filter(Boolean)
        // Never the title again: drop the lines the title already says (a
        // name can be made from the first line or two), then any of its words.
        const flat = (words: string): string => words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const name = flat(card.title)
        while (lines.length && name.includes(flat(lines[0]))) lines.shift()
        let rest = lines.join(' ')
        if (name && flat(rest).startsWith(name)) rest = rest.slice(card.title.length).trim()
        excerpts.set(card.id, cut(rest.replace(/^[:;,.\s]+/, ''), 220))
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
