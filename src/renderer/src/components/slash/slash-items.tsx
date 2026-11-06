import { Columns2, Columns3, FileStack as EmbedIcon, Link2 as LinkIcon, TableOfContents as ContentsIcon, Minus as DividerIcon, Sigma as SigmaIcon, Table as TableIcon, Paperclip, Speech, SquarePlay as VideoIcon, Users } from 'lucide-react'

import type { Editor } from '@tiptap/core'
import { isInTable } from '@tiptap/pm/tables'
import { isValidYoutubeUrl } from '@tiptap/extension-youtube'

import { saveAttachment } from '@/extensions/image-drop'
import { MicIcon, recordInto } from '@/components/haligtree/voice-note'
import { recordMeeting } from '@/lib/meeting'
import { talkInto } from '@/components/haligtree/talk'
import { FileText } from '@/components/ui/icons'
import { EXPORTS, exportDocument } from '@/lib/export'
import { host, said } from '@/lib/host'
import { fitToWidth } from '@/lib/table'

import type { SlashItem } from '@/extensions/slash-command'
import { retypeList } from '@/lib/retype-list'
import { linkCard } from '@/lib/link-card'
import { emptyColumns } from '@/extensions/columns'
import { embedNote } from '@/extensions/note-link'
import { blockOf, looseFiles } from '@/lib/media-files'

// --- Icons ---
import { HeadingOneIcon } from '@/components/tiptap-icons/heading-one-icon'
import { HeadingTwoIcon } from '@/components/tiptap-icons/heading-two-icon'
import { HeadingThreeIcon } from '@/components/tiptap-icons/heading-three-icon'
import { Bookmark as BookmarkIcon, CalloutIcon, Download, Pencil as DrawingIcon, List as ListIcon, Type as TextIcon, ChevronRight as ToggleIcon } from '@/components/ui/icons'
import { ListOrderedIcon } from '@/components/tiptap-icons/list-ordered-icon'
import { ListTodoIcon } from '@/components/tiptap-icons/list-todo-icon'
import { BlockquoteIcon } from '@/components/tiptap-icons/blockquote-icon'
import { CodeBlockIcon } from '@/components/tiptap-icons/code-block-icon'
import { ImagePlusIcon } from '@/components/tiptap-icons/image-plus-icon'

/** A rounded strip, the ribbon divider's own shape. */
const RibbonIcon = (): React.JSX.Element => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="9.5" width="20" height="5" rx="2.5" />
  </svg>
)

/**
 * A file picked and attached where the cursor is: a PDF shows its pages, any
 * other file its card. The browser's own picker rather than a dialog through
 * the main process: it hands back a `File`, which is what the store takes.
 */
function attachFile(editor: Editor, accept?: string): void {
  const input = document.createElement('input')
  input.type = 'file'
  if (accept) input.accept = accept
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      editor
        .chain()
        .focus()
        .setAttachment(await saveAttachment(file))
        .run()
    } catch (cause) {
      console.error(cause)
      const why = cause instanceof Error && cause.message ? cause.message : 'it could not be saved'
      said(`Not attached: ${why[0].toLowerCase()}${why.slice(1)}`, false)
    }
  }
  input.click()
}

/** Group the book's own files sit under in `/`. */
const FROM_MEDIA = 'From Media, in no note yet'
/**
 * What `/` offers of the book: files added to Media that no note uses yet,
 * found by name or the words in them, each going in as the block its kind has.
 * A few with nothing typed; "/media" asks for them by name.
 */
export const slashMedia = async (editor: Editor, query: string): Promise<SlashItem[]> => {
  if (!editor.schema.nodes.image || !editor.schema.nodes.attachment) return []
  const asked = /^(media|from media)\b/i.test(query.trim())
  const files = await looseFiles(asked ? '' : query, query.trim() ? 8 : 4)
  return files.map((one) => ({ key: one.src, title: one.name.replace(/\.[^.]+$/, '') || one.name, group: FROM_MEDIA, icon: one.icon, run: (at) => void at.chain().focus().insertContent(blockOf(one)).run() }))
}

/**
 * What `/` offers. The hints are the markdown shortcuts that already work, so
 * the menu doubles as a way to learn them.
 */
