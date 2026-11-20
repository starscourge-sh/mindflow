import { useMemo, useSyncExternalStore } from 'react'

/**
 * Every fold in the sidebar, in one store: each section's heading, Writing's pages, Gems' folders, Journal's scales,
 * Library, and which folders in Folders' tree are unfolded. Kept across launches (localStorage), and read by the one
 * button beside the search that folds or unfolds them all, so a fold drawn anywhere in the sidebar follows it.
 */
const FOLDS = {
  'sidebar:folders': true,
  'sidebar:pinned': true,
  'sidebar:recent': true,
  'sidebar:library': false,
  'sidebar:tags': false,
  'sidebar:folders:article': true,
  'sidebar:folders:nugget': true,
  'sidebar:journal': true
} as const
export type FoldKey = keyof typeof FOLDS
/** The folders unfolded in Folders' tree, by id. */
const TREE = 'sidebar:folders-open'

const kept = new Map<string, string>()
const heard = new Set<() => void>()
const read = (key: string): string => {
  if (!kept.has(key)) {
    let value = ''
    try { value = localStorage.getItem(key) ?? '' } catch { /* this run only */ }
    kept.set(key, value)
  }
  return kept.get(key)!
}
const write = (pairs: [string, string][]): void => {
  for (const [key, value] of pairs) {
    kept.set(key, value)
    try { localStorage.setItem(key, value) } catch { /* this run only */ }
  }
  heard.forEach((one) => one())
}
const listen = (change: () => void): (() => void) => (heard.add(change), () => void heard.delete(change))

const isOpen = (key: FoldKey): boolean => (read(key) ? read(key) === 'open' : FOLDS[key])
const treeOf = (value: string): Set<string> => { try { return new Set(JSON.parse(value || '[]') as string[]) } catch { return new Set() } }

/** One fold: open or not, and the way to set it. */
export function useFold(key: FoldKey): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(listen, () => isOpen(key))
  return [open, (next) => write([[key, next ? 'open' : 'shut']])]
}

/** The folders unfolded in Folders' tree, and the way to set them. */
export function useTreeFolds(): [Set<string>, (next: Set<string>) => void] {
  const value = useSyncExternalStore(listen, () => read(TREE))
  return [useMemo(() => treeOf(value), [value]), (next) => write([[TREE, JSON.stringify([...next])]])]
}

/**
 * The button's state: whether any fold is open (then it folds them all), and the way to set them all. `folders` is
 * every folder's id: unfolding everything unfolds each of them in the tree.
 */
export function useEveryFold(folders: string[]): { anyOpen: boolean; set: (open: boolean) => void } {
  const live = new Set(folders)
  const anyOpen = useSyncExternalStore(listen, () => (Object.keys(FOLDS) as FoldKey[]).some(isOpen) || [...treeOf(read(TREE))].some((id) => live.has(id)))
  return { anyOpen, set: (open) => write([...(Object.keys(FOLDS) as FoldKey[]).map((key): [string, string] => [key, open ? 'open' : 'shut']), [TREE, JSON.stringify(open ? folders : [])]]) }
}
