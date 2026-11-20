import { useCallback, useEffect, useRef, useState } from 'react'
import { tagColors } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'
import { MotionGlobalConfig } from 'motion/react'
import { chime, installTicks, setPack, setVolume, soundOn } from './sound'
import { useEditorSetup } from './editor-setup'
import { watchBands } from './video-bands'
import type { Bucket } from '../../../main/study'
import { nameWithoutTags, tagsIn as tagWords } from '../../../main/tag-words'
// The main process's own shapes, read from where they are made: type only, no code of main's comes along.
// Settings is every setting as main keeps them (DEFAULTS), GiphyPin a GIF from Giphy kept downloaded.
import type { Media, Moment, MomentKind } from '../../../main/celebrate'
import type { GiphyMedia } from '../../../main/giphy'
import type { Mood, Scene } from '../../../main/scenery'
import type { LogEntry } from '../../../main/session-log'
import type { Pin as GiphyPin, Settings } from '../../../main/haligtree'
export type { GiphyMedia, GiphyPin, LogEntry, MomentKind, Mood, Scene, Settings }

/**
 * The main process's `haligtree:` channels, typed. One generic bridge in the
 * preload, the shapes here, so a new channel is one line on each side.
 */
export const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.haligtree<T>(channel, ...args)

/** Something made in the last few days, for the Recent panel. */
export type Recent = { type: string; id: string; title: string; kind: string; status: string; private: number; at: string }
/** A page a week (`week:` and its Monday) or a month (`month:2026-10`). */
export type PeriodPage = { period: string; exists: boolean; fields: Record<string, string>; body: unknown }
export type PinnedQuestion = { id: string; title: string; pinnedAt: string; clues: number }


/** A nugget or an article: the same row, told apart by `tier`. */
/** One thing in the Bin as its preview shows it (bin:peek). */
export type BinPeek = { type: string; id: string; title: string; kind: string; body: unknown; private: boolean; madeAt: string; binnedAt: string | null; attribution: string | null; tags: string[]; facts?: string[] }

export type Item = {
  id: string
  /** A card is a "question :: answer" line written in a note (lineOf says which), or a study card made while reading: in Review only. */
  tier: 'nugget' | 'article' | 'question' | 'goal' | 'card' | 'deck'
  kind: string
  title: string
  /** Still called the “Untitled” it began with: its first line, for lists to show in muted ink instead. */
  line?: string | null
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
  /** Its kind's properties (status, rating and the rest), as JSON; null when it has none. */
  fields?: string | null
  context: string | null
  mode: 'encounter' | 'pushed'
  supersededBy: string | null
  /** Sittings in which its words were meaningfully rewritten. */
  revisions: number
  /** Put out of sight, not deleted; null while in view. */
  archivedAt: string | null
  /** Brought in from Apple Notes or Obsidian, and not yet kept, tagged, moved or binned. */
  unsorted?: number
  /** Why the answer is so: one line under it in review. */
  why: string | null
  /** A question: when it was settled, and how; both null while it is held. */
  closedAt: string | null
  closedHow: 'answered' | 'let go' | 'made it' | 'missed' | 'on ice' | null
  /** The words, exactly as selected, that a gem was lifted from: its card shows them. */
  passage?: string | null
  /** Its glosses, which on a question are its clues and on a goal its logs. */
  clues: number
  /** A question answered: the words of the page its answer became; null or absent while it has none. */
  answer?: string | null
  /** A question: when it last came back to you (question:back), if it has. */
  backAt?: string | null
  /** A goal: the day it is for and the day it was set, "2026-12-14"; null on anything else. */
  goalAt: string | null
  goalFrom: string | null
  /** How often a goal's beacon shows; null follows Settings. */
  beacon: 'always' | 'sometimes' | 'off' | null
  /** A goal's colour, a tag colour's name ("blue"); given one when it is set. */
  goalColor?: string | null
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
export type Due = Item & { body: unknown; intervals: Record<number, string>; gloss: string | null; exam: string | null; /** Never studied: one of today's new cards (in today's queue only). */ first?: boolean }
/** How ready a tag with an exam date is. */
export type Exam = { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }
/** A tagged thing read whole on its tag's page. */
export type TagRead = { id: string; type: string; kind: string; status: string; title: string; label: string; body: unknown; private: boolean; at: string; changed: string; tags: string[]; keptIn?: string | null; /** Done: kept under a click, not counted. */ later: boolean; /** A gem: the note it was saved from, which then shows only as this. */ fromNote?: string | null }
/** A capture in one of the two passes; `why` says how it got into the deciding one. */
export type PassItem = { id: string; number: number; label: string; kind: string; status: string; private: number; capturedAt: string; attribution: string | null; medium?: string | null; body: unknown; backAt: string | null; why?: 'back' | 'untidied' | 'longest' }
type PassState = { backAt: string | null; tidiedAt: string | null; passedAt: string | null }
/** A month or a year, Wrapped's way. */
export type Recap = {
  label: string
  finished: boolean
  captures: number
  words: number
  busiestDay: { name: string; n: number } | null
  /** Captures in each hour of the day (0 to 23), local time. */
  hours: number[]
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
  /** A month's study, for "Your month". */
  study?: { seconds: number; checked: number; recalled: number; newCards: number; days: { day: string; n: number }[]; longest: { title: string; days: number } | null; book: { src: string; title: string } | null; line: string | null } | null
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
  /** The task in the way, when it is one of yours; with its name and whether it is done yet. */
  blockedBy?: string | null
  blockedByTitle?: string | null
  blockedByStatus?: 'open' | 'done' | 'dropped' | null
  /** How many times it has been pushed later. */
  reschedules: number
  /** This task's own alert level, over the setting; null follows the setting. */
  notify: 'pull' | 'quiet' | 'alerts' | null
  /** Linear's four: 1 Urgent, 2 High, 3 Medium, 4 Low; 0 for none. High and Urgent are `important`. */
  priority: number
  /** A when with no day: "someday", a month ("2026-10") or a year ("2026"). */
  planFor: string | null
  /** Hidden until this day ("2026-11-03"): out of every list till then, unless snoozed things are shown. */
  snoozedUntil?: string | null
  /** Days before its due-by date it comes up on Today to get ready for; null for none. */
  getReady?: number | null
  /** Days it was left undone past its day, each counted once: with `reschedules`, the times it was carried over. */
  rollovers?: number
  /** A routine's times in a row passed over with Skip. */
  skips?: number
  /** Set while a fresh start holds it. */
  heldAt?: string | null
  /** The note it came from, for grouping by it: in the list, not on one task. */
  fromId?: string | null
  fromTitle?: string | null
  subtasks?: Subtask[]
}
type Subtask = { text: string; done: boolean }
/** What a save changed on its own, for an undo to put back: the reschedule count and when it was last told about. */
export type TaskWas = { reschedules: number; notifiedAt: string | null }
/** What a task was before it was done, so it can be put back. */
export type Finished = { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null; skips?: number }
/** One side of two notes made one (lib/join-notes.ts): a capture, or a gem, page or other item. */
export type NoteSide = { table: 'captures' | 'nuggets'; id: string }
/**
 * Two notes made one: the token its Undo takes back; or which side is still the Markdown it came in, to be read by
 * the window's editor and asked again with; or why nothing was joined (one is gone, one is in the Bin).
 */
export type Joined = { token: number; added: number; links: number; /** The divider put in where the other's lines begin (extensions/joined-from.ts), or null when none came over. */ mark: string | null; /** How the note kept opens. */ opens: string } | { markdown: 'keep' | 'other'; text: string } | { why: 'same' | 'gone' | 'bin' }
/** `resolved`: the captures this took out of the inbox, for its undo to open again. */
/** A task made, or the open one with that name already there, which it joined. */
export type Made = { id: string; number: number; existed: boolean; resolved?: string[]
  /** A note written as a list made a task a line: the tasks after the first, and what they came to ("4 tasks, 2 steps"). */
  also?: { id: string; existed: boolean }[]; said?: string; steps?: number }
/** What to say after making a task: the usual words, or that it joined one. */
export const taskSaid = (made: Made | null | undefined, fresh: string): string =>
  made?.existed ? 'Already on your list, so this was linked to that task instead of adding it twice' : fresh
export type TaskFull = Task & { /** Where to pick up, said as its last session ended. */ pickup?: string | null; notes: unknown; done: { at: string; recap: string | null }[]; subtasks: Subtask[]; linked: { id: string; tier: string; kind: string; title: string }[] }

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null; goal?: string | null; plannedMs?: number | null; pausedMs: number; pausedAt: string | null; /** Abandoned: kept in the log, counted in no total. */ abandonedAt?: string | null; /** One of the task's practice's sessions (1): its log line says it already. */ practice?: number }
/** A session ended on a day, with its task and what was logged in it. */
/** A focus session as a block in time, for the day's timeline and the week: running (no `endedAt`) or ended. */
export type SpanSession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string | null; plannedMs: number | null; pausedMs: number; pausedAt: string | null }
export type DaySession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string; pausedMs: number; recap: string | null; abandonedAt?: string | null; /** No task behind it: named in its line. */ bare?: number | boolean; entries: LogEntry[] }
/** The session running now, as the floating timer shows it. */
export type Focus = { id: string; taskId: string; goal: string; startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null; /** Pomodoro rounds, as JSON (lib/timer.ts RoundsAt); null for any other session. */ rounds?: string | null; /** 'break' for a break taken after a session; 'focus' for a bare session, one with no task. */ kind?: string | null; /** Time added with +10 min, already in plannedMs. */ extendedMs?: number; /** A practice (main/practices.ts): which, and its target in minutes. */ practiceId?: string | null; practiceTarget?: number | null }

