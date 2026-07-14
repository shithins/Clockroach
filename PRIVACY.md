# Privacy Policy for Clockroach

Last updated: 2026-07-14

Clockroach is committed to protecting your privacy. This Privacy Policy explains how data is handled by the Clockroach Chrome Extension.

---

## 1. What Data We Process

Clockroach does **NOT** collect or store any of your data on our own servers. We do not run any backend telemetry, analytics trackers, or user profiling systems.

To function as a time tracker, the extension processes the following information:
* **Personally Identifiable Information (PII)**: Your Name and Email Address.
* **Authentication Credentials**: Your workspace password (if using Supabase mode).
* **User Activity**: Project names, task descriptions, timer start/end times, and duration logs.

---

## 2. How Data Is Stored & Transmitted

Clockroach operates under a **decentralized, client-side data architecture**. You choose and control where your team's logs are stored:

* **Google Sheets Mode**: If configured by your administrator, your time logs are transmitted directly and securely to your organization's private Google Sheet via a Google Apps Script Web App trigger on Google's servers.
* **Supabase Mode**: If configured by your administrator, your email, name, password, and time logs are stored and authenticated directly on your organization's private, self-hosted Supabase database instance.

No data is sent, shared, or leaked to the Clockroach developers or any third-party SaaS provider.

---

## 3. Third-Party Services

This extension does not route data through any third-party analytics or advertising services. Depending on your workspace configuration, the extension communicates directly with:
* **Google API & Apps Script** (subject to [Google's Privacy Policy](https://policies.google.com/privacy))
* **Supabase** (subject to your organization's private hosting instance and [Supabase's Privacy Policy](https://supabase.com/privacy))

---

## 4. Data Sharing & Retention

* **Data Sharing**: We never share, sell, or rent your data.
* **Data Retention**: Your time logs are retained in your organization's private Google Sheet or Supabase database database for as long as your workspace administrator decides. You must contact your workspace administrator to request deletion or modification of historical records.

---

## 5. Contact Information

If you have questions about this Privacy Policy or how data is processed, please contact us at:
* **Email**: shithin@example.com
* **GitHub Repository**: [https://github.com/shithins/Clockroach](https://github.com/shithins/Clockroach)
