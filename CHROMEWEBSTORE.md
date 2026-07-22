# Chrome Web Store Listing — Clockroach

> Last Updated: 2026-07-13

## Store Listing

**Extension Name**  
Clockroach

**Short Description**  
Clockroach internal time tracking — timer, tasks, and admin reports.

**Detailed Description**  
Clockroach is a beautiful, client-side decentralized time tracker designed to keep your organization's work logs private. 

Instead of routing your team's sensitive activity data through a third-party server, Clockroach connects directly to your own self-hosted SQL database (Supabase) or your private Google Sheets spreadsheet using secure Web App triggers. No intermediaries exist between your Chrome Extension and your database.

Core Features:
- Direct, sub-100ms action response time.
- Log timers against departments, projects, and custom tasks.
- Restrict employee time modifications with built-in safety controls (Clockify-style limits).
- Admin reporting dashboard: Filter, aggregate, and export payroll or client invoices to CSV sheets.
- Fully offline-resilient backup of local active timer states.

How to set up:
1. Managers choose a backend (Google Sheets or Supabase) inside the setup cog.
2. Follow the scrollable, step-by-step setup guides to deploy the schema or Apps Script triggers.
3. Share the generated Workspace Invite Code or Web App URL with your employees.
4. Employees paste the code, register their email, and track time instantly!

**Category**  
Productivity

**Single Purpose**  
Tracks and aggregates employee working hours directly to their organization's self-hosted database or private spreadsheet.

**Primary Language**  
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icon.png` |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 | 1280×800 or 640×400 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1**: Show the main view of the Clockroach timer running with active selections.
- **Screenshot 2**: Show the scrollable backend setup forms (Sheets / Supabase configuration).
- **Screenshot 3**: Show the admin reports dashboard displaying charts, project aggregates, and the export button.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Used to persist local timer states, user preferences, active workspace credentials (Supabase URL/Key, Apps Script URL), and active sessions. |
| `alarms` | permissions | Used to run an background event loop to check if a timer is running past critical bounds (e.g. 2 hours) and issue warning alerts. |
| `notifications` | permissions | Used to trigger system-level desktop notifications when timers run too long or require attention. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No. All data logged is stored directly inside the user's chosen Google Sheet or Supabase database. No data is collected, stored, or transmitted to any publisher or third-party servers.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**  
https://github.com/shithins/Clockroach/blob/main/PRIVACY.md *(Recommended public hosting location)*

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free  

## Developer Info

**Publisher Name**: Clockroach Team  
**Contact Email**: shithin@example.com  
**Support URL / Email**: shithin@example.com  

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0 | 2026-07-13 | Initial Release with Google Sheets & Supabase backend options, scrollable wizard guides, and local state sync. | Draft |
