import Link from "next/link";
import { ArrowCounterClockwise, ArrowsClockwise, Flag, ThumbsDown, UserSwitch } from "@phosphor-icons/react/dist/ssr";

const CHECKS = [
  {
    icon: ArrowsClockwise,
    title: "The customer came back",
    body: "The same customer opened another conversation inside the window. The evidence names it and the gap in days.",
  },
  {
    icon: UserSwitch,
    title: "A human stepped in",
    body: "A teammate replied after the AI. The Standard counts it even where the vendor does not.",
  },
  {
    icon: ArrowCounterClockwise,
    title: "It was reopened",
    body: "The reopen count is above zero, or the timestamps show it reopened inside the window.",
  },
  {
    icon: ThumbsDown,
    title: "The rating was low",
    body: "Satisfaction below 0.4 on a 0 to 1 scale. On a 1 to 5 scale, a 2 counts as 0.25.",
  },
  {
    icon: Flag,
    title: "The vendor escalated it",
    body: "The vendor's own state says escalated, handed off or negative feedback.",
  },
] as const;

export function StrictTest() {
  return (
    <section id="checks" aria-labelledby="strict-h" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6 lg:pb-24">
      <div className="rounded-[var(--radius)] bg-panel px-6 py-12 text-on-panel [&_a:focus-visible]:outline-[var(--on-panel)] sm:px-10 lg:px-14 lg:py-16">
        <h2 id="strict-h" className="max-w-[22ch] text-3xl font-semibold tracking-tight sm:text-4xl">
          Five signs a billed resolution was not real.
        </h2>
        <p className="mt-3 max-w-[56ch] opacity-75">
          A conversation passes only when none of them appear inside the window.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {CHECKS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-panel/10">
                <Icon size={20} weight="bold" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed opacity-75">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <Link
          href="/standard"
          className="mt-10 inline-block py-1 text-sm font-medium underline decoration-on-panel/40 underline-offset-4 hover:decoration-on-panel"
        >
          Read the full Standard, with edge cases and limits
        </Link>
      </div>
    </section>
  );
}
