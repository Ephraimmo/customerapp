import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Bike,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  MapPin,
  MessageCircle,
  Navigation,
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
import { usePointsConfig, useRestaurantPointsOverrides } from "@/lib/firebase-adapters";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Track your order — Hearth" },
      {
        name: "description",
        content: "Follow your order live: kitchen progress, driver assignment and arrival time.",
      },
      { property: "og:title", content: "Track your order — Hearth" },
      {
        property: "og:description",
        content: "Live timeline, driver details and estimated arrival for your delivery.",
      },
    ],
  }),
  component: TrackOrder,
});

const DELIVERY_STAGE_PROGRESSION: Array<{
  status: OrderStatus | "placed";
  label: string;
  detail: string;
}> = [
  { status: "placed", label: "Order placed", detail: "Sent to the kitchen" },
  { status: "pending", label: "Order received", detail: "Waiting for kitchen acceptance" },
  { status: "accepted", label: "Restaurant accepted", detail: "Kitchen confirmed your order" },
  { status: "preparing", label: "Preparing food", detail: "Chef is cooking to order" },
  { status: "ready", label: "Ready for pickup", detail: "Packed, sealed and ready" },
  { status: "assigned", label: "Driver assigned", detail: "Heading to the restaurant" },
  { status: "picked_up", label: "Driver picked up", detail: "Food collected from kitchen" },
  { status: "on_the_way", label: "On the way", detail: "Driver is en route to your address" },
  { status: "delivered", label: "Delivered", detail: "Enjoy your meal!" },
];

