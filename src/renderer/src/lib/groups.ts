import { useLive } from '@/lib/vigil'
import type { Layout } from '@/lib/group-layout'

/**
 * The main process's `groups:` channels, typed: a kept list's groups, each
 * with its notes in order, and the few things done to one.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export type NoteGroup = { id: string; name: string; icon: string | null; color: string | null; folded: number; members: string[] }
type Separated = { group: Record<string, string | number>; ids: string[] }

export const groups = {
  list: (list: string) => call<NoteGroup[]>('groups', list),
  arrange: (list: string, layout: Layout) => call<boolean>('groups:arrange', list, layout),
  set: (id: string, patch: { name?: string; icon?: string | null; color?: string | null; folded?: boolean }) => call<boolean>('groups:set', id, patch),
  separate: (id: string) => call<Separated | null>('groups:separate', id),
  restore: (was: Separated) => call<boolean>('groups:restore', was),
  duplicate: (id: string) => call<string | null>('groups:duplicate', id),
  links: (id: string) => call<string[]>('groups:links', id),
  note: (id: string) => call<string | null>('groups:note', id)
}

export const useGroups = (list: string): NoteGroup[] => useLive(() => groups.list(list), [] as NoteGroup[], [list])

/** The colours a group can take: the editor's own, light and dark. */
export const GROUP_COLORS = ['gray', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export const tintOf = (color: string | null | undefined): string | undefined => (color ? `var(--tt-color-text-${color})` : undefined)
