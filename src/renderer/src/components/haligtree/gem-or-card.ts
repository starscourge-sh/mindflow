import { call } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { refuse, toast } from './ui'

/**
 * A gem or a study card, one click either way and nothing lost. A gem is a
 * keepsake: it comes back in the Feed, Home and hints and lives in Gems, and
 * may be tested too. A study card is for Review alone. A card a note's own
 * "question :: answer" line keeps cannot move: the note owns it.
 */
export const canMoveTier = (item: { tier: string; lineOf?: string | null }): boolean => (item.tier === 'nugget' || item.tier === 'card') && !item.lineOf

/** The row-menu line that moves it: "Keep as a gem" for a study card, "Study only" for a tested gem. */
export const tierItem = (item: { id: string; tier: string; lineOf?: string | null }, then?: () => void): { label: string; hint: string; run: () => void } | null =>
  canMoveTier(item)
    ? item.tier === 'card'
      ? { label: 'Keep as a gem', hint: 'In Gems, the Feed and Home too, and still in Review', run: () => moveTier(item.id, 'nugget', then) }
      : { label: 'Study only', hint: 'In Review only: out of Gems, the Feed and Home', run: () => moveTier(item.id, 'card', then) }
    : null

/** Moved, said, and taken back with Undo. */
export function moveTier(id: string, to: 'card' | 'nugget', then?: () => void): void {
  void call<string | null>('item:tier', id, to).then((was) => {
    if (!was) return refuse('This card is kept by a line in its note')
    chime(to === 'nugget' ? 'saved' : 'off')
    then?.()
    toast(to === 'nugget' ? 'Kept as a gem: in Gems, the Feed and Home, and still in Review' : 'Study only: in Review, out of Gems, the Feed and Home', () =>
      void call('item:tier', id, was).then(() => chime('undo')))
  })
}
