import { useEffect, useState } from 'react'
import { tagColors } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'
import { MotionGlobalConfig } from 'motion/react'
import { installTicks, setPack, setVolume, soundOn, type PackName } from './sound'

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
}
export type Gloss = { id: string; body: string; author: 'user' | 'ai'; createdAt: string }
export type ItemFull = Item & { body: unknown; origins: string[]; glosses: Gloss[] }
export type Due = Item & { body: unknown; intervals: Record<number, string> }

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
  /** What is in the way. */
  blocker: string | null
  /** How many times it has been pushed later. */
  reschedules: number
  /** This task's own alert level, over the setting; null follows the setting. */
  notify: 'pull' | 'quiet' | 'alerts' | null
}
export type Subtask = { text: string; done: boolean }
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
  setPrivate: (table: 'captures' | 'nuggets', id: string, on: boolean) => call('private', table, id, on),
  /** False when three are pinned already. */
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call<boolean>('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  reviewTuning: () => call<{ cap: number; tuned: boolean; behind: number }>('review:tuning'),
  promote: (id: string, words?: string) => call<string | null>('promote', id, words),
  /** What it came from, what it became, and what links to it. */
  mentions: (id: string) => call<Record<'linked' | 'unlinked', { type: string; id: string; title: string; snippet: string; private?: number }[]>>('mentions', id),
  linkMention: (sourceType: string, sourceId: string, targetId: string) => call<boolean>('mention:link', sourceType, sourceId, targetId),
  lineage: (id: string) => call<Record<'from' | 'became' | 'linked', { type: string; id: string; title: string; private?: number }[]>>('lineage', id),
  newArticle: () => call<string>('article:new'),
  findItems: (query: string) => call<{ id: string; tier: 'nugget' | 'article'; title: string }[]>('items:find', query),
  toTask: (id: string) => call<Made | null>('toTask', id),
  items: (tier: 'nugget' | 'article') => call<Item[]>('items', tier),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; title: string; prompt: string | null; kind: string; suspended: boolean; attribution: string | null; context: string | null; mode: string }>) =>
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
  saveTask: (id: string, patch: Partial<{ title: string; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number; important: number; deadline: string | null; blocker: string | null; reschedules: number; notify: string | null }>) =>
    call('task:save', id, patch),
  doneTask: (id: string) => call('task:done', id),
  tags: () => call<{ tag: string; count: number; color: string | null; action: boolean }[]>('tags'),
  tagMeta: () => call<{ tag: string; color: string | null; action: number }[]>('tag:meta'),
  setTag: (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null }) => call('tag:set', tag, patch),
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

/** How far off a review is: "10m", "1d", "3w". */
export function interval(iso: string): string {
  const minutes = Math.max(1, (new Date(iso).getTime() - Date.now()) / 60000)
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
