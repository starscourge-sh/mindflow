import { useEffect, useState } from 'react'
import { tagColors } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'
import { MotionGlobalConfig } from 'motion/react'
import { chime, installTicks, setPack, setVolume, soundOn, type PackName } from './sound'
import { useEditorSetup } from './editor-setup'

/**
 * The main process's `vigil:` channels, typed. One generic bridge in the
 * preload, the shapes here, so a new channel is one line on each side.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export type Settings = {
  fullWidth: boolean
  sounds: boolean
  volume: number
  motion: boolean
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
  /** A key from NOTE_FONTS, or a system font's family name. */
  noteFont: string
  /** Text in notes, as a scale: 1 is normal. */
  textSize: number
  weeklyReview: boolean
  /** 0 is Sunday. */
  weeklyDay: number
  examNudges: boolean
  memories: boolean
  weather: boolean
  /** A note's first picture at the end of its row. */
  thumbnails: boolean
}

/** A nugget or an article: the same row, told apart by `tier`. */
export type Item = {
  id: string
  tier: 'nugget' | 'article'
  kind: string
  title: string
  prompt: string | null
  private: number
  pinnedAt: string | null
  dueAt: string | null
  suspended: number
  reviewed: number
  createdAt: string
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
}
export type Gloss = { id: string; body: string; author: 'user' | 'ai'; createdAt: string }
export type ItemFull = Item & { body: unknown; origins: string[]; glosses: Gloss[] }
export type Due = Item & { body: unknown; intervals: Record<number, string>; gloss: string | null; exam: string | null }
/** How ready a tag with an exam date is. */
export type Exam = { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }
/** A month or a year, Wrapped's way. */
export type Recap = {
  label: string
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
export type Finished = { dueAt: string | null; doneAt: string; notifiedAt: string | null; deadlineAt?: string | null }
/** A task made, or the open one with that name already there, which it joined. */
export type Made = { id: string; number: number; existed: boolean }
/** What to say after making a task: the usual words, or that it joined one. */
export const taskSaid = (made: Made | null | undefined, fresh: string): string =>
  made?.existed ? `Already a task: T-${made.number}. Linked to it, not added twice` : fresh
export type TaskFull = Task & { notes: unknown; done: { at: string; recap: string | null }[]; subtasks: Subtask[]; linked: { id: string; tier: string; kind: string; title: string }[] }

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null }
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
  day: { captured: number; exits: number; reviews: number }
  year: { captured: number; nuggets: number; articles: number; month: string | null }
  stopped: number
  unprocessed: { now: number; weekAgo: number }
}

