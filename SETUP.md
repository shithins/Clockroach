# Setup — get this running today

## 1. Google Sheet + Apps Script (10 minutes)

1. Create a new Google Sheet (sheets.new).
2. Extensions → Apps Script.
3. Delete the default code, paste in the entire contents of `apps-script/Code.gs`.
4. In the function dropdown at the top, select `initSheets`, click **Run**. Approve the permissions prompt.
   - This creates all 5 tabs with headers + 2 sample employees, 2 sample projects, 3 sample tasks.
   - **Go replace the sample employee emails** in the `Employees` tab with real ones (at least yourself, marked `admin`).
5. Deploy → New deployment → gear icon → type: **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → copy the **Web app URL**.

## 2. Extension config (1 minute)

1. Open `extension/config.js`.
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the Web app URL from step 1.5.

## 3. Load the extension in Chrome (2 minutes)

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** → select the `extension` folder.
4. Pin the extension icon.

## 4. Test it

- Click the extension icon. It should detect your Chrome-signed-in email and greet you.
  - If it says "no employee record found," add your email in the `Employees` tab (or via the Admin panel once one admin is in).
- Pick a project, type a task, hit Start. Timer runs. Hit Stop.
- If your role in the `Employees` sheet is `admin`, you'll see "Open Admin Panel" — click it to manage employees/projects/departments/tasks and run reports.

## Known shortcuts (for speed today — harden before wider rollout)

- **Login isn't a real OAuth flow.** It uses `chrome.identity.getProfileUserInfo`, which just reads the email of whoever's signed into Chrome — it does not produce a verifiable token, and the email is sent to the API as plain text. A technically savvy person could edit the extension's local code to claim a different email. Fine for a small trusted internal pilot; before a wider rollout, swap this for a real OAuth token that the Apps Script backend verifies server-side.
- **No yearly archiving yet** — fine at your current scale, but add a trigger to split `TimeEntries` into yearly tabs before the sheet gets into the tens of thousands of rows.
- **Notifications are basic** — checks every 30 min while a timer's open, alerts past 2 hours. No email backup yet for closed-browser cases.
- **No edit forms for employees/projects yet** — Admin panel supports add + delete, not inline edit. Quick to add later if needed.

## What's NOT built yet (from the original plan, deliberately deferred)

- Editing existing employees/projects/tasks (only add/delete right now)
- Nightly email backup for forgotten timers
- Yearly data archiving script
- Per-employee date-range breakdown drill-down in reports (you get totals by employee and by project, filtered by date — cross-tabbing both at once is a 15-minute follow-up if you need it)
