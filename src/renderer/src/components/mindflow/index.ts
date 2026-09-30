/**
 * The editor's public surface.
 *
 * Everything a host needs, in one import. Anything not named here is the
 * component's own business and may move without warning - which is the point
 * of saying so in a file rather than leaving a consumer to guess from paths.
 */

export { MindflowEditor, type MindflowEditorProps } from "@/components/mindflow/mindflow-editor"
export {
  CommentEditor,
  DescriptionEditor,
  LineEditor,
  TitleEditor,
} from "@/components/mindflow/presets"

/** What the editor asks of the app around it. */
export { setHost, type MindflowHost, type LinkMetadata } from "@/lib/host"

/** Tags and anything else worth picking out of the text. */
export {
  TAGS,
  findTokens,
  spread,
  tagsOf,
  type TokenMatch,
  type TokenPattern,
} from "@/extensions/tokens"

/** The nine colours a tag, a callout or a block can take. */
export { BLOCK_COLORS, type BlockColor } from "@/extensions/block-color"

/**
 * The page's own settings, and the switches for them. Both belong to the host:
 * they cover every editor on the page, so they cannot live inside one.
 */
export { THEMES, applyTheme, currentTheme, themeName, type Theme } from "@/lib/theme"
export { currentVim, onVimChange, setVim } from "@/lib/vim"
export { VimToggle } from "@/components/mindflow/vim-toggle"

/** An emoji you can change: the button beside a note's title, and the picker. */
export { EmojiButton } from "@/components/emoji/emoji-button"

/** Every stored file a document points at: the list to back up. */
export { assetsOf, isStored, type DocumentAsset } from "@/lib/document"
