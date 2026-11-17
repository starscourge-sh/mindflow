import { ChartSpline, Columns2, Columns3, GalleryHorizontal, Workflow as DiagramIcon, FileStack as EmbedIcon, Link2 as LinkIcon, TableOfContents as ContentsIcon, Minus as DividerIcon, Sigma as SigmaIcon, Superscript as FootnoteIcon, Table as TableIcon, Paperclip, Speech, SquarePlay as VideoIcon, Users, BookMarked as CiteIcon } from 'lucide-react'

import type { Editor } from '@tiptap/core'
import { isInTable } from '@tiptap/pm/tables'
import { Selection } from '@tiptap/pm/state'
import { isValidYoutubeUrl } from '@tiptap/extension-youtube'

import { saveAttachment } from '@/extensions/image-drop'
import { MicIcon, recordInto } from '@/components/haligtree/voice-note'
import { recordMeeting } from '@/lib/meeting'
import { talkInto } from '@/components/haligtree/talk'
import { FileText } from '@/components/ui/icons'
import { EXPORTS, exportDocument } from '@/lib/export'
import { host, said } from '@/lib/host'
import { ask } from '@/components/haligtree/ui'
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
import { newLine } from '@/lib/graph-math'
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

/**
 * A list line turned into text, a quote, a callout or a toggle leaves the list.
 * Done in the list, the bullet stayed, or the new block sat inside it.
 */
function leaveList(editor: Editor): void {
  for (let guard = 0; guard < 8; guard++) {
    const item = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null
    if (!item) return
    if (!editor.chain().focus().liftListItem(item).run()) return
  }
}

/** Turn the line into this list. Already that list, it stays: the toggle would have taken the marker off. */
function asList(editor: Editor, list: 'bulletList' | 'orderedList' | 'taskList', toggle: 'toggleBulletList' | 'toggleOrderedList' | 'toggleTaskList'): void {
  if (retypeList(editor, list)) return
  if (editor.isActive(list)) return
  editor.chain().focus()[toggle]().run()
}

/** Group the book's own files sit under in `/`: the page is Files now, as @ and ⌘K say. */
const FROM_MEDIA = 'From Files, in no note yet'
/**
 * What `/` offers of the book: files added to Media that no note uses yet,
 * found by name or the words in them, each going in as the block its kind has.
 * A few with nothing typed; "/media" asks for them by name.
 */
