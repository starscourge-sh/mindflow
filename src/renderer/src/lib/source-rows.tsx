import { BookOpen } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import type { Plugin } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { Avatar } from '@/components/haligtree/avatar'
import { saidByPluginKey, type NoteSuggestion } from '@/extensions/note-link'
import { IN_WINDOW } from '@/components/suggestion/suggestion-renderer'
import { forgives } from '@/lib/slash-rank'
import { typedOnly } from '@/lib/typed-suggestion'
import { sources, type SourceField, type SourceSummary } from '@/lib/sources'

/**
 * The people (field 'attribution') or the works ('medium') already in the book that fit a name being typed, as the
 * rows of the one suggestion list (note-link-menu.tsx NoteList): a name that starts with it first, then one with a
 * word that does, then a slip of the keys ("jonatan"); among each, the one used last, then the one used most.
 * A person wears their portrait, a character the work they are in. The name typed in full already is no offer.
 */
export function sourceRows(all: SourceSummary[], field: SourceField, typed: string, limit = 6): NoteSuggestion[] {
  const words = typed.trim().toLowerCase()
  if (!words) return []
  const fit = (name: string): number => {
    const own = name.toLowerCase()
    return own.startsWith(words) ? 0 : own.split(/[^\p{L}\p{N}]+/u).some((one) => one.startsWith(words)) ? 1 : words.length >= 3 && forgives(words, name) ? 2 : 3
  }
  return all
    .filter((one) => one.field === field && one.name !== typed.trim())
    .map((one) => ({ one, fit: fit(one.name) }))
    .filter(({ fit }) => fit < 3)
    .sort((a, b) => a.fit - b.fit || b.one.last.localeCompare(a.one.last) || b.one.count - a.one.count)
    .slice(0, limit)
    .map(({ one }) => field === 'attribution'
      ? { id: `person:${one.name}`, label: one.name, detail: one.work, group: 'People in your book', icon: <Avatar name={one.name} size={16} /> }
      : { id: `medium:${one.name}`, label: one.name, group: 'Works in your book', icon: <BookOpen /> })
}

/**
 * A quote's "- who, where" being typed at the end of its line (main/import.ts saidBy reads it): the part under the
 * caret, who before the first comma and where from after it, offered from the people and works in the book, in the
 * same list `@` and `#` use. Picking writes the whole name in the words, so the who and where read from them are
 * the book's own; a name that fits none stays as typed, a new person.
 */
export function saidBySuggestion({ editor, allow, render }: { editor: Editor; /** The box reads it as a quote now. */ allow: () => boolean; render: Parameters<typeof Suggestion<NoteSuggestion>>[0]['render'] }): Plugin {
  // Read once as the list opens, then narrowed as you type.
  let all: Promise<SourceSummary[]> | null = null
  let field: SourceField = 'attribution'
  return Suggestion<NoteSuggestion>({
    floatingUi: IN_WINDOW,
    flip: false,
    editor,
    char: '-',
    pluginKey: saidByPluginKey,
    // The name is lit already, as the quote's signature (box-tokens.ts): no second chip inside it.
    decorationClass: 'said-by-typing',
    allowSpaces: true,
    // Open once a letter of the name is typed: a bare "- " is no name yet, and Escape there must not take the dash.
    shouldShow: typedOnly(({ query }) => !!query.trim()),
    allow: () => allow(),
    // Only at the line's end, right after a closing quote mark and a dash, as saidBy reads a signature.
    findSuggestionMatch: ({ $position }) => {
      const block = $position.parent
      if (!block.isTextblock || $position.parentOffset !== block.content.size) return null
      const before = block.textBetween(0, $position.parentOffset, undefined, ' ')
      const tail = /[”"']\s*([-–—]\s*([^-–—”"']{0,90}))$/.exec(before)
      if (!tail) return null
      const parts = tail[2].split(',')
      const query = parts.at(-1)!.replace(/^\s+/, '')
      field = parts.length > 1 ? 'medium' : 'attribution'
      // The range is the whole "- who, where", as the signature is lit, so the two draw as one chip; the query is
      // only the part being typed, and only it becomes the name picked.
      const to = $position.pos
      const said = tail[0].slice(1)
      return { range: { from: to - said.length, to }, query, text: said }
    },
    items: async ({ query }) => {
      all ??= sources.list().catch(() => [])
      const known = await all
      // A name typed out whole is kept as typed, as the Who field keeps it (ui.tsx Remembered): no list for ↵ to swap it
      // for a longer one ("Sam" when "Samantha" is in the book too).
      const said = query.trim().toLowerCase()
      if (known.some((one) => one.field === field && one.name.toLowerCase() === said)) return []
      return sourceRows(known, field, query)
    },
    command: ({ editor, range, props }) => {
      const typed = editor.state.doc.textBetween(range.from, range.to, ' ').replace(/^\s*[-–—]\s*/, '').split(',').at(-1)!.replace(/^\s+/, '').length
      void editor.chain().focus().insertContentAt({ from: range.to - typed, to: range.to }, props.label).run()
    },
    // Closed, the next one reads the book afresh.
    render: () => {
      const shown = render!()
      return { ...shown, onExit: (props) => ((all = null), shown.onExit?.(props)) }
    }
  })
}
