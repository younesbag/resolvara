import { BookOpenText, BracketsCurly, LockSimple } from "@phosphor-icons/react/dist/ssr";
import { GITHUB_URL } from "../lib/links";

const ITEMS = [
  {
    icon: LockSimple,
    title: "Your file stays on your device",
    body: "Parsing and scoring run in your browser. Open the network tab during an audit: no request is made.",
  },
  {
    icon: BracketsCurly,
    title: "Open source",
    body: "MIT-licensed code you can read, run and fork.",
    href: GITHUB_URL,
  },
  {
    icon: BookOpenText,
    title: "Open definition",
    body: "The Strict Resolution Standard is public and versioned, licensed CC BY 4.0.",
    href: "/standard",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-h" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
      <h2 id="trust-h" className="sr-only">
        Why you can trust the numbers
      </h2>
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <Icon size={24} weight="bold" className="shrink-0 text-ink" aria-hidden />
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.body}</p>
              </div>
            </>
          );
          return (
            <li key={item.title}>
              {"href" in item ? (
                <a
                  href={item.href}
                  className="flex gap-4 rounded-[var(--radius)] hover:[&_h3]:underline"
                  {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {inner}
                </a>
              ) : (
                <div className="flex gap-4">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
