import type { Editor } from "@tiptap/core"

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

  // A failed fetch still has to clear the card, or it sits on "Loading..."
  // for the life of the document.
  const metadata = await window.api.fetchLinkMetadata(href).catch(() => null)
  if (editor.isDestroyed) return

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
}
