import { Sparkles } from 'lucide-react'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { ask, toast } from '@/components/haligtree/ui'

/**
 * Groups beside folders, as Apple Notes keeps Smart Folders beside folders: a
 * folder is the one place a note lives (you drag it in); a group gathers by a
 * rule (every note tagged #rome and #food, as Obsidian searches by tags) and
 * moves nothing, so a note can be in a folder and in any number of groups. A
 * group wears its own look (a sparkle, its name in italic) and says its rule
 * wherever it is shown. Kept in settings (`smartGroups`), a list each:
 * Writing's or Gems'.
 */
export type SmartGroup = { id: string; list: 'article' | 'nugget'; name: string; tags: string[] }
export const GROUP_KEY = 'rule:'

/** "#rome", "#rome and #food", "#rome, #food and #italy". */
export const tagsSaid = (tags: string[]): string => {
  const marked = tags.map((one) => `#${one}`)
  return marked.length < 2 ? marked.join('') : `${marked.slice(0, -1).join(', ')} and ${marked.at(-1)}`
}

/** The words for a group's rule, the same in the sidebar's tip, its page and its menu. */
export const ruleSaid = (group: SmartGroup, list: 'article' | 'nugget' = group.list): string =>
  `Every ${list === 'article' ? 'page' : 'gem'} tagged ${tagsSaid(group.tags)}`

export const GroupMark = Sparkles

/** The tags typed for a rule: "#rome #food", "rome, food" or "rome and food", each once, without its "#". */
const tagsIn = (typed: string | null): string[] =>
  [...new Set((typed ?? '').split(/[\s,]+|\band\b/i).map((one) => one.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))]

export function useSmartGroups(list: 'article' | 'nugget'): SmartGroup[] {
  const settings = useLive(haligtree.settings, null as Settings | null)
  return (settings?.smartGroups ?? []).filter((one) => one.list === list)
}

/** The ids a group gathers now: its list's notes carrying every one of its tags. */
export function useGathered(group: SmartGroup | undefined): Set<string> | null {
  const key = group?.tags.join(' ') ?? ''
  const found = useLive(() => (group ? Promise.all(group.tags.map((tag) => haligtree.tag(tag))) : Promise.resolve(null)), null as Awaited<ReturnType<typeof haligtree.tag>>[] | null, [key], ['item', 'capture'])
  if (!group || !found) return null
  const [first = [], ...rest] = found.map((list) => list.filter((one) => one.type === group.list).map((one) => one.id))
  return new Set(first.filter((id) => rest.every((list) => list.includes(id))))
}

const save = async (next: (all: SmartGroup[]) => SmartGroup[]): Promise<SmartGroup[]> => {
  const was = (await haligtree.settings()).smartGroups ?? []
  await haligtree.setSettings({ smartGroups: next(was) })
  return was
}

const ASKED = 'one tag, or several, as #rome #food: a note needs them all'

/** A new group, its rule asked as one tag or several (named for the first), with Undo. */
export async function newSmartGroup(list: 'article' | 'nugget', onOpen?: (id: string) => void): Promise<void> {
  const tags = tagsIn(await ask(`Gather every ${list === 'article' ? 'page' : 'gem'} tagged…`, ASKED))
  if (!tags.length) return
  const name = tags.map((one) => one[0].toUpperCase() + one.slice(1)).join(' and ')
  const group: SmartGroup = { id: crypto.randomUUID(), list, name, tags }
  const was = await save((all) => [...all, group])
  chime('promote')
  toast(`New group: ${ruleSaid(group).toLowerCase()}`, () => void haligtree.setSettings({ smartGroups: was }))
  onOpen?.(group.id)
}

export async function changeRule(group: SmartGroup): Promise<void> {
  const tags = tagsIn(await ask('Gather the ones tagged…', ASKED, undefined, group.tags.map((one) => `#${one}`).join(' ')))
  if (!tags.length || tags.join(' ') === group.tags.join(' ')) return
  const was = await save((all) => all.map((one) => (one.id === group.id ? { ...one, tags } : one)))
  chime('noted')
  toast(`${group.name} now gathers ${ruleSaid({ ...group, tags }).toLowerCase()}`, () => void haligtree.setSettings({ smartGroups: was }))
}

export async function renameGroup(group: SmartGroup): Promise<void> {
  const name = (await ask('Name the group', group.name, undefined, group.name))?.trim()
  if (!name || name === group.name) return
  const was = await save((all) => all.map((one) => (one.id === group.id ? { ...one, name } : one)))
  chime('noted')
  toast(`Renamed to ${name}`, () => void haligtree.setSettings({ smartGroups: was }))
}

/** Gone, and only the group: its notes stay where they live. */
export async function removeGroup(group: SmartGroup, onGone?: () => void): Promise<void> {
  const was = await save((all) => all.filter((one) => one.id !== group.id))
  chime('off')
  onGone?.()
  toast(`Removed the group ${group.name}: its notes stay where they are`, () => void haligtree.setSettings({ smartGroups: was }))
}
