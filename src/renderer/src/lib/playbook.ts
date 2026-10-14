import type { JSONContent } from '@tiptap/core'
import { chime } from './sound'
import { vigil } from './vigil'
import { toast } from '@/components/vigil/ui'

/**
 * The playbook: one pinned piece of writing called “How I work”, a
 * commonplace book about yourself. Made on first use from a short outline,
 * then yours to change. Once a season, Close the week brings it back and asks
 * whether it is still true, and keeps a line on what mattered most.
 */

export const PLAYBOOK_TITLE = 'How I work'
/** Where the season's line goes, under its own heading at the end. */
const MATTERED = 'What mattered most'

const text = (words: string): JSONContent[] => (words ? [{ type: 'text', text: words }] : [])
const para = (words = ''): JSONContent => ({ type: 'paragraph', content: text(words) })
const heading = (words: string): JSONContent => ({ type: 'heading', attrs: { level: 2 }, content: text(words) })
const bullets = (lines: string[]): JSONContent => ({ type: 'bulletList', content: lines.map((line) => ({ type: 'listItem', content: [para(line)] })) })

/** The outline it starts from: a few plain questions under each heading, to answer in your own words. */
export const starter = (): JSONContent => ({
  type: 'doc',
  content: [
    para('How you work best, in your own words. Short and plain is fine, and so is changing it. Once a season, “Close the week” brings it back and asks: still true?'),
    heading('Capture'),
    bullets(['Where things go the moment I think of them: ', 'When I sort them: ']),
    heading('Tasks'),
    bullets(['How I pick what to do next: ', 'What I do with a spare few minutes: ']),
    heading('Reviews'),
    bullets(['How I close the day: ', 'How I close the week: ']),
    heading('Reading'),
    bullets(['What I read, and when: ', 'How I keep what matters from it: ']),
    heading('What I have learned works'),
    bullets(['When I am stuck, I: ']),
    heading(MATTERED),
    para('One line a season, kept by “Close the week”.')
  ]
})

/** The playbook's id, if there is one: the one made here, or one you wrote under that name. */
export async function findPlaybook(): Promise<string | null> {
  const [settings, writing] = await Promise.all([vigil.settings(), vigil.items('article')])
  if (settings.playbook && writing.some((one) => one.id === settings.playbook)) return settings.playbook
  return writing.find((one) => one.title.trim().toLowerCase() === PLAYBOOK_TITLE.toLowerCase())?.id ?? null
}

/** The playbook, made from the outline and pinned the first time. */
export async function ensurePlaybook(): Promise<{ id: string; made: boolean; pinned: boolean }> {
  const found = await findPlaybook()
  if (found) {
    if ((await vigil.settings()).playbook !== found) await vigil.setSettings({ playbook: found })
    return { id: found, made: false, pinned: true }
  }
  const id = await vigil.newArticle()
  await vigil.saveItem(id, { title: PLAYBOOK_TITLE, body: starter() })
  const pinned = await vigil.pin('nuggets', id, true)
  await vigil.setSettings({ playbook: id })
  return { id, made: true, pinned }
}

/** Open it in the main window, making it first if need be, and say where it lives. */
export async function openPlaybook(): Promise<void> {
  const { id, made, pinned } = await ensurePlaybook()
  chime(made ? 'promote' : 'open')
  window.api.openInHome('article', id)
  if (made) toast(pinned ? 'Your playbook, “How I work”: pinned, so it is always one click away' : 'Your playbook, “How I work”, is in Writing. Three pins are taken, so it is not pinned', undefined, 'info')
}

/** A line under “What mattered most”, “July to September 2026: …”; the heading is added back if it was taken out. */
export async function keepSeasonLine(season: string, line: string): Promise<void> {
  const words = line.trim()
  if (!words) return
  const { id } = await ensurePlaybook()
  const item = await vigil.item(id)
  const body = (item?.body && typeof item.body === 'object' ? item.body : starter()) as JSONContent
  const blocks = [...(body.content ?? [])]
  const said = `${season}: ${words}`
  let at = blocks.findIndex((block) => block.type === 'heading' && (block.content ?? []).map((one) => one.text ?? '').join('').trim() === MATTERED)
  if (at < 0) {
    blocks.push(heading(MATTERED))
    at = blocks.length - 1
  }
  // The section runs to the next heading; the lines go in a list there, newest last.
  let end = at + 1
  while (end < blocks.length && blocks[end].type !== 'heading') end++
  const list = blocks.slice(at + 1, end).findIndex((block) => block.type === 'bulletList')
  if (list >= 0) {
    const old = blocks[at + 1 + list]
    blocks[at + 1 + list] = { ...old, content: [...(old.content ?? []), { type: 'listItem', content: [para(said)] }] }
  } else blocks.splice(end, 0, bullets([said]))
  await vigil.saveItem(id, { body: { ...body, content: blocks } })
}
