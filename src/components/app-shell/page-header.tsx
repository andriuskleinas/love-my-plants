import Link from "next/link";
import type { ReactNode } from "react";
import { BackIcon } from "@/components/icons";

/**
 * Sticky page title. `back` adds a back arrow on phones; wide screens have the sidebar instead.
 */
export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 flex min-h-14 items-center gap-1 bg-background/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      {back && (
        <Link href={back.href} aria-label={`Back to ${back.label}`} className="-ml-2.5 flex h-11 w-11 items-center justify-center rounded-full text-muted lg:hidden">
          <BackIcon size={22} />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{title}</h1>
      {children}
    </header>
  );
}
