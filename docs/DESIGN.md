# Resolvara design direction (2026-10-25)

**Design read:** redesign (visual overhaul, content and URLs kept) of a free in-browser audit tool for support and CX leads who answer to finance. Calm, trustworthy "audit report" language. Tailwind v4 + Geist, restrained motion.

**Dials:** variance 5 · motion 3 · density 3. Simplicity beats spectacle: the tool is the product.

## Audit of the old home page
- Hero content and the upload card start at `opacity: 0` (`.rise`). Until the animation runs, the page looks empty and the upload box is missing. Worst bug on the page.
- No picture of the outcome: a visitor must upload a file before seeing what Resolvara produces.
- Version-label eyebrow ("STRICT RESOLUTION STANDARD V0.1"), a four-column trust strip, split headers ("headline left, list right") twice, a bento of five signal cards, a split FAQ: six sections, mostly paragraphs, all the same weight.
- Sample data hidden in small underlined links, although it is the fastest way to understand the tool.
- Dark mode looked like a generic developer template; light mode was washed out.

## Principles
1. **Tool first, visible on first paint.** No entrance animation hides content. Motion is hover and press feedback only.
2. **Show the result before asking for a file.** A real audit of the built-in sample data, rendered on the server with the same engine, sits right under the hero. Labelled "sample data". No div-built fake screenshots, no invented numbers.
3. **One message per section, each a different layout.** Hero (split: copy + upload card) → sample report (wide report card) → how it works (three steps in a row, no cards) → the five checks (two-column list) → privacy facts (inline band) → FAQ (single narrow column accordion).
4. **Sample data is a first-class action:** "Try the sample" button next to "Choose file", not a text link.
5. **Copy:** short, plain, no em-dashes, no version labels, no eyebrows except none. Keep the existing voice and claims (every claim already sourced in docs/research/vendor-facts.md).

## Tokens
- Neutrals stay cool grey (existing). Light is the reference theme; dark keeps the same hierarchy.
- One accent: vermilion, used only for "phantom" (the thing the product finds). Green appears only as the semantic "passes" colour inside results.
- Radius: one scale, 10px for cards and inputs, full pill for buttons. Stamps (verdict labels) keep 2px as a documented exception: they are labels, not containers.
- Type: Geist Sans; numbers in tabular figures. Hero `text-4xl → 5.5xl`, two lines max.

## Not changed
URLs, nav labels, analytics, the results view after an upload, other pages (they inherit the new tokens).
