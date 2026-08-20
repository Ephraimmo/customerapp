import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Gift, Headphones, MapPin, ReceiptText, Search, User } from "lucide-react";
import { useLocation } from "@/lib/location";
import { useAuth } from "@/lib/auth";
import { useLoyaltyWallet } from "@/lib/firebase-adapters";
import { useCustomerSupportTickets } from "@/lib/support";
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

  return (
    <>
      <header className="sticky top-0 z-50 hidden border-b border-border bg-background/90 backdrop-blur-md md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link to="/" className="text-lg font-black tracking-tight">
            Hearth
          </Link>

          <nav aria-label="Primary" className="flex min-w-0 items-center gap-1">
            {items.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              const showUnread = to === "/support" && totalUnreadCount > 0;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black tracking-widest uppercase transition-colors relative ${
                    active
                      ? "bg-secondary text-primary"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                  {showUnread ? (
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] font-black text-primary-foreground">
                      {totalUnreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Live Real-time Loyalty Points Indicator */}
            <Link
              to="/account"
              aria-label="View loyalty points"
              className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/20 hover:bg-primary/20 transition-colors"
            >
              <Gift className="size-3.5" />
              <span>{wallet.balance} pts</span>
            </Link>

            {/* Interactive Delivery Location Button in Header */}
            <button
              type="button"
              onClick={() => setOpenDialog(true)}
              aria-label="Change delivery location"
              className="hidden min-w-0 items-center gap-2 rounded-xl bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-secondary transition-colors lg:flex cursor-pointer"
            >
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
              {activeLocation ? (
                <>
                  <span className="font-bold text-primary">{activeLocation.label}:</span>
                  <span className="truncate max-w-[180px] text-muted-foreground">
                    {activeLocation.street}
                  </span>
                </>
              ) : (
                <span className="font-bold text-primary">Set Delivery Address</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <LocationSelectorDialog open={openDialog} onClose={() => setOpenDialog(false)} />
    </>
  );
}
