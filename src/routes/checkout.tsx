import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Gift,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Sparkles,
  Store,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money, type PaymentMethod, type DeliveryAddress } from "@/lib/data";
import { useLocation } from "@/lib/location";
import { useRestaurantPaymentConfig } from "@/lib/firebase-adapters";
import { cn } from "@/lib/utils";
import { AuthDialog } from "@/components/app/auth-dialog";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";
import {
  ActionBar,
  ActionBarTotal,
  Callout,
  CheckoutProgress,
  CopyRow,
  PageShell,
  Panel,
  SectionLabel,
  StatCell,
  StepLabel,
  SummaryRow,
} from "@/components/app/checkout-ui";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Hearth" },
      {
        name: "description",
        content: "Confirm your delivery address, choose a payment method and place your order.",
      },
      { property: "og:title", content: "Checkout — Hearth" },
      {
        property: "og:description",
        content: "Delivery or pickup, saved cards, wallet or cash — checkout in a couple of taps.",
      },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const {
    lines,
    restaurant,
    restaurantSlug,
    selectedBranch,
    branchSelectionResult,
    mode,
    quote,
    totals,
    comboDiscount,
    couponDiscount,
    isFreeDeliveryCoupon,
    pointsDiscount,
    wantsToRedeemPoints,
    setWantsToRedeemPoints,
    pointsEarningsPreview,
    customerWallet,
    couponCode,
    deliveryEtaMinutes,
    canCheckout,
    placeOrder,
  } = useCart();

  const { user } = useAuth();
  const { activeLocation, gpsCoordinates } = useLocation();
  const deliveryLocation = useMemo(() => {
    if (activeLocation && activeLocation.latitude != null && activeLocation.longitude != null) {
      return activeLocation;
    }
    if (gpsCoordinates && gpsCoordinates.latitude != null && gpsCoordinates.longitude != null) {
      return {
        label: "Current GPS Position",
        street: `GPS Fix (${gpsCoordinates.latitude.toFixed(4)}, ${gpsCoordinates.longitude.toFixed(4)})`,
        city: "",
        postal_code: "",
        latitude: gpsCoordinates.latitude,
        longitude: gpsCoordinates.longitude,
        notes: null,
      };
    }
    return null;
  }, [activeLocation, gpsCoordinates]);

  const [paymentId, setPaymentId] = useState<PaymentMethod>("card");
  const [instructions, setInstructions] = useState("");
  const [kitchenNotes, setKitchenNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [openAuthModal, setOpenAuthModal] = useState(false);
  const [openLocationDialog, setOpenLocationDialog] = useState(false);

  // EFT Proof Attachment State
  const [eftProofName, setEftProofName] = useState("");
  const [eftProofUrl, setEftProofUrl] = useState("");

  // Live Restaurant Payment Configuration (§3.6)
  const targetRestaurantId = restaurant?.id || restaurantSlug || "rst_5jqj45emntl";
  const { paymentConfig, loading: paymentConfigLoading } =
    useRestaurantPaymentConfig(targetRestaurantId);

  // Filter payment methods based on per-restaurant configuration and order fulfillment mode (§3.6)
  const availablePaymentMethods = useMemo(() => {
    const list: Array<{
      id: PaymentMethod;
      label: string;
      sublabel?: string;
      instructions?: string | null;
      badge?: string;
      icon: React.ComponentType<{ className?: string }>;
    }> = [];

    const methods = paymentConfig?.methods;

    // 1. Card is available for both delivery & pickup (fallback or when enabled)
    const cardEnabled = !methods || methods.card === undefined || methods.card.enabled !== false;
    if (cardEnabled) {
      list.push({
        id: "card",
        label: "Card payment",
        sublabel: "Visa •••• 4242 · instant secure payment",
        instructions: methods?.card?.instructions ?? null,
        badge: "Instant",
        icon: CreditCard,
      });
    }

    // 2. Cash on delivery is delivery ONLY (§3.6)
    if (mode === "delivery" && methods?.cash_on_delivery?.enabled === true) {
      list.push({
        id: "cash_on_delivery",
        label: "Cash on delivery",
        sublabel: "Pay the courier when they arrive",
        instructions:
          methods.cash_on_delivery.instructions ?? "Please have exact change ready for driver.",
        badge: "Cash",
        icon: Banknote,
      });
    }

    // 3. Cash on pickup is pickup ONLY (§3.6)
    if (mode === "pickup" && methods?.cash_on_pickup?.enabled === true) {
      list.push({
        id: "cash_on_pickup",
        label: "Cash on pickup",
        sublabel: "Pay at the counter when collecting",
        instructions:
          methods.cash_on_pickup.instructions ?? "Please have exact change ready at the counter.",
        badge: "Cash",
        icon: Banknote,
      });
    }

    // 4. EFT is available for both delivery & pickup (§3.6)
    if (methods?.eft?.enabled === true) {
      list.push({
        id: "eft",
        label: "Direct EFT / bank transfer",
        sublabel: "Upload your proof of payment",
        instructions: methods.eft.instructions ?? "Use your order number as the payment reference.",
        badge: "EFT",
        icon: Building2,
      });
    }

    // Fallback: If no methods enabled for this mode, ALWAYS fall back to Card payment (§3.6)
    if (list.length === 0) {
      list.push({
        id: "card",
        label: "Card payment",
        sublabel: "Visa •••• 4242 · instant secure payment",
        instructions: null,
        badge: "Instant",
        icon: CreditCard,
      });
    }

    return list;
  }, [paymentConfig, mode]);

  // Keep paymentId synchronized whenever mode or available methods change
  useEffect(() => {
    if (!availablePaymentMethods.some((m) => m.id === paymentId) && availablePaymentMethods[0]) {
      setPaymentId(availablePaymentMethods[0].id);
    }
  }, [availablePaymentMethods, paymentId]);

  if (lines.length === 0) {
    return (
      <PageShell>
        <div className="px-4 py-20 text-center">
          <h1 className="text-xl font-black tracking-tight">Your cart is empty</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Add a few dishes and come back to complete your order.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-7 text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
          >
            Find food
          </Link>
        </div>
      </PageShell>
    );
  }

  const isOutOfRange = mode === "delivery" && !quote.isWithinRange;
  const totalSavings = comboDiscount + couponDiscount + pointsDiscount;
  const needsAddress = mode === "delivery" && !deliveryLocation;

  async function submit() {
    if (placing || (!canCheckout && mode === "delivery")) return;

    if (mode === "delivery" && !deliveryLocation) {
      toast.error("Please add at least one delivery address to place your order.");
      setOpenLocationDialog(true);
      return;
    }

    if (!user) {
      setOpenAuthModal(true);
      toast.info("Please sign in or register to place your order.");
      return;
    }

    setPlacing(true);
    try {
      const combinedNotes =
        [instructions.trim(), kitchenNotes.trim()].filter(Boolean).join(" | ") || undefined;

      let deliveryAddress: DeliveryAddress | null = null;

      if (mode === "delivery") {
        if (deliveryLocation) {
          deliveryAddress = {
            label: deliveryLocation.label,
            street: deliveryLocation.street,
            city: deliveryLocation.city,
            postal_code: deliveryLocation.postal_code,
            latitude: deliveryLocation.latitude,
            longitude: deliveryLocation.longitude,
            notes: instructions.trim() || deliveryLocation.notes || null,
          };
        }
      }

      const finalProofUrl =
        paymentId === "eft"
          ? eftProofUrl || `https://storage.hearth.app/proofs/pop_${Date.now()}.pdf`
          : null;

      const isCard = paymentId === "card";

      const orderId = await placeOrder({
        address: deliveryAddress ?? (restaurant?.address || "Pickup at restaurant"),
        mode,
        paymentMethod: paymentId,
        specialInstructions: combinedNotes || undefined,
        paymentProofUrl: finalProofUrl,
        paymentGateway: isCard ? "demo-gateway" : null,
        paymentReference: isCard
          ? `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
          : null,
        cardBrand: isCard ? "Visa" : null,
        cardLast4: isCard ? "4242" : null,
      });

      toast.success("Order placed successfully!", { description: `Order reference: ${orderId}` });
      await navigate({ to: "/orders/$orderId", params: { orderId } });
    } catch (error) {
      console.error("Order placement failed:", error);
      const message = (error as { message?: string } | null)?.message;
      toast.error(message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md md:static">
        <div className="flex items-center gap-3">
          <Link
            to="/cart"
            aria-label="Back to cart"
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary transition-colors hover:bg-secondary/70"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-none font-black tracking-tight">Checkout</h1>
            <p className="label-mono mt-1.5 truncate text-muted-foreground">
              {restaurant?.name ?? "Kitchen"}
            </p>
          </div>
        </div>

        <CheckoutProgress current="checkout" className="mt-4" />
      </header>

      <main className="space-y-5 px-4 pt-5 pb-40">
        {/* 01 — Who the order is for */}
        <section>
          <StepLabel step="01" title="Contact details" />
          <Panel className="p-4">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-black text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{user.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.email} · {user.phone}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Signed in
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Lock className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Ordering as a guest</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sign in or create an account to place this order and earn loyalty points.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenAuthModal(true)}
                  className="h-11 w-full cursor-pointer rounded-xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90"
                >
                  Sign in or register
                </button>
              </div>
            )}
          </Panel>
        </section>

        {/* 02 — Where it's going */}
        <section>
          <StepLabel
            step="02"
            title={mode === "delivery" ? "Delivery details" : "Pickup details"}
            action={
              <Link
                to="/cart"
                className="shrink-0 cursor-pointer text-xs font-bold text-primary hover:underline"
              >
                Edit in cart
              </Link>
            }
          />

          {mode === "delivery" ? (
            <Panel className="divide-y divide-border">
              <div className="space-y-3 p-4">
                {deliveryLocation ? (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <MapPin className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{deliveryLocation.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {deliveryLocation.street}, {deliveryLocation.city}{" "}
                          {deliveryLocation.postal_code || ""}
                        </p>
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3.5">
                      <StatCell
                        label="Distance"
                        value={quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km` : "—"}
                      />
                      <StatCell
                        label="Delivery fee"
                        value={totals.deliveryFee === 0 ? "Free" : money(totals.deliveryFee)}
                        tone={totals.deliveryFee === 0 ? "positive" : undefined}
                      />
                      <StatCell label="Arrival" value={`~${deliveryEtaMinutes} min`} />
                    </dl>

                    {selectedBranch ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Store className="size-3.5 shrink-0" aria-hidden />
                        Fulfilled by {selectedBranch.name}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Callout
                    tone="warning"
                    icon={<MapPin className="size-4" aria-hidden />}
                    title="No delivery address yet"
                    action={
                      <button
                        type="button"
                        onClick={() => setOpenLocationDialog(true)}
                        className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90"
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add delivery address
                      </button>
                    }
                  >
                    Add an address so we can calculate live fees and complete your order.
                  </Callout>
                )}

                {isOutOfRange ? (
                  <Callout
                    tone="danger"
                    icon={<MapPin className="size-4" aria-hidden />}
                    title="Outside the delivery range"
                  >
                    {!branchSelectionResult?.ok && branchSelectionResult?.message
                      ? `${branchSelectionResult.message} `
                      : ""}
                    {quote.distanceKm != null
                      ? `This address is ${quote.distanceKm.toFixed(1)} km away. `
                      : ""}
                    Switch to pickup in your cart or choose a closer address.
                  </Callout>
                ) : null}
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <label htmlFor="instructions" className="text-xs font-bold">
                    Delivery instructions{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {instructions.length}/200
                  </span>
                </div>
                <textarea
                  id="instructions"
                  rows={2}
                  maxLength={200}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Gate code, buzzer, which entrance to use…"
                  className="w-full resize-none rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </Panel>
          ) : (
            <Panel className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Store className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {restaurant?.name ?? "Restaurant location"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {restaurant?.address ?? "Restaurant Location, Johannesburg"}
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
                <StatCell label="Method" value="Pickup" />
                <StatCell label="Delivery fee" value="None" tone="positive" />
                <StatCell label="Ready in" value={`~${deliveryEtaMinutes} min`} />
              </dl>
            </Panel>
          )}
        </section>

        {/* Loyalty — redemption and earnings (§4 & §6 of Integration Guide) */}
        {customerWallet.balance >= 200 || pointsEarningsPreview > 0 ? (
          <section>
            <SectionLabel>Loyalty</SectionLabel>
            <Panel className="divide-y divide-border">
              {customerWallet.balance >= 200 ? (
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Gift className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold">Redeem loyalty points</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {customerWallet.balance} points available
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <span className="sr-only">Redeem 200 loyalty points</span>
                      <input
                        type="checkbox"
                        checked={wantsToRedeemPoints}
                        onChange={(e) => setWantsToRedeemPoints(e.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-border transition-colors after:absolute after:top-[2px] after:left-[2px] after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
                    </label>
                  </div>

                  {wantsToRedeemPoints ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <span>200 pts redeemed — 15% off your subtotal</span>
                      <span className="shrink-0 font-mono tabular-nums">
                        -{money(pointsDiscount)}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Redeem 200 points for 15% off your order subtotal.
                    </p>
                  )}
                </div>
              ) : null}

              {pointsEarningsPreview > 0 ? (
                <div className="flex items-center justify-between gap-3 p-4">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
                    <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                    Points you'll earn
                  </span>
                  <span className="shrink-0 font-mono text-xs font-black text-primary tabular-nums">
                    +{pointsEarningsPreview} pts
                  </span>
                </div>
              ) : null}
            </Panel>
          </section>
        ) : null}

        {/* 03 — Payment (§3.6 — Real-time Synchronized with Firebase RTDB) */}
        <section>
          <StepLabel
            step="03"
            title="Payment method"
            action={
              paymentConfigLoading ? (
                <span className="shrink-0 animate-pulse text-[10px] text-muted-foreground">
                  Syncing…
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  Live
                </span>
              )
            }
          />

          <fieldset className="space-y-2">
            <legend className="sr-only">Payment method</legend>

            {availablePaymentMethods.map(
              ({ id, label, sublabel, instructions: methodInstructions, badge, icon: Icon }) => {
                const isSelected = paymentId === id;
                return (
                  <label
                    key={id}
                    className={cn(
                      "block cursor-pointer rounded-2xl border p-4 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
                      isSelected
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-border bg-card shadow-sm hover:border-primary/25",
                    )}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={id}
                      checked={isSelected}
                      onChange={() => setPaymentId(id)}
                      className="sr-only"
                    />

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-secondary text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{label}</span>
                          {badge ? (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider uppercase",
                                isSelected
                                  ? "bg-primary/15 text-primary"
                                  : "bg-secondary text-muted-foreground",
                              )}
                            >
                              {badge}
                            </span>
                          ) : null}
                        </span>
                        {sublabel ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {sublabel}
                          </span>
                        ) : null}
                      </span>

                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border transition-all",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30",
                        )}
                      >
                        {isSelected ? <CheckCircle2 className="size-3.5" aria-hidden /> : null}
                      </span>
                    </div>

                    {methodInstructions ? (
                      <p className="mt-2.5 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        {methodInstructions}
                      </p>
                    ) : null}
                  </label>
                );
              },
            )}
          </fieldset>

          {/* EFT Bank Transfer Details & Proof Upload (§3.6 & §3.8) */}
          {paymentId === "eft" ? (
            <Panel className="mt-3 p-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-xs font-bold">Bank transfer details</h3>
              </div>

              <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-secondary/50 px-3 py-1">
                <CopyRow label="Bank" value="Standard Bank South Africa" />
                <CopyRow label="Account name" value="Hearth Kitchens (Pty) Ltd" />
                <CopyRow label="Account no." value="6289 1234 5678" />
                <CopyRow label="Branch code" value="250655" />
                <CopyRow label="Amount" value={money(totals.total)} />
                <CopyRow label="Reference" value={`FF-ORDER / ${user?.name || "Customer"}`} />
              </div>

              <div className="mt-4">
                <label className="label-mono block text-muted-foreground">
                  Proof of payment (required)
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/50 px-3.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                    <Upload className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {eftProofName || "Choose receipt or screenshot"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEftProofName(file.name);
                          setEftProofUrl(
                            `https://storage.hearth.app/proofs/${Date.now()}_${file.name}`,
                          );
                          toast.success(`Attached proof of payment: ${file.name}`);
                        }
                      }}
                    />
                  </label>
                  {eftProofName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEftProofName("");
                        setEftProofUrl("");
                      }}
                      aria-label="Remove attached proof of payment"
                      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>

                {eftProofName ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">Attached: {eftProofName}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Staff verify your transfer in the console before the kitchen starts.
                  </p>
                )}
              </div>
            </Panel>
          ) : null}
        </section>

        {/* 04 — Review */}
        <section>
          <StepLabel step="04" title="Review your order" />

          <Panel className="divide-y divide-border">
            <ul className="divide-y divide-border">
              {lines.map((line) => (
                <li key={line.lineId} className="flex items-center gap-3 p-3.5">
                  <img
                    src={line.image}
                    alt=""
                    width={1024}
                    height={640}
                    loading="lazy"
                    className="size-11 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      <span className="font-mono tabular-nums">{line.qty}×</span> {line.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {line.sizeLabel}
                      {line.extras.length ? ` · ${line.extras.join(", ")}` : ""}
                      {line.notes ? ` · “${line.notes}”` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                    {money(line.unitPrice * line.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label
                  htmlFor="kitchen-notes"
                  className="flex items-center gap-1.5 text-xs font-bold"
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  Notes for the kitchen{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {kitchenNotes.length}/200
                </span>
              </div>
              <textarea
                id="kitchen-notes"
                rows={2}
                maxLength={200}
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                placeholder="Allergies, extra serviettes, cutlery…"
                className="w-full resize-none rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="p-5">
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
            </div>
          </Panel>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Payments are processed securely. You can track your order right after placing it.
        </p>
      </main>

      <ActionBar>
        <ActionBarTotal
          hint={
            mode === "delivery"
              ? `Total · arrives in ~${deliveryEtaMinutes} min`
              : `Total · ready in ~${deliveryEtaMinutes} min`
          }
          value={money(totals.total)}
        />

        {needsAddress ? (
          <button
            type="button"
            onClick={() => setOpenLocationDialog(true)}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90"
          >
            <MapPin className="size-4" aria-hidden />
            Add delivery address to continue
          </button>
        ) : canCheckout ? (
          <button
            type="button"
            onClick={submit}
            disabled={placing}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/30 transition-all hover:bg-primary/95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {placing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Placing order…
              </>
            ) : (
              <>
                <Lock className="size-4" aria-hidden />
                {user ? "Place order" : "Sign in to place order"}
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="h-14 w-full cursor-not-allowed rounded-2xl border border-border bg-secondary text-xs font-bold tracking-wider text-muted-foreground uppercase"
          >
            {isOutOfRange ? "Address out of delivery range" : "Cannot place order"}
          </button>
        )}
      </ActionBar>

      <AuthDialog
        open={openAuthModal}
        onClose={() => setOpenAuthModal(false)}
        title="Sign In to Place Order"
        description="Please sign in or create an account to finalize your order and earn loyalty rewards."
      />

      <LocationSelectorDialog
        open={openLocationDialog}
        onClose={() => setOpenLocationDialog(false)}
      />
    </PageShell>
  );
}
