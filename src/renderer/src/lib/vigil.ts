import { useEffect, useState } from 'react'
import { tagColors } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'
import { MotionGlobalConfig } from 'motion/react'
import { chime, installTicks, setPack, setVolume, soundOn, type PackName } from './sound'
import { useEditorSetup } from './editor-setup'
import { watchBands } from './video-bands'

/**
 * The main process's `vigil:` channels, typed. One generic bridge in the
 * preload, the shapes here, so a new channel is one line on each side.
 */
/** The kinds of milestone, as src/main/celebrate.ts names them. */
export type MomentKind = 'kept' | 'streak' | 'inbox' | 'tasks' | 'year' | 'answered' | 'goalHalf' | 'goal30' | 'goal7' | 'goalDay' | 'goalMade' | 'stickyDone' | 'started' | 'taskDone'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** A GIF from Giphy, downloaded and ready to play (see src/main/giphy.ts). */
export type GiphyMedia = { url: string; video: boolean; name: string; giphy: true; id: string; still?: string; width: number; height: number }

export type Settings = {
  fullWidth: boolean
  /** Narrow, Wide or Full; unset, it follows fullWidth (see widthOf in reading.ts). */
  pageWidth?: 'narrow' | 'wide' | 'full'
  /** A link card's picture: filling its box (cover), or shown whole (contain). */
  linkPictures?: 'fill' | 'whole'
  sounds: boolean
  volume: number
  /** A clock ticks while a focus session runs, and how loud, 0 to 1. */
  sessionTick: boolean
  sessionTickVolume: number
  /** Now and then a light glides across the session bubble. */
  sessionGleam: boolean
  /** The session bubble's smoke on all session, faint; off, only at its start, under the pointer and in the last minute. */
  sessionSmoke: boolean
  motion: boolean
  /** The box grows about its middle when the panel opens or it expands; off, right and down. */
  boxCentred: boolean
  /** The box puts itself away when another app or window takes the focus. */
  boxAutoHide: boolean
  /** Where the box turns up when summoned, and on which screen. */
  boxPlace: 'last' | 'top' | 'centre'
  boxScreen: 'pointer' | 'same'
  soundPack: PackName
  hintRate: number
  rotCount: number
  retention: number
  newPerDay: number
  reviewsPerDay: number
  quietStart: string
  quietEnd: string
  safeMode: boolean
  notify: 'pull' | 'quiet' | 'alerts'
  /** Math as you type in notes. */
  calc: boolean
  /** The note's first line in the top bar once it has scrolled away. */
  topTitle: boolean
  /** Misspelt words underlined as you write. */
  spellcheck: boolean
  /** The spellchecker's languages; none means the system's. */
  spellLanguages: string[]
  /** A key from NOTE_FONTS, or a system font's family name. */
  noteFont: string
  fontNotesOnly: boolean
  headingFont: string
  postcards: boolean
  /** A picture in a note tips toward the pointer; always in Focus and full screen. */
  tiltPictures: boolean
  /** A picture's caption rides beside the pointer while it is on the picture. */
  captionFollows: boolean
  /** A few marks drawn by hand; see components/vigil/marks.tsx. */
  marks: boolean
  blur: boolean
  interfaceSize: 'small' | 'medium' | 'large'
  /** Text in notes, as a scale: 1 is normal. */
  textSize: number
  weeklyReview: boolean
  /** 0 is Sunday. */
  weeklyDay: number
  /** A few minutes' tidy of the last days' captures, offered once a day. */
  dailyTidy: boolean
  examNudges: boolean
  memories: boolean
  weather: boolean
  /** A note's first picture at the end of its row. */
  thumbnails: boolean
  /** Pictures from your own folders at the quiet moments; see components/vigil/scenery.tsx. */
  scenery: boolean
  sceneryFolders: string[]
  sceneryRest: boolean
  sceneryRecap: boolean
  sceneryToday: boolean
  sceneryFocus: boolean
  /** Golden scenes in the morning, dusk in the evening, night at night. */
  sceneryTime: boolean
  /** How far each scene is dimmed toward the page colour, 0 to 1. */
  sceneryDim: number
  /** Turned over by "Show another", so every scene changes at once. */
  sceneryShuffle: number
  /** Pictures behind what has none of its own; '' for plain tiles. See components/vigil/grain.tsx. */
  coversFolder: string
  /** A card on the rare milestones; see components/vigil/celebrate.tsx. */
  celebrate: boolean
  /** GIFs, pictures and short clips it plays from; '' for a grainy cover. */
  celebrationsFolder: string
  /** A file of its own for a kind of milestone, played in place of one from the folder. */
  celebrationPicks: Partial<Record<MomentKind, string[]>>
  /** A GIF from Giphy on each task done (and the milestones), with your own key, searched with these words; starred ones come more often. */
  giphy: boolean
  giphyKey: string
  giphyWords: string
  giphyStars: string[]
  /** A question you are holding comes back now and then as a hint card. */
  questionsBack: boolean
  /** Open goals in a slim strip at the top of Home and Today's page. */
  goalStrip: boolean
  /** The next marked days in the menu bar's menu, under the bars. */
  milestonesInMenu?: boolean
  /** A goal with no log for a week says so in the box. */
  goalNudges: boolean
  /** Each goal's beacon unless it says otherwise. */
  goalBeacon: 'always' | 'sometimes' | 'off'
  tempusDots: boolean
  /** How every bar that fills is drawn; see components/vigil/progress-bar.tsx. */
  progressBars: 'plain' | 'saber' | 'dino'
  /** The focus pill's ring alone, or with the dinosaur running beside it. */
  focusBubble: 'circle' | 'runner' | 'progress'
  /** Where a session's time shows: the bubble, a footer under the note, or both. */
  focusShows: 'bubble' | 'note' | 'both'
  /** A plain Markdown copy of each capture beside the backups; never a private one. */
  markdownCopies: boolean
  /** How far back the Recent panel reaches, in days. */
  recentDays: number
  /** The questions kept in view, shown small while you capture and tidy. */
  pinnedQuestions: boolean
  /** A heading folds away what is under it; only how the note is shown. */
  foldHeadings: boolean
  /** The sections the main window's sidebar lists; the rest sit under More. */
  /** Every sticky note on the desktop shown, or all put away; ⌃⌥⌘N from anywhere. */
  stickiesShown: boolean
  openAtLogin: boolean
  /** Stickies kept out of screen shares and recordings, still seen by you. */
  stickiesUnshared: boolean
  /** Stickies over the desktop picture, softly blurred; off, plain paper. */
  stickiesFrosted: boolean
  stickiesGlass: boolean
  stickiesStir: boolean
  sidebarShown: string[]
  /** The box's tabs, of inbox, today, review, kept and recent. */
  boxTabs: string[]
  /** Keys you changed, by the keys each came with; null is none. See lib/keys.ts. */
  keys: Record<string, string | null>
}

