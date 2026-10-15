import { Columns2, Columns3, TableOfContents as ContentsIcon, Minus as DividerIcon, Sigma as SigmaIcon, Table as TableIcon, Paperclip, SquarePlay as VideoIcon } from 'lucide-react'

import type { Editor } from '@tiptap/core'
import { isInTable } from '@tiptap/pm/tables'
import { isValidYoutubeUrl } from '@tiptap/extension-youtube'

import { saveAttachment } from '@/extensions/image-drop'
import { EXPORTS, exportDocument } from '@/lib/export'
import { host, said } from '@/lib/host'
import { fitToWidth } from '@/lib/table'

import type { SlashItem } from '@/extensions/slash-command'
import { retypeList } from '@/lib/retype-list'
import { linkCard } from '@/lib/link-card'
import { emptyColumns } from '@/extensions/columns'

// --- Icons ---
import { HeadingOneIcon } from '@/components/tiptap-icons/heading-one-icon'
import { HeadingTwoIcon } from '@/components/tiptap-icons/heading-two-icon'
import { HeadingThreeIcon } from '@/components/tiptap-icons/heading-three-icon'
import { BookmarkIcon, CalloutIcon, Download, DrawingIcon, ListIcon, TextIcon, ToggleIcon } from '@/components/ui/icons'
import { ListOrderedIcon } from '@/components/tiptap-icons/list-ordered-icon'
import { ListTodoIcon } from '@/components/tiptap-icons/list-todo-icon'
import { BlockquoteIcon } from '@/components/tiptap-icons/blockquote-icon'
import { CodeBlockIcon } from '@/components/tiptap-icons/code-block-icon'
import { ImagePlusIcon } from '@/components/tiptap-icons/image-plus-icon'

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
    // The browser's own picker rather than a dialog through the main process:
    // it hands back a `File`, which is exactly what the store already takes.
    run: (editor) => {
      const input = document.createElement('input')
      input.type = 'file'
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
  {
    title: 'Bookmark',
    group: 'Media',
    hint: 'link card',
    keywords: ['link', 'bookmark', 'card', 'url', 'embed'],
    icon: <BookmarkIcon />,
    prompt: 'Paste a link',
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
    prompt: 'Paste a YouTube link',
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
