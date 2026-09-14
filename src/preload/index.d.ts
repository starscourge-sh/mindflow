export interface LinkMetadata {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
}

export interface Api {
  fetchLinkMetadata: (url: string) => Promise<LinkMetadata>
  /** Store image bytes and get back the URL that reads them again. */
  saveImage: (mime: string, bytes: Uint8Array) => Promise<string>
  /** Put a stored image on the system clipboard. */
  copyImage: (src: string) => Promise<boolean>
  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string) => Promise<{ mime: string; bytes: Uint8Array } | null>
}

declare global {
  interface Window {
    api: Api
  }
}