/** Something made in the last few days, for the Recent panel. */
export type Recent = { type: string; id: string; title: string; kind: string; status: string; private: number; at: string }
/** A page a week (`week:` and its Monday) or a month (`month:2026-10`). */
export type PeriodPage = { period: string; exists: boolean; fields: Record<string, string>; body: unknown }
export type PinnedQuestion = { id: string; title: string; pinnedAt: string; clues: number }

/** A picture from the Scenery folders, as the main process describes its smaller copy. */
export type Mood = 'day' | 'dusk' | 'night' | 'interior'
export type Scene = { id: string; url: string; mood: Mood; width: number; height: number; pixel: boolean; color: string; light: number; name?: string; folder?: string; small?: string }

/** A nugget or an article: the same row, told apart by `tier`. */
export type Item = {
  id: string
  tier: 'nugget' | 'article' | 'question' | 'goal'
  kind: string
  title: string
  prompt: string | null
  private: number
  pinnedAt: string | null
  dueAt: string | null
  suspended: number
  reviewed: number
  createdAt: string
  /** When it was last changed; null or its creation time if never. */
  updatedAt: string | null
  captureId: string | null
  remindAt: string | null
  lapses: number
  attribution: string | null
  context: string | null
  mode: 'encounter' | 'pushed'
  supersededBy: string | null
  /** Sittings in which its words were meaningfully rewritten. */
  revisions: number
  /** Put out of sight, not deleted; null while in view. */
  archivedAt: string | null
  /** Why the answer is so: one line under it in review. */
  why: string | null
  /** A question: when it was settled, and how; both null while it is held. */
  closedAt: string | null
  closedHow: 'answered' | 'let go' | 'made it' | 'missed' | null
  /** Its glosses, which on a question are its clues and on a goal its logs. */
  clues: number
  /** A goal: the day it is for and the day it was set, "2026-12-14"; null on anything else. */
  goalAt: string | null
  goalFrom: string | null
  /** How often a goal's beacon shows; null follows Settings. */
  beacon: 'always' | 'sometimes' | 'off' | null
  /** When its newest gloss was written. */
  lastLog: string | null
}
/** On a question, a gloss is a clue; one kept from a capture says which (`MF-12`). */
export type Gloss = { id: string; body: string; author: 'user' | 'ai'; createdAt: string; sourceId?: string | null; sourceKey?: string | null }
export type ItemFull = Item & { body: unknown; origins: string[]; glosses: Gloss[] }
export type Due = Item & { body: unknown; intervals: Record<number, string>; gloss: string | null; exam: string | null }
/** How ready a tag with an exam date is. */
export type Exam = { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }
/** A tagged thing read whole on its tag's page. */
export type TagRead = { id: string; type: string; kind: string; status: string; title: string; label: string; body: unknown; private: boolean; at: string; changed: string; tags: string[] }
/** A capture in one of the two passes; `why` says how it got into the deciding one. */
export type PassItem = { id: string; number: number; label: string; kind: string; status: string; private: number; capturedAt: string; attribution: string | null; body: unknown; backAt: string | null; why?: 'back' | 'untidied' | 'longest' }
export type PassState = { backAt: string | null; tidiedAt: string | null; passedAt: string | null }
/** A month or a year, Wrapped's way. */
export type Recap = {
  label: string
  finished: boolean
  captures: number
  words: number
  busiestDay: { name: string; n: number } | null
  busiestMonth: { name: string; n: number } | null
  tags: { name: string; n: number }[]
  sources: { name: string; n: number }[]
  kept: number
  resolved: number
  discarded: number
  reviews: number
  mostReviewed: { title: string; n: number } | null
  /** The books begun in it, finished or still going, and how many lines were kept from each. */
  books: { title: string; by: string | null; finished: boolean; lines: number }[]
  /** How many different days something was reviewed on. */
  reviewDays: number
  /** What was caught, by kind, most first. */
  kinds: { kind: string; n: number }[]
  /** The same for the month or year before, when anything was caught in it. */
  before: { label: string; kinds: { kind: string; n: number }[] } | null
}

