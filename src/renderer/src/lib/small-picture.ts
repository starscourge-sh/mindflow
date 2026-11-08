/**
 * A picture's small copy for a grid or a thumbnail: main makes it once with macOS's own thumbnailer and keeps it
 * (index.ts, `?w=`), so a picker of 120px squares never decodes full-size screenshots. GIFs keep moving, so they stay whole.
 */
export const small = (src: string, width = 256): string =>
  /^(haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.(png|jpe?g|webp|heic|tiff?)$/i.test(src) ? `${src}?w=${width}` : src
