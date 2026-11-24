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

## Share with your partner (like Ledger's shared ledgers)
1. Settings → **Shared homes** → type your name.
2. Tap **Invite partner** (link) or **Copy setup code**, and send it.
3. Partner opens the link, or pastes the code under *Add a shared home*. A blank phone just joins; a phone that already has its own home keeps it and adds the shared one.

- Switch homes by tapping the title on Home (▾). A shared home shows a 👫 badge.
- Each item can have **Paid by** (it fills in your name when you move it to Ordered). Home shows **Who paid what** and who owes whom if you split equally.
- Every change is saved with who did it: see **Recent activity** on Home, or the full feed (latest 300). The Sheet keeps it in the `log` tab.
- The link and code hold your sync URL, so only send them to people you trust.

## Safety nets
- Every change is saved locally first; a failed sync shows a red toast and retries on the next change / when back online.
- **Export JSON backup** (Settings). In the iPhone home-screen app it opens the share sheet → *Save to Files*.
- Import / Load sample / Clear all keep a snapshot on the device — Settings → **Restore**.
