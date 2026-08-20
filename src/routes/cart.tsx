import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Bike,
  Compass,
  Gift,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useLocation } from "@/lib/location";
import { getRestaurant, money } from "@/lib/data";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";
import { AuthDialog } from "@/components/app/auth-dialog";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Hearth" },
      {
        name: "description",
        content:
          "Review your items, apply a promo code, add a tip and see the full price breakdown.",
      },
      { property: "og:title", content: "Your cart — Hearth" },
      {
        property: "og:description",
        content: "Adjust quantities, add coupons and continue to a secure checkout.",
      },
    ],
  }),
  component: CartPage,
});

const tipOptions = [0, 10, 20, 35];

function CartPage() {
  const navigate = useNavigate();
  const {
    lines,
    restaurantSlug,
    setQty,
    removeLine,
    clear,
    mode,
    setMode,
    quote,
    totals,
    comboSavings,
    comboDiscount,
    couponDiscount,
    isFreeDeliveryCoupon,
    pointsDiscount,
    deliveryEtaMinutes,
    canCheckout,
    tip,
    setTip,
    couponCode,
    couponReason,
    applyCoupon,
    removeCoupon,
    syncing,
    storage,
  } = useCart();

  const { user } = useAuth();
  const { activeLocation } = useLocation();
  const [code, setCode] = useState("");
  const [openLocationDialog, setOpenLocationDialog] = useState(false);
  const [openAuthDialog, setOpenAuthDialog] = useState(false);
  const [showAddressReminderModal, setShowAddressReminderModal] = useState(false);
  const [showClearCartModal, setShowClearCartModal] = useState(false);

  const restaurant = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;
  const isOutOfRange = mode === "delivery" && !quote.isWithinRange;

  function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    const res = applyCoupon(code);
    if (res.ok) {
      toast.success(`Coupon ${code.toUpperCase()} applied!`);
      setCode("");
    } else {
      toast.error(res.reason || "Invalid coupon code");
    }
  }

  function handleCheckoutClick() {
    // 1. If in delivery mode and user has no delivery address, show reminder popup
    if (mode === "delivery" && !activeLocation) {
      setShowAddressReminderModal(true);
      return;
    }

    // 2. If guest, ask to login or register
    if (!user) {
      setOpenAuthDialog(true);
      return;
    }

    // 3. Move to checkout
    void navigate({ to: "/checkout" });
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background px-0 sm:max-w-[640px] md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            aria-label="Back to discover"
            className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border cursor-pointer shrink-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg leading-none font-black tracking-tight">Your cart</h1>
            <p className="label-mono mt-1 text-muted-foreground truncate">
              {syncing ? "Loading saved cart…" : restaurant ? restaurant.name : "Empty"}
            </p>
          </div>
        </div>

        {lines.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowClearCartModal(true)}
            className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-secondary cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>Clear</span>
          </button>
        ) : null}
      </header>

      <div className="px-4 pt-4">
        {storage === "cloud" && user ? (
          <p className="rounded-2xl bg-primary/10 px-4 py-3 text-xs font-bold text-primary ring-1 ring-primary/20">
            Saved to {user.name}'s account — sign out and back in and it'll still be here.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setOpenAuthDialog(true)}
            className="flex items-center justify-between w-full rounded-2xl bg-secondary hover:bg-secondary/80 px-4 py-3 text-xs font-bold ring-1 ring-border text-left cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <User className="size-4 text-primary" />
              <span>Ordering as Guest • Sign in or Register to save cart & earn points</span>
            </div>
            <span className="text-primary font-bold">Sign In →</span>
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <main className="px-4 py-16 text-center">
          <p className="text-2xl font-black tracking-tight">Nothing here yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse nearby kitchens and your cart will fill up fast.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase cursor-pointer"
          >
            Find food
          </Link>
        </main>
      ) : (
        <main className="space-y-6 px-4 pt-6 pb-44 md:pb-24">
          {/* 1. How would you like it? (Delivery vs Pickup) */}
          <section className="space-y-2">
            <h2 className="label-mono text-muted-foreground">How would you like it?</h2>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setMode("delivery")}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                  mode === "delivery"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bike className="size-4" />
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setMode("pickup")}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                  mode === "pickup"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="size-4" />
                Pickup
              </button>
            </div>
          </section>

          {/* 2. Selected Delivery Address Card & Live Quote */}
          {mode === "delivery" ? (
            <section className="space-y-2">
              <div className="rounded-2xl bg-secondary/80 p-4 ring-1 ring-border">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground">Deliver to:</span>
                  <button
                    type="button"
                    onClick={() => setOpenLocationDialog(true)}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {activeLocation ? (
                  <div className="mt-1 flex items-start gap-2.5">
                    <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{activeLocation.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {activeLocation.street}, {activeLocation.city}
                      </p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenLocationDialog(true)}
                    className="mt-2 text-xs font-bold text-primary underline cursor-pointer"
                  >
                    Add a delivery address to see fees →
                  </button>
                )}

                {/* Live Distance & Tier Quote Row */}
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Distance</span>
                    <span className="font-bold font-mono">
                      {quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km` : "1.8 km"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Delivery Fee</span>
                    <span
                      className={`font-bold font-mono ${
                        isOutOfRange
                          ? "text-destructive line-through"
                          : quote.fee === 0
                            ? "text-emerald-600 font-black"
                            : "text-foreground"
                      }`}
                    >
                      {isOutOfRange ? "Out of range" : quote.fee === 0 ? "Free" : money(quote.fee)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">
                      Estimated Arrival
                    </span>
                    <span className="font-bold">~{deliveryEtaMinutes} min</span>
                  </div>
                </div>
              </div>

              {/* Out of Range Callout */}
              {isOutOfRange && quote.distanceKm != null ? (
                <div className="rounded-2xl bg-destructive/10 p-4 ring-1 ring-destructive/30 text-xs">
                  <p className="font-bold text-destructive">
                    📍 This address is {quote.distanceKm.toFixed(1)} km away, but this kitchen only
                    delivers up to {restaurant?.delivery_radius_km ?? 20} km.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Choose pickup or switch to a closer delivery location to proceed.
                  </p>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-2xl bg-secondary/80 p-4 ring-1 ring-border text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground">Pickup from kitchen:</span>
                <span className="font-mono text-primary font-bold">
                  {quote.distanceKm != null
                    ? `${quote.distanceKm.toFixed(1)} km away`
                    : "1.8 km away"}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {restaurant?.address || "Kitchen Location"}
              </p>
              <p className="text-muted-foreground">
                Ready for pickup in ~{deliveryEtaMinutes} minutes. No delivery fee charged.
              </p>
            </section>
          )}

          {/* 3. Items List with Kitchen Attribution and Add More Link */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="label-mono text-muted-foreground">
                Items from {restaurant ? restaurant.name : "Kitchen"}
              </h2>
              {restaurant ? (
                <Link
                  to="/restaurant/$slug"
                  params={{ slug: restaurant.slug }}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  + Add more items
                </Link>
              ) : null}
            </div>

            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.lineId}
                  className="flex gap-3 rounded-3xl bg-card p-3 ring-1 ring-border"
                >
                  <img
                    src={line.image}
                    alt={line.name}
                    width={1024}
                    height={640}
                    loading="lazy"
                    className="size-20 shrink-0 rounded-2xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight font-bold">{line.name}</p>
                    <p className="label-mono mt-1 text-muted-foreground">
                      {line.sizeLabel}
                      {line.extras.length ? ` • ${line.extras.join(", ")}` : ""}
                    </p>
                    {line.removed.length ? (
                      <p className="label-mono mt-1 text-destructive">No {line.removed.join(", ")}</p>
                    ) : null}
                    {line.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground italic">“{line.notes}”</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-xl bg-secondary px-1 ring-1 ring-border">
                        <button
                          type="button"
                          onClick={() => setQty(line.lineId, line.qty - 1)}
                          aria-label={`Decrease ${line.name}`}
                          className="grid size-9 place-items-center rounded-lg cursor-pointer"
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </button>
                        <span className="w-5 text-center font-mono text-sm font-bold">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(line.lineId, line.qty + 1)}
                          aria-label={`Increase ${line.name}`}
                          className="grid size-9 place-items-center rounded-lg cursor-pointer"
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold">
                          {money(line.unitPrice * line.qty)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.lineId)}
                          aria-label={`Remove ${line.name}`}
                          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* 4. Active Combo Savings Banner (§8 of Integration Guide) */}
          {comboSavings.length > 0 ? (
            <section className="rounded-2xl bg-emerald-500/10 p-4 border border-emerald-500/25 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-4" />
                <span>Automatic Combo & Bundle Savings Applied</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {comboSavings.map((combo) => (
                  <div
                    key={combo.comboId}
                    className="flex justify-between items-center text-emerald-700 dark:text-emerald-300"
                  >
                    <span>
                      {combo.name} {combo.timesApplied > 1 ? `(×${combo.timesApplied})` : ""}
                    </span>
                    <span className="font-mono font-bold">-{money(combo.discount)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 5. Promo Coupon Code */}
          <section>
            <h2 className="label-mono mb-2 text-muted-foreground">Promo code</h2>
            {couponCode ? (
              <div className="flex h-12 items-center justify-between rounded-2xl bg-primary/10 px-4 ring-1 ring-primary/30">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-primary" />
                  <span className="font-mono text-sm font-bold text-primary">{couponCode}</span>
                  {couponDiscount > 0 ? (
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      (-{money(couponDiscount)})
                    </span>
                  ) : isFreeDeliveryCoupon ? (
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      (Free Delivery)
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-[11px] font-black tracking-widest uppercase cursor-pointer hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="space-y-1">
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    aria-label="Promo code"
                    placeholder="e.g. WELCOME20, HEARTH50, FREEDELIVERY"
                    maxLength={20}
                    className="h-12 flex-1 rounded-2xl bg-secondary px-4 font-mono text-sm uppercase ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="submit"
                    className="h-12 rounded-2xl bg-foreground px-5 text-[11px] font-black tracking-widest text-background uppercase cursor-pointer hover:bg-foreground/90 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                {couponReason ? (
                  <p className="text-xs text-destructive mt-1 font-medium">{couponReason}</p>
                ) : null}
              </form>
            )}
          </section>

          {/* 6. Driver Tip (if delivery) */}
          {mode === "delivery" ? (
            <section>
              <h2 className="label-mono mb-2 text-muted-foreground">Tip your courier</h2>
              <div className="grid grid-cols-4 gap-2">
                {tipOptions.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTip(amount)}
                    aria-pressed={tip === amount}
                    className={`h-12 rounded-2xl text-sm font-bold ring-1 cursor-pointer transition-all ${
                      tip === amount
                        ? "bg-primary text-primary-foreground ring-primary shadow-md shadow-primary/20"
                        : "bg-secondary ring-border hover:bg-secondary/80"
                    }`}
                  >
                    {amount === 0 ? "None" : money(amount)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* 7. Full Tabular Price Breakdown */}
          <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
            <h2 className="label-mono mb-1 text-muted-foreground">Price breakdown</h2>
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {comboDiscount > 0 ? (
              <Row label="Combo & Bundle savings" value={`-${money(comboDiscount)}`} accent />
            ) : null}
            {couponCode ? (
              couponDiscount > 0 ? (
                <Row label={`Coupon (${couponCode})`} value={`-${money(couponDiscount)}`} accent />
              ) : isFreeDeliveryCoupon ? (
                <Row label={`Coupon (${couponCode})`} value="Free Delivery" accent />
              ) : null
            ) : null}
            {pointsDiscount > 0 ? (
              <Row label="Loyalty Points discount" value={`-${money(pointsDiscount)}`} accent />
            ) : null}
            {mode === "delivery" ? (
              <Row
                label="Delivery fee"
                value={totals.deliveryFee === 0 ? "Free" : money(totals.deliveryFee)}
                subtext={
                  quote.distanceKm != null
                    ? `(${quote.distanceKm.toFixed(1)} km distance)`
                    : undefined
                }
              />
            ) : null}
            <Row label="Service fee (5%)" value={money(totals.serviceFee)} />
            {totals.tip > 0 ? <Row label="Courier tip" value={money(totals.tip)} /> : null}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-base font-black tracking-widest uppercase">Total</span>
              <span className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
                {money(totals.total)}
              </span>
            </div>
          </section>
        </main>
      )}

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md md:max-w-2xl border-t border-border bg-background/95 px-4 pt-4 pb-7 backdrop-blur">
          {mode === "delivery" && !activeLocation ? (
            <button
              type="button"
              onClick={handleCheckoutClick}
              className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[0.98] cursor-pointer hover:bg-primary/95"
            >
              <span className="text-sm font-black tracking-[0.1em] uppercase">
                {user ? "Continue to Checkout" : "Sign In & Checkout"}
              </span>
              <span className="font-mono font-bold">{money(totals.total)}</span>
            </button>
          ) : canCheckout ? (
            <button
              type="button"
              onClick={handleCheckoutClick}
              className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[0.98] cursor-pointer hover:bg-primary/95"
            >
              <span className="text-sm font-black tracking-[0.1em] uppercase">
                {user ? "Continue to Checkout" : "Sign In & Checkout"}
              </span>
              <span className="font-mono font-bold">{money(totals.total)}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex h-16 w-full items-center justify-center rounded-3xl bg-secondary text-muted-foreground border border-border text-xs font-bold uppercase tracking-wider cursor-not-allowed opacity-70"
            >
              {isOutOfRange
                ? "Delivery address out of range"
                : "Checkout unavailable"}
            </button>
          )}
        </div>
      ) : null}

      {/* Address Required Popup Message Modal */}
      {showAddressReminderModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-[var(--animate-sheet-up)]">
          <div className="relative w-full max-w-sm rounded-3xl bg-card p-6 border border-border shadow-2xl space-y-4 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary mx-auto ring-1 ring-primary/20">
              <MapPin className="size-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-foreground">Delivery Address Required</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Please add a delivery address before proceeding to checkout so we can calculate
                delivery fees and find your closest kitchen branch.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddressReminderModal(false)}
                className="flex-1 h-11 rounded-xl bg-secondary text-xs font-bold text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddressReminderModal(false);
                  setOpenLocationDialog(true);
                }}
                className="flex-1 h-11 rounded-xl bg-primary text-xs font-black uppercase tracking-wider text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {showClearCartModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-[var(--animate-sheet-up)]">
          <div className="relative w-full max-w-sm rounded-3xl bg-card p-6 border border-border shadow-2xl space-y-4 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive mx-auto ring-1 ring-destructive/20">
              <Trash2 className="size-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-foreground">Clear entire cart?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to remove all {lines.length}{" "}
                {lines.length === 1 ? "item" : "items"} from {restaurant?.name || "your cart"}?
                This action cannot be undone.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowClearCartModal(false)}
                className="flex-1 h-11 rounded-xl bg-secondary text-xs font-bold text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
              >
                Keep Items
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  setShowClearCartModal(false);
                  toast.success("Cart cleared");
                }}
                className="flex-1 h-11 rounded-xl bg-destructive text-xs font-black uppercase tracking-wider text-destructive-foreground shadow-md hover:bg-destructive/90 transition-all cursor-pointer"
              >
                Clear Cart
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthDialog
        open={openAuthDialog}
        onClose={() => setOpenAuthDialog(false)}
        onSuccess={() => {
          if (mode === "delivery" && !activeLocation) {
            setShowAddressReminderModal(true);
            return;
          }
          void navigate({ to: "/checkout" });
        }}
        title="Sign In to Checkout"
        description="Please sign in or create an account to proceed to checkout and track your delivery live."
      />

      <LocationSelectorDialog
        open={openLocationDialog}
        onClose={() => setOpenLocationDialog(false)}
      />
    </div>
  );
}

function Row({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext?: string | undefined;
  accent?: boolean | undefined;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {label}
        {subtext ? <span className="text-[10px] text-muted-foreground/80">{subtext}</span> : null}
      </span>
      <span
        className={`font-mono font-bold ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