/**
 * The time spent on tasks, for a whole list in one read: each task's milliseconds in sessions kept and how many
 * (what its own page counts under “Focus so far”), and the session running on a task now, whose time a window adds
 * itself (components/haligtree/task-time.tsx).
 */
export type Spent = { spent: Record<string, [ms: number, sessions: number]>; running: Pick<Focus, 'id' | 'taskId' | 'startedAt' | 'plannedMs' | 'pausedMs' | 'pausedAt'> | null }

/** A focus session with no task behind it (Start focus): kept, logged and counted as any session is, unlike a timer. */
export const bareSession = (focus: Pick<Focus, 'taskId' | 'kind'>): boolean => !focus.taskId && focus.kind === 'focus'
/** A focus session, on a task or bare: what has a log, asks whether to count an early end, and is kept. A timer, a break or rounds are not. */
export const isSession = (focus: Pick<Focus, 'taskId' | 'kind'>): boolean => !!focus.taskId || focus.kind === 'focus'

/** A session running in another book: which book, its name and colour, for the pill to name. */
export type Elsewhere = Focus & { book: string; bookName: string; color: string | null }

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
  opens: { day: string; n: number }[]
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

/** What a task's save may change. */
export type TaskPatch = Partial<{ /** The line it was made a step of: it lives there now, so the Bin never offers it back. */ stepOf: string | null; allDay: number; title: string; until: string | null; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number | null; important: number; deadline: string | null; deadlineTimed: number; blocker: string | null; blockedBy: string | null; reschedules: number; notify: string | null; priority: number; plan: string | null; notifiedAt: string | null; completedAt: string | null; snoozedUntil: string | null; getReady: number | null; rollovers: number; skips: number }>

