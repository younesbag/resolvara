# Resolvara

Audit your AI agent's billed resolutions.

Resolvara reads an export of your support conversations and applies **The Strict Resolution Standard** to the ones an AI agent handled. It shows how many conversations your vendor billed as resolved, how many of those show no sign of failure, and which ones do. The analysis runs entirely in your browser. Nothing is uploaded.

## Why

AI support agents are increasingly billed per resolution, and the vendor defines and counts the resolution. A customer who asks for a person, or writes again two days later with the same problem, can still be billed as "resolved". Buyers have had no neutral way to check. Resolvara gives them one: a public definition, an open implementation, and a dispute pack to take to the vendor.

A conversation that is billed but fails the Standard is called a *phantom resolution*. That is a statement about the data under a stricter definition, not an accusation of fraud or an invoice error.

## What is in the repository

- `src/engine` - the audit engine: parsers, vendor presets, the classifier, metrics, sensitivity and dispute export. Pure TypeScript with no framework imports.
- `src/app`, `src/components`, `src/worker` - the Next.js site and the Web Worker that runs the engine.
- `content` - the Standard (`standard.md`), vendor facts (`vendors.json`), per-vendor guides, FAQ, privacy and about text.
- `docs` - the plan, the technical spec and the sourced vendor research.

## Run locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine tests (vitest)
npm run typecheck
npm run build
```

## How the engine works

1. **Parse.** CSV (comma or semicolon, BOM, quoted newlines) and JSON or JSONL are read in a Web Worker. A preset (Intercom, Zendesk, Ada, Gorgias) or the generic column mapper turns each row into a canonical conversation.
2. **Classify.** Each AI conversation gets one verdict, in order: *pending window* (too recent to judge), *unverifiable* (no customer key and no other signal), *phantom* (billed and at least one fail signal), or a pass (*strict* or *confirmed*).
3. **Fail signals.** The vendor escalated it, a human replied, it was reopened, the same customer wrote again within the window (default 7 days), or the satisfaction score was below 0.4 on a 0..1 scale. Every flag carries its evidence.
4. **Report.** Billed and strict rates, phantom count, dollars at risk at your price per resolution, reasons, weekly trend, and a sensitivity table for windows of 1, 3, 7, 14 and 30 days.

The full rules are in [`content/standard.md`](content/standard.md).

## Vendor facts

Every vendor fact in `content/vendors.json` has a source link and a checked date. Where a fact could not be confirmed, the field is `null` or marked unconfirmed. Please do not fill gaps from memory: open an issue with a source.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Corrections to vendor facts, new presets, test cases and proposals for the Standard are all welcome.

## Licences

- **Code:** MIT. See [LICENSE](LICENSE).
- **The Strict Resolution Standard text and other written content in `content/`:** CC BY 4.0. See [LICENSE-STANDARD.md](LICENSE-STANDARD.md).

Resolvara is independent and is not affiliated with any support software vendor. Vendor and product names belong to their owners.
