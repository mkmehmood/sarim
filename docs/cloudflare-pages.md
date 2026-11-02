# Hosting the web app on Cloudflare Pages

The repo is private, so GitHub Pages is not available. Cloudflare Pages is free and works with private repos.

## Create the project
1. Cloudflare dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Authorize the Cloudflare GitHub app for this repository only, then select it.
3. Project name: `sarim` (the address becomes `https://sarim.pages.dev`, or a variant if taken).
4. Production branch: `main`.
5. Build command: `npm ci && npm run build`
6. Build output directory: `dist`
7. Environment variable: `NODE_VERSION` = `22`
8. Save and Deploy.

## Allow the new address
- Cloudflare, Workers & Pages, `sarim-push`, Settings, Variables: set `ALLOWED_ORIGIN` to
  `https://mkmehmood.github.io,https://<your-address>.pages.dev` (keep the first one, the Android and desktop apps still use it).
- Firebase, Authentication, Settings, Authorized domains: add `<your-address>.pages.dev`.

## After that
Every push to `main` deploys automatically. Pull requests get their own preview address.