export const haligtree = {
  /** Other names a note goes by; `setAliases` gives back the list it had, for an undo. */
  aliases: (table: 'captures' | 'nuggets', id: string) => call<string[]>('aliases', table, id),
  setAliases: (table: 'captures' | 'nuggets', id: string, list: string[]) => call<string[] | null>('aliases:set', table, id, list),
  /** Everything made in the `days` before `until` (now), newest first. */
  recent: (days: number, until?: string | null) => call<Recent[]>('recent', days, until),
  period: (period: string) => call<PeriodPage>('period', period),
  /** For a month's calendar: the days with a page, and how many reviews each day had. */
  dayMarks: (from: string, to: string) => call<{ pages: string[]; reviews: Record<string, number> }>('days:marks', from, to),
  /** For the month calendar: how many things were captured each day, and the day of the first capture ever. */
  dayCaptures: (from: string, to: string) => call<{ first: string | null; counts: Record<string, number> }>('days:captures', from, to),
  /** A sitting's own score, 1 to 5, kept with its cards' tags; gives back its row, for an undo. */
  saveRecall: (score: number, ids: string[]) => call<number>('recall:save', score, ids),
  unsaveRecall: (row: number) => call<boolean>('recall:unsave', row),
  recallScores: () => call<{ at: string; score: number; cards: number; tags: string[] }[]>('recall:scores'),
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
  settings: () => call<Settings>('settings').then((now) => ((lastSettings = now), now)),
  setSettings: (patch: Partial<Settings>) => call<Settings>('settings:set', patch),
  /** Every language the spellchecker knows, and the ones it is using. */
  spellingLanguages: () => call<{ all: string[]; on: string[] }>('spelling:languages'),
  backupsWhere: () => call<string>('backups:where'),
  /** When the last backup was made (ms), why backups are failing now if they are, and whether a folder of your own is in use. */
  backupStatus: () => call<{ at: number | null; failing: string | null; chosen: boolean }>('backups:status'),
  /** A backup made now, and how they stand after it. */
  backupNow: () => call<{ at: number | null; failing: string | null; chosen: boolean }>('backups:now'),
  /** Pick another folder for the backups, or go back to the usual place: a backup runs there at once. Null when the picker was closed. */
  chooseBackups: (usual = false) => call<{ at: number | null; failing: string | null; chosen: boolean } | null>('backups:choose', usual),
  /** The scenes in these folders so far; copies of new pictures are made in the background. */
  scenery: (folders: string[], use: 'scenery' | 'covers' = 'scenery') => call<{ scenes: Scene[]; scanning: boolean }>('scenery', folders, use),
  /** A folder of pictures, picked in the system's own chooser. */
  sceneryFolder: () => call<string | null>('scenery:folder'),
  /** What a celebration can play: the chosen folder's, or the one named. */
  celebrations: (folder?: string) => call<{ url: string; video: boolean; name: string; sprite?: boolean }[]>('celebrations', folder),
  /** The files picked for each kind of milestone, those still there. */
  celebrationPicks: () => call<Partial<Record<MomentKind, Media[]>>>('celebrations:picks'),
  /** A sticky's list just done: its celebration, or null when none may show now. */
  stickyDone: (id: string) => call<Moment | null>('celebrations:sticky', id),
  /** A GIF from Giphy for a card now, or null to play what it would anyway. */
  celebrationGiphy: () => call<GiphyMedia | null>('celebrations:giphy'),
  /** The day's Giphy results with their still pictures, to star; why there are none, if none. */
  giphyList: () => call<{ gifs: { id: string; title: string; still: string }[]; why?: 'off' | 'key' | 'offline' | 'failed' }>('celebrations:giphy:list'),
  /** One of them, downloaded, to see in a card. */
  giphyOne: (id: string) => call<GiphyMedia | null>('celebrations:giphy:one', id),
  /** Giphy searched with words of your own, for a moment's row in Settings. */
  giphySearch: (words: string) => call<{ gifs: { id: string; title: string; still: string }[]; why?: 'key' | 'offline' | 'failed' | 'none' }>('celebrations:giphy:search', words),
  /** One of those, downloaded: what to save as the pin, and what to see in a card. */
  giphyPick: (id: string) => call<{ pin: GiphyPin; media: GiphyMedia } | null>('celebrations:giphy:pick', id),
  /** The GIF pinned for this kind of moment, ready to play (offline too), or null. */
  giphyPinned: (kind: MomentKind) => call<GiphyMedia | null>('celebrations:giphy:pinned', kind),
  /** GIFs, pictures or clips, picked in the system's own chooser. */
  celebrationFiles: () => call<string[]>('celebrations:choose'),
  // Up for private, down for not, from whichever menu or button switched it.
  setPrivate: (table: 'captures' | 'nuggets', id: string, on: boolean, quiet = false) => (quiet || chime(on ? 'on' : 'off'), call('private', table, id, on)),
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call<boolean>('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  reviewTuning: () => call<{ cap: number; tuned: boolean; behind: number }>('review:tuning'),
  reviewPace: () => call<number | null>('review:pace'),
  reviewToday: () => call<{ seconds: number | null; kept: { prompt: string; days: number } | null; /** Cards reviewed today, in every sitting. */ done: number; last: string | null; /** Days reviewed of the last seven. */ week: number }>('review:today'),
  promote: (id: string, words?: string, bare = false) => call<string | null>('promote', id, words, bare),
  /** `forgetWho`: the source was asked for while promoting, so it goes too. */
  unpromote: (captureId: string, nuggetId: string, forgetWho = false) => call<boolean>('promote:undo', captureId, nuggetId, forgetWho),
  /** What it came from, what it became, and what links to it. */
  mentions: (id: string) => call<Record<'linked' | 'unlinked' | 'out' | 'named', { type: string; id: string; title: string; snippet: string; private?: number; /** On a named note: the words that name it in this one. */ words?: string }[]> & { me: string }>('mentions', id),
  linkMention: (sourceType: string, sourceId: string, targetId: string) => call<{ was: string; linked: string } | false>('mention:link', sourceType, sourceId, targetId),
  /** Undo a mention made a link: the other note's words as they were, unless changed since. */
  unlinkMention: (sourceType: string, sourceId: string, was: string, linked: string) => call<boolean>('mention:unlink', sourceType, sourceId, was, linked),
  /** Notes sharing tags with this one and not linked to it, rarest tags first. */
  related: (id: string) => call<{ type: string; id: string; title: string; excerpt: string; private: boolean; at: string; shared: string[] }[]>('related', id),
  lineage: (id: string) => call<Record<'from' | 'became' | 'linked', { type: string; id: string; title: string; private?: number }[]>>('lineage', id),
  newArticle: () => call<string>('article:new'),
  findItems: (query: string) => call<{ id: string; tier: 'nugget' | 'article' | 'question'; title: string; updatedAt?: string; goalAt?: string | null; closedHow?: string | null }[]>('items:find', query),
  /** `whole`: one task however many lines; otherwise a list makes a task a line, and a page of mixed lines comes back to be sorted. */
  toTask: (id: string, plain?: { from: number; to: number; text: string }[], whole?: boolean) => call<Made | null | 'not-open' | { mixed: string }>('toTask', id, plain, whole),
  items: (tier: 'nugget' | 'article' | 'question' | 'goal') => call<Item[]>('items', tier),
  /** A question, from nothing or from a capture whose words become its first clue; `dropQuestion` takes it back. */
  newQuestion: (title: string, captureId?: string) => call<string>('question:new', title, captureId),
  dropQuestion: (id: string) => call<boolean>('question:drop', id),
  /** Captures moved to Writing, a page each, into a folder of Writing's or loose: what was made, none for those already out of the Inbox. `undoWriting` takes them back. */
  toWriting: (captureIds: string[], folder?: string | null) => call<{ capture: string; id: string; folder: string | null }[]>('capture:toWriting', captureIds, folder),
  undoWriting: (made: { capture: string; id: string }[]) => call<boolean>('capture:toWriting:undo', made),
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
  newGoal: (title: string, target: string | null, from?: string | null, why?: string | null) => call<string | null>('goal:new', title, target, from, why),
  goalDates: (id: string, dates: { target?: string | null; from?: string }) => call<boolean | null>('goal:dates', id, dates),
  closeGoal: (id: string, how: 'made it' | 'missed' | 'let go' | 'on ice', at?: string | null) => call<boolean | null>('goal:close', id, how, at),
  thawGoal: (id: string) => call<{ days: number; was: string | null; iced: string } | null>('goal:thaw', id),
  reopenGoal: (id: string) => call<boolean>('goal:reopen', id),
  dropGoal: (id: string) => call<boolean>('goal:drop', id),
  /** How often a goal's beacon shows; null follows Settings. */
  setBeacon: (id: string, mode: 'always' | 'sometimes' | 'off' | null) => call<boolean>('goal:beacon:set', id, mode),
  /** A goal's colour, one of GOAL_COLORS (lib/goal-colors). */
  setGoalColor: (id: string, color: string) => call<boolean>('goal:color:set', id, color),
  /** A question still open, come back as a hint; null most of the time. */
  questionBack: () => call<{ id: string; title: string; createdAt: string; clues: number; event: number } | null>('question:back'),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; base: unknown; /** An editor's save: the words as they are kept, and the words they were made from (lib/same-words.ts). */ words: Uint8Array; wordsBase: Uint8Array; title: string; prompt: string | null; kind: string; suspended: boolean; attribution: string | null; medium: string | null; context: string | null; mode: string; why: string | null }>) =>
    call('item:save', id, patch),
  /** "Behind the answer" saved: the merged words into `context` first, and only once they are kept is the old `why` cleared, so nothing is lost. */
  saveBehind: async (id: string, text: string | null): Promise<void> => {
    await call('item:save', id, { context: text?.trim() || null })
    await call('item:save', id, { why: null })
  },
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
  /** How many of today's cards are new ones, counted from today's queue. */
  newToday: () => call<number>('review:new-today'),
  grade: (id: string, grade: 1 | 2 | 3 | 4, ms: number, hints = 0) => call<string>('review:grade', id, grade, ms, hints),
  tasks: () => call<Task[]>('tasks'),
  /** A note hidden until a day ("2026-11-03"), or shown again (null). */
  snoozeCapture: (id: string, day: string | null) => call<boolean>('capture:snooze', id, day),
  /** The tasks and notes hidden until a later day. */
  snoozed: () => call<string[]>('snoozed'),
  /** What comes back on a later day, with that day: a task or a note, by name. */
  snoozedBack: () => call<{ type: 'task' | 'capture'; id: string; title: string; day: string }[]>('snoozed:back'),
  /** Every task's source captures, as pairs: one read for a whole list. */
  taskSources: () => call<{ task: string; capture: string; binned: number }[]>('tasks:sources'),
  task: (id: string) => call<TaskFull | null>('task', id),
  /** `today`: with no date in the words, it is for today. */
  addTask: (text: string, origin?: string, today = false, plain?: { from: number; to: number }[]) => call<Made>('task:add', text, origin, today, plain),
  saveTask: (id: string, patch: TaskPatch) =>
    call<TaskWas | true>('task:save', id, patch),
  /** Gives back what it was, for `undoneTask`. */
  doneTask: (id: string) => call<Finished>('task:done', id),
  /** A routine passed over this time: on to its next date, nothing counted done. */
  skipTask: (id: string) => call<Finished>('task:skip', id),
  /** Open again on the date it had, and that time done no longer counted: a routine's undo too. */
  undoneTask: (id: string, was: Finished) => call('task:undone', id, was),
  /** Many done, or put back, in one write with one change told. */
  doneTasks: (ids: string[]) => call<Finished[]>('task:done-many', ids),
  undoneTasks: (list: { id: string; was: Finished }[]) => call('task:undone-many', list),
  /** A task made by mistake: see `makeTask`. */
  unmakeTask: (id: string, existed: boolean, links: string[], reopen: string[]) => call('task:unmake', id, existed, links, reopen),
  /** The note a task is made from, set, changed or taken off (null); gives back the one it had, for Undo. */
  sourceTask: (id: string, itemId: string | null) => call<string | null>('task:source', id, itemId),
  /** Tasks turned back into notes in the Inbox; what it gives back is for `unnoteTasks`. */
  taskToNote: (ids: string[]) => call<unknown[]>('task:to-note', ids),
  unnoteTasks: (kept: unknown[]) => call('task:to-note:undo', kept),
  /** Reviews falling on each of the next `days` days, today with what is late. */
  reviewLoad: (days: number) => call<number[]>('review:load', days),
  tags: () => call<{ tag: string; count: number; later: number; /** When it was last written into anything. */ last: string | null; /** How many carrying it are from the last 30 days. */ recent: number; color: string | null; action: boolean; examAt: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }[]>('tags'),
  tagMeta: () => call<{ tag: string; color: string | null; action: number; homeHidden: number }[]>('tag:meta'),
  setTag: (tag: string, patch: { deck?: boolean; homeHidden?: boolean; color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null; speak?: string | null; typed?: 'exact' | 'meaning' | null; newPerDay?: number | null; retention?: number | null; sides?: [string, string] | null; timer?: number | null }) => call('tag:set', tag, patch),
  /** Each tag whose answers are read aloud, and its language. */
  tagSpeak: () => call<Record<string, string>>('tag:speak'),
  /** What a review setting costs over the next 30 days of your own cards: reviews and minutes a day, and the reviews a day at 90%. */
  reviewCost: (newPerDay: number, retention: number) => call<{ reviews: number; minutes: number; usual: number }>('review:cost', newPerDay, retention),
  tagStudy: () => call<{ sides: Record<string, [string, string]>; timer: Record<string, number>; place: Record<string, number>; typed: Record<string, 'exact' | 'meaning'>; newPerDay: Record<string, number>; retention: Record<string, number> }>('tag:study'),
  exams: () => call<Exam[]>('exams'),
  history: (id: string) => call<{ reviews: { at: string; grade: number; ms?: number | null }[]; dueAt: string | null }>('review:history', id),
  source: (id: string) => call<{ type: string; id: string; title: string; body: unknown } | null>('review:source', id),
  nudge: () => call<{ kind: 'exam' | 'tidy' | 'goal'; view: string; id?: string; label: string; text: string } | null>('nudge'),
  memory: () => call<{ id: string; captureId: string; kind: string; title: string; body: unknown; event: number; memory: string } | null>('memory'),
  /** Old captures still open; -1 when the book has never had one old enough to rot. */
  rotLeft: () => call<number>('rot:left'),
  rotWaiting: () => call<number>('rot:waiting'),
  recap: (period: 'week' | 'month' | 'year', from?: string) => call<Recap>('recap', period, from),
  supersede: (id: string, truth: string) => call<string>('supersede', id, truth),
  /** A correction taken back: the new gem gone, the old one as it was. */
  unsupersede: (id: string, fixed: string, suspended: boolean) => call<boolean>('unsupersede', id, fixed, suspended),
  /** `other`'s words under `keep`'s, after a rule, and `other` to the Bin: done in the main process, on the notes as stored. */
  joinNotes: (keep: NoteSide, other: NoteSide, given?: Partial<Record<'keep' | 'other', { doc: unknown; from: string }>>) => call<Joined>('notes:join', keep, other, given),
  /** Both notes exactly as they were before the join. */
  unjoinNotes: (token: number) => call<boolean | 'both'>('notes:join:undo', token),
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
  /** Imported notes kept as they are (sorted), or put back to sort again. */
  sorted: (ids: string[], sorted: boolean) => call<boolean>('imports:sorted', ids, sorted),
  stats: () => call<Stats>('stats'),
  /** The folder written to; with `pictures: false` when the notes went but their pictures and files could not be copied. */
  exportAll: () => call<string | { folder: string; pictures: false } | { stopped: true } | null>('export'),
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
  round: (bucket: Bucket | 'starred' | `#${string}`) => call<Due[]>('review:round', bucket),
  /** A star on a card, or off. */
  star: (id: string, on: boolean) => call<boolean>('review:star', id, on),
  /** What Review knows about a card, to say how it decides when it comes back. */
  why: (id: string) => call<{ retention: number; reviews: number; seen: boolean; stability: number | null; difficulty: number | null; recall: number | null; lastDays: number | null; fitted: boolean } | null>('review:why', id),
  /** How long a card would hold after each of its reviews, replayed from its grades. */
  strength: (id: string) => call<{ at: string; grade: number; days: number }[]>('review:strength', id),
  /** Days in a row with something reviewed, and rest days banked. */
  daysInARow: () => call<{ run: number; banked: number; best: number; since: string }>('review:days'),
  /** What the reviewing has added up to: cards known now and a month ago, remembered today, and the best earlier day. */
  reviewGrown: () => call<{ known: number; knownMonthAgo: number; remembered: number; best: number; daysBefore: number }>('review:grown'),
  /** Fitting the scheduler to you: how many reviews there are, how many it needs, and the fit if made. */
  fitState: () => call<{ reviews: number; after: number; fitted: number[] | null }>('review:fit:state'),
  fit: () => call<{ fitted: number[]; pairs: number; defaults: number[] } | null>('review:fit'),
  /** A tag's cards, to practise without counting. */
  /** Every tag on a card that is not paused, the most cards first: what ⌘K offers to study. */
  cardTags: () => call<string[]>('cards:tags'),
  madeDecks: () => call<string[]>('decks:made'),
  tagCards: (tag: string) => call<(Item & { body: unknown })[]>('tag:cards', tag),
  /** Gems missed again and again, paused or not. */
  slipping: () => call<Item[]>('review:slipping'),
  /** This card asks something narrower, and the rest becomes a new card; `unsplit` takes it back. */
  split: (id: string, narrower: string, question: string, answer: string) => call<{ fresh: string; was: string | null } | null>('review:split', id, narrower, question, answer),
  unsplit: (id: string, fresh: string, was: string | null) => call('review:unsplit', id, fresh, was),
  /** "Ask another way": a new card keeping this one's context, source and #tags; gives back its id. */
  another: (id: string, question: string, answer: string, body?: unknown) => call<string | null>('review:another', id, question, answer, body),
  /** The gems a blurt left out, brought forward in Review; how many moved. */
  blurtSooner: (ids: string[]) => call<number>('blurt:sooner', ids),
  /** A blurt kept on today's page; gives back the day. */
  blurtKeep: (tag: string, text: string, missed: string[]) => call<string>('blurt:keep', tag, text, missed),
  /** The Learn Haligtree deck: how many of its cards you have, and adding them (0 when already there). */
  learnCount: () => call<number>('learn:count'),
  learnAdd: () => call<number>('learn:add'),
  /** The Learn Haligtree cards just added taken back, any reviewed since kept. Gives back how many went. */
  learnUndo: () => call<number>('learn:undo'),
  /** The example deck a beginner can try from Review (main/example-deck.ts): how many of its cards there are, adding it, and taking it all away. */
  exampleCount: () => call<number>('example:count'),
  exampleAdd: () => call<number>('example:add'),
  exampleRemove: () => call<number>('example:remove'),
  taskFrom: (ids: string[], text: string) => call<Made | null>('tasks:from', ids, text),
  bulk: (ids: string[], change: { tag?: string; capturedAt?: string }) => call<number>('captures:bulk', ids, change),
  setCapture: (id: string, field: 'attribution' | 'medium' | 'capturedAt' | 'origin', value: string | number | null) => call('capture:set', id, field, value),
  linkSession: (id: string) => call('capture:session', id),
  nuggetFrom: (text: string, origin: { captureId?: string; attribution?: string | null; passage?: string | null }) => call<string>('nugget:from', text, origin),
  random: () => call<{ id: string; kind: string; title: string; body: unknown }[]>('random'),
  study: (itemId: string, text: string, plain?: { from: number; to: number }) => call<Made>('study', itemId, text, plain),
  /** What you have typed in a field before, most used first. */
  values: (field: 'attribution' | 'medium') => call<string[]>('values', field),
  renameTag: (from: string, to: string) => call<string | null>('tag:rename', from, to),
  /** Puts back exactly what the last rename or merge changed. */
  undoRenameTag: () => call<boolean>('tag:rename:undo'),
  remind: (table: 'captures' | 'nuggets', id: string, at: string | null) => call('remind', table, id, at),
  /** Quick capture's line as the Mac's own model reads it, where the wording says no kind: a task, a quote, or null. */
  readKind: (text: string) => call<'todo' | 'quote' | null>('ai:kind', text),
  similar: (text: string) => call<{ id: string; number: number; title: string; score: number } | null>('similar', text),
  /** The open task a note sent as a task would join instead of being made twice (by its name), or null. */
  taskTwin: (doc: unknown, plain?: { from: number; text: string }[]) => call<string | null>('taskTwin', doc, plain),
  sessions: (taskId: string) => call<Session[]>('sessions', taskId),
  spent: () => call<Spent>('sessions:spent'),
  startSession: (taskId: string, goal?: string, plannedMs?: number | null) => call<string>('session:start', taskId, goal, plannedMs),
  /** A bare session, no task: as long as asked (null for no end), named or not. */
  startFocus: (plannedMs: number | null, goal?: string | null) => call<string>('focus:start', plannedMs, goal ?? null),
  nameSession: (id: string, name: string) => call<boolean>('session:name', id, name),
  focusNow: () => call<Focus | null>('focus:now'),
  /** A session left running in another book by a switch (“Keep it running”): read from there, never written. */
  focusElsewhere: () => call<Elsewhere | null>('books:elsewhere'),
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
  awaySession: (id: string, from: number) => call<{ id: string; endedAt: string; timer: boolean; kind: string | null; how: 'idle' } | null>('session:away', id, from),
  /** Not away after all: running again from where it was. */
  unawaySession: (id: string) => call<boolean>('session:unaway', id),
  // A timer that ran out while Haligtree was closed, said once.
  focusMissed: () => call<string | null>('focus:missed'),
  /** A countdown with no task behind it, shown in the floating timer: "5m tea". */
  startTimer: (goal: string, ms: number) => call<string>('timer:start', goal, ms),
  /** Pomodoro rounds ("4x25"): one timer that runs each stretch in turn. */
  startRounds: (goal: string, plan: { rounds: number; workMs: number; breakMs: number; longMs: number }) => call<string>('rounds:start', goal, plan),
  nextRound: (id: string, next: { round: number; phase: string; ms: number }) => call<boolean>('rounds:next', id, next),
  /** The Bin: discarded captures, tasks closed without doing, and gems and the rest put in it. */
  bin: () => call<{ type: string; id: string; title: string; kind: string; at: string; line: string | null }[]>('bin:list'),
  /** One thing in the Bin, to look inside: its words, tags and dates, read only. */
  binPeek: (type: string, id: string) => call<BinPeek | null>('bin:peek', type, id),
  toBin: (id: string) => call('bin:put', id),
  restore: (type: string, id: string) => call('bin:restore', type, id),
  /** Many into the Bin, or back out, in one write with one change told. */
  toBinMany: (ids: string[]) => call('bin:put-many', ids),
  /** Many tasks saved in one write with one change told, each with its own patch. */
  saveTasks: (saves: { id: string; patch: TaskPatch }[]) => call('task:save-many', saves),
  restoreMany: (list: { type: string; id: string }[]) => call('bin:restore-many', list),
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
  daySessions: (day: string) => call<DaySession[]>('session-log:day', day),
  /** The focus sessions running or ended between two moments, abandoned ones left out. */
  sessionsSpan: (from: string, to: string) => call<SpanSession[]>('sessions:span', from, to)
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

