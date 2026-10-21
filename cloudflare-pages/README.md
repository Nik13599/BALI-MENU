# BALI Cloudflare Pages

The Git-connected Pages project uses root directory `cloudflare-pages`, build command `node build.mjs`, and output directory `dist`.

The build copies public browser files from the repository root and selected asset folders. Firebase Functions, rules, and internal scripts are not published.

Keep `baliminsk.by` on the current hosting until the `pages.dev` deployment has passed smoke tests.
