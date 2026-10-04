"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/marks";
import { CartIcon, GearIcon, LeafIcon, MenuIcon, PeopleIcon, PlusIcon, SuitcaseIcon, SunIcon } from "@/components/icons";
import { AddSheet } from "./add-sheet";

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number }>; match: (path: string) => boolean };

const TODAY: NavItem = { href: "/", label: "Today", icon: SunIcon, match: (p) => p === "/" };
const PLANTS: NavItem = { href: "/plants", label: "Plants", icon: LeafIcon, match: (p) => p.startsWith("/plants") };
const SHOPPING: NavItem = { href: "/shopping", label: "Shopping", icon: CartIcon, match: (p) => p.startsWith("/shopping") };
const AWAY: NavItem = { href: "/vacation", label: "Going away", icon: SuitcaseIcon, match: (p) => p.startsWith("/vacation") };
const CIRCLE: NavItem = { href: "/circle", label: "Care Circle", icon: PeopleIcon, match: (p) => p.startsWith("/circle") };
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: GearIcon, match: (p) => p.startsWith("/settings") };
// On phones these three live under More.
const MORE: NavItem = {
  href: "/more",
  label: "More",
  icon: MenuIcon,
  match: (p) => [AWAY, CIRCLE, SETTINGS].some((i) => i.match(p)) || p.startsWith("/more"),
};

/** Full-screen flows where the navigation would only distract. */
const FOCUSED = [/^\/plants\/new$/, /^\/plants\/[^/]+\/checkin$/];

/** Signed-in frame: a bottom tab bar on phones, a sidebar on wide screens, and the ＋ sheet. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [adding, setAdding] = useState(false);
  if (FOCUSED.some((re) => re.test(path))) return <>{children}</>;

  return (
    <>
      <Sidebar path={path} onAdd={() => setAdding(true)} />
      <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">{children}</div>
      <TabBar path={path} onAdd={() => setAdding(true)} />
      <AddSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function TabBar({ path, onAdd }: { path: string; onAdd: () => void }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-[4.5rem] max-w-md grid-cols-5 items-stretch">
        <Tab item={TODAY} path={path} />
        <Tab item={PLANTS} path={path} />
        <li className="flex items-start justify-center">
          <button
            onClick={onAdd}
            aria-label="Add or check a plant"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-leaf text-background shadow-lg ring-4 ring-background transition-transform active:scale-95"
          >
            <PlusIcon size={28} strokeWidth={2.4} />
          </button>
        </li>
        <Tab item={SHOPPING} path={path} />
        <Tab item={MORE} path={path} />
      </ul>
    </nav>
  );
}

function Tab({ item, path }: { item: NavItem; path: string }) {
  const active = item.match(path);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-leaf" : "text-muted"}`}
      >
        <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-leaf-soft" : ""}`}>
          <Icon size={22} />
        </span>
        {item.label}
      </Link>
    </li>
  );
}

function Sidebar({ path, onAdd }: { path: string; onAdd: () => void }) {
  const groups = [
    [TODAY, PLANTS, SHOPPING],
    [AWAY, CIRCLE, SETTINGS],
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2 text-lg font-semibold">
        <LogoMark size={36} title={null} />
        Love My Plants
      </Link>
      <button
        onClick={onAdd}
        className="mt-6 flex items-center justify-center gap-2 rounded-full bg-leaf px-4 py-3 font-medium text-background"
      >
        <PlusIcon size={20} strokeWidth={2.4} /> Add or check a plant
      </button>
      <nav aria-label="Main" className="mt-6 space-y-6">
        {groups.map((items, i) => (
          <ul key={i} className="space-y-1">
            {items.map((item) => {
              const active = item.match(path);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
                      active ? "bg-leaf-soft text-leaf" : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                  >
                    <Icon size={22} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
    </aside>
  );
}
