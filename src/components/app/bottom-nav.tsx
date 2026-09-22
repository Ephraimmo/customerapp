import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Search, ReceiptText, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/account", label: "Account", icon: User },
] as const;

/**
 * Routes that own their own bottom area — a sticky action bar, or a focused
 * flow we do not want to navigate away from by accident.
 */
function hidesBottomNav(pathname: string) {
  return (
    pathname.startsWith("/restaurant") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/login") ||
    // Order tracking has an action bar; the orders list does not.
    /^\/orders\/.+/.test(pathname)
  );
}

/**
 * Mounted once in the root layout, not per route, so it stays put while the
 * page under it changes.
 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s?.location?.pathname || "/" });

  if (hidesBottomNav(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed-bar nav-safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-center justify-between border-t border-border bg-background/95 px-6 pt-3 backdrop-blur-md md:hidden"
    >
      {items.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);

        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl transition-opacity",
              active ? "text-primary" : "text-foreground opacity-40",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.6 : 2} aria-hidden />
            <span className="text-[9px] font-black tracking-widest uppercase">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
