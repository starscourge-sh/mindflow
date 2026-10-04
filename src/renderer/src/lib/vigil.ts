import { useEffect, useState } from 'react'

import { soundOn } from './sound'

/**
 * The main process's `vigil:` channels, typed. One generic bridge in the
 * preload, the shapes here, so a new channel is one line on each side.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export type Settings = {
  fullWidth: boolean
  sounds: boolean
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
  cite: string | null
  context: string | null
  mode: 'encounter' | 'pushed'
}
export type Gloss = { id: string; body: string; author: 'user' | 'ai'; createdAt: string }
export type ItemFull = Item & { body: unknown; origins: string[]; glosses: Gloss[] }
export type Due = Item & { body: unknown; intervals: Record<number, string> }

export type Task = {
  id: string
  number: number
  title: string
  status: 'open' | 'done'
  dueAt: string | null
  allDay: number
  recurrence: string | null
  captureId: string | null
  createdAt: string
  completedAt: string | null
  waitingOn: string | null
  estimate: number | null
  sortOrder: number | null
}
export type Subtask = { text: string; done: boolean }
export type TaskFull = Task & { notes: unknown; done: { at: string }[]; subtasks: Subtask[]; linked: { id: string; tier: string; kind: string; title: string }[] }

export type Session = { id: string; startedAt: string; endedAt: string | null; recap: string | null }

export type Pin = { id: string; type: 'capture' | 'nugget' | 'article'; kind: string; title: string; pinnedAt: string }
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
  leeches: number
  stopped: number
  unprocessed: { now: number; weekAgo: number }
}

export const vigil = {
  settings: () => call<Settings>('settings'),
  setSettings: (patch: Partial<Settings>) => call<Settings>('settings:set', patch),
  setPrivate: (table: 'captures' | 'nuggets', id: string, on: boolean) => call('private', table, id, on),
  pin: (table: 'captures' | 'nuggets', id: string, on: boolean) => call('pin', table, id, on),
  pins: () => call<Pin[]>('pins'),
  promote: (id: string) => call<string | null>('promote', id),
  toTask: (id: string) => call<string | null>('toTask', id),
  items: (tier: 'nugget' | 'article') => call<Item[]>('items', tier),
  item: (id: string) => call<ItemFull | null>('item', id),
  saveItem: (id: string, patch: Partial<{ body: unknown; title: string; prompt: string | null; kind: string; suspended: boolean; cite: string | null; context: string | null; mode: string }>) =>
    call('item:save', id, patch),
  article: (ids: string[]) => call<string>('article', ids),
  gloss: (id: string, text: string) => call('gloss', id, text),
  queue: () => call<Due[]>('review:queue'),
  dueCount: () => call<number>('review:counts'),
  grade: (id: string, grade: 1 | 2 | 3 | 4, ms: number) => call<string>('review:grade', id, grade, ms),
  tasks: () => call<Task[]>('tasks'),
  task: (id: string) => call<TaskFull | null>('task', id),
  addTask: (text: string, origin?: string) => call<string>('task:add', text, origin),
  saveTask: (id: string, patch: Partial<{ title: string; notes: unknown; due: string | null; recurrence: string | null; status: string; waitingOn: string | null; subtasks: Subtask[]; estimate: number | null; sortOrder: number }>) =>
    call('task:save', id, patch),
  doneTask: (id: string) => call('task:done', id),
  tags: () => call<{ tag: string; count: number }[]>('tags'),
  tag: (tag: string) => call<{ tag: string; id: string; type: string; title: string }[]>('tag', tag),
  stats: () => call<Stats>('stats'),
  exportAll: () => call<string | null>('export'),
  bury: (id: string) => call('review:bury', id),
  setCapture: (id: string, field: 'discharge' | 'cite' | 'capturedAt', value: string | number | null) => call('capture:set', id, field, value),
  linkSession: (id: string) => call('capture:session', id),
  random: () => call<{ id: string; kind: string; title: string; body: unknown }[]>('random'),
  study: (itemId: string, text: string) => call<string>('study', itemId, text),
  pursue: (captureId: string) => call<string>('pursue', captureId),
  renameTag: (from: string, to: string) => call<string | null>('tag:rename', from, to),
  remind: (table: 'captures' | 'nuggets', id: string, at: string | null) => call('remind', table, id, at),
  similar: (text: string) => call<{ id: string; number: number; title: string; score: number } | null>('similar', text),
  sessions: (taskId: string) => call<Session[]>('sessions', taskId),
  startSession: (taskId: string) => call('session:start', taskId),
  endSession: (id: string, recap: string, keep: boolean) => call('session:end', id, recap, keep)
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
  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.width = settings.fullWidth ? 'full' : 'page'
    soundOn(settings.sounds)
  }, [settings?.fullWidth, settings?.sounds])
}
