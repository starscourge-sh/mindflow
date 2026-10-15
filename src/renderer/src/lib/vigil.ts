import { watchAccentInk } from './on-accent'
import { useEffect, useState } from 'react'
import { tagColors } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'
import { MotionGlobalConfig } from 'motion/react'
import { chime, installTicks, setPack, setVolume, soundOn, type PackName } from './sound'
import { useEditorSetup } from './editor-setup'
import { watchBands } from './video-bands'
import type { Bucket } from '../../../main/study'
import { TAG, tagsIn as tagWords, withoutTags } from '../../../main/tag-words'

/** The kinds of milestone, as src/main/celebrate.ts names them. */
export type MomentKind = 'kept' | 'streak' | 'inbox' | 'tasks' | 'year' | 'answered' | 'goalHalf' | 'goal30' | 'goal7' | 'goalDay' | 'goalMade' | 'stickyDone' | 'started' | 'taskDone'

/**
 * The main process's `vigil:` channels, typed. One generic bridge in the
 * preload, the shapes here, so a new channel is one line on each side.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** A GIF from Giphy, downloaded and ready to play (see src/main/giphy.ts). */
export type GiphyPin = { id: string; title: string; mp4: string; still: string; width: number; height: number }
export type GiphyMedia = { url: string; video: boolean; name: string; giphy: true; id: string; still?: string; width: number; height: number }

