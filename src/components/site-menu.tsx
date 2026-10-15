"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type MenuItem = { label: string; href: string };

export type MenuProps = {
  labels: { menu: string; google: string; signOut: string };
  items: MenuItem[];
  account: { kind: "signedIn"; email: string } | { kind: "google" } | { kind: "none" };
  googleHref: string;
  signOutHref: string;
};

const rowClass = "flex min-h-12 items-center border-b border-border text-lg font-medium";

export function SiteMenu({ labels, items, account, googleHref, signOutHref }: MenuProps) {
  const pathname = usePathname();
  return (
    <Sheet>
      <SheetTrigger aria-label={labels.menu} className="inline-flex size-11 items-center justify-center">
        <MenuIcon className="size-6" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm gap-0 px-6 pt-14">
        <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
        <nav className="flex flex-col">
          {items.map((item) => (
            <SheetClose key={item.href} render={<Link href={item.href} className={rowClass} />}>
              {item.label}
            </SheetClose>
          ))}
          {account.kind === "google" && (
            <a href={`${googleHref}${encodeURIComponent(pathname)}`} className={rowClass}>
              {labels.google}
            </a>
          )}
          {account.kind === "signedIn" && (
            <form action={signOutHref} method="post" className="contents">
              <input type="hidden" name="next" value={pathname} />
              <button type="submit" className={`${rowClass} w-full text-left`}>
                {labels.signOut}
              </button>
              <p className="pt-3 text-sm text-muted-foreground">{account.email}</p>
            </form>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