export type Task = {
  id: string
  number: number
  title: string
  status: 'open' | 'done' | 'dropped'
  dueAt: string | null
  allDay: number
  recurrence: string | null
  captureId: string | null
  createdAt: string
  completedAt: string | null
  waitingOn: string | null
  estimate: number | null
  sortOrder: number | null
  repeatUntil: string | null
  /** 1 when it matters more than the rest: it sorts first. */
  important: number
  /** When it must be done by, apart from when you mean to do it. */
  deadline: string | null
  /** 1 when the deadline has a time: "by 5pm". */
  deadlineTimed: number
  /** What is in the way. */
  blocker: string | null
  /** How many times it has been pushed later. */
  reschedules: number
  /** This task's own alert level, over the setting; null follows the setting. */
  notify: 'pull' | 'quiet' | 'alerts' | null
  /** Linear's four: 1 Urgent, 2 High, 3 Medium, 4 Low; 0 for none. High and Urgent are `important`. */
  priority: number
  /** A when with no day: "someday", a month ("2026-10") or a year ("2026"). */
  planFor: string | null
  /** The note it came from, for grouping by it: in the list, not on one task. */
  fromId?: string | null
  fromTitle?: string | null
  subtasks?: Subtask[]
}
export type Subtask = { text: string; done: boolean }
/** What a task was before it was done, so it can be put back. */
/** What a save changed on its own, for an undo to put back: the reschedule count and when it was last told about. */
export type TaskWas = { reschedules: number; notifiedAt: string | null }
export type Finished = { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null }
/** A task made, or the open one with that name already there, which it joined. */
/** What a merge changed, for its undo: the other capture, its words before and after, and this one's status. */
export type Merged = { into: string; was: unknown; joined: unknown; status: string }
/** `resolved`: the captures this took out of the inbox, for its undo to open again. */
export type Made = { id: string; number: number; existed: boolean; resolved?: string[] }
/** What to say after making a task: the usual words, or that it joined one. */
export const taskSaid = (made: Made | null | undefined, fresh: string): string =>
  made?.existed ? `Already a task: T-${made.number}. Linked to it, not added twice` : fresh