export type Settings = {
  fullWidth: boolean
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
  sounds: boolean
  volume: number
  /** A clock ticks while a focus session runs, and how loud, 0 to 1. */
  sessionTick: boolean
  sessionTickVolume: number
  /** Which tick: one of TICKS in lib/sound.ts. */
  sessionTickSound?: 'old' | 'wall' | 'watch' | 'desk'
  /** Now and then a light glides across the session bubble. */
  sessionGleam: boolean
  /** The session bubble's smoke on all session, faint; off, only at its start, under the pointer and in the last minute. */
  sessionSmoke: boolean
  motion: boolean
  /** The box grows about its middle when the panel opens or it expands; off, right and down. */
  boxCentred: boolean
  /** The box puts itself away when another app or window takes the focus. */
  boxAutoHide: boolean
  /** Quick capture steps back to half strength when another app has the focus. */
  boxDim: boolean
  /** Quick capture's buttons stay out of sight until the pointer is over them (⌥⌘,). */
  boxHideButtons?: boolean
  /** The Dock's icon: the gathered lights, or the leaves in bronze or in gold. */
  appIcon?: 'lights' | 'bronze' | 'gold'
  /** A single word's meaning in quick capture: whenever it holds one word, only once Word is picked, or never. */
  wordMeanings?: 'one-word' | 'word-kind' | 'off'
  /** Where the box turns up when summoned, and on which screen. */
  boxPlace: 'last' | 'top' | 'centre'
  boxScreen: 'pointer' | 'same'
  soundPack: PackName
  hintRate: number
  rotCount: number
  retention: number
  newPerDay: number
  reviewsPerDay: number
  /** A reminder at this time ("09:00") when cards are due; null is off. */
  reviewReminder?: string | null
  /** How long a new card lasts after each first grade, fitted to your reviews; null is the defaults. */
  fsrsFirst?: number[] | null
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
  /** The postcard's border: 'auto' takes it from the theme (main.css). */
  postcardBorder?: 'auto' | 'white' | 'cream' | 'black' | 'accent'
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
  /** A note's cover with no picture of its own: a bundled paper drawing, or a gradient (the bundled ones, or the Covers folder's). */
  coverStyle?: 'paper' | 'gradients'
  /** A card on the rare milestones; see components/vigil/celebrate.tsx. */
  celebrate: boolean
  /** GIFs, pictures and short clips it plays from; '' for a grainy cover. */
  celebrationsFolder: string
  /** A file of its own for a kind of milestone, played in place of one from the folder. */
  celebrationPicks: Partial<Record<MomentKind, string[]>>
  /** What each kind plays: Vigil's drawing, your file, or Giphy (src/main/moment-source.ts). */
  celebrationSources: Partial<Record<MomentKind, 'drawing' | 'file' | 'giphy'>>
  /** Giphy: a random GIF for these words when a moment has none pinned; starred ones come more often. */
  giphyKey: string
  giphyWords: string
  giphyStars: string[]
  /** One GIF from Giphy pinned for a kind of moment: after its own files, before a random one. */
  giphyPins: Partial<Record<MomentKind, GiphyPin>>
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
  /** The session pill under the notch (on a Mac with one), or wherever you put it. */
  pillSits: 'notch' | 'free'
  /** The five-second rule: a session counts 5 to 1, with ticks, before it starts. */
  countIn: boolean
  /** On Sundays, Home sums up the week. */
  weeklyDigest: boolean
  /** Captures untouched this many days are put away into Archived at the start of a day; 0 never. */
  autoArchive: number
  /** Your Mac's calendar events on Today and the week, read only. */
  macCalendar: boolean
  /** When the working day ends, "22:00": Today counts the hours left until then. */
  dayEnd: string
  /** About how many hours a working day holds, for whether a day fits: its meetings and tasks against it. */
  workHours: number
  /** Closing the day, offered once an evening after `closeDayAt`. */
  closeDay: boolean
  closeDayAt: string
  /** After `closeDayAt`, a “For tomorrow” box at the end of Today and Today's page: a line each, tasks for tomorrow. */
  tomorrowBox?: boolean
  /** Tomorrow's first task, picked when the day was closed: it leads Today and the day brief on `day`. */
  frog: { id: string; day: string } | null
  /** A plain Markdown copy of each capture beside the backups; never a private one. */
  markdownCopies: boolean
  /** How far back the Recent panel reaches, in days. */
  recentDays: number
  /** The questions kept in view, shown small while you capture and tidy. */
  pinnedQuestions: boolean
  /** A heading folds away what is under it; only how the note is shown. */
  foldHeadings: boolean
  /** Every sticky note on the desktop shown, or all put away; ⌃⌥⌘N from anywhere. */
  stickiesShown: boolean
  openAtLogin: boolean
  /** Which windows show in screen shares and recordings (true) or are blank there, still seen by you (false, the default). */
  inRecordings: { main: boolean; box: boolean; stickies: boolean; bubble: boolean }
  /** Stickies over the desktop picture, softly blurred; off, plain paper. */
  stickiesFrosted: boolean
  stickiesGlass: boolean
  stickiesStir: boolean
  /** The sections the main window's sidebar lists; one switched off is not in it at all. */
  sidebarShown: string[]
  /** How long a note stays under the sidebar's Open today before it moves to Earlier: overnight, after a week, or until closed. */
  sidebarOpenFor: 'day' | 'week' | 'never'
  /** The box's tabs, of inbox, today, review, kept and recent. */
  boxTabs: string[]
  /** The sidebar's places, the box's tabs and the pins (as type:id) in your own order; empty is the usual one. */
  sidebarOrder: string[]
  boxTabsOrder: string[]
  pinOrder: string[]
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
export type Scene = { id: string; url: string; mood: Mood; width: number; height: number; pixel: boolean; color: string; light: number; name?: string; folder?: string; root?: string; small?: string }

/** A nugget or an article: the same row, told apart by `tier`. */
export type Item = {
  id: string
  /** A card is a "question :: answer" line written in a note (lineOf says which). */
  tier: 'nugget' | 'article' | 'question' | 'goal' | 'card'
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
  /** Where it came from (a book, a site), as its capture had it; empty on older gems. */
  medium?: string | null
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
  /** A card written in a note: that note, as `capture:…`, `nugget:…` or `day:2026-10-10`. */
  lineOf?: string | null
  /** Starred in Review (S): when, or null. */
  starredAt?: string | null
}
/** On a question, a gloss is a clue; one kept from a capture says which (`V-12`). */
export type Gloss = { id: string; body: string; author: 'user' | 'ai'; createdAt: string; sourceId?: string | null; sourceKey?: string | null }
export type ItemFull = Item & { body: unknown; origins: string[]; glosses: Gloss[] }
export type Due = Item & { body: unknown; intervals: Record<number, string>; gloss: string | null; exam: string | null }
/** How ready a tag with an exam date is. */
export type Exam = { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }
/** A tagged thing read whole on its tag's page. */
export type TagRead = { id: string; type: string; kind: string; status: string; title: string; label: string; body: unknown; private: boolean; at: string; changed: string; tags: string[]; keptIn?: string | null }
/** A capture in one of the two passes; `why` says how it got into the deciding one. */
export type PassItem = { id: string; number: number; label: string; kind: string; status: string; private: number; capturedAt: string; attribution: string | null; medium?: string | null; body: unknown; backAt: string | null; why?: 'back' | 'untidied' | 'longest' }
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
/** What a save changed on its own, for an undo to put back: the reschedule count and when it was last told about. */
export type TaskWas = { reschedules: number; notifiedAt: string | null }
/** What a task was before it was done, so it can be put back. */
export type Finished = { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null }
/** What a merge changed, for its undo: the other capture, its words before and after, and this one's status. */
export type Merged = { into: string; was: unknown; joined: unknown; status: string }
/** `resolved`: the captures this took out of the inbox, for its undo to open again. */
/** A task made, or the open one with that name already there, which it joined. */
export type Made = { id: string; number: number; existed: boolean; resolved?: string[]
  /** A note written as a list made a task a line: the tasks after the first, and what they came to ("4 tasks, 2 steps"). */
  also?: { id: string; existed: boolean }[]; said?: string; steps?: number }
/** What to say after making a task: the usual words, or that it joined one. */
export const taskSaid = (made: Made | null | undefined, fresh: string): string =>
  made?.existed ? 'Already on your list, so this was linked to that task instead of adding it twice' : fresh
export type TaskFull = Task & { /** Where to pick up, said as its last session ended. */ pickup?: string | null; notes: unknown; done: { at: string; recap: string | null }[]; subtasks: Subtask[]; linked: { id: string; tier: string; kind: string; title: string }[] }

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null; goal?: string | null; pausedMs: number; pausedAt: string | null; /** Abandoned: kept in the log, counted in no total. */ abandonedAt?: string | null }
/** A thought, some context or a picture added to a session while it ran: its timeline, one moment at a time. */
export type LogEntry = { id: string; sessionId: string; at: string; text: string; asset: string | null; assetName: string | null }
/** A session ended on a day, with its task and what was logged in it. */
export type DaySession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string; pausedMs: number; recap: string | null; abandonedAt?: string | null; entries: LogEntry[] }
/** The session running now, as the floating timer shows it. */
export type Focus = { id: string; taskId: string; goal: string; startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null; /** Pomodoro rounds, as JSON (lib/timer.ts RoundsAt); null for any other session. */ rounds?: string | null; /** 'break' for a break taken after a session. */ kind?: string | null; /** Time added with +10 min, already in plannedMs. */ extendedMs?: number }

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
  /** For a month's calendar: the days with a page, and how many reviews each day had. */
  dayMarks: (from: string, to: string) => call<{ pages: string[]; reviews: Record<string, number> }>('days:marks', from, to),
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
  /** When the last backup was made (ms), why backups are failing now if they are, and whether a folder of your own is in use. */
  backupStatus: () => call<{ at: number | null; failing: string | null; chosen: boolean }>('backups:status'),
  /** A backup made now, and how they stand after it. */
  backupNow: () => call<{ at: number | null; failing: string | null; chosen: boolean }>('backups:now'),
  /** The backups' folder, opened in Finder. */
  showBackups: () => call('backups:show'),
  /** Pick another folder for the backups, or go back to the usual place: a backup runs there at once. Null when the picker was closed. */
  chooseBackups: (usual = false) => call<{ at: number | null; failing: string | null; chosen: boolean } | null>('backups:choose', usual),
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
  /** Giphy searched with words of your own, for a moment's row in Settings. */
  giphySearch: (words: string) => call<{ gifs: { id: string; title: string; still: string }[]; why?: 'key' | 'offline' | 'none' }>('celebrations:giphy:search', words),
  /** One of those, downloaded: what to save as the pin, and what to see in a card. */
  giphyPick: (id: string) => call<{ pin: GiphyPin; media: GiphyMedia } | null>('celebrations:giphy:pick', id),
  /** The GIF pinned for this kind of moment, ready to play (offline too), or null. */
  giphyPinned: (kind: MomentKind) => call<GiphyMedia | null>('celebrations:giphy:pinned', kind),
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
  /** `whole`: one task however many lines; otherwise a list makes a task a line, and a page of mixed lines comes back to be sorted. */
  toTask: (id: string, plain?: { from: number; to: number; text: string }[], whole?: boolean) => call<Made | null | 'not-open' | { mixed: string }>('toTask', id, plain, whole),
  items: (tier: 'nugget' | 'article' | 'question' | 'goal') => call<Item[]>('items', tier),
  /** A question, from nothing or from a capture whose words become its first clue; `dropQuestion` takes it back. */
  newQuestion: (title: string, captureId?: string) => call<string>('question:new', title, captureId),
  dropQuestion: (id: string) => call<boolean>('question:drop', id),
  /** A dated clue: your words, or a capture's (which then leaves the inbox). Gives back its id, for `dropClue`. */
  addClue: (id: string, text: string, sourceId?: string) => call<string | null>('clue', id, text, sourceId),
  dropClue: (clue: string) => call('clue:drop', clue),
  /** A clue or log deleted, given back whole for `putClue` to restore: same id, same day, same source. */
  cutClue: (clue: string) => call<{ id: string; item_id: string; body: string; created_at: string; source_id: string | null } | null>('clue:cut', clue),
  putClue: (row: { id: string; item_id: string; body: string; created_at: string; source_id: string | null }) => call<boolean>('clue:put', row),
  /** Got it (an article, seeded and linked) or let go; `reopenQuestion` holds it again. */
  closeQuestion: (id: string, how: 'answered' | 'let go', again = false, at?: string | null) => call<{ article: string | null } | null>('question:close', id, how, again, at),
  reopenQuestion: (id: string, article?: string | null) => call('question:reopen', id, article),
  /** A goal: its name, the day it is for, the day it was set (today if not said) and why it matters. `dropGoal` takes it back. */
  newGoal: (title: string, target: string, from?: string | null, why?: string | null) => call<string | null>('goal:new', title, target, from, why),
  goalDates: (id: string, dates: { target?: string; from?: string }) => call<boolean | null>('goal:dates', id, dates),
  closeGoal: (id: string, how: 'made it' | 'missed' | 'let go', at?: string | null) => call<boolean | null>('goal:close', id, how, at),
  reopenGoal: (id: string) => call<boolean>('goal:reopen', id),
  dropGoal: (id: string) => call<boolean>('goal:drop', id),
  /** How often a goal's beacon shows; null follows Settings. */
  setBeacon: (id: string, mode: 'always' | 'sometimes' | 'off' | null) => call<boolean>('goal:beacon:set', id, mode),
  /** A question still open, come back as a hint; null most of the time. */
  questionBack: () => call<{ id: string; title: string; createdAt: string; clues: number; event: number } | null>('question:back'),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; base: unknown; title: string; prompt: string | null; kind: string; suspended: boolean; attribution: string | null; medium: string | null; context: string | null; mode: string; why: string | null }>) =>
    call('item:save', id, patch),
  article: (ids: string[]) => call<string>('article', ids),
  /** A dated thought on any item or capture; gives back its id, for `dropGloss`. */
  gloss: (id: string, text: string) => call<string>('gloss', id, text),
  dropGloss: (gloss: string) => call('clue:drop', gloss),
  /** The weather where you are now ("12°C, light rain"), or null when it is off or offline. */
  weatherNow: () => call<string | null>('weather:now'),
  /** A gloss or clue reworded in place. */
  editGloss: (gloss: string, text: string) => call<boolean>('gloss:edit', gloss, text),
  /** Every gloss on it, newest first. */
  glosses: (id: string) => call<Gloss[]>('glosses', id),
  queue: () => call<Due[]>('review:queue'),
  dueCount: () => call<number>('review:counts'),
  grade: (id: string, grade: 1 | 2 | 3 | 4, ms: number) => call<string>('review:grade', id, grade, ms),
  tasks: () => call<Task[]>('tasks'),
  /** Every task's source captures, as pairs: one read for a whole list. */
  taskSources: () => call<{ task: string; capture: string }[]>('tasks:sources'),
  task: (id: string) => call<TaskFull | null>('task', id),
  /** `today`: with no date in the words, it is for today. */
  addTask: (text: string, origin?: string, today = false) => call<Made>('task:add', text, origin, today),
  saveTask: (id: string, patch: Partial<{ title: string; until: string | null; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number | null; important: number; deadline: string | null; blocker: string | null; reschedules: number; notify: string | null; priority: number; plan: string | null; notifiedAt: string | null }>) =>
    call<TaskWas | true>('task:save', id, patch),
  /** Gives back what it was, for `undoneTask`. */
  doneTask: (id: string) => call<Finished>('task:done', id),
  /** Open again on the date it had, and that time done no longer counted: a routine's undo too. */
  undoneTask: (id: string, was: Finished) => call('task:undone', id, was),
  /** A task made by mistake: see `makeTask`. */
  unmakeTask: (id: string, existed: boolean, links: string[], reopen: string[]) => call('task:unmake', id, existed, links, reopen),
  /** Reviews falling on each of the next `days` days, today with what is late. */
  reviewLoad: (days: number) => call<number[]>('review:load', days),
  tags: () => call<{ tag: string; count: number; color: string | null; action: boolean; examAt: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }[]>('tags'),
  tagMeta: () => call<{ tag: string; color: string | null; action: number }[]>('tag:meta'),
  setTag: (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }) => call('tag:set', tag, patch),
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
  /** A correction taken back: the new gem gone, the old one as it was. */
  unsupersede: (id: string, fixed: string, suspended: boolean) => call<boolean>('unsupersede', id, fixed, suspended),
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
  /** Stored pictures and files no note points at; `extra` is text only a window holds, like the box's draft. Null when stopped, or overtaken by a newer look. */
  unusedFind: (extra: string[]) => call<{ name: string; size: number; image: boolean; at: number }[] | { error: string } | null>('unused:find', extra),
  unusedStop: () => call('unused:stop'),
  unusedBin: (names: string[], extra: string[]) => call<{ moved: number; size: number }>('unused:bin', names, extra),
  bury: (id: string) => call('review:bury', id),
  /** The last grade or Not today on this card taken back: its schedule as it was. False when it was not the last. */
  ungrade: (id: string) => call<boolean>('review:ungrade', id),
  /** How many cards each practice round holds now. */
  buckets: () => call<Record<Bucket | 'starred', number>>('review:buckets'),
  /** A short extra round of one kind of card, from all your gems, or the starred ones. */
  round: (bucket: Bucket | 'starred') => call<Due[]>('review:round', bucket),
  /** A star on a card, or off. */
  star: (id: string, on: boolean) => call<boolean>('review:star', id, on),
  /** What Review knows about a card, to say how it decides when it comes back. */
  why: (id: string) => call<{ retention: number; reviews: number; seen: boolean; stability: number | null; difficulty: number | null; recall: number | null; lastDays: number | null; fitted: boolean } | null>('review:why', id),
  /** How long a card would hold after each of its reviews, replayed from its grades. */
  strength: (id: string) => call<{ at: string; grade: number; days: number }[]>('review:strength', id),
  /** Days in a row with something reviewed, and rest days banked. */
  daysInARow: () => call<{ run: number; banked: number }>('review:days'),
  /** Fitting the scheduler to you: how many reviews there are, how many it needs, and the fit if made. */
  fitState: () => call<{ reviews: number; after: number; fitted: number[] | null }>('review:fit:state'),
  fit: () => call<{ fitted: number[]; pairs: number; defaults: number[] } | null>('review:fit'),
  /** Pasted "term - meaning" lines made into cards; `unlistCards` takes them back. */
  listCards: (pairs: { term: string; meaning: string }[]) => call<string[]>('cards:list', pairs),
  unlistCards: (ids: string[]) => call('cards:list:undo', ids),
  /** A tag's cards, to practise without counting. */
  tagCards: (tag: string) => call<(Item & { body: unknown })[]>('tag:cards', tag),
  /** Gems missed again and again, paused or not. */
  slipping: () => call<Item[]>('review:slipping'),
  /** This card asks something narrower, and the rest becomes a new card; `unsplit` takes it back. */
  split: (id: string, narrower: string, question: string, answer: string) => call<{ fresh: string; was: string | null } | null>('review:split', id, narrower, question, answer),
  unsplit: (id: string, fresh: string, was: string | null) => call('review:unsplit', id, fresh, was),
  /** The gems a blurt left out, brought forward in Review; how many moved. */
  blurtSooner: (ids: string[]) => call<number>('blurt:sooner', ids),
  /** A blurt kept on today's page; gives back the day. */
  blurtKeep: (tag: string, text: string, missed: string[]) => call<string>('blurt:keep', tag, text, missed),
  /** The Learn Vigil deck: how many of its cards you have, and adding them (0 when already there). */
  learnCount: () => call<number>('learn:count'),
  learnAdd: () => call<number>('learn:add'),
  /** The Learn Vigil cards just added taken back, any reviewed since kept. Gives back how many went. */
  learnUndo: () => call<number>('learn:undo'),
  /** The review reminder, checked now: what it said, or null when it stayed silent. */
  remindNow: () => call<string | null>('review:reminder:now'),
  taskFrom: (ids: string[], text: string) => call<Made | null>('tasks:from', ids, text),
  bulk: (ids: string[], change: { tag?: string; capturedAt?: string }) => call<number>('captures:bulk', ids, change),
  setCapture: (id: string, field: 'attribution' | 'medium' | 'capturedAt' | 'origin', value: string | number | null) => call('capture:set', id, field, value),
  linkSession: (id: string) => call('capture:session', id),
  nuggetFrom: (text: string, origin: { captureId?: string; attribution?: string | null }) => call<string>('nugget:from', text, origin),
  random: () => call<{ id: string; kind: string; title: string; body: unknown }[]>('random'),
  study: (itemId: string, text: string, plain?: { from: number; to: number }) => call<Made>('study', itemId, text, plain),
  /** What you have typed in a field before, most used first. */
  values: (field: 'attribution' | 'medium') => call<string[]>('values', field),
  renameTag: (from: string, to: string) => call<string | null>('tag:rename', from, to),
  remind: (table: 'captures' | 'nuggets', id: string, at: string | null) => call('remind', table, id, at),
  similar: (text: string) => call<{ id: string; number: number; title: string; score: number } | null>('similar', text),
  sessions: (taskId: string) => call<Session[]>('sessions', taskId),
  startSession: (taskId: string, goal?: string, plannedMs?: number | null) => call<string>('session:start', taskId, goal, plannedMs),
  focusNow: () => call<Focus | null>('focus:now'),
  /** A task's alert answered from the nudge card: asked once more after `ms`, or seen and not asked again. */
  alertLater: (id: string, ms: number) => call<boolean>('alert:later', id, ms),
  alertSeen: (id: string) => call<boolean>('alert:seen', id),
  /** The review reminder answered: asked again after `ms`, or seen. */
  reviewLater: (ms: number) => call<boolean>('review:later', ms),
  reviewSeen: () => call<boolean>('review:seen'),
  /** More time on the running session or break: from its end, or from now if past it. Gives back the new planned length, or false. */
  extendSession: (id: string, ms: number) => call<number | false>('session:extend', id, ms),
  /** The last session kept, to go again: same task, goal and first planned length. */
  lastSession: () => call<{ taskId: string; goal: string; title: string; plannedMs: number | null } | null>('session:last'),
  /** Go again: the last session kept, started over. */
  againSession: () => call<string | null>('session:again'),
  /** A break: the session (if any) ends, kept, and a break timer starts, in one step. */
  startBreak: (sessionId: string | null, ms: number) => call<string>('break:start', sessionId, ms),
  /** Ended while away (asleep or idle), at the time it should have; what ended, or null if left running. */
  awaySession: (id: string, from: number, how: 'asleep' | 'idle') => call<{ id: string; endedAt: string; timer: boolean; kind: string | null; how: 'asleep' | 'idle' } | null>('session:away', id, from, how),
  /** Not away after all: running again from where it was. */
  unawaySession: (id: string) => call<boolean>('session:unaway', id),
  // A timer that ran out while Vigil was closed, said once.
  focusMissed: () => call<string | null>('focus:missed'),
  /** A countdown with no task behind it, shown in the floating timer: "5m tea". */
  startTimer: (goal: string, ms: number) => call<string>('timer:start', goal, ms),
  /** Pomodoro rounds ("4x25"): one timer that runs each stretch in turn. */
  startRounds: (goal: string, plan: { rounds: number; workMs: number; breakMs: number; longMs: number }) => call<string>('rounds:start', goal, plan),
  nextRound: (id: string, next: { round: number; phase: string; ms: number }) => call<boolean>('rounds:next', id, next),
  /** The Bin: discarded captures, tasks closed without doing, and gems and the rest put in it. */
  bin: () => call<{ type: string; id: string; title: string; kind: string; at: string }[]>('bin:list'),
  toBin: (id: string) => call('bin:put', id),
  restore: (type: string, id: string) => call('bin:restore', type, id),
  /** One thing in the Bin let go for good. */
  forgetBinned: (type: string, id: string) => call<boolean>('bin:forget', type, id),
  emptyBin: () => call<number>('bin:empty'),
  /** The unfinished symphony: where to pick up next time, kept on the session's task; null clears it. */
  pickUp: (sessionId: string, text: string) => call<boolean>('session:pickup', sessionId, text),
  clearPickUp: (taskId: string) => call('task:pickup', taskId, null),
  pauseSession: (id: string) => call('session:pause', id),
  resumeSession: (id: string) => call('session:resume', id),
  cancelSession: (id: string) => call('session:cancel', id),
  /** A session given up: kept in the log marked abandoned ('abandoned'), or a plain timer simply gone ('gone'). */
  abandonSession: (id: string) => call<'abandoned' | 'gone' | false>('session:abandon', id),
  unabandonSession: (id: string) => call<boolean>('session:unabandon', id),
  /** Keep going after ending early: running again for the time it had left. */
  unendSession: (id: string) => call<boolean>('session:unend', id),
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
    // An answer that comes back after the deps changed (another day, another
    // id) is dropped: arriving after the new one, it would stay on screen
    // under the new header until something next changed.
    let gone = false
    const load = (): void => void read().then((next) => {
      const now = JSON.stringify(next)
      if (gone || now === last) return
      last = now
      setValue(next)
    })
    load()
    // `kinds`: what it shows, so a save of something else leaves it be.
    const off = window.api.captures.onChange(load, kinds)
    return () => {
      gone = true
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

// Dates are said the same way everywhere: the helpers live with Day.js, shared with the main process.
export { when, whenInLine, interval } from '../../../main/dates'

/** A title without its `#tags`, and the tags: so a row can show them as pills. */
export function splitTags(text: string): { text: string; tags: string[] } {
  const tags = tagWords(text)
  // The comma or colon that only parted a front tag from the words goes with it.
  return { text: withoutTags(text.replace(new RegExp(String.raw`^\s*#${TAG}\s*(?:[,;:]|[-–—](?=\s))?`, 'u'), '')).trim(), tags }
}

/** The root size for each interface size; small is the size the app was drawn at. */
export const INTERFACE_SIZES = { small: 16, medium: 17, large: 18.5 } as const

/**
 * The settings that change how the whole app looks and sounds, applied the
 * moment they change: the page width as a flag on the document, which the
 * stylesheet reads, and the sounds as a switch the chimes check.
 */
export function useAppearance(): void {
  const settings = useLive(vigil.settings, null as Settings | null)
  // Every sticky shown or put away at once (⌃⌥⌘N, the menu bar, ⌘K, Settings): said quietly by the one window main picks.
  useEffect(() => window.api.onStickiesShown((shown) => chime(shown ? 'untuck' : 'tuck')), [])
  // Text on a filled accent button reads in every theme (lib/on-accent.ts).
  useEffect(() => watchAccentInk(), [])
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
    document.documentElement.dataset.postcardBorder = settings.postcardBorder ?? 'auto'
    document.documentElement.dataset.marks = settings.marks === false ? 'off' : 'on'
    document.documentElement.dataset.bars = settings.progressBars ?? 'plain'
    document.documentElement.toggleAttribute('data-noblur', settings.blur === false)
    // Quick capture (the window with no view of its own) keeps its full strength when you leave it, if you say so.
    document.documentElement.toggleAttribute('data-box-nodim', settings.boxDim === false && !new URLSearchParams(window.location.search).get('view'))
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
  }, [settings?.fullWidth, settings?.pageWidth, settings?.linkPictures, settings?.motion, settings?.postcards, settings?.postcardBorder, settings?.marks, settings?.progressBars, settings?.blur, settings?.boxDim, settings?.spellcheck, settings?.interfaceSize, settings?.sounds, settings?.volume, settings?.soundPack])
}
