"use client"

import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"

// --- UI Primitives ---
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
} from "@/components/tiptap-ui/color-highlight-popover"
import { MarkDropdownMenu } from "@/components/tiptap-ui/mark-dropdown-menu"
import { TextAlignDropdownMenu } from "@/components/tiptap-ui/text-align-dropdown-menu"


// --- Components ---
import { ThemeToggle } from "@/components/tiptap-templates/simple/theme-toggle"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"

import content from "@/components/tiptap-templates/simple/data/content.json"
import { LinkPopover } from "@renderer/components/tiptap-ui/link-popover"


export function SimpleEditor() {
  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: "simple-editor",
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
    ],
    content,
  })

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>

        <div className="w-full bg-red-300 fixed bottom-0 left-0 right-0 z-200">
          <Toolbar>
            <Spacer />
            <ToolbarSeparator />
            <ToolbarGroup>
              <HeadingDropdownMenu modal={false} levels={[1, 2, 3]} />
              <ListDropdownMenu
                modal={false}
                types={["bulletList", "orderedList", "taskList"]}
              />
              <BlockquoteButton />
              <CodeBlockButton />
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              <MarkDropdownMenu
                modal={false}
                types={["bold", "italic", "strike", "code", "underline", "superscript", "subscript"]}
              />
              <ColorHighlightPopover />
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              <TextAlignDropdownMenu
                modal={false}
                aligns={["left", "center", "right", "justify"]}
              />
              <LinkPopover
                editor={editor}
                hideWhenUnavailable={true}
                autoOpenOnLinkActive={true}
                onSetLink={() => console.log('Link set!')}
                onOpenChange={(isOpen) => console.log('Popover opened:', isOpen)}
              />
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              <ImageUploadButton text="Add" />
            </ToolbarGroup>
            <Spacer />
            <ToolbarGroup>
              <ThemeToggle />
            </ToolbarGroup>
          </Toolbar>
        </div>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content relative"
        />
      </EditorContext.Provider >
    </div >
  )
}

