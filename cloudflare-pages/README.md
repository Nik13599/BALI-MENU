# BALI Cloudflare Pages

The Git-connected Pages project uses root directory `cloudflare-pages`, build command `node build.mjs`, and output directory `dist`.

The build copies public browser files from the repository root and selected asset folders. Firebase Functions, rules, and internal scripts are not published.

Keep `baliminsk.by` on the current hosting until the `pages.dev` deployment has passed smoke tests.

Deployment verification: The first Cloudflare Pages production build completed successfully on 2026-10-21. This documentation-only commit tests automatic GitHub-to-Cloudflare deployments before custom-domain cutover.

Git integration reconnected after repository authorization. Second documentation-only change tests automatic deployment events.

Autodeploy verification following confirmation of Cloudflare GitHub App repository access (2026-10-21).
