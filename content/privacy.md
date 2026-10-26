# Privacy

Last updated: 2026-10-24.

## The short version

The audit runs in your browser. Your file is not uploaded. Resolvara has no accounts, no cookies and no advertising. Two things can leave your browser, and neither contains your file or your results: an optional anonymous aggregate that you send yourself, after seeing exactly what it contains, and anonymous usage counts (which steps you reached, sent when you leave the page).

## What runs where

- **Your file.** It is read and parsed in your browser, inside a Web Worker. It is not sent to a server and it is not stored: closing or reloading the page discards it.
- **Customer identifiers.** Ids and emails in your file are replaced by a salted SHA-256 digest, with a random salt made for each session, before any rule runs. Only the digests are compared, and they are discarded with the page. Conversation text, if your file has any, is used only in memory for the optional same-topic filter.
- **Network requests.** The page makes no request while it analyses a file. Everything it needs, including the worker that does the analysis, is fetched when the page loads, so the page keeps working offline after that. You can confirm this: open your browser's developer tools, go to the Network tab, run an audit, and check that no request is sent. When you switch away from or close the page, one anonymous usage note is sent (see below). The Content Security Policy also restricts connections to this site and Vercel's performance endpoint.
- **Downloads.** The dispute CSV, the finance report and the share card are generated in your browser and saved to your device. The finance report holds the audit figures, the flagged conversation ids with their reasons, and a SHA-256 fingerprint of the figures. The share card contains only rates, the vendor name and the Standard version.

## Usage counts

To learn which steps people reach, the page notes when you open a page, run a sample, load a file, finish an audit, download the dispute CSV or the finance report, or open the dispute-help email, and sends these notes to this site in one request when you switch away from or close the page, never while an audit runs. Each note holds only the step name, the export format (for example "intercom"), whether it was sample data, a size range (such as 1k-10k conversations), a campaign tag if the link you followed had one, and a random id for this page load. It never holds your file, its name, its rows or your results, and nothing is saved on your device for it. The code is in `src/components/track.ts` and `src/server/events.ts`.

## The optional contribution

If you click "Contribute anonymously", the page shows you the exact JSON before it sends it. It contains: the Standard version, the preset, the vendor (picked from a fixed list, never typed), the period length in days, a size bucket for the number of AI conversations (for example 1k-10k), the billed rate, the strict rate, the phantom share of billed, the window, and the share of each fail reason. It contains no conversation ids, no customer data, no text and no timestamps.

On the server, the request is validated, extra fields are rejected, and one JSON object is stored. A hash of your IP address is used only for a short in-memory rate limit (best effort, five per hour) and is not stored with the contribution. Sending the same numbers twice on one day stores them once. Sample data cannot be contributed. Contributions are used for the benchmark page, which shows nothing for a vendor until at least 30 contributions exist, and which compares only contributions made with the default 7-day window.

## Analytics

Resolvara uses Vercel Web Analytics, which is cookieless. It records page views and general technical information such as browser type and country. It does not track you across sites and it does not see your file.

## Hosting

The site is hosted on Vercel. Vercel receives ordinary web server data (such as your IP address) when you load the page, as any host does. See Vercel's own privacy documentation for how it handles that.

## Your choices

You can use everything except the contribution without sending anything. You can inspect the code to check these statements; the link is in the footer. If you believe a contribution should be removed, contact the maintainers through the repository. Because contributions carry no identifiers, we may not be able to find yours.

## Changes

If this page changes, the date above changes and the change is visible in the repository history.