const PICKUP_STAGE_PROGRESSION: Array<{
  status: OrderStatus | "placed";
  label: string;
  detail: string;
}> = [
  { status: "placed", label: "Order placed", detail: "Sent to the kitchen" },
  { status: "pending", label: "Order received", detail: "Waiting for kitchen acceptance" },
  { status: "accepted", label: "Restaurant accepted", detail: "Kitchen confirmed your order" },
  { status: "preparing", label: "Preparing food", detail: "Chef is cooking to order" },
  {
    status: "ready",
    label: "Ready for pickup",
    detail: "Packed and ready for collection at the kitchen",
  },
  { status: "picked_up", label: "Collected — enjoy!", detail: "Food collected by customer" },
  { status: "delivered", label: "Collected — enjoy!", detail: "Order closed" },
];

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
  const isCancelled = currentStatus === "cancelled";
  const isRefunded = currentStatus === "refunded";
  const isDelivered = currentStatus === "delivered";
  const isPickup =
    order?.order_type === "pickup" ||
    (!order?.delivery_address && (order?.delivery_fee ?? 0) === 0);

  const stageProgression = isPickup ? PICKUP_STAGE_PROGRESSION : DELIVERY_STAGE_PROGRESSION;

  // Resolve effective payment details (§3.8)
  const paymentMethod = paymentEvidence?.method || order?.payment_method || "card";
  const paymentStatus = paymentEvidence?.status || order?.payment_status || "pending";
  const isPaid = paymentStatus === "paid";
  const isPendingPayment = paymentStatus === "pending";
  const isFailedPayment = paymentStatus === "failed";
  const receiptNumber =
    paymentEvidence?.receipt_number ||
    order?.receipt_number ||
    (order?.order_number ? `R-${order.order_number}` : `R-${orderId}`);

  async function handleRetryCardPayment() {
    setRetryingCard(true);
    try {
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
        gateway: "demo-gateway",
        reference: `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        card_brand: "Visa",
        card_last4: "4242",
      };
      await rtdbSet(`orders/${orderId}/payment`, updatedEvidence);
      await rtdbSet(`orders/${orderId}/payment_status`, "paid");
      toast.success("Card payment successful! Receipt updated.");
    } catch (err) {
      toast.error("Retry failed. Please check your card details.");
    } finally {
      setRetryingCard(false);
    }
  }

  // Determine stage progression index
  const stageIndex = useMemo(() => {
    if (isCancelled || isRefunded) return -1;
    const idx = stageProgression.findIndex((s) => s.status === currentStatus);
    return idx >= 0 ? idx : 1; // default to pending/placed
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

  if (loading && !order) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-16">
        <div className="h-44 animate-pulse rounded-3xl bg-secondary" />
        <div className="mt-6 space-y-4">
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-black tracking-tight">Order not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No live order found with reference <span className="font-mono font-bold">{orderId}</span>.
        </p>
        <Link
          to="/orders"
          className="mt-6 inline-flex h-14 items-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
        >
          View all orders
        </Link>
      </div>
    );
  }

  const progressPercent = Math.min(
    100,
    Math.max(10, ((Math.max(0, stageIndex) + 1) / stageProgression.length) * 100),
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background px-0 sm:max-w-[640px] md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            to="/orders"
            aria-label="Back to orders"
            className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div>
            <h1 className="text-lg leading-none font-black tracking-tight">
              {order.restaurant_name}
            </h1>
            <p className="label-mono mt-1 text-muted-foreground font-mono">
              {order.order_number || order.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Firebase Stream
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black tracking-wider uppercase ${
              isCancelled
                ? "bg-destructive/15 text-destructive"
                : isRefunded
                  ? "bg-amber-500/15 text-amber-600"
                  : isDelivered
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-primary/15 text-primary"
            }`}
          >
            {(order.status || "pending").replace(/_/g, " ")}
          </span>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-6 pb-32">
        {/* Status Alerts if Cancelled or Refunded */}
        {isCancelled ? (
          <div className="flex items-start gap-3 rounded-3xl bg-destructive/10 p-5 ring-1 ring-destructive/30">
            <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-destructive">Order has been cancelled</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This order was cancelled by restaurant or customer support. If charged, funds will
                be refunded.
              </p>
            </div>
          </div>
        ) : isRefunded ? (
          <div className="flex items-start gap-3 rounded-3xl bg-amber-500/10 p-5 ring-1 ring-amber-500/30">
            <RotateCcw className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-700">Order refunded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A refund of {money(order.total)} has been initiated to your original payment method.
              </p>
            </div>
          </div>
        ) : null}

        {/* Live Map or Tracking Area */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-secondary ring-1 ring-border">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:28px_28px]" />

          {!isPickup && driverLocation ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-lg">
                <Navigation className="size-4 animate-pulse" />
                Live GPS: {driverLocation.latitude.toFixed(4)},{" "}
                {driverLocation.longitude.toFixed(4)}
              </div>
              {driverLocation.speed ? (
                <span className="label-mono mt-2 rounded-md bg-background/80 px-2 py-1 text-[10px] backdrop-blur">
                  Speed: {Math.round(driverLocation.speed)} km/h
                </span>
              ) : null}
            </div>
          ) : (
            <>
              <div className="absolute top-1/2 left-6 size-3 -translate-y-1/2 rounded-full bg-foreground" />
              <div className="absolute top-1/2 right-6 size-3 -translate-y-1/2 rounded-full bg-primary" />
              <div className="absolute top-1/2 right-6 left-6 h-0.5 -translate-y-1/2 bg-border" />
              <div
                className="absolute top-1/2 left-6 h-0.5 -translate-y-1/2 bg-primary transition-all duration-1000"
                style={{ width: `calc((100% - 48px) * ${progressPercent / 100})` }}
              />
              <div
                className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-primary text-[10px] font-black text-primary-foreground shadow-xl transition-all duration-1000"
                style={{ left: `calc(24px + (100% - 48px) * ${progressPercent / 100})` }}
              >
                {isPickup ? "KTC" : order.driver_id ? "DRV" : "KTC"}
              </div>
            </>
          )}

          <span className="label-mono absolute bottom-4 left-4 rounded-full bg-background/90 px-3 py-1.5 ring-1 ring-border backdrop-blur max-w-[80%] truncate">
            {isPickup
              ? `Pickup at ${order.restaurant_name}`
              : order.delivery_address
                ? `${order.delivery_address.street}, ${order.delivery_address.city}`
                : "Delivery"}
          </span>
        </div>

        {/* ETA & Status Banner */}
        <div className="rounded-3xl bg-foreground p-6 text-background">
          <span className="label-mono opacity-60">
            {isPickup
              ? currentStatus === "picked_up" || isDelivered
                ? "Collection Status"
                : "Pickup Readiness"
              : isDelivered
                ? "Delivery Status"
                : "Estimated Arrival"}
          </span>
          <p className="mt-1 text-3xl font-black tracking-tight">
            {isCancelled
              ? "Cancelled"
              : isRefunded
                ? "Refunded"
                : isPickup
                  ? currentStatus === "picked_up" || isDelivered
                    ? "Collected — enjoy!"
                    : currentStatus === "ready"
                      ? "Ready for pickup!"
                      : order.eta_minutes
                        ? `Ready in ~${order.eta_minutes} min`
                        : "Preparing to cook…"
                  : isDelivered
                    ? "Delivered"
                    : order.eta_minutes
                      ? `${order.eta_minutes} min`
                      : "Calculating…"}
          </p>
          <p className="mt-2 text-sm opacity-80">
            {stageProgression.find((s) => s.status === currentStatus)?.detail ??
              (isPickup ? "Ready for collection at the kitchen." : "Your order is being handled.")}
          </p>
        </div>

        {/* Status Progression Timeline */}
        <div className="rounded-3xl bg-secondary p-5 ring-1 ring-border">
          <h2 className="label-mono mb-4 text-muted-foreground">
            {isPickup ? "Pickup Order Progress" : "Delivery Order Progress"}
          </h2>
          <ol className="space-y-4">
            {stageProgression.map((stage, idx) => {
              const hasOccurred =
                stageIndex >= idx ||
                timelineStatusSet.has(stage.status) ||
                (stage.status === "placed" && order.placed_at);
              const isCurrent = stage.status === currentStatus;

              return (
                <li key={stage.status} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 size-3 rounded-full transition-colors ${
                        isCurrent
                          ? "bg-primary ring-4 ring-primary/20"
                          : hasOccurred
                            ? "bg-primary"
                            : "bg-border"
                      }`}
                    />
                    {idx < stageProgression.length - 1 ? (
                      <span
                        className={`h-7 w-0.5 transition-colors ${
                          hasOccurred ? "bg-primary/40" : "bg-border"
                        }`}
                      />
                    ) : null}
                  </div>
                  <div className={hasOccurred ? "flex-1" : "flex-1 opacity-40"}>
                    <p className="text-sm font-bold flex items-center justify-between">
                      <span>{stage.label}</span>
                      {hasOccurred && !isCurrent ? (
                        <CheckCircle2 className="size-3.5 text-primary" />
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{stage.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Driver Card or Pickup Instructions */}
        {!isPickup && (order.driver_id || order.driver_name) ? (
          <section className="flex items-center gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
            {order.driver_photo ? (
              <img
                src={order.driver_photo}
                alt={order.driver_name ?? "Driver"}
                className="size-12 rounded-2xl object-cover ring-1 ring-border"
              />
            ) : (
              <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-sm font-black text-primary ring-1 ring-border">
                <Bike className="size-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{order.driver_name || "Assigned Driver"}</p>
              <p className="label-mono mt-0.5 text-xs text-muted-foreground">
                Courier assigned • Fast delivery
              </p>
              {order.driver_rating ? (
                <div className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
                  <Star className="size-3 fill-primary text-primary" />
                  {order.driver_rating.toFixed(1)}
                </div>
              ) : null}
            </div>

            {order.driver_phone ? (
              <a
                href={`tel:${order.driver_phone}`}
                className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md transition-transform active:scale-95"
                aria-label="Call driver"
              >
                <Phone className="size-4" />
              </a>
            ) : null}
          </section>
        ) : !isPickup ? (
          <div className="rounded-2xl bg-secondary/50 p-4 text-center ring-1 ring-border text-xs text-muted-foreground">
            Driver will be assigned once kitchen finishes preparation.
          </div>
        ) : (
          <div className="rounded-2xl bg-secondary/80 p-4 ring-1 ring-border text-xs space-y-1.5">
            <span className="label-mono text-muted-foreground">Collection Details</span>
            <p className="text-sm font-bold text-foreground">{order.restaurant_name}</p>
            <p className="text-muted-foreground">
              Please present your order reference{" "}
              <span className="font-mono font-bold text-foreground">
                {order.order_number || order.id}
              </span>{" "}
              upon collection at the kitchen counter.
            </p>
          </div>
        )}

        {/* Special Instructions & Notes */}
        {order.special_instructions ? (
          <section className="rounded-3xl bg-secondary p-5 ring-1 ring-border">
            <h2 className="label-mono mb-1 text-muted-foreground">Special Instructions / Notes</h2>
            <p className="text-sm font-medium text-foreground bg-background/60 p-3 rounded-2xl ring-1 ring-border/50">
              "{order.special_instructions}"
            </p>
          </section>
        ) : null}

        {/* Live Timeline Audit Trail */}
        {timeline.length > 0 ? (
          <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
            <h2 className="label-mono mb-2 text-muted-foreground">Activity Log</h2>
            <div className="space-y-2">
              {timeline.map((event) => (
                <div
                  key={event.id}
                  className="flex justify-between items-start text-xs border-b border-border/50 pb-2"
                >
                  <div>
                    <span className="font-bold capitalize">{event.note || event.status}</span>
                    {event.actor ? (
                      <span className="ml-1 text-muted-foreground">by {event.actor}</span>
                    ) : null}
                  </div>
                  <span className="font-mono text-muted-foreground shrink-0 ml-2">
                    {new Date(event.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Contact Restaurant / Support */}
        <section className="grid grid-cols-2 gap-2">
          <a
            href="tel:+27825550100"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-secondary text-[11px] font-black tracking-widest uppercase ring-1 ring-border"
          >
            <Phone className="size-4" aria-hidden />
            Call kitchen
          </a>
          <Link
            to="/support"
            search={{ orderId: order.id }}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-black tracking-widest uppercase ring-1 ring-primary/30 cursor-pointer"
          >
            <MessageCircle className="size-4" aria-hidden />
            Live Support
          </Link>
        </section>

        {/* Live Payment & Proof of Payment Status Card (§3.8 & §4) */}
        <section className="rounded-3xl bg-secondary p-5 ring-1 ring-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {paymentMethod === "card" ? (
                <CreditCard className="size-4 text-primary" />
              ) : paymentMethod === "eft" ? (
                <Building2 className="size-4 text-primary" />
              ) : (
                <Banknote className="size-4 text-primary" />
              )}
              <span className="label-mono text-muted-foreground font-bold">
                Payment • {paymentMethod.replace(/_/g, " ").toUpperCase()}
              </span>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ${
                isPaid
                  ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/20"
                  : isFailedPayment
                    ? "bg-destructive/15 text-destructive border border-destructive/20"
                    : "bg-amber-500/15 text-amber-600 border border-amber-500/20"
              }`}
            >
              {isPaid ? "Paid" : isFailedPayment ? "Payment Failed" : "Awaiting Payment"}
            </span>
          </div>

          <div className="rounded-2xl bg-background/80 p-4 border border-border/80 space-y-2 text-xs">
            {isPaid ? (
              <div className="space-y-1">
                <p className="font-bold text-foreground flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {paymentMethod === "cash_on_pickup"
                    ? `Paid at counter — receipt ${receiptNumber}`
                    : paymentMethod === "cash_on_delivery"
                      ? `Paid to courier — receipt ${receiptNumber}`
                      : paymentMethod === "eft"
                        ? `Payment verified — receipt ${receiptNumber}`
                        : `Paid via ${paymentEvidence?.card_brand || "Visa"} •••• ${paymentEvidence?.card_last4 || "4242"} — Ref: ${paymentEvidence?.reference || "SIM-PAID"}`}
                </p>
                {paymentEvidence?.paid_at ? (
                  <p className="text-[11px] text-muted-foreground">
                    Confirmed on{" "}
                    {new Date(paymentEvidence.paid_at).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {paymentEvidence.recorded_by
                      ? ` (recorded by ${paymentEvidence.recorded_by})`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : isFailedPayment ? (
              <div className="space-y-2">
                <p className="font-bold text-destructive flex items-center gap-1.5">
                  <ShieldAlert className="size-4" />
                  Card transaction failed. Please retry your payment.
                </p>
                <button
                  type="button"
                  onClick={handleRetryCardPayment}
                  disabled={retryingCard}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-black uppercase tracking-wider text-primary-foreground shadow cursor-pointer hover:bg-primary/90 disabled:opacity-50"
                >
                  {retryingCard ? "Retrying…" : "Retry Card Payment"}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="font-bold text-foreground">
                  {paymentMethod === "cash_on_pickup"
                    ? `Please pay ${money(order.total)} in cash at the counter when collecting your order.`
                    : paymentMethod === "cash_on_delivery"
                      ? `Please have ${money(order.total)} cash ready for your courier upon arrival.`
                      : paymentMethod === "eft"
                        ? `Verifying your proof of payment (${money(order.total)}). Staff will confirm your transfer in the console.`
                        : `Awaiting payment confirmation (${money(order.total)}).`}
                </p>
                {paymentMethod === "eft" && paymentEvidence?.proof_url ? (
                  <div className="pt-1 flex items-center gap-2">
                    <a
                      href={paymentEvidence.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      View uploaded proof document
                    </a>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-mono text-xs text-muted-foreground">
              Receipt: <strong className="text-foreground">{receiptNumber}</strong>
            </span>

            <button
              type="button"
              onClick={() => setOpenReceiptModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-background px-3 py-2 text-xs font-bold text-primary ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
            >
              <Receipt className="size-3.5" />
              <span>View Official Receipt</span>
            </button>
          </div>
        </section>

        {/* Order Receipt / Items Breakdown */}
        <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="label-mono text-muted-foreground">Order Breakdown</h2>
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {receiptNumber}
            </span>
          </div>
          {lines.length > 0 ? (
            lines.map((l) => (
              <div key={l.id} className="flex justify-between text-sm py-1">
                <div>
                  <span className="font-bold text-foreground">
                    {l.quantity}× {l.name}
                  </span>
                  {l.variant ? (
                    <span className="block text-xs text-muted-foreground">
                      Size: {l.variant.name}
                    </span>
                  ) : null}
                  {l.addons && l.addons.length > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      Extras: {l.addons.map((a) => a.name).join(", ")}
                    </span>
                  ) : null}
                  {l.notes ? (
                    <span className="block text-xs italic text-muted-foreground">"{l.notes}"</span>
                  ) : null}
                </div>
                <span className="font-mono font-bold">{money(l.line_total)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Item details loaded from database.</p>
          )}

          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono font-bold text-foreground">{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery fee</span>
              <span className="font-mono font-bold text-foreground">
                {order.delivery_fee === 0 ? "Free" : money(order.delivery_fee)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Service fee</span>
              <span className="font-mono font-bold text-foreground">
                {money(order.service_fee)}
              </span>
            </div>
            {order.tip ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Driver tip</span>
                <span className="font-mono font-bold text-foreground">{money(order.tip)}</span>
              </div>
            ) : null}
            {order.discount ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="font-mono font-bold text-foreground">
                  -{money(order.discount)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-black tracking-widest uppercase">
              Total ({order.payment_method})
            </span>
            <span className="font-mono text-lg font-black">{money(order.total)}</span>
          </div>
        </section>

        {order.restaurant_id ? (
          <button
            type="button"
            onClick={() =>
              void navigate({ to: "/restaurant/$slug", params: { slug: order.restaurant_id } })
            }
            className="h-14 w-full rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase cursor-pointer"
          >
            Order this again
          </button>
        ) : null}
      </main>

      {/* Official Proof of Payment Receipt Modal (§3.8) */}
      {openReceiptModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-[var(--animate-sheet-up)]">
          <div className="relative w-full max-w-lg rounded-3xl bg-card p-6 border border-border shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText className="size-5 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-primary">
                    Official Payment Receipt
                  </span>
                </div>
                <h3 className="text-xl font-mono font-black text-foreground mt-1">
                  {receiptNumber}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Order #{order.order_number || order.id} • Placed{" "}
                  {new Date(order.placed_at).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpenReceiptModal(false)}
                aria-label="Close receipt"
                className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Restaurant & Customer Info */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-secondary/50 p-3.5 rounded-2xl border border-border/60">
              <div>
                <span className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                  Merchant & Branch
                </span>
                <p className="font-bold text-foreground mt-0.5">
                  {order.branch_name || order.restaurant_name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {order.branch_address || order.branch_city || "South Africa"}
                  {order.delivery_distance_km != null
                    ? ` (${order.delivery_distance_km.toFixed(1)} km delivery)`
                    : ""}
                </p>
              </div>
              <div>
                <span className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                  Customer
                </span>
                <p className="font-bold text-foreground mt-0.5">
                  {order.customer_name || "Guest Customer"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {order.customer_phone || order.customer_email || "Customer App"}
                </p>
              </div>
            </div>

            {/* Payment Evidence Details (§3.8) */}
            <div className="rounded-2xl bg-secondary/80 p-4 border border-border/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground font-bold">Payment Details</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    isPaid
                      ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/20"
                      : isFailedPayment
                        ? "bg-destructive/15 text-destructive border border-destructive/20"
                        : "bg-amber-500/15 text-amber-600 border border-amber-500/20"
                  }`}
                >
                  {isPaid ? "PAID" : isFailedPayment ? "FAILED" : "AWAITING PAYMENT"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Method:</span>
                  <span className="font-bold text-foreground">
                    {paymentMethod.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Amount (ZAR):</span>
                  <span className="font-bold text-primary">{money(order.total)}</span>
                </div>
                {paymentEvidence?.paid_at ? (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px]">Paid At:</span>
                    <span className="font-bold text-foreground">
                      {new Date(paymentEvidence.paid_at).toLocaleString()}
                    </span>
                  </div>
                ) : null}
                {paymentEvidence?.reference ? (
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Gateway Ref:</span>
                    <span className="font-bold text-foreground">{paymentEvidence.reference}</span>
                  </div>
                ) : null}
                {paymentEvidence?.card_last4 ? (
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Card:</span>
                    <span className="font-bold text-foreground">
                      {paymentEvidence.card_brand || "Visa"} ending in {paymentEvidence.card_last4}
                    </span>
                  </div>
                ) : null}
                {paymentEvidence?.recorded_by ? (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px]">Recorded By:</span>
                    <span className="font-bold text-foreground">
                      {paymentEvidence.recorded_by === "customer_app"
                        ? "Customer Checkout App"
                        : paymentEvidence.recorded_by}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <span className="label-mono text-muted-foreground font-bold text-xs">
                Items Purchased
              </span>
              <div className="divide-y divide-border/60 text-xs">
                {lines.map((l) => (
                  <div key={l.id} className="py-2 flex justify-between items-start">
                    <div>
                      <p className="font-bold text-foreground">
                        {l.quantity}× {l.name}
                      </p>
                      {l.variant ? (
                        <p className="text-[11px] text-muted-foreground">Size: {l.variant.name}</p>
                      ) : null}
                      {l.addons && l.addons.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Extras: {l.addons.map((a) => a.name).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="font-mono font-bold text-foreground">
                      {money(l.line_total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="rounded-2xl bg-secondary/60 p-4 border border-border/80 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono font-bold text-foreground">{money(order.subtotal)}</span>
              </div>
              {order.discount ? (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discounts & Savings</span>
                  <span className="font-mono font-bold">-{money(order.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery Fee</span>
                <span className="font-mono font-bold text-foreground">
                  {order.delivery_fee === 0 ? "Free" : money(order.delivery_fee)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Service Fee (5%)</span>
                <span className="font-mono font-bold text-foreground">
                  {money(order.service_fee)}
                </span>
              </div>
              {order.tip ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Courier Tip</span>
                  <span className="font-mono font-bold text-foreground">{money(order.tip)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-center border-t border-border pt-2 text-sm">
                <span className="font-black uppercase tracking-wider text-foreground">
                  Total Paid
                </span>
                <span className="font-mono font-black text-lg text-primary">
                  {money(order.total)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(receiptNumber);
                  toast.success(`Copied receipt number: ${receiptNumber}`);
                }}
                className="flex-1 h-11 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs flex items-center justify-center gap-1.5 ring-1 ring-border cursor-pointer transition-colors"
              >
                <Receipt className="size-3.5 text-primary" />
                Copy Receipt #
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 shadow-md hover:bg-primary/90 cursor-pointer transition-colors"
              >
                <Printer className="size-3.5" />
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
