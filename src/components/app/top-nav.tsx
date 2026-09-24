import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Gift, Headphones, MapPin, ReceiptText, Search, User } from "lucide-react";
import { useLocation } from "@/lib/location";
import { useAuth } from "@/lib/auth";
import { useLoyaltyWallet } from "@/lib/firebase-adapters";
import { useCustomerSupportTickets } from "@/lib/support";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./logo";
import { LocationSelectorDialog } from "./location-selector-dialog";

const items = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/support", label: "Help", icon: Headphones },
  { to: "/account", label: "Account", icon: User },
] as const;

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s?.location?.pathname || "/" });
  const { activeLocation } = useLocation();
  const { user } = useAuth();
  const wallet = useLoyaltyWallet(user?.uid || "guest_customer");
  const { totalUnreadCount } = useCustomerSupportTickets(user?.uid, user?.email);
  const [openDialog, setOpenDialog] = useState(false);

  const addressSummary = activeLocation
    ? `${activeLocation.label} · ${activeLocation.street}`
    : "Set delivery address";

  return (
    <>
      <header className="sticky top-0 z-50 hidden border-b border-border bg-background/90 backdrop-blur-md md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link
            to="/"
            aria-label="Kasi Zonke Link — home"
            className="shrink-0 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <BrandLogo wordmarkClassName="text-base" />
          </Link>

          <nav aria-label="Primary" className="flex min-w-0 items-center gap-0.5">
            {items.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              const showUnread = to === "/support" && totalUnreadCount > 0;

              return (
                <Link
                  key={to}
                  to={to}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-lg px-3 text-[11px] font-black tracking-wider uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active && "text-primary")}
                    strokeWidth={active ? 2.5 : 2}
                    aria-hidden
                  />
                  <span className="sr-only lg:not-sr-only">{label}</span>

                  {showUnread ? (
                    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary font-mono text-[9px] leading-none font-black text-primary-foreground">
                      {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
                      <span className="sr-only"> unread support replies</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOpenDialog(true)}
              aria-label={
                activeLocation
                  ? `Delivery address: ${addressSummary}. Change it`
                  : "Set delivery address"
              }
              className="flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/70 px-2.5 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
              <span
                aria-hidden
                className={cn(
                  "hidden max-w-[200px] truncate text-xs font-bold lg:block",
                  !activeLocation && "text-primary",
                )}
              >
                {addressSummary}
              </span>
            </button>

            {user ? (
              <Link
                to="/account"
                aria-label={`Loyalty balance: ${wallet.balance} points`}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Gift className="size-4 shrink-0" aria-hidden />
                <span aria-hidden className="font-mono tabular-nums">
                  {wallet.balance}
                </span>
                <span aria-hidden className="hidden lg:inline">
                  pts
                </span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex h-10 shrink-0 items-center rounded-lg bg-primary px-4 text-[11px] font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <LocationSelectorDialog open={openDialog} onClose={() => setOpenDialog(false)} />
    </>
  );
}