/** What each read last said, by its deps: the start of the same page opened again (useLive). */
type Said = Map<string, { value: unknown; json: string }>
const saidByRead = new WeakMap<object, Said>()
const saidByName = new Map<string, Said>()
/** Kept by the read itself (forgotten with it) or by a name. */
const said = {
  get: (by: object | string): Said | undefined => (typeof by === 'string' ? saidByName.get(by) : saidByRead.get(by)),
  set: (by: object | string, map: Said) => (typeof by === 'string' ? saidByName.set(by, map) : saidByRead.set(by, map), said)
}
const keyOf = (deps: unknown[]): string | null => {
  try {
    return JSON.stringify(deps)
  } catch {
    return null
  }
}

/**
 * One read for every view that asks the same thing in the same moment: a
 * write tells every list at once, and fifty rows each showing tags asked for
 * the tag colours fifty times, every list its tasks again. Shared only within
 * that one moment, so a read started before a later write is never reused.
 */
const asking = new Map<unknown, Map<string, Promise<{ next: unknown; json: string }>>>()
function readOnce<T>(by: unknown, key: string | null, read: () => Promise<T>): Promise<{ next: T; json: string }> {
  const ask = (): Promise<{ next: T; json: string }> => read().then((next) => ({ next, json: JSON.stringify(next) }))
  if (key === null) return ask()
  let mine = asking.get(by)
  if (!mine) asking.set(by, (mine = new Map()))
  const was = mine.get(key)
  if (was) return was as Promise<{ next: T; json: string }>
  const now = ask()
  mine.set(key, now)
  // Forgotten after this moment, its read too, so a view's own arrow is never held on to.
  setTimeout(() => (mine.delete(key), mine.size || asking.delete(by)), 0)
  return now
}

