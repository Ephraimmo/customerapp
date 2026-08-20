import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Bike,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Gift,
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
import { AuthDialog } from "@/components/app/auth-dialog";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";

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
  const { activeLocation } = useLocation();

  const [paymentId, setPaymentId] = useState<PaymentMethod>("card");
  const [instructions, setInstructions] = useState("");
  const [kitchenNotes, setKitchenNotes] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [placing, setPlacing] = useState(false);
  const [openAuthModal, setOpenAuthModal] = useState(false);
  const [openLocationDialog, setOpenLocationDialog] = useState(false);

  // EFT Proof Attachment State
  const [eftProofFile, setEftProofFile] = useState<File | null>(null);
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
        sublabel: "Visa •••• 4242 (Instant secure payment)",
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
        sublabel: "Pay cash to courier upon arrival",
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
        sublabel: "Pay at counter when collecting food",
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
        label: "Direct EFT / Bank Transfer",
        sublabel: "Upload proof of payment file",
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
        sublabel: "Visa •••• 4242 (Instant secure payment)",
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
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-black tracking-tight">Your cart is empty</h1>
        <Link
          to="/"
          className="mt-6 inline-flex h-14 items-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
        >
          Find food
        </Link>
      </div>
    );
  }

  const isOutOfRange = mode === "delivery" && !quote.isWithinRange;

  async function submit() {
    if (placing || (!canCheckout && mode === "delivery")) return;

    if (mode === "delivery" && !activeLocation) {
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
        if (activeLocation) {
          deliveryAddress = {
            label: activeLocation.label,
            street: activeLocation.street,
            city: activeLocation.city,
            postal_code: activeLocation.postal_code,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            notes: instructions.trim() || activeLocation.notes || null,
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
    } catch (error: any) {
      console.error("Order placement failed:", error);
      toast.error(error?.message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <Link
          to="/cart"
          aria-label="Back to cart"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border cursor-pointer"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">Checkout</h1>
          <p className="label-mono mt-1 text-muted-foreground">{restaurant?.name ?? "Kitchen"}</p>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-6 pb-44 md:pb-24">
        {/* Customer Information */}
        <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border">
          {user ? (
            <>
              <span className="label-mono text-muted-foreground">Ordering as</span>
              <p className="mt-1 text-sm font-bold">{user.name}</p>
              <p className="label-mono mt-1 text-muted-foreground">
                {user.email} • {user.phone}
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="label-mono text-muted-foreground font-bold">Guest customer</span>
                  <p className="text-xs text-foreground font-bold mt-0.5">Please sign in or register to place order</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenAuthModal(true)}
                  className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
                >
                  Sign in / Register →
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your cart and order details are ready. Sign in or create an account to finalize and earn rewards.
              </p>
            </div>
          )}
        </section>

        {/* Fulfillment & Destination Summary Card */}
        {mode === "delivery" ? (
          <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bike className="size-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground">Delivery to Address</span>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {quote.distanceKm != null ? `${quote.distanceKm.toFixed(1)} km away` : "— km"} •
                    ~{deliveryEtaMinutes} min arrival
                  </p>
                </div>
              </div>

              <Link
                to="/cart"
                className="text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                Change in cart
              </Link>
            </div>

            {activeLocation ? (
              <div className="rounded-xl bg-background/80 p-3 ring-1 ring-border/80 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <MapPin className="size-3.5 text-primary shrink-0" />
                    <span>{activeLocation.label}</span>
                  </div>
                  {selectedBranch ? (
                    <span className="rounded bg-secondary px-2 py-0.5 text-[9px] font-bold text-muted-foreground border border-border">
                      Fulfilling: {selectedBranch.name}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground pl-5 text-[11px]">
                  {activeLocation.street}, {activeLocation.city} {activeLocation.postal_code || ""}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-500/10 p-4 border border-amber-500/30 text-xs space-y-2 text-amber-900 dark:text-amber-300">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-700 dark:text-amber-400">
                  <MapPin className="size-4" />
                  <span>No Delivery Address Found</span>
                </div>
                <p className="text-muted-foreground leading-snug">
                  Please add at least one delivery address to calculate live fees and complete your order.
                </p>
                <button
                  type="button"
                  onClick={() => setOpenLocationDialog(true)}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  Add Delivery Address
                </button>
              </div>
            )}

            {/* Out of Range Notice */}
            {isOutOfRange ? (
              <div className="rounded-xl bg-destructive/10 p-3 ring-1 ring-destructive/30 text-xs">
                <p className="font-bold text-destructive">
                  📍{" "}
                  {!branchSelectionResult?.ok ? branchSelectionResult?.message : ""}
                  {quote.distanceKm
                    ? ` This address is ${quote.distanceKm.toFixed(1)} km away, which is outside the delivery radius.`
                    : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Switch to Pickup on the cart page or choose a closer address to continue.
                </p>
              </div>
            ) : null}

            {/* Optional Delivery Instructions */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="instructions" className="label-mono block text-muted-foreground">
                  Delivery instructions{" "}
                  <span className="text-xs opacity-70 font-normal">(Optional)</span>
                </label>
                <span className="text-[11px] text-muted-foreground">{instructions.length}/200</span>
              </div>
              <textarea
                id="instructions"
                rows={2}
                maxLength={200}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Leave at front reception, gate code #4421, ring the blue buzzer..."
                className="w-full resize-none rounded-xl bg-background px-3.5 py-2.5 text-xs ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Store className="size-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground">Customer Pickup</span>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Ready for collection in ~{deliveryEtaMinutes} min
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary border border-primary/20">
                Pickup
              </span>
            </div>

            <div className="rounded-xl bg-background/80 p-3 ring-1 ring-border/80 text-xs space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <MapPin className="size-3.5 text-primary shrink-0" />
                <span>{restaurant?.name ?? "Restaurant Location"}</span>
              </div>
              <p className="text-muted-foreground pl-5 text-[11px]">
                {restaurant?.address ?? "Restaurant Location, Johannesburg"}
              </p>
            </div>
          </section>
        )}

        {/* Loyalty Points Redemption Toggle (§4 of Integration Guide) */}
        {customerWallet.balance >= 200 ? (
          <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="size-4 text-primary" />
                <div>
                  <span className="text-xs font-bold text-foreground">Redeem Loyalty Points</span>
                  <p className="text-[10px] text-muted-foreground">
                    You have {customerWallet.balance} points available
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsToRedeemPoints}
                  onChange={(e) => setWantsToRedeemPoints(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>

            {wantsToRedeemPoints ? (
              <div className="mt-2 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-xs flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-medium">
                <span>Redeemed 200 pts for 15% discount</span>
                <span className="font-mono font-bold">-{money(pointsDiscount)}</span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Toggle to redeem 200 points for a 15% discount off your order subtotal.
              </p>
            )}
          </section>
        ) : null}

        {/* Points Earnings Preview (§6 of Integration Guide) */}
        {pointsEarningsPreview > 0 ? (
          <div className="rounded-2xl bg-primary/10 px-4 py-3 border border-primary/20 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-primary font-bold">
              <Sparkles className="size-4" />
              Loyalty Points Rewards
            </span>
            <span className="font-mono font-bold text-primary">
              +You'll earn ~{pointsEarningsPreview} pts on delivery
            </span>
          </div>
        ) : null}

        {/* Optional Kitchen Notes */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="kitchen-notes"
              className="label-mono flex items-center gap-1.5 text-muted-foreground"
            >
              <FileText className="size-3.5" />
              Kitchen notes / Special requests{" "}
              <span className="text-xs opacity-70 font-normal">(Optional)</span>
            </label>
            <span className="text-[11px] text-muted-foreground">{kitchenNotes.length}/200</span>
          </div>
          <textarea
            id="kitchen-notes"
            rows={2}
            maxLength={200}
            value={kitchenNotes}
            onChange={(e) => setKitchenNotes(e.target.value)}
            placeholder="e.g. Please include extra serviettes and wooden cutlery, allergy notice..."
            className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/30"
          />
        </section>

        {/* Payment Methods (§3.6 — Real-time Synchronized with Firebase RTDB) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="label-mono text-muted-foreground">Payment method</h2>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            {paymentConfigLoading ? (
              <span className="text-[10px] text-muted-foreground animate-pulse">Syncing…</span>
            ) : null}
          </div>

          <div className="space-y-2">
            {availablePaymentMethods.map(
              ({ id, label, sublabel, instructions, badge, icon: Icon }) => {
                const isSelected = paymentId === id;
                return (
                  <div
                    key={id}
                    onClick={() => setPaymentId(id)}
                    className={`rounded-2xl p-4 ring-1 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-primary/10 ring-primary/40 shadow-sm"
                        : "bg-secondary ring-border hover:bg-secondary/80"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`grid size-9 place-items-center rounded-xl shrink-0 ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground ring-1 ring-border"
                          }`}
                        >
                          <Icon className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground truncate">{label}</p>
                            {badge ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                  isSelected
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {badge}
                              </span>
                            ) : null}
                          </div>
                          {sublabel ? (
                            <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className={`grid size-5 place-items-center rounded-full border transition-all shrink-0 ml-2 ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 bg-transparent"
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="size-3.5" /> : null}
                      </div>
                    </div>

                    {/* Method Instructions (when set by portal §3.6) */}
                    {instructions ? (
                      <div className="mt-2.5 rounded-xl bg-background/80 px-3 py-2 text-[11px] text-muted-foreground border border-border/60 flex items-start gap-1.5">
                        <span className="text-primary font-bold">ℹ</span>
                        <span>{instructions}</span>
                      </div>
                    ) : null}
                  </div>
                );
              },
            )}
          </div>

          {/* EFT Bank Transfer Details & Proof Upload (§3.6 & §3.8) */}
          {paymentId === "eft" ? (
            <div className="rounded-2xl bg-secondary/80 p-4 ring-1 ring-border space-y-3 text-xs">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <Building2 className="size-4 text-primary" />
                <span>Standard Bank Transfer Details</span>
              </div>
              <div className="bg-background p-3 rounded-xl space-y-1 font-mono text-[11px] border border-border/80">
                <p>
                  <span className="text-muted-foreground">Bank:</span> Standard Bank South Africa
                </p>
                <p>
                  <span className="text-muted-foreground">Account Name:</span> Hearth Kitchens (Pty)
                  Ltd
                </p>
                <p>
                  <span className="text-muted-foreground">Account Number:</span> 6289 1234 5678
                </p>
                <p>
                  <span className="text-muted-foreground">Branch Code:</span> 250655
                </p>
                <p>
                  <span className="text-muted-foreground">Transfer Amount:</span>{" "}
                  <span className="font-bold text-primary">{money(totals.total)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Reference:</span>{" "}
                  <span className="font-bold text-foreground">
                    FF-ORDER / {user?.name || "Customer"}
                  </span>
                </p>
              </div>

              {/* Proof of Payment Upload */}
              <div className="space-y-1.5">
                <label className="label-mono block text-muted-foreground font-bold">
                  Attach Proof of Payment (Image / PDF) *
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 h-11 px-3.5 rounded-xl bg-background border border-dashed border-border hover:border-primary text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                    <Upload className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {eftProofName || "Choose POP Receipt / Screenshot"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEftProofFile(file);
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
                        setEftProofFile(null);
                        setEftProofName("");
                        setEftProofUrl("");
                      }}
                      className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                {!eftProofName ? (
                  <p className="text-[10px] text-muted-foreground">
                    * Proof of payment file is required for EFT orders. Staff will verify your
                    transfer in the console.
                  </p>
                ) : (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Proof attached: {eftProofName}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* Order Summary with Live Delivery Fee and Discounts */}
        <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
          <h2 className="label-mono mb-2 text-muted-foreground">Order summary</h2>
          {lines.map((l) => (
            <div key={l.lineId} className="flex justify-between text-sm py-1">
              <div>
                <span className="font-bold text-foreground">
                  {l.qty}× {l.name}
                </span>
                {l.notes ? (
                  <span className="block text-xs italic text-muted-foreground">"{l.notes}"</span>
                ) : null}
              </div>
              <span className="font-mono font-bold">{money(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <SummaryRow label="Subtotal" value={money(totals.subtotal)} />
            {comboDiscount > 0 ? (
              <SummaryRow
                label="Combo & Bundle savings"
                value={`-${money(comboDiscount)}`}
                accent
              />
            ) : null}
            {couponCode ? (
              couponDiscount > 0 ? (
                <SummaryRow
                  label={`Coupon discount (${couponCode})`}
                  value={`-${money(couponDiscount)}`}
                  accent
                />
              ) : isFreeDeliveryCoupon ? (
                <SummaryRow
                  label={`Coupon discount (${couponCode})`}
                  value="Free Delivery"
                  accent
                />
              ) : null
            ) : null}
            {pointsDiscount > 0 ? (
              <SummaryRow
                label="Loyalty Points discount"
                value={`-${money(pointsDiscount)}`}
                accent
              />
            ) : null}
            {mode === "delivery" ? (
              <SummaryRow
                label="Delivery fee"
                value={totals.deliveryFee === 0 ? "Free" : money(totals.deliveryFee)}
                subtext={
                  quote.distanceKm != null ? `(${quote.distanceKm.toFixed(1)} km)` : undefined
                }
              />
            ) : null}
            <SummaryRow label="Service fee (5%)" value={money(totals.serviceFee)} />
            {totals.tip > 0 ? <SummaryRow label="Driver tip" value={money(totals.tip)} /> : null}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-black tracking-widest uppercase">Total</span>
            <span className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
              {money(totals.total)}
            </span>
          </div>
          <p className="label-mono mt-3 text-muted-foreground">
            Estimated arrival: ~{deliveryEtaMinutes} minutes
          </p>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md md:max-w-2xl border-t border-border bg-background/95 px-4 pt-4 pb-7 backdrop-blur">
        {mode === "delivery" && !activeLocation ? (
          <button
            type="button"
            onClick={() => setOpenLocationDialog(true)}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-3xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider shadow-2xl hover:bg-primary/90 transition-all cursor-pointer"
          >
            <MapPin className="size-4" />
            <span>Add Delivery Address to Continue</span>
          </button>
        ) : canCheckout ? (
          <button
            type="button"
            onClick={submit}
            disabled={placing}
            className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[0.98] disabled:opacity-60 cursor-pointer hover:bg-primary/95"
          >
            <span className="text-sm font-black tracking-[0.1em] uppercase">
              {placing ? "Placing order…" : user ? "Place order" : "Sign In to Place Order"}
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
              : !activeLocation && mode === "delivery"
                ? "Select a delivery address in cart"
                : "Cannot place order"}
          </button>
        )}
      </div>

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
    </div>
  );
}

function SummaryRow({
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
    <div className="flex items-center justify-between">
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
