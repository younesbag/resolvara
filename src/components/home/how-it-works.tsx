import Link from "next/link";
import { FileArrowDown, FileCsv, ListChecks } from "@phosphor-icons/react/dist/ssr";

const STEPS = [
  {
    icon: FileArrowDown,
    verb: "Export",
    body: "Pull a conversation export from your helpdesk. Intercom, Zendesk, Ada and Gorgias are recognised from the headers.",
    link: { href: "/definitions", label: "How each vendor exports and bills" },
  },
  {
    icon: ListChecks,
    verb: "Check",
    body: "Each billed resolution is tested against five failure signals inside a window you choose, seven days by default.",
    link: { href: "/standard", label: "Read the Standard" },
  },
  {
    icon: FileCsv,
    verb: "Dispute",
    body: "Download the flagged conversations with a reason for each, plus an email draft asking for a credit review.",
    link: { href: "/calculator", label: "Estimate what it is worth" },
  },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
      <h2 id="how-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Three steps, about a minute.
      </h2>
      <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map(({ icon: Icon, verb, body, link }) => (
          <li key={verb} className="border-t-2 border-ink pt-6">
            <Icon size={28} weight="regular" className="text-ink" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{verb}</h3>
            <p className="mt-2 max-w-[38ch] text-ink-2">{body}</p>
            <Link
              href={link.href}
              className="mt-3 inline-block py-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
