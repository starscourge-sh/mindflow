/**
 * What the drawing editor gets for any language but English (see the vite
 * config). Haligtree never asks it for another language, so these were 53 files
 * (about 1.1 MB) shipped and never read; were one asked for, every label
 * would fall back to English, which is the editor's own rule for a missing one.
 */
export default {}
