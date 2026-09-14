import {
  Bookmark as BookmarkIcon,
  ChevronRight as ToggleIcon,
  Minus as DividerIcon,
  Table as TableIcon,
  Type as TextIcon,
} from "lucide-react"

import { isValidYoutubeUrl } from "@tiptap/extension-youtube"

import type { SlashItem } from "@/extensions/slash-command"

// --- Icons ---
import { HeadingOneIcon } from "@/components/tiptap-icons/heading-one-icon"
import { HeadingTwoIcon } from "@/components/tiptap-icons/heading-two-icon"
import { HeadingThreeIcon } from "@/components/tiptap-icons/heading-three-icon"
import { ListIcon } from "@/components/tiptap-icons/list-icon"
import { ListOrderedIcon } from "@/components/tiptap-icons/list-ordered-icon"
import { ListTodoIcon } from "@/components/tiptap-icons/list-todo-icon"
import { BlockquoteIcon } from "@/components/tiptap-icons/blockquote-icon"
import { CodeBlockIcon } from "@/components/tiptap-icons/code-block-icon"
import { ImagePlusIcon } from "@/components/tiptap-icons/image-plus-icon"

/**
 * What `/` offers. The hints are the markdown shortcuts that already work, so
 * the menu doubles as a way to learn them.
 */
export const slashItems: SlashItem[] = [
  {
    title: "Text",
    group: "Basic blocks",
    turnInto: true,
    icon: <TextIcon />,
    run: (editor) => {
      // `isActive("details")` is true anywhere inside the section; only the
      // summary is the section's own title. A levelled one goes back through
      // the fold command, which restores the heading rather than flattening it.
      const { $from } = editor.state.selection
      if ($from.parent.type.name !== "detailsSummary") {
        editor.chain().focus().setParagraph().run()
        return
      }
      if ($from.parent.attrs.level) editor.commands.toggleHeadingSection()
      else editor.chain().focus().unsetDetails().run()
    },
  },
  {
    title: "Heading 1",
    group: "Basic blocks",
    turnInto: true,
    hint: "#",
    icon: <HeadingOneIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    group: "Basic blocks",
    turnInto: true,
    hint: "##",
    icon: <HeadingTwoIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    group: "Basic blocks",
    turnInto: true,
    hint: "###",
    icon: <HeadingThreeIcon />,
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    title: "Bulleted list",
    group: "Basic blocks",
    turnInto: true,
    hint: "-",
    icon: <ListIcon />,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    group: "Basic blocks",
    turnInto: true,
    hint: "1.",
    icon: <ListOrderedIcon />,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    group: "Basic blocks",
    turnInto: true,
    hint: "[]",
    icon: <ListTodoIcon />,
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Quote",
    group: "Basic blocks",
    turnInto: true,
    hint: ">",
    icon: <BlockquoteIcon />,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code",
    group: "Basic blocks",
    turnInto: true,
    hint: "```",
    icon: <CodeBlockIcon />,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    group: "Basic blocks",
    hint: "---",
    icon: <DividerIcon />,
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Toggle",
    group: "Basic blocks",
    turnInto: true,
    icon: <ToggleIcon />,
    // Not `setDetails`: that leaves the title EMPTY and drops the block you
    // converted into the body. The block you point at should become the head.
    run: (editor) => editor.commands.toggleHeadingSection(),
  },
  {
    title: "Table",
    group: "Media",
    icon: <TableIcon />,
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Image",
    group: "Media",
    icon: <ImagePlusIcon />,
    // An empty block, not a prompt for a URL: the picture is usually a file on
    // the disk, and a menu that only takes a link cannot take one.
    run: (editor) => editor.commands.insertImagePlaceholder(),
  },
  {
    title: "Embed",
    group: "Media",
    hint: "video or link",
    icon: <BookmarkIcon />,
    prompt: "Paste a link",
    run: async (editor, href) => {
      // A YouTube link gets the real player; everything else gets a card.
      if (isValidYoutubeUrl(href)) {
        editor.chain().focus().setYoutubeVideo({ src: href }).run()
        return
      }

      // The card goes in straight away and fills itself in, so the fetch does
      // not leave the menu sitting there with nothing happening.
      const id = crypto.randomUUID()
      const placeholder = {
        href,
        title: href,
        description: "",
        image: "",
        icon: "",
        site: "",
        id,
        loading: true,
      }
      editor.chain().focus().setBookmark(placeholder).run()

      // A failed fetch still has to clear the card, or it sits on "Loading..."
      // for the life of the document.
      const metadata = await window.api
        .fetchLinkMetadata(href)
        .catch(() => null)
      if (editor.isDestroyed) return

      let at = -1
      editor.state.doc.descendants((node, pos) => {
        if (at >= 0) return false
        if (node.type.name === "bookmark" && node.attrs.id === id) at = pos
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
            loading: false,
          })
          .setMeta("addToHistory", false)
      )
    },
  },
]