export type TaskFull = Task & { notes: unknown; done: { at: string; recap: string | null }[]; subtasks: Subtask[]; linked: { id: string; tier: string; kind: string; title: string }[] }

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null; goal?: string | null; pausedMs: number; pausedAt: string | null }
/** A thought, some context or a picture added to a session while it ran: its timeline, one moment at a time. */
export type LogEntry = { id: string; sessionId: string; at: string; text: string; asset: string | null; assetName: string | null }
/** A session ended on a day, with its task and what was logged in it. */
export type DaySession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string; pausedMs: number; recap: string | null; entries: LogEntry[] }
/** The session running now, as the floating timer shows it. */
export type Focus = { id: string; taskId: string; goal: string; startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null }

export type Pin = { id: string; type: 'capture' | 'nugget' | 'article'; kind: string; title: string; pinnedAt: string; private: number }
export type Stats = {
  exits: { status: string; n: number }[]
  kinds: { kind: string; n: number }[]
  week: number
  lastWeek: number
  nuggets: number
  articles: number
  recall: number
  days: string[]
  hints: { shown: number; up: number | null; down: number | null }
  reviews: { n: number; recalled: number | null }
  hours: { hour: number; n: number }[]
  firstUse: number | null
  tasksDone: number
  sessions: { n: number; minutes: number | null }
  tagsWeek: Record<string, number>
  retention: number
  estimates: { estimated: number | null; spent: number | null }
  lead: { exits: number; glosses: number; reviewDays: number; articles: number }
  leeches: string[]
  day: { captured: number; exits: number; tasks: number; reviews: number }
  year: { captured: number; nuggets: number; articles: number; month: string | null }
  stopped: number
  unprocessed: { now: number; weekAgo: number }
}