/**
 * The reads one change starts, answered together. A write anywhere tells
 * every list at once, and each read again on its own: a page drawn from
 * several (Everything's captures, its tasks, which became which) changed a
 * read at a time, its rows back first, then the box above them, then the
 * count. Every read started in the same moment joins one wave; what they say
 * is put on screen together, in one frame, once the last has answered (and
 * never later than AT_MOST, so one slow read cannot hold the rest).
 */
type Wave = { pending: number; apply: (() => void)[]; sealed: boolean; done: boolean }
let wave: Wave | null = null
const WAVE_AT_MOST = 400
/** A read slower than this answers on its own, never holding a wave. */
const SLOW_READ = 120
const flush = (one: Wave): void => {
  if (one.done) return
  one.done = true
  // One task: React draws every change it is given here as one.
  for (const apply of one.apply.splice(0)) apply()
}
export function together<T>(read: Promise<T>, apply: (value: T) => void): void {
  if (!wave) {
    const fresh: Wave = { pending: 0, apply: [], sealed: false, done: false }
    wave = fresh
    // Sealed once this moment is over: a read started later begins a wave of its own.
    setTimeout(() => {
      fresh.sealed = true
      if (wave === fresh) wave = null
      if (!fresh.pending) flush(fresh)
    }, 0)
    setTimeout(() => flush(fresh), WAVE_AT_MOST)
  }
  const mine = wave
  mine.pending++
  const settle = (): void => {
    mine.pending--
    if (mine.done) {
      // Answered after the wave was put on screen: on its own, at once.
      for (const late of mine.apply.splice(0)) late()
    } else if (mine.sealed && !mine.pending) flush(mine)
  }
  void read.then((value) => (mine.apply.push(() => apply(value)), settle()), settle)
}

