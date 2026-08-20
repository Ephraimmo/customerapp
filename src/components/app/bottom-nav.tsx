import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Search, ReceiptText, User } from "lucide-react";

const items = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/account", label: "Account", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s?.location?.pathname || "/" });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md md:hidden items-center justify-between border-t border-border bg-background/95 px-6 pt-3 pb-7 backdrop-blur-md"
    >
      {items.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl transition-opacity ${
              active ? "text-primary" : "text-foreground opacity-40"
            }`}
          >
            <Icon className="size-5" strokeWidth={active ? 2.6 : 2} aria-hidden />
            <span className="text-[9px] font-black tracking-widest uppercase">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
