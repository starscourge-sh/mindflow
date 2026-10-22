import { call, useLive } from '@/lib/vigil'
import type { Layout } from '@/lib/group-layout'

/**
 * The main process's `groups:` channels, typed: a kept list's groups, each
 * with its notes in order, and the few things done to one.
 */

export type NoteGroup = { id: string; name: string; icon: string | null; color: string | null; folded: number; members: string[]; /** The group a subgroup sits in. */ parent: string | null }
type Separated = { group: Record<string, string | number>; ids: string[]; subs?: string[] }

export const groups = {
  list: (list: string) => call<NoteGroup[]>('groups', list),
  arrange: (list: string, layout: Layout) => call<boolean>('groups:arrange', list, layout),
  set: (id: string, patch: { name?: string; icon?: string | null; color?: string | null; folded?: boolean }) => call<boolean>('groups:set', id, patch),
  separate: (id: string) => call<Separated | null>('groups:separate', id),
  restore: (was: Separated) => call<boolean>('groups:restore', was),
  duplicate: (id: string) => call<{ id: string; ids: string[] } | null>('groups:duplicate', id),
  links: (id: string | string[]) => call<string[]>('groups:links', id),
  clone: (list: string, ids: string[]) => call<string[]>('groups:clone', list, ids),
  unclone: (ids: string[]) => call<boolean>('groups:unclone', ids),
  note: (id: string) => call<string | null>('groups:note', id)
}

// Kept by name, so a page opened again starts on its groups, not on a plain list that sorts itself a beat later.
export const useGroups = (list: string): NoteGroup[] => useLive(() => groups.list(list), [] as NoteGroup[], [list], undefined, 'groups')

/** The colours a group can take: the editor's own, light and dark. */
export const GROUP_COLORS = ['gray', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export const tintOf = (color: string | null | undefined): string | undefined => (color ? `var(--tt-color-text-${color})` : undefined)