export const vigil = {
  /** Other names a note goes by; `setAliases` gives back the list it had, for an undo. */
  aliases: (table: 'captures' | 'nuggets', id: string) => call<string[]>('aliases', table, id),
  setAliases: (table: 'captures' | 'nuggets', id: string, list: string[]) => call<string[] | null>('aliases:set', table, id, list),
  /** Everything made in the `days` before `until` (now), newest first. */
  recent: (days: number, until?: string | null) => call<Recent[]>('recent', days, until),
  period: (period: string) => call<PeriodPage>('period', period),
  savePeriod: (period: string, patch: { fields?: Record<string, string | null>; body?: unknown }) => call('period:save', period, patch),
  /** A year's months, each with what its page says. */
  year: (year: string) => call<({ month: string } & Record<string, string>)[]>('periods:year', year),
  pinnedQuestions: () => call<PinnedQuestion[]>('questions:pinned'),
  /** False when twelve are kept in view already. */
  pinQuestion: (id: string, on: boolean) => call<boolean>('question:pin', id, on),
  /** Where a link held in a field leads: `day:2026-10-05`, `nugget:…`, or a capture's id. */
  linkTitle: (link: string) => call<{ type: string; id: string; title: string; kind: string; private?: number } | null>('link:title', link),
  unmakeCapture: (id: string, origin: string) => call('capture:unmake', id, origin),
  /** Words just lifted out of a note as a capture or an idea, taken back: its toast's Undo. */
  unlift: (type: 'capture' | 'nugget', id: string) => call<boolean>('lifted:undo', type, id),
  settings: () => call<Settings>('settings'),
  setSettings: (patch: Partial<Settings>) => call<Settings>('settings:set', patch),
  /** Every language the spellchecker knows, and the ones it is using. */
  spellingLanguages: () => call<{ all: string[]; on: string[] }>('spelling:languages'),
  backupsWhere: () => call<string>('backups:where'),
  /** The scenes in these folders so far; copies of new pictures are made in the background. */
  scenery: (folders: string[], use: 'scenery' | 'covers' = 'scenery') => call<{ scenes: Scene[]; scanning: boolean }>('scenery', folders, use),
  /** A folder of pictures, picked in the system's own chooser. */
  sceneryFolder: () => call<string | null>('scenery:folder'),
  /** What a celebration can play: the chosen folder's, or the one named. */
  celebrations: (folder?: string) => call<{ url: string; video: boolean; name: string; sprite?: boolean }[]>('celebrations', folder),
  /** The files picked for each kind of milestone, those still there. */
  celebrationPicks: () => call<Partial<Record<MomentKind, { url: string; video: boolean; name: string; sprite?: boolean; path?: string }[]>>>('celebrations:picks'),
  /** A sticky's list just done: its celebration, or null when none may show now. */
  stickyDone: (id: string) => call<{ id: string; kind: MomentKind; rank: number; headline: string; mark: string; tint: string } | null>('celebrations:sticky', id),
  /** A GIF from Giphy for a card now, or null to play what it would anyway. */
  celebrationGiphy: () => call<GiphyMedia | null>('celebrations:giphy'),
  /** The day's Giphy results with their still pictures, to star; why there are none, if none. */
  giphyList: () => call<{ gifs: { id: string; title: string; still: string }[]; why?: 'off' | 'key' | 'offline' }>('celebrations:giphy:list'),
  /** One of them, downloaded, to see in a card. */
  giphyOne: (id: string) => call<GiphyMedia | null>('celebrations:giphy:one', id),
  /** GIFs, pictures or clips, picked in the system's own chooser. */
  celebrationFiles: () => call<string[]>('celebrations:choose'),
  // Up for private, down for not, from whichever menu or button switched it.
  setPrivate: (table: 'captures' | 'nuggets', id: string, on: boolean, quiet = false) => (quiet || chime(on ? 'on' : 'off'), call('private', table, id, on)),
  /** False when three are pinned already. */
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call<boolean>('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  reviewTuning: () => call<{ cap: number; tuned: boolean; behind: number }>('review:tuning'),
  promote: (id: string, words?: string) => call<string | null>('promote', id, words),
  /** `forgetWho`: the source was asked for while promoting, so it goes too. */
  unpromote: (captureId: string, nuggetId: string, forgetWho = false) => call<boolean>('promote:undo', captureId, nuggetId, forgetWho),
  /** What it came from, what it became, and what links to it. */
  mentions: (id: string) => call<Record<'linked' | 'unlinked' | 'out' | 'named', { type: string; id: string; title: string; snippet: string; private?: number }[]> & { me: string }>('mentions', id),
  linkMention: (sourceType: string, sourceId: string, targetId: string) => call<boolean>('mention:link', sourceType, sourceId, targetId),
  /** Notes sharing tags with this one and not linked to it, rarest tags first. */
  related: (id: string) => call<{ type: string; id: string; title: string; excerpt: string; private: boolean; at: string; shared: string[] }[]>('related', id),
  lineage: (id: string) => call<Record<'from' | 'became' | 'linked', { type: string; id: string; title: string; private?: number }[]>>('lineage', id),
  newArticle: () => call<string>('article:new'),
  findItems: (query: string) => call<{ id: string; tier: 'nugget' | 'article' | 'question'; title: string }[]>('items:find', query),
  toTask: (id: string, plain?: { from: number; to: number; text: string }[]) => call<Made | null | 'not-open'>('toTask', id, plain),
  items: (tier: 'nugget' | 'article' | 'question' | 'goal') => call<Item[]>('items', tier),
  /** A question, from nothing or from a capture whose words become its first clue; `dropQuestion` takes it back. */
  newQuestion: (title: string, captureId?: string) => call<string>('question:new', title, captureId),
  dropQuestion: (id: string) => call<boolean>('question:drop', id),
  /** A dated clue: your words, or a capture's (which then leaves the inbox). Gives back its id, for `dropClue`. */
  addClue: (id: string, text: string, sourceId?: string) => call<string | null>('clue', id, text, sourceId),
  dropClue: (clue: string) => call('clue:drop', clue),
  /** Got it (an article, seeded and linked) or let go; `reopenQuestion` holds it again. */
  closeQuestion: (id: string, how: 'answered' | 'let go', again = false) => call<{ article: string | null } | null>('question:close', id, how, again),
  reopenQuestion: (id: string, article?: string | null) => call('question:reopen', id, article),
  /** A goal: its name, the day it is for, the day it was set (today if not said) and why it matters. `dropGoal` takes it back. */
  newGoal: (title: string, target: string, from?: string | null, why?: string | null) => call<string | null>('goal:new', title, target, from, why),
  goalDates: (id: string, dates: { target?: string; from?: string }) => call<boolean | null>('goal:dates', id, dates),
  closeGoal: (id: string, how: 'made it' | 'missed' | 'let go') => call<boolean | null>('goal:close', id, how),
  reopenGoal: (id: string) => call<boolean>('goal:reopen', id),
  dropGoal: (id: string) => call<boolean>('goal:drop', id),
  /** How often a goal's beacon shows; null follows Settings. */
  setBeacon: (id: string, mode: 'always' | 'sometimes' | 'off' | null) => call<boolean>('goal:beacon:set', id, mode),
  /** A question still open, come back as a hint; null most of the time. */
  questionBack: () => call<{ id: string; title: string; createdAt: string; clues: number; event: number } | null>('question:back'),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; base: unknown; title: string; prompt: string | null; kind: string; suspended: boolean; attribution: string | null; context: string | null; mode: string; why: string | null }>) =>
    call('item:save', id, patch),
  article: (ids: string[]) => call<string>('article', ids),
  /** A dated thought on any item or capture; gives back its id, for `dropGloss`. */
  gloss: (id: string, text: string) => call<string>('gloss', id, text),
  dropGloss: (gloss: string) => call('clue:drop', gloss),
  /** Every gloss on it, newest first. */
  glosses: (id: string) => call<Gloss[]>('glosses', id),
  queue: () => call<Due[]>('review:queue'),
  dueCount: () => call<number>('review:counts'),
  grade: (id: string, grade: 1 | 2 | 3 | 4, ms: number) => call<string>('review:grade', id, grade, ms),
  tasks: () => call<Task[]>('tasks'),
  task: (id: string) => call<TaskFull | null>('task', id),
  /** `today`: with no date in the words, it is for today. */
  addTask: (text: string, origin?: string, today = false) => call<Made>('task:add', text, origin, today),
  saveTask: (id: string, patch: Partial<{ title: string; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number | null; important: number; deadline: string | null; blocker: string | null; reschedules: number; notify: string | null; priority: number; plan: string | null; notifiedAt: string | null }>) =>
    call<TaskWas | true>('task:save', id, patch),
  /** Gives back what it was, for `undoneTask`. */
  doneTask: (id: string) => call<Finished>('task:done', id),
  /** Open again on the date it had, and that time done no longer counted: a routine's undo too. */
  undoneTask: (id: string, was: Finished) => call('task:undone', id, was),
  /** A task made by mistake: see `makeTask`. */
  unmakeTask: (id: string, existed: boolean, links: string[], reopen: string[]) => call('task:unmake', id, existed, links, reopen),
  /** Reviews falling on each of the next `days` days, today with what is late. */
  reviewLoad: (days: number) => call<number[]>('review:load', days),
  tags: () => call<{ tag: string; count: number; color: string | null; action: boolean; examAt: string | null }[]>('tags'),
  tagMeta: () => call<{ tag: string; color: string | null; action: number }[]>('tag:meta'),
  setTag: (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null }) => call('tag:set', tag, patch),
  exams: () => call<Exam[]>('exams'),
  history: (id: string) => call<{ reviews: { at: string; grade: number }[]; dueAt: string | null }>('review:history', id),
  source: (id: string) => call<{ type: string; id: string; title: string; body: unknown } | null>('review:source', id),
  nudge: () => call<{ kind: 'exam' | 'weekly' | 'tidy' | 'goal'; view: string; id?: string; label: string; text: string } | null>('nudge'),
  memory: () => call<{ id: string; captureId: string; kind: string; title: string; body: unknown; event: number; memory: string } | null>('memory'),
  /** Old captures still open; -1 when the book has never had one old enough to rot. */
  rotLeft: () => call<number>('rot:left'),
  rotWaiting: () => call<number>('rot:waiting'),
  recap: (period: 'month' | 'year') => call<Recap>('recap', period),
  supersede: (id: string, truth: string) => call<string>('supersede', id, truth),
  mergeCapture: (id: string, intoNumber: number) => call<Merged | null>('capture:merge', id, intoNumber),
  /** A merge taken back: the other's words as they were, and this one back where it was. */
  unmerge: (id: string, merged: Merged) => call<boolean>('capture:merge:undo', id, merged),
  hintRate: () => call<{ rate: number; tuned: boolean; shown: number; stopped: number }>('hints:rate'),
  tag: (tag: string) => call<{ tag: string; id: string; type: string; title: string; private: boolean }[]>('tag', tag),
  /** Everything carrying a tag, whole, newest first, each with its other tags. */
  tagRead: (tag: string) => call<TagRead[]>('tag:read', tag),
  /** The daily tidy pass and the weekly deciding pass: what each walks. */
  tidyList: () => call<PassItem[]>('pass:tidy'),
  decideList: () => call<PassItem[]>('pass:decide'),
  passWaiting: () => call<{ tidy: number; decide: number }>('pass:waiting'),
  tidied: (id: string) => call('pass:tidied', id),
  /** Come back to this on deciding day; `at` puts back the mark it had. */
  comeBack: (id: string, on: boolean, at?: string | null) => call('pass:back', id, on, at),
  keepOpen: (id: string) => call('pass:keep', id),
  unkeepOpen: (id: string, was: PassState) => call('pass:unkeep', id, was),
  passSeen: (id: string) => call('pass:seen', id),
  passState: (id: string) => call<PassState | null>('pass:state', id),
  /** A tag put on or taken off a capture's words; gives the words back, or null for a tag that cannot be one. */
  passTag: (id: string, tag: string, on: boolean) => call<unknown>('pass:tag', id, tag, on),
  stats: () => call<Stats>('stats'),
  exportAll: () => call<string | null>('export'),
  /** Stored pictures and files no note points at; `extra` is text only a window holds, like the box's draft. */
  /** Null when stopped, or overtaken by a newer look. */
  unusedFind: (extra: string[]) => call<{ name: string; size: number; image: boolean; at: number }[] | { error: string } | null>('unused:find', extra),
  unusedStop: () => call('unused:stop'),
  unusedBin: (names: string[], extra: string[]) => call<{ moved: number; size: number }>('unused:bin', names, extra),
  bury: (id: string) => call('review:bury', id),
  taskFrom: (ids: string[], text: string) => call<Made | null>('tasks:from', ids, text),
  bulk: (ids: string[], change: { tag?: string; capturedAt?: string }) => call<number>('captures:bulk', ids, change),
  setCapture: (id: string, field: 'attribution' | 'medium' | 'capturedAt' | 'origin', value: string | number | null) => call('capture:set', id, field, value),
  linkSession: (id: string) => call('capture:session', id),
  nuggetFrom: (text: string, origin: { captureId?: string; attribution?: string | null }) => call<string>('nugget:from', text, origin),
  random: () => call<{ id: string; kind: string; title: string; body: unknown }[]>('random'),
  study: (itemId: string, text: string) => call<Made>('study', itemId, text),
  /** What you have typed in a field before, most used first. */
  values: (field: 'attribution' | 'medium') => call<string[]>('values', field),
  renameTag: (from: string, to: string) => call<string | null>('tag:rename', from, to),
  remind: (table: 'captures' | 'nuggets', id: string, at: string | null) => call('remind', table, id, at),
  similar: (text: string) => call<{ id: string; number: number; title: string; score: number } | null>('similar', text),
  sessions: (taskId: string) => call<Session[]>('sessions', taskId),
  startSession: (taskId: string, goal?: string, plannedMs?: number | null) => call<string>('session:start', taskId, goal, plannedMs),
  focusNow: () => call<Focus | null>('focus:now'),
  // A timer that ran out while Vigil was closed, said once.
  focusMissed: () => call<string | null>('focus:missed'),
  /** A countdown with no task behind it, shown in the floating timer: "5m tea". */
  startTimer: (goal: string, ms: number) => call<string>('timer:start', goal, ms),
  pauseSession: (id: string) => call('session:pause', id),
  resumeSession: (id: string) => call('session:resume', id),
  cancelSession: (id: string) => call('session:cancel', id),
  endSession: (id: string, recap: string, keep: boolean, close = false) => call('session:end', id, recap, keep, close),
  /** The recap of a session already ended; gives back the one it had, for undo. */
  recapSession: (id: string, recap: string) => call<string>('session:recap', id, recap),
  /** A session's log, oldest first; add to it from the pill, take an entry back out. */
  sessionLog: (sessionId: string) => call<LogEntry[]>('session-log', sessionId),
  logToSession: (sessionId: string, text: string, asset?: string | null, assetName?: string | null) => call<LogEntry | null>('session-log:add', sessionId, text, asset, assetName),
  unlogFromSession: (id: string) => call('session-log:remove', id),
  /** What every session of a task logged, oldest first. */
  taskSessionLog: (taskId: string) => call<LogEntry[]>('session-log:task', taskId),
  /** The sessions that ended on a day, each with its log. */
  daySessions: (day: string) => call<DaySession[]>('session-log:day', day)
}