/** A row, a block or a tab is in hand: the marks every carry sets on the page (sortable.tsx, side-sections.ts, block-carry.ts, split-drop.tsx). */
const carrying = (): boolean => document.documentElement.hasAttribute('data-dragging') || document.documentElement.hasAttribute('data-split-drag')
/** Runs once nothing is carried any more (let go, dropped or put back with Esc), with everything else waiting for it. */
let letGo: Set<() => void> | null = null
function onceLetGo(run: () => void): void {
  if (!letGo) {
    const now = (letGo = new Set())
    const watch = new MutationObserver(() => {
      if (carrying()) return
      watch.disconnect()
      if (letGo === now) letGo = null
      now.forEach((one) => one())
    })
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dragging', 'data-split-drag'] })
  }
  letGo.add(run)
}
/** A list's change heard: drawn now, or once the row in hand is let go, so nothing moves under the hand (`useLive`, `useCaptures`). */
export const whenLetGo = (run: () => void): void => (carrying() ? onceLetGo(run) : run())

/** Runs once the frame being drawn now is painted, with everything else asked for the same frame (so `readOnce` shares one read); returns a way to call it off. */
let painted: Set<() => void> | null = null
export function afterPaint(run: () => void): () => void {
  if (!painted) {
    const now = (painted = new Set())
    const run = (): void => void setTimeout(() => {
      if (painted === now) painted = null
      now.forEach((one) => one())
    }, 0)
    // A hidden window draws no frames: there it waits for nothing.
    if (document.hidden) run()
    else requestAnimationFrame(run)
  }
  const mine = painted
  mine.add(run)
  return () => void mine.delete(run)
}

/**
 * A read made ahead of the view that shows it (quick capture's side panel, before ⌘\ opens it), so the view starts on
 * its answer, drawn whole as it first shows, as when opened again (useLive). Only a read that is the same function each
 * time can be kept.
 */
export function warmLive<T>(read: () => Promise<T>, deps: unknown[] = []): void {
  const key = keyOf(deps)
  if (key !== null) void readOnce(read, key, read).then(({ next, json }) => void (said.get(read) ?? said.set(read, new Map()).get(read)!).set(key, { value: next, json }), () => undefined)
}

/**
 * Something read from the main process, read again whenever any window writes.
 * The one way every view stays current without each one wiring it up.
 */