export const vigil = {
  settings: () => call<Settings>('settings'),
  setSettings: (patch: Partial<Settings>) => call<Settings>('settings:set', patch),
  // Up for private, down for not, from whichever menu or button switched it.
  setPrivate: (table: 'captures' | 'nuggets', id: string, on: boolean, quiet = false) => (quiet || chime(on ? 'on' : 'off'), call('private', table, id, on)),
  /** False when three are pinned already. */
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call<boolean>('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  reviewTuning: () => call<{ cap: number; tuned: boolean; behind: number }>('review:tuning'),
  promote: (id: string, words?: string) => call<string | null>('promote', id, words),
  unpromote: (captureId: string, nuggetId: string) => call<boolean>('promote:undo', captureId, nuggetId),
  /** What it came from, what it became, and what links to it. */
  mentions: (id: string) => call<Record<'linked' | 'unlinked', { type: string; id: string; title: string; snippet: string; private?: number }[]>>('mentions', id),
  linkMention: (sourceType: string, sourceId: string, targetId: string) => call<boolean>('mention:link', sourceType, sourceId, targetId),
  lineage: (id: string) => call<Record<'from' | 'became' | 'linked', { type: string; id: string; title: string; private?: number }[]>>('lineage', id),
  newArticle: () => call<string>('article:new'),
  findItems: (query: string) => call<{ id: string; tier: 'nugget' | 'article'; title: string }[]>('items:find', query),
  toTask: (id: string) => call<Made | null>('toTask', id),
  items: (tier: 'nugget' | 'article') => call<Item[]>('items', tier),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; title: string; prompt: string | null; kind: string; suspended: boolean; attribution: string | null; context: string | null; mode: string; why: string | null }>) =>
    call('item:save', id, patch),
  article: (ids: string[]) => call<string>('article', ids),
  gloss: (id: string, text: string) => call('gloss', id, text),
  queue: () => call<Due[]>('review:queue'),
  dueCount: () => call<number>('review:counts'),
  grade: (id: string, grade: 1 | 2 | 3 | 4, ms: number) => call<string>('review:grade', id, grade, ms),
  tasks: () => call<Task[]>('tasks'),
  task: (id: string) => call<TaskFull | null>('task', id),
  /** `today`: with no date in the words, it is for today. */
  addTask: (text: string, origin?: string, today = false) => call<Made>('task:add', text, origin, today),
  saveTask: (id: string, patch: Partial<{ title: string; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number; important: number; deadline: string | null; blocker: string | null; reschedules: number; notify: string | null; priority: number; plan: string | null }>) =>
    call('task:save', id, patch),
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
  nudge: () => call<{ kind: 'exam' | 'weekly'; view: string; label: string; text: string } | null>('nudge'),
  memory: () => call<{ id: string; captureId: string; kind: string; title: string; body: unknown; event: number; memory: string } | null>('memory'),
  rotLeft: () => call<number>('rot:left'),
  recap: (period: 'month' | 'year') => call<Recap>('recap', period),
  supersede: (id: string, truth: string) => call<string>('supersede', id, truth),
  mergeCapture: (id: string, intoNumber: number) => call<string | null>('capture:merge', id, intoNumber),
  hintRate: () => call<{ rate: number; tuned: boolean; shown: number; stopped: number }>('hints:rate'),
  tag: (tag: string) => call<{ tag: string; id: string; type: string; title: string }[]>('tag', tag),
  stats: () => call<Stats>('stats'),
  exportAll: () => call<string | null>('export'),
  bury: (id: string) => call('review:bury', id),
  taskFrom: (ids: string[], text: string) => call<Made>('tasks:from', ids, text),
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
  /** A countdown with no task behind it, shown in the floating timer: "5m tea". */
  startTimer: (goal: string, ms: number) => call<string>('timer:start', goal, ms),
  pauseSession: (id: string) => call('session:pause', id),
  resumeSession: (id: string) => call('session:resume', id),
  cancelSession: (id: string) => call('session:cancel', id),
  endSession: (id: string, recap: string, keep: boolean, close = false) => call('session:end', id, recap, keep, close)
}

/**
 * Something read from the main process, read again whenever any window writes.
 * The one way every view stays current without each one wiring it up.
 */
export function useLive<T>(read: () => Promise<T>, initial: T, deps: unknown[] = []): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const load = (): void => void read().then(setValue)
    load()
    return window.api.captures.onChange(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

/** "today", "tomorrow", "Mon 6 Oct", "3d ago": a date the way a list says it. */
export function when(iso: string | null, allDay = true): string {
  if (!iso) return ''
  const date = new Date(iso)
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  const time = allDay ? '' : ` ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  if (days === 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  if (days === -1) return `Yesterday${time}`
  if (days > 1 && days < 7) return `${date.toLocaleDateString([], { weekday: 'long' })}${time}`
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}${time}`
}

/** How far off a review is: "10m", "1d", "3w". From now, or from another moment. */
export function interval(iso: string, from: string | number = Date.now()): string {
  const minutes = Math.max(1, (new Date(iso).getTime() - new Date(from).getTime()) / 60000)
  const units: [number, string][] = [[525600, 'y'], [43200, 'mo'], [10080, 'w'], [1440, 'd'], [60, 'h'], [1, 'm']]
  const [size, unit] = units.find(([size]) => minutes >= size) ?? [1, 'm']
  return `${Math.round(minutes / size)}${unit}`
}

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
export function useAppearance(): void {
  const settings = useLive(vigil.settings, null as Settings | null)
  // Tag colours from the Tags page, for every editor in this window.
  const meta = useLive(vigil.tagMeta, [] as Awaited<ReturnType<typeof vigil.tagMeta>>)
  useEffect(() => {
    tagColors.clear()
    for (const row of meta) if (row.color) tagColors.set(row.tag.toLowerCase(), row.color as BlockColor)
  }, [meta])
  useEffect(installTicks, [])
  // The editor's sounds, math, font and text size.
  useEditorSetup(settings)
  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.width = settings.fullWidth ? 'full' : 'page'
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off'
    // The system's Reduce motion is honoured too: things still appear and
    // fade, but nothing slides or springs.
    MotionGlobalConfig.skipAnimations = !settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches
    soundOn(settings.sounds)
    setVolume(settings.volume)
    setPack(settings.soundPack)
  }, [settings?.fullWidth, settings?.motion, settings?.sounds, settings?.volume, settings?.soundPack])
}
