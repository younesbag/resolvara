# Contributing to Resolvara

Thank you for helping. The project depends on being accurate and checkable, so most contributions are about evidence.

## Ways to help

- **Correct a vendor fact.** Open an issue or pull request that changes `content/vendors.json` and the matching file in `content/vendor-guides/`. Include the source URL and the date you checked it. Quote at most 25 words from a source; paraphrase the rest.
- **Fill an unconfirmed field.** Fields marked `null` or "unconfirmed" are gaps, not secrets. If you can confirm one from a primary source (vendor documentation, a spec, your own contract), please send it with the link. Do not add figures from competitor blogs or memory.
- **Report a case the Standard gets wrong.** Describe the situation, what the Standard says, what you think is right, and the data pattern that shows it (anonymised). Proposals for the Standard are discussed in an issue first.
- **Add or improve a preset.** Presets live in the engine and map a vendor export to the canonical conversation. Include a small anonymised fixture and a test.
- **Add test cases.** Edge cases such as time zones, boundaries, duplicates, odd delimiters and large files are very welcome.

## Ground rules

- No real customer data in issues, fixtures or tests. Use synthetic or fully anonymised data.
- Keep to the folder layout: engine code in `src/engine`, site code in `src/app`, `src/components` and `src/worker`, written content in `content`.
- The engine stays pure TypeScript with no React or Next imports.
- Do not add network calls to the audit path. The tool page must make no request while it analyses a file.
- Use neutral language. Say "billed but not strictly resolved" or "phantom resolution", not "fraud" or "scam".

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

Run the tests and the type check before opening a pull request. A change to a classification rule needs a test whose expected result you worked out by hand.

## Changing the Standard

Any change to a rule or a default is a new version of the Standard, recorded in the changelog in `content/standard.md`. Proposals need a rationale and, where possible, an example. Editorial fixes that do not change behaviour do not need a new version.

## Licensing

By contributing you agree that your code contributions are licensed under the MIT licence and your written contributions to `content/` under CC BY 4.0.
