"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Moon, Sun, X } from "@phosphor-icons/react";
import { NAV_ITEMS } from "./lib/links";

type Theme = "light" | "dark";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const explicit = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(
      explicit === "light" || explicit === "dark"
        ? explicit
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("resolvara-theme", next);
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost size-11 px-0!"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
    </button>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2 ${
              isActive(item.href) ? "text-ink underline decoration-2 underline-offset-8" : "text-ink-2"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          type="button"
          className="btn btn-ghost size-11 px-0! lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full border-b border-line bg-bg px-4 pb-4 pt-2 lg:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col">
            {[...NAV_ITEMS, { href: "/privacy", label: "Privacy" }, { href: "/about", label: "About" }].map(
              (item) => (
                <li key={item.href} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`flex min-h-12 items-center text-base font-medium ${
                      isActive(item.href) ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      )}
    </>
  );
}
