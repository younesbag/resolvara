import type { ReactNode } from "react";

export function PageShell({
  title,
  intro,
  children,
  wide = false,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <header className="rise">
        <h1 className="max-w-[20ch] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
          {title}
        </h1>
        {intro && <div className="mt-5 max-w-[62ch] text-lg text-ink-2">{intro}</div>}
      </header>
      <div className={`mt-12 sm:mt-16 ${wide ? "" : "max-w-3xl"}`}>{children}</div>
    </div>
  );
}
