import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useLocation } from "@/lib/location";
import { getRestaurant, money } from "@/lib/data";
import { cn } from "@/lib/utils";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";
import { AuthDialog } from "@/components/app/auth-dialog";
import {
  ActionBar,
  ActionBarTotal,
  Callout,
  CheckoutProgress,
  ConfirmDialog,
  PageShell,
  Panel,
  SectionLabel,
  StatCell,
  SummaryRow,
} from "@/components/app/checkout-ui";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Kasi Zonke Link" },
      {
        name: "description",
        content:
          "Review your items, apply a promo code, add a tip and see the full price breakdown.",
      },
      { property: "og:title", content: "Your cart — Kasi Zonke Link" },
      {
        property: "og:description",
        content: "Adjust quantities, add coupons and continue to a secure checkout.",
      },
    ],
  }),
  component: CartPage,
});

const tipOptions = [0, 10, 20, 35];

const fulfilmentOptions = [
  { id: "delivery", label: "Delivery", icon: Bike },
  { id: "pickup", label: "Pickup", icon: Store },
] as const;

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
    itemCount,
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
  const needsAddress = mode === "delivery" && !activeLocation;
  const canProceed = needsAddress || canCheckout;
  const totalSavings = comboDiscount + couponDiscount + pointsDiscount;

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
    if (needsAddress) {
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
    <PageShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md md:static">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              aria-label="Back to discover"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary transition-colors hover:bg-secondary/70"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg leading-none font-black tracking-tight">Your cart</h1>
              <p className="label-mono mt-1.5 truncate text-muted-foreground">
                {syncing ? "Loading saved cart…" : restaurant ? restaurant.name : "Empty"}
              </p>
            </div>
          </div>

          {lines.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowClearCartModal(true)}
              className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>

        {lines.length > 0 ? <CheckoutProgress current="cart" className="mt-4" /> : null}
      </header>

      {lines.length === 0 ? (
        <main className="px-4 py-20 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-secondary">
            <ShoppingBag className="size-7 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="mt-5 text-xl font-black tracking-tight">Your cart is empty</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Browse nearby kitchens and your cart will fill up fast.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-7 text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
          >
            Find food
          </Link>
        </main>
      ) : (
        <main className="space-y-5 px-4 pt-5 pb-40">
          {/* Where the cart lives — signed in or guest */}
          {storage === "cloud" && user ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
              <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-xs text-muted-foreground">
                Saved to <span className="font-bold text-foreground">{user.name}</span>'s account —
                it'll still be here next time you sign in.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpenAuthDialog(true)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-colors hover:bg-secondary/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <User className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">Ordering as a guest</span>
                <span className="block text-[11px] text-muted-foreground">
                  Sign in to save your cart and earn points
                </span>
              </span>
              <span className="shrink-0 text-xs font-black text-primary">Sign in</span>
            </button>
          )}

          {/* 1. Delivery or pickup */}
          <section>
            <SectionLabel>Fulfilment</SectionLabel>
            <div
              role="group"
              aria-label="Fulfilment method"
              className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary p-1"
            >
              {fulfilmentOptions.map(({ id, label, icon: Icon }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    aria-pressed={active}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all",
                      active
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-4", active ? "text-primary" : "text-current")}
                      aria-hidden
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Destination and live quote */}
          {mode === "delivery" ? (
            <section className="space-y-2">
              <SectionLabel
                action={
                  activeLocation ? (
                    <button
                      type="button"
                      onClick={() => setOpenLocationDialog(true)}
                      className="cursor-pointer text-xs font-bold text-primary hover:underline"
                    >
                      Change
                    </button>
                  ) : undefined
                }
              >
                Deliver to
              </SectionLabel>

              <Panel className="p-4">
                {activeLocation ? (
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <MapPin className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{activeLocation.label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {activeLocation.street}, {activeLocation.city}
                      </p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenLocationDialog(true)}
                    className="flex w-full cursor-pointer items-start gap-3 text-left"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Plus className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-primary">
                        Add a delivery address
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Needed to confirm your fee and arrival time
                      </span>
                    </span>
                  </button>
                )}

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
                  <StatCell
                    label="Distance"
                    value={quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km` : "—"}
                  />
                  <StatCell
                    label="Delivery fee"
                    value={
                      isOutOfRange ? "Out of range" : quote.fee === 0 ? "Free" : money(quote.fee)
                    }
                    tone={isOutOfRange ? "negative" : quote.fee === 0 ? "positive" : undefined}
                  />
                  <StatCell label="Arrival" value={`~${deliveryEtaMinutes} min`} />
                </dl>
              </Panel>

              {isOutOfRange && quote.distanceKm != null ? (
                <Callout
                  tone="danger"
                  icon={<MapPin className="size-4" aria-hidden />}
                  title={`${quote.distanceKm.toFixed(1)} km is outside this kitchen's range`}
                >
                  They deliver up to {restaurant?.delivery_radius_km ?? 20} km. Switch to pickup or
                  choose a closer address to continue.
                </Callout>
              ) : null}
            </section>
          ) : (
            <section>
              <SectionLabel>Collect from</SectionLabel>
              <Panel className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Store className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {restaurant?.name ?? "Kitchen location"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {restaurant?.address || "Kitchen location"}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
                  <StatCell
                    label="Distance"
                    value={quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km` : "—"}
                  />
                  <StatCell label="Delivery fee" value="None" tone="positive" />
                  <StatCell label="Ready in" value={`~${deliveryEtaMinutes} min`} />
                </dl>
              </Panel>
            </section>
          )}

          {/* 3. The items */}
          <section>
            <SectionLabel
              action={
                restaurant ? (
                  <Link
                    to="/restaurant/$slug"
                    params={{ slug: restaurant.slug }}
                    className="cursor-pointer text-xs font-bold text-primary hover:underline"
                  >
                    Add more
                  </Link>
                ) : undefined
              }
            >
              {itemCount} {itemCount === 1 ? "item" : "items"}
              {restaurant ? ` from ${restaurant.name}` : ""}
            </SectionLabel>

            <Panel>
              <ul className="divide-y divide-border">
                {lines.map((line) => (
                  <li key={line.lineId} className="flex gap-3 p-3.5">
                    <img
                      src={line.image}
                      alt={line.name}
                      width={1024}
                      height={640}
                      loading="lazy"
                      className="size-16 shrink-0 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm leading-tight font-bold">{line.name}</p>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                          {money(line.unitPrice * line.qty)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {line.sizeLabel}
                        {line.extras.length ? ` · ${line.extras.join(", ")}` : ""}
                      </p>
                      {line.removed.length ? (
                        <p className="mt-0.5 text-xs text-destructive">
                          No {line.removed.join(", ")}
                        </p>
                      ) : null}
                      {line.notes ? (
                        <p className="mt-0.5 text-xs text-muted-foreground italic">
                          “{line.notes}”
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center rounded-lg border border-border bg-secondary">
                          <button
                            type="button"
                            onClick={() => setQty(line.lineId, line.qty - 1)}
                            aria-label={`Decrease ${line.name}`}
                            className="grid size-8 cursor-pointer place-items-center rounded-l-lg text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </button>
                          <span className="w-7 text-center font-mono text-sm font-bold tabular-nums">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(line.lineId, line.qty + 1)}
                            aria-label={`Increase ${line.name}`}
                            className="grid size-8 cursor-pointer place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {money(line.unitPrice)} each
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.lineId)}
                            aria-label={`Remove ${line.name}`}
                            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>

          {/* 4. Automatic combo and bundle savings */}
          {comboSavings.length > 0 ? (
            <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                <h2 className="text-xs font-black tracking-wide uppercase">
                  Bundle savings applied
                </h2>
              </div>
              <dl className="mt-2.5 space-y-1.5">
                {comboSavings.map((combo) => (
                  <div
                    key={combo.comboId}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <dt className="min-w-0 truncate text-emerald-800 dark:text-emerald-300">
                      {combo.name}
                      {combo.timesApplied > 1 ? ` ×${combo.timesApplied}` : ""}
                    </dt>
                    <dd className="shrink-0 font-mono font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                      -{money(combo.discount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* 5. Promo code and courier tip */}
          <section>
            <SectionLabel>Savings & extras</SectionLabel>
            <Panel className="divide-y divide-border">
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <Tag className="size-3.5 text-primary" aria-hidden />
                  <h3 className="text-xs font-bold">Promo code</h3>
                </div>

                {couponCode ? (
                  <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-sm font-black text-primary">
                        {couponCode}
                      </span>
                      {couponDiscount > 0 ? (
                        <span className="truncate font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                          -{money(couponDiscount)}
                        </span>
                      ) : isFreeDeliveryCoupon ? (
                        <span className="truncate text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Free delivery
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="shrink-0 cursor-pointer text-[10px] font-black tracking-widest text-muted-foreground uppercase transition-colors hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="mt-2.5">
                    <div className="flex gap-2">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        aria-label="Promo code"
                        placeholder="Enter code"
                        maxLength={20}
                        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3.5 font-mono text-sm uppercase outline-none transition-shadow placeholder:font-sans placeholder:text-xs placeholder:tracking-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        type="submit"
                        disabled={!code.trim()}
                        className="h-11 shrink-0 cursor-pointer rounded-lg bg-foreground px-5 text-[11px] font-black tracking-widest text-background uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Apply
                      </button>
                    </div>
                    {couponReason ? (
                      <p className="mt-1.5 text-xs font-medium text-destructive">{couponReason}</p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Try WELCOME20, KASI50 or FREEDELIVERY.
                      </p>
                    )}
                  </form>
                )}
              </div>

              {mode === "delivery" ? (
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xs font-bold">Tip your courier</h3>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      100% goes to the driver
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Courier tip"
                    className="mt-2.5 grid grid-cols-4 gap-2"
                  >
                    {tipOptions.map((amount) => {
                      const active = tip === amount;
                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setTip(amount)}
                          aria-pressed={active}
                          className={cn(
                            "h-11 cursor-pointer rounded-lg border text-sm font-bold tabular-nums transition-all",
                            active
                              ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                              : "border-border bg-secondary text-foreground hover:border-primary/30",
                          )}
                        >
                          {amount === 0 ? "None" : `R ${amount}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </Panel>
          </section>

          {/* 6. Price breakdown */}
          <section>
            <SectionLabel>Payment summary</SectionLabel>
            <Panel className="p-5">
              <dl className="space-y-2.5">
                <SummaryRow label="Subtotal" value={money(totals.subtotal)} />
                {comboDiscount > 0 ? (
                  <SummaryRow
                    label="Combo & bundle savings"
                    value={`-${money(comboDiscount)}`}
                    positive
                  />
                ) : null}
                {couponCode ? (
                  couponDiscount > 0 ? (
                    <SummaryRow
                      label={`Coupon (${couponCode})`}
                      value={`-${money(couponDiscount)}`}
                      positive
                    />
                  ) : isFreeDeliveryCoupon ? (
                    <SummaryRow label={`Coupon (${couponCode})`} value="Free delivery" positive />
                  ) : null
                ) : null}
                {pointsDiscount > 0 ? (
                  <SummaryRow
                    label="Loyalty points discount"
                    value={`-${money(pointsDiscount)}`}
                    positive
                  />
                ) : null}
                {mode === "delivery" ? (
                  <SummaryRow
                    label="Delivery fee"
                    value={totals.deliveryFee === 0 ? "Free" : money(totals.deliveryFee)}
                    hint={
                      quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km` : undefined
                    }
                    positive={totals.deliveryFee === 0}
                  />
                ) : null}
                <SummaryRow label="Service fee (5%)" value={money(totals.serviceFee)} />
                {totals.tip > 0 ? (
                  <SummaryRow label="Courier tip" value={money(totals.tip)} />
                ) : null}
              </dl>

              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-dashed border-border pt-4">
                <span className="text-xs font-black tracking-[0.18em] text-muted-foreground uppercase">
                  Total
                </span>
                <span className="font-mono text-2xl leading-none font-black tabular-nums">
                  {money(totals.total)}
                </span>
              </div>

              {totalSavings > 0 ? (
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="size-3.5" aria-hidden />
                  You saved {money(totalSavings)} on this order
                </p>
              ) : null}
            </Panel>
          </section>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Secure checkout — you confirm payment on the next step.
          </p>
        </main>
      )}

      {lines.length > 0 ? (
        <ActionBar>
          <ActionBarTotal
            hint={`${itemCount} ${itemCount === 1 ? "item" : "items"} · incl. fees`}
            value={money(totals.total)}
          />
          {canProceed ? (
            <button
              type="button"
              onClick={handleCheckoutClick}
              className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/30 transition-all hover:bg-primary/95 active:scale-[0.99]"
            >
              {user ? "Continue to checkout" : "Sign in & checkout"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="h-14 w-full cursor-not-allowed rounded-2xl border border-border bg-secondary text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              {isOutOfRange ? "Address out of delivery range" : "Checkout unavailable"}
            </button>
          )}
        </ActionBar>
      ) : null}

      <ConfirmDialog
        open={showAddressReminderModal}
        onClose={() => setShowAddressReminderModal(false)}
        onConfirm={() => {
          setShowAddressReminderModal(false);
          setOpenLocationDialog(true);
        }}
        icon={<MapPin className="size-6" aria-hidden />}
        title="Delivery address required"
        description="Add a delivery address before checkout so we can calculate your fee and find the closest kitchen branch."
        cancelLabel="Not now"
        confirmLabel="Add address"
      />

      <ConfirmDialog
        open={showClearCartModal}
        onClose={() => setShowClearCartModal(false)}
        onConfirm={() => {
          clear();
          setShowClearCartModal(false);
          toast.success("Cart cleared");
        }}
        tone="destructive"
        icon={<Trash2 className="size-6" aria-hidden />}
        title="Clear entire cart?"
        description={`This removes all ${lines.length} ${lines.length === 1 ? "item" : "items"} from ${restaurant?.name || "your cart"}. This can't be undone.`}
        cancelLabel="Keep items"
        confirmLabel="Clear cart"
      />

      <AuthDialog
        open={openAuthDialog}
        onClose={() => setOpenAuthDialog(false)}
        onSuccess={() => {
          if (needsAddress) {
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
    </PageShell>
  );
}
