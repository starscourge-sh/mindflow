import { Sparkles } from 'lucide-react'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { ask, toast } from '@/components/haligtree/ui'

/**
 * Groups beside folders, as Apple Notes keeps Smart Folders beside folders: a
 * folder is the one place a note lives (you drag it in); a group gathers by a
 * rule (every note tagged #history) and moves nothing, so a note can be in a
 * folder and in any number of groups. A group wears its own look (a sparkle,
 * its name in italic) and says its rule wherever it is shown. Kept in
 * settings (`smartGroups`), a list each: Writing's or Gems'.
 */
export type SmartGroup = { id: string; list: 'article' | 'nugget'; name: string; tag: string }
export const GROUP_KEY = 'rule:'

/** The words for a group's rule, the same in the sidebar's tip, its page and its menu. */
export const ruleSaid = (group: SmartGroup, list: 'article' | 'nugget' = group.list): string =>
  `Every ${list === 'article' ? 'page' : 'gem'} tagged #${group.tag}`

export const GroupMark = Sparkles

export function useSmartGroups(list: 'article' | 'nugget'): SmartGroup[] {
  const settings = useLive(haligtree.settings, null as Settings | null)
  return (settings?.smartGroups ?? []).filter((one) => one.list === list)
}

/** The ids a group gathers now: its list's notes with its tag. */
export function useGathered(group: SmartGroup | undefined): Set<string> | null {
  const found = useLive(() => (group ? haligtree.tag(group.tag) : Promise.resolve(null)), null as Awaited<ReturnType<typeof haligtree.tag>> | null, [group?.tag], ['item', 'capture'])
  if (!group || !found) return null
  return new Set(found.filter((one) => one.type === group.list).map((one) => one.id))
}

const save = async (next: (all: SmartGroup[]) => SmartGroup[]): Promise<SmartGroup[]> => {
  const was = (await haligtree.settings()).smartGroups ?? []
  await haligtree.setSettings({ smartGroups: next(was) })
  return was
}

/** A new group, its rule asked as a tag (named for it), with Undo. */
export async function newSmartGroup(list: 'article' | 'nugget', onOpen?: (id: string) => void): Promise<void> {
  const tag = (await ask(`Gather every ${list === 'article' ? 'page' : 'gem'} tagged…`, 'history', 'tag'))?.replace(/^#/, '').trim()
  if (!tag) return
  const group: SmartGroup = { id: crypto.randomUUID(), list, name: tag[0].toUpperCase() + tag.slice(1), tag }
  const was = await save((all) => [...all, group])
  chime('promote')
  toast(`New group: ${ruleSaid(group).toLowerCase().replace(/^every/, 'every')}`, () => void haligtree.setSettings({ smartGroups: was }))
  onOpen?.(group.id)
}

export async function changeRule(group: SmartGroup): Promise<void> {
  const tag = (await ask('Gather the ones tagged…', group.tag, 'tag', group.tag))?.replace(/^#/, '').trim()
  if (!tag || tag === group.tag) return
  const was = await save((all) => all.map((one) => (one.id === group.id ? { ...one, tag } : one)))
  chime('noted')
  toast(`${group.name} now gathers ${ruleSaid({ ...group, tag }).toLowerCase()}`, () => void haligtree.setSettings({ smartGroups: was }))
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
