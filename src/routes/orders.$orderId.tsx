import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  ArrowLeft,
  Banknote,
  Bike,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DeliveryMap, deliveryAddressCoordinates } from "@/components/app/delivery-map";
import {
  ActionBar,
  ActionBarTotal,
  Callout,
  CheckoutProgress,
  PageShell,
  Panel,
  SectionLabel,
  SummaryRow,
} from "@/components/app/checkout-ui";
import {
  OrderPhaseIcon,
  OrderProgressRail,
  OrderStatusPill,
  isPickupOrder,
  orderPhase,
  orderStages,
  stageIndexFor,
} from "@/components/app/order-ui";
import {
  money,
  type DriverLiveLocation,
  type FirebaseOrder,
  type OrderLine,
  type OrderPaymentEvidence,
  type OrderStatus,
  type TimelineEvent,
} from "@/lib/data";
import { rtdbSet, rtdbSubscribe } from "@/lib/firebase";
import {
  usePointsConfig,
  useRestaurantPaymentConfig,
  useRestaurantPointsOverrides,
} from "@/lib/firebase-adapters";
import { StripeCardFields, type CardConfirm } from "@/components/app/stripe-card-fields";
import { calculateOrderEarnedPoints, findRestaurantPointsOverride } from "@/lib/promotions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Track your order — Kasi Zonke Link" },
      {
        name: "description",
        content: "Follow your order live: kitchen progress, driver assignment and arrival time.",
      },
      { property: "og:title", content: "Track your order — Kasi Zonke Link" },
      {
        property: "og:description",
        content: "Live timeline, driver details and estimated arrival for your delivery.",
      },
    ],
  }),
  component: TrackOrder,
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatClock(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TrackOrder() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();

  const pointsConfig = usePointsConfig();
  const pointsOverrides = useRestaurantPointsOverrides();

  const [order, setOrder] = useState<FirebaseOrder | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [driverLocation, setDriverLocation] = useState<DriverLiveLocation | null>(null);
  const [paymentEvidence, setPaymentEvidence] = useState<OrderPaymentEvidence | null>(null);
  const [openReceiptModal, setOpenReceiptModal] = useState(false);
  const [retryingCard, setRetryingCard] = useState(false);
  const retryConfirmRef = useRef<CardConfirm | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Subscribe to live order updates from Firebase Realtime Database
  useEffect(() => {
    setLoading(true);

    const unsubOrder = rtdbSubscribe<FirebaseOrder>(`orders/${orderId}`, (o) => {
      setOrder(o);
      if (o?.payment) {
        setPaymentEvidence(o.payment);
      }
      setLoading(false);
    });

    const unsubPayment = rtdbSubscribe<OrderPaymentEvidence>(`orders/${orderId}/payment`, (p) => {
      if (p) {
        setPaymentEvidence(p);
      }
    });

    const unsubLines = rtdbSubscribe<Record<string, OrderLine>>(
      `orders/${orderId}/items`,
      (itemsMap) => {
        if (!itemsMap) {
          setLines([]);
          return;
        }
        setLines(Object.values(itemsMap));
      },
    );

    const unsubTimeline = rtdbSubscribe<Record<string, TimelineEvent>>(
      `orders/${orderId}/timeline`,
      (tlMap) => {
        if (!tlMap) {
          setTimeline([]);
          return;
        }
        const sorted = Object.values(tlMap).sort((a, b) => (a.at || "").localeCompare(b.at || ""));
        setTimeline(sorted);
      },
    );

    const unsubDriver = rtdbSubscribe<DriverLiveLocation>(`drivers/live/${orderId}`, (loc) => {
      setDriverLocation(loc);
    });

    return () => {
      unsubOrder();
      unsubPayment();
      unsubLines();
      unsubTimeline();
      unsubDriver();
    };
  }, [orderId]);

  const currentStatus = (order?.status ?? "pending").toLowerCase() as OrderStatus;
  const phase = orderPhase(currentStatus);
  const isCancelled = phase === "cancelled";
  const isRefunded = phase === "refunded";
  const isDelivered = phase === "delivered";
  const isPickup = isPickupOrder(order);

  const stageProgression = orderStages(isPickup);
  const customerCoordinates = deliveryAddressCoordinates(order?.delivery_address);
  const driverLastUpdated = driverLocation?.updated_at
    ? Math.max(0, Math.round((Date.now() - new Date(driverLocation.updated_at).getTime()) / 1000))
    : null;
  const driverIsStale = driverLastUpdated === null || driverLastUpdated > 30;

  // Resolve effective payment details (§3.8)
  const paymentMethod = paymentEvidence?.method || order?.payment_method || "card";
  const paymentStatus = paymentEvidence?.status || order?.payment_status || "pending";
  const isPaid = paymentStatus === "paid";
  const isFailedPayment = paymentStatus === "failed";
  const receiptNumber =
    paymentEvidence?.receipt_number ||
    order?.receipt_number ||
    (order?.order_number ? `R-${order.order_number}` : `R-${orderId}`);

  /*
   * Retrying a failed card payment goes through the same restaurant's own Stripe
   * account as checkout does. No key configured means no retry offered, rather
   * than a button that cannot actually take money.
   */
  const { paymentConfig: retryPaymentConfig } = useRestaurantPaymentConfig(
    isFailedPayment ? (order?.restaurant_id ?? null) : null,
  );
  const retryPublishableKey =
    retryPaymentConfig?.methods?.card?.stripePublishableKey?.trim() || null;
  const retryStripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (retryPublishableKey ? loadStripe(retryPublishableKey) : null),
    [retryPublishableKey],
  );
  const retryElementsOptions = useMemo<StripeElementsOptions>(
    () => ({
      mode: "payment",
      amount: Math.max(1, Math.round((order?.total || 0) * 100)),
      currency: "zar",
      paymentMethodTypes: ["card"],
    }),
    [order?.total],
  );

  async function handleRetryCardPayment() {
    const confirmCard = retryConfirmRef.current;
    if (!confirmCard || !order?.restaurant_id) {
      toast.error("The card form is still loading — give it a second and try again.");
      return;
    }

    setRetryingCard(true);
    try {
      // Actually charges the card. This used to write a paid receipt without any
      // money moving, which let a failed order be marked paid from the browser.
      const result = await confirmCard();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const now = new Date().toISOString();
      const updatedEvidence: OrderPaymentEvidence = {
        order_id: orderId,
        receipt_number: receiptNumber,
        method: "card",
        amount: order?.total || 0,
        currency: "ZAR",
        status: "paid",
        recorded_by: "customer_app",
        updated_at: now,
        paid_at: now,
        gateway: "stripe",
        reference: result.paymentIntentId,
        card_brand: result.cardBrand,
        card_last4: result.cardLast4,
      };
      await rtdbSet(`orders/${orderId}/payment`, updatedEvidence);
      await rtdbSet(`orders/${orderId}/payment_status`, "paid");
      toast.success("Payment received. Your receipt is updated.");
    } catch {
      toast.error("That payment could not be completed. Please try again.");
    } finally {
      setRetryingCard(false);
    }
  }

  // Determine stage progression index
  const stageIndex = useMemo(() => {
    if (isCancelled || isRefunded) return -1;
    return stageIndexFor(currentStatus, stageProgression);
  }, [currentStatus, isCancelled, isRefunded, stageProgression]);

  // Set of statuses recorded in the timeline
  const timelineStatusSet = useMemo(() => {
    const set = new Set<string>();
    timeline.forEach((t) => {
      if (t.status) set.add(t.status.toLowerCase());
    });
    if (currentStatus) set.add(currentStatus);
    return set;
  }, [timeline, currentStatus]);

  // First recorded time per status, so each completed step can show when it happened
  const stageTimes = useMemo(() => {
    const times = new Map<string, string>();
    if (order?.placed_at) times.set("placed", order.placed_at);
    timeline.forEach((event) => {
      const status = (event.status || "").toLowerCase();
      if (status && event.at && !times.has(status)) times.set(status, event.at);
    });
    return times;
  }, [timeline, order?.placed_at]);

  const earnedPoints = useMemo(() => {
    if (!order || !isDelivered) return 0;
    const override = findRestaurantPointsOverride(pointsOverrides, order.restaurant_id);
    return calculateOrderEarnedPoints(pointsConfig, override, {
      order_type: isPickup ? "pickup" : "delivery",
      items: lines,
    });
  }, [order, isDelivered, isPickup, lines, pointsConfig, pointsOverrides]);

  if (loading && !order) {
    return (
      <PageShell>
        <div className="space-y-4 px-4 py-16">
          <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-44 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
        </div>
      </PageShell>
    );
  }

  if (!order) {
    return (
      <PageShell>
        <main className="px-4 py-20 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-secondary">
            <ReceiptText className="size-7 text-muted-foreground" aria-hidden />
          </div>
          <h1 className="mt-5 text-xl font-black tracking-tight">Order not found</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            No live order matches reference{" "}
            <span className="font-mono font-bold text-foreground">{orderId}</span>.
          </p>
          <Link
            to="/orders"
            className="mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-7 text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
          >
            View all orders
          </Link>
        </main>
      </PageShell>
    );
  }

  const currentStage = stageProgression[Math.max(0, stageIndex)];

  const heroEyebrow = isCancelled
    ? "Order status"
    : isRefunded
      ? "Order status"
      : isPickup
        ? currentStatus === "picked_up" || isDelivered
          ? "Collection status"
          : "Pickup readiness"
        : isDelivered
          ? "Delivery status"
          : "Estimated arrival";

  const heroValue = isCancelled
    ? "Cancelled"
    : isRefunded
      ? "Refunded"
      : isPickup
        ? currentStatus === "picked_up" || isDelivered
          ? "Collected"
          : currentStatus === "ready"
            ? "Ready for pickup"
            : order.eta_minutes
              ? `Ready in ~${order.eta_minutes} min`
              : "Preparing…"
        : isDelivered
          ? "Delivered"
          : order.eta_minutes
            ? `${order.eta_minutes} min`
            : "Calculating…";

  const arrivalClock = formatClock(order.eta_at);
  const heroHint = isCancelled
    ? formatDateTime(order.cancelled_at)
      ? `Cancelled ${formatDateTime(order.cancelled_at)}`
      : null
    : isDelivered
      ? formatDateTime(order.delivered_at)
        ? `${isPickup ? "Collected" : "Delivered"} ${formatDateTime(order.delivered_at)}`
        : null
      : arrivalClock
        ? `${isPickup ? "Ready by" : "Arriving by"} ${arrivalClock}`
        : null;

  const printHidden = openReceiptModal ? "true" : undefined;

  return (
    <PageShell>
      <header
        data-print-hidden={printHidden}
        className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md md:static"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/orders"
              aria-label="Back to orders"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary transition-colors hover:bg-secondary/70"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg leading-none font-black tracking-tight">
                {order.restaurant_name}
              </h1>
              <p className="label-mono mt-1.5 truncate text-muted-foreground">
                {order.order_number || order.id}
              </p>
            </div>
          </div>

          <OrderStatusPill status={order.status} isPickup={isPickup} />
        </div>

        <CheckoutProgress current="track" className="mt-4" />
      </header>

      <main data-print-hidden={printHidden} className="space-y-5 px-4 pt-5 pb-44">
        {isCancelled ? (
          <Callout
            tone="danger"
            icon={<ShieldAlert className="size-4" aria-hidden />}
            title="This order was cancelled"
          >
            Cancelled by the restaurant or support. Anything already charged is refunded to your
            original payment method.
          </Callout>
        ) : isRefunded ? (
          <Callout
            tone="warning"
            icon={<RotateCcw className="size-4" aria-hidden />}
            title={`Refund of ${money(order.total)} started`}
          >
            It returns to your original payment method, usually within 3–5 working days.
          </Callout>
        ) : null}

        {/* Headline status */}
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label-mono text-muted-foreground">{heroEyebrow}</p>
              <p className="mt-2 truncate text-3xl leading-none font-black tracking-tight">
                {heroValue}
              </p>
              {heroHint ? (
                <p className="mt-2 truncate text-xs text-muted-foreground">{heroHint}</p>
              ) : null}
            </div>
            <OrderPhaseIcon phase={phase} isPickup={isPickup} className="size-12 rounded-2xl" />
          </div>

          <OrderProgressRail
            stages={stageProgression}
            index={stageIndex}
            phase={phase}
            className="mt-5"
          />

          <p className="mt-3 text-xs text-muted-foreground">
            {isCancelled || isRefunded
              ? "No further updates will arrive for this order."
              : (currentStage?.detail ??
                (isPickup
                  ? "Ready for collection at the kitchen."
                  : "Your order is being handled."))}
          </p>
        </Panel>

        {/* Live map */}
        {!isPickup ? (
          <section>
            <SectionLabel>Live location</SectionLabel>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-secondary shadow-sm">
              {customerCoordinates || driverLocation ? (
                <DeliveryMap
                  customerLocation={customerCoordinates}
                  driverLocation={driverLocation}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <MapPin className="size-6 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-bold">Delivery location pending</p>
                  <p className="text-xs text-muted-foreground">
                    The map appears as soon as coordinates come through.
                  </p>
                </div>
              )}

              {order.driver_id ? (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      driverIsStale ? "bg-muted-foreground" : "animate-pulse bg-emerald-500",
                    )}
                  />
                  {driverIsStale
                    ? "Location temporarily unavailable"
                    : driverLastUpdated === 0
                      ? "Live"
                      : `Updated ${driverLastUpdated}s ago`}
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Courier or collection details */}
        <section>
          <SectionLabel>{isPickup ? "Collection" : "Courier"}</SectionLabel>

          {!isPickup && (order.driver_id || order.driver_name) ? (
            <Panel className="flex items-center gap-3 p-4">
              {order.driver_photo ? (
                <img
                  src={order.driver_photo}
                  alt=""
                  className="size-11 shrink-0 rounded-xl border border-border object-cover"
                />
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <Bike className="size-[18px]" aria-hidden />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {order.driver_name || "Assigned courier"}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>On your delivery</span>
                  {order.driver_rating ? (
                    <span className="flex items-center gap-0.5 font-bold text-foreground">
                      <Star className="size-3 fill-primary text-primary" aria-hidden />
                      {order.driver_rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </div>

              {order.driver_phone ? (
                <a
                  href={`tel:${order.driver_phone}`}
                  aria-label={`Call ${order.driver_name || "your courier"}`}
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Phone className="size-4" aria-hidden />
                </a>
              ) : null}
            </Panel>
          ) : !isPickup ? (
            <Panel className="p-4">
              <p className="text-sm font-bold">No courier assigned yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                One is assigned as soon as the kitchen finishes your food.
              </p>
            </Panel>
          ) : (
            <Panel className="p-4">
              <p className="text-sm font-bold">{order.restaurant_name}</p>
              {order.branch_address ? (
                <p className="mt-1 text-xs text-muted-foreground">{order.branch_address}</p>
              ) : null}
              <p className="mt-3 rounded-lg border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
                Show reference{" "}
                <span className="font-mono font-bold text-foreground">
                  {order.order_number || order.id}
                </span>{" "}
                at the counter to collect.
              </p>
            </Panel>
          )}
        </section>

        {/* Stage by stage */}
        <section>
          <SectionLabel>Progress</SectionLabel>
          <Panel>
            <button
              type="button"
              onClick={() => setStepsOpen((open) => !open)}
              aria-expanded={stepsOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {isCancelled || isRefunded
                    ? "Order stopped"
                    : (currentStage?.label ?? "Tracking")}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {isCancelled || isRefunded
                    ? "See the full history below"
                    : `Step ${Math.max(0, stageIndex) + 1} of ${stageProgression.length}`}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  stepsOpen && "rotate-180",
                )}
              />
            </button>

            {stepsOpen ? (
              <ol className="border-t border-border p-4">
                {stageProgression.map((stage, idx) => {
                  const hasOccurred =
                    stageIndex >= idx ||
                    timelineStatusSet.has(stage.status) ||
                    (stage.status === "placed" && Boolean(order.placed_at));
                  const isCurrent = stage.status === currentStatus && !isCancelled && !isRefunded;
                  const at = formatClock(stageTimes.get(stage.status));
                  const isLast = idx === stageProgression.length - 1;

                  return (
                    <li key={`${stage.status}-${idx}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-2.5 shrink-0 rounded-full transition-colors",
                            isCurrent
                              ? "bg-primary ring-4 ring-primary/20"
                              : hasOccurred
                                ? "bg-primary"
                                : "bg-border",
                          )}
                        />
                        {!isLast ? (
                          <span
                            className={cn(
                              "w-px flex-1 transition-colors",
                              hasOccurred ? "bg-primary/40" : "bg-border",
                            )}
                          />
                        ) : null}
                      </div>

                      <div
                        className={cn(
                          "flex-1 pb-4",
                          !hasOccurred && "opacity-45",
                          isLast && "pb-0",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-sm",
                              isCurrent ? "font-black" : "font-bold",
                            )}
                          >
                            {stage.label}
                          </p>
                          {at ? (
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                              {at}
                            </span>
                          ) : hasOccurred && !isCurrent ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{stage.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </Panel>
        </section>

        {/* Notes left at checkout */}
        {order.special_instructions ? (
          <section>
            <SectionLabel>Your note to the kitchen</SectionLabel>
            <Panel className="p-4">
              <p className="text-sm leading-relaxed text-muted-foreground italic">
                “{order.special_instructions}”
              </p>
            </Panel>
          </section>
        ) : null}

        {/* Items and money */}
        <section>
          <SectionLabel
            action={
              <span className="font-mono text-[10px] text-muted-foreground">{receiptNumber}</span>
            }
          >
            Order summary
          </SectionLabel>

          <Panel className="p-4">
            {lines.length > 0 ? (
              <ul className="divide-y divide-border">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold">
                        <span className="font-mono text-muted-foreground">{line.quantity}×</span>{" "}
                        {line.name}
                      </p>
                      {line.variant ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {line.variant.name}
                        </p>
                      ) : null}
                      {line.addons && line.addons.length > 0 ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {line.addons.map((addon) => addon.name).join(", ")}
                        </p>
                      ) : null}
                      {line.notes ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground italic">
                          “{line.notes}”
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                      {money(line.line_total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Loading your items…</p>
            )}

            <dl className="mt-3 space-y-2 border-t border-border pt-3">
              <SummaryRow label="Subtotal" value={money(order.subtotal)} />
              {order.discount ? (
                <SummaryRow
                  label="Discount"
                  value={`-${money(order.discount)}`}
                  hint={order.coupon_code ?? undefined}
                  positive
                />
              ) : null}
              {!isPickup ? (
                <SummaryRow
                  label="Delivery fee"
                  value={order.delivery_fee === 0 ? "Free" : money(order.delivery_fee)}
                  positive={order.delivery_fee === 0}
                />
              ) : null}
              <SummaryRow label="Service fee" value={money(order.service_fee)} />
              {order.tax ? <SummaryRow label="Tax" value={money(order.tax)} /> : null}
              {order.tip ? <SummaryRow label="Courier tip" value={money(order.tip)} /> : null}
            </dl>

            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs font-black tracking-wider uppercase">
                {isPaid ? "Total paid" : "Total due"}
              </span>
              <span className="font-mono text-lg leading-none font-black tabular-nums">
                {money(order.total)}
              </span>
            </div>
          </Panel>
        </section>

        {earnedPoints > 0 ? (
          <Callout
            tone="success"
            icon={<Sparkles className="size-4" aria-hidden />}
            title={`${earnedPoints} points earned`}
          >
            Added to your loyalty balance for this order — spend them at checkout next time.
          </Callout>
        ) : null}

        {/* Payment */}
        <section>
          <SectionLabel>Payment</SectionLabel>
          <Panel className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {paymentMethod === "card" ? (
                    <CreditCard className="size-4" aria-hidden />
                  ) : paymentMethod === "eft" ? (
                    <Building2 className="size-4" aria-hidden />
                  ) : (
                    <Banknote className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {paymentMethod.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                  <p className="label-mono mt-0.5 truncate text-muted-foreground">
                    {receiptNumber}
                  </p>
                </div>
              </div>

              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wider uppercase",
                  isPaid
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : isFailedPayment
                      ? "border-destructive/25 bg-destructive/10 text-destructive"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {isPaid ? "Paid" : isFailedPayment ? "Failed" : "Awaiting"}
              </span>
            </div>

            <div className="mt-3 border-t border-border pt-3">
              {isPaid ? (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {paymentMethod === "cash_on_pickup"
                      ? "Paid in cash at the counter."
                      : paymentMethod === "cash_on_delivery"
                        ? "Paid in cash to your courier."
                        : paymentMethod === "eft"
                          ? "Bank transfer verified by the restaurant."
                          : paymentEvidence?.card_last4
                            ? `Paid with ${paymentEvidence.card_brand ?? "card"} •••• ${paymentEvidence.card_last4}.`
                            : "Card payment received."}
                  </p>
                  {formatDateTime(paymentEvidence?.paid_at) ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Confirmed {formatDateTime(paymentEvidence?.paid_at)}
                    </p>
                  ) : null}
                </>
              ) : isFailedPayment ? (
                <div>
                  <p className="text-xs leading-relaxed text-destructive">
                    That card transaction did not go through. Retry to keep your order moving.
                  </p>

                  {retryStripePromise && order.restaurant_id ? (
                    <>
                      <div className="mt-3">
                        <Elements stripe={retryStripePromise} options={retryElementsOptions}>
                          <StripeCardFields
                            confirmRef={retryConfirmRef}
                            restaurantId={order.restaurant_id}
                            amount={order.total}
                          />
                        </Elements>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryCardPayment}
                        disabled={retryingCard}
                        className="mt-3 inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-xs font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {retryingCard ? "Paying…" : `Pay ${money(order.total)}`}
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Card payments are not available for this restaurant right now — please contact
                      support to settle this order.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {paymentMethod === "cash_on_pickup"
                      ? `Have ${money(order.total)} ready at the counter when you collect.`
                      : paymentMethod === "cash_on_delivery"
                        ? `Have ${money(order.total)} in cash ready for your courier.`
                        : paymentMethod === "eft"
                          ? `We are verifying your ${money(order.total)} transfer. The restaurant confirms it from their console.`
                          : `Waiting on confirmation of ${money(order.total)}.`}
                  </p>
                  {paymentMethod === "eft" && paymentEvidence?.proof_url ? (
                    <a
                      href={paymentEvidence.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      View the proof you uploaded
                    </a>
                  ) : null}
                </>
              )}
            </div>
          </Panel>
        </section>

        {/* Audit trail */}
        {timeline.length > 0 ? (
          <section>
            <SectionLabel>Activity</SectionLabel>
            <Panel>
              <button
                type="button"
                onClick={() => setLogOpen((open) => !open)}
                aria-expanded={logOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
              >
                <span className="text-sm font-bold">
                  {timeline.length} {timeline.length === 1 ? "update" : "updates"}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    logOpen && "rotate-180",
                  )}
                />
              </button>

              {logOpen ? (
                <ul className="divide-y divide-border border-t border-border">
                  {timeline.map((event) => (
                    <li
                      key={event.id}
                      className="flex items-start justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold capitalize">
                          {event.note || (event.status || "").replace(/_/g, " ")}
                        </p>
                        {event.actor ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {event.actor}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {formatClock(event.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          </section>
        ) : null}

        {/* Help */}
        <section>
          <SectionLabel>Need a hand?</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="tel:+27825550100"
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-xs font-bold shadow-sm transition-colors hover:bg-secondary/50"
            >
              <Phone className="size-4 text-primary" aria-hidden />
              Call kitchen
            </a>
            <Link
              to="/support"
              search={{ orderId: order.id }}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
            >
              <MessageCircle className="size-4" aria-hidden />
              Live support
            </Link>
          </div>
        </section>
      </main>

      <div data-print-hidden={printHidden}>
        <ActionBar>
          <ActionBarTotal
            hint={`${isPaid ? "Paid" : "Total"} · ${order.order_number || order.id}`}
            value={money(order.total)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpenReceiptModal(true)}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-xs font-bold transition-colors hover:bg-secondary/70"
            >
              <Receipt className="size-4 text-primary" aria-hidden />
              Receipt
            </button>

            {order.restaurant_id ? (
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: "/restaurant/$slug", params: { slug: order.restaurant_id } })
                }
                className="flex h-12 flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
              >
                <RotateCcw className="size-4" aria-hidden />
                Order again
              </button>
            ) : null}
          </div>
        </ActionBar>
      </div>

      {openReceiptModal ? (
        <ReceiptDialog
          onClose={() => setOpenReceiptModal(false)}
          order={order}
          lines={lines}
          paymentEvidence={paymentEvidence}
          paymentMethod={paymentMethod}
          receiptNumber={receiptNumber}
          isPaid={isPaid}
          isFailedPayment={isFailedPayment}
          isPickup={isPickup}
        />
      ) : null}
    </PageShell>
  );
}

/** Printable proof of payment (§3.8). Escape and backdrop close it. */
function ReceiptDialog({
  onClose,
  order,
  lines,
  paymentEvidence,
  paymentMethod,
  receiptNumber,
  isPaid,
  isFailedPayment,
  isPickup,
}: {
  onClose: () => void;
  order: FirebaseOrder;
  lines: OrderLine[];
  paymentEvidence: OrderPaymentEvidence | null;
  paymentMethod: string;
  receiptNumber: string;
  isPaid: boolean;
  isFailedPayment: boolean;
  isPickup: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const facts = [
    { label: "Method", value: paymentMethod.replace(/_/g, " ").toUpperCase() },
    { label: "Amount", value: money(order.total) },
    { label: "Paid at", value: formatDateTime(paymentEvidence?.paid_at) },
    { label: "Reference", value: paymentEvidence?.reference ?? null },
    {
      label: "Card",
      value: paymentEvidence?.card_last4
        ? `${paymentEvidence.card_brand || "Visa"} •••• ${paymentEvidence.card_last4}`
        : null,
    },
    {
      label: "Recorded by",
      value:
        paymentEvidence?.recorded_by === "customer_app"
          ? "Customer checkout"
          : (paymentEvidence?.recorded_by ?? null),
    },
  ].filter((fact) => Boolean(fact.value));

  return (
    <div
      data-print-root
      onClick={onClose}
      className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        data-print-surface
        onClick={(event) => event.stopPropagation()}
        className="animate-[var(--animate-pop-in)] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <p className="label-mono flex items-center gap-1.5 text-primary">
              <ReceiptText className="size-3.5" aria-hidden />
              Payment receipt
            </p>
            <h2 id="receipt-title" className="mt-2 truncate font-mono text-xl font-black">
              {receiptNumber}
            </h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              Order {order.order_number || order.id}
              {formatDateTime(order.placed_at) ? ` · ${formatDateTime(order.placed_at)}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            data-print-hidden="true"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/50 p-3.5">
            <div className="min-w-0">
              <p className="label-mono text-muted-foreground">Merchant</p>
              <p className="mt-1 truncate text-xs font-bold">
                {order.branch_name || order.restaurant_name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {order.branch_address || order.branch_city || "South Africa"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="label-mono text-muted-foreground">Customer</p>
              <p className="mt-1 truncate text-xs font-bold">
                {order.customer_name || "Guest customer"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {order.customer_phone || order.customer_email || "Customer app"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="label-mono text-muted-foreground">Payment details</p>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wider uppercase",
                  isPaid
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : isFailedPayment
                      ? "border-destructive/25 bg-destructive/10 text-destructive"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {isPaid ? "Paid" : isFailedPayment ? "Failed" : "Awaiting"}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="label-mono text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-1 truncate font-mono text-[11px] font-bold">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="label-mono mb-2 text-muted-foreground">Items</p>
            <ul className="divide-y divide-border">
              {lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold">
                      <span className="font-mono text-muted-foreground">{line.quantity}×</span>{" "}
                      {line.name}
                    </p>
                    {line.variant ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {line.variant.name}
                      </p>
                    ) : null}
                    {line.addons && line.addons.length > 0 ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {line.addons.map((addon) => addon.name).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
                    {money(line.line_total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="space-y-2 rounded-xl border border-border bg-secondary/50 p-3.5">
            <SummaryRow label="Subtotal" value={money(order.subtotal)} />
            {order.discount ? (
              <SummaryRow label="Discount" value={`-${money(order.discount)}`} positive />
            ) : null}
            {!isPickup ? (
              <SummaryRow
                label="Delivery fee"
                value={order.delivery_fee === 0 ? "Free" : money(order.delivery_fee)}
              />
            ) : null}
            <SummaryRow label="Service fee" value={money(order.service_fee)} />
            {order.tax ? <SummaryRow label="Tax" value={money(order.tax)} /> : null}
            {order.tip ? <SummaryRow label="Courier tip" value={money(order.tip)} /> : null}

            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
              <span className="text-xs font-black tracking-wider uppercase">
                {isPaid ? "Total paid" : "Total due"}
              </span>
              <span className="font-mono text-base leading-none font-black tabular-nums">
                {money(order.total)}
              </span>
            </div>
          </dl>
        </div>

        <footer data-print-hidden="true" className="flex gap-2 border-t border-border p-5 pt-4">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(receiptNumber)
                .then(() => toast.success(`Copied ${receiptNumber}`))
                .catch(() => toast.error("Could not copy — please copy it manually."));
            }}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-xs font-bold transition-colors hover:bg-secondary/70"
          >
            <Receipt className="size-4 text-primary" aria-hidden />
            Copy number
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90"
          >
            <Printer className="size-4" aria-hidden />
            Print
          </button>
        </footer>
      </div>
    </div>
  );
}
