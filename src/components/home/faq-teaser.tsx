import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { Markdown } from "../markdown";
import type { FaqItem } from "../lib/content";

export const FALLBACK_FAQ: FaqItem[] = [
  {
    q: "Does my file leave my browser?",
    a: "No. Parsing and scoring run in a Web Worker on your device. The only request Resolvara can make is the optional Contribute button, and it shows you the exact JSON before anything is sent.",
  },
  {
    q: "Is a phantom resolution an invoice error?",
    a: "Not necessarily. A conversation can be billed correctly under your contract and still fail the Standard. Phantom means billed but not strictly resolved. It is evidence for a conversation with your vendor.",
  },
  {
    q: "Why is my strict rate lower than the vendor's rate?",
    a: "Several vendors count a customer who goes quiet as a resolution. The Standard also looks for repeat contacts, reopens, human replies and low ratings. Each vendor's own rule, with sources, is on the definitions page.",
  },
  {
    q: "What if my helpdesk is not on the list?",
    a: "Use the column mapper. Pick the columns for the ID, the customer, the created date and the billed flag, and the same audit runs on any CSV or JSON export.",
  },
];

export function FaqTeaser({ items }: { items: FaqItem[] }) {
  const list = (items.length > 0 ? items : FALLBACK_FAQ).slice(0, 5);
  return (
    <section aria-labelledby="faq-h" className="border-t border-line">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
        <h2 id="faq-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Questions people ask first
        </h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {list.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                {f.q}
                <CaretDown
                  size={18}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="pb-5 pr-8 text-ink-2">
                <Markdown source={f.a} />
              </div>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-2">
          The full rules and their known limits are in{" "}
          <Link href="/standard" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            the Standard
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
