import { Node, mergeAttributes } from "@tiptap/core"

/**
 * A link rendered as a preview card: thumbnail, title, description, site.
 *
 * The metadata is fetched once and stored on the node, so the card keeps
 * working offline and never refetches while you type.
 */
export interface BookmarkAttributes {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
  /** Identifies the card so the fetch that follows can find it again. */
  id?: string
  loading?: boolean
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attributes: BookmarkAttributes) => ReturnType
    }
  }
}

export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    // Everything here stays a string. The default parser runs values through
    // `fromString`, so an all-digits title would come back as a number and
    // ProseMirror's renderer throws on a numeric text child.
    const text = (name: string) => ({
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute(name) ?? "",
    })

    return {
      href: text("href"),
      title: text("title"),
      description: text("description"),
      image: text("image"),
      icon: text("icon"),
      site: text("site"),
      // Neither belongs in the HTML: a copied card would come back stuck on
      // "Loading..." and sharing its id with the original, so the fetch that
      // is still running would patch the wrong one.
      id: { default: "", rendered: false },
      loading: { default: false, rendered: false },
    }
  },

  parseHTML() {
    // Link's `a[href]` rule would otherwise win and the card would paste back
    // as an ordinary link: marks are tried before nodes at equal priority.
    return [{ tag: "a[data-bookmark]", priority: 100 }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const { href, title, description, image, icon, site, loading } = node.attrs

    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-bookmark": "",
        ...(loading ? { "data-loading": "" } : {}),
        class: "tiptap-bookmark",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
      ...(loading
        ? [["span", { class: "tiptap-bookmark-image is-loading" }]]
        : image
          ? [["img", { class: "tiptap-bookmark-image", src: image, alt: "" }]]
          : []),
      [
        "span",
        { class: "tiptap-bookmark-body" },
        ["span", { class: "tiptap-bookmark-title" }, title || href],
        ...(description
          ? [["span", { class: "tiptap-bookmark-description" }, description]]
          : []),
        [
          "span",
          { class: "tiptap-bookmark-site" },
          ...(icon && !loading
            ? [["img", { class: "tiptap-bookmark-icon", src: icon, alt: "" }]]
            : []),
          ["span", {}, loading ? "Loading..." : site],
        ],
      ],
    ]
  },

  addCommands() {
    return {
      setBookmark:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    }
  },
})
