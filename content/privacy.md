# Privacy

Last updated: 2026-10-24.

## The short version

The audit runs in your browser. Your file is not uploaded. Resolvara has no accounts, no cookies and no advertising. The only data that can leave your browser is an optional anonymous aggregate that you send yourself, after seeing exactly what it contains.

## What runs where

- **Your file.** It is read and parsed in your browser, inside a Web Worker. It is not sent to a server and it is not stored: closing or reloading the page discards it.
- **Customer identifiers.** Ids and emails in your file are hashed in memory with a per-session random salt before they are compared, and are discarded with the page. Conversation text, if your file has any, is used only in memory for the optional same-topic filter.
- **Network requests.** The page makes no request while it analyses a file. You can confirm this: open your browser's developer tools, go to the Network tab, run an audit, and check that no request is sent. The Content Security Policy also restricts connections to this site and Vercel's performance endpoint.
- **Downloads.** The dispute CSV and the share card are generated in your browser and saved to your device. The share card contains only rates, the vendor name and the Standard version.

## The optional contribution

If you click "Contribute anonymously", the page shows you the exact JSON before it sends it. It contains: the Standard version, the preset, the vendor, the period length in days, a size bucket for the number of AI conversations (for example 1k-10k), the billed rate, the strict rate, the phantom share of billed, the window, and the share of each fail reason. It contains no conversation ids, no customer data, no text and no timestamps.

On the server, the request is validated, extra fields are rejected, and one JSON object is stored. A hash of your IP address is used only for a short in-memory rate limit (best effort, five per hour) and is not stored with the contribution. Contributions are used for the benchmark page, which shows nothing for a vendor until at least 30 contributions exist.

## Analytics

Resolvara uses Vercel Web Analytics, which is cookieless. It records page views and general technical information such as browser type and country. It does not track you across sites and it does not see your file.

## Hosting

The site is hosted on Vercel. Vercel receives ordinary web server data (such as your IP address) when you load the page, as any host does. See Vercel's own privacy documentation for how it handles that.

## Your choices

You can use everything except the contribution without sending anything. You can inspect the code to check these statements; the link is in the footer. If you believe a contribution should be removed, contact the maintainers through the repository. Because contributions carry no identifiers, we may not be able to find yours.

## Changes

If this page changes, the date above changes and the change is visible in the repository history.
