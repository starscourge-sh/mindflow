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

/** Every stored file a document points at: the list to back up. */
export { assetsOf, isStored, type DocumentAsset } from "@/lib/document"
