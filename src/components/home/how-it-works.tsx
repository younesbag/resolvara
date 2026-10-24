import Link from "next/link";

const STEPS = [
  {
    verb: "Export",
    body: "Pull a conversation export from your helpdesk. Intercom, Zendesk, Ada and Gorgias are detected from the headers. Anything else takes a minute of column mapping.",
    link: { href: "/definitions", label: "How each vendor exports and bills" },
  },
  {
    verb: "Drop",
    body: "Resolvara applies five fail signals and a pending window you control. It reports a strict rate next to the billed rate, with the evidence behind every flagged row.",
    link: { href: "/standard", label: "Read the Standard" },
  },
  {
    verb: "Dispute",
    body: "Download the flagged conversations as a CSV with a reason for each, plus an email draft that asks for a credit review. Judge a sample by hand before you send it.",
    link: { href: "/calculator", label: "Estimate what it is worth" },
  },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="how-h" className="max-w-[14ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            From export to evidence in a minute.
          </h2>
          <p className="mt-4 max-w-[40ch] text-ink-2">
            Per-resolution billing is only as good as the definition behind it. This puts a second,
            stricter definition in your hands.
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {STEPS.map((s) => (
            <li key={s.verb} className="py-7 sm:py-9">
              <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.verb}</h3>
              <p className="mt-3 max-w-[56ch] text-ink-2">{s.body}</p>
              <Link
                href={s.link.href}
                className="mt-4 inline-block py-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {s.link.label}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