export const slashMedia = async (editor: Editor, query: string): Promise<SlashItem[]> => {
  if (!editor.schema.nodes.image || !editor.schema.nodes.attachment) return []
  const asked = /^(media|from media)\b/i.test(query.trim())
  const files = await looseFiles(asked ? '' : query, query.trim() ? 8 : 4)
  // Its card says its whole name: a long one is cut short in the row, and the card is where it is read.
  return files.map((one) => ({ key: one.src, title: one.label, hint: one.word, group: FROM_MEDIA, icon: one.icon, peek: `**${one.name || one.label}** ${/^[AEIOU]/.test(one.word) ? 'An' : 'A'} ${one.word === 'PDF' || one.word === 'GIF' ? one.word : one.word.toLowerCase()} in Files, in no note yet. Pick it to put it in this note.`, run: (at) => void at.chain().focus().insertContent(blockOf(one)).run() }))
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
        leaveList(editor)
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
    run: (editor) => asList(editor, 'bulletList', 'toggleBulletList')
  },
  {
    title: 'Numbered list',
    group: 'Basic blocks',
    keywords: ['ordered', 'ol', 'list', '1.'],
    turnInto: true,
    hint: '1.',
    icon: <ListOrderedIcon />,
    run: (editor) => asList(editor, 'orderedList', 'toggleOrderedList')
  },
  {
    title: 'Checklist',
    group: 'Basic blocks',
    keywords: ['todo', 'to-do', 'task', 'check', 'checkbox', 'checklist'],
    turnInto: true,
    hint: '[]',
    icon: <ListTodoIcon />,
    run: (editor) => asList(editor, 'taskList', 'toggleTaskList')
  },
  {
    title: 'Quote',
    group: 'Basic blocks',
    keywords: ['blockquote', 'citation'],
    turnInto: true,
    hint: '>',
    icon: <BlockquoteIcon />,
    // Only where a quote can be made: on a list's line it did nothing at all.
    when: (editor) => editor.isActive('listItem') || editor.isActive('taskItem') || editor.can().toggleBlockquote(),
    run: (editor) => {
      if (editor.isActive('blockquote')) return
      leaveList(editor)
      editor.chain().focus().toggleBlockquote().run()
    }
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
    // An empty formula has nothing to show and nowhere to type, so its LaTeX is asked for first, in the same field
    // as its "Edit formula…", and the block goes in only once there is a formula. Backing out of the question
    // leaves the note exactly as it was: the block used to go in first and be taken out again when left blank,
    // which changed the line it had stood on.
    run: (editor) => {
      // Words picked become the formula, as ⌥⌘0 makes one.
      const { empty, from } = editor.state.selection
      if (!empty) return void editor.chain().focus().insertMathBlock().run()
      void ask('The formula, in LaTeX', 'For example: E = mc^2', { action: 'Add the formula' }).then((typed) => {
        const latex = typed?.trim()
        if (!latex) return void editor.commands.focus()
        // The block and its formula in one step, so one ⌘Z takes both back; the caret after it.
        editor.chain().focus().insertMathBlock().command(({ tr }) => {
          let at = -1
          tr.doc.nodesBetween(Math.max(0, from - 3), Math.min(tr.doc.content.size, from + 4), (node, pos) => void (at < 0 && node.type.name === 'blockMath' && (at = pos)))
          const made = at < 0 ? null : tr.doc.nodeAt(at)
          if (!made) return true
          tr.setNodeMarkup(at, undefined, { ...made.attrs, latex })
          tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, at + made.nodeSize))))
          return true
        }).run()
      })
    }
  },
  {
    title: 'Inline math',
    group: 'Basic blocks',
    keywords: ['math', 'equation', 'formula', 'latex', 'tex'],
    icon: <SigmaIcon />,
    run: (editor) => editor.chain().focus().toggleInlineMath().run()
  },
  // A raised number here, its note at the foot of the page, the caret in the note; Esc comes back.
  {
    title: 'Footnote',
    group: 'Basic blocks',
    keywords: ['footnote', 'reference', 'citation', 'endnote', 'source'],
    hint: '[^1]',
    icon: <FootnoteIcon />,
    when: (editor) => !!editor.schema.nodes.footnoteReference,
    // The "/" wants a space before it; the mark hugs the word it follows, as in print.
    run: (editor) => {
      const { from, empty } = editor.state.selection
      const before = editor.state.doc.textBetween(Math.max(0, from - 2), from, '\n', '\n')
      const hug = empty && /\S $/.test(before)
      editor.chain().focus().command(({ tr }) => (hug && tr.delete(from - 1, from), true)).insertFootnote().run()
    }
  },
  // A citation chip here, "(Shelley 1831, p. 82)", from a DOI, an ISBN or a work you have; its work listed at the foot.
  {
    title: 'Cite a source',
    group: 'Basic blocks',
    keywords: ['cite', 'citation', 'reference', 'doi', 'isbn', 'bibliography', 'works cited', 'source', 'book', 'article'],
    icon: <CiteIcon />,
    when: (editor) => !!editor.schema.nodes.citation,
    run: (editor) => void editor.chain().focus().citeSource().run()
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
    run: (editor) => {
      if (editor.isActive('listItem') || editor.isActive('taskItem')) leaveList(editor)
      editor.commands.toggleHeadingSection()
    }
  },
  {
    title: 'Callout',
    group: 'Basic blocks',
    keywords: ['note', 'info', 'tip', 'warning', 'aside'],
    turnInto: true,
    hint: 'aside',
    icon: <CalloutIcon />,
    // Only where a callout can be made: on a list's line it did nothing at all.
    when: (editor) => editor.isActive('listItem') || editor.isActive('taskItem') || editor.can().toggleCallout(),
    run: (editor) => {
      if (editor.isActive('callout')) return
      leaveList(editor)
      editor.chain().focus().toggleCallout().run()
    }
  },
  // Side by side, each column any blocks. Not inside another row: Markdown
  // could not tell where the inner one ends.
  // "Cards in a row": three, each column a quiet card of its own (Obsidian's cards in a row).
  ...([2, 3, 'cards'] as const).map((count) => ({
    title: count === 'cards' ? 'Cards in a row' : `${count === 2 ? 'Two' : 'Three'} columns`,
    group: 'Basic blocks',
    hint: count === 'cards' ? 'side by side, each a card' : 'side by side',
    keywords: ['columns', 'layout', 'side by side', ...(count === 'cards' ? ['cards', 'panels', 'board'] : [])],
    icon: count === 2 ? <Columns2 /> : count === 3 ? <Columns3 /> : <GalleryHorizontal />,
    // Not in another row, nor in a table's cell.
    when: (editor: Editor) => !editor.isActive('column') && !isInTable(editor.state),
    run: (editor: Editor) => {
      const { $from } = editor.state.selection
      // On an empty line the row takes its place; otherwise it goes under it.
      const range = $from.parent.content.size ? $from.after() : { from: $from.before(), to: $from.after() }
      const at = typeof range === 'number' ? range : range.from
      editor.chain().focus().insertContentAt(range, count === 'cards' ? emptyColumns(3, true) : emptyColumns(count)).setTextSelection(at + 3).run()
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
  // A Mermaid diagram, kept as a ```mermaid block as Obsidian keeps it, drawn
  // under its words. The caret waits at the end of the words to change them.
  {
    title: 'Diagram',
    group: 'Media',
    hint: 'drawn from text',
    keywords: ['mermaid', 'flowchart', 'chart', 'graph', 'sequence', 'mindmap', 'timeline'],
    icon: <DiagramIcon />,
    when: (editor) => !isInTable(editor.state),
    run: (editor) => {
      const start = editor.state.selection.from
      editor.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'flowchart LR\n  Question --> Reading\n  Reading --> Answer' }] }).run()
      let end: number | null = null
      editor.state.doc.nodesBetween(Math.max(0, start - 2), Math.min(editor.state.doc.content.size, start + 80), (node, pos) => {
        if (end == null && node.type.name === 'codeBlock' && node.attrs.language === 'mermaid') end = pos + 1 + node.content.size
        return end == null
      })
      if (end != null) editor.commands.setTextSelection(end)
    }
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
    // Both come up for "diagram": the hint says which is drawn by hand.
    hint: 'sketch by hand',
    keywords: ['diagram', 'sketch', 'whiteboard', 'excalidraw'],
    icon: <DrawingIcon />,
    // The canvas lives in the note, not in a file beside it, so it opens ready
    // to draw in rather than asking where to put it first.
    run: (editor) => editor.chain().focus().insertContent({ type: 'excalidraw' }).run()
  },
  // Formulas plotted as on Desmos, its first line open for typing.
  {
    title: 'Graph',
    group: 'Media',
    hint: 'plot y = f(x)',
    keywords: ['plot', 'function', 'desmos', 'curve', 'equation', 'graphing', 'calculator', 'axes'],
    icon: <ChartSpline />,
    when: (editor) => !!editor.schema.nodes.graph && !isInTable(editor.state),
    run: (editor) => editor.chain().focus().insertContent({ type: 'graph', attrs: { expressions: [newLine(0)] } }).run()
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
    // "Merge or split cells" only with cells picked to merge, or a merged cell to split: in one plain cell it did nothing.
    when: (editor: Editor) => isInTable(editor.state) && (title !== 'Merge or split cells' || editor.can().mergeOrSplit()),
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
      void exportDocument(editor, format, first || 'New note')
    }
  }))
]
