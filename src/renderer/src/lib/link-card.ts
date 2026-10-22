import { host } from "@/lib/host"
import type { Editor } from "@tiptap/core"
import { fadeFilled, noteOffline, offline, whenOnline } from "@/lib/offline"

/**
 * A card for any link, filled in from whatever the page publishes.
 *
 * The card goes in straight away and fills itself in, so the fetch does not
 * leave the menu sitting there with nothing happening.
 */
export const linkCard = async (editor: Editor, href: string): Promise<void> => {
  const id = crypto.randomUUID()
  const placeholder = {
    href,
    title: href,
    description: '',
    image: '',
    icon: '',
    site: '',
    id,
    loading: true
  }
  editor.chain().focus().setBookmark(placeholder).run()

  // A failed fetch still has to clear the card, or it sits on its orb
  // for the life of the document. A host with no fetcher - a browser, which
  // cannot read another origin's page - is the same case: the card settles as
  // the bare link it was made from.
  await fillCard(editor, id, href, placeholder, false)
}

/** The card filled in from the page; offline, it says so once and fills in when the connection is back. */
async function fillCard(editor: Editor, id: string, href: string, placeholder: Record<string, unknown>, late: boolean): Promise<void> {
  const look = host().fetchLinkMetadata
  // The card's own orb says it is on its way; a preview that never comes is
  // no failure worth a red light, the card just stays the plain link.
  const metadata = look ? await look(href).catch(() => null) : null
  if (editor.isDestroyed) return
  const away = !metadata?.href && offline()
  if (away) {
    noteOffline()
    whenOnline(() => void fillCard(editor, id, href, placeholder, true))
  }
  if (late && !metadata?.href) return

  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.type.name === 'bookmark' && node.attrs.id === id) at = pos
    return at < 0
  })
  if (at < 0) return

  // Filling the card in is not its own undo step - one undo should remove
  // the whole thing.
  editor.view.dispatch(
    editor.state.tr
      .setNodeMarkup(at, undefined, {
        ...placeholder,
        ...(metadata?.href ? metadata : {}),
        loading: false
      })
      .setMeta('addToHistory', false)
  )
  if (late) fadeFilled(editor, at)
}

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] }
const words = (node: Node): string => node.text ?? (node.content ?? []).map(words).join(' ')
const remote = (src: unknown): boolean => typeof src === 'string' && /^https?:/.test(src)

/**
 * A link capture shows as its card, and every card keeps its own picture.
 *
 * A capture saved as a link that is still only its address becomes a card,
 * named after the page. A card anywhere whose picture or icon still lives on
 * the site is looked up again, which stores both with your notes, so the card
 * survives going offline and the site changing. Offline now, nothing changes
 * and the next run tries again.
 */
export async function cardUp(capture: { id: string; kind: string; body: unknown }): Promise<void> {
  const look = host().fetchLinkMetadata
  const { id } = capture
  if (!look || !capture.body) return
  // The words as they were before the page was asked: the card lands only if
  // they still are, so a note typed while the page loads is never wiped.
  const base = structuredClone(capture.body)
  const body = capture.body as Node | string
  const text = (typeof body === 'string' ? body : words(body)).trim()
  if (capture.kind === 'link' && /^https?:\/\/\S+$/.test(text)) {
    const card = await look(text).catch(() => null)
    if (!card?.href) return
    await window.api.captures.save(id, {
      title: card.title,
      body: { type: 'doc', content: [{ type: 'bookmark', attrs: { ...card, id: crypto.randomUUID(), loading: false } }] },
      markdown: `[${card.title}](${card.href})`,
      fetched: true,
      base
    })
    // The page's own title kept as its source, so the note's name can become its topic.
    if (card.title && card.title !== card.href) await window.api.haligtree('notes:fields:set', 'captures', id, 'title', card.title)
    return
  }
  if (typeof body === 'string') return
  let changed = false
  const visit = async (node: Node): Promise<void> => {
    if (node.type === 'bookmark' && node.attrs && (remote(node.attrs.image) || remote(node.attrs.icon))) {
      const card = await look(String(node.attrs.href)).catch(() => null)
      // Only a picture that is now stored replaces the address: offline, or
      // with nothing to store, the card is left as it was.
      const kept = (was: unknown, now?: string): unknown => (remote(was) && now && !remote(now) ? now : was)
      const image = kept(node.attrs.image, card?.image)
      const icon = kept(node.attrs.icon, card?.icon)
      if (image !== node.attrs.image || icon !== node.attrs.icon) {
        node.attrs = { ...node.attrs, image, icon }
        changed = true
      }
    }
    for (const child of node.content ?? []) await visit(child)
  }
  await visit(body)
  if (changed) await window.api.captures.save(id, { body, fetched: true, base })
}

/** Every link and card once, one at a time, in the background. */
export async function cardsUp(): Promise<void> {
  for (const capture of await window.api.captures.cards()) await cardUp(capture)
}
