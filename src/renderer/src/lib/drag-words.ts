import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core'

/** What a dragged or targeted thing is called aloud: its own name on the page, never its id. */
function nameOf(id: string | number): string {
  const key = CSS.escape(String(id))
  const el = document.querySelector<HTMLElement>(`[data-drag-title][data-id="${key}"], [data-id="${key}"], [data-sortable-id="${key}"], [data-group-id="${key}"]`)
  const said = el?.dataset.dragTitle ?? el?.getAttribute('aria-label') ?? el?.textContent
  return said?.replace(/\s+/g, ' ').trim().slice(0, 60) || 'it'
}

/**
 * What VoiceOver hears through a drag, for every list that drags (dnd-kit's own words read raw ids aloud:
 * "Draggable item 28b9247d… was dropped over droppable area c1474027…").
 */
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
  onDragOver: ({ active, over }) => (over && over.id !== active.id ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined),
  onDragEnd: ({ active, over }) => (over && over.id !== active.id ? `${nameOf(active.id)} dropped on ${nameOf(over.id)}.` : `${nameOf(active.id)} dropped.`),
  onDragCancel: ({ active }) => `${nameOf(active.id)} put back where it was.`
}
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable: 'To pick it up, press Space. Move it with the arrow keys, Space again to drop, Escape to put it back.'
}

/** dnd-kit's `accessibility` prop: plain words, read from the page body. */
export const dragWords = { announcements, screenReaderInstructions, container: typeof document === 'undefined' ? undefined : document.body }
