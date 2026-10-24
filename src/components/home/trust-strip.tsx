import { BookOpenText, BracketsCurly, Browsers, Detective } from "@phosphor-icons/react/dist/ssr";

const ITEMS = [
  {
    icon: Browsers,
    title: "Runs in your browser",
    body: "Parsing and scoring happen in a Web Worker on your device. No upload, no account.",
  },
  {
    icon: BookOpenText,
    title: "Open definition",
    body: "The Strict Resolution Standard is public and versioned. Text under CC BY 4.0.",
  },
  {
    icon: BracketsCurly,
    title: "Open source",
    body: "MIT-licensed code you can read, run and fork.",
  },
  {
    icon: Detective,
    title: "Check it yourself",
    body: "Open DevTools and watch the network tab. An audit makes zero requests.",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Why you can trust the numbers" className="border-y border-line bg-surface">
      <ul className="mx-auto grid w-full max-w-6xl gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-4 py-6 lg:px-6 lg:first:pl-0 lg:last:pr-0 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-line">
            <Icon size={26} weight="regular" className="mt-0.5 shrink-0 text-ink" aria-hidden />
            <div>
              <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-ink-2">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
