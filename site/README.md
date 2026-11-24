# Haligtree's site

A static product page for Haligtree. Plain HTML, one stylesheet, one small
script for the bar at the top. It is not deployed or published anywhere.

## Open it

From the repo root:

    python3 -m http.server -d site 8742 --bind 127.0.0.1

Then open http://127.0.0.1:8742

## What is in it

- `index.html`: the product page. The open page fills the frame: a passage, a margin, a date. Capture, a question, and the year follow.
- `product.css`, `product.js`: that page only.
- `for/` and `features/`: shorter pages from earlier, still on `style.css`.
- `img/`: screenshots of the app, used by the shorter pages. The product page sets the moment itself.
- `fonts/`: Fraunces, under the SIL Open Font License (`fonts/OFL.txt`), used by the shorter pages.

Every claim on the product page is something the app does today. The lines come
from What Haligtree can do.
