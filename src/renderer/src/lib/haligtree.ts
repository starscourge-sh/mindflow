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
  /** A card is a "question :: answer" line written in a note (lineOf says which). */
  tier: 'nugget' | 'article' | 'question' | 'goal' | 'card'
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
export type Due = Item & { body: unknown; intervals: Record<number, string>; gloss: string | null; exam: string | null }
/** How ready a tag with an exam date is. */
export type Exam = { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }
/** A tagged thing read whole on its tag's page. */
export type TagRead = { id: string; type: string; kind: string; status: string; title: string; label: string; body: unknown; private: boolean; at: string; changed: string; tags: string[]; keptIn?: string | null; /** Done: kept under a click, not counted. */ later: boolean; /** A gem: the note it was saved from, which then shows only as this. */ fromNote?: string | null }
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
export type Subtask = { text: string; done: boolean }
/** What a save changed on its own, for an undo to put back: the reschedule count and when it was last told about. */
export type TaskWas = { reschedules: number; notifiedAt: string | null }
/** What a task was before it was done, so it can be put back. */
export type Finished = { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null; skips?: number }
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

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null; goal?: string | null; plannedMs?: number | null; pausedMs: number; pausedAt: string | null; /** Abandoned: kept in the log, counted in no total. */ abandonedAt?: string | null; /** One of the task's practice's sessions (1): its log line says it already. */ practice?: number }
/** A session ended on a day, with its task and what was logged in it. */
/** A focus session as a block in time, for the day's timeline and the week: running (no `endedAt`) or ended. */
export type SpanSession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string | null; plannedMs: number | null; pausedMs: number; pausedAt: string | null }
export type DaySession = { id: string; taskId: string; title: string; startedAt: string; endedAt: string; pausedMs: number; recap: string | null; abandonedAt?: string | null; /** No task behind it: named in its line. */ bare?: number | boolean; entries: LogEntry[] }
/** The session running now, as the floating timer shows it. */
export type Focus = { id: string; taskId: string; goal: string; startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null; /** Pomodoro rounds, as JSON (lib/timer.ts RoundsAt); null for any other session. */ rounds?: string | null; /** 'break' for a break taken after a session; 'focus' for a bare session, one with no task. */ kind?: string | null; /** Time added with +10 min, already in plannedMs. */ extendedMs?: number; /** A practice (main/practices.ts): which, and its target in minutes. */ practiceId?: string | null; practiceTarget?: number | null }

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
  celebrationPicks: () => call<Partial<Record<MomentKind, Media[]>>>('celebrations:picks'),
  /** A sticky's list just done: its celebration, or null when none may show now. */
  stickyDone: (id: string) => call<Moment | null>('celebrations:sticky', id),
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
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call<boolean>('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  reviewTuning: () => call<{ cap: number; tuned: boolean; behind: number }>('review:tuning'),
  promote: (id: string, words?: string) => call<string | null>('promote', id, words),
  /** `forgetWho`: the source was asked for while promoting, so it goes too. */
  unpromote: (captureId: string, nuggetId: string, forgetWho = false) => call<boolean>('promote:undo', captureId, nuggetId, forgetWho),
  /** What it came from, what it became, and what links to it. */
  mentions: (id: string) => call<Record<'linked' | 'unlinked' | 'out' | 'named', { type: string; id: string; title: string; snippet: string; private?: number }[]> & { me: string }>('mentions', id),
  linkMention: (sourceType: string, sourceId: string, targetId: string) => call<{ was: string; linked: string } | false>('mention:link', sourceType, sourceId, targetId),
  /** Undo a mention made a link: the other note's words as they were, unless changed since. */
  unlinkMention: (sourceType: string, sourceId: string, was: string, linked: string) => call<boolean>('mention:unlink', sourceType, sourceId, was, linked),
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
  closeGoal: (id: string, how: 'made it' | 'missed' | 'let go' | 'on ice', at?: string | null) => call<boolean | null>('goal:close', id, how, at),
  thawGoal: (id: string) => call<{ days: number; was: string; iced: string } | null>('goal:thaw', id),
  reopenGoal: (id: string) => call<boolean>('goal:reopen', id),
  dropGoal: (id: string) => call<boolean>('goal:drop', id),
  /** How often a goal's beacon shows; null follows Settings. */
  setBeacon: (id: string, mode: 'always' | 'sometimes' | 'off' | null) => call<boolean>('goal:beacon:set', id, mode),
  /** A goal's colour, one of GOAL_COLORS (lib/goal-colors). */
  setGoalColor: (id: string, color: string) => call<boolean>('goal:color:set', id, color),
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
  saveTask: (id: string, patch: Partial<{ allDay: number; title: string; until: string | null; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number | null; important: number; deadline: string | null; blocker: string | null; blockedBy: string | null; reschedules: number; notify: string | null; priority: number; plan: string | null; notifiedAt: string | null; completedAt: string | null; snoozedUntil: string | null; getReady: number | null; rollovers: number; skips: number }>) =>
    call<TaskWas | true>('task:save', id, patch),
  /** Gives back what it was, for `undoneTask`. */
  doneTask: (id: string) => call<Finished>('task:done', id),
  /** A routine passed over this time: on to its next date, nothing counted done. */
  skipTask: (id: string) => call<Finished>('task:skip', id),
  /** Open again on the date it had, and that time done no longer counted: a routine's undo too. */
  undoneTask: (id: string, was: Finished) => call('task:undone', id, was),
  /** A task made by mistake: see `makeTask`. */
  unmakeTask: (id: string, existed: boolean, links: string[], reopen: string[]) => call('task:unmake', id, existed, links, reopen),
  /** Tasks turned back into notes in the Inbox; what it gives back is for `unnoteTasks`. */
  taskToNote: (ids: string[]) => call<unknown[]>('task:to-note', ids),
  unnoteTasks: (kept: unknown[]) => call('task:to-note:undo', kept),
  /** Reviews falling on each of the next `days` days, today with what is late. */
  reviewLoad: (days: number) => call<number[]>('review:load', days),
  tags: () => call<{ tag: string; count: number; later: number; color: string | null; action: boolean; examAt: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }[]>('tags'),
  tagMeta: () => call<{ tag: string; color: string | null; action: number; backdrop: 'colour' | 'picture' | 'sketch' | null; homeHidden: number }[]>('tag:meta'),
  setTag: (tag: string, patch: { homeHidden?: boolean; backdrop?: 'colour' | 'picture' | 'sketch' | null; color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null; priority?: 'maintaining' | 'paused' | null; lands?: string | null }) => call('tag:set', tag, patch),
  exams: () => call<Exam[]>('exams'),
  history: (id: string) => call<{ reviews: { at: string; grade: number }[]; dueAt: string | null }>('review:history', id),
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
  /** Imported notes kept as they are (sorted), or put back to sort again. */
  sorted: (ids: string[], sorted: boolean) => call<boolean>('imports:sorted', ids, sorted),
  stats: () => call<Stats>('stats'),
  /** The folder written to; with `pictures: false` when the notes went but their pictures and files could not be copied. */
  exportAll: () => call<string | { folder: string; pictures: false } | null>('export'),
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
  /** The Learn Haligtree deck: how many of its cards you have, and adding them (0 when already there). */
  learnCount: () => call<number>('learn:count'),
  learnAdd: () => call<number>('learn:add'),
  /** The Learn Haligtree cards just added taken back, any reviewed since kept. Gives back how many went. */
  learnUndo: () => call<number>('learn:undo'),
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
  similar: (text: string) => call<{ id: string; number: number; title: string; score: number } | null>('similar', text),
  sessions: (taskId: string) => call<Session[]>('sessions', taskId),
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

/** Runs once the frame being drawn now is painted, with everything else asked for the same frame (so `readOnce` shares one read); returns a way to call it off. */
let painted: Set<() => void> | null = null
function afterPaint(run: () => void): () => void {
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
  const [value, setValue] = useState<T>(() => {
    const kept = key === null ? undefined : said.get(by)?.get(key)
    return kept ? (kept.value as T) : unread(initial)
  })
  useEffect(() => {
    // Every write anywhere reloads every list, a note being typed in included:
    // an answer the same as the last keeps the old value, so nothing redraws.
    let last: string | undefined = key !== null ? said.get(by)?.get(key)?.json : undefined
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
        last = now
        setValue(next)
      }
      // Read again for a change: with every other read that change started (`together`), unless this
      // read is a slow one (a folder of pictures looked through), which would hold the rest back.
      const t0 = performance.now()
      const asking = readOnce(by, key, read)
      void asking.then(() => void (took = performance.now() - t0), () => undefined)
      if (changed && took < SLOW_READ) together(asking, take)
      else void asking.then(take)
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

/** A title without its `#tags`, and the tags: so a row can show them as pills. */
export function splitTags(text: string): { text: string; tags: string[] } {
  return { text: nameWithoutTags(text), tags: tagWords(text) }
}

/** The root size for each interface size; small is the size the app was drawn at. */
export const INTERFACE_SIZES = { small: 16, medium: 17, large: 18.5 } as const

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
    const worn = JSON.parse(localStorage.getItem(WORN) ?? 'null') as { size?: string; data?: Record<string, string>; postcards?: boolean; noblur?: boolean; still?: boolean } | null
    if (!worn) return
    const root = document.documentElement
    if (worn.size) root.style.fontSize = worn.size
    // Only what the settings set: a window's own marks (its view, its focus) are its own.
    for (const key of ['width', 'linkPictures', 'motion', 'postcardBorder', 'highlights', 'barWords', 'marks', 'bars', 'avatars']) if (worn.data?.[key] && !root.dataset[key]) root.dataset[key] = worn.data[key]
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
    document.documentElement.dataset.linkPictures = settings.linkPictures ?? 'fill'
    document.documentElement.dataset.avatars = settings.avatars ?? 'shapes'
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off'
    document.documentElement.toggleAttribute('data-postcards', !!settings.postcards)
    document.documentElement.dataset.postcardBorder = settings.postcardBorder ?? 'auto'
    document.documentElement.dataset.highlights = settings.highlights ?? 'soft'
    document.documentElement.dataset.barWords = settings.barWords ? 'on' : 'off'
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
    // Kept for the next window, or this one reloaded, to wear from its first frame (wornBefore).
    try {
      const root = document.documentElement
      localStorage.setItem(WORN, JSON.stringify({ size: root.style.fontSize, data: { ...root.dataset }, postcards: root.hasAttribute('data-postcards'), noblur: root.hasAttribute('data-noblur'), still: !settings.motion }))
    } catch {
      // Not kept: the window wears the settings once they are read, as before.
    }
    soundOn(settings.sounds)
    setVolume(settings.volume)
    setPack(settings.soundPack)
  }, [settings?.fullWidth, settings?.pageWidth, settings?.linkPictures, settings?.avatars, settings?.motion, settings?.postcards, settings?.postcardBorder, settings?.highlights, settings?.barWords, settings?.marks, settings?.progressBars, settings?.blur, settings?.boxDim, settings?.spellcheck, settings?.interfaceSize, settings?.sounds, settings?.volume, settings?.soundPack])
}

/** The settings as this window last read them, for code that is not a component (a row's menu). */
let lastSettings: Settings | null = null
/** The focus timer and website blocking on (Settings, Tasks): off, nothing offers to start one. */
export const focusToolsShown = (): boolean => lastSettings?.focusTools === true
/** The same, for a component: drawn again when it is turned on or off. */
export const useFocusTools = (): boolean => useLive(haligtree.settings, null as Settings | null)?.focusTools === true
