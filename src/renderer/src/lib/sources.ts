import { call } from './vigil'
import type { SourceField, SourceGraph, SourcePage, SourceSummary } from '../../../main/sources'

export type { SourceField, SourceGraph, SourceItem, SourcePage, SourceSummary } from '../../../main/sources'
export { VOICE_SAID, pageRef, voiceOf, type Voice } from '../../../main/voice'

export const sources = {
  list: () => call<SourceSummary[]>('sources'),
  page: (field: SourceField, name: string) => call<SourcePage | null>('source', field, name),
  set: (field: SourceField, name: string, thoughts?: string) => call<boolean>('source:set', field, name, thoughts),
  /** Remove empty pages, and the Undo that brings each back with the thoughts written on it. */
  dropAll: async (list: { field: SourceField; name: string }[]): Promise<() => void> => {
    const had = await Promise.all(list.map((one) => call<SourcePage | null>('source', one.field, one.name)))
    await Promise.all(list.map((one) => call<boolean>('source:drop', one.field, one.name)))
    return () => void Promise.all(list.map((one, at) => call<boolean>('source:set', one.field, one.name, had[at]?.thoughts ?? '')))
  },
  graph: () => call<SourceGraph>('sources:graph'),
  missing: () => call<{ type: string; id: string; kind: string; label: string; at: string }[]>('sources:missing')
}

/** A source page's step focus: which field and the name, "attribution:Marcus Aurelius". */
const sourceFocus = (field: SourceField, name: string): string => `${field}:${name.trim()}`
export const readFocus = (focus: string | undefined): { field: SourceField; name: string } | null => {
  const at = focus?.indexOf(':') ?? -1
  if (!focus || at < 0) return null
  const field = focus.slice(0, at)
  return field === 'attribution' || field === 'medium' ? { field, name: focus.slice(at + 1) } : null
}

/** Open a who's or a where's page from anywhere in the window: the main window's page listens. */
export const openSource = (field: SourceField, name: string): void => {
  if (name.trim()) window.dispatchEvent(new CustomEvent('vigil:source', { detail: sourceFocus(field, name) }))
}

/** The colour of each voice, from the theme (main.css): subtle, and the same in lists and the editor. */
export const VOICE_TINT = { theirs: 'var(--voice-theirs)', understood: 'var(--voice-understood)', mine: 'var(--voice-mine)' } as const
