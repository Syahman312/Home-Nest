# Nest: spec for Claude Code

Nest plans the house setup before the move-in (target Oct 2028). After the move-in, it becomes the home upkeep log, like Garage but for the house.
It sits next to Vault, Ledger (the finance tracker), Garage, Flow and Dashboard. It uses the same stack and is hosted on GitHub Pages.

## Stack (same as the other apps)
- One `index.html` file: vanilla JS, no build step, offline-first through `localStorage`
- Backend: a Google Sheet ("Nest DB") with an Apps Script web app (`Code.gs`)
- Writes are POSTed as `text/plain` (this avoids a CORS preflight) and reads use GET. Sync is last-write-wins **per record**: every room/item/task/bill carries `u` (ms of its last edit), deletions leave a tombstone in `deleted`, settings carry `settingsAt`. The script merges each save with the Sheet and returns the merged state, so two devices editing different records never overwrite each other.
- It runs as a PWA from the iPhone home screen and also works on the iPad, the Poco F7 and the PC

## Files in this draft
| File | What it is |
|---|---|
| `index.html` | The app. Starts empty; Settings → Load sample to try it. |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA shell (works offline), home-screen icons |
| `Code.gs` | Apps Script bridge: `get`, `save`, plus `summary` for Dashboard |
| `SPEC.md` | This file |

## Tabs
1. **Home**: a move-in countdown and the monthly amount needed to cover what's left. A budget bar splits spending into bought, ordered and planned. Stat tiles show must-haves done, item count, rooms and monthly bills. Below that are the next 5 must-haves and the upkeep tasks coming up.
2. **Rooms**: a grid of rooms (emoji, item count, cost, progress bar). Tapping a room shows its items and upkeep tasks.
3. **Shopping list**: every item, with filter chips for status and priority. Tapping the status pill moves an item one step: Idea → Shortlisted → Ordered → Delivered. An item marked Delivered gets today's date.
4. **Upkeep**: recurring maintenance tasks, each repeating every N months with a "✓ Done" button and an overdue or due-soon badge. It also has a household bills forecast with the total per month and per year.
5. **Settings**: household name, move-in date, setup budget, the Apps Script URL, Pull/Push, JSON export/import, load sample data and clear all.

## Data model
```
settings { household, moveIn (yyyy-mm-dd), budget (RM) }      + settingsAt
rooms    { id, name, icon, u }
items    { id, roomId, name, category, priority: must|soon|later,
           status: idea|shortlist|ordered|delivered, est, actual, shop, link,
           date, warranty, notes, u }
tasks    { id, name, roomId, interval (months), lastDone, notes, u }
bills    { id, name, amount, freq: monthly|quarterly|yearly, notes, u }
deleted  { <id>: ms }   tombstones, pruned after 400 days
```
Each collection is stored in its own sheet tab so the data is easy to read in Sheets. Settings, `settingsAt` and `updatedAt` are stored in `_meta`; tombstones in `_deleted`. The sync URL is device-only (localStorage key `nest.device`), never stored in the Sheet or in backups.

## Phase 2: features to build next (in priority order)
1. **Ledger link**: when an item becomes *Delivered* and has an actual cost, offer "Send to Ledger". It would create an expense under the category Home → Furniture/Appliance, with the shop as the payee. Use the same cross-app pattern that was used to link Garage to Ledger. Store the Ledger entry id on the item so the two records stay linked.
2. **Vault link**: attach a receipt or warranty card to an item and save it to Drive under `Nest/Receipts/<Room>`. Show it in the app.
3. **Warranty alerts**: warranties ending within 60 days show on Home and in Dashboard.
4. **Price watch**: a target price per item. Items under target, or due for the 9.9, 11.11 and 12.12 sales, get a "Sale season" badge.
5. **Compare options**: an item can hold 2–3 candidate models (price, shop, link, pros and cons). Picking one turns it into the item.
6. **Move-in checklist**: one-off tasks before the move-in, such as keys/VP, TNB/water account transfer, internet install, defect list, cleaning and changing locks. Each has a due date that counts back from the move-in date.
7. **Defects log** (if the house is new): defect, room, photo, reported date, fixed or not, before the defect liability period ends.
8. **Google Calendar**: put upkeep due dates on the calendar the same way Flow does.

## Dashboard integration
`GET <exec-url>?action=summary` returns:
```
{ app, moveIn, daysToMoveIn, budget, spent, committed, planned,
  mustDone, mustTotal, overdueTasks, updatedAt }
```
Add a Nest card to Dashboard showing the countdown, budget used and overdue upkeep.

## Must-haves for the build
- Same polish level as Flow: HTTPS, mobile-first layout, safe-area insets, `noindex`, an apple-touch-icon (a 180px PNG of a house, warm amber on black), and error toasts in place of silent failures
- Export a JSON backup with one tap. Never lose local data when sync fails.
- The bottom sheet forms need to work with the iOS keyboard. Date fields open the native date picker.