export function useLive<T>(read: () => Promise<T>, initial: T, deps: unknown[] = [], kinds?: ('capture' | 'item')[], keep?: string): T {
  // A page opened again starts on what this same read last said, and reads
  // afresh as always: it is drawn whole at once, not empty and then again.
  // Only a read that is the same function each time (haligtree.tasks, not an
  // arrow made in the view) is kept, so one view's answer is never another's;
  // an arrow is kept under the name `keep` gives it.
  const key = keyOf(deps)
  const by = keep ?? read
  const keptFor = (): { value: unknown; json: string } | undefined => (key === null ? undefined : said.get(by)?.get(key))
  // What is shown, the deps it was read for and its answer as said. Deps changed
  // (another week, another day) and something said for the new ones already,
  // it starts on that; with nothing said yet, it keeps the old until the answer.
  // An answer is dropped only as the same as what is shown for these deps: kept
  // on the old deps' answer and compared with the new deps' last one, an equal
  // answer was dropped and the old week's events stayed under the new week.
  const [shown, setShown] = useState<{ key: string | null; value: T; json?: string }>(() => {
    const kept = keptFor()
    return { key, value: kept ? (kept.value as T) : unread(initial), json: kept?.json }
  })
  if (shown.key !== key) {
    const kept = keptFor()
    if (kept) setShown({ key, value: kept.value as T, json: kept.json })
  }
  const value = shown.value
  useEffect(() => {
    // Every write anywhere reloads every list, a note being typed in included:
    // an answer the same as the last keeps the old value, so nothing redraws.
    let last: string | undefined = shown.key === key ? shown.json : undefined
    // An answer that comes back after the deps changed (another day, another
    // id) is dropped: arriving after the new one, it would stay on screen
    // under the new header until something next changed.
    let gone = false
    // Only the newest read's answer counts: many writes at once (a hundred
    // to the Bin, then Undo) start many reads, and an older one that comes
    // back last would show the list from before the newest change.
    let asked = 0
    // How long its last answer took.
    let took = 0
    const load = (changed = false): void => {
      const mine = ++asked
      const take = ({ next, json: now }: { next: T; json: string }): void => {
        if (key !== null) (said.get(by) ?? said.set(by, new Map()).get(by)!).set(key, { value: next, json: now })
        if (gone || mine !== asked || now === last) return
        // Nothing moves under the hand: a change met while a row is carried (a reminder come due, pinning itself at
        // the top of the sidebar; a capture saved in another window) is drawn once the row is let go.
        if (changed && carrying()) return void onceLetGo(() => take({ next, json: now }))
        last = now
        setShown({ key, value: next, json: now })
      }
      // Read again for a change: with every other read that change started (`together`), unless this
      // read is a slow one (a folder of pictures looked through), which would hold the rest back.
      const t0 = performance.now()
      const asking = readOnce(by, key, read)
      void asking.then(() => void (took = performance.now() - t0), () => undefined)
      // One that fails before anything was read is said (ui.tsx hears it), with a way to ask again: a page never
      // waits on it in silence. A later one keeps what was read before on screen.
      void asking.catch((error) => !gone && mine === asked && last === undefined && window.dispatchEvent(new CustomEvent('mf-read-failed', { detail: { error, again: () => load() } })))
      if (changed && took < SLOW_READ) together(asking, take)
      else void asking.then(take, () => undefined)
    }
    // Started on what it last said, it reads afresh once the page is drawn: asked at once, the
    // reads of everything a page holds (Today's every task, every tag) went ahead of what the page
    // is waiting for, and the main process answers one at a time.
    const later = last !== undefined ? afterPaint(() => load()) : (load(), undefined)
    // `kinds`: what it shows, so a save of something else leaves it be.
    const off = window.api.captures.onChange(() => load(true), kinds)
    return () => {
      gone = true
      later?.()
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

/**
 * Opens what was picked from a read that can come back late: only the answer
 * to the last ask lands, so stepping quickly (arrows, j/k then Enter, a fast
 * second click) never leaves the one before on screen under the new row.
 * Called with nothing, it forgets any ask in flight (on close).
 */
export function useLastAsked(): <T>(read?: Promise<T>, then?: (value: T) => void) => void {
  const last = useRef(0)
  return useCallback(<T,>(read?: Promise<T>, then?: (value: T) => void): void => {
    const mine = ++last.current
    void read?.then((value) => void (last.current === mine && then?.(value)))
  }, [])
}

// Dates are said the same way everywhere: the helpers live with Day.js, shared with the main process.
export { interval } from '../../../main/dates'
export { when, whenInLine } from './clock'

/** A title without its `#tags`, and the tags: so a row can show them as pills. `line`: the tags on its last line (a row's `tagLine`), shown with them. */
export function splitTags(text: string, line?: string | null): { text: string; tags: string[] } {
  if (line) {
    const named = splitTags(text)
    return { text: named.text, tags: [...new Set([...named.tags, ...line.split(' ')])] }
  }
  // Read once a title: Display asks every row's tags again for each tag it offers (400 tasks by 166 tags was 85 ms a draw).
  let known = splitSeen.get(text)
  if (!known) {
    if (splitSeen.size > 5000) splitSeen.clear()
    splitSeen.set(text, (known = { text: nameWithoutTags(text), tags: tagWords(text) }))
  }
  return { text: known.text, tags: [...known.tags] }
}
const splitSeen = new Map<string, { text: string; tags: string[] }>()

/**
 * A name as it is shown anywhere, a page's title or a line naming it: without
 * its #tags, which show as tags (in Properties, or as pills). What is stored
 * keeps them, as typed. A name that is only tags is named by them, without
 * their "#" ("#bit #joke" reads "bit joke").
 */
export const shownName = (title: string): string => nameWithoutTags(title) || title.replace(/(^|\s)#/g, '$1').trim()

/**
 * A name typed over a shown name: the tags the stored one had, and that were
 * not typed again, go back on the end, so renaming a page never drops a tag.
 */
export function withTagsOf(typed: string, stored: string): string {
  const had = tagWords(stored)
  const left = had.filter((tag) => !tagWords(typed).some((one) => one.toLowerCase() === tag.toLowerCase()))
  return [typed, ...left.map((tag) => `#${tag}`)].join(' ').trim()
}

/**
 * The app's sizes, ⌘+ and ⌘− a step at a time, in percent of the size it
 * comes at (17px). The small and large of old are 95% and 110% now.
 */
export const APP_SIZES = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150]
/** The app's size now, in percent; a size saved as small, medium or large is read as its nearest step. */
export const appSizeOf = (settings: Pick<Settings, 'interfaceSize'> | null | undefined): number => {
  const saved = settings?.interfaceSize
  if (typeof saved === 'number') return Math.min(150, Math.max(80, saved))
  return saved === 'small' ? 95 : saved === 'large' ? 110 : 100
}
/** The root font size at a size in percent: every size in the app is in rem, so this scales all of it. */
const rootSizeAt = (percent: number): string => `${(17 * percent) / 100}px`
/**
 * Whether this window grows with the app size: the main window, a note's
 * window, a drawing's, the look window. The others (quick capture, the focus
 * pill, stickies, the glow, nudge cards) are a size in pixels that main sets,
 * so they stay at 100% and are never cut off.
 */
const SIZED = ((opened) => ['home', 'look'].includes(opened.get('view') ?? '') || opened.has('note') || opened.has('drawing'))(new URLSearchParams(window.location.search))
/** This window's root size at an app size: its own at 100% when it does not grow (SIZED). */
export const windowRootSize = (percent: number): string => rootSizeAt(SIZED ? percent : 100)

/**
 * How the app looked when its settings were last read: the interface size,
 * the page width, postcards, motion. Worn the moment a window's code loads,
 * before its first frame, so a window opening (or reloading, or a new book)
 * is never drawn at the default size and then redrawn a step larger once the
 * settings come back. The settings, once read, still have the last word.
 */
const WORN = 'worn-settings'
;(function wornBefore(): void {
  try {
    const worn = JSON.parse(localStorage.getItem(WORN) ?? 'null') as { size?: number; data?: Record<string, string>; postcards?: boolean; noblur?: boolean; still?: boolean } | null
    if (!worn) return
    const root = document.documentElement
    if (typeof worn.size === 'number') root.style.fontSize = windowRootSize(worn.size)
    // Only what the settings set: a window's own marks (its view, its focus) are its own.
    for (const key of ['width', 'linkPictures', 'motion', 'postcardBorder', 'highlights', 'tagLook', 'menuIcons', 'iconColour', 'barWords', 'marks', 'bars', 'avatars']) if (worn.data?.[key] && !root.dataset[key]) root.dataset[key] = worn.data[key]
    root.toggleAttribute('data-postcards', !!worn.postcards)
    root.toggleAttribute('data-noblur', !!worn.noblur)
    if (worn.still) MotionGlobalConfig.skipAnimations = true
  } catch {
    // Nothing worn yet: the first window wears the settings once they are read.
  }
})()

/**
 * The settings that change how the whole app looks and sounds, applied the
 * moment they change: the page width as a flag on the document, which the
 * stylesheet reads, and the sounds as a switch the chimes check.
 */
export function useAppearance(): void {
  const settings = useLive(haligtree.settings, null as Settings | null)
  // Every sticky shown or put away at once (⌃⌥⌘N, the menu bar, ⌘K, Settings): said quietly by the one window main picks.
  useEffect(() => window.api.onStickiesShown((shown) => chime(shown ? 'untuck' : 'tuck')), [])
  // Tag colours from the Tags page, for every editor in this window.
  const meta = useLive(haligtree.tagMeta, [] as Awaited<ReturnType<typeof haligtree.tagMeta>>)
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
    document.documentElement.dataset.readerWidth = settings.readerWidth ?? 'notes'
    document.documentElement.dataset.linkPictures = settings.linkPictures ?? 'fill'
    document.documentElement.dataset.avatars = settings.avatars ?? 'initials'
    document.documentElement.dataset.smoothScroll = settings.smoothScroll === false ? 'off' : 'on'
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off'
    document.documentElement.toggleAttribute('data-postcards', !!settings.postcards)
    document.documentElement.dataset.postcardBorder = settings.postcardBorder ?? 'auto'
    document.documentElement.dataset.highlights = settings.highlights ?? 'soft'
    document.documentElement.dataset.tagLook = settings.tagLook ?? 'solid'
    document.documentElement.dataset.paper = settings.paper ?? 'plain'
    document.documentElement.dataset.pictureSize = settings.pictureSize ?? 'full'
    document.documentElement.dataset.menuIcons = settings.menuIcons ?? 'lines'
    document.documentElement.dataset.iconColour = settings.iconColour === false ? 'off' : 'on'
    document.documentElement.dataset.barWords = settings.barWords ? 'on' : 'off'
    document.documentElement.dataset.marks = settings.marks === false ? 'off' : 'on'
    document.documentElement.dataset.bars = settings.progressBars ?? 'line'
    document.documentElement.toggleAttribute('data-noblur', settings.blur === false)
    // Quick capture (the window with no view of its own) keeps its full strength when you leave it, if you say so.
    document.documentElement.toggleAttribute('data-box-nodim', settings.boxDim === false && !new URLSearchParams(window.location.search).get('view'))
    // Inherited by every editor and field below; on, each keeps its own say.
    if (settings.spellcheck === false) document.documentElement.spellcheck = false
    else document.documentElement.removeAttribute('spellcheck')
    // Every size in the app is in rem, so the root's size scales all of it at once.
    document.documentElement.style.fontSize = windowRootSize(appSizeOf(settings))
    // Off, nothing animates. The system's Reduce motion is the MotionConfig's
    // (main.tsx): things still fade there, but nothing slides or springs.
    MotionGlobalConfig.skipAnimations = !settings.motion
    // Kept for the next window, or this one reloaded, to wear from its first frame (wornBefore).
    try {
      const root = document.documentElement
      localStorage.setItem(WORN, JSON.stringify({ size: appSizeOf(settings), data: { ...root.dataset }, postcards: root.hasAttribute('data-postcards'), noblur: root.hasAttribute('data-noblur'), still: !settings.motion }))
    } catch {
      // Not kept: the window wears the settings once they are read, as before.
    }
    soundOn(settings.sounds)
    setVolume(settings.volume)
    setPack(settings.soundPack)
  }, [settings?.fullWidth, settings?.pageWidth, settings?.readerWidth, settings?.linkPictures, settings?.avatars, settings?.smoothScroll, settings?.motion, settings?.postcards, settings?.postcardBorder, settings?.highlights, settings?.tagLook, settings?.paper, settings?.pictureSize, settings?.menuIcons, settings?.iconColour, settings?.barWords, settings?.marks, settings?.progressBars, settings?.blur, settings?.boxDim, settings?.spellcheck, settings?.interfaceSize, settings?.sounds, settings?.volume, settings?.soundPack])
}

/** The settings as this window last read them, for code that is not a component (a row's menu). */
let lastSettings: Settings | null = null
/** The focus timer and website blocking on (Settings, Tasks): off, nothing offers to start one. */
export const focusToolsShown = (): boolean => lastSettings?.focusTools === true
/**
 * How many days back the Inbox lists open captures (Settings' “Inbox shows”, 0
 * for everything), for a component: drawn again when it changes, and right
 * from the first frame once this window has read the settings.
 */
export const useInboxDays = (): number => (useLive(haligtree.settings, lastSettings)?.inboxDays ?? 7)
/** The same, for a component: drawn again when it is turned on or off. */
export const useFocusTools = (): boolean => useLive(haligtree.settings, null as Settings | null)?.focusTools === true
