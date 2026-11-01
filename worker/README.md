# sarim-push: approval push notifications

A small Cloudflare Worker. When a team member sends something for approval, their app calls
`POST /notify` with their Firebase login token and the pending item's id. The Worker checks
everything, then sends a generic push through FCM to the workspace's active admin devices.

## What it checks (in order)
1. The Firebase ID token is genuine (signature, expiry, project, issuer).
2. Rate limits: 20 per user per minute, 120 overall per minute.
3. The caller has an approved account.
4. The pending item exists, is still `pending`, and was submitted by the caller.
5. This item has not already been announced (one alert per item).
6. Every recipient device belongs to a currently active admin in the same workspace.

The app sends only the pending id. The Worker chooses the recipients and writes the text.
Alerts never include amounts, customers or items.

## One-time setup
1. **Cloudflare account**: sign up, turn on two-factor authentication.
2. **Install and log in** (needs Node 18+):
   `cd worker && npx wrangler login`
3. **Create the rate-limit store**:
   `npx wrangler kv namespace create RATE`
   Copy the printed `id` into `wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`).
4. **Create a limited service account** in Google Cloud Console, project `calculator-fabd3`,
   IAM & Admin, Service Accounts:
   - Roles: **Firebase Cloud Messaging API Admin** and **Cloud Datastore Viewer** only.
   - Keys, Add key, JSON. Keep that file private. Do not commit or paste it anywhere.
5. **Store the key as a secret** (paste the whole JSON file contents when asked):
   `npx wrangler secret put SERVICE_ACCOUNT_JSON`
   Then delete the downloaded JSON file from your computer.
6. **Deploy**: `npx wrangler deploy`. It prints the Worker URL
   (`https://sarim-push.<your-subdomain>.workers.dev`).

## Check it is alive
`curl -i https://sarim-push.<your-subdomain>.workers.dev/notify` should return `405`.
A POST without a valid login returns `401`.

## Later
- Rotate the service-account key if it is ever exposed (create a new key, update the secret,
  delete the old key).
- Rotate the key every few months.
- Set a Google Cloud budget alert on the project.