/**
 * The stand-in a list starts as, before its first answer comes back. An empty
 * list then means "not read yet", not "there is none": a view asks `unloaded`
 * before saying "No articles yet", so the empty page never flashes on the way
 * to a full one. Kept by the object itself, so nothing else has to be passed on.
 */
const STAND_INS = new WeakSet<object>()
export const unread = <T,>(initial: T): T => (initial && typeof initial === 'object' && STAND_INS.add(initial), initial)
export const unloaded = (value: unknown): boolean => !!value && typeof value === 'object' && STAND_INS.has(value)

/**
 * Something read from the main process, read again whenever any window writes.
 * The one way every view stays current without each one wiring it up.
 */
export function useLive<T>(read: () => Promise<T>, initial: T, deps: unknown[] = [], kinds?: ('capture' | 'item')[]): T {
  const [value, setValue] = useState<T>(() => unread(initial))
  useEffect(() => {
    // Every write anywhere reloads every list, a note being typed in included:
    // an answer the same as the last keeps the old value, so nothing redraws.
    let last: string | undefined
    const load = (): void => void read().then((next) => {
      const now = JSON.stringify(next)
      if (now === last) return
      last = now
      setValue(next)
    })
    load()
    // `kinds`: what it shows, so a save of something else leaves it be.
    return window.api.captures.onChange(load, kinds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

// Dates are said the same way everywhere: the helpers live with Day.js, shared with the main process.
export { when, whenInLine, interval } from '../../../main/dates'

/** A title without its `#tags`, and the tags: so a row can show them as pills. */
export function splitTags(text: string): { text: string; tags: string[] } {
  const tags = [...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase())
  return { text: text.replace(/(?:^|\s)#[a-z][\w-]*/gi, '').trim(), tags }
}

/**
 * The settings that change how the whole app looks and sounds, applied the
 * moment they change: the page width as a flag on the document, which the
 * stylesheet reads, and the sounds as a switch the chimes check.
 */
/** The root size for each interface size; small is the size the app was drawn at. */
export const INTERFACE_SIZES = { small: 16, medium: 17, large: 18.5 } as const

export function useAppearance(): void {
  const settings = useLive(vigil.settings, null as Settings | null)
  // Every sticky shown or put away at once (⌃⌥⌘N, the menu bar, ⌘K, Settings): said quietly by the one window main picks.
  useEffect(() => window.api.onStickiesShown((shown) => chime(shown ? 'untuck' : 'tuck')), [])
  // Tag colours from the Tags page, for every editor in this window.
  const meta = useLive(vigil.tagMeta, [] as Awaited<ReturnType<typeof vigil.tagMeta>>)
  useEffect(() => {
    tagColors.clear()
    for (const row of meta) if (row.color) tagColors.set(row.tag.toLowerCase(), row.color as BlockColor)
  }, [meta])
  useEffect(installTicks, [])
  // YouTube thumbnails in notes shown without their black bands.
  useEffect(watchBands, [])
  // The editor's sounds, math, font and text size.
  useEditorSetup(settings)
  useEffect(() => {
    if (!settings) return
    const width = settings.pageWidth ?? (settings.fullWidth ? 'full' : 'narrow')
    document.documentElement.dataset.width = width === 'narrow' ? 'page' : width
    document.documentElement.dataset.linkPictures = settings.linkPictures ?? 'fill'
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off'
    document.documentElement.toggleAttribute('data-postcards', !!settings.postcards)
    document.documentElement.dataset.marks = settings.marks === false ? 'off' : 'on'
    document.documentElement.dataset.bars = settings.progressBars ?? 'plain'
    document.documentElement.toggleAttribute('data-noblur', settings.blur === false)
    // Inherited by every editor and field below; on, each keeps its own say.
    if (settings.spellcheck === false) document.documentElement.spellcheck = false
    else document.documentElement.removeAttribute('spellcheck')
    // Every size in the app is in rem, so the root's size scales all of it at once.
    document.documentElement.style.fontSize = `${INTERFACE_SIZES[settings.interfaceSize] ?? INTERFACE_SIZES.medium}px`
    // Off, nothing animates. The system's Reduce motion is the MotionConfig's
    // (main.tsx): things still fade there, but nothing slides or springs.
    MotionGlobalConfig.skipAnimations = !settings.motion
    soundOn(settings.sounds)
    setVolume(settings.volume)
    setPack(settings.soundPack)
  }, [settings?.fullWidth, settings?.pageWidth, settings?.linkPictures, settings?.motion, settings?.postcards, settings?.marks, settings?.progressBars, settings?.blur, settings?.spellcheck, settings?.interfaceSize, settings?.sounds, settings?.volume, settings?.soundPack])
}
