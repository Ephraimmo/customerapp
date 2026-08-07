import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, MapPin, ReceiptText, Search, User } from "lucide-react";

const items = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/account", label: "Account", icon: User },
] as const;

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-50 hidden border-b border-border bg-background/90 backdrop-blur-md md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link to="/" className="text-lg font-black tracking-tight">
          Hearth
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 items-center gap-1">
          {items.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black tracking-widest uppercase transition-colors ${
                  active ? "bg-secondary text-primary" : "text-foreground/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <span className="ml-auto hidden min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground lg:flex">
          <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">242 High Street, St. Ives</span>
        </span>
      </div>
    </header>
  );
}
