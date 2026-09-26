import {
  Bookmark as BookmarkIcon,
  ChevronRight as ToggleIcon,
  Minus as DividerIcon,
  Table as TableIcon,
  Download,
  Paperclip,
  PencilRuler as DrawingIcon,
  SquarePlay as VideoIcon,
  Type as TextIcon
} from 'lucide-react'

import type { Editor } from '@tiptap/core'
import { isInTable } from '@tiptap/pm/tables'
import { isValidYoutubeUrl } from '@tiptap/extension-youtube'

import { saveAttachment } from '@/extensions/image-drop'
import { EXPORTS, exportDocument } from '@/lib/export'
import { host } from '@/lib/host'
import { fitToWidth } from '@/lib/table'

import type { SlashItem } from '@/extensions/slash-command'
import { linkCard } from '@/lib/link-card'

// --- Icons ---
import { HeadingOneIcon } from '@/components/tiptap-icons/heading-one-icon'
import { HeadingTwoIcon } from '@/components/tiptap-icons/heading-two-icon'
import { HeadingThreeIcon } from '@/components/tiptap-icons/heading-three-icon'
import { ListIcon } from '@/components/tiptap-icons/list-icon'
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
    turnInto: true,
    hint: '#',
    icon: <HeadingOneIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run()
  },
  {
    title: 'Heading 2',
    group: 'Basic blocks',
    turnInto: true,
    hint: '##',
    icon: <HeadingTwoIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run()
  },
  {
    title: 'Heading 3',
    group: 'Basic blocks',
    turnInto: true,
    hint: '###',
    icon: <HeadingThreeIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run()
  },
  {
    title: 'Bulleted list',
    group: 'Basic blocks',
    turnInto: true,
    hint: '-',
    icon: <ListIcon />,
    run: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    title: 'Numbered list',
    group: 'Basic blocks',
    turnInto: true,
    hint: '1.',
    icon: <ListOrderedIcon />,
    run: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    title: 'To-do list',
    group: 'Basic blocks',
    turnInto: true,
    hint: '[]',
    icon: <ListTodoIcon />,
    run: (editor) => editor.chain().focus().toggleTaskList().run()
  },
  {
    title: 'Quote',
    group: 'Basic blocks',
    turnInto: true,
    hint: '>',
    icon: <BlockquoteIcon />,
    run: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    title: 'Code',
    group: 'Basic blocks',
    turnInto: true,
    hint: '```',
    icon: <CodeBlockIcon />,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    title: 'Divider',
    group: 'Basic blocks',
    hint: '---',
    icon: <DividerIcon />,
    run: (editor) => editor.chain().focus().setHorizontalRule().run()
  },
  {
    title: 'Toggle',
    group: 'Basic blocks',
    turnInto: true,
    icon: <ToggleIcon />,
    // Not `setDetails`: that leaves the title EMPTY and drops the block you
    // converted into the body. The block you point at should become the head.
    run: (editor) => editor.commands.toggleHeadingSection()
  },
  {
    title: 'Table',
    group: 'Media',
    icon: <TableIcon />,
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    title: 'Image',
    group: 'Media',
    icon: <ImagePlusIcon />,
    // An empty block, not a prompt for a URL: the picture is usually a file on
    // the disk, and a menu that only takes a link cannot take one.
    run: (editor) => editor.commands.insertImagePlaceholder()
  },
  {
    title: 'File',
    group: 'Media',
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
        }
      }
      input.click()
    }
  },
  {
    title: 'Drawing',
    group: 'Media',
    hint: 'excalidraw',
    icon: <DrawingIcon />,
    // The canvas lives in the note, not in a file beside it, so it opens ready
    // to draw in rather than asking where to put it first.
    run: (editor) => editor.chain().focus().insertContent({ type: 'excalidraw' }).run()
  },
  {
    title: 'Bookmark',
    group: 'Media',
    hint: 'link card',
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
