import { haligtree } from './haligtree'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'

/**
 * Tags in the sidebar are the ones you chose, as Todoist's favourite labels are: every tag is on the Tags page,
 * ⌘K and the Map; the sidebar holds only these. `null` until first chosen: the eight it showed before are kept, so
 * nothing you had there goes.
 */
export const sideTagsOf = (saved: string[] | null | undefined, all: string[]): string[] =>
  saved ? saved.filter((one) => all.includes(one)) : all.slice(0, 8)

/** In or out of the sidebar, saved and said with Undo. */
export async function toggleSideTag(tag: string, all: string[]): Promise<void> {
  const settings = await haligtree.settings()
  const was = sideTagsOf(settings.sideTags, all)
  const on = was.includes(tag)
  const next = on ? was.filter((one) => one !== tag) : [...was, tag]
  chime(on ? 'off' : 'on')
  await haligtree.setSettings({ sideTags: next })
  toast(on ? `#${tag} is no longer in the sidebar` : `#${tag} is in the sidebar`, () => void haligtree.setSettings({ sideTags: settings.sideTags ?? null }).then(() => chime('undo')))
}

/** The menu line, as it reads for this tag now. */
export const sideTagLine = (tag: string, saved: string[] | null | undefined, all: string[]): { label: string; run: () => void } =>
  ({ label: sideTagsOf(saved, all).includes(tag) ? 'Remove from the sidebar' : 'Add to the sidebar', run: () => void toggleSideTag(tag, all) })