export const slashItems: SlashItem[] = [
  {
    title: 'Text',
    group: 'Basic blocks',
    keywords: ['paragraph', 'plain'],
    turnInto: true,
    icon: <TextIcon />,
    run: (editor) => {
      // `isActive("details")` is true anywhere inside the section; only the
      // summary is the section's own title. A levelled one goes back through
      // the fold command, which restores the heading rather than flattening it.
      const { $from } = editor.state.selection
      if ($from.parent.type.name !== 'detailsSummary') {
        editor.chain().focus().setParagraph().run()
        return
      }
      if ($from.parent.attrs.level) editor.commands.toggleHeadingSection()
      else editor.chain().focus().unsetDetails().run()
    }
  },
  {
    title: 'Heading 1',
    group: 'Basic blocks',
    keywords: ['h1', 'heading one', 'title'],
    turnInto: true,
    hint: '#',
    icon: <HeadingOneIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run()
  },
  {
    title: 'Heading 2',
    group: 'Basic blocks',
    keywords: ['h2', 'heading two', 'title'],
    turnInto: true,
    hint: '##',
    icon: <HeadingTwoIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run()
  },
  {
    title: 'Heading 3',
    group: 'Basic blocks',
    keywords: ['h3', 'heading three', 'title'],
    turnInto: true,
    hint: '###',
    icon: <HeadingThreeIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run()
  },
  {
    title: 'Bulleted list',
    group: 'Basic blocks',
    keywords: ['bullets', 'unordered', 'ul', 'list'],
    turnInto: true,
    hint: '-',
    icon: <ListIcon />,
    run: (editor) =>
      retypeList(editor, 'bulletList') || editor.chain().focus().toggleBulletList().run()
  },
  {
    title: 'Numbered list',
    group: 'Basic blocks',
    keywords: ['ordered', 'ol', 'list', '1.'],
    turnInto: true,
    hint: '1.',
    icon: <ListOrderedIcon />,
    run: (editor) =>
      retypeList(editor, 'orderedList') || editor.chain().focus().toggleOrderedList().run()
  },
  {
    title: 'Checklist',
    group: 'Basic blocks',
    keywords: ['todo', 'to-do', 'task', 'check', 'checkbox', 'checklist'],
    turnInto: true,
    hint: '[]',
    icon: <ListTodoIcon />,
    run: (editor) =>
      retypeList(editor, 'taskList') || editor.chain().focus().toggleTaskList().run()
  },
  {
    title: 'Quote',
    group: 'Basic blocks',
    keywords: ['blockquote', 'citation'],
    turnInto: true,
    hint: '>',
    icon: <BlockquoteIcon />,
    run: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    title: 'Code',
    group: 'Basic blocks',
    keywords: ['code block', 'snippet', 'pre'],
    turnInto: true,
    hint: '```',
    icon: <CodeBlockIcon />,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  // A formula from the selection, or a new one past the caret's word: the same as ⌥⌘0 and ⌥⌘9.
  {
    title: 'Math',
    group: 'Basic blocks',
    keywords: ['equation', 'formula', 'latex', 'tex', 'math block'],
    icon: <SigmaIcon />,
    run: (editor) => editor.chain().focus().insertMathBlock().run()
  },
  {
    title: 'Inline math',
    group: 'Basic blocks',
    keywords: ['math', 'equation', 'formula', 'latex', 'tex'],
    icon: <SigmaIcon />,
    run: (editor) => editor.chain().focus().toggleInlineMath().run()
  },
  {
    title: 'Divider',
    group: 'Basic blocks',
    keywords: ['hr', 'rule', 'line', 'separator'],
    hint: '---',
    icon: <DividerIcon />,
    run: (editor) => editor.chain().focus().setHorizontalRule().run()
  },
  {
    title: 'Ribbon divider',
    group: 'Basic blocks',
    keywords: ['hr', 'rule', 'divider', 'separator', 'ribbon', 'strip', 'gradient', 'band'],
    hint: '===',
    icon: <RibbonIcon />,
    run: (editor) => editor.chain().focus().setRibbonRule().run()
  },
  {
    title: 'Toggle',
    group: 'Basic blocks',
    keywords: ['collapse', 'fold', 'details', 'expand'],
    turnInto: true,
    icon: <ToggleIcon />,
    // Not `setDetails`: that leaves the title EMPTY and drops the block you
    // converted into the body. The block you point at should become the head.
    run: (editor) => editor.commands.toggleHeadingSection()
  },
  {
    title: 'Callout',
    group: 'Basic blocks',
    keywords: ['note', 'info', 'tip', 'warning', 'aside'],
    turnInto: true,
    hint: 'aside',
    icon: <CalloutIcon />,
    run: (editor) => editor.chain().focus().toggleCallout().run()
  },
  // Side by side, each column any blocks. Not inside another row: Markdown
  // could not tell where the inner one ends.
  ...([2, 3] as const).map((count) => ({
    title: `${count === 2 ? 'Two' : 'Three'} columns`,
    group: 'Basic blocks',
    hint: 'side by side',
    keywords: ['columns', 'layout', 'side by side'],
    icon: count === 2 ? <Columns2 /> : <Columns3 />,
    // Not in another row, nor in a table's cell.
    when: (editor: Editor) => !editor.isActive('column') && !isInTable(editor.state),
    run: (editor: Editor) => {
      const { $from } = editor.state.selection
      // On an empty line the row takes its place; otherwise it goes under it.
      const range = $from.parent.content.size ? $from.after() : { from: $from.before(), to: $from.after() }
      const at = typeof range === 'number' ? range : range.from
      editor.chain().focus().insertContentAt(range, emptyColumns(count)).setTextSelection(at + 3).run()
    }
  })),
  {
    title: 'Table of contents',
    group: 'Basic blocks',
    hint: '[TOC]',
    keywords: ['toc', 'contents', 'outline', 'headings'],
    icon: <ContentsIcon />,
    // The headings of the whole note have no place inside one cell.
    when: (editor) => !isInTable(editor.state),
    run: (editor) => editor.chain().focus().insertContents().run()
  },
  {
    title: 'Table',
    group: 'Media',
    keywords: ['grid', 'rows', 'columns'],
    icon: <TableIcon />,
    // A table inside a table's cell is one nobody can work with.
    when: (editor) => !isInTable(editor.state),
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    title: 'Image',
    group: 'Media',
    keywords: ['img', 'picture', 'photo'],
    icon: <ImagePlusIcon />,
    // An empty block, not a prompt for a URL: the picture is usually a file on
    // the disk, and a menu that only takes a link cannot take one.
    run: (editor) => editor.commands.insertImagePlaceholder()
  },
  {
    title: 'File',
    group: 'Media',
    keywords: ['attachment', 'upload'],
    hint: 'attach',
    icon: <Paperclip />,
    run: (editor) => attachFile(editor)
  },
  {
    title: 'Voice note',
    group: 'Media',
    keywords: ['record', 'voice', 'audio', 'microphone', 'mic', 'sound', 'voice note', 'voice memo', 'transcribe', 'transcript'],
    hint: 'just you',
    icon: <MicIcon />,
    run: (editor) => void recordInto(editor)
  },
  {
    title: 'Call or lecture',
    group: 'Media',
    keywords: ['meeting', 'record a meeting', 'class', 'youtube', 'webinar', 'podcast', 'call', 'teams', 'zoom', 'meet', 'standup', 'lecture', 'seminar', 'interview', 'minutes', 'transcript', 'who said what'],
    hint: 'you and this Mac’s sound',
    icon: <Users />,
    run: () => void recordMeeting()
  },
  {
    title: 'Dictate',
    group: 'Media',
    keywords: ['talk', 'type', 'speak', 'speech', 'voice', 'dictation', 'microphone', 'mic', 'transcribe', 'speech to text', 'voice to text', 'voice typing'],
    hint: 'type by talking',
    icon: <Speech />,
    run: (editor) => void talkInto('tap', editor)
  },
  {
    title: 'PDF',
    group: 'Media',
    keywords: ['document', 'book', 'paper', 'reader'],
    hint: 'its pages in the note',
    icon: <FileText />,
    run: (editor) => attachFile(editor, 'application/pdf,.pdf')
  },
  {
    title: 'Drawing',
    group: 'Media',
    hint: 'excalidraw',
    keywords: ['diagram', 'sketch', 'whiteboard'],
    icon: <DrawingIcon />,
    // The canvas lives in the note, not in a file beside it, so it opens ready
    // to draw in rather than asking where to put it first.
    run: (editor) => editor.chain().focus().insertContent({ type: 'excalidraw' }).run()
  },
  // Both open the note list `[[` opens, matching as you type, with Enter taking
  // the first; an embed's list says so over its rows.
  // A link first: what "/note" most often means is pointing at another note.
  {
    title: 'Link to a note',
    group: 'Media',
    hint: '[[name]]',
    keywords: ['link', 'note', 'page', 'mention', 'wikilink', 'backlink'],
    icon: <LinkIcon />,
    run: (editor) => void editor.chain().focus().insertContent('[[').run()
  },
  {
    title: 'Embed a note',
    group: 'Media',
    hint: 'its words, live',
    keywords: ['embed', 'transclude', 'transclusion', 'note', 'page', 'show', 'include', 'quote'],
    icon: <EmbedIcon />,
    // Shown whole and live: edited here, it is edited where it lives.
    when: (editor) => !!editor.schema.nodes.noteEmbed,
    run: (editor) => embedNote(editor)
  },
  {
    title: 'Bookmark',
    group: 'Media',
    hint: 'link card',
    keywords: ['link', 'bookmark', 'card', 'url', 'embed'],
    icon: <BookmarkIcon />,
    prompt: 'Show which link as a card?',
    // A card is only a card if something can say what the link is about.
    when: () => Boolean(host().fetchLinkMetadata),
    run: (editor, href) => linkCard(editor, href)
  },
  {
    title: 'YouTube',
    group: 'Media',
    hint: 'video player',
    keywords: ['video', 'embed', 'youtube'],
    icon: <VideoIcon />,
    prompt: 'Play which YouTube video?',
    run: (editor, href) => {
      // A card for anything that is not a video, rather than nothing at all.
      // The two are separate entries so a video can be either.
      if (!isValidYoutubeUrl(href)) return linkCard(editor, href)
      editor.chain().focus().setYoutubeVideo({ src: href }).run()
      return undefined
    }
  },
  // Everything the table grips offer, reachable from the keyboard. The grips
  // put a whole row or column on the selection, which is the only way to open
  // the table menu - so without these a table could not be changed at all
  // without a pointer. Shown only inside a table, where they mean something.
  ...([
    ['Insert row above', (editor) => editor.chain().focus().addRowBefore().run()],
    ['Insert row below', (editor) => editor.chain().focus().addRowAfter().run()],
    ['Insert column left', (editor) => editor.chain().focus().addColumnBefore().run()],
    ['Insert column right', (editor) => editor.chain().focus().addColumnAfter().run()],
    ['Delete row', (editor) => editor.chain().focus().deleteRow().run()],
    ['Delete column', (editor) => editor.chain().focus().deleteColumn().run()],
    ['Toggle header row', (editor) => editor.chain().focus().toggleHeaderRow().run()],
    ['Toggle header column', (editor) => editor.chain().focus().toggleHeaderColumn().run()],
    ['Merge or split cells', (editor) => editor.chain().focus().mergeOrSplit().run()],
    ['Fit to width', (editor) => fitToWidth(editor)],
    ['Delete table', (editor) => editor.chain().focus().deleteTable().run()]
  ] as Array<[string, (editor: Editor) => void]>).map(([title, run]) => ({
    title,
    group: 'Table',
    icon: <TableIcon />,
    when: (editor: Editor) => isInTable(editor.state),
    run
  })),

  ...EXPORTS.map(({ format, label }) => ({
    title: `Export as ${label}`,
    group: 'Export',
    icon: <Download />,
    // Offered only where the host can write the file.
    when: () => Boolean(format === 'pdf' ? host().exportPdf : host().exportText),
    // The title is the app's, not the editor's, so the filename falls back to
    // the first heading or line of the document itself.
    run: (editor: Editor) => {
      const first = editor.state.doc.firstChild?.textContent?.trim()
      void exportDocument(editor, format, first || 'Untitled')
    }
  }))
]
