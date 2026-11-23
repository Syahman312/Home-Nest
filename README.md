# Nest

House setup before move-in (Oct 2028), home upkeep log after. Sits next to Vault, Ledger, Garage, Flow and Dashboard. See [SPEC.md](SPEC.md).

Single `index.html`, vanilla JS, no build step. Data lives in `localStorage` and optionally syncs to a Google Sheet via `Code.gs`.

## Deploy (GitHub Pages)
1. Merge to `main`, then repo **Settings → Pages → Deploy from a branch → `main` / root**.
2. Open `https://<user>.github.io/Home-Nest/` on the iPhone in Safari → Share → **Add to Home Screen**. Same on iPad; on the Poco F7 use Chrome → *Install app*.

## Google Sheets sync
1. Create a Google Sheet called **Nest DB** → Extensions → Apps Script → paste `Code.gs`.
2. Project Settings → time zone **Kuala Lumpur (GMT+8)**.
3. Deploy → New deployment → **Web app**, execute as **Me**, access **Anyone**. Copy the `/exec` URL.
4. In Nest → Settings → Sync, paste the URL on **each** device. A new device pulls what is in the Sheet; it never pushes sample data over it.
5. When you change `Code.gs` later: Deploy → Manage deployments → Edit → *New version* (keeps the URL).

Dashboard card: `GET <exec-url>?action=summary`.

## Safety nets
- Every change is saved locally first; a failed sync shows a red toast and retries on the next change / when back online.
- **Export JSON backup** (Settings). In the iPhone home-screen app it opens the share sheet → *Save to Files*.
- Import / Load sample / Clear all keep a snapshot on the device — Settings → **Restore**.
