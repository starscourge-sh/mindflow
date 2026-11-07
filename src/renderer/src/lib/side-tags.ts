import { haligtree } from './haligtree'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'

/**
 * Your favourite tags, as Todoist's favourite labels: every tag is on the Tags page, ⌘K and the Map; the sidebar
 * holds only the ones you marked. None until you mark one.
 */
export const sideTagsOf = (saved: string[] | null | undefined, all: string[]): string[] =>
  (saved ?? []).filter((one) => all.includes(one))

/** In or out of your favourites, saved and said with Undo. */
export async function toggleSideTag(tag: string, all: string[]): Promise<void> {
  const settings = await haligtree.settings()
  const was = sideTagsOf(settings.sideTags, all)
  const on = was.includes(tag)
  const next = on ? was.filter((one) => one !== tag) : [...was, tag]
  chime(on ? 'off' : 'on')
  await haligtree.setSettings({ sideTags: next })
  toast(on ? `#${tag} is no longer a favourite` : `#${tag} is a favourite, in the sidebar`, () => void haligtree.setSettings({ sideTags: settings.sideTags ?? null }).then(() => chime('undo')))
}

/** The menu line, as it reads for this tag now. */
export const sideTagLine = (tag: string, saved: string[] | null | undefined, all: string[]): { label: string; run: () => void } =>
  ({ label: sideTagsOf(saved, all).includes(tag) ? 'Remove from favourites' : 'Add to favourites', run: () => void toggleSideTag(tag, all) })
