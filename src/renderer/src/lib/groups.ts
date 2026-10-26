import { useEffect, useMemo, useState } from 'react'
import { call, unloaded, useLive } from '@/lib/haligtree'
import type { Layout } from '@/lib/group-layout'

/**
 * The main process's `groups:` channels, typed: a kept list's groups, each
 * with its notes in order, and the few things done to one.
 */

export type NoteGroup = { id: string; name: string; icon: string | null; color: string | null; folded: number; members: string[]; /** The group a subgroup sits in. */ parent: string | null }
type Separated = { group: Record<string, string | number | null>; ids: string[]; subs?: string[] }

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
  note: (id: string) => call<string | null>('groups:note', id),
  make: (list: string, name: string, parent: string | null = null) => call<string>('groups:make', list, name, parent),
  remove: (id: string) => call<boolean>('groups:delete', id),
  place: (moves: { id: string; group: string | null; order?: number | null }[]) => call<{ id: string; group: string | null; order: number | null }[]>('groups:place', moves),
  nest: (id: string, parent: string | null) => call<boolean>('groups:nest', id, parent)
}

// Opened cold (the window coming up), a read starts on what it last said in this book, kept on disk, so the sidebar's
// folders are drawn from the first frame, in their order, instead of pushing the rows under them down a beat later
// (qa/no-flash.mjs). Kept per book, so another book's folders never show.
export function useKept<T>(name: string, read: () => Promise<T>, initial: T, deps: unknown[]): T {
  const key = useMemo(() => {
    try {
      return `kept:${window.api.book()}:${name}:${JSON.stringify(deps)}`
    } catch {
      return null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps])
  const [kept] = useState(() => {
    try {
      return key ? (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) : null
    } catch {
      return null
    }
  })
  const value = useLive(read, kept ?? initial, deps, undefined, name)
  useEffect(() => {
    if (!key || unloaded(value)) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Drawn a beat later next time, at worst.
    }
  }, [key, value])
  return value
}
/** Kept by name, so a page opened again starts on its groups, not on a plain list that sorts itself a beat later. */
export const useGroups = (list: string): NoteGroup[] => useKept('groups', () => groups.list(list), [] as NoteGroup[], [list])

/** The colours a group can take: the editor's own, light and dark. */
export const GROUP_COLORS = ['gray', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export const tintOf = (color: string | null | undefined): string | undefined => (color ? `var(--tt-color-text-${color})` : undefined)
